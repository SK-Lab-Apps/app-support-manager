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

/** The slice of expo-notifications this SDK uses. */
interface ExpoNotificationsModule {
  getPermissionsAsync(): Promise<{ status: string; canAskAgain: boolean }>;
  requestPermissionsAsync(): Promise<{ status: string; canAskAgain: boolean }>;
  getExpoPushTokenAsync(options?: {
    projectId?: string;
  }): Promise<{ data: string }>;
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
