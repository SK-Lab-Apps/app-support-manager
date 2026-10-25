// POST /functions/v1/send-outreach
// Sends a first message from the team to one or many of an app's users,
// each in a new 'support' conversation. Staff-facing: requires an admin's
// JWT, like send-push.
//
// The message is a template: {first_name}, {name} and {app} are filled in
// per recipient. It is translated once per language with the placeholders
// intact, then filled in — one model call per language rather than per
// user. A language whose translation fails, or comes back with the
// placeholders mangled, is sent as English marked pending, and the
// translation sweep translates those copies one by one.
//
// These conversations stay out of the inbox until the user replies (see
// the users_and_outreach migration). Push is opt-in per send: Apple's
// guidelines treat unsolicited promotional pushes as off-limits.

import { z } from 'npm:zod@3.23.8';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { errorResponse, json, preflight } from '../_shared/http.ts';
import { serviceClient } from '../_shared/app-auth.ts';
import { ADMIN_LANGUAGE, baseLanguage } from '../_shared/languages.ts';
import {
  translateInBackground,
  translateText,
} from '../_shared/translate.ts';
import { placeholdersIn, render, valuesFor } from '../_shared/templates.ts';

const EXPO_PUSH_ENDPOINT = 'https://exp.host/--/api/v2/push/send';
const MAX_RECIPIENTS = 1000;
const MESSAGE_MAX = 1000;
/** PostgREST filters travel in the URL; keep `in.(…)` lists short. */
const LOOKUP_CHUNK = 100;
const EXPO_BATCH = 100;
const PUSH_PREVIEW_MAX = 150;
/** The rest wait for the translation sweep. */
const BACKGROUND_TRANSLATIONS_MAX = 25;

const BodySchema = z.object({
  app_id: z.string().uuid(),
  revenuecat_ids: z
    .array(z.string().trim().min(1).max(200))
    .min(1)
    .max(MAX_RECIPIENTS),
  body: z.string().trim().min(1).max(MESSAGE_MAX),
  template_id: z.string().uuid().nullish(),
  send_push: z.boolean(),
});

// ---------- recipients ----------

interface Recipient {
  revenuecat_id: string;
  name: string | null;
  plan: 'free' | 'trial' | 'pro';
  app_version: string | null;
  language: string;
  pushToken: string | null;
}

function chunks<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

async function loadRecipients(
  supabase: ReturnType<typeof serviceClient>,
  appId: string,
  ids: string[],
): Promise<Recipient[]> {
  const recipients: Recipient[] = [];
  for (const batch of chunks(ids, LOOKUP_CHUNK)) {
    const [users, locales, push] = await Promise.all([
      supabase
        .from('app_users')
        .select('revenuecat_id, name, plan, app_version')
        .eq('app_id', appId)
        .in('revenuecat_id', batch),
      supabase
        .from('user_locales')
        .select('revenuecat_id, language')
        .eq('app_id', appId)
        .in('revenuecat_id', batch),
      supabase
        .from('push_subscriptions')
        .select('revenuecat_id, permission_status, expo_push_token')
        .eq('app_id', appId)
        .in('revenuecat_id', batch),
    ]);
    if (users.error || locales.error || push.error) {
      throw new Error(
        `recipient lookup failed: ${users.error?.message ?? locales.error?.message ?? push.error?.message}`,
      );
    }
    const languageOf = new Map(
      (locales.data ?? []).map((l) => [l.revenuecat_id, l.language as string]),
    );
    const tokenOf = new Map(
      (push.data ?? [])
        .filter((p) => p.permission_status === 'granted' && p.expo_push_token)
        .map((p) => [p.revenuecat_id, p.expo_push_token as string]),
    );
    for (const u of users.data ?? []) {
      recipients.push({
        revenuecat_id: u.revenuecat_id,
        name: u.name,
        plan: u.plan,
        app_version: u.app_version,
        language: baseLanguage(languageOf.get(u.revenuecat_id) ?? ADMIN_LANGUAGE),
        pushToken: tokenOf.get(u.revenuecat_id) ?? null,
      });
    }
  }
  return recipients;
}

/** Template per language, or null where the copies go out pending. */
async function translateTemplate(
  template: string,
  languages: string[],
): Promise<Map<string, string | null>> {
  const expected = placeholdersIn(template);
  const results = await Promise.all(
    languages.map(async (language) => {
      try {
        const { translation } = await translateText(template, language);
        if (placeholdersIn(translation) !== expected) {
          console.error('send-outreach: placeholders lost in', language);
          return [language, null] as const;
        }
        return [language, translation] as const;
      } catch (e) {
        console.error('send-outreach: translation failed for', language, e);
        return [language, null] as const;
      }
    }),
  );
  return new Map(results);
}

