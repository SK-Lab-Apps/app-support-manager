import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { AppHeader } from '@/components/app-header';

export default async function AppLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ appId: string }>;
}) {
  const { appId } = await params;
  const supabase = await createClient();
  const { data: app } = await supabase
    .from('apps')
    .select('id, name')
    .eq('id', appId)
    .maybeSingle();

  if (!app) notFound();

  return (
    <div className="flex h-full min-h-0 flex-col">
      <AppHeader appId={app.id} appName={app.name} />
      <div className="min-h-0 flex-1">{children}</div>
    </div>
  );
}
