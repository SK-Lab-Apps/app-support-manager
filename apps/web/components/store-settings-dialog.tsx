'use client';

import { Star } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
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

// Same shapes as the CHECK constraints on public.apps.
const APP_STORE_ID = /^[0-9]{5,12}$/;
const PLAY_PACKAGE = /^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z][a-zA-Z0-9_]*)+$/;

/**
 * Where review requests send this app's users: its App Store id and Google
 * Play package. A request only offers the button for a store set up here.
 */
export function StoreSettingsDialog({ appId, appName }: { appId: string; appName: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [open, setOpen] = useState(false);
  const [appStoreId, setAppStoreId] = useState('');
  const [playPackage, setPlayPackage] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoaded(false);
    setError(null);
    setSaved(false);
    void supabase
      .from('apps')
      .select('app_store_id, play_store_package')
      .eq('id', appId)
      .maybeSingle()
      .then(({ data }) => {
        setAppStoreId(data?.app_store_id ?? '');
        setPlayPackage(data?.play_store_package ?? '');
        setLoaded(true);
      });
  }, [open, appId, supabase]);

  const iosValue = appStoreId.trim().replace(/^id/i, '');
  const androidValue = playPackage.trim();
  const iosInvalid = iosValue !== '' && !APP_STORE_ID.test(iosValue);
  const androidInvalid = androidValue !== '' && !PLAY_PACKAGE.test(androidValue);

  async function save() {
    setSaving(true);
    setError(null);
    setSaved(false);
    const { error: updateError } = await supabase
      .from('apps')
      .update({
        app_store_id: iosValue || null,
        play_store_package: androidValue || null,
      })
      .eq('id', appId);
    setSaving(false);
    if (updateError) {
      setError("Couldn't save — check both values and try again");
      return;
    }
    setAppStoreId(iosValue);
    setSaved(true);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <IconButton aria-label="Store listing" title="Store listing for review requests">
          <Star size={15} strokeWidth={1.5} />
        </IconButton>
      </DialogTrigger>
      <DialogContent>
        <DialogTitle className="text-lg font-semibold tracking-heading">
          Store listing
        </DialogTitle>
        <DialogDescription className="mt-1 text-sm text-secondary">
          Where review requests send {appName}&apos;s users. The button opens
          the store&apos;s write-a-review page on their phone.
        </DialogDescription>

        <form
          className="mt-4 flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <div className="flex flex-col gap-1.5">
            <label htmlFor="app-store-id" className="text-xs text-secondary">
              App Store ID
            </label>
            <Input
              id="app-store-id"
              value={appStoreId}
              onChange={(e) => {
                setAppStoreId(e.target.value);
                setSaved(false);
              }}
              placeholder="1234567890"
              inputMode="numeric"
              disabled={!loaded}
              aria-invalid={iosInvalid}
            />
            <p className={iosInvalid ? 'text-2xs text-status-danger' : 'text-2xs text-tertiary'}>
              {iosInvalid
                ? 'Digits only — the number from your App Store link, not the bundle ID.'
                : 'The number in your App Store link: apps.apple.com/app/id1234567890'}
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="play-package" className="text-xs text-secondary">
              Google Play package
            </label>
            <Input
              id="play-package"
              value={playPackage}
              onChange={(e) => {
                setPlayPackage(e.target.value);
                setSaved(false);
              }}
              placeholder="com.example.app"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              disabled={!loaded}
              aria-invalid={androidInvalid}
            />
            <p className={androidInvalid ? 'text-2xs text-status-danger' : 'text-2xs text-tertiary'}>
              {androidInvalid
                ? 'A package name like com.example.app — not a URL.'
                : 'The id= value in your Play Store link.'}
            </p>
          </div>

          {error && (
            <p role="alert" className="text-xs text-status-danger">
              {error}
            </p>
          )}

          <div className="flex items-center justify-end gap-3">
            {saved && <span className="text-xs text-status-resolved">Saved</span>}
            <Button
              type="submit"
              variant="primary"
              disabled={!loaded || saving || iosInvalid || androidInvalid}
            >
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
