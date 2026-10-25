// GET /functions/v1/get-threads?revenuecat_id=...
// Returns the calling user's open and resolved threads with messages, plus
// per-thread and total unread counts (admin messages newer than the user's
// read receipt) and the language they picked.
// Auth: x-api-key header. Data is scoped to that app + revenuecat_id only.
// Rate limiting: see note in _shared/app-auth.ts.
//
// `language` is null when this user has never picked one, which is what the
// SDK keys its one-time language prompt off. It rides along here rather than
// on its own endpoint so first launch stays a single round trip.
//
// Admin display names are deliberately NOT in this payload. End users see one
// support team, not the individuals staffing the queue — and leaving the
// names out of the response entirely, rather than merely not rendering them,
// means there is nothing to find by inspecting the traffic. The dashboard
// still shows who wrote what; it reads the tables directly.

import { z } from 'npm:zod@3.23.8';
import { errorResponse, json, preflight } from '../_shared/http.ts';
import { authenticateApp, serviceClient } from '../_shared/app-auth.ts';
import { sdkVersion, typeForClient } from '../_shared/sdk.ts';

const ParamsSchema = z.object({
  revenuecat_id: z.string().trim().min(1).max(200),
});

interface MessageRow {
  id: string;
  sender: 'user' | 'admin';
  kind: 'text' | 'review_request';
  body: string;
  body_translated: string | null;
  translation_status: 'skipped' | 'pending' | 'done' | 'failed';
  created_at: string;
}

interface QueryRow {
  id: string;
  type: string;
  status: 'open' | 'resolved';
  created_at: string;
  resolved_at: string | null;
  app_version: string;
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
       messages(id, sender, kind, body, body_translated, translation_status, created_at),
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

  const { data: locale } = await supabase
    .from('user_locales')
    .select('language')
    .eq('app_id', app.id)
    .eq('revenuecat_id', parsed.data.revenuecat_id)
    .maybeSingle();

  /**
   * The rendering this user should see: their own words as they wrote them,
   * and admin replies in their language. The English original of an admin
   * reply is of no use on this side, so it never leaves the server — which
   * also keeps the payload down on a mobile connection.
   *
   * A reply whose translation failed falls back to English: showing it in the
   * wrong language beats showing nothing.
   */
  const displayBody = (m: MessageRow): string =>
    m.sender === 'admin' ? (m.body_translated ?? m.body) : m.body;

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
      // 'support' reads as feedback to builds that can't label it.
      type: typeForClient(q.type, req),
      status: q.status,
      created_at: q.created_at,
      resolved_at: q.resolved_at,
      app_version: q.app_version,
      unread_count: unread,
      last_message: lastMessage
        ? {
            body: displayBody(lastMessage),
            sender: lastMessage.sender,
            created_at: lastMessage.created_at,
          }
        : null,
      messages: q.messages.map((m) => ({
        id: m.id,
        sender: m.sender,
        body: displayBody(m),
        created_at: m.created_at,
        // Lets the SDK mark a reply as still being translated rather than
        // flashing English text that changes under the reader a second later.
        translation_pending:
          m.sender === 'admin' && m.translation_status === 'pending',
        // A review request carries a store button in 0.4+; older builds
        // ignore the field and show the text.
        kind: m.kind,
      })),
    };
  });

  // Where a review request's button points. Only builds that render the
  // button are sent it.
  let store: { app_store_id: string | null; play_store_package: string | null } | undefined;
  if (sdkVersion(req) !== null) {
    const { data: listing } = await supabase
      .from('apps')
      .select('app_store_id, play_store_package')
      .eq('id', app.id)
      .maybeSingle();
    store = {
      app_store_id: listing?.app_store_id ?? null,
      play_store_package: listing?.play_store_package ?? null,
    };
  }

  return json({
    threads,
    total_unread: totalUnread,
    store,
    // Null means "never picked one" — the SDK shows its language prompt.
    language: locale?.language ?? null,
  });
});
