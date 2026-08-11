// POST /functions/v1/register-push
// Records the OS notification permission outcome for an end user, plus the
// Expo push token when one is available.
//
// The SDK calls this every time the support sheet opens, including when the
// user denied — the dashboard needs to distinguish "never asked" from
// "asked and declined". Nothing about the support flow depends on the
// result; this is purely reachability metadata.
//
// Auth: x-api-key header. Scoped to that app + revenuecat_id.

import { z } from 'npm:zod@3.23.8';
import { errorResponse, json, preflight } from '../_shared/http.ts';
import { authenticateApp, serviceClient } from '../_shared/app-auth.ts';

const BodySchema = z.object({
  app_name: z.string().min(1),
  revenuecat_id: z.string().trim().min(1).max(200),
  permission_status: z.enum(['undetermined', 'granted', 'denied']),
  // Present only when permission was granted and the host app could mint a
  // token (requires a dev/production build — not available in Expo Go).
  expo_push_token: z.string().trim().min(1).max(500).nullish(),
  // Whether the OS prompt was actually shown during this session.
  asked: z.boolean().default(false),
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

  // Preserve an earlier asked_at: once asked, always asked.
  const { data: existing } = await supabase
    .from('push_subscriptions')
    .select('asked_at')
    .eq('app_id', app.id)
    .eq('revenuecat_id', body.revenuecat_id)
    .maybeSingle();

  const now = new Date().toISOString();
  const askedAt = body.asked ? now : (existing?.asked_at ?? null);

  const { error } = await supabase.from('push_subscriptions').upsert(
    {
      app_id: app.id,
      revenuecat_id: body.revenuecat_id,
      permission_status: body.permission_status,
      expo_push_token: body.expo_push_token ?? null,
      asked_at: askedAt,
      updated_at: now,
    },
    { onConflict: 'app_id,revenuecat_id' },
  );

  if (error) {
    console.error('register-push: upsert failed', error);
    return errorResponse("Couldn't record push status", 500);
  }

  return json({ ok: true });
});
