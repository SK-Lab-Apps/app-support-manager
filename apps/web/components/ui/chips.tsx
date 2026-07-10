import { Bug, Lightbulb, MessageSquare } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  QUERY_TYPE_LABEL,
  type QueryStatus,
  type QueryType,
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
};

const typeClasses: Record<QueryType, string> = {
  bug_report: 'text-status-danger bg-status-danger-bg',
  feature_request: 'text-status-progress bg-status-progress-bg',
  feedback: 'text-status-open bg-status-open-bg',
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

/** Subtle paid indicator. */
export function PaidTag({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-[4px] border border-border px-1 py-px text-[10px] font-semibold tracking-wide text-secondary',
        className,
      )}
    >
      PRO
    </span>
  );
}
