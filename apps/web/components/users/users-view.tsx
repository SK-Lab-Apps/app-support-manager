"use client";

import { Bell, BellOff, MessageSquarePlus, RotateCw, Search, Users } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { isTranslated } from "@/lib/languages";
import { OUTREACH_MAX_RECIPIENTS } from "@/lib/outreach";
import type { AppUserRow, PlanFilter } from "@/lib/types";
import { absoluteTime, cn, relativeTime } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { LanguageChip, PlanChip } from "@/components/ui/chips";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterSelect } from "@/components/ui/filter-select";
import { LoadingBar } from "@/components/ui/loading-bar";
import {
  Skeleton,
  TableSkeleton,
  ToolbarSkeleton,
} from "@/components/ui/skeleton";
import { OutreachComposer } from "@/components/users/outreach-composer";

type PushFilter = "all" | "reachable";

/** Commas and parentheses delimit PostgREST `or` filters. */
function searchTerm(raw: string): string {
  return raw.replace(/[,()%*]/g, " ").trim();
}

function PushIcon({ user }: { user: AppUserRow }) {
  if (user.push_reachable) {
    return (
      <Bell
        size={13}
        strokeWidth={1.5}
        className="text-status-resolved"
        aria-label="Push on"
      />
    );
  }
  return (
    <BellOff
      size={13}
      strokeWidth={1.5}
      className="text-tertiary"
      aria-label={user.push_status === "denied" ? "Push denied" : "No push"}
    />
  );
}

/** The Users tab while its route loads, in the shape it's about to take. */
export function UsersSkeleton() {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <ToolbarSkeleton filters={2} />
      <div className="min-h-0 flex-1 overflow-hidden">
        <TableSkeleton />
      </div>
    </div>
  );
}

/**
 * An app's paying and trial users, for messaging them first. Lists everyone
 * the SDK has reported (0.4+, on every load) plus anyone who has written to
 * support from an older build. Free users aren't stored.
 */
