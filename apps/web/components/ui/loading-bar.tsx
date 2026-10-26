import { cn } from '@/lib/utils';

/**
 * Indeterminate bar along the top edge of a region whose content is about
 * to be replaced — new filters, a new search. The parent must be
 * `relative`. Under reduced motion it holds still at full width.
 */
export function LoadingBar({ className }: { className?: string }) {
  return (
    <div
      role="progressbar"
      aria-label="Loading"
      className={cn(
        'pointer-events-none absolute inset-x-0 top-0 z-20 h-0.5 overflow-hidden',
        className,
      )}
    >
      <div className="h-full w-1/3 animate-loading-bar bg-accent motion-reduce:w-full motion-reduce:animate-none" />
    </div>
  );
}
