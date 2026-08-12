// POST /functions/v1/escalate-unread
//
// Emails every admin about user messages that have gone unread for longer than
// the escalation threshold (5 hours by default). Invoked by the pg_cron job
// defined in migration 20260709000008 — not by users, and not by the dashboard.
//
// Auth: a shared bearer token (ESCALATION_CRON_TOKEN), NOT a Supabase JWT and
// NOT a per-app API key. This is a machine-to-machine endpoint; verify_jwt is
// off for it in config.toml.
//
// Delivery is one email per thread, one-shot per message: a message is recorded
// in message_escalations once its email is accepted by Resend, and the
// detection query skips anything already recorded. Recording only on success
// means a provider outage retries on the next tick rather than losing the
// alert silently.

import { z } from 'npm:zod@3.23.8';
import { errorResponse, json, preflight } from '../_shared/http.ts';
import { serviceClient } from '../_shared/app-auth.ts';
import { ADMIN_LANGUAGE, languageName } from '../_shared/languages.ts';

const RESEND_ENDPOINT = 'https://api.resend.com/emails';
const DEFAULT_THRESHOLD_HOURS = 5;

const BodySchema = z.object({
  /** Test-only override of the 5-hour window. Safe: the caller is authenticated. */
  threshold_minutes: z.number().int().positive().max(10_080).optional(),
  /** Compute and return what would be sent, without sending or recording. */
  dry_run: z.boolean().default(false),
});

const TYPE_LABEL: Record<string, string> = {
  feedback: 'feedback',
  feature_request: 'feature request',
  bug_report: 'bug report',
};

interface OverdueRow {
  message_id: string;
  query_id: string;
  app_id: string;
  app_name: string;
  user_name: string;
  query_type: string;
  /** English rendering — the RPC resolves it (see migration 20260812000001). */
  body: string;
  /** The language the user actually wrote in. */
  body_language: string;
  created_at: string;
  is_reply: boolean;
}

