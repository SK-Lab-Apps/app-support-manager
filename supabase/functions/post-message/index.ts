// POST /functions/v1/post-message
// Appends a user message to one of their own OPEN threads.
// Auth: x-api-key header; the thread must belong to the key's app AND the
// given revenuecat_id (ownership is verified before any write).
// Rate limited: per user and per app (see _shared/rate-limit.ts).

import { z } from 'npm:zod@3.23.8';
import { errorResponse, json, preflight } from '../_shared/http.ts';
import { authenticateApp, serviceClient } from '../_shared/app-auth.ts';
import { enforceRateLimit, LIMITS } from '../_shared/rate-limit.ts';

const BodySchema = z.object({
  query_id: z.string().uuid(),
  revenuecat_id: z.string().trim().min(1).max(200),
  // Char limits enforced server-side here AND by the messages table CHECK.
  message: z.string().trim().min(10).max(300),
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

  // Ownership + status check: the thread must belong to this app and user.
  const { data: query, error: queryError } = await supabase
    .from('queries')
    .select('id, status')
    .eq('id', body.query_id)
    .eq('app_id', app.id)
    .eq('revenuecat_id', body.revenuecat_id)
    .maybeSingle();

  if (queryError) {
    console.error('post-message: lookup failed', queryError);
    return errorResponse("Couldn't send message", 500);
  }
  if (!query) return errorResponse('Thread not found', 404);
  if (query.status !== 'open') {
    return errorResponse('Thread is resolved and read-only', 409);
  }

  const { data: message, error: insertError } = await supabase
    .from('messages')
    .insert({ query_id: query.id, sender: 'user', body: body.message })
    .select('id, created_at')
    .single();

  if (insertError || !message) {
    console.error('post-message: insert failed', insertError);
    return errorResponse("Couldn't send message", 500);
  }

  return json({ message_id: message.id, created_at: message.created_at }, 201);
});
