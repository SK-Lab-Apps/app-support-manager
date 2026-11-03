"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  AUTOMATION_EVENTS,
  AUTOMATION_MAX,
  DEFAULT_DELAY_MINUTES,
  DELAY_OPTIONS,
  formatDelay,
} from "@/lib/automations";
import { PLACEHOLDERS, renderTemplate } from "@/lib/outreach";
import { createClient } from "@/lib/supabase/client";
import type { AutomationEvent, AutomationRow, MessageTemplate } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";

/** Who the preview is written to. */
const SAMPLE_USER = { name: "Alex Morgan" };

/**
 * Writes the message for one event, or edits it: the text, how long after
 * the event it goes out, and whether it also pushes.
 */
export function AutomationEditorDialog({
  open,
  onOpenChange,
  appId,
  appName,
  event,
  automation,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  appId: string;
  appName: string;
  /** The event the message follows; the dialog is for one at a time. */
  event: AutomationEvent | null;
  /** The message as saved, or null to write one. */
  automation: AutomationRow | null;
  onSaved: () => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [body, setBody] = useState("");
  const [delay, setDelay] = useState(DEFAULT_DELAY_MINUTES);
  const [sendPush, setSendPush] = useState(false);
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);

  const info = AUTOMATION_EVENTS.find((e) => e.event === event);

  // Each open starts from the message as saved.
  useEffect(() => {
    if (!open) return;
    setBody(automation?.body ?? "");
    setDelay(automation?.delay_minutes ?? DEFAULT_DELAY_MINUTES);
    setSendPush(automation?.send_push ?? false);
    setError(false);
  }, [open, automation]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void supabase
      .from("message_templates")
      .select("*")
      .order("name")
      .then(({ data }) => {
        if (!cancelled) setTemplates((data ?? []) as MessageTemplate[]);
      });
    return () => {
      cancelled = true;
    };
  }, [open, supabase]);

  const trimmed = body.trim();
  const unchanged =
    automation !== null &&
    automation.body === trimmed &&
    automation.delay_minutes === delay &&
    automation.send_push === sendPush;
  // A saved delay that isn't one of the options still shows as itself.
  const delays = DELAY_OPTIONS.includes(delay)
    ? DELAY_OPTIONS
    : [...DELAY_OPTIONS, delay].sort((a, b) => a - b);

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
    if (!event || !trimmed) return;
    setSaving(true);
    setError(false);
    const fields = { body: trimmed, delay_minutes: delay, send_push: sendPush };
    const { error: saveError } = automation
      ? await supabase.from("automations").update(fields).eq("id", automation.id)
      : await supabase.from("automations").insert({ app_id: appId, event, ...fields });
    setSaving(false);
    if (saveError) {
      setError(true);
      return;
    }
    onSaved();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogTitle className="text-lg font-semibold tracking-heading">
          {info?.label ?? "Automated"} message
        </DialogTitle>
        <DialogDescription className="mt-1 text-sm text-secondary">
          {info?.description} It goes out {formatDelay(delay)} later as a new
          conversation in their support chat, translated into their language.
          {automation
            ? " Changes apply to everyone it hasn't gone to yet."
            : ""}
        </DialogDescription>

        <form
          className="mt-4 flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <div className="flex flex-wrap items-center gap-2">
            <select
              aria-label="Start from a template"
              value=""
              onChange={(e) => {
                const picked = templates.find((t) => t.id === e.target.value);
                if (picked) setBody(picked.body);
              }}
              disabled={templates.length === 0}
              className="h-8 min-w-0 flex-1 rounded-control border border-border bg-surface px-2 text-sm text-primary disabled:text-tertiary coarse:h-[44px] coarse:text-input"
            >
              <option value="">
                {templates.length === 0 ? "No templates yet" : "Start from a template…"}
              </option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            <Link
              href="/templates"
              className="text-xs text-secondary underline decoration-dotted underline-offset-2 hover:text-primary"
            >
              Manage templates
            </Link>
          </div>

          <div className="flex flex-col gap-1.5">
            <textarea
              ref={textareaRef}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={6}
              maxLength={AUTOMATION_MAX}
              placeholder="Hi {first_name}, thanks for trying {app}! Anything we can help with?"
              aria-label="Message"
              autoFocus={automation === null}
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
                  body.length > AUTOMATION_MAX - 50
                    ? "text-status-danger"
                    : "text-tertiary",
                )}
              >
                {body.length}/{AUTOMATION_MAX}
              </span>
            </div>
          </div>

          {trimmed && (
            <div className="rounded-control border border-border bg-bg px-2.5 py-2">
              <p className="text-2xs uppercase tracking-wide text-tertiary">
                Preview for {SAMPLE_USER.name}
              </p>
              <p className="mt-1 whitespace-pre-wrap break-words text-sm text-primary">
                {renderTemplate(trimmed, SAMPLE_USER, appName)}
              </p>
              {/\{(first_name|name)\}/.test(trimmed) && (
                <p className="mt-1.5 text-2xs text-tertiary">
                  For a user with no name on record the name is left out —
                  &ldquo;Hi{" {first_name},"}&rdquo; reads &ldquo;Hi,&rdquo;.
                </p>
              )}
            </div>
          )}

          <label className="flex items-center gap-2.5 text-sm text-primary">
            Send after
            <select
              value={delay}
              onChange={(e) => setDelay(Number(e.target.value))}
              className="h-8 rounded-control border border-border bg-surface px-2 text-sm text-primary coarse:h-[44px] coarse:text-input"
            >
              {delays.map((minutes) => (
                <option key={minutes} value={minutes}>
                  {formatDelay(minutes)}
                </option>
              ))}
            </select>
          </label>

          <label className="flex cursor-pointer items-start gap-2.5">
            <input
              type="checkbox"
              checked={sendPush}
              onChange={(e) => setSendPush(e.target.checked)}
              className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-[var(--color-accent)] coarse:h-5 coarse:w-5"
            />
            <span className="flex flex-col gap-0.5">
              <span className="text-sm text-primary">Also send a push notification</span>
              <span className="text-xs text-tertiary">
                To users who allowed notifications. Without it they see a badge
                on the support button. Apple doesn&apos;t allow promotional
                pushes unless users opted in to them.
              </span>
            </span>
          </label>

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
              disabled={saving || !trimmed || unchanged}
            >
              {saving ? "Saving…" : automation ? "Save changes" : "Turn on"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
