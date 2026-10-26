"use client";

import { FileText, Pencil, Plus, RotateCw, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { MessageTemplate } from "@/lib/types";
import { absoluteTime, relativeTime } from "@/lib/utils";
import { TemplateText } from "@/components/template-text";
import { DeleteTemplateDialog } from "@/components/templates/delete-template-dialog";
import { TemplateEditorDialog } from "@/components/templates/template-editor-dialog";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { TableSkeleton } from "@/components/ui/skeleton";

function byName(a: MessageTemplate, b: MessageTemplate) {
  return a.name.localeCompare(b.name);
}

/**
 * Every message template, for every app: the ones offered when messaging
 * users from the Users tab and when replying in a conversation.
 */
export function TemplatesView() {
  const supabase = useMemo(() => createClient(), []);
  const [templates, setTemplates] = useState<MessageTemplate[] | null>(null);
  const [error, setError] = useState(false);
  // The editor is open while this is set: null writes a new template.
  const [editing, setEditing] = useState<MessageTemplate | null | undefined>(
    undefined,
  );
  const [deleting, setDeleting] = useState<MessageTemplate | null>(null);

  const fetchTemplates = useCallback(async () => {
    setError(false);
    const { data, error: fetchError } = await supabase
      .from("message_templates")
      .select("*")
      .order("name");
    if (fetchError) {
      setError(true);
      return;
    }
    setTemplates((data ?? []) as MessageTemplate[]);
  }, [supabase]);

  useEffect(() => {
    void fetchTemplates();
  }, [fetchTemplates]);

  function handleSaved(saved: MessageTemplate) {
    setTemplates((prev) =>
      [...(prev ?? []).filter((t) => t.id !== saved.id), saved].sort(byName),
    );
  }

  const newButton = (
    <Button size="sm" variant="primary" onClick={() => setEditing(null)}>
      <Plus size={13} strokeWidth={1.5} />
      New template
    </Button>
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-3 border-b border-border px-3 py-2 md:px-4">
        <div className="min-w-0">
          <h1 className="text-lg font-semibold tracking-heading">Templates</h1>
          <p className="truncate text-xs text-tertiary">
            Shared by every app, for messaging users and for replies
          </p>
        </div>
        {templates !== null && templates.length > 0 && (
          <div className="ml-auto shrink-0">{newButton}</div>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-safe-b">
        {error ? (
          <div className="flex flex-col items-center gap-3 px-3 py-16 text-center">
            <p className="text-sm text-secondary">Couldn&apos;t load templates</p>
            <Button size="sm" onClick={() => void fetchTemplates()}>
              <RotateCw size={12} strokeWidth={1.5} />
              Retry
            </Button>
          </div>
        ) : templates === null ? (
          <TableSkeleton rows={4} />
        ) : templates.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-6 py-16 text-center">
            <FileText size={18} strokeWidth={1.5} className="text-tertiary" />
            <p className="text-sm text-secondary">No templates yet</p>
            <p className="max-w-sm text-xs text-tertiary">
              Save messages you send often, with {"{first_name}"} and{" "}
              {"{app}"} filled in per user.
            </p>
            <div className="mt-2">{newButton}</div>
          </div>
        ) : (
          <ul>
            {templates.map((t) => (
              <li
                key={t.id}
                className="group flex items-start gap-2 border-b border-border px-3 py-3 md:px-4"
              >
                <button
                  type="button"
                  onClick={() => setEditing(t)}
                  className="flex min-w-0 flex-1 flex-col gap-1 text-left"
                >
                  <span className="flex min-w-0 items-baseline gap-2">
                    <span className="truncate text-sm font-medium text-primary">
                      {t.name}
                    </span>
                    <span
                      className="tnum shrink-0 text-xs text-tertiary"
                      title={absoluteTime(t.updated_at)}
                    >
                      {relativeTime(t.updated_at)}
                    </span>
                  </span>
                  <span className="line-clamp-3 whitespace-pre-wrap break-words text-sm text-secondary">
                    <TemplateText body={t.body} />
                  </span>
                </button>
                <div className="flex shrink-0 items-center">
                  <IconButton
                    onClick={() => setEditing(t)}
                    aria-label={`Edit ${t.name}`}
                    title="Edit"
                  >
                    <Pencil size={13} strokeWidth={1.5} />
                  </IconButton>
                  <IconButton
                    onClick={() => setDeleting(t)}
                    aria-label={`Delete ${t.name}`}
                    title="Delete"
                    className="hover:text-status-danger"
                  >
                    <Trash2 size={13} strokeWidth={1.5} />
                  </IconButton>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <TemplateEditorDialog
        open={editing !== undefined}
        onOpenChange={(open) => {
          if (!open) setEditing(undefined);
        }}
        template={editing ?? null}
        onSaved={handleSaved}
      />
      <DeleteTemplateDialog
        template={deleting}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
        onDeleted={(id) =>
          setTemplates((prev) => (prev ?? []).filter((t) => t.id !== id))
        }
      />
    </div>
  );
}