function preview(text: string): string {
  return text.length > PUSH_PREVIEW_MAX
    ? `${text.slice(0, PUSH_PREVIEW_MAX - 1).trimEnd()}…`
    : text;
}

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return errorResponse('Unauthorized', 401);

  const callerClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } },
  );
  const {
    data: { user },
  } = await callerClient.auth.getUser();
  if (!user) return errorResponse('Unauthorized', 401);

  const { data: admin } = await callerClient
    .from('admins')
    .select('id')
    .eq('id', user.id)
    .maybeSingle();
  if (!admin) return errorResponse('Forbidden', 403);

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return errorResponse('Invalid JSON body', 400);
  }
  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) {
    return json(
      { error: 'Validation failed', issues: parsed.error.flatten().fieldErrors },
      422,
    );
  }
  const input = parsed.data;
  const ids = [...new Set(input.revenuecat_ids)];

  const supabase = serviceClient();

  const { data: app } = await supabase
    .from('apps')
    .select('id, name')
    .eq('id', input.app_id)
    .maybeSingle();
  if (!app) return errorResponse('App not found', 404);

  let recipients: Recipient[];
  try {
    recipients = await loadRecipients(supabase, app.id, ids);
  } catch (e) {
    console.error('send-outreach:', e);
    return errorResponse("Couldn't load recipients", 500);
  }
  if (recipients.length === 0) {
    return errorResponse('None of these users are known for this app', 404);
  }

  // Every copy has to fit the messages table once names are filled in.
  const tooLong = recipients.filter(
    (r) => render(input.body, valuesFor(r.name, app.name)).length > MESSAGE_MAX,
  ).length;
  if (tooLong > 0) {
    return errorResponse(
      `Message is over ${MESSAGE_MAX} characters for ${tooLong} recipient(s) once names are filled in`,
      422,
    );
  }

  const languages = [
    ...new Set(recipients.map((r) => r.language).filter((l) => l !== ADMIN_LANGUAGE)),
  ];
  const translated = await translateTemplate(input.body, languages);

  const rows = recipients.map((r) => {
    const values = valuesFor(r.name, app.name);
    const body = render(input.body, values);
    if (r.language === ADMIN_LANGUAGE) {
      return { r, body, translatedBody: null, status: 'skipped' as const };
    }
    const template = translated.get(r.language) ?? null;
    return template === null
      ? { r, body, translatedBody: null, status: 'pending' as const }
      : { r, body, translatedBody: render(template, values), status: 'done' as const };
  });

  const { data: created, error: createError } = await supabase.rpc(
    'create_outreach',
    {
      p_app_id: app.id,
      p_sent_by: admin.id,
      p_template_id: input.template_id ?? null,
      p_body: input.body,
      p_send_push: input.send_push,
      p_recipients: rows.map(({ r, body, translatedBody, status }) => ({
        revenuecat_id: r.revenuecat_id,
        // queries.user_name and app_version are required; a user known only
        // from a push registration has neither.
        user_name: r.name ?? 'User',
        is_paid: r.plan === 'pro',
        app_version: r.app_version ?? 'unknown',
        body,
        body_translated: translatedBody,
        translation_status: status,
      })),
    },
  );

  if (createError || !created) {
    console.error('send-outreach: create_outreach failed', createError);
    return errorResponse("Couldn't send — nothing was sent", 500);
  }

  const sent = created as {
    o_broadcast_id: string;
    o_query_id: string;
    o_revenuecat_id: string;
    o_message_id: string;
  }[];
  const broadcastId = sent[0]?.o_broadcast_id ?? null;
  const byUser = new Map(sent.map((s) => [s.o_revenuecat_id, s]));

  // Pending copies: start a few now, the sweep picks up the rest.
  rows
    .filter((row) => row.status === 'pending')
    .slice(0, BACKGROUND_TRANSLATIONS_MAX)
    .forEach((row) => {
      const messageId = byUser.get(row.r.revenuecat_id)?.o_message_id;
      if (messageId) translateInBackground(supabase, messageId);
    });

  let pushed = 0;
  if (input.send_push) {
    const notifications = rows
      .filter((row) => row.r.pushToken && byUser.has(row.r.revenuecat_id))
      .map((row) => ({
        to: row.r.pushToken!,
        title: app.name,
        body: preview(row.translatedBody ?? row.body),
        sound: 'default',
        // The SDK opens the chat on tap.
        data: {
          query_id: byUser.get(row.r.revenuecat_id)!.o_query_id,
          type: 'support_reply',
        },
      }));
    for (const batch of chunks(notifications, EXPO_BATCH)) {
      try {
        const response = await fetch(EXPO_PUSH_ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(batch),
        });
        const result = await response.json();
        const tickets = Array.isArray(result?.data) ? result.data : [];
        pushed += tickets.filter((t: { status?: string }) => t?.status === 'ok').length;
      } catch (e) {
        // The messages are delivered in the chat either way.
        console.error('send-outreach: push batch failed', e);
      }
    }
  }

  return json({
    broadcast_id: broadcastId,
    sent: sent.length,
    unknown: ids.length - recipients.length,
    pushed,
  });
});
