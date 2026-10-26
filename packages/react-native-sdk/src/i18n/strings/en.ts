/**
 * English is the source table: every other language is typed against it, so a
 * missing or misspelled key fails the build rather than falling back silently
 * at runtime.
 *
 * Placeholders are `{name}` tokens filled in by `format()` — the table stays
 * pure data so it can be handed to a translator (or lifted to JSON) without
 * touching code.
 *
 * Keys that read identically in English are still separate when their context
 * differs: `home.open` labels a section of several threads, `status.open`
 * labels one thread's state, and plenty of languages inflect those
 * differently.
 */
export const en = {
  'home.title': 'Support',
  'home.subtitle': 'Start a conversation — we reply right here.',
  'home.close': 'Close support',
  'home.open': 'Open',
  'home.resolved': 'Resolved',
  'home.empty': 'No conversations yet',
  'home.emptyHint':
    'Anything you send lands with the team, and their replies come back to this sheet.',
  'home.replyTime': 'We reply within 24 hours',
  'home.noMessages': 'No messages yet',
  'home.you': 'You',
  'home.threadA11y': '{type} thread',
  'home.threadUnreadA11y': '{type} thread, {count} unread',
  'home.newA11y': 'New {type}',
  'home.language': 'Language',

  'type.feedback': 'Feedback',
  'type.feature_request': 'Feature request',
  'type.bug_report': 'Bug report',
  'hint.feedback': 'Tell us what you think',
  'hint.feature_request': 'Suggest an improvement',
  'hint.bug_report': "Something isn't working",
  'prompt.feedback': 'What should we know?',
  'prompt.feature_request': 'What would you like to see?',
  'prompt.bug_report': 'What happened, and what did you expect?',
  'sub.feedback': 'Good or bad — it goes straight to the team.',
  'sub.feature_request': 'Tell us what you are trying to do.',
  'sub.bug_report': 'Steps, screen, and what you expected all help.',

  'compose.back': 'Back to conversations',
  'compose.sent': 'Sent',
  'compose.sentHint':
    "We'll reply right here. You'll find the conversation under Open, and the button shows a badge when we answer.",
  'compose.done': 'Done',
  'compose.send': 'Send',
  'compose.sending': 'Sending…',
  'compose.minChars': 'At least {count} characters',

  'thread.support': 'Support',
  'thread.new': 'New',
  'thread.resolvedAt': 'Resolved · {date}',
  'thread.readOnly': 'This conversation is resolved and read-only',
  'thread.placeholder': 'Write a reply…',
  'chat.placeholder': 'Write a message…',
  'chat.notSent': 'Not sent · Tap to retry',
  'review.appStore': 'Rate on the App Store',
  'review.playStore': 'Rate on Google Play',
  'thread.sendA11y': 'Send reply',
  'thread.sendingA11y': 'Sending',
  'thread.translating': 'Translating…',

  'status.open': 'Open',
  'status.resolved': 'Resolved',

  'error.tryAgain': 'Try again',
  'error.rateLimited': 'Too many requests — try again later',
  'error.offline': "You're offline — check your connection",
  'error.sendFailed': "Couldn't send — try again",
  'error.loadFailed': "Couldn't load your conversations",
  'error.unavailable': 'Support is unavailable right now',
  'error.loadRateLimited': 'Too many requests — try again in a bit',

  'lang.title': 'Choose your language',
  'lang.subtitle':
    'Write in whichever language you prefer — we translate between you and the support team.',
  'lang.continue': 'Continue',
  'lang.change': 'Change language',
  'lang.saveFailed': "Couldn't save — try again",

  'time.justNow': 'just now',
  'time.minutes': '{count}m ago',
  'time.hours': '{count}h ago',
  'time.days': '{count}d ago',
  'time.weeks': '{count}w ago',
  'time.months': '{count}mo ago',
  'time.years': '{count}y ago',
  'time.today': 'Today',
  'time.yesterday': 'Yesterday',
} as const;

export type StringKey = keyof typeof en;

/** Every language provides every key — enforced at compile time. */
export type StringTable = Record<StringKey, string>;
