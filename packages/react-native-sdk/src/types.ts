export type QueryType = 'feedback' | 'feature_request' | 'bug_report';
export type QueryStatus = 'open' | 'resolved';
export type MessageSender = 'user' | 'admin';
export type ThemeName = 'dark' | 'light';

export interface SupportUser {
  /** Display name shown to the support team. */
  name: string;
  /** Whether the user is on a paid plan. */
  isPaid: boolean;
  /** RevenueCat app user id — identifies the user's threads. */
  revenuecatId: string;
  /** Host app version, e.g. "2.4.1". */
  appVersion: string;
}

export interface SupportButtonProps {
  /** App name as registered in the admin dashboard. Required. */
  appName: string;
  /** Per-app API key (sk_support_…). Required. Keep it in secret config. */
  apiKey: string;
  /** The current end user. Required. */
  user: SupportUser;
  /**
   * Base URL of the Supabase project hosting the support backend,
   * e.g. "https://abcd1234.supabase.co". Required — the SDK talks to its
   * Edge Functions.
   */
  supabaseUrl: string;
  /** Visual theme. Matches the admin dashboard tokens. Default "dark". */
  theme?: ThemeName;
  /**
   * How often (ms) to re-fetch threads in the background so the unread badge
   * stays current without opening the sheet. Also refreshes whenever the app
   * returns to the foreground. Default 30000; set 0 to disable background
   * polling (mount / sheet-open / foreground refreshes still happen).
   */
  pollIntervalMs?: number;
}

export interface ThreadMessage {
  id: string;
  sender: MessageSender;
  body: string;
  created_at: string;
  admin_name: string | null;
}

export interface Thread {
  id: string;
  type: QueryType;
  status: QueryStatus;
  created_at: string;
  resolved_at: string | null;
  resolved_by_name: string | null;
  app_version: string;
  unread_count: number;
  last_message: {
    body: string;
    sender: MessageSender;
    created_at: string;
  } | null;
  messages: ThreadMessage[];
}

export interface ThreadsResponse {
  threads: Thread[];
  total_unread: number;
}

export const QUERY_TYPE_LABEL: Record<QueryType, string> = {
  feedback: 'Feedback',
  feature_request: 'Feature request',
  bug_report: 'Bug report',
};

export const USER_MESSAGE_MIN = 10;
export const USER_MESSAGE_MAX = 300;
