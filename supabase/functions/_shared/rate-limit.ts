// Fixed-window rate limiting backed by the check_rate_limit RPC
// (see migration 20260709000006). Globally accurate across function
// instances because the counter lives in Postgres.

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from './http.ts';

export interface RateLimitCheck {
  key: string;
  limit: number;
  windowSeconds: number;
}

/**
 * Runs the given checks in order. Returns a 429 Response if any limit is
 * exceeded, or null if the request may proceed.
 *
 * Fails OPEN on limiter errors: an outage in the rate limiter must degrade
 * to "support works without protection", never "support is down".
 */
export async function enforceRateLimit(
  supabase: SupabaseClient,
  checks: RateLimitCheck[],
): Promise<Response | null> {
  for (const check of checks) {
    const { data, error } = await supabase
      .rpc('check_rate_limit', {
        p_key: check.key,
        p_limit: check.limit,
        p_window_seconds: check.windowSeconds,
      })
      .single();

    if (error || !data) {
      console.error('rate-limit: check failed, allowing request', error);
      continue;
    }

    const result = data as { allowed: boolean; retry_after_seconds: number };
    if (!result.allowed) {
      return new Response(
        JSON.stringify({
          error: 'Too many requests — try again later',
          retry_after: result.retry_after_seconds,
        }),
        {
          status: 429,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
            'Retry-After': String(result.retry_after_seconds),
          },
        },
      );
    }
  }
  return null;
}

/** Per-user and per-app limits for the write endpoints (per hour). */
export const LIMITS = {
  submitPerUser: 5,
  messagesPerUser: 30,
  writesPerApp: 500,
  windowSeconds: 3600,
} as const;
