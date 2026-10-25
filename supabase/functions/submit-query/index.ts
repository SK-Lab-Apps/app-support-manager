// POST /functions/v1/submit-query
// Creates a query and its first message on behalf of an end user.
// Auth: x-api-key header (per app) + app_name must match the key's app.
// Rate limited: per user and per app (see _shared/rate-limit.ts).
//
// SDK 0.4+ sends its chat messages through send-message instead; this stays
// the entry point for builds before it, which file typed queries.

import { z } from 'npm:zod@3.23.8';
import { errorResponse, json, preflight } from '../_shared/http.ts';
import { authenticateApp, serviceClient } from '../_shared/app-auth.ts';
import { enforceRateLimit, LIMITS } from '../_shared/rate-limit.ts';
import { ADMIN_LANGUAGE, isSupportedLanguage } from '../_shared/languages.ts';
import { resolveUserLanguage } from '../_shared/user-language.ts';
import { translateInBackground } from '../_shared/translate.ts';
import {
  PlanSchema,
  planFromIsPaid,
  touchAppUser,
} from '../_shared/app-users.ts';
import { sdkVersion } from '../_shared/sdk.ts';

const BodySchema = z.object({
  app_name: z.string().min(1),
  query_type: z.enum(['feedback', 'feature_request', 'bug_report', 'support']),
  // Char limits enforced server-side here AND by the messages table CHECK.
  // Builds before 0.4 hold themselves to 10–300 on the device.
  message: z.string().trim().min(1).max(1000),
  user_name: z.string().trim().min(1).max(120),
  is_paid: z.boolean(),
  revenuecat_id: z.string().trim().min(1).max(200),
  app_version: z.string().trim().min(1).max(40),
  // The language this message is written in. Sent by the SDK on every write
  // so the stored preference stays fresh even if set-language never landed.
  language: z.string().trim().refine(isSupportedLanguage).optional(),
  // Free / trial / pro. Older builds only send is_paid.
  plan: PlanSchema.optional(),
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
      key: `sq:${app.id}:${body.revenuecat_id}`,
      limit: LIMITS.submitPerUser,
      windowSeconds: LIMITS.windowSeconds,
    },
    {
      key: `app:${app.id}`,
      limit: LIMITS.writesPerApp,
      windowSeconds: LIMITS.windowSeconds,
    },
  ]);
  if (limited) return limited;

  const language = await resolveUserLanguage(
    supabase,
    app.id,
    body.revenuecat_id,
    body.language,
  );

  const { data: query, error: queryError } = await supabase
    .from('queries')
    .insert({
      app_id: app.id,
      type: body.query_type,
      user_name: body.user_name,
      revenuecat_id: body.revenuecat_id,
      is_paid: body.is_paid,
      app_version: body.app_version,
    })
    .select('id, created_at')
    .single();

  if (queryError || !query) {
    console.error('submit-query: query insert failed', queryError);
    return errorResponse('Could not create query', 500);
  }

  const needsTranslation = language !== ADMIN_LANGUAGE;

  const { data: message, error: messageError } = await supabase
    .from('messages')
    .insert({
      query_id: query.id,
      sender: 'user',
      body: body.message,
      body_language: language,
      translation_status: needsTranslation ? 'pending' : 'skipped',
    })
    .select('id')
    .single();

  if (messageError || !message) {
    console.error('submit-query: message insert failed', messageError);
    return errorResponse('Could not create query', 500);
  }

  // After the row exists, never before it: the user's query is filed whether
  // or not the translation ever arrives.
  if (needsTranslation) translateInBackground(supabase, message.id);

  await touchAppUser(supabase, app.id, body.revenuecat_id, {
    name: body.user_name,
    plan: body.plan ?? planFromIsPaid(body.is_paid),
    appVersion: body.app_version,
    sdkVersion: sdkVersion(req),
  });

  // The submitter has read their own first message.
  await supabase.from('read_receipts').upsert({
    query_id: query.id,
    reader: 'user',
    last_read_at: new Date().toISOString(),
  });

  return json({ query_id: query.id, created_at: query.created_at }, 201);
});
