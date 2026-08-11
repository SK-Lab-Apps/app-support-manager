import { forwardRef, type InputHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export const Input = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement>
>(function Input({ className, ...props }, ref) {
  return (
    <input
      ref={ref}
      className={cn(
        'h-8 w-full rounded-control border border-border bg-surface px-2.5 text-sm text-primary',
        'placeholder:text-tertiary',
        'transition-colors duration-fast ease-out',
        'hover:border-border-strong focus:border-border-strong',
        // Explicit px: the 14px root makes rem heights land ~12% short of the
        // 44px target. 16px text is the threshold below which iOS Safari zooms.
        'coarse:h-[44px] coarse:text-input',
        className,
      )}
      {...props}
    />
  );
});
