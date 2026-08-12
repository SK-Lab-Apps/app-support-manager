// Thin client for the Supabase Edge Functions. Every call authenticates with
// the per-app x-api-key header; no Supabase JS client is needed on-device.
import type {
  PushPermissionStatus,
  QueryType,
  ThreadsResponse,
} from './types';

export interface ApiConfig {
  supabaseUrl: string;
  apiKey: string;
  appName: string;
}

export class SupportApiError extends Error {
  status: number | null;
  /** True for network-level failures (likely offline). */
  offline: boolean;

  constructor(message: string, status: number | null, offline = false) {
    super(message);
    this.name = 'SupportApiError';
    this.status = status;
    this.offline = offline;
  }
}

async function request<T>(
  config: ApiConfig,
  path: string,
  init: RequestInit,
): Promise<T> {
  const url = `${config.supabaseUrl.replace(/\/$/, '')}/functions/v1/${path}`;
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': config.apiKey,
        ...init.headers,
      },
    });
  } catch {
    throw new SupportApiError('Network request failed', null, true);
  }

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    // Non-JSON error body — fall through with status only.
  }

  if (!response.ok) {
    const message =
      payload !== null &&
      typeof payload === 'object' &&
      'error' in payload &&
      typeof (payload as { error: unknown }).error === 'string'
        ? (payload as { error: string }).error
        : `Request failed (${response.status})`;
    throw new SupportApiError(message, response.status);
  }

  return payload as T;
}

export function getThreads(
  config: ApiConfig,
  revenuecatId: string,
): Promise<ThreadsResponse> {
  const params = new URLSearchParams({ revenuecat_id: revenuecatId });
  return request<ThreadsResponse>(config, `get-threads?${params.toString()}`, {
    method: 'GET',
  });
}

/**
 * Badge-only endpoint (~18 bytes) used for idle polling, instead of
 * re-fetching every thread and message just to check for new replies.
 */
export function getUnreadCount(
  config: ApiConfig,
  revenuecatId: string,
): Promise<{ total_unread: number }> {
  const params = new URLSearchParams({ revenuecat_id: revenuecatId });
  return request(config, `get-unread-count?${params.toString()}`, {
    method: 'GET',
  });
}

/** Reports the OS notification permission outcome (including denials). */
export function registerPush(
  config: ApiConfig,
  input: {
    revenuecatId: string;
    permissionStatus: PushPermissionStatus;
    expoPushToken: string | null;
    asked: boolean;
  },
): Promise<{ ok: boolean }> {
  return request(config, 'register-push', {
    method: 'POST',
    body: JSON.stringify({
      app_name: config.appName,
      revenuecat_id: input.revenuecatId,
      permission_status: input.permissionStatus,
      expo_push_token: input.expoPushToken,
      asked: input.asked,
    }),
  });
}

/** Records the language the user reads and writes support messages in. */
export function setLanguage(
  config: ApiConfig,
  input: { revenuecatId: string; language: string },
): Promise<{ language: string }> {
  return request(config, 'set-language', {
    method: 'POST',
    body: JSON.stringify({
      revenuecat_id: input.revenuecatId,
      language: input.language,
    }),
  });
}

export function submitQuery(
  config: ApiConfig,
  input: {
    queryType: QueryType;
    message: string;
    userName: string;
    isPaid: boolean;
    revenuecatId: string;
    appVersion: string;
    language: string;
  },
): Promise<{ query_id: string }> {
  return request(config, 'submit-query', {
    method: 'POST',
    body: JSON.stringify({
      app_name: config.appName,
      query_type: input.queryType,
      message: input.message,
      user_name: input.userName,
      is_paid: input.isPaid,
      revenuecat_id: input.revenuecatId,
      app_version: input.appVersion,
      // Sent on every write so a lost set-language call self-heals.
      language: input.language,
    }),
  });
}

export function postMessage(
  config: ApiConfig,
  input: {
    queryId: string;
    revenuecatId: string;
    message: string;
    language: string;
  },
): Promise<{ message_id: string }> {
  return request(config, 'post-message', {
    method: 'POST',
    body: JSON.stringify({
      query_id: input.queryId,
      revenuecat_id: input.revenuecatId,
      message: input.message,
      language: input.language,
    }),
  });
}

export function markRead(
  config: ApiConfig,
  input: { queryId: string; revenuecatId: string },
): Promise<{ ok: boolean }> {
  return request(config, 'mark-read', {
    method: 'POST',
    body: JSON.stringify({
      query_id: input.queryId,
      revenuecat_id: input.revenuecatId,
    }),
  });
}
