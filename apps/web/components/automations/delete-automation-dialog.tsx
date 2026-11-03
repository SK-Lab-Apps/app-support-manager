"use client";

import { useMemo, useState } from "react";
import { automationLabel } from "@/lib/automations";
import { createClient } from "@/lib/supabase/client";
import type { AutomationRow } from "@/lib/types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * Confirms, then deletes an automated message. Users it is still waiting to
 * go to don't get it; what already went out stays in their chats and the
 * Sent log.
 */
export function DeleteAutomationDialog({
  automation,
  onOpenChange,
  onDeleted,
}: {
  /** The automation to delete; the dialog is open while one is set. */
  automation: AutomationRow | null;
  onOpenChange: (open: boolean) => void;
  onDeleted: (id: string) => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState(false);

  function handleOpenChange(next: boolean) {
    if (deleting) return;
    onOpenChange(next);
    if (!next) setError(false);
  }

  async function handleDelete() {
    if (!automation) return;
    setDeleting(true);
    setError(false);
    const { error: deleteError } = await supabase
      .from("automations")
      .delete()
      .eq("id", automation.id);
    setDeleting(false);
    if (deleteError) {
      setError(true);
      return;
    }
    onDeleted(automation.id);
    onOpenChange(false);
  }

  const waiting = automation?.pending_count ?? 0;

  return (
    <Dialog open={automation !== null} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogTitle className="text-lg font-semibold tracking-heading">
          Delete the {automation ? automationLabel(automation.event) : ""} message?
        </DialogTitle>
        <DialogDescription className="mt-1 text-sm text-secondary">
          {waiting > 0
            ? `${waiting} ${waiting === 1 ? "user it's" : "users it's"} waiting to go to won't get it. `
            : ""}
          Messages already sent stay in users&apos; chats and the Sent log. To
          stop it for a while instead, pause it. This can&apos;t be undone.
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
            disabled={deleting}
          >
            {deleting ? "Deleting…" : "Delete"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
