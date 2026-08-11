// POST /functions/v1/send-push
// Notifies the end user that an admin replied on one of their threads.
// Called by the dashboard right after an admin message is inserted.
//
// Auth: admin Supabase JWT (NOT the per-app API key) — this is the one
// end-user-adjacent function that only staff may call. Membership in
// public.admins is verified before anything is sent.
//
// Delivery is best-effort by design: a missing token, a denied permission,
// or an Expo outage must never affect the admin's reply, which is already
// committed by the time this runs.

import { z } from 'npm:zod@3.23.8';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { errorResponse, json, preflight } from '../_shared/http.ts';
import { serviceClient } from '../_shared/app-auth.ts';

const EXPO_PUSH_ENDPOINT = 'https://exp.host/--/api/v2/push/send';

const BodySchema = z.object({
  query_id: z.string().uuid(),
});

const TYPE_LABEL: Record<string, string> = {
  feedback: 'your feedback',
  feature_request: 'your feature request',
  bug_report: 'your bug report',
};

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return errorResponse('Unauthorized', 401);

  // Verify the caller is a seeded admin, using their own JWT (RLS applies).
  const callerClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } },
  );
  const {
    data: { user },
  } = await callerClient.auth.getUser();
  if (!user) return errorResponse('Unauthorized', 401);

  const { data: admin } = await callerClient
    .from('admins')
    .select('id, display_name')
    .eq('id', user.id)
    .maybeSingle();
  if (!admin) return errorResponse('Forbidden', 403);

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return errorResponse('Invalid JSON body', 400);
  }
  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) return errorResponse('query_id is required', 422);

  const supabase = serviceClient();

  const { data: query, error: queryError } = await supabase
    .from('queries')
    .select('id, app_id, revenuecat_id, type, apps(name)')
    .eq('id', parsed.data.query_id)
    .maybeSingle();

  if (queryError || !query) return errorResponse('Thread not found', 404);

  const { data: subscription } = await supabase
    .from('push_subscriptions')
    .select('permission_status, expo_push_token')
    .eq('app_id', query.app_id)
    .eq('revenuecat_id', query.revenuecat_id)
    .maybeSingle();

  // Not an error: the user may have declined, or never been prompted.
  if (
    !subscription ||
    subscription.permission_status !== 'granted' ||
    !subscription.expo_push_token
  ) {
    return json({
      sent: false,
      reason: subscription?.permission_status ?? 'unregistered',
    });
  }

  const appName =
    (query.apps as unknown as { name: string } | null)?.name ?? 'Support';
  const subject = TYPE_LABEL[query.type as string] ?? 'your message';

  try {
    const response = await fetch(EXPO_PUSH_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        to: subscription.expo_push_token,
        title: appName,
        body: `${admin.display_name} replied to ${subject}`,
        sound: 'default',
        // Lets the host app deep-link straight into the thread.
        data: { query_id: query.id, type: 'support_reply' },
      }),
    });

    const result = await response.json();
    const ticket = result?.data;
    if (ticket?.status === 'error') {
      console.error('send-push: expo rejected', ticket);
      return json({ sent: false, reason: ticket.message ?? 'expo_error' });
    }
    return json({ sent: true });
  } catch (e) {
    console.error('send-push: delivery failed', e);
    return json({ sent: false, reason: 'delivery_failed' });
  }
});
