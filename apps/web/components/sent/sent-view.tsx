"use client";

import { BellRing, Check, CornerUpLeft, RotateCw, Send, Trash2, Zap } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { automationLabel } from "@/lib/automations";
import { createClient } from "@/lib/supabase/client";
import type { BroadcastRecipient, BroadcastSummary } from "@/lib/types";
import { absoluteTime, relativeTime } from "@/lib/utils";
import { ClearSentLogDialog } from "@/components/sent/clear-sent-log-dialog";
import { TemplateText } from "@/components/template-text";
import { Button } from "@/components/ui/button";
import { FilterSelect } from "@/components/ui/filter-select";
import { TableSkeleton } from "@/components/ui/skeleton";

const SHOWN = 100;

type Source = "all" | "manual" | "automated";

const SOURCE_OPTIONS: { value: Source; label: string }[] = [
  { value: "all", label: "All sends" },
  { value: "manual", label: "From Users" },
  { value: "automated", label: "Automated" },
];

function percent(part: number, whole: number): string {
  return whole === 0 ? "—" : `${Math.round((part / whole) * 100)}%`;
}

/**
 * "To Maya Okafor", "To Maya Okafor, Ben Ito and Ana Ruiz", or the first
 * three and a button for the rest, which lists everyone a send reached
 * with how it landed for each.
 */
function Recipients({ send }: { send: BroadcastSummary }) {
  const supabase = useMemo(() => createClient(), []);
  const [open, setOpen] = useState(false);
  const [all, setAll] = useState<BroadcastRecipient[] | null>(null);
  const [error, setError] = useState(false);

  const names = send.recipient_names;
  const more = send.recipient_listed - names.length;

  async function expand() {
    setOpen(true);
    if (all !== null) return;
    setError(false);
    const { data, error: fetchError } = await supabase
      .from("broadcast_recipients")
      .select("query_id, revenuecat_id, user_name, read, replied")
      .eq("broadcast_id", send.id)
      .order("user_name")
      .limit(1000);
    if (fetchError) {
      setError(true);
      return;
    }
    setAll((data ?? []) as BroadcastRecipient[]);
  }

  if (names.length === 0) {
    return (
      <p className="text-xs text-tertiary">
        Their conversations have been deleted
      </p>
    );
  }

  const listed =
    more > 0
      ? names.join(", ")
      : names.length === 1
        ? names[0]
        : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;

  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-xs text-secondary">
        To <span className="text-primary">{listed}</span>
        {more > 0 && (
          <>
            {" and "}
            <button
              type="button"
              onClick={() => (open ? setOpen(false) : void expand())}
              aria-expanded={open}
              className="tnum text-primary underline decoration-dotted underline-offset-2 hover:text-accent"
            >
              {more} more
            </button>
          </>
        )}
      </p>
      {open &&
        (error ? (
          <p className="text-xs text-status-danger">
            Couldn&apos;t load recipients —{" "}
            <button
              type="button"
              onClick={() => void expand()}
              className="underline underline-offset-2"
            >
              retry
            </button>
          </p>
        ) : all === null ? (
          <p className="text-xs text-tertiary">Loading recipients…</p>
        ) : (
          <ul className="grid max-h-60 grid-cols-1 gap-x-4 overflow-y-auto overscroll-contain rounded-control border border-border bg-bg px-2.5 py-1.5 sm:grid-cols-2">
            {all.map((r) => (
              <li
                key={r.query_id}
                className="flex min-w-0 items-center gap-2 py-0.5 text-xs"
                title={r.revenuecat_id}
              >
                <span className="min-w-0 flex-1 truncate text-primary">
                  {r.user_name}
                </span>
                {r.replied ? (
                  <span className="inline-flex shrink-0 items-center gap-1 text-status-resolved">
                    <CornerUpLeft size={11} strokeWidth={1.5} />
                    Replied
                  </span>
                ) : r.read ? (
                  <span className="inline-flex shrink-0 items-center gap-1 text-secondary">
                    <Check size={11} strokeWidth={1.5} />
                    Read
                  </span>
                ) : (
                  <span className="shrink-0 text-tertiary">Not read</span>
                )}
              </li>
            ))}
          </ul>
        ))}
    </div>
  );
}

/**
 * Every send for this app — from the Users tab and from automations —
 * newest first, with who it went to and how it landed.
 */