interface Recipient {
  display_name: string;
  email: string;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function hoursSince(iso: string): string {
  const hours = (Date.now() - Date.parse(iso)) / 3_600_000;
  if (hours < 1) return `${Math.round(hours * 60)} minutes`;
  return `${hours.toFixed(1)} hours`;
}

/**
 * One thread's worth of overdue messages, rendered as a plain, readable email.
 * Deliberately unstyled — this is an operational alert, not marketing.
 */
function renderEmail(
  rows: OverdueRow[],
  dashboardUrl: string | undefined,
): { subject: string; html: string; text: string } {
  const first = rows[0]!;
  const typeLabel = TYPE_LABEL[first.query_type] ?? 'message';
  const subject = `[${first.app_name}] Unread ${typeLabel} from ${first.user_name}`;

  const context = first.is_reply
    ? 'Reply to an earlier admin message'
    : 'New query — no admin has replied yet';

  const oldest = rows.reduce((a, b) =>
    Date.parse(a.created_at) <= Date.parse(b.created_at) ? a : b,
  );

  const link = dashboardUrl
    ? `${dashboardUrl.replace(/\/$/, '')}/apps/${first.app_id}`
    : null;

  // The bodies below are the English rendering. Say so when the user wrote in
  // something else, so a reader knows the wording is a translation and that
  // their reply will be translated back.
  const translatedFrom =
    first.body_language && first.body_language !== ADMIN_LANGUAGE
      ? languageName(first.body_language)
      : null;

  const messageLines = rows.map(
    (r) =>
      `${new Date(r.created_at).toUTCString()} — ${r.body}`,
  );

  const text = [
    `${rows.length === 1 ? 'A message has' : `${rows.length} messages have`} gone unread for ${hoursSince(oldest.created_at)}.`,
    '',
    `App:    ${first.app_name}`,
    `User:   ${first.user_name}`,
    `Type:   ${typeLabel}`,
    `Status: ${context}`,
    ...(translatedFrom ? [`Language: ${translatedFrom} (shown translated)`] : []),
    '',
    ...messageLines,
    ...(link ? ['', `Open the dashboard: ${link}`] : []),
  ].join('\n');

  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:14px;line-height:1.5;color:#18181B;max-width:560px">
      <p style="margin:0 0 16px">
        ${rows.length === 1 ? 'A message has' : `${rows.length} messages have`}
        gone unread for <strong>${hoursSince(oldest.created_at)}</strong>.
      </p>
      <table style="border-collapse:collapse;margin:0 0 16px">
        <tr><td style="padding:2px 16px 2px 0;color:#6E6E76">App</td><td>${escapeHtml(first.app_name)}</td></tr>
        <tr><td style="padding:2px 16px 2px 0;color:#6E6E76">User</td><td>${escapeHtml(first.user_name)}</td></tr>
        <tr><td style="padding:2px 16px 2px 0;color:#6E6E76">Type</td><td>${escapeHtml(typeLabel)}</td></tr>
        <tr><td style="padding:2px 16px 2px 0;color:#6E6E76">Context</td><td>${escapeHtml(context)}</td></tr>
        ${
          translatedFrom
            ? `<tr><td style="padding:2px 16px 2px 0;color:#6E6E76">Language</td><td>${escapeHtml(translatedFrom)} <span style="color:#A0A0A8">(shown translated)</span></td></tr>`
            : ''
        }
      </table>
      ${rows
        .map(
          (r) => `
        <div style="border-left:2px solid #E4E4E7;padding:0 0 0 12px;margin:0 0 12px">
          <div style="color:#A0A0A8;font-size:12px;margin-bottom:4px">${new Date(r.created_at).toUTCString()}</div>
          <div style="white-space:pre-wrap">${escapeHtml(r.body)}</div>
        </div>`,
        )
        .join('')}
      ${
        link
          ? `<p style="margin:16px 0 0"><a href="${link}" style="color:#5E6AD2">Open the dashboard</a></p>`
          : ''
      }
    </div>
  `.trim();

  return { subject, html, text };
}

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);

  const cronToken = Deno.env.get('ESCALATION_CRON_TOKEN');
  if (!cronToken) {
    console.error('escalate-unread: ESCALATION_CRON_TOKEN is not configured');
    return errorResponse('Not configured', 500);
  }
  if (req.headers.get('Authorization') !== `Bearer ${cronToken}`) {
    return errorResponse('Unauthorized', 401);
  }

  // An empty body is the normal cron case.
  let raw: unknown = {};
  try {
    const text = await req.text();
    if (text.trim().length > 0) raw = JSON.parse(text);
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
  const { threshold_minutes, dry_run } = parsed.data;

  const thresholdInterval =
    threshold_minutes !== undefined
      ? `${threshold_minutes} minutes`
      : `${DEFAULT_THRESHOLD_HOURS} hours`;

  const supabase = serviceClient();

  const { data: overdue, error: overdueError } = await supabase.rpc(
    'overdue_unread_messages',
    { p_threshold: thresholdInterval },
  );
  if (overdueError) {
    console.error('escalate-unread: detection query failed', overdueError);
    return errorResponse('Could not load overdue messages', 500);
  }

  const rows = (overdue ?? []) as OverdueRow[];
  if (rows.length === 0) {
    return json({
      threads_notified: 0,
      messages_escalated: 0,
      recipients: 0,
      reason: 'no_overdue_messages',
      threshold: thresholdInterval,
    });
  }

  // One email per thread, preserving the query's message order.
  const threads = new Map<string, OverdueRow[]>();
  for (const row of rows) {
    const existing = threads.get(row.query_id);
    if (existing) existing.push(row);
    else threads.set(row.query_id, [row]);
  }

  const { data: adminRows, error: adminError } = await supabase.rpc(
    'admin_notification_emails',
  );
  if (adminError) {
    console.error('escalate-unread: recipient lookup failed', adminError);
    return errorResponse('Could not load admin recipients', 500);
  }
  const recipients = (adminRows ?? []) as Recipient[];
  if (recipients.length === 0) {
    console.warn('escalate-unread: no admin has an email address');
    return json({
      threads_notified: 0,
      messages_escalated: 0,
      recipients: 0,
      // Distinct from no_overdue_messages: there IS work to do, but nobody to
      // tell. Usually means public.admins is empty or an admin auth user has
      // no email.
      reason: 'no_recipients',
      overdue_messages: rows.length,
      overdue_threads: threads.size,
    });
  }

  const dashboardUrl = Deno.env.get('DASHBOARD_URL') ?? undefined;
  const to = recipients.map((r) => r.email);

  if (dry_run) {
    return json({
      dry_run: true,
      recipients: to,
      threshold: thresholdInterval,
      threads: [...threads.values()].map((threadRows) => ({
        query_id: threadRows[0]!.query_id,
        message_count: threadRows.length,
        is_reply: threadRows[0]!.is_reply,
        ...renderEmail(threadRows, dashboardUrl),
      })),
    });
  }

  const resendKey = Deno.env.get('RESEND_API_KEY');
  if (!resendKey) {
    console.error('escalate-unread: RESEND_API_KEY is not configured');
    return errorResponse('Not configured', 500);
  }
  const from = Deno.env.get('ESCALATION_FROM') ?? 'Support <onboarding@resend.dev>';

  let threadsNotified = 0;
  let messagesEscalated = 0;
  const failures: string[] = [];

  for (const threadRows of threads.values()) {
    const { subject, html, text } = renderEmail(threadRows, dashboardUrl);

    try {
      const response = await fetch(RESEND_ENDPOINT, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${resendKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ from, to, subject, html, text }),
      });

      if (!response.ok) {
        const detail = await response.text();
        console.error(
          `escalate-unread: resend rejected thread ${threadRows[0]!.query_id}`,
          response.status,
          detail,
        );
        failures.push(threadRows[0]!.query_id);
        continue;
      }
    } catch (e) {
      console.error('escalate-unread: send failed', e);
      failures.push(threadRows[0]!.query_id);
      continue;
    }

    // Only now is the message considered escalated — a failure above leaves it
    // unrecorded so the next tick retries it.
    const { error: ledgerError } = await supabase
      .from('message_escalations')
      .insert(
        threadRows.map((r) => ({
          message_id: r.message_id,
          recipient_count: to.length,
        })),
      );

    if (ledgerError) {
      // The email is already out; log loudly rather than resend next tick.
      console.error(
        'escalate-unread: email sent but ledger insert failed',
        ledgerError,
      );
    }

    threadsNotified += 1;
    messagesEscalated += threadRows.length;
  }

  return json({
    threads_notified: threadsNotified,
    messages_escalated: messagesEscalated,
    recipients: to.length,
    ...(failures.length > 0 ? { failed_threads: failures } : {}),
  });
});
