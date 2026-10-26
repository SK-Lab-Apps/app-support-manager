"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * Confirms, then deletes the selected conversations in one transaction —
 * each with all its messages. The user's support chat reads the same rows,
 * so they lose them too; the dialog says so before anything happens.
 */
export function DeleteConversationsDialog({
  open,
  onOpenChange,
  queryIds,
  onDeleted,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  queryIds: string[];
  onDeleted: (queryIds: string[]) => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState(false);

  const count = queryIds.length;

  function handleOpenChange(next: boolean) {
    if (deleting) return;
    onOpenChange(next);
    if (!next) setError(false);
  }

  async function handleDelete() {
    setDeleting(true);
    setError(false);
    const { error: deleteError } = await supabase.rpc("delete_conversations", {
      p_query_ids: queryIds,
    });
    setDeleting(false);
    if (deleteError) {
      setError(true);
      return;
    }
    onDeleted(queryIds);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogTitle className="text-lg font-semibold tracking-heading">
          Delete {count === 1 ? "this conversation" : `${count} conversations`}?
        </DialogTitle>
        <DialogDescription className="mt-1 text-sm text-secondary">
          {count === 1 ? "It goes" : "They go"} with every message, here and
          from the user&apos;s support chat in the app. This can&apos;t be
          undone.
        </DialogDescription>
        {error && (
          <p role="alert" className="mt-3 text-xs text-status-danger">
            Couldn&apos;t delete — try again
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
            {deleting ? "Deleting…" : "Delete"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
