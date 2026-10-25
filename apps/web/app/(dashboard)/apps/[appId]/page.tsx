import { createClient } from '@/lib/supabase/server';
import { QueryDashboard } from '@/components/dashboard/query-dashboard';

export default async function AppInboxPage({
  params,
}: {
  params: Promise<{ appId: string }>;
}) {
  const { appId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // The layout has already checked the app exists and shows its name.
  return <QueryDashboard appId={appId} title={null} adminId={user?.id ?? ''} />;
}