export function UsersView({ appId, appName }: { appId: string; appName: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [rows, setRows] = useState<AppUserRow[] | null>(null);
  const [total, setTotal] = useState<number | null>(null);
  const [error, setError] = useState(false);
  // New filters or a new search: the rows on screen are about to change.
  const [refreshing, setRefreshing] = useState(false);
  // Only the latest request may write the list, whatever order they land in.
  const latestRequest = useRef(0);
  const [planFilter, setPlanFilter] = useState<PlanFilter>("all");
  const [pushFilter, setPushFilter] = useState<PushFilter>("all");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [composerOpen, setComposerOpen] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchTerm(search)), 250);
    return () => clearTimeout(t);
  }, [search]);

  const fetchRows = useCallback(async () => {
    const request = ++latestRequest.current;
    let builder = supabase
      .from("app_user_list")
      .select("*", { count: "exact" })
      .eq("app_id", appId);
    if (planFilter !== "all") builder = builder.eq("plan", planFilter);
    if (pushFilter === "reachable") builder = builder.eq("push_reachable", true);
    if (debouncedSearch) {
      builder = builder.or(
        `name.ilike.%${debouncedSearch}%,revenuecat_id.ilike.%${debouncedSearch}%`,
      );
    }
    const { data, count, error: fetchError } = await builder
      .order("last_seen_at", { ascending: false })
      .limit(OUTREACH_MAX_RECIPIENTS);
    if (request !== latestRequest.current) return;
    setRefreshing(false);
    setError(Boolean(fetchError));
    if (fetchError) return;
    setRows((data ?? []) as AppUserRow[]);
    setTotal(count ?? null);
  }, [appId, planFilter, pushFilter, debouncedSearch, supabase]);

  useEffect(() => {
    setRefreshing(true);
    void fetchRows();
  }, [fetchRows]);

  // A selection only means something within what's on screen.
  useEffect(() => {
    if (rows === null) return;
    const visible = new Set(rows.map((r) => r.revenuecat_id));
    setSelected((prev) => {
      const next = new Set([...prev].filter((id) => visible.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [rows]);

  const selectedRows = useMemo(
    () => (rows ?? []).filter((r) => selected.has(r.revenuecat_id)),
    [rows, selected],
  );
  const allSelected =
    rows !== null && rows.length > 0 && selected.size === rows.length;

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected(
      allSelected ? new Set() : new Set((rows ?? []).map((r) => r.revenuecat_id)),
    );
  }

  const filtersActive =
    planFilter !== "all" || pushFilter !== "all" || debouncedSearch !== "";
  const truncated = total !== null && rows !== null && total > rows.length;

  return (
    <div className="relative flex h-full min-h-0 flex-col">
      {/* Toolbar */}
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border px-3 py-2 md:px-4">
        <div className="relative w-full sm:w-56">
          <Search
            size={13}
            strokeWidth={1.5}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-tertiary"
          />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name or user ID"
            aria-label="Search users"
            type="search"
            className={cn(
              "h-7 w-full rounded-control border border-border bg-surface pl-7 pr-2 text-xs text-primary",
              "placeholder:text-tertiary transition-colors duration-fast",
              "hover:border-border-strong focus:border-border-strong",
              "coarse:h-[38px] coarse:pl-8 coarse:text-input",
            )}
          />
        </div>
        <div className="flex w-full gap-2 overflow-x-auto scrollbar-none sm:w-auto sm:overflow-visible">
          <FilterSelect
            label="Filter by plan"
            value={planFilter}
            onChange={setPlanFilter}
            options={[
              { value: "all", label: "All plans" },
              { value: "pro", label: "PRO" },
              { value: "trial", label: "Trial" },
            ]}
          />
          <FilterSelect
            label="Filter by push"
            value={pushFilter}
            onChange={setPushFilter}
            options={[
              { value: "all", label: "Any push status" },
              { value: "reachable", label: "Push on" },
            ]}
          />
        </div>
        {total === null ? (
          !error && <Skeleton className="h-3 w-14 sm:ml-auto" />
        ) : (
          <span className="tnum text-xs text-tertiary sm:ml-auto">
            {truncated
              ? `Newest ${rows?.length} of ${total}`
              : `${total} user${total === 1 ? "" : "s"}`}
          </span>
        )}
      </div>

      {/* Selection bar */}
      {selected.size > 0 && (
        <div className="flex shrink-0 items-center gap-3 border-b border-border bg-surface px-3 py-2 md:px-4">
          <span className="tnum text-sm text-primary">
            {selected.size} selected
          </span>
          <button
            type="button"
            onClick={() => setSelected(new Set())}
            className="text-xs text-secondary underline decoration-dotted underline-offset-2 hover:text-primary"
          >
            Clear
          </button>
          <Button
            size="sm"
            variant="primary"
            className="ml-auto"
            onClick={() => setComposerOpen(true)}
          >
            <MessageSquarePlus size={13} strokeWidth={1.5} />
            Message {selected.size === 1 ? "user" : `${selected.size} users`}
          </Button>
        </div>
      )}

      {/* List */}
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
              <p className="text-sm text-secondary">Couldn&apos;t load users</p>
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
            filtersActive ? (
              <EmptyState icon={Users} message="No users match" />
            ) : (
              <div className="flex flex-col items-center gap-2 px-6 py-16 text-center">
                <Users size={18} strokeWidth={1.5} className="text-tertiary" />
                <p className="text-sm text-secondary">No users yet</p>
                <p className="max-w-sm text-xs text-tertiary">
                  Paying and trial users appear here when they open an app
                  running SDK 0.4 or later, or when they write to support from
                  an older version.
                </p>
              </div>
            )
          ) : (
            <>
              {truncated && (
                <p className="border-b border-border px-3 py-2 text-xs text-tertiary md:px-4">
                  Showing the {rows.length} most recently seen. Narrow the
                  filters to reach the rest — one send goes to at most{" "}
                  {OUTREACH_MAX_RECIPIENTS} users.
                </p>
              )}
              <div className="sticky top-0 z-10 flex h-8 items-center gap-3 border-b border-border bg-bg px-3 text-2xs uppercase tracking-wide text-tertiary md:px-4">
                <Checkbox
                  checked={allSelected}
                  onChange={toggleAll}
                  aria-label={allSelected ? "Deselect all" : "Select all shown"}
                />
                <span className="min-w-0 flex-1">User</span>
                <span className="w-14 shrink-0">Plan</span>
                <span className="hidden w-24 shrink-0 md:block">Language</span>
                <span className="hidden w-14 shrink-0 sm:block">Version</span>
                <span className="w-6 shrink-0" aria-label="Push" />
                <span className="hidden w-12 shrink-0 text-right lg:block">Chats</span>
                <span className="w-16 shrink-0 text-right">Seen</span>
              </div>
              {rows.map((user) => {
                const checked = selected.has(user.revenuecat_id);
                return (
                  <label
                    key={user.revenuecat_id}
                    className={cn(
                      "flex min-h-11 w-full cursor-pointer items-center gap-3 border-b border-border px-3 py-1.5 md:px-4",
                      "transition-colors duration-fast hover:bg-surface-hover",
                      checked && "bg-surface-active hover:bg-surface-active",
                    )}
                  >
                    <Checkbox
                      checked={checked}
                      onChange={() => toggle(user.revenuecat_id)}
                      aria-label={`Select ${user.name ?? user.revenuecat_id}`}
                    />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span
                        className={cn(
                          "truncate text-sm",
                          user.name ? "text-primary" : "italic text-tertiary",
                        )}
                      >
                        {user.name ?? "No name"}
                      </span>
                      <span className="tnum truncate text-2xs text-tertiary">
                        {user.revenuecat_id}
                      </span>
                    </span>
                    <span className="w-14 shrink-0">
                      <PlanChip plan={user.plan} />
                    </span>
                    <span className="hidden w-24 shrink-0 md:block">
                      {isTranslated(user.language) && user.language ? (
                        <LanguageChip language={user.language} className="px-0" />
                      ) : (
                        <span className="text-xs text-tertiary">English</span>
                      )}
                    </span>
                    <span className="tnum hidden w-14 shrink-0 truncate text-xs text-tertiary sm:block">
                      {user.app_version ?? "—"}
                    </span>
                    <span className="flex w-6 shrink-0 justify-center">
                      <PushIcon user={user} />
                    </span>
                    <span className="tnum hidden w-12 shrink-0 text-right text-xs text-tertiary lg:block">
                      {user.conversation_count}
                    </span>
                    <span
                      className="tnum w-16 shrink-0 whitespace-nowrap text-right text-xs text-tertiary"
                      title={absoluteTime(user.last_seen_at)}
                    >
                      {relativeTime(user.last_seen_at)}
                    </span>
                  </label>
                );
              })}
            </>
          )}
        </div>
      </div>

      <OutreachComposer
        open={composerOpen}
        onOpenChange={setComposerOpen}
        appId={appId}
        appName={appName}
        recipients={selectedRows}
        onSent={() => {
          setSelected(new Set());
          void fetchRows();
        }}
      />
    </div>
  );
}
