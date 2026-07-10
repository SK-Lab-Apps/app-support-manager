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

/** Skeleton rows matching the query table's real dimensions. */
export function TableSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div role="status" aria-label="Loading queries">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="flex h-11 items-center gap-3 border-b border-border px-4"
        >
          <Skeleton className="h-1.5 w-1.5 rounded-full" />
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-3.5 flex-1 max-w-[420px]" />
          <Skeleton className="hidden h-3.5 w-24 md:block" />
          <Skeleton className="hidden h-3.5 w-10 md:block" />
          <Skeleton className="h-3.5 w-12" />
        </div>
      ))}
    </div>
  );
}
