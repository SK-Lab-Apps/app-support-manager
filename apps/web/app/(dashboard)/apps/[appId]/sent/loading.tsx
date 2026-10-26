import { TableSkeleton } from '@/components/ui/skeleton';

/** What the Sent tab shows while it fetches, so the hand-off is seamless. */
export default function SentLoading() {
  return <TableSkeleton rows={5} />;
}
