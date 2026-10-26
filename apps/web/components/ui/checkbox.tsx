import { forwardRef, type InputHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

/** Native checkbox in the accent, sized up for a finger. */
export const Checkbox = forwardRef<
  HTMLInputElement,
  Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>
>(function Checkbox({ className, ...props }, ref) {
  return (
    <input
      ref={ref}
      type="checkbox"
      className={cn(
        'h-3.5 w-3.5 shrink-0 cursor-pointer accent-[var(--color-accent)] coarse:h-5 coarse:w-5',
        className,
      )}
      {...props}
    />
  );
});
