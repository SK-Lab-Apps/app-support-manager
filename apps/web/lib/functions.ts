import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseEnv } from '@/lib/supabase/env';

export interface FunctionResult<T> {
  ok: boolean;
  status: number;
  data: T | null;
  /** The function's own error message, when it sent one. */
  error: string | null;
}

/** Calls a staff-facing Edge Function with the signed-in admin's JWT. */
export async function callFunction<T = unknown>(
  supabase: SupabaseClient,
  name: string,
  body: unknown,
): Promise<FunctionResult<T>> {
  try {
    const { url, anonKey } = getSupabaseEnv();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) return { ok: false, status: 401, data: null, error: 'Signed out' };
    const response = await fetch(`${url}/functions/v1/${name}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: anonKey,
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify(body),
    });
    const payload: unknown = await response.json().catch(() => null);
    const error =
      payload !== null &&
      typeof payload === 'object' &&
      'error' in payload &&
      typeof (payload as { error: unknown }).error === 'string'
        ? (payload as { error: string }).error
        : null;
    return {
      ok: response.ok,
      status: response.status,
      data: response.ok ? (payload as T) : null,
      error,
    };
  } catch {
    return { ok: false, status: 0, data: null, error: null };
  }
}
