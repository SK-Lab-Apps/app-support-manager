// POST /functions/v1/translate-message
//
// Produces the counterpart rendering of a message (see _shared/translate.ts).
// Two callers, two auth modes, which is why verify_jwt is off for this
// function and the check happens here:
//
//   { "message_id": "..." }  — the dashboard, with an admin Supabase JWT,
//                              right after inserting a reply.
//   { "mode": "sweep" }      — the pg_cron job, with the shared cron token,
//                              mopping up anything the inline paths dropped.
//
// The user-side write endpoints do not call this over HTTP; they invoke the
// shared module directly in the same instance.

import { z } from 'npm:zod@3.23.8';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { errorResponse, json, preflight } from '../_shared/http.ts';
import { serviceClient } from '../_shared/app-auth.ts';
import {
  MAX_TRANSLATION_ATTEMPTS,
  translateMessageRow,
} from '../_shared/translate.ts';

const BodySchema = z.union([
  z.object({ message_id: z.string().uuid() }),
  z.object({ mode: z.literal('sweep') }),
]);

/** Messages younger than this are still plausibly in an inline call. */
const SWEEP_MIN_AGE_MS = 60_000;
/** Bounded so one tick can't outrun the function timeout. */
const SWEEP_BATCH = 10;

/** True when the request carries the shared machine-to-machine cron token. */
function isCronCaller(req: Request): boolean {
  const token = Deno.env.get('ESCALATION_CRON_TOKEN');
  if (!token) return false;
  return req.headers.get('Authorization') === `Bearer ${token}`;
}

/** True when the caller's JWT belongs to a seeded admin. */
async function isAdminCaller(req: Request): Promise<boolean> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return false;

  const callerClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    },
  );

  const {
    data: { user },
  } = await callerClient.auth.getUser();
  if (!user) return false;

  const { data: admin } = await callerClient
    .from('admins')
    .select('id')
    .eq('id', user.id)
    .maybeSingle();
  return admin !== null;
}

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return errorResponse('Invalid JSON body', 400);
  }

  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) {
    return errorResponse('Expected { message_id } or { mode: "sweep" }', 422);
  }
  const body = parsed.data;

  const cron = isCronCaller(req);
  if (!cron && !(await isAdminCaller(req))) {
    return errorResponse('Unauthorized', 401);
  }
  // The sweep walks every app's backlog, so it is cron-only.
  if ('mode' in body && !cron) return errorResponse('Forbidden', 403);

  const supabase = serviceClient();

  if ('message_id' in body) {
    const outcome = await translateMessageRow(supabase, body.message_id);
    if (outcome === 'not_found') return errorResponse('Message not found', 404);
    return json({ outcome });
  }

  const cutoff = new Date(Date.now() - SWEEP_MIN_AGE_MS).toISOString();
  const { data, error } = await supabase
    .from('messages')
    .select('id')
    .in('translation_status', ['pending', 'failed'])
    .lt('translation_attempts', MAX_TRANSLATION_ATTEMPTS)
    .lt('created_at', cutoff)
    .order('created_at', { ascending: true })
    .limit(SWEEP_BATCH);

  if (error) {
    console.error('translate-message: sweep query failed', error);
    return errorResponse('Could not load pending translations', 500);
  }

  const rows = (data ?? []) as { id: string }[];
  // Whole batch at once: these are ten independent HTTP calls, and the job
  // ticks every minute, so a backlog drains at ten a minute.
  const outcomes = await Promise.all(
    rows.map((row) => translateMessageRow(supabase, row.id)),
  );

  return json({
    swept: rows.length,
    done: outcomes.filter((o) => o === 'done').length,
    skipped: outcomes.filter((o) => o === 'skipped').length,
    failed: outcomes.filter((o) => o === 'failed').length,
  });
});
