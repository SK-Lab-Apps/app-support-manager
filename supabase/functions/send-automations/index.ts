// POST /functions/v1/send-automations
// Sends the automated messages that are due. Called every minute by the
// `send-automations` pg_cron job, and only when one is (see the automations
// migration). revenuecat-webhook schedules the subscription ones; the
// `schedule-review-requests` job queues review_eligible runs, which go out
// as review requests (send_automation_run decides, and skips a user no
// longer eligible or already asked).
//
// Each goes out like a message from the Users tab: a new conversation in the
// user's support chat with the automation's text, {first_name}, {name} and
// {app} filled in, translated into their language, under the name of the
// admin who last wrote it — out of the inbox until they reply, and listed in
// the Sent log. The automation is read as it is now, so an edit made after a
// run was scheduled still applies, and one paused since then skips it.
//
// A user the directory doesn't know (yet) still gets theirs, as "User" with
// no name filled in: the event says they pay or trial, and the SDK reports
// them on its next load.
//
// Auth: a shared bearer token (ESCALATION_CRON_TOKEN), like escalate-unread
// and the translation sweep. verify_jwt is off for it in config.toml.

import { errorResponse, json } from '../_shared/http.ts';
import { serviceClient } from '../_shared/app-auth.ts';
import { ADMIN_LANGUAGE, baseLanguage } from '../_shared/languages.ts';
import { translateInBackground } from '../_shared/translate.ts';
import { render, translateTemplate, valuesFor } from '../_shared/templates.ts';
import { pushPreview, sendSupportPushes, type SupportPush } from '../_shared/expo-push.ts';

const CLAIM_LIMIT = 100;
/** Then it is marked failed, with the error, for someone to look at. */
const MAX_ATTEMPTS = 5;
const RETRY_AFTER_MS = 5 * 60_000;
/** The rest wait for the translation sweep. */
const BACKGROUND_TRANSLATIONS_MAX = 25;

type AutomationEvent =
  | 'trial_started'
  | 'pro_started'
  | 'trial_converted'
  | 'trial_cancelled'
  | 'pro_cancelled'
  | 'review_eligible';

/** Events that leave the user paying; the others leave them on a trial. */
const PAID_EVENTS: AutomationEvent[] = [
  'pro_started',
  'trial_converted',
  'pro_cancelled',
  'review_eligible',
];

interface Run {
  id: string;
  automation_id: string;
  app_id: string;
  event: AutomationEvent;
  revenuecat_id: string;
  attempts: number;
}

interface Automation {
  id: string;
  body: string;
  send_push: boolean;
  enabled: boolean;
}

interface Recipient {
  name: string | null;
  appVersion: string | null;
  language: string;
  pushToken: string | null;
}

type Supabase = ReturnType<typeof serviceClient>;

/** Name, version, language and push token for each of an app's users. */
async function loadRecipients(
  supabase: Supabase,
  appId: string,
  ids: string[],
): Promise<Map<string, Recipient>> {
  const [users, locales, push] = await Promise.all([
    supabase
      .from('app_users')
      .select('revenuecat_id, name, app_version')
      .eq('app_id', appId)
      .in('revenuecat_id', ids),
    supabase
      .from('user_locales')
      .select('revenuecat_id, language')
      .eq('app_id', appId)
      .in('revenuecat_id', ids),
    supabase
      .from('push_subscriptions')
      .select('revenuecat_id, permission_status, expo_push_token')
      .eq('app_id', appId)
      .in('revenuecat_id', ids),
  ]);
  if (users.error || locales.error || push.error) {
    throw new Error(
      `recipient lookup failed: ${users.error?.message ?? locales.error?.message ?? push.error?.message}`,
    );
  }
  const userOf = new Map((users.data ?? []).map((u) => [u.revenuecat_id as string, u]));
  const languageOf = new Map(
    (locales.data ?? []).map((l) => [l.revenuecat_id as string, l.language as string]),
  );
  const tokenOf = new Map(
    (push.data ?? [])
      .filter((p) => p.permission_status === 'granted' && p.expo_push_token)
      .map((p) => [p.revenuecat_id as string, p.expo_push_token as string]),
  );
  return new Map(
    ids.map((id) => [
      id,
      {
        name: (userOf.get(id)?.name as string | null | undefined) ?? null,
        appVersion: (userOf.get(id)?.app_version as string | null | undefined) ?? null,
        language: baseLanguage(languageOf.get(id) ?? ADMIN_LANGUAGE),
        pushToken: tokenOf.get(id) ?? null,
      },
    ]),
  );
}

/** Sets a run aside for good. */
async function finish(
  supabase: Supabase,
  runId: string,
  status: 'skipped' | 'failed',
  note: string,
) {
  const { error } = await supabase
    .from('automation_runs')
    .update({ status, note, processed_at: new Date().toISOString() })
    .eq('id', runId)
    .eq('status', 'sending');
  if (error) console.error('send-automations: closing run failed', runId, error);
}

