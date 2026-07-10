import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { QueryDashboard } from '@/components/dashboard/query-dashboard';

export default async function AppPage({
  params,
}: {
  params: Promise<{ appId: string }>;
}) {
  const { appId } = await params;
  const supabase = await createClient();

  const [{ data: app }, userResult] = await Promise.all([
    supabase.from('apps').select('id, name').eq('id', appId).maybeSingle(),
    supabase.auth.getUser(),
  ]);

  if (!app) notFound();

  return (
    <QueryDashboard
      appId={app.id}
      appName={app.name}
      adminId={userResult.data.user?.id ?? ''}
    />
  );
}
