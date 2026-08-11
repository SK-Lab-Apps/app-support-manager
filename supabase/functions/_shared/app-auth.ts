// Per-app API key validation shared by every end-user-facing function.
//
// The SDK sends the raw key in `x-api-key`. We hash it (SHA-256) and match
// against apps.api_key_hash — raw keys are never stored server-side. The
// caller must also send the app_name it believes it is talking to; a
// mismatch between the key's app and the claimed name is rejected, so a key
// leaked from one app cannot be replayed against another app's name.
//
// Rate limiting: the write endpoints (submit-query, post-message) enforce
// per-user and per-app fixed windows via _shared/rate-limit.ts (Postgres
// counters, so limits hold across function instances). The read endpoints
// are cheap indexed lookups and are left unlimited in v1.

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

export interface AuthedApp {
  id: string;
  name: string;
}

export function serviceClient(): SupabaseClient {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    // Service role bypasses RLS — these functions are the only path by which
    // end users touch the database, and every access below is scoped to the
    // authenticated app + revenuecat_id.
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  );
}

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(input),
  );
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Validates the x-api-key header (and, when provided, the claimed app name).
 * Returns the app row or null if the key is invalid.
 */
export async function authenticateApp(
  req: Request,
  supabase: SupabaseClient,
  claimedAppName?: string,
): Promise<AuthedApp | null> {
  const apiKey = req.headers.get('x-api-key');
  if (!apiKey) return null;

  const hash = await sha256Hex(apiKey);
  const { data, error } = await supabase
    .from('apps')
    .select('id, name')
    .eq('api_key_hash', hash)
    .maybeSingle();

  if (error || !data) return null;
  if (claimedAppName !== undefined && data.name !== claimedAppName) return null;
  return data as AuthedApp;
}
