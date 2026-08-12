import type { Translator } from './i18n';

// Dates and times follow the language the user picked, not the device's:
// a sheet that says "Traduction…" above "2 days ago" reads as broken.

/** "2h ago" relative time — mirrors the web dashboard's formatting. */
export function relativeTime(iso: string, strings: Translator): string {
  const then = new Date(iso).getTime();
  const seconds = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (seconds < 60) return strings.t('time.justNow');
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return strings.t('time.minutes', { count: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return strings.t('time.hours', { count: hours });
  const days = Math.floor(hours / 24);
  if (days < 7) return strings.t('time.days', { count: days });
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return strings.t('time.weeks', { count: weeks });
  const months = Math.floor(days / 30);
  if (months < 12) return strings.t('time.months', { count: months });
  return strings.t('time.years', { count: Math.floor(days / 365) });
}

export function formatDate(iso: string, strings: Translator): string {
  return new Date(iso).toLocaleDateString(strings.locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/** "14:32" in the user's locale — shown under a group of messages. */
export function formatTime(iso: string, strings: Translator): string {
  return new Date(iso).toLocaleTimeString(strings.locale, {
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function isSameDay(a: string, b: string): boolean {
  const first = new Date(a);
  const second = new Date(b);
  return (
    first.getFullYear() === second.getFullYear() &&
    first.getMonth() === second.getMonth() &&
    first.getDate() === second.getDate()
  );
}

/** Date separator label: Today / Yesterday / "Mon, 5 Jan". */
export function dayLabel(iso: string, strings: Translator): string {
  const now = new Date();
  if (isSameDay(iso, now.toISOString())) return strings.t('time.today');
  const yesterday = new Date(now.getTime() - 86_400_000);
  if (isSameDay(iso, yesterday.toISOString())) return strings.t('time.yesterday');
  const date = new Date(iso);
  return date.toLocaleDateString(strings.locale, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    ...(date.getFullYear() === now.getFullYear() ? {} : { year: 'numeric' }),
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
