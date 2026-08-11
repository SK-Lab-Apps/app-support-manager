'use client';

// Radix dialog restyled with the design tokens: overlay surface, 1px border,
// shadow reserved for this overlay layer, 150ms opacity/transform only.

import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { forwardRef } from 'react';
import { cn } from '@/lib/utils';

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;
export const DialogTitle = DialogPrimitive.Title;
export const DialogDescription = DialogPrimitive.Description;

export const DialogContent = forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(function DialogContent({ className, children, ...props }, ref) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay
        className={cn(
          'fixed inset-0 z-50 bg-black/50',
          'transition-opacity duration-base ease-out',
        )}
      />
      <DialogPrimitive.Content
        ref={ref}
        className={cn(
          'fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2',
          // Never edge-to-edge on a phone, never taller than the viewport.
          'w-[calc(100vw-1.5rem)] max-w-md sm:w-full',
          'max-h-[calc(100dvh-2rem)] overflow-y-auto overscroll-contain',
          'rounded-card-lg border border-border bg-overlay p-4 shadow-overlay sm:p-5',
          'duration-base ease-out',
          className,
        )}
        {...props}
      >
        {children}
        <DialogPrimitive.Close
          className={cn(
            'absolute right-3.5 top-3.5 rounded-control p-1 text-tertiary',
            'transition-colors duration-fast hover:bg-surface-hover hover:text-primary',
            'coarse:right-2 coarse:top-2 coarse:p-2.5',
          )}
          aria-label="Close"
        >
          <X size={14} strokeWidth={1.5} />
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
});
