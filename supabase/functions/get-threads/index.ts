// GET /functions/v1/get-threads?revenuecat_id=...
// Returns the calling user's open and resolved threads with messages, plus
// per-thread and total unread counts (admin messages newer than the user's
// read receipt).
// Auth: x-api-key header. Data is scoped to that app + revenuecat_id only.
// Rate limiting: see note in _shared/app-auth.ts.

import { z } from 'npm:zod@3.23.8';
import { errorResponse, json, preflight } from '../_shared/http.ts';
import { authenticateApp, serviceClient } from '../_shared/app-auth.ts';

const ParamsSchema = z.object({
  revenuecat_id: z.string().trim().min(1).max(200),
});

interface MessageRow {
  id: string;
  sender: 'user' | 'admin';
  body: string;
  created_at: string;
  admins: { display_name: string } | null;
}

interface QueryRow {
  id: string;
  type: string;
  status: 'open' | 'resolved';
  created_at: string;
  resolved_at: string | null;
  app_version: string;
  resolved_admin: { display_name: string } | null;
  messages: MessageRow[];
  read_receipts: { reader: 'user' | 'admin'; last_read_at: string }[];
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

  const { data, error } = await supabase
    .from('queries')
    .select(
      `id, type, status, created_at, resolved_at, app_version,
       resolved_admin:admins!queries_resolved_by_fkey(display_name),
       messages(id, sender, body, created_at, admins(display_name)),
       read_receipts(reader, last_read_at)`,
    )
    .eq('app_id', app.id)
    .eq('revenuecat_id', parsed.data.revenuecat_id)
    .order('created_at', { ascending: false })
    .order('created_at', { referencedTable: 'messages', ascending: true });

  if (error) {
    console.error('get-threads: select failed', error);
    return errorResponse("Couldn't load threads", 500);
  }

  let totalUnread = 0;
  const threads = ((data ?? []) as unknown as QueryRow[]).map((q) => {
    const userReceipt = q.read_receipts.find((r) => r.reader === 'user');
    const lastReadAt = userReceipt ? Date.parse(userReceipt.last_read_at) : 0;
    const unread = q.messages.filter(
      (m) => m.sender === 'admin' && Date.parse(m.created_at) > lastReadAt,
    ).length;
    totalUnread += unread;

    const lastMessage = q.messages[q.messages.length - 1] ?? null;
    return {
      id: q.id,
      type: q.type,
      status: q.status,
      created_at: q.created_at,
      resolved_at: q.resolved_at,
      resolved_by_name: q.resolved_admin?.display_name ?? null,
      app_version: q.app_version,
      unread_count: unread,
      last_message: lastMessage
        ? { body: lastMessage.body, sender: lastMessage.sender, created_at: lastMessage.created_at }
        : null,
      messages: q.messages.map((m) => ({
        id: m.id,
        sender: m.sender,
        body: m.body,
        created_at: m.created_at,
        admin_name: m.admins?.display_name ?? null,
      })),
    };
  });

  return json({ threads, total_unread: totalUnread });
});
