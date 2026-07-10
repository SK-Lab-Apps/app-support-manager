import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

const variantClasses: Record<Variant, string> = {
  primary:
    'bg-accent text-accent-fg hover:bg-accent-hover border border-transparent',
  secondary:
    'bg-surface text-primary border border-border hover:bg-surface-hover hover:border-border-strong',
  ghost: 'bg-transparent text-secondary hover:text-primary hover:bg-surface-hover border border-transparent',
  danger:
    'bg-transparent text-status-danger border border-border hover:bg-status-danger-bg hover:border-border-strong',
};

const sizeClasses: Record<Size, string> = {
  sm: 'h-7 px-2.5 text-xs gap-1.5',
  md: 'h-8 px-3 text-sm gap-2',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button({ className, variant = 'secondary', size = 'md', ...props }, ref) {
    return (
      <button
        ref={ref}
        className={cn(
          'inline-flex items-center justify-center rounded-control font-medium',
          'transition-colors duration-fast ease-out',
          'disabled:opacity-50 disabled:pointer-events-none',
          variantClasses[variant],
          sizeClasses[size],
          className,
        )}
        {...props}
      />
    );
  },
);
