import { createClient } from '@/lib/supabase/server';
import { UsersView } from '@/components/users/users-view';

export default async function AppUsersPage({
  params,
}: {
  params: Promise<{ appId: string }>;
}) {
  const { appId } = await params;
  const supabase = await createClient();
  const { data: app } = await supabase
    .from('apps')
    .select('name')
    .eq('id', appId)
    .maybeSingle();

  return <UsersView appId={appId} appName={app?.name ?? ''} />;
}
