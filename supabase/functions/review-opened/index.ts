// POST /functions/v1/review-opened
// Records that the user tapped a review request's store button (SDK 0.4+).
// The dashboard shows it under the request. It means the store page was
// opened, not that a review was written — the stores don't say.
// Auth: x-api-key header (per app) + app_name must match the key's app.
// Data is scoped to that app + revenuecat_id: a user can only mark requests
// in their own conversations.

import { z } from 'npm:zod@3.23.8';
import { errorResponse, json, preflight } from '../_shared/http.ts';
import { authenticateApp, serviceClient } from '../_shared/app-auth.ts';
import { enforceRateLimit, LIMITS } from '../_shared/rate-limit.ts';

const OPENS_PER_USER = 30;

const BodySchema = z.object({
  app_name: z.string().min(1),
  revenuecat_id: z.string().trim().min(1).max(200),
  message_id: z.string().uuid(),
});

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
    return json(
      { error: 'Validation failed', issues: parsed.error.flatten().fieldErrors },
      422,
    );
  }
  const body = parsed.data;

  const supabase = serviceClient();
  const app = await authenticateApp(req, supabase, body.app_name);
  if (!app) return errorResponse('Invalid API key', 401);

  const limited = await enforceRateLimit(supabase, [
    {
      key: `ro:${app.id}:${body.revenuecat_id}`,
      limit: OPENS_PER_USER,
      windowSeconds: LIMITS.windowSeconds,
    },
  ]);
  if (limited) return limited;

  const { data: message, error: lookupError } = await supabase
    .from('messages')
    .select('id, kind, review_opened_at, queries!inner(app_id, revenuecat_id)')
    .eq('id', body.message_id)
    .eq('queries.app_id', app.id)
    .eq('queries.revenuecat_id', body.revenuecat_id)
    .maybeSingle();

  if (lookupError) {
    console.error('review-opened: lookup failed', lookupError);
    return errorResponse("Couldn't record the tap", 500);
  }
  if (!message || message.kind !== 'review_request') {
    return errorResponse('Review request not found', 404);
  }

  // The first tap is the one worth knowing about.
  if (message.review_opened_at === null) {
    const { error: updateError } = await supabase
      .from('messages')
      .update({ review_opened_at: new Date().toISOString() })
      .eq('id', message.id)
      .is('review_opened_at', null);
    if (updateError) {
      console.error('review-opened: update failed', updateError);
      return errorResponse("Couldn't record the tap", 500);
    }
  }

  return json({ ok: true });
});
