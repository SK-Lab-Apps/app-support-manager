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
