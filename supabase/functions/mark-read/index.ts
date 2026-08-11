// POST /functions/v1/mark-read
// Upserts the user-side read receipt for one of their own threads.
// Auth: x-api-key header; thread ownership verified before the write.
// Rate limiting: see note in _shared/app-auth.ts.

import { z } from 'npm:zod@3.23.8';
import { errorResponse, json, preflight } from '../_shared/http.ts';
import { authenticateApp, serviceClient } from '../_shared/app-auth.ts';

const BodySchema = z.object({
  query_id: z.string().uuid(),
  revenuecat_id: z.string().trim().min(1).max(200),
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

  const { data: query, error: queryError } = await supabase
    .from('queries')
    .select('id')
    .eq('id', body.query_id)
    .eq('app_id', app.id)
    .eq('revenuecat_id', body.revenuecat_id)
    .maybeSingle();

  if (queryError) {
    console.error('mark-read: lookup failed', queryError);
    return errorResponse("Couldn't mark as read", 500);
  }
  if (!query) return errorResponse('Thread not found', 404);

  const { error: upsertError } = await supabase.from('read_receipts').upsert({
    query_id: query.id,
    reader: 'user',
    last_read_at: new Date().toISOString(),
  });

  if (upsertError) {
    console.error('mark-read: upsert failed', upsertError);
    return errorResponse("Couldn't mark as read", 500);
  }

  return json({ ok: true });
});
