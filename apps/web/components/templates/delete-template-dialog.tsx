"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { MessageTemplate } from "@/lib/types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * Confirms, then deletes a template. What was already sent with it is
 * untouched: messages and the Sent log keep their own copy of the text.
 */
export function DeleteTemplateDialog({
  template,
  onOpenChange,
  onDeleted,
}: {
  /** The template to delete; the dialog is open while one is set. */
  template: MessageTemplate | null;
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
    if (!template) return;
    setDeleting(true);
    setError(false);
    const { error: deleteError } = await supabase
      .from("message_templates")
      .delete()
      .eq("id", template.id);
    setDeleting(false);
    if (deleteError) {
      setError(true);
      return;
    }
    onDeleted(template.id);
    onOpenChange(false);
  }

  return (
    <Dialog open={template !== null} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogTitle className="text-lg font-semibold tracking-heading">
          Delete &ldquo;{template?.name}&rdquo;?
        </DialogTitle>
        <DialogDescription className="mt-1 text-sm text-secondary">
          It goes for every app. Messages already sent with it stay as they
          are. This can&apos;t be undone.
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
