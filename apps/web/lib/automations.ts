// Automated messages: one per app per event, sent a set delay after it.
// The subscription events and their rules live in
// supabase/functions/revenuecat-webhook/index.ts; review_eligible is
// queued by the database (see the review_eligible migration). Keep the
// labels here in step with what they schedule.

import { REVIEW_ELIGIBLE_DAYS } from '@/lib/review';
import type { AutomationEvent } from '@/lib/types';

export const AUTOMATION_EVENTS: {
  event: AutomationEvent;
  label: string;
  description: string;
}[] = [
  {
    event: 'trial_started',
    label: 'Trial started',
    description: 'A user starts a free trial.',
  },
  {
    event: 'pro_started',
    label: 'Pro purchased',
    description: 'A user subscribes without a trial.',
  },
  {
    event: 'trial_converted',
    label: 'Trial converted',
    description: 'A trial turns into a paid subscription.',
  },
  {
    event: 'trial_cancelled',
    label: 'Trial cancelled',
    description:
      'A user turns off auto-renew during their trial. They keep access until it ends.',
  },
  {
    event: 'pro_cancelled',
    label: 'Pro cancelled',
    description:
      'A subscriber turns off auto-renew. They keep access until the period ends.',
  },
  {
    event: 'review_eligible',
    label: 'Review eligible',
    description: `A PRO user, not cancelled, passes ${REVIEW_ELIGIBLE_DAYS} days on PRO. Sent as a review request, with a store button, to users who weren't asked before.`,
  },
];

/** Sent as a review request rather than plain text. */
export function isReviewAutomation(event: AutomationEvent | null): boolean {
  return event === 'review_eligible';
}

export function automationLabel(event: AutomationEvent): string {
  return AUTOMATION_EVENTS.find((e) => e.event === event)?.label ?? event;
}

/** Matches automations' check. */
export const AUTOMATION_MAX = 1000;
export const DEFAULT_DELAY_MINUTES = 60;

/** The delays offered, in minutes. */
export const DELAY_OPTIONS = [15, 30, 60, 90, 120, 180, 360, 720, 1440];

/** "15 min", "1 hour", "1.5 hours", "1 day". */
export function formatDelay(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  if (minutes % 1440 === 0) {
    const days = minutes / 1440;
    return days === 1 ? '1 day' : `${days} days`;
  }
  const hours = minutes / 60;
  return hours === 1 ? '1 hour' : `${Number(hours.toFixed(2))} hours`;
}
