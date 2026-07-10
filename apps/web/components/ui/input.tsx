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
        className,
      )}
      {...props}
    />
  );
});
