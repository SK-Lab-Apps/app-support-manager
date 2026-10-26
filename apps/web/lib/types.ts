export type PushPermissionStatus = 'undetermined' | 'granted' | 'denied';

/** Row of `push_subscriptions` for one end user of one app. */
export interface PushSubscriptionRow {
  permission_status: PushPermissionStatus;
  expo_push_token: string | null;
  /** Null when the OS prompt has never been shown to this user. */
  asked_at: string | null;
}

/** 'support' is the single chat (SDK 0.4+); the other three come from older SDKs. */
export type QueryType = 'feedback' | 'feature_request' | 'bug_report' | 'support';
/** The cancelled plans: auto-renew is off, access lasts until the period ends. */
export type UserPlan = 'free' | 'trial' | 'pro' | 'trial_cancelled' | 'pro_cancelled';
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
  /** The user's current plan (falls back to the query's is_paid). */
  plan: UserPlan;
  /** Who wrote first: the user, or us via a send from the Users tab. */
  initiated_by: MessageSender;
  broadcast_id: string | null;
  first_user_message_at: string | null;
  /** True once the user has written — conversations we start wait until then. */
  in_inbox: boolean;
}

/** Row shape of the `app_user_list` view. */
export interface AppUserRow {
  app_id: string;
  revenuecat_id: string;
  /** Null for users known only from a push registration. */
  name: string | null;
  plan: UserPlan;
  app_version: string | null;
  /** Null until the user runs SDK 0.4+. */
  sdk_version: string | null;
  first_seen_at: string;
  last_seen_at: string;
  language: string | null;
  push_status: PushPermissionStatus | null;
  push_reachable: boolean;
  conversation_count: number;
}

export interface MessageTemplate {
  id: string;
  name: string;
  body: string;
  created_at: string;
  updated_at: string;
}

/** Row shape of the `broadcast_summary` view. */
export interface BroadcastSummary {
  id: string;
  app_id: string;
  body: string;
  send_push: boolean;
  recipient_count: number;
  created_at: string;
  sent_by_name: string;
  template_name: string | null;
  read_count: number;
  replied_count: number;
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
  /** 'review_request': a reply that carries a store review button in the app. */
  kind: MessageKind;
  /** When the user tapped through to the store; review requests only. */
  review_opened_at: string | null;
}

export type MessageKind = 'text' | 'review_request';
export type StorePlatform = 'ios' | 'android';

/** Where review requests send users; set per app. */
export interface StoreListing {
  app_store_id: string | null;
  play_store_package: string | null;
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
  support: 'Chat',
};

export const PLAN_LABEL: Record<UserPlan, string> = {
  free: 'Free',
  trial: 'Trial',
  pro: 'PRO',
  trial_cancelled: 'Trial cancelled',
  pro_cancelled: 'PRO cancelled',
};

export type SortKey = 'newest' | 'oldest' | 'active';
export type TypeFilter = QueryType | 'all';
export type StatusFilter = QueryStatus | 'all';
export type PlanFilter = UserPlan | 'all';
