import {
  Bell,
  BellOff,
  BellRing,
  Bug,
  Languages,
  Lightbulb,
  MessageSquare,
  MessagesSquare,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { languageName } from '@/lib/languages';
import {
  QUERY_TYPE_LABEL,
  type PushSubscriptionRow,
  PLAN_LABEL,
  type QueryStatus,
  type QueryType,
  type UserPlan,
} from '@/lib/types';

/** Status dot + label. Muted colors, never a saturated pill. */
export function StatusIndicator({
  status,
  className,
}: {
  status: QueryStatus;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 text-xs',
        status === 'open' ? 'text-status-open' : 'text-status-resolved',
        className,
      )}
    >
      <span
        className={cn(
          'h-1.5 w-1.5 rounded-full',
          status === 'open' ? 'bg-status-open' : 'bg-status-resolved',
        )}
      />
      {status === 'open' ? 'Open' : 'Resolved'}
    </span>
  );
}

const typeIcon: Record<QueryType, typeof Bug> = {
  bug_report: Bug,
  feature_request: Lightbulb,
  feedback: MessageSquare,
  support: MessagesSquare,
};

const typeClasses: Record<QueryType, string> = {
  bug_report: 'text-status-danger bg-status-danger-bg',
  feature_request: 'text-status-progress bg-status-progress-bg',
  feedback: 'text-status-open bg-status-open-bg',
  support: 'text-secondary bg-surface-active',
};

/** Tinted type chip: ~10% opacity background, full-opacity text. */
export function TypeChip({
  type,
  className,
}: {
  type: QueryType;
  className?: string;
}) {
  const Icon = typeIcon[type];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-control px-1.5 py-0.5 text-2xs font-medium',
        typeClasses[type],
        className,
      )}
    >
      <Icon size={11} strokeWidth={1.5} />
      {QUERY_TYPE_LABEL[type]}
    </span>
  );
}

/**
 * Whether this user can be reached by push: never prompted, prompted and
 * declined, or granted. `subscription` is null when the SDK has never
 * reported a status for them (older client, or push not enabled in the app).
 */
export function PushStatusChip({
  subscription,
  className,
}: {
  subscription: PushSubscriptionRow | null;
  className?: string;
}) {
  const asked = subscription?.asked_at != null;
  const status = subscription?.permission_status ?? 'undetermined';

  const granted = status === 'granted';
  const denied = status === 'denied';

  const Icon = granted ? BellRing : denied ? BellOff : Bell;
  const label = granted
    ? 'Push on'
    : denied
      ? 'Push denied'
      : asked
        ? 'Push dismissed'
        : 'Push not asked';

  // A granted permission with no token means the app couldn't mint one
  // (e.g. running in Expo Go) — worth distinguishing on hover.
  const title = granted
    ? subscription?.expo_push_token
      ? 'User accepted notifications and is reachable'
      : 'User accepted notifications, but no push token was registered'
    : denied
      ? 'User was asked and declined notifications'
      : asked
        ? 'User was asked but has not chosen yet'
        : 'User has not been asked for notification permission yet';

  return (
    <span
      title={title}
      className={cn(
        'inline-flex items-center gap-1 rounded-control px-1.5 py-0.5 text-2xs font-medium',
        granted
          ? 'bg-status-resolved-bg text-status-resolved'
          : denied
            ? 'bg-status-danger-bg text-status-danger'
            : 'text-tertiary',
        className,
      )}
    >
      <Icon size={11} strokeWidth={1.5} />
      {label}
    </span>
  );
}

/**
 * The language this user writes in. Only rendered when it isn't English —
 * the overwhelming majority of threads need no chip, and a chip on every row
 * would stop meaning anything.
 */
export function LanguageChip({
  language,
  className,
}: {
  language: string;
  className?: string;
}) {
  const name = languageName(language);
  return (
    <span
      title={`User writes in ${name}; messages are shown translated`}
      className={cn(
        'inline-flex items-center gap-1 rounded-control px-1.5 py-0.5 text-2xs font-medium text-tertiary',
        className,
      )}
    >
      <Languages size={11} strokeWidth={1.5} />
      {name}
    </span>
  );
}

const planClasses: Record<UserPlan, string> = {
  // Paying users carry the accent; trials are outlined; free stays quiet.
  pro: 'border-transparent bg-accent-muted text-accent',
  trial: 'border-border text-secondary',
  free: 'border-transparent text-tertiary',
  // About to lapse: the same shapes in the warning color.
  pro_cancelled: 'border-transparent bg-status-danger-bg text-status-danger',
  trial_cancelled: 'border-border text-status-danger',
};

/** The user's plan: PRO, Trial or Free, in descending emphasis; cancelled stands out. */
export function PlanChip({
  plan,
  className,
}: {
  plan: UserPlan;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-[4px] border px-1 py-px text-[10px] font-semibold uppercase tracking-wide',
        planClasses[plan],
        className,
      )}
    >
      {PLAN_LABEL[plan]}
    </span>
  );
}
