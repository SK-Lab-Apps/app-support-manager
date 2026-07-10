"use client";

import { Inbox, RotateCw, Search } from "lucide-react";
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
  PaidFilter,
  QueryListRow,
  SortKey,
  Stats,
  StatusFilter,
  TypeFilter,
} from "@/lib/types";
import { absoluteTime, cn, formatMinutes, relativeTime } from "@/lib/utils";
import { PaidTag, StatusIndicator, TypeChip } from "@/components/ui/chips";
import { EmptyState } from "@/components/ui/empty-state";
import { TableSkeleton } from "@/components/ui/skeleton";
import { ThreadPanel } from "@/components/dashboard/thread-panel";

function FilterSelect<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  label: string;
}) {
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value as T)}
      className={cn(
        "h-7 rounded-control border border-border bg-surface pl-2 pr-6 text-xs text-secondary",
        "cursor-pointer appearance-none bg-no-repeat",
        "transition-colors duration-fast hover:border-border-strong hover:text-primary",
      )}
      style={{
        backgroundImage:
          "url(\"data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='%238b8b93' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")",
        backgroundPosition: "right 8px center",
      }}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

function StatItem({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="text-2xs uppercase tracking-wide text-tertiary">
        {label}
      </span>
      <span className="tnum text-sm font-medium text-primary">{value}</span>
    </div>
  );
}

