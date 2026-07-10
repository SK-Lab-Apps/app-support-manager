import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import type { AdminProfile, AppRow } from '@/lib/types';
import { AppShell } from '@/components/app-shell';

export default async function DashboardLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: admin, error: adminError } = await supabase
    .from('admins')
    .select('id, username, display_name')
    .eq('id', user.id)
    .maybeSingle();

  // A failed lookup (permissions, connectivity) is a config problem — surface
  // it loudly instead of silently signing the user out.
  if (adminError) {
    throw new Error(`Couldn't load admin profile: ${adminError.message}`);
  }

  // Authenticated but not an admin — nothing here for them.
  if (!admin) {
    await supabase.auth.signOut();
    redirect('/login');
  }

  const [{ data: apps }, { data: openQueries }] = await Promise.all([
    supabase.from('apps').select('id, name, created_at').order('name'),
    supabase.from('queries').select('app_id').eq('status', 'open'),
  ]);

  const openCounts = new Map<string, number>();
  for (const q of openQueries ?? []) {
    openCounts.set(q.app_id, (openCounts.get(q.app_id) ?? 0) + 1);
  }

  const appRows: AppRow[] = (apps ?? []).map((a) => ({
    ...a,
    open_count: openCounts.get(a.id) ?? 0,
  }));

  return (
    <AppShell apps={appRows} admin={admin as AdminProfile}>
      {children}
    </AppShell>
  );
}
