"use client";

import { BellRing, RotateCw, Send, Trash2 } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { BroadcastSummary } from "@/lib/types";
import { absoluteTime, relativeTime } from "@/lib/utils";
import { ClearSentLogDialog } from "@/components/sent/clear-sent-log-dialog";
import { Button } from "@/components/ui/button";
import { TableSkeleton } from "@/components/ui/skeleton";

const SHOWN = 100;

function percent(part: number, whole: number): string {
  return whole === 0 ? "—" : `${Math.round((part / whole) * 100)}%`;
}

/** Placeholders read as what they are, not as text that went out. */
function Template({ body }: { body: string }) {
  const parts = body.split(/(\{(?:first_name|name|app)\})/g);
  return (
    <>
      {parts.map((part, i) =>
        /^\{(first_name|name|app)\}$/.test(part) ? (
          <span key={i} className="rounded-[3px] bg-surface-active px-0.5 font-mono text-[0.9em] text-secondary">
            {part}
          </span>
        ) : (
          part
        ),
      )}
    </>
  );
}

/** Every send from the Users tab for this app, newest first, with results. */
export function SentView({ appId }: { appId: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [rows, setRows] = useState<BroadcastSummary[] | null>(null);
  /** Every send in the log; only the newest SHOWN are listed. */
  const [total, setTotal] = useState(0);
  const [error, setError] = useState(false);
  const [clearOpen, setClearOpen] = useState(false);

  const fetchRows = useCallback(async () => {
    setError(false);
    const { data, count, error: fetchError } = await supabase
      .from("broadcast_summary")
      .select("*", { count: "exact" })
      .eq("app_id", appId)
      .order("created_at", { ascending: false })
      .limit(SHOWN);
    if (fetchError) {
      setError(true);
      return;
    }
    setRows((data ?? []) as BroadcastSummary[]);
    setTotal(count ?? data?.length ?? 0);
  }, [appId, supabase]);

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
      {rows !== null && rows.length > 0 && (
        <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2 md:px-4">
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
              tab to message them first.
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
                  <Template body={b.body} />
                </p>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-tertiary">
                  <span className="tnum" title={absoluteTime(b.created_at)}>
                    {relativeTime(b.created_at)}
                  </span>
                  <span>by {b.sent_by_name}</span>
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
        count={total}
        onCleared={() => {
          setRows([]);
          setTotal(0);
        }}
      />
    </div>
  );
}
