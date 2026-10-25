// POST /functions/v1/send-message
// One message from the user in the support chat (SDK 0.4+).
// Auth: x-api-key header (per app) + app_name must match the key's app.
// Rate limited: per user and per app (see _shared/rate-limit.ts).
//
// The chat is one continuous conversation on the device, but the dashboard
// still works in conversations it can resolve. So this appends to the user's
// open conversation — the most recently active one, if an older build left
// several — and starts a new 'support' conversation when none is open, which
// is what a message after a resolve does. Deciding here rather than on the
// device means a resolve landing between two polls can't strand a message.

import { z } from 'npm:zod@3.23.8';
import { errorResponse, json, preflight } from '../_shared/http.ts';
import { authenticateApp, serviceClient } from '../_shared/app-auth.ts';
import { enforceRateLimit, LIMITS } from '../_shared/rate-limit.ts';
import { ADMIN_LANGUAGE, isSupportedLanguage } from '../_shared/languages.ts';
import { resolveUserLanguage } from '../_shared/user-language.ts';
import { translateInBackground } from '../_shared/translate.ts';
import { ReportedUserSchema, touchAppUser } from '../_shared/app-users.ts';
import { sdkVersion } from '../_shared/sdk.ts';

const BodySchema = z.object({
  app_name: z.string().min(1),
  revenuecat_id: z.string().trim().min(1).max(200),
  message: z.string().trim().min(1).max(1000),
  language: z.string().trim().refine(isSupportedLanguage).optional(),
  user: ReportedUserSchema,
});

interface OpenConversation {
  id: string;
  created_at: string;
  messages: { created_at: string }[];
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
      key: `pm:${app.id}:${body.revenuecat_id}`,
      limit: LIMITS.messagesPerUser,
      windowSeconds: LIMITS.windowSeconds,
    },
    {
      key: `app:${app.id}`,
      limit: LIMITS.writesPerApp,
      windowSeconds: LIMITS.windowSeconds,
    },
  ]);
  if (limited) return limited;

  const { data: open, error: openError } = await supabase
    .from('queries')
    .select('id, created_at, messages(created_at)')
    .eq('app_id', app.id)
    .eq('revenuecat_id', body.revenuecat_id)
    .eq('status', 'open')
    .order('created_at', { referencedTable: 'messages', ascending: false })
    .limit(1, { referencedTable: 'messages' });

  if (openError) {
    console.error('send-message: lookup failed', openError);
    return errorResponse("Couldn't send message", 500);
  }

  const lastActive = (c: OpenConversation) =>
    Date.parse(c.messages[0]?.created_at ?? c.created_at);
  const current = ((open ?? []) as OpenConversation[]).sort(
    (a, b) => lastActive(b) - lastActive(a),
  )[0];

  let queryId = current?.id ?? null;
  const started = queryId === null;

  if (queryId === null) {
    // Starting a conversation is the scarcer action, as with submit-query.
    const startLimited = await enforceRateLimit(supabase, [
      {
        key: `sq:${app.id}:${body.revenuecat_id}`,
        limit: LIMITS.submitPerUser,
        windowSeconds: LIMITS.windowSeconds,
      },
    ]);
    if (startLimited) return startLimited;

    const { data: query, error: queryError } = await supabase
      .from('queries')
      .insert({
        app_id: app.id,
        type: 'support',
        user_name: body.user.name,
        revenuecat_id: body.revenuecat_id,
        is_paid: body.user.plan === 'pro',
        app_version: body.user.app_version,
      })
      .select('id')
      .single();

    if (queryError || !query) {
      console.error('send-message: conversation insert failed', queryError);
      return errorResponse("Couldn't send message", 500);
    }
    queryId = query.id as string;
  }

  const language = await resolveUserLanguage(
    supabase,
    app.id,
    body.revenuecat_id,
    body.language,
  );
  const needsTranslation = language !== ADMIN_LANGUAGE;

  const { data: message, error: messageError } = await supabase
    .from('messages')
    .insert({
      query_id: queryId,
      sender: 'user',
      body: body.message,
      body_language: language,
      translation_status: needsTranslation ? 'pending' : 'skipped',
    })
    .select('id, created_at')
    .single();

  if (messageError || !message) {
    console.error('send-message: message insert failed', messageError);
    return errorResponse("Couldn't send message", 500);
  }

  if (needsTranslation) translateInBackground(supabase, message.id);

  // Writing in the chat means the user has seen everything above it.
  await supabase.from('read_receipts').upsert({
    query_id: queryId,
    reader: 'user',
    last_read_at: new Date().toISOString(),
  });

  await touchAppUser(supabase, app.id, body.revenuecat_id, {
    name: body.user.name,
    plan: body.user.plan,
    appVersion: body.user.app_version,
    sdkVersion: sdkVersion(req),
    platform: body.user.platform,
  });

  return json(
    {
      query_id: queryId,
      message_id: message.id,
      created_at: message.created_at,
      started,
    },
    201,
  );
});
