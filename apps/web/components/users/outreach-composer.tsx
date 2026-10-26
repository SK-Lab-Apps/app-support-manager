"use client";

import { Check, Trash2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { callFunction } from "@/lib/functions";
import { languageName, isTranslated } from "@/lib/languages";
import {
  OUTREACH_MAX,
  PLACEHOLDERS,
  renderTemplate,
} from "@/lib/outreach";
import type { AppUserRow, MessageTemplate } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

interface SendResult {
  broadcast_id: string | null;
  sent: number;
  unknown: number;
  pushed: number;
}

/**
 * Writes a first message to the selected users. Each gets it as a new
 * conversation in their support chat, translated into their language, with
 * {first_name} / {name} / {app} filled in. It reaches the inbox when they
 * reply.
 */
export function OutreachComposer({
  open,
  onOpenChange,
  appId,
  appName,
  recipients,
  onSent,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  appId: string;
  appName: string;
  recipients: AppUserRow[];
  onSent: () => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [templatesLoaded, setTemplatesLoaded] = useState(false);
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [body, setBody] = useState("");
  const [sendPush, setSendPush] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState<string | null>(null);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SendResult | null>(null);

  useEffect(() => {
    if (!open) return;
    setTemplatesLoaded(false);
    void supabase
      .from("message_templates")
      .select("*")
      .order("name")
      .then(({ data }) => {
        setTemplates((data ?? []) as MessageTemplate[]);
        setTemplatesLoaded(true);
      });
  }, [open, supabase]);

  const template = templates.find((t) => t.id === templateId) ?? null;
  const edited = template !== null && template.body !== body;
  const trimmed = body.trim();
  const sample = recipients[0] ?? null;
  const reachable = recipients.filter((r) => r.push_reachable).length;
  const languages = [
    ...new Set(
      recipients
        .map((r) => r.language)
        .filter((l): l is string => isTranslated(l) && l !== null),
    ),
  ];
  const usesName = /\{(first_name|name)\}/.test(body);
  const nameless = recipients.filter((r) => !r.name?.trim()).length;

  function reset() {
    setTemplateId(null);
    setBody("");
    setSendPush(false);
    setNewTemplateName(null);
    setConfirming(false);
    setError(null);
    setResult(null);
  }

  function handleOpenChange(next: boolean) {
    if (sending) return;
    onOpenChange(next);
    if (!next) reset();
  }

  function pickTemplate(id: string) {
    const picked = templates.find((t) => t.id === id) ?? null;
    setTemplateId(picked?.id ?? null);
    if (picked) setBody(picked.body);
    setConfirming(false);
  }

  /** Inserts a placeholder at the cursor, keeping focus in the text. */
  function insertToken(token: string) {
    const el = textareaRef.current;
    const start = el?.selectionStart ?? body.length;
    const end = el?.selectionEnd ?? body.length;
    const next = body.slice(0, start) + token + body.slice(end);
    setBody(next);
    setConfirming(false);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + token.length, start + token.length);
    });
  }

  async function saveNewTemplate() {
    const name = newTemplateName?.trim();
    if (!name || !trimmed) return;
    setSavingTemplate(true);
    const { data, error: insertError } = await supabase
      .from("message_templates")
      .insert({ name, body: trimmed })
      .select("*")
      .single();
    setSavingTemplate(false);
    if (insertError || !data) {
      setError("Couldn't save the template");
      return;
    }
    const saved = data as MessageTemplate;
    setTemplates((prev) =>
      [...prev, saved].sort((a, b) => a.name.localeCompare(b.name)),
    );
    setTemplateId(saved.id);
    setNewTemplateName(null);
  }

  async function updateTemplate() {
    if (!template || !trimmed) return;
    setSavingTemplate(true);
    const { error: updateError } = await supabase
      .from("message_templates")
      .update({ body: trimmed, updated_at: new Date().toISOString() })
      .eq("id", template.id);
    setSavingTemplate(false);
    if (updateError) {
      setError("Couldn't update the template");
      return;
    }
    setTemplates((prev) =>
      prev.map((t) => (t.id === template.id ? { ...t, body: trimmed } : t)),
    );
  }

  async function deleteTemplate() {
    if (!template) return;
    setSavingTemplate(true);
    const { error: deleteError } = await supabase
      .from("message_templates")
      .delete()
      .eq("id", template.id);
    setSavingTemplate(false);
    if (deleteError) {
      setError("Couldn't delete the template");
      return;
    }
    setTemplates((prev) => prev.filter((t) => t.id !== template.id));
    setTemplateId(null);
  }

  async function send() {
    setSending(true);
    setError(null);
    const response = await callFunction<SendResult>(supabase, "send-outreach", {
      app_id: appId,
      revenuecat_ids: recipients.map((r) => r.revenuecat_id),
      body: trimmed,
      // A template edited before sending is no longer that template.
      template_id: template && !edited ? template.id : null,
      send_push: sendPush,
    });
    setSending(false);
    setConfirming(false);
    if (!response.ok || !response.data) {
      setError(response.error ?? "Couldn't send — nothing was sent");
      return;
    }
    setResult(response.data);
    onSent();
  }

  const count = recipients.length;
  const audience = count === 1 ? (sample?.name ?? "1 user") : `${count} users`;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-xl">
        {result ? (
          <>
            <DialogTitle className="flex items-center gap-2 text-lg font-semibold tracking-heading">
              <Check size={16} strokeWidth={2} className="text-status-resolved" />
              Sent to {result.sent} {result.sent === 1 ? "user" : "users"}
            </DialogTitle>
            <DialogDescription className="mt-1 text-sm text-secondary">
              {sendPush
                ? `${result.pushed} push notification${result.pushed === 1 ? "" : "s"} delivered. `
                : ""}
              Each conversation joins the inbox when the user replies.
              {result.unknown > 0 &&
                ` ${result.unknown} selected user${result.unknown === 1 ? " was" : "s were"} no longer known and skipped.`}
            </DialogDescription>
            <div className="mt-4 flex justify-end gap-2">
              <Link
                href={`/apps/${appId}/sent`}
                className="inline-flex h-8 items-center rounded-control px-3 text-sm text-secondary hover:bg-surface-hover hover:text-primary coarse:h-[44px]"
              >
                View in Sent
              </Link>
              <Button variant="secondary" onClick={() => handleOpenChange(false)}>
                Done
              </Button>
            </div>
          </>
        ) : (
          <>
            <DialogTitle className="text-lg font-semibold tracking-heading">
              Message {audience}
            </DialogTitle>
            <DialogDescription className="mt-1 text-sm text-secondary">
              Starts a conversation in each user&apos;s support chat
              {languages.length > 0
                ? `, translated for those who read ${languages.map((l) => languageName(l)).join(", ")}`
                : ""}
              . It joins your inbox when they reply.
            </DialogDescription>

            {/* Templates */}
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <select
                aria-label="Template"
                value={templateId ?? ""}
                onChange={(e) => pickTemplate(e.target.value)}
                disabled={!templatesLoaded}
                className="h-8 min-w-0 flex-1 rounded-control border border-border bg-surface px-2 text-sm text-primary disabled:text-tertiary coarse:h-[44px] coarse:text-input"
              >
                <option value="">
                  {!templatesLoaded
                    ? "Loading templates…"
                    : templates.length === 0
                      ? "No templates yet"
                      : "No template"}
                </option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
              {template && edited && (
                <Button
                  size="sm"
                  onClick={() => void updateTemplate()}
                  disabled={savingTemplate || !trimmed}
                >
                  Update template
                </Button>
              )}
              {template && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => void deleteTemplate()}
                  disabled={savingTemplate}
                  aria-label={`Delete template ${template.name}`}
                  title="Delete template"
                >
                  <Trash2 size={13} strokeWidth={1.5} />
                </Button>
              )}
              {newTemplateName === null ? (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setNewTemplateName("")}
                  disabled={!trimmed}
                >
                  Save as template
                </Button>
              ) : (
                <form
                  className="flex w-full items-center gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void saveNewTemplate();
                  }}
                >
                  <Input
                    autoFocus
                    value={newTemplateName}
                    onChange={(e) => setNewTemplateName(e.target.value)}
                    placeholder="Template name"
                    maxLength={80}
                    aria-label="Template name"
                  />
                  <Button
                    size="sm"
                    type="submit"
                    disabled={savingTemplate || !newTemplateName.trim()}
                  >
                    Save
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    type="button"
                    onClick={() => setNewTemplateName(null)}
                  >
                    Cancel
                  </Button>
                </form>
              )}
              <Link
                href="/templates"
                className="ml-auto text-xs text-secondary underline decoration-dotted underline-offset-2 hover:text-primary"
              >
                Manage templates
              </Link>
            </div>

            {/* Message */}
            <div className="mt-3 flex flex-col gap-1.5">
              <textarea
                ref={textareaRef}
                value={body}
                onChange={(e) => {
                  setBody(e.target.value);
                  setConfirming(false);
                }}
                rows={5}
                maxLength={OUTREACH_MAX}
                placeholder={`Hi {first_name}, thanks for using {app}!`}
                aria-label="Message"
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
                    body.length > OUTREACH_MAX - 50
                      ? "text-status-danger"
                      : "text-tertiary",
                  )}
                >
                  {body.length}/{OUTREACH_MAX}
                </span>
              </div>
            </div>

            {/* Preview */}
            {trimmed && sample && (
              <div className="mt-3 rounded-control border border-border bg-bg px-2.5 py-2">
                <p className="text-2xs uppercase tracking-wide text-tertiary">
                  Preview for {sample.name ?? sample.revenuecat_id}
                  {sample.language && isTranslated(sample.language)
                    ? ` · sent in ${languageName(sample.language)}`
                    : ""}
                </p>
                <p className="mt-1 whitespace-pre-wrap break-words text-sm text-primary">
                  {renderTemplate(trimmed, sample, appName)}
                </p>
                {usesName && nameless > 0 && (
                  <p className="mt-1.5 text-2xs text-tertiary">
                    {nameless} recipient{nameless === 1 ? " has" : "s have"} no
                    name on record. For them the name is left out — &ldquo;Hi
                    {" {first_name},"}&rdquo; reads &ldquo;Hi,&rdquo; — so put
                    it after a greeting rather than first.
                  </p>
                )}
              </div>
            )}

            {/* Push */}
            <label className="mt-3 flex cursor-pointer items-start gap-2.5">
              <input
                type="checkbox"
                checked={sendPush}
                onChange={(e) => {
                  setSendPush(e.target.checked);
                  setConfirming(false);
                }}
                className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-[var(--color-accent)] coarse:h-5 coarse:w-5"
              />
              <span className="flex flex-col gap-0.5">
                <span className="text-sm text-primary">
                  Also send a push notification
                  <span className="tnum text-tertiary">
                    {" "}
                    · reaches {reachable} of {count}
                  </span>
                </span>
                <span className="text-xs text-tertiary">
                  Without it, users see a badge on the support button. Apple
                  doesn&apos;t allow promotional pushes unless users opted in
                  to them — use push for service messages.
                </span>
              </span>
            </label>

            {error && (
              <p role="alert" className="mt-3 text-xs text-status-danger">
                {error}
              </p>
            )}

            <div className="mt-4 flex items-center justify-end gap-2">
              {confirming ? (
                <>
                  <span className="mr-auto text-xs text-secondary">
                    This can&apos;t be unsent.
                  </span>
                  <Button
                    variant="ghost"
                    onClick={() => setConfirming(false)}
                    disabled={sending}
                  >
                    Back
                  </Button>
                  <Button
                    variant="primary"
                    onClick={() => void send()}
                    disabled={sending}
                  >
                    {sending ? "Sending…" : `Send to ${audience}`}
                  </Button>
                </>
              ) : (
                <>
                  <Button variant="ghost" onClick={() => handleOpenChange(false)}>
                    Cancel
                  </Button>
                  <Button
                    variant="primary"
                    onClick={() => setConfirming(true)}
                    disabled={!trimmed || count === 0}
                  >
                    Review and send
                  </Button>
                </>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
