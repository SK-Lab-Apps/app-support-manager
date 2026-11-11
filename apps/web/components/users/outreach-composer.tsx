"use client";

import { Check, Star, Trash2 } from "lucide-react";
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
import {
  NO_INCENTIVES,
  REVIEW_SUGGESTION,
  STORE_LISTING_MISSING,
  hasStoreListing,
  showsReviewButton,
  storeLabel,
} from "@/lib/review";
import type { AppUserRow, MessageTemplate, StoreListing } from "@/lib/types";
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

function audienceOf(users: AppUserRow[]): string {
  return users.length === 1
    ? (users[0]?.name ?? "1 user")
    : `${users.length} users`;
}

/**
 * Writes a first message to the selected users. Each gets it as a new
 * conversation in their support chat, translated into their language, with
 * {first_name} / {name} / {app} filled in. It reaches the inbox when they
 * reply.
 *
 * As a review request, the message carries a store review button in the
 * app, and anyone asked before is left out unless the admin says otherwise.
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
  // Where review buttons point; null until loaded.
  const [store, setStore] = useState<StoreListing | null>(null);
  const [reviewMode, setReviewMode] = useState(false);
  const [skipAsked, setSkipAsked] = useState(true);

  useEffect(() => {
    if (!open) return;
    setTemplatesLoaded(false);
    setStore(null);
    void supabase
      .from("message_templates")
      .select("*")
      .order("name")
      .then(({ data }) => {
        setTemplates((data ?? []) as MessageTemplate[]);
        setTemplatesLoaded(true);
      });
    void supabase
      .from("apps")
      .select("app_store_id, play_store_package")
      .eq("id", appId)
      .maybeSingle()
      .then(({ data }) =>
        setStore({
          app_store_id: data?.app_store_id ?? null,
          play_store_package: data?.play_store_package ?? null,
        }),
      );
  }, [open, appId, supabase]);

  // Asked before, as a reply in a conversation or a send from here. Truthy
  // checks: before the outreach_review_requests migration the view has no
  // such columns, and nobody counts as asked.
  const asked = recipients.filter((r) => Boolean(r.review_requested_at));
  const askedOpened = asked.filter((r) => Boolean(r.review_opened_at)).length;
  const sendTo =
    reviewMode && skipAsked
      ? recipients.filter((r) => !r.review_requested_at)
      : recipients;
  const reviewBlocked =
    store === null
      ? "Checking the store listing…"
      : !hasStoreListing(store)
        ? STORE_LISTING_MISSING
        : null;
  const withButton =
    store === null ? 0 : sendTo.filter((r) => showsReviewButton(store, r)).length;

  const template = templates.find((t) => t.id === templateId) ?? null;
  const edited = template !== null && template.body !== body;
  const trimmed = body.trim();
  const sample = sendTo[0] ?? null;
  const reachable = sendTo.filter((r) => r.push_reachable).length;
  const languages = [
    ...new Set(
      sendTo
        .map((r) => r.language)
        .filter((l): l is string => isTranslated(l) && l !== null),
    ),
  ];
  const usesName = /\{(first_name|name)\}/.test(body);
  const nameless = sendTo.filter((r) => !r.name?.trim()).length;

  function reset() {
    setTemplateId(null);
    setBody("");
    setSendPush(false);
    setNewTemplateName(null);
    setConfirming(false);
    setError(null);
    setResult(null);
    setReviewMode(false);
    setSkipAsked(true);
  }

  function toggleReview(next: boolean) {
    setReviewMode(next);
    setConfirming(false);
    // Start a request from the suggestion, and don't leave it behind in
    // a plain message.
    if (next && trimmed === "") setBody(REVIEW_SUGGESTION);
    if (!next && body === REVIEW_SUGGESTION) setBody("");
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
      revenuecat_ids: sendTo.map((r) => r.revenuecat_id),
      body: trimmed,
      // A template edited before sending is no longer that template.
      template_id: template && !edited ? template.id : null,
      send_push: sendPush,
      kind: reviewMode ? "review_request" : "text",
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

  const count = sendTo.length;
  const audience = audienceOf(sendTo);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-xl">
        {result ? (
          <>
            <DialogTitle className="flex items-center gap-2 text-lg font-semibold tracking-heading">
              <Check size={16} strokeWidth={2} className="text-status-resolved" />
              {reviewMode ? "Review request sent" : "Sent"} to {result.sent}{" "}
              {result.sent === 1 ? "user" : "users"}
            </DialogTitle>
            <DialogDescription className="mt-1 text-sm text-secondary">
              {sendPush
                ? `${result.pushed} push notification${result.pushed === 1 ? "" : "s"} delivered. `
                : ""}
              Each conversation joins the inbox when the user replies.
              {reviewMode && " Who taps through to the store shows in Sent."}
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
              {/* Everyone selected may have been left out; name who was picked. */}
              {reviewMode
                ? `Ask ${count > 0 ? audience : audienceOf(recipients)} for a review`
                : `Message ${audience}`}
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
                {reviewMode &&
                  store !== null &&
                  (showsReviewButton(store, sample) ? (
                    // How the button looks in the app — not clickable here.
                    <span
                      aria-hidden
                      className="mt-2 flex items-center justify-center gap-1.5 rounded-control bg-accent px-2.5 py-1 text-xs font-medium text-accent-fg"
                    >
                      <Star size={11} strokeWidth={2} />
                      {storeLabel(sample.platform)}
                    </span>
                  ) : (
                    <p className="mt-1.5 text-2xs text-tertiary">
                      Their app shows this without the button.
                    </p>
                  ))}
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

            {/* Review request */}
            <label
              className={cn(
                "mt-3 flex items-start gap-2.5",
                !reviewMode && reviewBlocked !== null
                  ? "cursor-not-allowed"
                  : "cursor-pointer",
              )}
            >
              <input
                type="checkbox"
                checked={reviewMode}
                onChange={(e) => toggleReview(e.target.checked)}
                disabled={!reviewMode && reviewBlocked !== null}
                className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-[var(--color-accent)] coarse:h-5 coarse:w-5"
              />
              <span className="flex flex-col gap-0.5">
                <span
                  className={cn(
                    "text-sm",
                    !reviewMode && reviewBlocked !== null
                      ? "text-tertiary"
                      : "text-primary",
                  )}
                >
                  Ask for a review
                  {reviewMode && count > 0 && (
                    <span className="tnum text-tertiary">
                      {" "}
                      · button shows for {withButton} of {count}
                    </span>
                  )}
                </span>
                <span className="text-xs text-tertiary">
                  {!reviewMode && reviewBlocked !== null ? (
                    reviewBlocked
                  ) : (
                    <>
                      Adds a &ldquo;Rate on the App Store / Google
                      Play&rdquo; button under the message, for each
                      user&apos;s store.
                      {withButton < count &&
                        " Older app versions, and users whose store isn't set up, get the text alone."}{" "}
                      {NO_INCENTIVES}
                    </>
                  )}
                </span>
              </span>
            </label>
            {reviewMode && asked.length > 0 && (
              <label className="mt-2 flex cursor-pointer items-start gap-2.5 pl-6 coarse:pl-[30px]">
                <input
                  type="checkbox"
                  checked={skipAsked}
                  onChange={(e) => {
                    setSkipAsked(e.target.checked);
                    setConfirming(false);
                  }}
                  className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-[var(--color-accent)] coarse:h-5 coarse:w-5"
                />
                <span className="flex flex-col gap-0.5">
                  <span className="text-sm text-primary">
                    Leave out{" "}
                    {asked.length === recipients.length
                      ? asked.length === 1
                        ? "this user — already asked"
                        : `all ${asked.length} — already asked`
                      : `the ${asked.length} already asked`}
                  </span>
                  <span className="text-xs text-tertiary">
                    {askedOpened > 0 &&
                      `${askedOpened} of them opened the store. `}
                    {skipAsked && count === 0
                      ? "That's everyone selected — untick to ask again."
                      : "They've had a review request before, in a reply or a send."}
                  </span>
                </span>
              </label>
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
