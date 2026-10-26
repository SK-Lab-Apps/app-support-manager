import { cn } from '@/lib/utils';

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'animate-pulse rounded-control bg-surface-active',
        className,
      )}
    />
  );
}

/**
 * A view's search-and-filters toolbar while its route loads — the same band
 * height as the real one, so nothing shifts when it arrives.
 */
export function ToolbarSkeleton({
  filters,
  searchEnd = false,
}: {
  filters: number;
  /** The inbox keeps search at the right from sm up. */
  searchEnd?: boolean;
}) {
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border px-3 py-2 md:px-4">
      <Skeleton
        className={cn('h-7 w-full sm:w-56 coarse:h-[38px]', searchEnd && 'sm:ml-auto')}
      />
      <div className="flex w-full gap-2 overflow-hidden sm:w-auto">
        {Array.from({ length: filters }).map((_, i) => (
          <Skeleton key={i} className="h-7 w-[88px] shrink-0 coarse:h-[38px]" />
        ))}
      </div>
    </div>
  );
}

/**
 * Placeholder rows matching the query list's real dimensions — the table's
 * columns from sm up, the card stack below it.
 */
export function TableSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div role="status" aria-label="Loading queries">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i}>
          <div className="hidden h-11 items-center gap-3 border-b border-border px-3 sm:flex md:px-4">
            <Skeleton className="h-1.5 w-1.5 shrink-0 rounded-full" />
            <Skeleton className="h-4 w-[72px] shrink-0" />
            <Skeleton className="h-3.5 min-w-0 flex-1 max-w-[420px]" />
            <Skeleton className="hidden h-3.5 w-[140px] shrink-0 lg:block" />
            <Skeleton className="hidden h-3.5 w-14 shrink-0 md:block" />
            <Skeleton className="h-3.5 w-8 shrink-0" />
            <Skeleton className="h-3.5 w-16 shrink-0" />
          </div>
          <div className="flex flex-col gap-1.5 border-b border-border px-3 py-3 sm:hidden">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-3.5 w-full" />
            <Skeleton className="h-3.5 w-1/3" />
          </div>
        </div>
      ))}
    </div>
  );
}
