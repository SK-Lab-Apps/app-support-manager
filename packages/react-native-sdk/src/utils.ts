import type { Translator } from './i18n';
import type { SupportUser, UserPlan } from './types';

// Dates and times follow the language the user picked, not the device's:
// a sheet that says "Traduction…" above "2 days ago" reads as broken.

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

const PLANS: UserPlan[] = ['free', 'trial', 'pro'];

/** The user's plan, reading the deprecated `isPaid` when `plan` is absent. */
export function userPlan(user: SupportUser): UserPlan {
  return user.plan ?? (user.isPaid ? 'pro' : 'free');
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
    return 'SupportButton: `user` is required — { name, plan, revenuecatId, appVersion }.';
  }
  if (typeof user.name !== 'string' || user.name.length === 0) {
    return 'SupportButton: `user.name` is required (string).';
  }
  if (user.plan !== undefined && !PLANS.includes(user.plan as UserPlan)) {
    return 'SupportButton: `user.plan` must be "free", "trial" or "pro".';
  }
  if (user.plan === undefined && typeof user.isPaid !== 'boolean') {
    return 'SupportButton: `user.plan` is required — "free", "trial" or "pro".';
  }
  if (typeof user.revenuecatId !== 'string' || user.revenuecatId.length === 0) {
    return 'SupportButton: `user.revenuecatId` is required (string) — the RevenueCat app user id.';
  }
  if (typeof user.appVersion !== 'string' || user.appVersion.length === 0) {
    return 'SupportButton: `user.appVersion` is required (string), e.g. "2.4.1".';
  }
  return null;
}
