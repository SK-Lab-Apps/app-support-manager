import { AppWindow } from 'lucide-react';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { EmptyState } from '@/components/ui/empty-state';

/** Work happens per app, so the root opens the first one in the sidebar. */
export default async function HomePage() {
  const supabase = await createClient();
  const { data: app } = await supabase
    .from('apps')
    .select('id')
    .order('name')
    .limit(1)
    .maybeSingle();

  if (app) redirect(`/apps/${app.id}`);

  return <EmptyState icon={AppWindow} message="Add an app to get started" />;
}
