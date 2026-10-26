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
 * Confirms, then clears every send from this app's Sent log in one
 * transaction. Only the log goes: the messages stay in users' support
 * chats, and the dialog says so before anything happens.
 */
export function ClearSentLogDialog({
  open,
  onOpenChange,
  appId,
  count,
  onCleared,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  appId: string;
  /** How many sends the log holds, for the confirmation. */
  count: number;
  onCleared: () => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [clearing, setClearing] = useState(false);
  const [error, setError] = useState(false);

  function handleOpenChange(next: boolean) {
    if (clearing) return;
    onOpenChange(next);
    if (!next) setError(false);
  }

  async function handleClear() {
    setClearing(true);
    setError(false);
    const { error: clearError } = await supabase.rpc("clear_sent_log", {
      p_app_id: appId,
    });
    setClearing(false);
    if (clearError) {
      setError(true);
      return;
    }
    onCleared();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogTitle className="text-lg font-semibold tracking-heading">
          Clear the sent log?
        </DialogTitle>
        <DialogDescription className="mt-1 text-sm text-secondary">
          Removes {count === 1 ? "the 1 send" : `all ${count} sends`} listed
          here, with {count === 1 ? "its" : "their"} read and reply counts.
          The messages stay in each user&apos;s support chat, and replies
          still come to the inbox. This can&apos;t be undone.
        </DialogDescription>
        {error && (
          <p role="alert" className="mt-3 text-xs text-status-danger">
            Couldn&apos;t clear — try again
          </p>
        )}
        <div className="mt-4 flex justify-end gap-2">
          <Button
            variant="ghost"
            onClick={() => handleOpenChange(false)}
            disabled={clearing}
          >
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={() => void handleClear()}
            disabled={clearing || count === 0}
          >
            {clearing ? "Clearing…" : "Clear log"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