export function QueryDashboard({
  appId,
  appName,
  adminId,
}: {
  appId: string | null;
  appName: string;
  adminId: string;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const searchRef = useRef<HTMLInputElement>(null);

  const [rows, setRows] = useState<QueryListRow[] | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [paidFilter, setPaidFilter] = useState<PaidFilter>("all");
  const [sort, setSort] = useState<SortKey>("newest");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => clearTimeout(t);
  }, [search]);

  const fetchRows = useCallback(async () => {
    setError(false);
    let builder = debouncedSearch
      ? supabase.rpc("search_queries", {
          p_app_id: appId,
          p_term: debouncedSearch,
        })
      : (() => {
          const q = supabase.from("query_list").select("*");
          return appId ? q.eq("app_id", appId) : q;
        })();

    if (typeFilter !== "all") builder = builder.eq("type", typeFilter);
    if (statusFilter !== "all") builder = builder.eq("status", statusFilter);
    if (paidFilter !== "all")
      builder = builder.eq("is_paid", paidFilter === "paid");

    if (sort === "newest")
      builder = builder.order("created_at", { ascending: false });
    else if (sort === "oldest")
      builder = builder.order("created_at", { ascending: true });
    else builder = builder.order("last_activity_at", { ascending: false });

    const { data, error: fetchError } = await builder;
    if (fetchError) {
      setError(true);
      return;
    }
    setRows((data ?? []) as QueryListRow[]);
  }, [
    appId,
    debouncedSearch,
    typeFilter,
    statusFilter,
    paidFilter,
    sort,
    supabase,
  ]);

  const fetchStats = useCallback(async () => {
    const { data } = await supabase
      .rpc("query_stats", { p_app_id: appId })
      .maybeSingle();
    if (data) setStats(data as Stats);
  }, [appId, supabase]);

  useEffect(() => {
    void fetchRows();
  }, [fetchRows]);

  useEffect(() => {
    void fetchStats();
  }, [fetchStats]);

  // Live updates: new queries/messages refresh the list, stats, and the
  // sidebar's open counts (via router.refresh()).
  useEffect(() => {
    const channel = supabase
      .channel(`dashboard-${appId ?? "all"}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "queries" },
        () => {
          void fetchRows();
          void fetchStats();
          router.refresh();
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
    paidFilter !== "all" ||
    debouncedSearch !== "";

  return (
    <div className="relative flex h-full min-h-0 flex-col">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2 md:px-4">
        <h1 className="mr-2 truncate text-lg font-semibold tracking-heading">
          {appName}
        </h1>
        <div className="relative ml-auto w-full sm:w-56 order-last sm:order-none">
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
            className={cn(
              "h-7 w-full rounded-control border border-border bg-surface pl-7 pr-2 text-xs text-primary",
              "placeholder:text-tertiary transition-colors duration-fast",
              "hover:border-border-strong focus:border-border-strong",
            )}
          />
        </div>
        <FilterSelect
          label="Filter by type"
          value={typeFilter}
          onChange={setTypeFilter}
          options={[
            { value: "all", label: "All types" },
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
          value={paidFilter}
          onChange={setPaidFilter}
          options={[
            { value: "all", label: "Paid & free" },
            { value: "paid", label: "Paid" },
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

      {/* Stats strip */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-1 border-b border-border px-3 py-2 md:px-4">
        <StatItem label="Open" value={stats ? stats.open_count : "—"} />
        <StatItem
          label="Resolved this week"
          value={stats ? stats.resolved_this_week : "—"}
        />
        <StatItem
          label="Avg first response"
          value={stats ? formatMinutes(stats.avg_first_response_minutes) : "—"}
        />
      </div>

      {/* List */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {error ? (
          <div className="flex flex-col items-center gap-3 py-16">
            <p className="text-sm text-secondary">Couldn&apos;t load queries</p>
            <button
              onClick={() => void fetchRows()}
              className="inline-flex items-center gap-1.5 rounded-control border border-border bg-surface px-2.5 py-1 text-xs text-primary transition-colors duration-fast hover:bg-surface-hover"
            >
              <RotateCw size={12} strokeWidth={1.5} />
              Retry
            </button>
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
            {/* Desktop table */}
            <div className="hidden sm:block">
              <div className="flex h-8 items-center gap-3 border-b border-border px-4 text-2xs uppercase tracking-wide text-tertiary">
                <span className="w-2 shrink-0" />
                <span className="w-[72px] shrink-0">Status</span>
                <span className="w-[118px] shrink-0">Type</span>
                <span className="min-w-0 flex-1">Query</span>
                <span className="hidden w-[140px] shrink-0 lg:block">User</span>
                <span className="hidden w-14 shrink-0 md:block">Version</span>
                <span className="w-8 shrink-0 text-right">Msgs</span>
                <span className="w-14 shrink-0 text-right">Age</span>
              </div>
              {rows.map((row) => (
                <button
                  key={row.id}
                  onClick={() => openThread(row)}
                  className={cn(
                    "flex h-11 w-full items-center gap-3 border-b border-border px-4 text-left",
                    "transition-colors duration-fast hover:bg-surface-hover",
                    selectedId === row.id && "bg-surface-active",
                  )}
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
                  {/* <span className="w-[118px] shrink-0">
                    <TypeChip type={row.type} />
                  </span> */}
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
                    {row.is_paid && <PaidTag />}
                  </span>
                  <span className="tnum hidden w-14 shrink-0 text-xs text-tertiary md:block">
                    {row.app_version}
                  </span>
                  <span className="tnum w-8 shrink-0 text-right text-xs text-tertiary">
                    {row.message_count}
                  </span>
                  <span
                    className="tnum w-14 shrink-0 text-right text-xs text-tertiary"
                    title={absoluteTime(row.created_at)}
                  >
                    {relativeTime(row.created_at)}
                  </span>
                </button>
              ))}
            </div>

            {/* Mobile card list */}
            <div className="sm:hidden">
              {rows.map((row) => (
                <button
                  key={row.id}
                  onClick={() => openThread(row)}
                  className="flex w-full flex-col gap-1.5 border-b border-border px-3 py-3 text-left transition-colors duration-fast hover:bg-surface-hover"
                >
                  <span className="flex items-center gap-2">
                    {row.unread_for_admin && (
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                    )}
                    {/* <TypeChip type={row.type} /> */}
                    <StatusIndicator status={row.status} />
                    <span
                      className="tnum ml-auto text-xs text-tertiary"
                      title={absoluteTime(row.created_at)}
                    >
                      {relativeTime(row.created_at)}
                    </span>
                  </span>
                  <span
                    className={cn(
                      "line-clamp-2 text-sm",
                      row.unread_for_admin
                        ? "font-medium text-primary"
                        : "text-secondary",
                    )}
                  >
                    {row.excerpt ?? "—"}
                  </span>
                  <span className="flex items-center gap-1.5 text-xs text-tertiary">
                    <span className="truncate">{row.user_name}</span>
                    {row.is_paid && <PaidTag />}
                    <span className="tnum ml-auto">
                      v{row.app_version} · {row.message_count} msg
                      {row.message_count === 1 ? "" : "s"}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </>
        )}
      </div>

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
