// POST /functions/v1/revenuecat-webhook?app=<app id>
//
// RevenueCat's webhook, set up once per app. When a user turns off
// auto-renew it marks their plan trial_cancelled or pro_cancelled, so the
// Users tab shows who is about to lapse while they still have access.
// Turning it back on, renewing or buying again puts them back on trial or
// pro. Nothing is sent to the user; reaching out is the team's call.
//
// Auth: the Authorization header value set in RevenueCat, which must be
// `Bearer <REVENUECAT_WEBHOOK_SECRET>`. One secret serves every app; the
// query string says which app the events are for. verify_jwt is off for it
// in config.toml.
//
// Users are matched by RevenueCat app user id, and its aliases, against the
// directory. Someone not in it — free, or never seen by SDK 0.4+ — is
// skipped: there is nothing to mark. Any well-formed event gets a 200, so
// RevenueCat doesn't retry the ones that need nothing done.

import { z } from 'npm:zod@3.23.8';
import { errorResponse, json } from '../_shared/http.ts';
import { serviceClient } from '../_shared/app-auth.ts';
import type { StoredPlan } from '../_shared/app-users.ts';

const MAX_IDS = 50;

const BodySchema = z.object({
  event: z.object({
    type: z.string(),
    app_user_id: z.string().nullish(),
    original_app_user_id: z.string().nullish(),
    aliases: z.array(z.string()).nullish(),
    // TRIAL, INTRO, NORMAL, PROMOTIONAL or PREPAID.
    period_type: z.string().nullish(),
  }),
});

/** The plan an event leaves the user on, or null for events that don't bear on it. */
function planAfter(type: string, periodType: string | null | undefined): StoredPlan | null {
  const trial = periodType === 'TRIAL';
  switch (type) {
    case 'CANCELLATION':
      return trial ? 'trial_cancelled' : 'pro_cancelled';
    case 'UNCANCELLATION':
    case 'RENEWAL':
    case 'INITIAL_PURCHASE':
      return trial ? 'trial' : 'pro';
    default:
      // EXPIRATION included: the user leaves the directory when their app
      // next reports them free, as anyone does.
      return null;
  }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);

  const secret = Deno.env.get('REVENUECAT_WEBHOOK_SECRET');
  if (!secret) {
    console.error('revenuecat-webhook: REVENUECAT_WEBHOOK_SECRET is not configured');
    return errorResponse('Not configured', 500);
  }
  if (req.headers.get('Authorization') !== `Bearer ${secret}`) {
    return errorResponse('Unauthorized', 401);
  }

  const appId = new URL(req.url).searchParams.get('app') ?? '';
  if (!z.string().uuid().safeParse(appId).success) {
    return errorResponse('Missing or invalid ?app=', 400);
  }

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
  const { event } = parsed.data;

  const supabase = serviceClient();
  const { data: app, error: appError } = await supabase
    .from('apps')
    .select('id')
    .eq('id', appId)
    .maybeSingle();
  if (appError) {
    console.error('revenuecat-webhook: app lookup failed', appError);
    return errorResponse("Couldn't record the event", 500);
  }
  if (!app) return errorResponse('Unknown app', 404);

  const plan = planAfter(event.type, event.period_type);
  if (plan === null) return json({ ok: true, ignored: event.type });

  const ids = [
    ...new Set(
      [event.app_user_id, event.original_app_user_id, ...(event.aliases ?? [])]
        .map((id) => id?.trim())
        .filter((id): id is string => Boolean(id)),
    ),
  ].slice(0, MAX_IDS);
  if (ids.length === 0) return json({ ok: true, updated: 0 });

  const { data: updated, error: updateError } = await supabase
    .from('app_users')
    .update({ plan })
    .eq('app_id', appId)
    .in('revenuecat_id', ids)
    .select('revenuecat_id');
  if (updateError) {
    // A 500 has RevenueCat try again later.
    console.error('revenuecat-webhook: update failed', updateError);
    return errorResponse("Couldn't record the event", 500);
  }

  return json({ ok: true, plan, updated: updated?.length ?? 0 });
});
