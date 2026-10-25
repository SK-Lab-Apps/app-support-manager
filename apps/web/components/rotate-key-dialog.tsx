'use client';

import { KeyRound } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  absoluteTime,
  cn,
  formatDate,
  generateApiKey,
  sha256Hex,
} from '@/lib/utils';
import { ApiKeyField } from '@/components/api-key-field';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { IconButton } from '@/components/ui/icon-button';

const GRACE_OPTIONS = [
  { days: 0, label: 'Now' },
  { days: 7, label: 'In 7 days' },
  { days: 30, label: 'In 30 days' },
] as const;

type GraceDays = (typeof GRACE_OPTIONS)[number]['days'];

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Replaces an app's API key. Every installed copy of the app carries the
 * current key, so by default it keeps working for a grace period while the
 * release with the new key rolls out; retire it immediately if it leaked.
 * As at registration, the new key is generated here and only its hash
 * leaves the browser.
 */
export function RotateKeyDialog({
  appId,
  appName,
}: {
  appId: string;
  appName: string;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [open, setOpen] = useState(false);
  const [graceDays, setGraceDays] = useState<GraceDays>(30);
  // When the key from before the last rotation stops working — null once it
  // has, or if there never was one.
  const [previousExpiresAt, setPreviousExpiresAt] = useState<string | null>(
    null,
  );
  const [rotating, setRotating] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rotated, setRotated] = useState<{
    rawKey: string;
    oldKeyExpiresAt: string | null;
  } | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void supabase
      .from('apps')
      .select('previous_key_expires_at')
      .eq('id', appId)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        const expires = data?.previous_key_expires_at ?? null;
        setPreviousExpiresAt(
          expires && Date.parse(expires) > Date.now() ? expires : null,
        );
      });
    return () => {
      cancelled = true;
    };
  }, [open, appId, supabase]);

  async function handleRotate() {
    setError(null);
    setRotating(true);

    const key = generateApiKey();
    const hash = await sha256Hex(key);
    const { data, error: rpcError } = await supabase
      .rpc('rotate_app_api_key', {
        p_app_id: appId,
        p_new_hash: hash,
        p_grace: `${graceDays} days`,
      })
      .maybeSingle();

    setRotating(false);
    if (rpcError || !data) {
      setError("Couldn't rotate the key — the current key still works");
      return;
    }
    setRotated({
      rawKey: key,
      oldKeyExpiresAt: (data as { previous_key_expires_at: string | null })
        .previous_key_expires_at,
    });
  }

  /** Cuts off the key from before the last rotation ahead of schedule. */
  async function handleRevokePrevious() {
    setError(null);
    setRevoking(true);
    const { data, error: updateError } = await supabase
      .from('apps')
      .update({ previous_api_key_hash: null, previous_key_expires_at: null })
      .eq('id', appId)
      .select('id');
    setRevoking(false);
    if (updateError || !data?.length) {
      setError("Couldn't revoke the old key — try again");
      return;
    }
    setPreviousExpiresAt(null);
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      // The new key is gone for good once the dialog closes.
      setRotated(null);
      setError(null);
      setGraceDays(30);
    }
  }

  const retireOn = new Date(Date.now() + graceDays * DAY_MS).toISOString();

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <IconButton aria-label="Rotate API key" title="Rotate API key">
          <KeyRound size={15} strokeWidth={1.5} />
        </IconButton>
      </DialogTrigger>
      <DialogContent>
        {rotated === null ? (
          <>
            <DialogTitle className="text-lg font-semibold tracking-heading">
              Rotate API key
            </DialogTitle>
            <DialogDescription className="mt-1 text-sm text-secondary">
              Generates a new key for {appName}. Ship it in your next release.
            </DialogDescription>

            {previousExpiresAt && (
              <div className="mt-4 flex flex-col items-start gap-2 rounded-control border border-border bg-surface px-2.5 py-2">
                <p className="text-xs text-secondary">
                  The key before the current one still works until{' '}
                  {absoluteTime(previousExpiresAt)}. Rotating again cuts it off
                  immediately — only one old key is kept.
                </p>
                <Button
                  size="sm"
                  variant="danger"
                  onClick={() => void handleRevokePrevious()}
                  disabled={revoking || rotating}
                >
                  {revoking ? 'Revoking…' : 'Revoke it now'}
                </Button>
              </div>
            )}

            <div className="mt-4 flex flex-col gap-1.5">
              <span id="retire-key-label" className="text-xs text-secondary">
                Retire the current key
              </span>
              <div
                role="group"
                aria-labelledby="retire-key-label"
                className="grid grid-cols-3 gap-0.5 rounded-control border border-border bg-surface p-0.5"
              >
                {GRACE_OPTIONS.map((option) => (
                  <button
                    key={option.days}
                    type="button"
                    aria-pressed={graceDays === option.days}
                    onClick={() => setGraceDays(option.days)}
                    className={cn(
                      'h-7 rounded-[5px] text-xs transition-colors duration-fast coarse:h-[38px]',
                      graceDays === option.days
                        ? 'bg-surface-active font-medium text-primary'
                        : 'text-secondary hover:text-primary',
                    )}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              <p className="text-xs text-tertiary">
                {graceDays === 0
                  ? 'For a leaked key. Installed copies of the app lose support until users update.'
                  : `Installed copies keep working until ${formatDate(retireOn)} while the update rolls out.`}
              </p>
            </div>

            {error && (
              <p role="alert" className="mt-2 text-xs text-status-danger">
                {error}
              </p>
            )}
            <div className="mt-4 flex justify-end">
              <Button
                variant={graceDays === 0 ? 'danger' : 'primary'}
                onClick={() => void handleRotate()}
                disabled={rotating || revoking}
              >
                {rotating ? 'Rotating…' : 'Rotate key'}
              </Button>
            </div>
          </>
        ) : (
          <>
            <DialogTitle className="text-lg font-semibold tracking-heading">
              New API key for {appName}
            </DialogTitle>
            <DialogDescription className="mt-1 text-sm text-secondary">
              This key is shown once and cannot be recovered. Store it in your
              app&apos;s secret config now.
            </DialogDescription>
            <div className="mt-4">
              <ApiKeyField rawKey={rotated.rawKey} />
            </div>
            <p className="mt-2 text-xs text-secondary">
              {rotated.oldKeyExpiresAt
                ? `The old key keeps working until ${absoluteTime(rotated.oldKeyExpiresAt)}.`
                : 'The old key no longer works.'}
            </p>
            <div className="mt-4 flex justify-end">
              <Button
                variant="secondary"
                onClick={() => handleOpenChange(false)}
              >
                Done
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
