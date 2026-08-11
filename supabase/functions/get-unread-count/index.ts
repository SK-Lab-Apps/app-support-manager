// GET /functions/v1/get-unread-count?revenuecat_id=...
// Returns ONLY the unread total for the badge — the cheap endpoint the SDK
// polls while idle, instead of re-fetching every thread and message.
// Auth: x-api-key header. Scoped to that app + revenuecat_id.

import { z } from 'npm:zod@3.23.8';
import { errorResponse, json, preflight } from '../_shared/http.ts';
import { authenticateApp, serviceClient } from '../_shared/app-auth.ts';

const ParamsSchema = z.object({
  revenuecat_id: z.string().trim().min(1).max(200),
});

interface CountRow {
  messages: { created_at: string; sender: string }[];
  read_receipts: { reader: string; last_read_at: string }[];
}

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== 'GET') return errorResponse('Method not allowed', 405);

  const url = new URL(req.url);
  const parsed = ParamsSchema.safeParse({
    revenuecat_id: url.searchParams.get('revenuecat_id') ?? '',
  });
  if (!parsed.success) return errorResponse('revenuecat_id is required', 422);

  const supabase = serviceClient();
  const app = await authenticateApp(req, supabase);
  if (!app) return errorResponse('Invalid API key', 401);

  // Only the columns needed to count unread admin messages.
  const { data, error } = await supabase
    .from('queries')
    .select(
      `messages(created_at, sender),
       read_receipts(reader, last_read_at)`,
    )
    .eq('app_id', app.id)
    .eq('revenuecat_id', parsed.data.revenuecat_id);

  if (error) {
    console.error('get-unread-count: select failed', error);
    return errorResponse("Couldn't load unread count", 500);
  }

  let totalUnread = 0;
  for (const q of (data ?? []) as unknown as CountRow[]) {
    const receipt = q.read_receipts.find((r) => r.reader === 'user');
    const lastReadAt = receipt ? Date.parse(receipt.last_read_at) : 0;
    totalUnread += q.messages.filter(
      (m) => m.sender === 'admin' && Date.parse(m.created_at) > lastReadAt,
    ).length;
  }

  return json({ total_unread: totalUnread });
});
