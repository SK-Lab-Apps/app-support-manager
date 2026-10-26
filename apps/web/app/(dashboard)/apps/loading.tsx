import { AppHeaderSkeleton } from '@/components/app-header';
import { InboxSkeleton } from '@/components/dashboard/query-dashboard';

/** Switching apps: the header and inbox hold their shape until the app arrives. */
export default function AppLoading() {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <AppHeaderSkeleton />
      <div className="min-h-0 flex-1">
        <InboxSkeleton />
      </div>
    </div>
  );
}
