import { TableSkeleton } from '@/components/ui/skeleton';

/** What the Automations tab shows while it fetches, so the hand-off is seamless. */
export default function AutomationsLoading() {
  return <TableSkeleton rows={5} />;
}
