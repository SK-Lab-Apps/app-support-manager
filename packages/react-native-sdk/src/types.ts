import type { StyleProp, ViewStyle } from 'react-native';
import type { Language } from './i18n/languages';

export type QueryType = 'feedback' | 'feature_request' | 'bug_report';
export type QueryStatus = 'open' | 'resolved';
export type MessageSender = 'user' | 'admin';
export type ThemeName = 'dark' | 'light';
export type PushPermissionStatus = 'undetermined' | 'granted' | 'denied';

/**
 * How the launcher renders:
 *   solid   — accent fill, elevated. The floating action button.
 *   soft    — app surface + hairline border. Sits in a header or toolbar.
 *   minimal — bare mark, no fill or border. Sits in a nav bar.
 */
export type LauncherVariant = 'solid' | 'soft' | 'minimal';

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
   * Brand color (hex, e.g. "#FF5A1F") replacing the default accent across
   * the launcher, buttons, and the user's own message bubbles. The pressed
   * shade, the 12% wash, and a legible foreground are derived from it.
   */
  accentColor?: string;
  /** Launcher style. Default "solid" — the floating action button. */
  variant?: LauncherVariant;
  /** Launcher diameter in px (height when `label` is set). Default 52. */
  size?: number;
  /** Renders the launcher as a pill with this text beside the mark. */
  label?: string;
  /** Style applied to the launcher — position it, add margins, etc. */
  style?: StyleProp<ViewStyle>;
  /**
   * Idle poll interval (ms) — how often the unread badge is refreshed while
   * the sheet is CLOSED, using a lightweight count-only endpoint. Default
   * 60000; set 0 to disable idle polling (mount / sheet-open / foreground
   * refreshes still happen).
   *
   * While the sheet is open the SDK polls faster on its own: every 15s on
   * the thread list and every 5s inside a thread, where latency is felt.
   */
  pollIntervalMs?: number;
  /**
   * Optional EAS project id, forwarded to expo-notifications when minting a
   * push token. Only needed if the host app's config doesn't already
   * provide one. Push is skipped entirely when expo-notifications isn't
   * installed — it is an optional peer dependency.
   */
  expoProjectId?: string;
  /**
   * Pre-selects a language in the picker the first time a user opens support.
   * Pass it when the host app already knows what the user reads — an in-app
   * language setting beats the device locale, which is what the SDK falls
   * back to. It is a default, not an override: the user still chooses, and a
   * choice they have already made always wins.
   */
  defaultLanguage?: Language;
}

export interface ThreadMessage {
  id: string;
  sender: MessageSender;
  /**
   * Already in the user's language: their own messages as they wrote them,
   * support replies translated. The server does the choosing — see the
   * get-threads function.
   */
  body: string;
  created_at: string;
  /**
   * A support reply whose translation hasn't landed yet. `body` currently
   * holds the English original; it will change under the reader shortly, so
   * the UI says so rather than letting it flicker.
   */
  translation_pending: boolean;
}

/**
 * Note the absence of any admin identity: end users see one support team,
 * not the people staffing it, so the names never leave the server. The
 * dashboard still shows who wrote and who resolved what.
 */
export interface Thread {
  id: string;
  type: QueryType;
  status: QueryStatus;
  created_at: string;
  resolved_at: string | null;
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
  /** Null when this user has never picked one — the SDK then asks. */
  language: string | null;
}

/**
 * English labels, kept for host apps that render their own entry points.
 * Inside the sheet the labels come from the string table instead, so they
 * follow the user's language.
 */
export const QUERY_TYPE_LABEL: Record<QueryType, string> = {
  feedback: 'Feedback',
  feature_request: 'Feature request',
  bug_report: 'Bug report',
};

export const USER_MESSAGE_MIN = 10;
export const USER_MESSAGE_MAX = 300;
