import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

/** Small muted icon, one line of text, optional action. No illustrations. */
export function EmptyState({
  icon: Icon,
  message,
  action,
}: {
  icon: LucideIcon;
  message: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-16">
      <Icon size={18} strokeWidth={1.5} className="text-tertiary" />
      <p className="text-sm text-secondary">{message}</p>
      {action}
    </div>
  );
}
