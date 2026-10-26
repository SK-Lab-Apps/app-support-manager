// Unread accounting.
//
// The server counts a thread's unread as "admin messages newer than the
// user's read receipt". That number is authoritative, but it is always a
// little behind the device: between the moment the user opens a thread and
// the moment `mark-read` lands, every already-in-flight poll still reports
// the old count — which is what made the badge flicker back on after being
// cleared, and what made a thread the user was actively reading accumulate
// unread replies.
//
// So the client keeps its own watermark per thread: the `created_at` of the
// newest admin message the user has actually seen. Those are *server*
// timestamps, so nothing here compares against the device clock.
//
// Displayed unread is then the stricter of the two counts, which is correct
// in both directions:
//
//   read here, receipt not written yet  → local watermark wins  (0)
//   read on another device              → server count wins     (0)

import type { Thread } from './types';

/** Watermark map: thread id → `created_at` (ms) of the newest seen reply. */
export type ReadWatermarks = Map<string, number>;

/** `created_at` (ms) of the newest admin message, or 0 if there are none. */
export function latestAdminMessageAt(thread: Thread): number {
  let latest = 0;
  for (const message of thread.messages) {
    if (message.sender !== 'admin') continue;
    const at = Date.parse(message.created_at);
    if (Number.isFinite(at) && at > latest) latest = at;
  }
  return latest;
}

/** Admin messages in `thread` newer than `watermark`. */
export function unreadSince(thread: Thread, watermark: number): number {
  let count = 0;
  for (const message of thread.messages) {
    if (message.sender !== 'admin') continue;
    const at = Date.parse(message.created_at);
    if (Number.isFinite(at) && at > watermark) count += 1;
  }
  return count;
}

/**
 * Returns `thread` with `unread_count` narrowed by what this device knows
 * the user has read. Identity is preserved when nothing changes so lists
 * stay referentially stable between polls.
 */
export function reconcileThread(
  thread: Thread,
  watermarks: ReadWatermarks,
): Thread {
  const watermark = watermarks.get(thread.id);
  if (watermark === undefined || thread.unread_count === 0) return thread;
  const unread = Math.min(thread.unread_count, unreadSince(thread, watermark));
  return unread === thread.unread_count ? thread : { ...thread, unread_count: unread };
}

export function reconcileThreads(
  threads: Thread[],
  watermarks: ReadWatermarks,
): Thread[] {
  return threads.map((thread) => reconcileThread(thread, watermarks));
}

export function sumUnread(threads: Thread[]): number {
  return threads.reduce((total, thread) => total + thread.unread_count, 0);
}

/**
 * Drops watermarks the server has caught up on (its own count is already 0)
 * and ones for threads that no longer exist, so the map can't grow without
 * bound over a long session.
 */
export function pruneWatermarks(
  watermarks: ReadWatermarks,
  serverThreads: Thread[],
): ReadWatermarks {
  const keep: ReadWatermarks = new Map();
  for (const thread of serverThreads) {
    const watermark = watermarks.get(thread.id);
    if (watermark !== undefined && thread.unread_count > 0) {
      keep.set(thread.id, watermark);
    }
  }
  return keep;
}

/**
 * Where the chat's "New" divider starts, as a `created_at` (ms): the oldest
 * of the `badge` newest unread replies, taken as the sheet opens and before
 * anything is marked read. Null when there is nothing to mark.
 *
 * The badge can be ahead of the cached threads — a count poll saw replies a
 * full load hasn't fetched yet. Those replies are newer than anything
 * cached, so the divider then starts after the newest cached reply and
 * lands on them when they arrive.
 */
export function firstUnreadAt(
  threads: Thread[] | null,
  badge: number,
): number | null {
  if (threads === null || badge <= 0) return null;
  const unread: number[] = [];
  let newest = 0;
  for (const thread of threads) {
    const replies = thread.messages
      .filter((message) => message.sender === 'admin')
      .map((message) => Date.parse(message.created_at))
      .filter(Number.isFinite);
    for (const at of replies) newest = Math.max(newest, at);
    unread.push(...replies.slice(Math.max(0, replies.length - thread.unread_count)));
  }
  if (unread.length === 0) return newest + 1;
  unread.sort((a, b) => b - a);
  return unread[Math.min(badge, unread.length) - 1] ?? null;
}
