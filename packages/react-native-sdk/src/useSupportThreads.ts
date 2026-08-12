// Threads + unread state for the SDK: fetching, poll cadence, and read
// tracking. Kept out of SupportButton so the rules below live in one place.
//
// Three invariants make the badge trustworthy:
//
//   1. Responses are applied in issue order (`appliedSeq`), so a slow poll
//      can never overwrite a newer one.
//   2. The badge-only endpoint returns a bare number that cannot be
//      reconciled against local reads, so its answer is dropped when a read
//      happened while it was in flight (`readEpoch`), and it isn't used at
//      all while any `mark-read` is still unconfirmed — the full endpoint is
//      polled instead, since that payload *can* be reconciled.
//   3. `mark-read` failures are retried instead of swallowed, and the local
//      watermark holds the UI correct in the meantime.
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import {
  getThreads,
  getUnreadCount,
  markRead,
  SupportApiError,
  type ApiConfig,
} from './api';
import type { StringKey } from './i18n';
import type { Thread } from './types';
import {
  latestAdminMessageAt,
  pruneWatermarks,
  reconcileThreads,
  sumUnread,
  type ReadWatermarks,
} from './unread';

// Poll cadence by context: fast where latency is felt (staring at a thread
// waiting for a reply), slow when the sheet is closed — and the idle tick
// uses the count-only endpoint, so it costs ~18 bytes instead of the full
// thread list.
const THREAD_POLL_MS = 5_000;
const SHEET_POLL_MS = 15_000;
export const IDLE_POLL_MS = 60_000;
const MIN_POLL_MS = 3_000;

// A failed mark-read used to be dropped on the floor, which resurrected the
// badge on the next poll. Retry a few times with backoff; anything still
// unconfirmed after that is picked up by the next poll tick or foreground.
const MARK_READ_MAX_ATTEMPTS = 4;
const MARK_READ_BACKOFF_MS = 1_500;

/**
 * Load failures the user can act on say so; the rest stay neutral. A 401 is
 * an integration mistake — the end user retrying forever won't fix a key
 * that doesn't match the app — so the real cause is logged for whoever is
 * running the build instead of hidden behind "couldn't load".
 *
 * Returns a key rather than a message: the hook has no business knowing what
 * language the sheet is in, and resolving it here would make every callback
 * depend on the translator.
 */
function loadErrorKey(e: unknown): StringKey {
  if (e instanceof SupportApiError) {
    if (e.offline) return 'error.offline';
    if (e.status === 401 || e.status === 403) {
      if (__DEV__) {
        console.error(
          'SupportButton: the support API rejected this app (401). Check that ' +
            '`apiKey` is the key shown when the app was registered and that ' +
            '`appName` matches that app exactly.',
        );
      }
      return 'error.unavailable';
    }
    if (e.status === 429) return 'error.loadRateLimited';
  }
  return 'error.loadFailed';
}

interface ReadAttempt {
  /** Newest reply timestamp this thread's receipt still has to cover. */
  target: number;
  /** Timestamp covered by the request currently in flight, if any. */
  inFlight: number | null;
  attempts: number;
  timer: ReturnType<typeof setTimeout> | null;
}

export interface SupportThreadsState {
  /** Server threads with unread counts narrowed by local reads. */
  threads: Thread[] | null;
  totalUnread: number;
  /** First load only — there is nothing cached to show yet. */
  loading: boolean;
  /** User-pulled refresh with content already on screen. */
  refreshing: boolean;
  /** Set only when there is nothing cached; background failures stay quiet. */
  errorKey: StringKey | null;
  /** The language this user picked, or null if they never have. */
  serverLanguage: string | null;
  /**
   * False until the first successful load. `serverLanguage === null` only
   * means "never picked" once this is true — before that it means "don't
   * know yet", and showing the picker on a guess would nag a user who
   * answered on another device.
   */
  languageLoaded: boolean;
  /** User-initiated refresh (pull-to-refresh, retry button). */
  refresh: () => void;
  /** Awaited by send/submit handlers so the list reflects the write. */
  reload: () => Promise<void>;
}

