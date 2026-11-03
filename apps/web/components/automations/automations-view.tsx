"use client";

import { BellRing, Pause, Pencil, Play, Plus, RotateCw, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AUTOMATION_EVENTS, formatDelay } from "@/lib/automations";
import { createClient } from "@/lib/supabase/client";
import type { AutomationEvent, AutomationRow } from "@/lib/types";
import { absoluteTime, cn, relativeTime } from "@/lib/utils";
import { AutomationEditorDialog } from "@/components/automations/automation-editor-dialog";
import { DeleteAutomationDialog } from "@/components/automations/delete-automation-dialog";
import { TemplateText } from "@/components/template-text";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { TableSkeleton } from "@/components/ui/skeleton";

function percent(part: number, whole: number): string {
  return whole === 0 ? "—" : `${Math.round((part / whole) * 100)}%`;
}

/**
 * The app's automated messages: one per subscription event, each sent a
 * set delay after RevenueCat reports the event for a user.
 */
export function AutomationsView({
  appId,
  appName,
}: {
  appId: string;
  appName: string;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [rows, setRows] = useState<AutomationRow[] | null>(null);
  const [error, setError] = useState(false);
  /** The event whose message the editor is open for. */
  const [editing, setEditing] = useState<AutomationEvent | null>(null);
  const [deleting, setDeleting] = useState<AutomationRow | null>(null);
  const [toggling, setToggling] = useState<string | null>(null);
  const [toggleError, setToggleError] = useState<string | null>(null);

  const fetchRows = useCallback(async () => {
    setError(false);
    const { data, error: fetchError } = await supabase
      .from("automation_list")
      .select("*")
      .eq("app_id", appId);
    if (fetchError) {
      setError(true);
      return;
    }
    setRows((data ?? []) as AutomationRow[]);
  }, [appId, supabase]);

  useEffect(() => {
    void fetchRows();
  }, [fetchRows]);

  // Sends and replies move the counts; each is a conversation for the app.
  useEffect(() => {
    let pending: ReturnType<typeof setTimeout> | undefined;
    const channel = supabase
      .channel(`automations-${appId}`)
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

  const byEvent = new Map((rows ?? []).map((r) => [r.event, r]));

  async function toggle(row: AutomationRow) {
    setToggling(row.id);
    setToggleError(null);
    const { error: updateError } = await supabase
      .from("automations")
      .update({ enabled: !row.enabled })
      .eq("id", row.id);
    setToggling(null);
    if (updateError) {
      setToggleError(row.id);
      return;
    }
    await fetchRows();
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 border-b border-border px-3 py-2 md:px-4">
        <p className="text-xs text-tertiary">
          Each message starts a conversation in the user&apos;s support chat,
          translated into their language, a set time after RevenueCat reports
          the event. It joins your inbox when they reply. Needs the app&apos;s
          RevenueCat webhook.
        </p>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-safe-b">
        {error ? (
          <div className="flex flex-col items-center gap-3 px-3 py-16 text-center">
            <p className="text-sm text-secondary">Couldn&apos;t load automations</p>
            <Button size="sm" onClick={() => void fetchRows()}>
              <RotateCw size={12} strokeWidth={1.5} />
              Retry
            </Button>
          </div>
        ) : rows === null ? (
          <TableSkeleton rows={5} />
        ) : (
          <ul>
            {AUTOMATION_EVENTS.map(({ event, label, description }) => {
              const row = byEvent.get(event);
              return (
                <li
                  key={event}
                  className="flex items-start gap-2 border-b border-border px-3 py-3 md:px-4"
                >
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="flex min-w-0 flex-wrap items-baseline gap-x-2">
                      <span className="text-sm font-medium text-primary">{label}</span>
                      {row && !row.enabled && (
                        <span className="rounded-[4px] border border-border px-1.5 text-2xs text-secondary">
                          Paused
                        </span>
                      )}
                    </span>
                    <span className="text-xs text-tertiary">{description}</span>

                    {row ? (
                      <>
                        <button
                          type="button"
                          onClick={() => setEditing(event)}
                          className={cn(
                            "mt-1 line-clamp-3 whitespace-pre-wrap break-words text-left text-sm",
                            row.enabled ? "text-primary" : "text-secondary",
                          )}
                        >
                          <TemplateText body={row.body} />
                        </button>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-tertiary">
                          <span>After {formatDelay(row.delay_minutes)}</span>
                          {row.send_push && (
                            <span
                              className="inline-flex items-center gap-1"
                              title="Also sent as a push notification"
                            >
                              <BellRing size={11} strokeWidth={1.5} />
                              Push
                            </span>
                          )}
                          <span title={absoluteTime(row.updated_at)}>
                            Edited {relativeTime(row.updated_at)} by {row.updated_by_name}
                          </span>
                          <span className="tnum ml-auto flex gap-3 text-secondary">
                            {row.pending_count > 0 && (
                              <span title="Scheduled for users, not sent yet">
                                {row.pending_count} waiting
                              </span>
                            )}
                            <span title="Sent since the Sent log was last cleared">
                              {row.sent_count} sent
                            </span>
                            <span title={`${row.read_count} opened their chat after it arrived`}>
                              {percent(row.read_count, row.sent_count)} read
                            </span>
                            <span title={`${row.replied_count} replied — those conversations are in the inbox`}>
                              {percent(row.replied_count, row.sent_count)} replied
                            </span>
                          </span>
                        </div>
                        {toggleError === row.id && (
                          <p role="alert" className="text-xs text-status-danger">
                            Couldn&apos;t {row.enabled ? "pause" : "resume"} — try again
                          </p>
                        )}
                      </>
                    ) : null}
                  </div>

                  <div className="flex shrink-0 items-center">
                    {row ? (
                      <>
                        <IconButton
                          onClick={() => void toggle(row)}
                          disabled={toggling === row.id}
                          aria-label={row.enabled ? `Pause ${label}` : `Resume ${label}`}
                          title={
                            row.enabled
                              ? "Pause — nothing more is sent until you resume"
                              : "Resume"
                          }
                        >
                          {row.enabled ? (
                            <Pause size={13} strokeWidth={1.5} />
                          ) : (
                            <Play size={13} strokeWidth={1.5} />
                          )}
                        </IconButton>
                        <IconButton
                          onClick={() => setEditing(event)}
                          aria-label={`Edit ${label}`}
                          title="Edit"
                        >
                          <Pencil size={13} strokeWidth={1.5} />
                        </IconButton>
                        <IconButton
                          onClick={() => setDeleting(row)}
                          aria-label={`Delete ${label}`}
                          title="Delete"
                          className="hover:text-status-danger"
                        >
                          <Trash2 size={13} strokeWidth={1.5} />
                        </IconButton>
                      </>
                    ) : (
                      <Button size="sm" onClick={() => setEditing(event)}>
                        <Plus size={13} strokeWidth={1.5} />
                        Add message
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <AutomationEditorDialog
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
        appId={appId}
        appName={appName}
        event={editing}
        automation={editing ? (byEvent.get(editing) ?? null) : null}
        onSaved={() => void fetchRows()}
      />
      <DeleteAutomationDialog
        automation={deleting}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
        onDeleted={(id) =>
          setRows((prev) => (prev ?? []).filter((r) => r.id !== id))
        }
      />
    </div>
  );
}
