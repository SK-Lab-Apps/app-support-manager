'use client';

import { Check, Copy, Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { generateApiKey, sha256Hex } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { IconButton } from '@/components/ui/icon-button';
import { Input } from '@/components/ui/input';

/**
 * Create app → generate API key client-side → store ONLY the SHA-256 hash →
 * show the raw key exactly once.
 */
export function NewAppDialog({ adminId }: { adminId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [rawKey, setRawKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [copied, setCopied] = useState(false);

  async function handleCreate() {
    setError(null);
    setCreating(true);

    const key = generateApiKey();
    const hash = await sha256Hex(key);
    const supabase = createClient();

    const { error: insertError } = await supabase.from('apps').insert({
      name: name.trim(),
      api_key_hash: hash,
      created_by: adminId,
    });

    if (insertError) {
      setError(
        insertError.code === '23505'
          ? 'An app with this name already exists'
          : "Couldn't create app — try again",
      );
      setCreating(false);
      return;
    }

    setRawKey(key);
    setCreating(false);
    router.refresh();
  }

  async function copyKey() {
    if (!rawKey) return;
    await navigator.clipboard.writeText(rawKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      // Key is gone for good once the dialog closes.
      setRawKey(null);
      setName('');
      setError(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <button className="flex w-full items-center gap-2 rounded-control px-2 py-1.5 text-sm text-secondary transition-colors duration-fast hover:bg-surface-hover hover:text-primary coarse:min-h-[44px]">
          <Plus size={14} strokeWidth={1.5} />
          Add app
        </button>
      </DialogTrigger>
      <DialogContent>
        {rawKey === null ? (
          <>
            <DialogTitle className="text-lg font-semibold tracking-heading">
              Register app
            </DialogTitle>
            <DialogDescription className="mt-1 text-sm text-secondary">
              An API key is generated once and stored only as a hash.
            </DialogDescription>
            <div className="mt-4 flex flex-col gap-1.5">
              <label htmlFor="app-name" className="text-xs text-secondary">
                App name
              </label>
              <Input
                id="app-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Habitloop"
                autoFocus
              />
            </div>
            {error && (
              <p role="alert" className="mt-2 text-xs text-status-danger">
                {error}
              </p>
            )}
            <div className="mt-4 flex justify-end">
              <Button
                variant="primary"
                onClick={handleCreate}
                disabled={!name.trim() || creating}
              >
                {creating ? 'Creating…' : 'Create app'}
              </Button>
            </div>
          </>
        ) : (
          <>
            <DialogTitle className="text-lg font-semibold tracking-heading">
              API key for {name.trim()}
            </DialogTitle>
            <DialogDescription className="mt-1 text-sm text-secondary">
              This key is shown once and cannot be recovered. Store it in your
              app&apos;s secret config now.
            </DialogDescription>
            <div className="mt-4 flex items-center gap-2 rounded-control border border-border bg-surface py-1 pl-2.5 pr-1">
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
            <div className="mt-4 flex justify-end">
              <Button variant="secondary" onClick={() => handleOpenChange(false)}>
                Done
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
