"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { PLACEHOLDERS, TEMPLATE_MAX, TEMPLATE_NAME_MAX } from "@/lib/outreach";
import type { MessageTemplate } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

/**
 * Writes a new template, or edits one. Templates are shared by every app:
 * {app} fills in whichever app a message goes out for.
 */
export function TemplateEditorDialog({
  open,
  onOpenChange,
  template,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The template to edit, or null to write a new one. */
  template: MessageTemplate | null;
  onSaved: (saved: MessageTemplate) => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [name, setName] = useState("");
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);

  // Each open starts from the template as saved.
  useEffect(() => {
    if (!open) return;
    setName(template?.name ?? "");
    setBody(template?.body ?? "");
    setError(false);
  }, [open, template]);

  const trimmedName = name.trim();
  const trimmedBody = body.trim();
  const unchanged =
    template !== null &&
    template.name === trimmedName &&
    template.body === trimmedBody;

  function handleOpenChange(next: boolean) {
    if (saving) return;
    onOpenChange(next);
  }

  /** Inserts a placeholder at the cursor, keeping focus in the text. */
  function insertToken(token: string) {
    const el = textareaRef.current;
    const start = el?.selectionStart ?? body.length;
    const end = el?.selectionEnd ?? body.length;
    setBody(body.slice(0, start) + token + body.slice(end));
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + token.length, start + token.length);
    });
  }

  async function save() {
    if (!trimmedName || !trimmedBody) return;
    setSaving(true);
    setError(false);
    const { data, error: saveError } = template
      ? await supabase
          .from("message_templates")
          .update({
            name: trimmedName,
            body: trimmedBody,
            updated_at: new Date().toISOString(),
          })
          .eq("id", template.id)
          .select("*")
          .single()
      : await supabase
          .from("message_templates")
          .insert({ name: trimmedName, body: trimmedBody })
          .select("*")
          .single();
    setSaving(false);
    if (saveError || !data) {
      setError(true);
      return;
    }
    onSaved(data as MessageTemplate);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogTitle className="text-lg font-semibold tracking-heading">
          {template ? "Edit template" : "New template"}
        </DialogTitle>
        <DialogDescription className="mt-1 text-sm text-secondary">
          Shared by every app, for messaging users and for replies. Placeholders
          fill in per user, and replies are translated as usual.
        </DialogDescription>

        <form
          className="mt-4 flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name, e.g. Welcome"
            maxLength={TEMPLATE_NAME_MAX}
            aria-label="Template name"
            autoFocus={template === null}
          />
          <div className="flex flex-col gap-1.5">
            <textarea
              ref={textareaRef}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={7}
              maxLength={TEMPLATE_MAX}
              placeholder="Hi {first_name}, thanks for using {app}!"
              aria-label="Template text"
              className={cn(
                "w-full resize-y rounded-control border border-border bg-surface px-2.5 py-2 text-sm text-primary",
                "placeholder:text-tertiary transition-colors duration-fast",
                "hover:border-border-strong focus:border-border-strong coarse:text-input",
              )}
            />
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-2xs text-tertiary">Insert</span>
              {PLACEHOLDERS.map((p) => (
                <button
                  key={p.token}
                  type="button"
                  onClick={() => insertToken(p.token)}
                  title={`Insert ${p.label.toLowerCase()}`}
                  className="tnum rounded-[4px] border border-border px-1.5 py-px font-mono text-2xs text-secondary transition-colors duration-fast hover:border-border-strong hover:text-primary coarse:py-1.5"
                >
                  {p.token}
                </button>
              ))}
              <span
                className={cn(
                  "tnum ml-auto text-2xs",
                  body.length > TEMPLATE_MAX - 50
                    ? "text-status-danger"
                    : "text-tertiary",
                )}
              >
                {body.length}/{TEMPLATE_MAX}
              </span>
            </div>
          </div>

          {error && (
            <p role="alert" className="text-xs text-status-danger">
              Couldn&apos;t save — try again
            </p>
          )}

          <div className="mt-1 flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => handleOpenChange(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={saving || !trimmedName || !trimmedBody || unchanged}
            >
              {saving
                ? "Saving…"
                : template
                  ? "Save changes"
                  : "Create template"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
