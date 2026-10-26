'use client';

import { Inbox, Send, Users } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { RotateKeyDialog } from '@/components/rotate-key-dialog';
import { StoreSettingsDialog } from '@/components/store-settings-dialog';
import { Skeleton } from '@/components/ui/skeleton';

const TABS = [
  { path: '', label: 'Inbox', icon: Inbox },
  { path: '/users', label: 'Users', icon: Users },
  { path: '/sent', label: 'Sent', icon: Send },
];

/** App name, its key and store listing, and the Inbox / Users / Sent tabs. */
export function AppHeader({ appId, appName }: { appId: string; appName: string }) {
  const pathname = usePathname();
  const tabs = TABS.map((tab) => ({ ...tab, href: `/apps/${appId}${tab.path}` }));

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

/**
 * The header while another app loads: the name is unknown until then, the
 * tabs aren't. Opens on Inbox, where switching apps lands.
 */
export function AppHeaderSkeleton() {
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-x-2 border-b border-border px-3 pt-1.5 md:px-4">
      <Skeleton className="my-1 h-[18px] w-32" />
      {/* Where the key and store-listing buttons sit. */}
      <span className="h-8 w-[4.5rem] coarse:h-[44px] coarse:w-[calc(88px+0.5rem)]" />
      <div className="flex w-full gap-4 sm:ml-4 sm:w-auto" aria-hidden>
        {TABS.map(({ label, icon: Icon }, i) => (
          <span
            key={label}
            className={cn(
              '-mb-px flex items-center gap-1.5 border-b-2 py-2 text-sm text-tertiary',
              'coarse:min-h-[44px]',
              i === 0 ? 'border-accent' : 'border-transparent',
            )}
          >
            <Icon size={14} strokeWidth={1.5} />
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}
