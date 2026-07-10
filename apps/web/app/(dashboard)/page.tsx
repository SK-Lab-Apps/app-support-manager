import { createClient } from '@/lib/supabase/server';
import { QueryDashboard } from '@/components/dashboard/query-dashboard';

export default async function AllAppsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <QueryDashboard appId={null} appName="All apps" adminId={user?.id ?? ''} />
  );
}
