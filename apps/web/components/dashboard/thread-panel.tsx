"use client";

import { RotateCw, X } from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { createClient } from "@/lib/supabase/client";
import type { MessageRow, QueryListRow } from "@/lib/types";
import { absoluteTime, cn, formatDate, relativeTime } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { PaidTag, StatusIndicator, TypeChip } from "@/components/ui/chips";
import { Skeleton } from "@/components/ui/skeleton";

const ADMIN_MAX = 1000;

interface RawMessage {
  id: string;
  query_id: string;
  sender: "user" | "admin";
  admin_id: string | null;
  body: string;
  created_at: string;
  admins: { display_name: string } | null;
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
  const [loadError, setLoadError] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const resolved = row.status === "resolved";

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
        "id, query_id, sender, admin_id, body, created_at, admins(display_name)",
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
        created_at: m.created_at,
        admin_name: m.admins?.display_name ?? null,
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

  // Opening a thread marks it read on the admin side.
  useEffect(() => {
    void fetchMessages();
    void fetchUserReceipt();
    void markRead();
  }, [fetchMessages, fetchUserReceipt, markRead]);

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

  async function handleSend(e: FormEvent) {
    e.preventDefault();
    const body = draft.trim();
    if (!body || body.length > ADMIN_MAX || resolved) return;

    setSending(true);
    setSendError(false);
    const { error } = await supabase.from("messages").insert({
      query_id: row.id,
      sender: "admin",
      admin_id: adminId,
      body,
    });
    setSending(false);

    if (error) {
      setSendError(true);
      return;
    }
    setDraft("");
    await fetchMessages();
    onChanged();
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
        "fixed inset-0 z-30 flex flex-col bg-bg",
        "md:inset-y-0 md:left-auto md:right-0 md:w-[480px] md:border-l md:border-border md:bg-surface md:shadow-overlay",
      )}
    >
      {/* Header */}
      <div className="flex shrink-0 flex-col gap-2 border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium text-primary">
            {row.user_name}
          </span>
          {row.is_paid && <PaidTag />}
          <span className="tnum truncate text-2xs text-tertiary">
            {row.revenuecat_id}
          </span>
          <div className="ml-auto flex items-center gap-1.5">
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
            <button
              onClick={onClose}
              aria-label="Close thread"
              className="rounded-control p-1.5 text-secondary transition-colors duration-fast hover:bg-surface-hover hover:text-primary"
            >
              <X size={15} strokeWidth={1.5} />
            </button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-tertiary">
          {/* <TypeChip type={row.type} /> */}
          <StatusIndicator status={row.status} />
          <span className="tnum">v{row.app_version}</span>
          <span className="tnum" title={absoluteTime(row.created_at)}>
            {relativeTime(row.created_at)}
          </span>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {loadError ? (
          <div className="flex flex-col items-center gap-3 py-12">
            <p className="text-sm text-secondary">Couldn&apos;t load thread</p>
            <button
              onClick={() => void fetchMessages()}
              className="inline-flex items-center gap-1.5 rounded-control border border-border bg-surface px-2.5 py-1 text-xs text-primary transition-colors duration-fast hover:bg-surface-hover"
            >
              <RotateCw size={12} strokeWidth={1.5} />
              Retry
            </button>
          </div>
        ) : messages === null ? (
          <div className="flex flex-col gap-3">
            <Skeleton className="h-16 w-3/4 rounded-card" />
            <Skeleton className="ml-auto h-12 w-2/3 rounded-card" />
            <Skeleton className="h-12 w-3/4 rounded-card" />
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {messages.map((m) => (
              <div
                key={m.id}
                className={cn(
                  "flex max-w-[85%] flex-col gap-1",
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
                  <p className="whitespace-pre-wrap break-words">{m.body}</p>
                </div>
                <span
                  className="tnum text-2xs text-tertiary"
                  title={absoluteTime(m.created_at)}
                >
                  {relativeTime(m.created_at)}
                  {m.id === lastSeenAdminMessageId && userLastReadAt && (
                    <span title={`Seen ${absoluteTime(userLastReadAt)}`}>
                      {" · Seen"}
                    </span>
                  )}
                </span>
              </div>
            ))}

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

      {/* Composer */}
      <div className="shrink-0 border-t border-border px-4 py-3">
        {resolved ? (
          <p className="py-1 text-center text-xs text-tertiary">
            Thread is resolved and read-only
          </p>
        ) : (
          <form onSubmit={handleSend} className="flex flex-col gap-2">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                  void handleSend(e);
                }
              }}
              placeholder="Reply to this query"
              aria-label="Reply"
              rows={3}
              maxLength={ADMIN_MAX}
              className={cn(
                "w-full resize-none rounded-control border border-border bg-surface px-2.5 py-2 text-sm text-primary",
                "placeholder:text-tertiary transition-colors duration-fast",
                "hover:border-border-strong focus:border-border-strong",
                "md:bg-bg",
              )}
            />
            <div className="flex items-center justify-between">
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
              <div className="flex items-center gap-2">
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
                  {sending ? "Sending…" : "Send"}
                </Button>
              </div>
            </div>
          </form>
        )}
      </div>
    </aside>
  );
}
