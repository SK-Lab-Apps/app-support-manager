'use client';

import { Inbox, Send, Users } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { RotateKeyDialog } from '@/components/rotate-key-dialog';
import { StoreSettingsDialog } from '@/components/store-settings-dialog';

/** App name, its key and store listing, and the Inbox / Users / Sent tabs. */
export function AppHeader({ appId, appName }: { appId: string; appName: string }) {
  const pathname = usePathname();
  const base = `/apps/${appId}`;
  const tabs = [
    { href: base, label: 'Inbox', icon: Inbox },
    { href: `${base}/users`, label: 'Users', icon: Users },
    { href: `${base}/sent`, label: 'Sent', icon: Send },
  ];

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-x-2 border-b border-border px-3 pt-1.5 md:px-4">
      <h1 className="min-w-0 max-w-full truncate text-lg font-semibold tracking-heading">
        {appName}
      </h1>
      <RotateKeyDialog appId={appId} appName={appName} />
      <StoreSettingsDialog appId={appId} appName={appName} />
      <nav
        aria-label={`${appName} sections`}
        className="flex w-full gap-4 sm:ml-4 sm:w-auto"
      >
        {tabs.map(({ href, label, icon: Icon }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                '-mb-px flex items-center gap-1.5 border-b-2 py-2 text-sm',
                'transition-colors duration-fast',
                'coarse:min-h-[44px]',
                active
                  ? 'border-accent text-primary'
                  : 'border-transparent text-secondary hover:text-primary',
              )}
            >
              <Icon size={14} strokeWidth={1.5} />
              {label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