export function useSupportThreads({
  config,
  revenuecatId,
  enabled,
  sheetOpen,
  activeThreadId,
  idlePollMs,
}: {
  config: ApiConfig;
  revenuecatId: string;
  /** False when props failed validation — no requests are made. */
  enabled: boolean;
  sheetOpen: boolean;
  activeThreadId: string | null;
  idlePollMs: number;
}): SupportThreadsState {
  const [threads, setThreads] = useState<Thread[] | null>(null);
  const [totalUnread, setTotalUnread] = useState(0);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [errorKey, setErrorKey] = useState<StringKey | null>(null);
  const [serverLanguage, setServerLanguage] = useState<string | null>(null);
  const [languageLoaded, setLanguageLoaded] = useState(false);

  const mounted = useRef(true);
  /** Last server payload, before local read reconciliation. */
  const rawThreads = useRef<Thread[] | null>(null);
  const watermarks = useRef<ReadWatermarks>(new Map());
  const reads = useRef(new Map<string, ReadAttempt>());
  const requestSeq = useRef(0);
  const appliedSeq = useRef(0);
  const readEpoch = useRef(0);
  const activeThreadIdRef = useRef<string | null>(activeThreadId);

  useEffect(() => {
    activeThreadIdRef.current = activeThreadId;
  }, [activeThreadId]);

  useEffect(() => {
    mounted.current = true;
    const timers = reads.current;
    return () => {
      mounted.current = false;
      for (const attempt of timers.values()) {
        if (attempt.timer !== null) clearTimeout(attempt.timer);
      }
      timers.clear();
    };
  }, []);

  const publish = useCallback(() => {
    const raw = rawThreads.current;
    if (raw === null) return;
    const reconciled = reconcileThreads(raw, watermarks.current);
    setThreads(reconciled);
    setTotalUnread(sumUnread(reconciled));
  }, []);

  /** POSTs the receipt, retrying transient failures with backoff. */
  const sendRead = useCallback(
    (threadId: string) => {
      const attempt = reads.current.get(threadId);
      if (!attempt || attempt.inFlight !== null) return;
      const covers = attempt.target;
      attempt.inFlight = covers;
      attempt.timer = null;

      markRead(config, { queryId: threadId, revenuecatId })
        .then(() => {
          if (!mounted.current) return;
          const current = reads.current.get(threadId);
          if (!current) return;
          current.inFlight = null;
          // A reply that landed while this request was in flight isn't
          // covered by the receipt it just wrote — send one more.
          if (current.target > covers) {
            current.attempts = 0;
            sendRead(threadId);
            return;
          }
          reads.current.delete(threadId);
          // The receipt now exists server-side, so any response still in
          // flight predates it and must not be trusted for unread counts.
          readEpoch.current += 1;
        })
        .catch(() => {
          if (!mounted.current) return;
          const current = reads.current.get(threadId);
          if (!current) return;
          current.inFlight = null;
          current.attempts += 1;
          if (current.attempts >= MARK_READ_MAX_ATTEMPTS) return;
          current.timer = setTimeout(
            () => sendRead(threadId),
            MARK_READ_BACKOFF_MS * 2 ** (current.attempts - 1),
          );
        });
    },
    [config, revenuecatId],
  );

  /** Re-drives receipts that gave up earlier (next poll tick / foreground). */
  const flushReads = useCallback(() => {
    for (const [threadId, attempt] of reads.current) {
      if (attempt.inFlight !== null || attempt.timer !== null) continue;
      attempt.attempts = 0;
      sendRead(threadId);
    }
  }, [sendRead]);

  /**
   * Records that the user has seen every reply currently in `threadId` and
   * persists it. Idempotent: re-marking a thread with nothing new is a
   * no-op, so the 5s in-thread poll doesn't spam the endpoint.
   */
  const markThreadRead = useCallback(
    (threadId: string) => {
      const thread = rawThreads.current?.find((t) => t.id === threadId);
      if (!thread) return;
      const latest = latestAdminMessageAt(thread);
      if (latest === 0) return;
      if (latest <= (watermarks.current.get(threadId) ?? 0)) return;

      watermarks.current.set(threadId, latest);
      // Invalidate the bare counts of any request already in flight.
      readEpoch.current += 1;
      publish();

      const attempt = reads.current.get(threadId);
      if (attempt) attempt.target = latest;
      else {
        reads.current.set(threadId, {
          target: latest,
          inFlight: null,
          attempts: 0,
          timer: null,
        });
      }
      sendRead(threadId);
    },
    [publish, sendRead],
  );

  const fetchThreads = useCallback(
    async (mode: 'initial' | 'user' | 'background') => {
      if (!enabled) return;
      const seq = (requestSeq.current += 1);
      // With nothing cached there is no list to pull down, so a retry shows
      // the skeleton rather than a spinner nobody can see.
      const blank = rawThreads.current === null;
      const spinner = mode === 'user' && !blank;
      const skeleton = mode !== 'background' && blank;
      if (spinner) setRefreshing(true);
      if (skeleton) setLoading(true);

      try {
        const data = await getThreads(config, revenuecatId);
        if (!mounted.current) return;
        // A slower earlier request must never clobber a newer answer.
        if (seq <= appliedSeq.current) return;
        appliedSeq.current = seq;

        rawThreads.current = data.threads;
        watermarks.current = pruneWatermarks(watermarks.current, data.threads);
        setErrorKey(null);
        setServerLanguage(data.language);
        setLanguageLoaded(true);
        publish();

        // Replies that arrived while the user is sitting in the thread are
        // read on arrival — otherwise the badge climbed while they read.
        const active = activeThreadIdRef.current;
        if (active !== null) markThreadRead(active);
        flushReads();
      } catch (e) {
        if (!mounted.current) return;
        // A failed background poll must not blow away cached threads.
        if (rawThreads.current === null) setErrorKey(loadErrorKey(e));
      } finally {
        if (mounted.current) {
          if (spinner) setRefreshing(false);
          if (skeleton) setLoading(false);
        }
      }
    },
    [config, enabled, revenuecatId, publish, markThreadRead, flushReads],
  );

  /** Badge-only refresh — the cheap endpoint, used while idle. */
  const fetchCount = useCallback(async () => {
    if (!enabled) return;
    const seq = (requestSeq.current += 1);
    const epoch = readEpoch.current;
    try {
      const data = await getUnreadCount(config, revenuecatId);
      if (!mounted.current) return;
      // This payload is just a number: there is no way to subtract reads
      // that happened while it was in flight, so discard it instead.
      if (readEpoch.current !== epoch) return;
      if (seq <= appliedSeq.current) return;
      appliedSeq.current = seq;
      setTotalUnread(data.total_unread);
    } catch {
      // Best effort: the next tick or the next sheet open reconciles.
    }
  }, [config, enabled, revenuecatId]);

  // Initial load.
  useEffect(() => {
    void fetchThreads('initial');
  }, [fetchThreads]);

  // Opening the sheet always shows fresh data.
  useEffect(() => {
    if (sheetOpen) void fetchThreads('background');
  }, [sheetOpen, fetchThreads]);

  // Opening a thread marks it read immediately, before the next poll.
  useEffect(() => {
    if (activeThreadId !== null) markThreadRead(activeThreadId);
  }, [activeThreadId, markThreadRead]);

  // Cadence follows what the user is looking at; the app returning to the
  // foreground always ticks.
  useEffect(() => {
    if (!enabled) return;
    const idle = !sheetOpen;
    const intervalMs = idle
      ? idlePollMs
      : activeThreadId !== null
        ? THREAD_POLL_MS
        : SHEET_POLL_MS;

    const tick = () => {
      // While a receipt is unconfirmed the count-only endpoint would report
      // replies the user has already read, so pay for the full payload.
      if (idle && reads.current.size === 0) void fetchCount();
      else void fetchThreads('background');
    };

    // Clamped so a typo like `pollIntervalMs={30}` can't hammer the API;
    // 0 (or negative) disables idle polling entirely.
    const timer =
      intervalMs > 0
        ? setInterval(tick, Math.max(intervalMs, MIN_POLL_MS))
        : null;

    const appStateSub = AppState.addEventListener('change', (state) => {
      if (state === 'active') tick();
    });

    return () => {
      if (timer !== null) clearInterval(timer);
      appStateSub.remove();
    };
  }, [
    enabled,
    sheetOpen,
    activeThreadId,
    idlePollMs,
    fetchThreads,
    fetchCount,
  ]);

  const refresh = useCallback(() => {
    void fetchThreads('user');
  }, [fetchThreads]);

  const reload = useCallback(() => fetchThreads('background'), [fetchThreads]);

  return {
    threads,
    totalUnread,
    loading,
    refreshing,
    errorKey,
    serverLanguage,
    languageLoaded,
    refresh,
    reload,
  };
}
