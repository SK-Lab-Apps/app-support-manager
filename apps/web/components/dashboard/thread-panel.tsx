"use client";

import { RotateCw, Star, X } from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { createClient } from "@/lib/supabase/client";
import { callFunction } from "@/lib/functions";
import { isTranslated, languageName } from "@/lib/languages";
import type {
  MessageKind,
  MessageRow,
  PushSubscriptionRow,
  QueryListRow,
  StoreListing,
  StorePlatform,
  TranslationStatus,
} from "@/lib/types";
import { absoluteTime, cn, formatDate, relativeTime } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  LanguageChip,
  PlanChip,
  PushStatusChip,
  StatusIndicator,
} from "@/components/ui/chips";
import { IconButton } from "@/components/ui/icon-button";
import { Skeleton } from "@/components/ui/skeleton";

const ADMIN_MAX = 1000;

interface RawMessage {
  id: string;
  query_id: string;
  sender: "user" | "admin";
  admin_id: string | null;
  body: string;
  body_translated: string | null;
  body_language: string | null;
  translation_status: TranslationStatus;
  created_at: string;
  kind: MessageKind;
  review_opened_at: string | null;
  admins: { display_name: string } | null;
}

/** What the user's app can do with a review request. */
interface ReviewTarget {
  store: StoreListing;
  /** Null for SDKs before 0.4, which don't report it. */
  platform: StorePlatform | null;
  /** False when the user's SDK predates review buttons (shows text only). */
  rendersButton: boolean;
}

function storeLabel(platform: StorePlatform | null): string {
  if (platform === "ios") return "Rate on the App Store";
  if (platform === "android") return "Rate on Google Play";
  return "Rate in the store";
}

/** Whether this user's store is set up — any store when we can't tell. */
function storeReady(target: ReviewTarget | null): boolean {
  if (!target) return false;
  const { store, platform } = target;
  if (platform === "ios") return store.app_store_id !== null;
  if (platform === "android") return store.play_store_package !== null;
  return store.app_store_id !== null || store.play_store_package !== null;
}

/**
 * Right-side panel over the table on desktop (Linear-style), full screen on
 * mobile. Read-only when resolved, with a Reopen affordance.
 */
