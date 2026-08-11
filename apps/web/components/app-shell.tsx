'use client';

import { Inbox, LogOut, Menu, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import type { AdminProfile, AppRow } from '@/lib/types';
import { NewAppDialog } from '@/components/new-app-dialog';
import { ThemeToggle } from '@/components/theme-toggle';
import { IconButton } from '@/components/ui/icon-button';

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
          'coarse:min-h-[44px]',
          active
            ? 'bg-surface-active text-primary'
            : 'text-secondary hover:bg-surface-hover hover:text-primary',
        )}
      >
        <span className="truncate">{label}</span>
        {count !== undefined && count > 0 && (
          <span className="tnum ml-2 shrink-0 text-xs text-tertiary">
            {count}
          </span>
        )}
      </Link>
    );
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-12 shrink-0 items-center gap-2 px-3 coarse:h-14">
        <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-[5px] border border-border bg-surface text-[10px] font-semibold">
          S
        </div>
        <span className="truncate text-sm font-semibold tracking-heading">
          Support
        </span>
      </div>

      <nav className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 py-2">
        <p className="px-2 pb-1 pt-2 text-2xs font-medium uppercase tracking-wide text-tertiary">
          Apps
        </p>
        <div className="flex flex-col gap-px">
          {item(
            '/',
            'All apps',
            apps.reduce((sum, a) => sum + a.open_count, 0),
          )}
          {apps.map((app) => item(`/apps/${app.id}`, app.name, app.open_count))}
        </div>
        {apps.length === 0 && (
          <div className="flex flex-col items-center gap-1.5 px-2 py-8 text-center">
            <Inbox size={16} strokeWidth={1.5} className="text-tertiary" />
            <p className="text-xs text-secondary">No apps registered</p>
          </div>
        )}
      </nav>

      <div className="shrink-0 border-t border-border p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
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
  const drawerRef = useRef<HTMLDivElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  // Close the mobile drawer on navigation.
  useEffect(() => setDrawerOpen(false), [pathname]);

  // While the drawer is open: lock the page behind it, close on Escape, and
  // keep focus inside it so a screen reader doesn't wander into the list.
  useEffect(() => {
    if (!drawerOpen) return;

    const { body } = document;
    const previousOverflow = body.style.overflow;
    const trigger = menuButtonRef.current;
    body.style.overflow = 'hidden';
    drawerRef.current?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDrawerOpen(false);
    };
    window.addEventListener('keydown', onKey);

    return () => {
      body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKey);
      trigger?.focus();
    };
  }, [drawerOpen]);

  async function signOut() {
    await createClient().auth.signOut();
    window.location.assign('/login');
  }

  return (
    <div className="flex h-dvh overflow-hidden pl-safe-l pr-safe-r pt-safe-t">
      {/* Desktop sidebar — widens with the viewport so app names stop truncating. */}
      <aside className="hidden w-52 shrink-0 border-r border-border md:block lg:w-56 xl:w-64">
        <SidebarNav apps={apps} adminId={admin.id} />
      </aside>

      {/* Mobile drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div
            className="absolute inset-0 animate-fade-in bg-black/50"
            onClick={() => setDrawerOpen(false)}
            aria-hidden
          />
          <div
            ref={drawerRef}
            role="dialog"
            aria-modal="true"
            aria-label="Navigation"
            tabIndex={-1}
            className={cn(
              'absolute inset-y-0 left-0 w-[min(17rem,82vw)] outline-none',
              'animate-slide-in-left border-r border-border bg-overlay shadow-overlay',
              'pl-safe-l pt-safe-t',
            )}
          >
            <IconButton
              onClick={() => setDrawerOpen(false)}
              aria-label="Close menu"
              className="absolute right-2 top-2 z-10 coarse:right-1 coarse:top-1"
            >
              <X size={15} strokeWidth={1.5} />
            </IconButton>
            <SidebarNav
              apps={apps}
              adminId={admin.id}
              onNavigate={() => setDrawerOpen(false)}
            />
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-12 shrink-0 items-center justify-between gap-2 border-b border-border px-2 coarse:h-14 md:px-3">
          <IconButton
            ref={menuButtonRef}
            onClick={() => setDrawerOpen(true)}
            aria-label="Open menu"
            aria-expanded={drawerOpen}
            className="md:hidden"
          >
            <Menu size={15} strokeWidth={1.5} />
          </IconButton>
          <div className="hidden md:block" />
          <div className="flex min-w-0 items-center gap-1">
            <ThemeToggle />
            <span className="ml-1 hidden min-w-0 truncate text-sm text-secondary sm:block">
              {admin.display_name}
            </span>
            <IconButton onClick={signOut} aria-label="Sign out" title="Sign out">
              <LogOut size={15} strokeWidth={1.5} />
            </IconButton>
          </div>
        </header>
        <main className="min-h-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
