// POST /functions/v1/set-language
// Records the language an end user reads and writes support messages in.
// Auth: x-api-key header; the preference is scoped to that app + revenuecat_id.
//
// Called once when the user answers the SDK's language prompt, and again
// whenever they change it. The write endpoints also refresh the preference
// from the language they were handed, so a lost call here self-heals on the
// user's next message.

import { z } from 'npm:zod@3.23.8';
import { errorResponse, json, preflight } from '../_shared/http.ts';
import { authenticateApp, serviceClient } from '../_shared/app-auth.ts';
import { enforceRateLimit, LIMITS } from '../_shared/rate-limit.ts';
import { baseLanguage, isSupportedLanguage } from '../_shared/languages.ts';
import {
  requeueAdminTranslations,
  storedLanguage,
} from '../_shared/user-language.ts';

const BodySchema = z.object({
  revenuecat_id: z.string().trim().min(1).max(200),
  // Rejected rather than coerced: an unsupported code would end up in a
  // translation prompt and in the dashboard's language chip.
  language: z.string().trim().refine(isSupportedLanguage, {
    message: 'Unsupported language',
  }),
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
  const app = await authenticateApp(req, supabase);
  if (!app) return errorResponse('Invalid API key', 401);

  // Shares the per-app write budget: this is a cheap upsert, but it is still
  // an unauthenticated-user-triggered write.
  const limited = await enforceRateLimit(supabase, [
    {
      key: `app:${app.id}`,
      limit: LIMITS.writesPerApp,
      windowSeconds: LIMITS.windowSeconds,
    },
  ]);
  if (limited) return limited;

  const language = baseLanguage(body.language);
  const previous = await storedLanguage(supabase, app.id, body.revenuecat_id);

  const { error } = await supabase.from('user_locales').upsert(
    {
      app_id: app.id,
      revenuecat_id: body.revenuecat_id,
      language,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'app_id,revenuecat_id' },
  );

  if (error) {
    console.error('set-language: upsert failed', error);
    return errorResponse("Couldn't save language", 500);
  }

  // Replies already in their threads were translated into the old language.
  // Only re-queue on an actual change: the SDK re-sends the same value on
  // every write, and re-translating a thread on each message would be
  // expensive and pointless.
  if (previous !== null && previous !== language) {
    await requeueAdminTranslations(
      supabase,
      app.id,
      body.revenuecat_id,
      language,
    );
  }

  return json({ language });
});