export function ThreadPanel({
  row,
  adminId,
  onClose,
  onChanged,
}: {
  row: QueryListRow;
  adminId: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [messages, setMessages] = useState<MessageRow[] | null>(null);
  // When the end user last opened this thread (their read receipt, written
  // by the mark-read edge function). Powers the "Seen" marker.
  const [userLastReadAt, setUserLastReadAt] = useState<string | null>(null);
  // Whether this user can be reached by push (null = never reported).
  const [pushSubscription, setPushSubscription] =
    useState<PushSubscriptionRow | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  // Message ids the admin has expanded to see the user's actual words.
  const [showOriginal, setShowOriginal] = useState<Set<string>>(new Set());
  const [retrying, setRetrying] = useState<string | null>(null);
  const [reviewTarget, setReviewTarget] = useState<ReviewTarget | null>(null);
  const [reviewMode, setReviewMode] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const resolved = row.status === "resolved";
  const translating = isTranslated(row.user_language);

  const markRead = useCallback(async () => {
    await supabase.from("read_receipts").upsert({
      query_id: row.id,
      reader: "admin",
      last_read_at: new Date().toISOString(),
    });
  }, [supabase, row.id]);

  const fetchMessages = useCallback(async () => {
    setLoadError(false);
    const { data, error } = await supabase
      .from("messages")
      .select(
        "id, query_id, sender, admin_id, body, body_translated, body_language, translation_status, created_at, kind, review_opened_at, admins(display_name)",
      )
      .eq("query_id", row.id)
      .order("created_at", { ascending: true });

    if (error) {
      setLoadError(true);
      return;
    }
    setMessages(
      ((data ?? []) as unknown as RawMessage[]).map((m) => ({
        id: m.id,
        query_id: m.query_id,
        sender: m.sender,
        admin_id: m.admin_id,
        body: m.body,
        body_translated: m.body_translated,
        body_language: m.body_language,
        translation_status: m.translation_status,
        created_at: m.created_at,
        admin_name: m.admins?.display_name ?? null,
        kind: m.kind,
        review_opened_at: m.review_opened_at,
      })),
    );
  }, [supabase, row.id]);

  const fetchUserReceipt = useCallback(async () => {
    const { data } = await supabase
      .from("read_receipts")
      .select("last_read_at")
      .eq("query_id", row.id)
      .eq("reader", "user")
      .maybeSingle();
    setUserLastReadAt(data?.last_read_at ?? null);
  }, [supabase, row.id]);

  const fetchPushSubscription = useCallback(async () => {
    const { data } = await supabase
      .from("push_subscriptions")
      .select("permission_status, expo_push_token, asked_at")
      .eq("app_id", row.app_id)
      .eq("revenuecat_id", row.revenuecat_id)
      .maybeSingle();
    setPushSubscription((data as PushSubscriptionRow | null) ?? null);
  }, [supabase, row.app_id, row.revenuecat_id]);

  const fetchReviewTarget = useCallback(async () => {
    const [{ data: app }, { data: user }] = await Promise.all([
      supabase
        .from("apps")
        .select("app_store_id, play_store_package")
        .eq("id", row.app_id)
        .maybeSingle(),
      supabase
        .from("app_users")
        .select("platform, sdk_version")
        .eq("app_id", row.app_id)
        .eq("revenuecat_id", row.revenuecat_id)
        .maybeSingle(),
    ]);
    setReviewTarget({
      store: {
        app_store_id: app?.app_store_id ?? null,
        play_store_package: app?.play_store_package ?? null,
      },
      platform: (user?.platform as StorePlatform | null) ?? null,
      rendersButton: Boolean(user?.sdk_version),
    });
  }, [supabase, row.app_id, row.revenuecat_id]);

  // Opening a thread marks it read on the admin side.
  useEffect(() => {
    void fetchMessages();
    void fetchUserReceipt();
    void fetchPushSubscription();
    void fetchReviewTarget();
    void markRead();
  }, [
    fetchMessages,
    fetchUserReceipt,
    fetchPushSubscription,
    fetchReviewTarget,
    markRead,
  ]);

  // Live thread: refetch (and re-mark read) when a message lands here.
  useEffect(() => {
    const channel = supabase
      .channel(`thread-${row.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `query_id=eq.${row.id}`,
        },
        () => {
          void fetchMessages();
          void markRead();
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "messages",
          filter: `query_id=eq.${row.id}`,
        },
        () => {
          // A translation landing on a message already on screen, or the
          // user tapping a review request's button. Refetch only — this is
          // not new activity, so it must not clear the unread marker or
          // move the read receipt.
          void fetchMessages();
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "read_receipts",
          filter: `query_id=eq.${row.id}`,
        },
        (payload) => {
          const receipt = payload.new as {
            reader?: string;
            last_read_at?: string;
          };
          if (receipt.reader === "user" && receipt.last_read_at) {
            setUserLastReadAt(receipt.last_read_at);
          }
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [supabase, row.id, fetchMessages, markRead]);

  // The last admin message the user has seen — the "Seen" marker goes there;
  // anything after it is implicitly unread by the user.
  const lastSeenAdminMessageId = useMemo(() => {
    if (!messages || !userLastReadAt) return null;
    const readUpTo = Date.parse(userLastReadAt);
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m?.sender === "admin" && Date.parse(m.created_at) <= readUpTo) {
        return m.id;
      }
    }
    return null;
  }, [messages, userLastReadAt]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  // Ask once per stretch of conversation: after a review request, wait for
  // the user to write again before asking a second time.
  const askedSinceUserWrote = useMemo(() => {
    for (let i = (messages?.length ?? 0) - 1; i >= 0; i--) {
      const m = messages?.[i];
      if (m?.sender === "user") return false;
      if (m?.kind === "review_request") return true;
    }
    return false;
  }, [messages]);

  const reviewBlocked = !storeReady(reviewTarget)
    ? "Add this app's store listing first (the star in the app's header)"
    : askedSinceUserWrote
      ? "Already asked — wait until they write again"
      : null;

  function toggleReviewMode() {
    const next = !reviewMode;
    setReviewMode(next);
    if (next && draft.trim() === "") {
      setDraft(
        `If we've helped, would you rate ${row.app_name}? It only takes a moment and means a lot to us.`,
      );
    }
  }

  async function handleSend(e: FormEvent) {
    e.preventDefault();
    const body = draft.trim();
    if (!body || body.length > ADMIN_MAX || resolved) return;

    setSending(true);
    setSendError(false);
    const { data: inserted, error } = await supabase
      .from("messages")
      .insert({
        query_id: row.id,
        sender: "admin",
        admin_id: adminId,
        body,
        body_language: "en",
        translation_status: translating ? "pending" : "skipped",
        kind: reviewMode ? "review_request" : "text",
      })
      .select("id")
      .single();
    setSending(false);

    if (error || !inserted) {
      setSendError(true);
      return;
    }
    setDraft("");
    setReviewMode(false);
    await fetchMessages();
    onChanged();
    // Translate first, then notify: the push copy is localized either way,
    // but a user who taps it should land on a thread that already reads in
    // their language. Neither call blocks the reply, which is committed.
    void translateAndNotify(inserted.id);
  }

  /**
   * Best-effort follow-ups for the reply that was just saved. Deliberately
   * not awaited by the send handler: a translation outage, a user who
   * declined notifications, or an Expo outage must never affect sending.
   *
   * Both steps have a server-side backstop — the pg_cron sweep picks up a
   * translation that never happened — so a closed tab costs a delay, not a
   * dropped translation.
   */
  async function translateAndNotify(messageId: string) {
    if (translating) {
      await callFunction(supabase, "translate-message", { message_id: messageId });
      await fetchMessages();
    }
    await callFunction(supabase, "send-push", { query_id: row.id });
  }

  /** Manual retry for a translation that failed or is stuck. */
  async function retryTranslation(messageId: string) {
    setRetrying(messageId);
    await callFunction(supabase, "translate-message", { message_id: messageId });
    await fetchMessages();
    setRetrying(null);
  }

  async function setStatus(next: "open" | "resolved") {
    setUpdatingStatus(true);
    const { error } = await supabase
      .from("queries")
      .update(
        next === "resolved"
          ? {
              status: "resolved",
              resolved_at: new Date().toISOString(),
              resolved_by: adminId,
            }
          : { status: "open", resolved_at: null, resolved_by: null },
      )
      .eq("id", row.id);
    setUpdatingStatus(false);
    if (!error) onChanged();
  }

  return (
    <aside
      role="dialog"
      aria-label="Query thread"
      className={cn(
        // Full screen on phones; a side panel that grows with the viewport
        // from md up, never wider than the screen can spare.
        "fixed inset-0 z-30 flex flex-col bg-bg",
        "pl-safe-l pr-safe-r pt-safe-t",
        "md:inset-y-0 md:left-auto md:right-0 md:w-[420px] md:max-w-[calc(100vw-3rem)]",
        "md:border-l md:border-border md:bg-surface md:shadow-overlay",
        "lg:w-[480px] xl:w-[540px]",
      )}
    >
      {/* Header */}
      <div className="flex shrink-0 flex-col gap-2 border-b border-border px-3 py-3 md:px-4">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium text-primary">
            {row.user_name}
          </span>
          <PlanChip plan={row.plan} className="shrink-0" />
          <span className="tnum hidden truncate text-2xs text-tertiary xs:block">
            {row.revenuecat_id}
          </span>
          <div className="ml-auto flex shrink-0 items-center gap-1.5">
            {resolved ? (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => void setStatus("open")}
                disabled={updatingStatus}
              >
                Reopen
              </Button>
            ) : (
              <Button
                size="sm"
                variant="primary"
                onClick={() => void setStatus("resolved")}
                disabled={updatingStatus}
              >
                Resolve
              </Button>
            )}
            <IconButton onClick={onClose} aria-label="Close thread">
              <X size={15} strokeWidth={1.5} />
            </IconButton>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-tertiary">
          <StatusIndicator status={row.status} />
          <span className="tnum">v{row.app_version}</span>
          <span className="tnum" title={absoluteTime(row.created_at)}>
            {relativeTime(row.created_at)}
          </span>
          {translating && row.user_language && (
            <LanguageChip language={row.user_language} />
          )}
          <PushStatusChip subscription={pushSubscription} />
          {row.initiated_by === "admin" && (
            <span title="This conversation began with a message sent from the Users tab">
              Started by us
            </span>
          )}
        </div>
      </div>

      {/* Messages */}
      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-4 md:px-4"
      >
        {loadError ? (
          <div className="flex flex-col items-center gap-3 py-12 text-center">
            <p className="text-sm text-secondary">Couldn&apos;t load thread</p>
            <Button size="sm" onClick={() => void fetchMessages()}>
              <RotateCw size={12} strokeWidth={1.5} />
              Retry
            </Button>
          </div>
        ) : messages === null ? (
          <div className="flex flex-col gap-3">
            <Skeleton className="h-16 w-3/4 rounded-card" />
            <Skeleton className="ml-auto h-12 w-2/3 rounded-card" />
            <Skeleton className="h-12 w-3/4 rounded-card" />
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {messages.map((m) => {
              // English first, always: a user message reads as its
              // translation, ours as what we typed. The original is one
              // click away rather than shown side by side, which would
              // double the length of every thread.
              const original = m.sender === "user" && m.body_language !== "en";
              const english =
                m.sender === "user" ? (m.body_translated ?? m.body) : m.body;
              const expanded = showOriginal.has(m.id);
              const pending = m.translation_status === "pending";
              const failed = m.translation_status === "failed";

              return (
                <div
                  key={m.id}
                  className={cn(
                    "flex max-w-[90%] flex-col gap-1 sm:max-w-[85%]",
                    m.sender === "admin" ? "ml-auto items-end" : "items-start",
                  )}
                >
                  {m.sender === "admin" && (
                    <span className="text-2xs text-tertiary">
                      {m.admin_name ?? "Admin"}
                    </span>
                  )}
                  <div
                    className={cn(
                      "rounded-card border px-3 py-2 text-sm leading-relaxed",
                      m.sender === "admin"
                        ? "border-transparent bg-accent-muted text-primary"
                        : "border-border bg-surface text-primary md:bg-bg",
                    )}
                  >
                    <p className="whitespace-pre-wrap break-words">{english}</p>
                    {m.kind === "review_request" && (
                      // How the button looks in the app — not clickable here.
                      <span
                        aria-hidden
                        className="mt-2 flex items-center justify-center gap-1.5 rounded-control bg-accent px-2.5 py-1 text-xs font-medium text-accent-fg"
                      >
                        <Star size={11} strokeWidth={2} />
                        {storeLabel(reviewTarget?.platform ?? null)}
                      </span>
                    )}
                    {expanded && (
                      <p className="mt-2 whitespace-pre-wrap break-words border-t border-border pt-2 text-secondary">
                        {m.body}
                      </p>
                    )}
                  </div>

                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-2xs text-tertiary">
                    <span className="tnum" title={absoluteTime(m.created_at)}>
                      {relativeTime(m.created_at)}
                    </span>

                    {m.id === lastSeenAdminMessageId && userLastReadAt && (
                      <span title={`Seen ${absoluteTime(userLastReadAt)}`}>
                        Seen
                      </span>
                    )}

                    {/* A user message we translated: say so, and offer the
                        words they actually wrote. */}
                    {original && !pending && !failed && (
                      <button
                        type="button"
                        onClick={() =>
                          setShowOriginal((prev) => {
                            const next = new Set(prev);
                            if (next.has(m.id)) next.delete(m.id);
                            else next.add(m.id);
                            return next;
                          })
                        }
                        className="text-2xs text-tertiary underline decoration-dotted underline-offset-2 transition-colors duration-fast hover:text-secondary"
                      >
                        {expanded
                          ? "Hide original"
                          : `Translated from ${languageName(m.body_language)}`}
                      </button>
                    )}

                    {m.kind === "review_request" &&
                      (m.review_opened_at ? (
                        <span
                          className="text-status-resolved"
                          title={`${absoluteTime(m.review_opened_at)} — whether they left a review, the store doesn't say`}
                        >
                          Opened the store · {relativeTime(m.review_opened_at)}
                        </span>
                      ) : (
                        <span>Review request</span>
                      ))}

                    {pending && <span>Translating…</span>}

                    {failed && (
                      <>
                        <span className="text-status-danger">
                          {m.sender === "user"
                            ? "Shown untranslated"
                            : "Sent untranslated"}
                        </span>
                        <button
                          type="button"
                          onClick={() => void retryTranslation(m.id)}
                          disabled={retrying === m.id}
                          className="text-2xs text-tertiary underline decoration-dotted underline-offset-2 transition-colors duration-fast hover:text-secondary disabled:opacity-50"
                        >
                          {retrying === m.id ? "Retrying…" : "Retry"}
                        </button>
                      </>
                    )}
                  </span>
                </div>
              );
            })}

            {resolved && row.resolved_at && (
              <div className="my-2 flex items-center gap-3">
                <span className="h-px flex-1 bg-border" />
                <span className="text-2xs text-tertiary">
                  Resolved by {row.resolved_by_name ?? "admin"} ·{" "}
                  {formatDate(row.resolved_at)}
                </span>
                <span className="h-px flex-1 bg-border" />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Composer — clears the iOS home indicator when full screen. */}
      <div className="shrink-0 border-t border-border px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:px-4">
        {resolved ? (
          <p className="py-1 text-center text-xs text-tertiary">
            Thread is resolved and read-only
          </p>
        ) : (
          <form onSubmit={handleSend} className="flex flex-col gap-2">
            {reviewMode && (
              <p className="text-2xs leading-relaxed text-secondary">
                Adds a &ldquo;{storeLabel(reviewTarget?.platform ?? null)}&rdquo;
                button under your message.{" "}
                {reviewTarget && !reviewTarget.rendersButton
                  ? "This user's app version shows the text without the button. "
                  : ""}
                Don&apos;t offer anything in exchange — Apple and Google
                don&apos;t allow it.
              </p>
            )}
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                  void handleSend(e);
                }
              }}
              placeholder={
                translating
                  ? `Reply in English — sent as ${languageName(row.user_language)}`
                  : "Reply to this query"
              }
              aria-label="Reply"
              rows={3}
              maxLength={ADMIN_MAX}
              className={cn(
                "w-full resize-none rounded-control border border-border bg-surface px-2.5 py-2 text-sm text-primary",
                "placeholder:text-tertiary transition-colors duration-fast",
                "hover:border-border-strong focus:border-border-strong",
                "coarse:text-input md:bg-bg",
              )}
            />
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
              <span
                className={cn(
                  "tnum text-2xs",
                  draft.length > ADMIN_MAX - 50
                    ? "text-status-danger"
                    : "text-tertiary",
                )}
              >
                {draft.length}/{ADMIN_MAX}
              </span>
              <div className="ml-auto flex items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={reviewMode ? "secondary" : "ghost"}
                  onClick={toggleReviewMode}
                  disabled={!reviewMode && reviewBlocked !== null}
                  title={reviewBlocked ?? "Add a store review button to this reply"}
                  aria-pressed={reviewMode}
                >
                  <Star size={12} strokeWidth={1.5} />
                  Review request
                </Button>
                {sendError && (
                  <span className="text-xs text-status-danger">
                    Couldn&apos;t send — try again
                  </span>
                )}
                <Button
                  type="submit"
                  size="sm"
                  variant="primary"
                  disabled={sending || draft.trim().length === 0}
                >
                  {sending
                    ? "Sending…"
                    : reviewMode
                      ? "Send request"
                      : "Send"}
                </Button>
              </div>
            </div>
          </form>
        )}
      </div>
    </aside>
  );
}
