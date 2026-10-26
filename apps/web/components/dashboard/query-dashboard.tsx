"use client";

import { Inbox, RotateCw, Search, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createClient } from "@/lib/supabase/client";
import type {
  PlanFilter,
  QueryListRow,
  SortKey,
  Stats,
  StatusFilter,
  TypeFilter,
} from "@/lib/types";
import { absoluteTime, cn, formatMinutes, relativeTime } from "@/lib/utils";
import { isTranslated } from "@/lib/languages";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { LanguageChip, PlanChip, StatusIndicator } from "@/components/ui/chips";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterSelect } from "@/components/ui/filter-select";
import { LoadingBar } from "@/components/ui/loading-bar";
import {
  Skeleton,
  TableSkeleton,
  ToolbarSkeleton,
} from "@/components/ui/skeleton";
import { DeleteConversationsDialog } from "@/components/dashboard/delete-conversations-dialog";
import { ThreadPanel } from "@/components/dashboard/thread-panel";

/**
 * `contents` hands the label and value straight to the parent grid so all
 * three labels share one row and all three values share the next — a label
 * that wraps to two lines can't then shove its own value out of line.
 * From sm up it collapses back to label-beside-value.
 */
function StatItem({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="contents sm:flex sm:min-w-0 sm:items-baseline sm:gap-2">
      <span className="text-2xs uppercase leading-tight tracking-wide text-tertiary">
        {label}
      </span>
      {value === null ? (
        <Skeleton className="my-[3px] h-3.5 w-10 self-center" />
      ) : (
        <span className="tnum text-sm font-medium text-primary">{value}</span>
      )}
    </div>
  );
}

/** Even thirds on phones, inline once labels fit beside values. */
function StatsStrip({ stats }: { stats: Stats | null }) {
  return (
    <div className="grid shrink-0 auto-cols-fr grid-flow-col grid-rows-[auto_auto] items-start gap-x-3 gap-y-0.5 border-b border-border px-3 py-2 sm:flex sm:flex-wrap sm:items-center sm:gap-x-6 sm:gap-y-1 md:px-4">
      <StatItem label="Open" value={stats ? stats.open_count : null} />
      <StatItem
        label="Resolved this week"
        value={stats ? stats.resolved_this_week : null}
      />
      <StatItem
        label="Avg first response"
        value={stats ? formatMinutes(stats.avg_first_response_minutes) : null}
      />
    </div>
  );
}

/** The inbox while its route loads, in the shape it's about to take. */
export function InboxSkeleton() {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <ToolbarSkeleton filters={4} searchEnd />
      <StatsStrip stats={null} />
      <div className="min-h-0 flex-1 overflow-hidden">
        <TableSkeleton />
      </div>
    </div>
  );
}

