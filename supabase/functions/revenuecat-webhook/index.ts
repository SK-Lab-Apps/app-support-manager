// POST /functions/v1/revenuecat-webhook?app=<app id>
//
// RevenueCat's webhook, set up once per app. It does two things:
//
// 1. Plans. When a user turns off auto-renew it marks their plan
//    trial_cancelled or pro_cancelled, so the Users tab shows who is about
//    to lapse while they still have access. Turning it back on, renewing or
//    buying again puts them back on trial or pro. Users are matched by
//    RevenueCat app user id, and its aliases, against the directory;
//    someone not in it — free, or never seen by SDK 0.4+ — has no plan to
//    mark.
//
// 2. Automated messages. A trial starting, a subscription bought without
//    one, a trial converting, or a trial or subscription cancelled by the
//    user schedules that app's automation for the event, if it has one
//    switched on, to go out its delay later (send-automations sends it).
//    Any event also skips the user's runs still waiting that it undoes:
//    turning auto-renew back on drops a "sorry to see you go", cancelling
//    drops a welcome that hasn't gone yet, even one send-automations is
//    sending at that moment.
//
// RevenueCat retries a failed delivery, so events can arrive out of order.
// Each is recorded with when it happened and applied in that order by
// record_subscription_event, in one transaction: a late INITIAL_PURCHASE
// doesn't undo the CANCELLATION that came after it, schedule the welcome
// it ruled out, or put the plan back to trial.
//
// Auth: the Authorization header value set in RevenueCat, which must be
// `Bearer <REVENUECAT_WEBHOOK_SECRET>`. One secret serves every app; the
// query string says which app the events are for. verify_jwt is off for it
// in config.toml.
//
// Any well-formed event gets a 200, so RevenueCat doesn't retry the ones
// that need nothing done. A failed write gets a 500, and RevenueCat retries;
// the event id keeps a retry from being applied twice.

import { z } from 'npm:zod@3.23.8';
import { errorResponse, json } from '../_shared/http.ts';
import { serviceClient } from '../_shared/app-auth.ts';
import type { StoredPlan } from '../_shared/app-users.ts';

const MAX_IDS = 50;
/** Older events — a retry that came very late — schedule nothing. */
const STALE_AFTER_MS = 24 * 60 * 60 * 1000;

const BodySchema = z.object({
  event: z.object({
    id: z.string().nullish(),
    type: z.string(),
    app_user_id: z.string().nullish(),
    original_app_user_id: z.string().nullish(),
    aliases: z.array(z.string()).nullish(),
    // TRIAL, INTRO, NORMAL, PROMOTIONAL or PREPAID.
    period_type: z.string().nullish(),
    // RENEWAL: the first paid period after a trial.
    is_trial_conversion: z.boolean().nullish(),
    // CANCELLATION: UNSUBSCRIBE, BILLING_ERROR, DEVELOPER_INITIATED,
    // PRICE_INCREASE, CUSTOMER_SUPPORT or UNKNOWN.
    cancel_reason: z.string().nullish(),
    event_timestamp_ms: z.number().nullish(),
  }),
});

type RevenueCatEvent = z.infer<typeof BodySchema>['event'];

type AutomationEvent =
  | 'trial_started'
  | 'pro_started'
  | 'trial_converted'
  | 'trial_cancelled'
  | 'pro_cancelled';

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
      // EXPIRATION included: recording it takes the user out of the
      // directory and notes when they expired, for the automatic deletion
      // (see the user_deletion migration's note_subscription_expiry).
      return null;
  }
}

/**
 * The automation an event triggers, if any. Cancellations count only when
 * the user chose to: one for a failed payment or a refund isn't theirs to
 * be asked about.
 */
function automationFor(event: RevenueCatEvent): AutomationEvent | null {
  const trial = event.period_type === 'TRIAL';
  switch (event.type) {
    case 'INITIAL_PURCHASE':
      return trial ? 'trial_started' : 'pro_started';
    case 'RENEWAL':
      return event.is_trial_conversion ? 'trial_converted' : null;
    case 'CANCELLATION':
      if (
        event.cancel_reason === 'BILLING_ERROR' ||
        event.cancel_reason === 'CUSTOMER_SUPPORT' ||
        event.cancel_reason === 'DEVELOPER_INITIATED'
      ) {
        return null;
      }
      return trial ? 'trial_cancelled' : 'pro_cancelled';
    default:
      return null;
  }
}

/** What record_subscription_event returns. */
interface RecordResult {
  o_duplicate: boolean;
  o_updated: number;
  o_skipped: number;
  o_scheduled: boolean;
  o_due_at: string | null;
  o_note: string | null;
}

const WELCOMES: AutomationEvent[] = ['trial_started', 'pro_started', 'trial_converted'];
const CANCELLATIONS: AutomationEvent[] = ['trial_cancelled', 'pro_cancelled'];

/** Waiting messages an event makes wrong to send. */
function undoneBy(event: RevenueCatEvent): AutomationEvent[] {
  switch (event.type) {
    case 'CANCELLATION':
      return WELCOMES;
    case 'UNCANCELLATION':
    case 'INITIAL_PURCHASE':
    case 'PRODUCT_CHANGE':
      return CANCELLATIONS;
    case 'RENEWAL':
      // A converted trial is past its welcome to the trial.
      return event.is_trial_conversion
        ? ['trial_started', ...CANCELLATIONS]
        : CANCELLATIONS;
    case 'EXPIRATION':
      // Access is gone: every one of them is out of date.
      return [...WELCOMES, ...CANCELLATIONS];
    default:
      return [];
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

  const ids = [
    ...new Set(
      [event.app_user_id, event.original_app_user_id, ...(event.aliases ?? [])]
        .map((id) => id?.trim())
        .filter((id): id is string => Boolean(id)),
    ),
  ].slice(0, MAX_IDS);
  if (ids.length === 0) return json({ ok: true, ignored: event.type });

  const plan = planAfter(event.type, event.period_type);
  const undone = undoneBy(event);
  const trigger = automationFor(event);
  if (plan === null && undone.length === 0 && trigger === null) {
    return json({ ok: true, ignored: event.type });
  }

  // Applied in the order things happened, not the order they arrived (see
  // record_subscription_event): a CANCELLATION delivered before the
  // INITIAL_PURCHASE it followed still wins.
  const eventAt = event.event_timestamp_ms ?? Date.now();
  // An event without an id can't be told from a repeat of itself, so it
  // schedules nothing; it is still recorded, under an id of its own.
  const schedules =
    trigger !== null && Boolean(event.id) && Date.now() - eventAt <= STALE_AFTER_MS;

  const { data, error } = await supabase.rpc('record_subscription_event', {
    p_app_id: appId,
    p_event_id: event.id ?? `no-id:${crypto.randomUUID()}`,
    p_event_type: event.type,
    p_revenuecat_ids: ids,
    p_event_at: new Date(eventAt).toISOString(),
    p_plan: plan,
    p_undoes: undone,
    p_trigger: schedules ? trigger : null,
  });
  if (error) {
    // A 500 has RevenueCat try again later; nothing of it was kept.
    console.error('revenuecat-webhook: recording the event failed', error);
    return errorResponse("Couldn't record the event", 500);
  }
  const result = (data as RecordResult[] | null)?.[0];

  return json({
    ok: true,
    plan,
    duplicate: result?.o_duplicate ?? false,
    updated: result?.o_updated ?? 0,
    skipped: result?.o_skipped ?? 0,
    scheduled: result?.o_scheduled ?? false,
    due_at: result?.o_due_at ?? null,
    note: result?.o_note ?? null,
  });
});
