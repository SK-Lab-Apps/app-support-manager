import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

/**
 * Square icon-only control. Compact for a mouse, 44px for a finger — the
 * breakpoint is the pointer, not the viewport, so a large touchscreen gets
 * the same reach as a phone.
 */
export const IconButton = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement>
>(function IconButton({ className, type = 'button', ...props }, ref) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-control',
        'text-secondary transition-colors duration-fast ease-out',
        'hover:bg-surface-hover hover:text-primary',
        'disabled:pointer-events-none disabled:opacity-50',
        'coarse:h-[44px] coarse:w-[44px]',
        className,
      )}
      {...props}
    />
  );
});
