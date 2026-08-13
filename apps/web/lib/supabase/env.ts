/**
 * Supabase connection config. Validated lazily (at first use, not at module
 * load) so `next build` succeeds before env vars are configured.
 *
 * Note: NEXT_PUBLIC_* values are inlined into client bundles at build time —
 * set them in apps/web/.env.local before building.
 */
export function getSupabaseEnv(): { url: string; anonKey: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error(
      'Missing Supabase config: set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in apps/web/.env.local (template: apps/web/env.example).',
    );
  }
  return { url, anonKey };
}