export function QueryDashboard({
  appId,
  adminId,
}: {
  appId: string;
  adminId: string;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const searchRef = useRef<HTMLInputElement>(null);

  const [rows, setRows] = useState<QueryListRow[] | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState(false);
  // New filters or a new search: the rows on screen are about to change.
  const [refreshing, setRefreshing] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Conversations ticked for deletion — separate from the one open above.
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [deleteOpen, setDeleteOpen] = useState(false);
  // Responses can land out of order when filters change quickly; only the
  // latest request may write the list.
  const latestRequest = useRef(0);

  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [planFilter, setPlanFilter] = useState<PlanFilter>("all");
  const [sort, setSort] = useState<SortKey>("newest");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => clearTimeout(t);
  }, [search]);

  const fetchRows = useCallback(async () => {
    const request = ++latestRequest.current;
    let builder = debouncedSearch
      ? supabase.rpc("search_queries", {
          p_app_id: appId,
          p_term: debouncedSearch,
        })
      : supabase.from("query_list").select("*").eq("app_id", appId);

    // Conversations we started join the inbox once the user writes back.
    builder = builder.eq("in_inbox", true);

    if (typeFilter !== "all") builder = builder.eq("type", typeFilter);
    if (statusFilter !== "all") builder = builder.eq("status", statusFilter);
    if (planFilter !== "all") builder = builder.eq("plan", planFilter);

    if (sort === "newest")
      builder = builder.order("created_at", { ascending: false });
    else if (sort === "oldest")
      builder = builder.order("created_at", { ascending: true });
    else builder = builder.order("last_activity_at", { ascending: false });

    const { data, error: fetchError } = await builder;
    if (request !== latestRequest.current) return;
    setRefreshing(false);
    setError(Boolean(fetchError));
    if (!fetchError) setRows((data ?? []) as QueryListRow[]);
  }, [
    appId,
    debouncedSearch,
    typeFilter,
    statusFilter,
    planFilter,
    sort,
    supabase,
  ]);

  const fetchStats = useCallback(async () => {
    const { data } = await supabase
      .rpc("query_stats", { p_app_id: appId })
      .maybeSingle();
    if (data) setStats(data as Stats);
  }, [appId, supabase]);

  // Runs when a filter, sort or search changes. Live updates and edits
  // refetch quietly instead — they shouldn't flash the list.
  useEffect(() => {
    setRefreshing(true);
    void fetchRows();
  }, [fetchRows]);

  useEffect(() => {
    void fetchStats();
  }, [fetchStats]);

  // A tick only means something on a row that's still on screen.
  useEffect(() => {
    if (rows === null) return;
    const visible = new Set(rows.map((r) => r.id));
    setChecked((prev) => {
      const next = new Set([...prev].filter((id) => visible.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [rows]);

  // Live updates: new queries/messages refresh the list, stats, and the
  // sidebar's open counts (via router.refresh()).
  useEffect(() => {
    let pending: ReturnType<typeof setTimeout> | undefined;
    const channel = supabase
      .channel(`dashboard-${appId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "queries" },
        // A send or a cleared Sent log touches many conversations at once;
        // one refresh covers them all.
        () => {
          clearTimeout(pending);
          pending = setTimeout(() => {
            void fetchRows();
            void fetchStats();
            router.refresh();
          }, 250);
        },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        () => {
          void fetchRows();
        },
      )
      .subscribe();
    return () => {
      clearTimeout(pending);
      void supabase.removeChannel(channel);
    };
  }, [supabase, appId, fetchRows, fetchStats, router]);

  // `/` focuses search, Escape closes the panel.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const typing =
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT";
      if (e.key === "/" && !typing) {
        e.preventDefault();
        searchRef.current?.focus();
      }
      if (e.key === "Escape" && !typing) setSelectedId(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const selectedRow = rows?.find((r) => r.id === selectedId) ?? null;

  const allChecked =
    rows !== null && rows.length > 0 && checked.size === rows.length;

  function toggleChecked(id: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAllChecked() {
    setChecked(allChecked ? new Set() : new Set((rows ?? []).map((r) => r.id)));
  }

  function handleDeleted(ids: string[]) {
    const gone = new Set(ids);
    setRows((prev) => prev?.filter((r) => !gone.has(r.id)) ?? null);
    setChecked(new Set());
    if (selectedId !== null && gone.has(selectedId)) setSelectedId(null);
    void fetchRows();
    void fetchStats();
    router.refresh();
  }

  function openThread(row: QueryListRow) {
    setSelectedId(row.id);
    // Optimistically clear the unread marker; the panel upserts the receipt.
    setRows(
      (prev) =>
        prev?.map((r) =>
          r.id === row.id ? { ...r, unread_for_admin: false } : r,
        ) ?? null,
    );
  }

  const filtersActive =
    typeFilter !== "all" ||
    statusFilter !== "all" ||
    planFilter !== "all" ||
    debouncedSearch !== "";

  return (
    <div className="relative flex h-full min-h-0 flex-col">
      {/* Toolbar — search, then filters as they stop fitting. */}
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border px-3 py-2 md:px-4">
        <div className="relative w-full sm:ml-auto sm:w-56">
          <Search
            size={13}
            strokeWidth={1.5}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-tertiary"
          />
          <input
            ref={searchRef}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search queries"
            aria-label="Search queries"
            type="search"
            className={cn(
              "h-7 w-full rounded-control border border-border bg-surface pl-7 pr-2 text-xs text-primary",
              "placeholder:text-tertiary transition-colors duration-fast",
              "hover:border-border-strong focus:border-border-strong",
              "coarse:h-[38px] coarse:pl-8 coarse:text-input",
            )}
          />
        </div>
        {/* One horizontal scroller on phones instead of three wrapped rows. */}
        <div
          className={cn(
            "flex w-full gap-2 overflow-x-auto scrollbar-none",
            "sm:w-auto sm:flex-wrap sm:overflow-visible",
          )}
        >
          <FilterSelect
            label="Filter by type"
            value={typeFilter}
            onChange={setTypeFilter}
            options={[
              { value: "all", label: "All types" },
              { value: "support", label: "Chat" },
              { value: "feedback", label: "Feedback" },
              { value: "feature_request", label: "Feature request" },
              { value: "bug_report", label: "Bug report" },
            ]}
          />
          <FilterSelect
            label="Filter by status"
            value={statusFilter}
            onChange={setStatusFilter}
            options={[
              { value: "all", label: "All statuses" },
              { value: "open", label: "Open" },
              { value: "resolved", label: "Resolved" },
            ]}
          />
          <FilterSelect
            label="Filter by plan"
            value={planFilter}
            onChange={setPlanFilter}
            options={[
              { value: "all", label: "All plans" },
              { value: "pro", label: "PRO" },
              { value: "trial", label: "Trial" },
              { value: "free", label: "Free" },
            ]}
          />
          <FilterSelect
            label="Sort"
            value={sort}
            onChange={setSort}
            options={[
              { value: "newest", label: "Newest" },
              { value: "oldest", label: "Oldest" },
              { value: "active", label: "Recently active" },
            ]}
          />
        </div>
      </div>

      <StatsStrip stats={stats} />

      {/* Selection bar */}
      {checked.size > 0 && (
        <div className="flex shrink-0 items-center gap-3 border-b border-border bg-surface px-3 py-2 md:px-4">
          <span className="tnum text-sm text-primary">
            {checked.size} selected
          </span>
          <button
            type="button"
            onClick={() => setChecked(new Set())}
            className="text-xs text-secondary underline decoration-dotted underline-offset-2 hover:text-primary"
          >
            Clear
          </button>
          <Button
            size="sm"
            variant="danger"
            className="ml-auto"
            onClick={() => setDeleteOpen(true)}
          >
            <Trash2 size={13} strokeWidth={1.5} />
            Delete
          </Button>
        </div>
      )}

      {/* List — the only vertical scroller; toolbar and stats stay pinned.
          Bottom inset lets the last row clear the iOS home indicator. */}
      <div className="relative flex min-h-0 flex-1 flex-col">
        {refreshing && rows !== null && <LoadingBar />}
        <div
          aria-busy={refreshing}
          className={cn(
            "min-h-0 flex-1 overflow-y-auto overscroll-contain pb-safe-b",
            "transition-opacity duration-base",
            refreshing && rows !== null && "opacity-60",
          )}
        >
          {error ? (
            <div className="flex flex-col items-center gap-3 px-3 py-16 text-center">
              <p className="text-sm text-secondary">Couldn&apos;t load queries</p>
              <Button
                size="sm"
                onClick={() => {
                  setRefreshing(true);
                  void fetchRows();
                }}
                disabled={refreshing}
              >
                <RotateCw
                  size={12}
                  strokeWidth={1.5}
                  className={cn(refreshing && "animate-spin")}
                />
                {refreshing ? "Retrying…" : "Retry"}
              </Button>
            </div>
          ) : rows === null ? (
            <TableSkeleton />
          ) : rows.length === 0 ? (
            <EmptyState
              icon={Inbox}
              message={filtersActive ? "No queries match" : "No open queries"}
            />
          ) : (
            <>
              {/* Table from sm up. Columns drop as the viewport narrows: user at
                  lg, version at md, leaving status + query + counts on tablets. */}
              <div className="hidden sm:block">
                <div className="sticky top-0 z-10 flex h-8 items-center gap-3 border-b border-border bg-bg px-3 text-2xs uppercase tracking-wide text-tertiary md:px-4">
                  <Checkbox
                    checked={allChecked}
                    onChange={toggleAllChecked}
                    aria-label={allChecked ? "Deselect all" : "Select all shown"}
                  />
                  <span className="w-2 shrink-0" />
                  <span className="w-[72px] shrink-0">Status</span>
                  <span className="min-w-0 flex-1">Query</span>
                  <span className="hidden w-[140px] shrink-0 lg:block">User</span>
                  <span className="hidden w-14 shrink-0 md:block">Version</span>
                  <span className="w-8 shrink-0 text-right">Msgs</span>
                  <span className="w-16 shrink-0 text-right">Age</span>
                </div>
                {rows.map((row) => (
                  <div
                    key={row.id}
                    className={cn(
                      "flex h-11 w-full items-center border-b border-border",
                      "transition-colors duration-fast hover:bg-surface-hover",
                      (selectedId === row.id || checked.has(row.id)) &&
                        "bg-surface-active hover:bg-surface-active",
                    )}
                  >
                    <label className="flex h-full shrink-0 cursor-pointer items-center pl-3 pr-3 md:pl-4">
                      <Checkbox
                        checked={checked.has(row.id)}
                        onChange={() => toggleChecked(row.id)}
                        aria-label={`Select conversation with ${row.user_name}`}
                      />
                    </label>
                    <button
                      onClick={() => openThread(row)}
                      className="flex h-full min-w-0 flex-1 items-center gap-3 pr-3 text-left md:pr-4"
                    >
                      <span className="w-2 shrink-0">
                        {row.unread_for_admin && (
                          <span
                            className="block h-1.5 w-1.5 rounded-full bg-accent"
                            aria-label="Unread"
                          />
                        )}
                      </span>
                      <span className="w-[72px] shrink-0">
                        <StatusIndicator status={row.status} />
                      </span>
                      <span
                        className={cn(
                          "min-w-0 flex-1 truncate text-sm",
                          row.unread_for_admin
                            ? "font-medium text-primary"
                            : "text-secondary",
                        )}
                      >
                        {row.excerpt ?? "—"}
                      </span>
                      <span className="hidden w-[140px] shrink-0 items-center gap-1.5 lg:flex">
                        <span className="truncate text-xs text-secondary">
                          {row.user_name}
                        </span>
                        <PlanChip plan={row.plan} />
                        {isTranslated(row.user_language) && row.user_language && (
                          <LanguageChip
                            language={row.user_language}
                            className="shrink-0 px-0"
                          />
                        )}
                      </span>
                      <span className="tnum hidden w-14 shrink-0 text-xs text-tertiary md:block">
                        {row.app_version}
                      </span>
                      <span className="tnum w-8 shrink-0 text-right text-xs text-tertiary">
                        {row.message_count}
                      </span>
                      <span
                        className="tnum w-16 shrink-0 whitespace-nowrap text-right text-xs text-tertiary"
                        title={absoluteTime(row.created_at)}
                      >
                        {relativeTime(row.created_at)}
                      </span>
                    </button>
                  </div>
                ))}
              </div>

              {/* Card list below sm — a row of 7 columns has nothing to give. */}
              <div className="sm:hidden">
                {rows.map((row) => (
                  <div
                    key={row.id}
                    className={cn(
                      "flex w-full border-b border-border",
                      "transition-colors duration-fast hover:bg-surface-hover",
                      checked.has(row.id) &&
                        "bg-surface-active hover:bg-surface-active",
                    )}
                  >
                    <label className="flex shrink-0 cursor-pointer items-start py-3 pl-3">
                      <Checkbox
                        checked={checked.has(row.id)}
                        onChange={() => toggleChecked(row.id)}
                        aria-label={`Select conversation with ${row.user_name}`}
                      />
                    </label>
                    <button
                      onClick={() => openThread(row)}
                      className={cn(
                        "flex min-w-0 flex-1 flex-col gap-1.5 px-3 py-3 text-left",
                        "transition-colors duration-fast active:bg-surface-active",
                      )}
                    >
                      <span className="flex items-center gap-2">
                        {row.unread_for_admin && (
                          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                        )}
                        <StatusIndicator status={row.status} />
                        <span
                          className="tnum ml-auto shrink-0 text-xs text-tertiary"
                          title={absoluteTime(row.created_at)}
                        >
                          {relativeTime(row.created_at)}
                        </span>
                      </span>
                      <span
                        className={cn(
                          "line-clamp-2 break-words text-sm",
                          row.unread_for_admin
                            ? "font-medium text-primary"
                            : "text-secondary",
                        )}
                      >
                        {row.excerpt ?? "—"}
                      </span>
                      <span className="flex items-center gap-1.5 text-xs text-tertiary">
                        <span className="min-w-0 truncate">{row.user_name}</span>
                        <PlanChip plan={row.plan} />
                        {isTranslated(row.user_language) && row.user_language && (
                          <LanguageChip
                            language={row.user_language}
                            className="shrink-0 px-0"
                          />
                        )}
                        <span className="tnum ml-auto shrink-0">
                          v{row.app_version} · {row.message_count} msg
                          {row.message_count === 1 ? "" : "s"}
                        </span>
                      </span>
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      <DeleteConversationsDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        queryIds={[...checked]}
        onDeleted={handleDeleted}
      />

      {selectedRow && (
        <ThreadPanel
          key={selectedRow.id}
          row={selectedRow}
          adminId={adminId}
          onClose={() => setSelectedId(null)}
          onChanged={() => {
            void fetchRows();
            void fetchStats();
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
