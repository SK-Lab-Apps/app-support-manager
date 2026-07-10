'use client';

import { Inbox, LogOut, Menu, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import type { AdminProfile, AppRow } from '@/lib/types';
import { NewAppDialog } from '@/components/new-app-dialog';
import { ThemeToggle } from '@/components/theme-toggle';

function SidebarNav({
  apps,
  adminId,
  onNavigate,
}: {
  apps: AppRow[];
  adminId: string;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();

  const item = (href: string, label: string, count?: number) => {
    const active = pathname === href;
    return (
      <Link
        key={href}
        href={href}
        onClick={onNavigate}
        className={cn(
          'flex items-center justify-between rounded-control px-2 py-1.5 text-sm',
          'transition-colors duration-fast ease-out',
          active
            ? 'bg-surface-active text-primary'
            : 'text-secondary hover:bg-surface-hover hover:text-primary',
        )}
      >
        <span className="truncate">{label}</span>
        {count !== undefined && count > 0 && (
          <span className="tnum ml-2 text-xs text-tertiary">{count}</span>
        )}
      </Link>
    );
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-12 items-center gap-2 px-3">
        <div className="flex h-5 w-5 items-center justify-center rounded-[5px] border border-border bg-surface text-[10px] font-semibold">
          S
        </div>
        <span className="text-sm font-semibold tracking-heading">Support</span>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 py-2">
        <p className="px-2 pb-1 pt-2 text-2xs font-medium uppercase tracking-wide text-tertiary">
          Apps
        </p>
        <div className="flex flex-col gap-px">
          {item(
            '/',
            'All apps',
            apps.reduce((sum, a) => sum + a.open_count, 0),
          )}
          {apps.map((app) =>
            item(`/apps/${app.id}`, app.name, app.open_count),
          )}
        </div>
        {apps.length === 0 && (
          <div className="flex flex-col items-center gap-1.5 px-2 py-8 text-center">
            <Inbox size={16} strokeWidth={1.5} className="text-tertiary" />
            <p className="text-xs text-secondary">No apps registered</p>
          </div>
        )}
      </nav>

      <div className="border-t border-border p-2">
        <NewAppDialog adminId={adminId} />
      </div>
    </div>
  );
}

export function AppShell({
  apps,
  admin,
  children,
}: {
  apps: AppRow[];
  admin: AdminProfile;
  children: ReactNode;
}) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const pathname = usePathname();

  // Close the mobile drawer on navigation and on Escape.
  useEffect(() => setDrawerOpen(false), [pathname]);
  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDrawerOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [drawerOpen]);

  async function signOut() {
    await createClient().auth.signOut();
    window.location.assign('/login');
  }

  return (
    <div className="flex h-dvh overflow-hidden">
      {/* Desktop sidebar */}
      <aside className="hidden w-56 shrink-0 border-r border-border md:block">
        <SidebarNav apps={apps} adminId={admin.id} />
      </aside>

      {/* Mobile drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setDrawerOpen(false)}
            aria-hidden
          />
          <div className="absolute inset-y-0 left-0 w-64 border-r border-border bg-overlay shadow-overlay">
            <button
              onClick={() => setDrawerOpen(false)}
              aria-label="Close menu"
              className="absolute right-2 top-3 rounded-control p-1.5 text-secondary hover:bg-surface-hover hover:text-primary"
            >
              <X size={15} strokeWidth={1.5} />
            </button>
            <SidebarNav
              apps={apps}
              adminId={admin.id}
              onNavigate={() => setDrawerOpen(false)}
            />
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-12 shrink-0 items-center justify-between border-b border-border px-3 md:px-4">
          <button
            onClick={() => setDrawerOpen(true)}
            aria-label="Open menu"
            className="rounded-control p-1.5 text-secondary hover:bg-surface-hover hover:text-primary md:hidden"
          >
            <Menu size={15} strokeWidth={1.5} />
          </button>
          <div className="hidden md:block" />
          <div className="flex items-center gap-1">
            <ThemeToggle />
            <span className="ml-1 hidden text-sm text-secondary sm:block">
              {admin.display_name}
            </span>
            <button
              onClick={signOut}
              aria-label="Sign out"
              title="Sign out"
              className="rounded-control p-1.5 text-secondary transition-colors duration-fast hover:bg-surface-hover hover:text-primary"
            >
              <LogOut size={15} strokeWidth={1.5} />
            </button>
          </div>
        </header>
        <main className="min-h-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
