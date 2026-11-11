"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { AppUserRow } from "@/lib/types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * Confirms, then deletes the selected users and everything this project
 * keeps under their ids, in one transaction (delete_app_users). Nothing
 * changes in RevenueCat or the app; the dialog says what goes, and that a
 * user still on a plan comes back when they next open the app.
 */
export function DeleteUsersDialog({
  open,
  onOpenChange,
  appId,
  users,
  onDeleted,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  appId: string;
  users: AppUserRow[];
  onDeleted: (revenuecatIds: string[]) => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState(false);

  const count = users.length;
  const who =
    count === 1
      ? (users[0]?.name ?? users[0]?.revenuecat_id ?? "this user")
      : `${count} users`;
  const conversations = users.reduce((n, u) => n + u.conversation_count, 0);

  function handleOpenChange(next: boolean) {
    if (deleting) return;
    onOpenChange(next);
    if (!next) setError(false);
  }

  async function handleDelete() {
    const ids = users.map((u) => u.revenuecat_id);
    setDeleting(true);
    setError(false);
    const { error: deleteError } = await supabase.rpc("delete_app_users", {
      p_app_id: appId,
      p_revenuecat_ids: ids,
    });
    setDeleting(false);
    if (deleteError) {
      setError(true);
      return;
    }
    onDeleted(ids);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogTitle className="text-lg font-semibold tracking-heading">
          Delete {who} and {count === 1 ? "their" : "all their"} data?
        </DialogTitle>
        <DialogDescription className="mt-1 text-sm text-secondary">
          Removes {count === 1 ? "them" : "them all"} from this project&apos;s
          database: every conversation
          {conversations > 0 ? ` (${conversations} in your inbox)` : ""}, with
          its messages — gone from the support chat in the app too — and their
          language, push token, automated messages and RevenueCat records.
        </DialogDescription>
        <p className="mt-2 text-xs leading-relaxed text-tertiary">
          Nothing changes in RevenueCat or the app. Anyone still on a trial or
          PRO reappears here the next time they open the app, with no history.
          Sends in the Sent log stay, without their names. This can&apos;t be
          undone.
        </p>
        {error && (
          <p role="alert" className="mt-3 text-xs text-status-danger">
            Couldn&apos;t delete — nothing was deleted. Try again.
          </p>
        )}
        <div className="mt-4 flex justify-end gap-2">
          <Button
            variant="ghost"
            onClick={() => handleOpenChange(false)}
            disabled={deleting}
          >
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={() => void handleDelete()}
            disabled={deleting || count === 0}
          >
            {deleting
              ? "Deleting…"
              : count === 1
                ? "Delete user"
                : `Delete ${count} users`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