export function SentView({ appId }: { appId: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [rows, setRows] = useState<BroadcastSummary[] | null>(null);
  /** Every send in the log; only the newest SHOWN are listed. */
  const [total, setTotal] = useState(0);
  /** Every send for the app, whatever the filter: what Clear log removes. */
  const [logTotal, setLogTotal] = useState(0);
  const [source, setSource] = useState<Source>("all");
  const [error, setError] = useState(false);
  const [clearOpen, setClearOpen] = useState(false);

  const fetchRows = useCallback(async () => {
    setError(false);
    let query = supabase
      .from("broadcast_summary")
      .select("*", { count: "exact" })
      .eq("app_id", appId);
    if (source === "manual") query = query.is("automation_event", null);
    if (source === "automated") query = query.not("automation_event", "is", null);
    const [{ data, count, error: fetchError }, { count: everything }] =
      await Promise.all([
        query.order("created_at", { ascending: false }).limit(SHOWN),
        supabase
          .from("broadcasts")
          .select("id", { count: "exact", head: true })
          .eq("app_id", appId),
      ]);
    if (fetchError) {
      setError(true);
      return;
    }
    setRows((data ?? []) as BroadcastSummary[]);
    setTotal(count ?? data?.length ?? 0);
    setLogTotal(everything ?? count ?? 0);
  }, [appId, supabase, source]);

  useEffect(() => {
    void fetchRows();
  }, [fetchRows]);

  // Read and reply counts move as users open their chats. A send or a
  // cleared log touches many conversations at once; one refetch covers
  // them all.
  useEffect(() => {
    let pending: ReturnType<typeof setTimeout> | undefined;
    const channel = supabase
      .channel(`sent-${appId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "queries", filter: `app_id=eq.${appId}` },
        () => {
          clearTimeout(pending);
          pending = setTimeout(() => void fetchRows(), 250);
        },
      )
      .subscribe();
    return () => {
      clearTimeout(pending);
      void supabase.removeChannel(channel);
    };
  }, [supabase, appId, fetchRows]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      {rows !== null && logTotal > 0 && (
        <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2 md:px-4">
          <FilterSelect
            label="Source"
            value={source}
            onChange={setSource}
            options={SOURCE_OPTIONS}
          />
          <span className="tnum text-xs text-tertiary">
            {total === 1 ? "1 send" : `${total} sends`}
            {total > rows.length && ` · newest ${rows.length} shown`}
          </span>
          <Button
            size="sm"
            variant="ghost"
            className="ml-auto"
            onClick={() => setClearOpen(true)}
          >
            <Trash2 size={13} strokeWidth={1.5} />
            Clear log
          </Button>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-safe-b">
        {error ? (
          <div className="flex flex-col items-center gap-3 px-3 py-16 text-center">
            <p className="text-sm text-secondary">Couldn&apos;t load sent messages</p>
            <Button size="sm" onClick={() => void fetchRows()}>
              <RotateCw size={12} strokeWidth={1.5} />
              Retry
            </Button>
          </div>
        ) : rows === null ? (
          <TableSkeleton rows={5} />
        ) : rows.length === 0 && logTotal > 0 ? (
          <div className="flex flex-col items-center gap-2 px-6 py-16 text-center">
            <p className="text-sm text-secondary">
              {source === "automated" ? "No automated sends yet" : "No sends from Users yet"}
            </p>
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-6 py-16 text-center">
            <Send size={18} strokeWidth={1.5} className="text-tertiary" />
            <p className="text-sm text-secondary">Nothing sent yet</p>
            <p className="max-w-sm text-xs text-tertiary">
              Select users in the{" "}
              <Link
                href={`/apps/${appId}/users`}
                className="underline decoration-dotted underline-offset-2 hover:text-secondary"
              >
                Users
              </Link>{" "}
              tab to message them first, or set up{" "}
              <Link
                href={`/apps/${appId}/automations`}
                className="underline decoration-dotted underline-offset-2 hover:text-secondary"
              >
                Automations
              </Link>
              .
            </p>
          </div>
        ) : (
          <ul>
            {rows.map((b) => (
              <li
                key={b.id}
                className="flex flex-col gap-2 border-b border-border px-3 py-3 md:px-4"
              >
                <p className="line-clamp-3 whitespace-pre-wrap break-words text-sm text-primary">
                  <TemplateText body={b.body} />
                </p>
                <Recipients send={b} />
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-tertiary">
                  <span className="tnum" title={absoluteTime(b.created_at)}>
                    {relativeTime(b.created_at)}
                  </span>
                  {b.automation_event ? (
                    <span
                      className="inline-flex items-center gap-1"
                      title={`Sent by the ${automationLabel(b.automation_event)} automation, written by ${b.sent_by_name}`}
                    >
                      <Zap size={11} strokeWidth={1.5} />
                      {automationLabel(b.automation_event)}
                    </span>
                  ) : (
                    <span>by {b.sent_by_name}</span>
                  )}
                  {b.template_name && <span>· {b.template_name}</span>}
                  {b.send_push && (
                    <span className="inline-flex items-center gap-1" title="Sent with a push notification">
                      <BellRing size={11} strokeWidth={1.5} />
                      Push
                    </span>
                  )}
                  <span className="tnum ml-auto flex gap-3 text-secondary">
                    <span title="Recipients">
                      {b.recipient_count} sent
                    </span>
                    <span title={`${b.read_count} opened their chat after it arrived`}>
                      {percent(b.read_count, b.recipient_count)} read
                    </span>
                    <span title={`${b.replied_count} replied — those conversations are in the inbox`}>
                      {percent(b.replied_count, b.recipient_count)} replied
                    </span>
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <ClearSentLogDialog
        open={clearOpen}
        onOpenChange={setClearOpen}
        appId={appId}
        count={logTotal}
        onCleared={() => {
          setRows([]);
          setTotal(0);
          setLogTotal(0);
        }}
      />
    </div>
  );
}
