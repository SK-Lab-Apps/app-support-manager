'use client';

import { Check, Copy } from 'lucide-react';
import { useState } from 'react';
import { IconButton } from '@/components/ui/icon-button';

/** A raw API key in its one-time reveal, with a copy button. */
export function ApiKeyField({ rawKey }: { rawKey: string }) {
  const [copied, setCopied] = useState(false);

  async function copyKey() {
    await navigator.clipboard.writeText(rawKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="flex items-center gap-2 rounded-control border border-border bg-surface py-1 pl-2.5 pr-1">
      <code className="tnum min-w-0 flex-1 truncate font-mono text-xs text-primary">
        {rawKey}
      </code>
      <IconButton
        onClick={copyKey}
        aria-label="Copy API key"
        className="h-7 w-7 coarse:h-[38px] coarse:w-[38px]"
      >
        {copied ? (
          <Check
            size={13}
            strokeWidth={1.5}
            className="text-status-resolved"
          />
        ) : (
          <Copy size={13} strokeWidth={1.5} />
        )}
      </IconButton>
    </div>
  );
}
