export type PushPermissionStatus = 'undetermined' | 'granted' | 'denied';

/** Row of `push_subscriptions` for one end user of one app. */
export interface PushSubscriptionRow {
  permission_status: PushPermissionStatus;
  expo_push_token: string | null;
  /** Null when the OS prompt has never been shown to this user. */
  asked_at: string | null;
}

export type QueryType = 'feedback' | 'feature_request' | 'bug_report';
export type QueryStatus = 'open' | 'resolved';
export type MessageSender = 'user' | 'admin';

export interface AdminProfile {
  id: string;
  username: string;
  display_name: string;
}

export interface AppRow {
  id: string;
  name: string;
  created_at: string;
  open_count: number;
}

export type TranslationStatus = 'skipped' | 'pending' | 'done' | 'failed';

/** Row shape of the `query_list` view. */
export interface QueryListRow {
  id: string;
  app_id: string;
  app_name: string;
  type: QueryType;
  status: QueryStatus;
  user_name: string;
  revenuecat_id: string;
  is_paid: boolean;
  app_version: string;
  created_at: string;
  resolved_at: string | null;
  resolved_by: string | null;
  resolved_by_name: string | null;
  /** Already the English rendering — the view resolves it. */
  excerpt: string | null;
  message_count: number;
  last_activity_at: string;
  unread_for_admin: boolean;
  /** The language this user writes in; null if they never picked one. */
  user_language: string | null;
}

export interface MessageRow {
  id: string;
  query_id: string;
  sender: MessageSender;
  admin_id: string | null;
  /** As authored: the user's language for their messages, English for ours. */
  body: string;
  /** The counterpart rendering: English for user messages, theirs for ours. */
  body_translated: string | null;
  body_language: string | null;
  translation_status: TranslationStatus;
  created_at: string;
  admin_name: string | null;
}

export interface Stats {
  open_count: number;
  resolved_this_week: number;
  avg_first_response_minutes: number | null;
}

export const QUERY_TYPE_LABEL: Record<QueryType, string> = {
  feedback: 'Feedback',
  feature_request: 'Feature request',
  bug_report: 'Bug report',
};

export type SortKey = 'newest' | 'oldest' | 'active';
export type TypeFilter = QueryType | 'all';
export type StatusFilter = QueryStatus | 'all';
export type PaidFilter = 'all' | 'paid' | 'free';
