import { createClient } from '@/lib/supabase/server';
import { AutomationsView } from '@/components/automations/automations-view';

export default async function AppAutomationsPage({
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

  return <AutomationsView appId={appId} appName={app?.name ?? ''} />;
}
