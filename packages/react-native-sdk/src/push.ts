// Optional push-notification support.
//
// expo-notifications is an OPTIONAL peer dependency: if the host app has it
// installed we ask for permission and mint a token, otherwise every function
// here degrades to "undetermined" and the support flow is unaffected. The
// require is wrapped in try/catch so bundling succeeds either way.
//
// Nothing in the support experience is gated on the result — a user who
// denies notifications keeps full use of threads, replies, and unread
// badges. The status is reported purely so the dashboard can show whether
// the user is reachable.

import type { PushPermissionStatus } from './types';

/** The slice of a NotificationResponse that tap handling reads. */
interface NotificationResponse {
  actionIdentifier: string;
  notification: {
    request: {
      identifier: string;
      content: { data?: Record<string, unknown> | null };
    };
  };
}

/** The slice of expo-notifications this SDK uses. */
interface ExpoNotificationsModule {
  getPermissionsAsync(): Promise<{ status: string; canAskAgain: boolean }>;
  requestPermissionsAsync(): Promise<{ status: string; canAskAgain: boolean }>;
  getExpoPushTokenAsync(options?: {
    projectId?: string;
  }): Promise<{ data: string }>;
  addNotificationResponseReceivedListener(
    listener: (response: NotificationResponse) => void,
  ): { remove(): void };
  getLastNotificationResponseAsync(): Promise<NotificationResponse | null>;
  DEFAULT_ACTION_IDENTIFIER?: string;
}

function loadNotifications(): ExpoNotificationsModule | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('expo-notifications') as ExpoNotificationsModule;
    return typeof mod?.getPermissionsAsync === 'function' ? mod : null;
  } catch {
    return null;
  }
}

const notifications = loadNotifications();

/** True when the host app has expo-notifications installed. */
export const isPushAvailable = notifications !== null;

export interface PushRegistration {
  status: PushPermissionStatus;
  /** Whether the OS prompt was actually presented during this call. */
  asked: boolean;
  token: string | null;
}

function normalizeStatus(status: string): PushPermissionStatus {
  if (status === 'granted') return 'granted';
  if (status === 'denied') return 'denied';
  return 'undetermined';
}

/**
 * Ensures notification permission has been requested, and returns the
 * outcome plus an Expo push token when one is obtainable.
 *
 * Never throws: any failure resolves to an 'undetermined' registration so
 * callers can report it and move on.
 */
export async function ensurePushPermission(
  expoProjectId?: string,
): Promise<PushRegistration> {
  if (!notifications) {
    return { status: 'undetermined', asked: false, token: null };
  }

  try {
    const current = await notifications.getPermissionsAsync();
    let status = normalizeStatus(current.status);
    let asked = false;

    // Only prompt when the OS will actually show something. Re-prompting a
    // user who already decided is impossible on iOS and annoying on Android.
    if (status === 'undetermined' && current.canAskAgain) {
      const requested = await notifications.requestPermissionsAsync();
      status = normalizeStatus(requested.status);
      asked = true;
    }

    if (status !== 'granted') {
      return { status, asked, token: null };
    }

    // Token minting needs a dev/production build with push credentials —
    // it fails in Expo Go. A granted permission with no token is still
    // useful information for the dashboard, so report it either way.
    try {
      const token = await notifications.getExpoPushTokenAsync(
        expoProjectId ? { projectId: expoProjectId } : undefined,
      );
      return { status, asked, token: token.data };
    } catch {
      return { status, asked, token: null };
    }
  } catch {
    return { status: 'undetermined', asked: false, token: null };
  }
}

// ---------- opening the thread from a tapped notification ----------
//
// send-push tags every support reply with `{ type: 'support_reply',
// query_id }`. Tapping one should land the user in that thread, not wherever
// the host app happens to open.
//
// The observer starts when this module loads rather than when a launcher
// mounts, for two reasons: a cold start's tap is only reported once, early,
// and a host app may mount the launcher later (behind auth, on a settings
// screen). A tap seen before any launcher is listening is held for
// PENDING_TAP_TTL_MS and then dropped — opening the sheet minutes after the
// tap, the first time the user wanders onto that screen, would be a surprise.

const PENDING_TAP_TTL_MS = 60_000;

type SupportTapListener = (threadId: string) => void;

const tapListeners: SupportTapListener[] = [];
let pendingTap: { threadId: string; at: number } | null = null;
// Both the listener and getLastNotificationResponseAsync can report the same
// cold-start tap, and the latter keeps reporting it for the life of the
// process. Each tap is handled once.
const handledTaps = new Set<string>();

function supportReplyThreadId(response: NotificationResponse): string | null {
  const defaultAction = notifications?.DEFAULT_ACTION_IDENTIFIER;
  if (defaultAction && response.actionIdentifier !== defaultAction) return null;
  const data = response.notification?.request?.content?.data;
  if (data?.type !== 'support_reply') return null;
  return typeof data.query_id === 'string' ? data.query_id : null;
}

function handleResponse(response: NotificationResponse | null) {
  if (!response) return;
  const threadId = supportReplyThreadId(response);
  const tapId = response.notification?.request?.identifier;
  if (threadId === null || !tapId || handledTaps.has(tapId)) return;
  handledTaps.add(tapId);

  // One sheet, not one per mounted launcher: the newest launcher takes it.
  const listener = tapListeners[tapListeners.length - 1];
  if (listener) listener(threadId);
  else pendingTap = { threadId, at: Date.now() };
}

if (notifications) {
  try {
    notifications.addNotificationResponseReceivedListener(handleResponse);
    notifications
      .getLastNotificationResponseAsync()
      .then(handleResponse)
      .catch(() => {});
  } catch {
    // Same contract as the rest of this file: push never breaks support.
  }
}

/**
 * Calls `listener` with the thread id whenever the user taps a support-reply
 * notification — including, once, a tap from the last minute that arrived
 * before anything was listening. Returns an unsubscribe function.
 */
export function onSupportNotificationTap(
  listener: SupportTapListener,
): () => void {
  tapListeners.push(listener);

  const pending = pendingTap;
  pendingTap = null;
  if (pending && Date.now() - pending.at < PENDING_TAP_TTL_MS) {
    listener(pending.threadId);
  }

  return () => {
    const index = tapListeners.lastIndexOf(listener);
    if (index !== -1) tapListeners.splice(index, 1);
  };
}
