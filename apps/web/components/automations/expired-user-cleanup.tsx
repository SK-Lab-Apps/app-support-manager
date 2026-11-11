"use client";

import { Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { ExpiredUserCleanupRow } from "@/lib/types";
import { absoluteTime, relativeTime } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";

/** Matches purge_expired_users. */
const AFTER_DAYS = 7;

/**
 * The app's automatic deletion of expired users: off until switched on,
 * then each user and their data goes 7 days after their trial or PRO
 * subscription expires (the purge-expired-users job, hourly).
 */
export function ExpiredUserCleanup({ appId }: { appId: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [row, setRow] = useState<ExpiredUserCleanupRow | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);

  const fetchRow = useCallback(async () => {
    setLoadError(false);
    const { data, error } = await supabase
      .from("expired_user_cleanup")
      .select("*")
      .eq("app_id", appId)
      .maybeSingle();
    if (error || !data) {
      setLoadError(true);
      return;
    }
    setRow(data as ExpiredUserCleanupRow);
  }, [appId, supabase]);

  useEffect(() => {
    void fetchRow();
  }, [fetchRow]);

  async function setEnabled(enabled: boolean) {
    setSaving(true);
    setSaveError(false);
    const { error } = await supabase
      .from("apps")
      .update({ delete_expired_users: enabled })
      .eq("id", appId);
    setSaving(false);
    if (error) {
      setSaveError(true);
      return;
    }
    setConfirming(false);
    await fetchRow();
  }

  return (
    <section className="border-b border-border px-3 py-3 md:px-4">
      <div className="flex items-start gap-2">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="flex flex-wrap items-baseline gap-x-2">
            <span className="text-sm font-medium text-primary">
              Delete expired users
            </span>
            {row && (
              <span
                className={
                  row.enabled
                    ? "rounded-[4px] bg-status-danger-bg px-1.5 text-2xs text-status-danger"
                    : "rounded-[4px] border border-border px-1.5 text-2xs text-secondary"
                }
              >
                {row.enabled ? "On" : "Off"}
              </span>
            )}
          </span>
          <span className="text-xs text-tertiary">
            {AFTER_DAYS} days after a user&apos;s trial or PRO subscription
            expires, delete them and all their data from this project — their
            conversations (gone from the support chat in the app too),
            language, push token, automated messages and RevenueCat records.
            Someone who writes to support after expiring is kept until their
            conversation has been quiet for {AFTER_DAYS} days. Nothing changes
            in RevenueCat or the app.
          </span>
          <span className="text-xs text-tertiary">
            A user counts as expired when their app reports them free, or when
            RevenueCat&apos;s webhook says so. Users who expired before this was
            added aren&apos;t on record.
          </span>

          {loadError ? (
            <p className="text-xs text-status-danger">
              Couldn&apos;t load —{" "}
              <button
                type="button"
                onClick={() => void fetchRow()}
                className="underline underline-offset-2"
              >
                retry
              </button>
            </p>
          ) : row === null ? (
            <Skeleton className="mt-1 h-3 w-48" />
          ) : (
            <div className="tnum mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-secondary">
              <span title="Expired and on record, not deleted yet">
                {row.expired_count} expired
              </span>
              <span title={`Expired more than ${AFTER_DAYS} days ago`}>
                {row.due_count} past {AFTER_DAYS} days
              </span>
              <span title="Deleted by this automation">
                {row.deleted_count} deleted
              </span>
              {row.last_deleted_at && (
                <span
                  className="text-tertiary"
                  title={absoluteTime(row.last_deleted_at)}
                >
                  Last deleted {relativeTime(row.last_deleted_at)}
                </span>
              )}
            </div>
          )}
          {saveError && (
            <p role="alert" className="text-xs text-status-danger">
              Couldn&apos;t save — try again
            </p>
          )}
        </div>

        <div className="flex shrink-0 items-center">
          {row &&
            (row.enabled ? (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => void setEnabled(false)}
                disabled={saving}
              >
                {saving ? "Turning off…" : "Turn off"}
              </Button>
            ) : (
              <Button size="sm" onClick={() => setConfirming(true)} disabled={saving}>
                <Trash2 size={13} strokeWidth={1.5} />
                Turn on
              </Button>
            ))}
        </div>
      </div>

      <Dialog
        open={confirming}
        onOpenChange={(next) => {
          if (!saving) setConfirming(next);
        }}
      >
        <DialogContent>
          <DialogTitle className="text-lg font-semibold tracking-heading">
            Delete expired users automatically?
          </DialogTitle>
          <DialogDescription className="mt-1 text-sm text-secondary">
            {row && row.due_count > 0
              ? `${row.due_count} user${row.due_count === 1 ? "" : "s"} who expired more than ${AFTER_DAYS} days ago will be deleted within the hour, with all their data — unless they've written to support in the last ${AFTER_DAYS} days. `
              : ""}
            From then on, each user goes {AFTER_DAYS} days after they expire.
            Deleted users and their conversations can&apos;t be brought back.
          </DialogDescription>
          <div className="mt-4 flex justify-end gap-2">
            <Button
              variant="ghost"
              onClick={() => setConfirming(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={() => void setEnabled(true)}
              disabled={saving}
            >
              {saving ? "Turning on…" : "Turn on"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
