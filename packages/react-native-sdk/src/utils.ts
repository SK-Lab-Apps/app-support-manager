/** "2h ago" relative time — mirrors the web dashboard's formatting. */
export function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const seconds = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/** Dev-mode prop validation with actionable messages. */
export function validateProps(props: {
  appName?: unknown;
  apiKey?: unknown;
  supabaseUrl?: unknown;
  user?: unknown;
}): string | null {
  if (typeof props.appName !== 'string' || props.appName.length === 0) {
    return 'SupportButton: `appName` is required — the app name registered in the admin dashboard.';
  }
  if (typeof props.apiKey !== 'string' || props.apiKey.length === 0) {
    return 'SupportButton: `apiKey` is required — the key shown once when the app was registered.';
  }
  if (
    typeof props.supabaseUrl !== 'string' ||
    !/^https?:\/\//.test(props.supabaseUrl)
  ) {
    return 'SupportButton: `supabaseUrl` is required — your Supabase project URL, e.g. "https://abcd1234.supabase.co".';
  }
  const user = props.user as Record<string, unknown> | undefined;
  if (!user || typeof user !== 'object') {
    return 'SupportButton: `user` is required — { name, isPaid, revenuecatId, appVersion }.';
  }
  if (typeof user.name !== 'string' || user.name.length === 0) {
    return 'SupportButton: `user.name` is required (string).';
  }
  if (typeof user.isPaid !== 'boolean') {
    return 'SupportButton: `user.isPaid` is required (boolean).';
  }
  if (typeof user.revenuecatId !== 'string' || user.revenuecatId.length === 0) {
    return 'SupportButton: `user.revenuecatId` is required (string) — the RevenueCat app user id.';
  }
  if (typeof user.appVersion !== 'string' || user.appVersion.length === 0) {
    return 'SupportButton: `user.appVersion` is required (string), e.g. "2.4.1".';
  }
  return null;
}
