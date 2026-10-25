// POST /functions/v1/register-user
// Records the current user in the app's directory (SDK 0.4+, on every load):
// who they are, their plan, their app version. This is what lets the
// dashboard list an app's users and message them first, before they ever
// open support.
// Auth: x-api-key header (per app) + app_name must match the key's app.
//
// Rate limited per user only. It runs on every launch, so counting it
// against the per-app write cap would let ordinary traffic block real
// messages.

import { z } from 'npm:zod@3.23.8';
import { errorResponse, json, preflight } from '../_shared/http.ts';
import { authenticateApp, serviceClient } from '../_shared/app-auth.ts';
import { enforceRateLimit, LIMITS } from '../_shared/rate-limit.ts';
import { ReportedUserSchema, touchAppUser } from '../_shared/app-users.ts';
import { sdkVersion } from '../_shared/sdk.ts';

const REGISTRATIONS_PER_USER = 60;

const BodySchema = z.object({
  app_name: z.string().min(1),
  revenuecat_id: z.string().trim().min(1).max(200),
  user: ReportedUserSchema,
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
      key: `ru:${app.id}:${body.revenuecat_id}`,
      limit: REGISTRATIONS_PER_USER,
      windowSeconds: LIMITS.windowSeconds,
    },
  ]);
  if (limited) return limited;

  await touchAppUser(supabase, app.id, body.revenuecat_id, {
    name: body.user.name,
    plan: body.user.plan,
    appVersion: body.user.app_version,
    sdkVersion: sdkVersion(req),
    platform: body.user.platform,
  });

  return json({ ok: true });
});