/** Puts a run back for a later call, or gives up on it. */
async function retryLater(supabase: Supabase, run: Run, reason: string) {
  if (run.attempts >= MAX_ATTEMPTS) {
    await finish(supabase, run.id, 'failed', reason);
    return;
  }
  const { error } = await supabase
    .from('automation_runs')
    .update({
      status: 'pending',
      note: reason,
      due_at: new Date(Date.now() + RETRY_AFTER_MS * run.attempts).toISOString(),
    })
    .eq('id', run.id)
    .eq('status', 'sending');
  if (error) console.error('send-automations: requeue failed', run.id, error);
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);

  const cronToken = Deno.env.get('ESCALATION_CRON_TOKEN');
  if (!cronToken) {
    console.error('send-automations: ESCALATION_CRON_TOKEN is not configured');
    return errorResponse('Not configured', 500);
  }
  if (req.headers.get('Authorization') !== `Bearer ${cronToken}`) {
    return errorResponse('Unauthorized', 401);
  }

  const supabase = serviceClient();
  const { data: claimed, error: claimError } = await supabase.rpc(
    'claim_automation_runs',
    { p_limit: CLAIM_LIMIT },
  );
  if (claimError) {
    console.error('send-automations: claim failed', claimError);
    return errorResponse("Couldn't claim runs", 500);
  }
  const runs = (claimed ?? []) as Run[];
  if (runs.length === 0) return json({ sent: 0, skipped: 0, retried: 0 });

  const [{ data: automationRows, error: automationError }, { data: appRows, error: appError }] =
    await Promise.all([
      supabase
        .from('automations')
        .select('id, body, send_push, enabled')
        .in('id', [...new Set(runs.map((r) => r.automation_id))]),
      supabase
        .from('apps')
        .select('id, name')
        .in('id', [...new Set(runs.map((r) => r.app_id))]),
    ]);
  if (automationError || appError) {
    console.error('send-automations: lookup failed', automationError ?? appError);
    await Promise.all(runs.map((run) => retryLater(supabase, run, 'Lookup failed')));
    return errorResponse("Couldn't load automations", 500);
  }
  const automationOf = new Map(
    ((automationRows ?? []) as Automation[]).map((a) => [a.id, a]),
  );
  const appNameOf = new Map((appRows ?? []).map((a) => [a.id as string, a.name as string]));

  let sent = 0;
  let skipped = 0;
  let retried = 0;
  const pushes: SupportPush[] = [];
  const pendingTranslations: string[] = [];

  // One app at a time, so its recipients load in one round of queries.
  const byApp = new Map<string, Run[]>();
  for (const run of runs) byApp.set(run.app_id, [...(byApp.get(run.app_id) ?? []), run]);

  for (const [appId, appRuns] of byApp) {
    const appName = appNameOf.get(appId) ?? '';

    const live: { run: Run; automation: Automation }[] = [];
    for (const run of appRuns) {
      const automation = automationOf.get(run.automation_id);
      // A deleted automation takes its runs with it; this one went in
      // between the claim and the lookup.
      if (!automation || !automation.enabled) {
        await finish(supabase, run.id, 'skipped', automation ? 'Paused' : 'Deleted');
        skipped += 1;
        continue;
      }
      live.push({ run, automation });
    }
    if (live.length === 0) continue;

    let recipients: Map<string, Recipient>;
    try {
      recipients = await loadRecipients(
        supabase,
        appId,
        [...new Set(live.map(({ run }) => run.revenuecat_id))],
      );
    } catch (e) {
      console.error('send-automations:', e);
      for (const { run } of live) await retryLater(supabase, run, 'Recipient lookup failed');
      retried += live.length;
      continue;
    }

    // Each automation's text, translated once per language it goes out in.
    const translations = new Map<string, Map<string, string | null>>();
    for (const automation of new Set(live.map(({ automation }) => automation))) {
      const languages = [
        ...new Set(
          live
            .filter((l) => l.automation === automation)
            .map(({ run }) => recipients.get(run.revenuecat_id)!.language)
            .filter((language) => language !== ADMIN_LANGUAGE),
        ),
      ];
      translations.set(automation.id, await translateTemplate(automation.body, languages));
    }

    for (const { run, automation } of live) {
      const recipient = recipients.get(run.revenuecat_id)!;
      const values = valuesFor(recipient.name, appName);
      const body = render(automation.body, values);
      const template =
        recipient.language === ADMIN_LANGUAGE
          ? null
          : (translations.get(automation.id)?.get(recipient.language) ?? null);
      const translatedBody = template === null ? null : render(template, values);
      const status =
        recipient.language === ADMIN_LANGUAGE
          ? 'skipped'
          : translatedBody === null
            ? 'pending'
            : 'done';

      // Too long once a long name is filled in: shortening it would change
      // what the team wrote, so it isn't sent.
      if (body.length > 1000 || (translatedBody?.length ?? 0) > 1000) {
        await finish(supabase, run.id, 'failed', 'Over 1000 characters once filled in');
        continue;
      }

      const { data: created, error: sendError } = await supabase.rpc('send_automation_run', {
        p_run_id: run.id,
        p_template: automation.body,
        p_send_push: automation.send_push,
        p_user_name: recipient.name ?? 'User',
        p_is_paid: PAID_EVENTS.includes(run.event),
        p_app_version: recipient.appVersion ?? 'unknown',
        p_body: body,
        p_body_translated: translatedBody,
        p_translation_status: status,
      });
      if (sendError) {
        console.error('send-automations: send failed', run.id, sendError);
        await retryLater(supabase, run, sendError.message);
        retried += 1;
        continue;
      }
      const row = (created as { o_query_id: string; o_message_id: string }[] | null)?.[0];
      // Another call sent it first, or a later event (a trial cancelled
      // while its welcome was translating) undid it in the meantime.
      if (!row) continue;
      sent += 1;

      if (status === 'pending') pendingTranslations.push(row.o_message_id);
      if (automation.send_push && recipient.pushToken) {
        pushes.push({
          to: recipient.pushToken,
          title: appName,
          body: pushPreview(translatedBody ?? body),
          queryId: row.o_query_id,
        });
      }
    }
  }

  pendingTranslations
    .slice(0, BACKGROUND_TRANSLATIONS_MAX)
    .forEach((messageId) => translateInBackground(supabase, messageId));
  const pushed = await sendSupportPushes(pushes);

  return json({ sent, skipped, retried, pushed });
});
