import { useEffect, useMemo, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { Translator } from '../../i18n';
import { LANGUAGE_LABELS, type Language } from '../../i18n/languages';
import type { SupportTheme } from '../../theme';
import type { Thread, ThreadMessage } from '../../types';
import { USER_MESSAGE_MAX, USER_MESSAGE_MIN } from '../../types';
import { dayLabel, formatDate, formatTime, isSameDay } from '../../utils';
import { ArrowUpIcon, CloseIcon, GlobeIcon } from '../icons';
import {
  EmptyState,
  ErrorState,
  IconButton,
  SkeletonBlock,
  textStyles,
} from '../primitives';

/** Consecutive messages from one sender inside this window form a group. */
const GROUP_WINDOW_MS = 5 * 60 * 1000;
/** The counter only appears once the limit is actually in play. */
const COUNTER_VISIBLE_FROM = USER_MESSAGE_MAX - 100;

/**
 * The chat is every conversation this user has had, in time order. The
 * dashboard still works in conversations it can resolve, so a resolve shows
 * here as a divider, and the next message simply starts the next one.
 */
type Item =
  | { kind: 'message'; key: string; at: number; message: ThreadMessage }
  | { kind: 'resolved'; key: string; at: number; resolvedAt: string };

interface Row {
  item: Item;
  firstInGroup: boolean;
  lastInGroup: boolean;
  /** Date separator to draw above this row, if any. */
  day: string | null;
  /** "New" separator above the first message the user hasn't seen. */
  startsUnread: boolean;
}

function buildItems(threads: Thread[]): Item[] {
  const items: Item[] = [];
  for (const thread of threads) {
    for (const message of thread.messages) {
      items.push({
        kind: 'message',
        key: message.id,
        at: Date.parse(message.created_at),
        message,
      });
    }
    if (thread.status === 'resolved' && thread.resolved_at !== null) {
      items.push({
        kind: 'resolved',
        key: `resolved-${thread.id}`,
        at: Date.parse(thread.resolved_at),
        resolvedAt: thread.resolved_at,
      });
    }
  }
  return items.sort((a, b) => a.at - b.at);
}

function buildRows(items: Item[], unreadCount: number, strings: Translator): Row[] {
  // Unread messages are the newest support replies, so the divider goes
  // above the Nth-from-last of them.
  let remaining = unreadCount;
  let firstUnreadKey: string | null = null;
  for (let i = items.length - 1; i >= 0 && remaining > 0; i -= 1) {
    const candidate = items[i];
    if (candidate?.kind !== 'message' || candidate.message.sender !== 'admin') {
      continue;
    }
    remaining -= 1;
    firstUnreadKey = candidate.key;
  }

  // Grouped by sender alone: two replies from two different admins are two
  // messages from "Support" on this side. A divider always breaks a group.
  const joins = (a: Item | undefined, b: Item) =>
    a !== undefined &&
    a.kind === 'message' &&
    b.kind === 'message' &&
    a.message.sender === b.message.sender &&
    Math.abs(b.at - a.at) < GROUP_WINDOW_MS &&
    isSameDay(a.message.created_at, b.message.created_at) &&
    b.key !== firstUnreadKey;

  let lastDayAt: number | null = null;
  return items.map((item, i) => {
    const previous = items[i - 1];
    const next = items[i + 1];
    let day: string | null = null;
    if (item.kind === 'message') {
      const iso = item.message.created_at;
      if (lastDayAt === null || !isSameDay(new Date(lastDayAt).toISOString(), iso)) {
        day = dayLabel(iso, strings);
      }
      lastDayAt = item.at;
    }
    return {
      item,
      firstInGroup: day !== null || !joins(previous, item),
      lastInGroup: next === undefined || !joins(item, next),
      day,
      startsUnread: item.key === firstUnreadKey,
    };
  });
}

function Separator({
  label,
  theme,
  tone = 'muted',
}: {
  label: string;
  theme: SupportTheme;
  tone?: 'muted' | 'accent';
}) {
  const color =
    tone === 'accent' ? theme.colors.accentText : theme.colors.textTertiary;
  const line = tone === 'accent' ? theme.colors.accentMuted : theme.colors.border;
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingVertical: 6,
      }}
    >
      <View style={{ flex: 1, height: 1, backgroundColor: line }} />
      <Text style={{ fontSize: 11, fontWeight: '600', letterSpacing: 0.3, color }}>
        {label}
      </Text>
      <View style={{ flex: 1, height: 1, backgroundColor: line }} />
    </View>
  );
}

function MessageBubble({
  message,
  firstInGroup,
  lastInGroup,
  theme,
  strings,
  reviewLabel,
  onOpenReview,
}: {
  message: ThreadMessage;
  firstInGroup: boolean;
  lastInGroup: boolean;
  theme: SupportTheme;
  strings: Translator;
  reviewLabel: string | null;
  onOpenReview: (messageId: string) => void;
}) {
  // A review request whose store isn't set up for this platform still
  // reads as the reply it is; it just has no button.
  const review = message.kind === 'review_request' && reviewLabel !== null;
  const own = message.sender === 'user';
  const round = theme.radii.bubble;
  const tight = theme.radii.bubbleTail;

  return (
    <View
      style={{
        maxWidth: '86%',
        alignSelf: own ? 'flex-end' : 'flex-start',
        alignItems: own ? 'flex-end' : 'flex-start',
        marginTop: firstInGroup ? 10 : 2,
        gap: 4,
      }}
    >
      {!own && firstInGroup && (
        <Text style={[textStyles.meta(theme), { paddingHorizontal: 4 }]}>
          {strings.t('thread.support')}
        </Text>
      )}
      <View
        style={{
          paddingHorizontal: 14,
          paddingVertical: 10,
          backgroundColor: own ? theme.colors.accent : theme.colors.surface,
          borderWidth: own ? 0 : 1,
          borderColor: theme.colors.border,
          borderTopLeftRadius: own || firstInGroup ? round : tight,
          borderBottomLeftRadius: own || lastInGroup ? round : tight,
          borderTopRightRadius: !own || firstInGroup ? round : tight,
          borderBottomRightRadius: !own || lastInGroup ? round : tight,
        }}
      >
        <Text
          style={[
            textStyles.body(theme),
            own && { color: theme.colors.accentForeground },
          ]}
        >
          {message.body}
        </Text>
        {review && (
          <Pressable
            onPress={() => onOpenReview(message.id)}
            accessibilityRole="link"
            accessibilityLabel={reviewLabel}
            style={({ pressed }) => ({
              marginTop: 10,
              height: 40,
              paddingHorizontal: 14,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              borderRadius: theme.radii.control,
              backgroundColor: pressed
                ? theme.colors.accentHover
                : theme.colors.accent,
            })}
          >
            <Text style={{ fontSize: 14, color: theme.colors.accentForeground }}>
              ★
            </Text>
            <Text
              style={{
                fontSize: 14,
                fontWeight: '600',
                color: theme.colors.accentForeground,
              }}
            >
              {reviewLabel}
            </Text>
          </Pressable>
        )}
      </View>
      {lastInGroup && (
        <Text style={[textStyles.meta(theme), { paddingHorizontal: 4 }]}>
          {/* A reply whose translation is still in flight says so, rather
              than showing English that changes under the reader. */}
          {message.translation_pending
            ? strings.t('thread.translating')
            : formatTime(message.created_at, strings)}
        </Text>
      )}
    </View>
  );
}

export function ChatScreen({
  theme,
  strings,
  language,
  threads,
  loading,
  error,
  onRetry,
  onSend,
  onChangeLanguage,
  onClose,
  reviewLabel,
  onOpenReview,
}: {
  theme: SupportTheme;
  strings: Translator;
  language: Language;
  threads: Thread[] | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  /** Resolves null on success, or a user-facing error message. */
  onSend: (message: string) => Promise<string | null>;
  onChangeLanguage: () => void;
  onClose: () => void;
  /** The review button's label, or null when this platform's store isn't set up. */
  reviewLabel: string | null;
  onOpenReview: (messageId: string) => void;
}) {
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [failedMessage, setFailedMessage] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  // Captured once threads first arrive: opening the chat marks everything
  // read within a tick, but the "New" divider should stay put while the
  // user reads.
  const [unreadOnOpen, setUnreadOnOpen] = useState<number | null>(null);
  useEffect(() => {
    if (unreadOnOpen === null && threads !== null) {
      setUnreadOnOpen(threads.reduce((sum, t) => sum + t.unread_count, 0));
    }
  }, [threads, unreadOnOpen]);

  const items = useMemo(() => buildItems(threads ?? []), [threads]);
  const rows = useMemo(
    () => buildRows(items, unreadOnOpen ?? 0, strings),
    [items, unreadOnOpen, strings],
  );

  const trimmed = draft.trim();
  const valid =
    trimmed.length >= USER_MESSAGE_MIN && trimmed.length <= USER_MESSAGE_MAX;

  useEffect(() => {
    scrollRef.current?.scrollToEnd({ animated: false });
  }, [items.length]);

  async function handleSend() {
    if (!valid || sending) return;
    setSending(true);
    setFailedMessage(null);
    const errorMessage = await onSend(trimmed);
    setSending(false);
    if (errorMessage === null) setDraft('');
    else setFailedMessage(errorMessage);
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Header */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          paddingHorizontal: 16,
          paddingTop: 4,
          paddingBottom: 12,
          borderBottomWidth: 1,
          borderBottomColor: theme.colors.border,
        }}
      >
        <Text style={[textStyles.title(theme), { flex: 1 }]}>
          {strings.t('home.title')}
        </Text>
        {/* Language is the sheet's only preference, so it lives here rather
            than behind a settings screen. */}
        <Pressable
          onPress={onChangeLanguage}
          accessibilityRole="button"
          accessibilityLabel={strings.t('lang.change')}
          hitSlop={6}
          style={({ pressed }) => ({
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            height: 32,
            paddingHorizontal: 10,
            borderRadius: theme.radii.pill,
            borderWidth: 1,
            borderColor: theme.colors.border,
            backgroundColor: pressed
              ? theme.colors.surfaceActive
              : theme.colors.surface,
          })}
        >
          <GlobeIcon color={theme.colors.textSecondary} size={14} />
          <Text style={[textStyles.meta(theme), { color: theme.colors.textSecondary }]}>
            {LANGUAGE_LABELS[language]}
          </Text>
        </Pressable>
        <IconButton
          onPress={onClose}
          theme={theme}
          accessibilityLabel={strings.t('home.close')}
          size={32}
        >
          <CloseIcon color={theme.colors.textSecondary} size={12} />
        </IconButton>
      </View>

      {/* Messages */}
      {error !== null && threads === null ? (
        // Only take over the screen when there's nothing cached to show —
        // a failed background poll shouldn't hide an already-loaded chat.
        <View style={{ flex: 1 }}>
          <ErrorState
            message={error}
            onRetry={onRetry}
            theme={theme}
            strings={strings}
          />
        </View>
      ) : loading && threads === null ? (
        <View style={{ flex: 1, paddingHorizontal: 16, paddingTop: 20, gap: 10 }}>
          <SkeletonBlock width="62%" height={44} theme={theme} radius={theme.radii.bubble} />
          <View style={{ alignItems: 'flex-end' }}>
            <SkeletonBlock width="48%" height={44} theme={theme} radius={theme.radii.bubble} />
          </View>
          <SkeletonBlock width="70%" height={60} theme={theme} radius={theme.radii.bubble} />
        </View>
      ) : items.length === 0 ? (
        <View style={{ flex: 1, justifyContent: 'center' }}>
          <EmptyState
            message={strings.t('home.subtitle')}
            hint={strings.t('home.emptyHint')}
            theme={theme}
          />
        </View>
      ) : (
        <ScrollView
          ref={scrollRef}
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 12 }}
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={() =>
            scrollRef.current?.scrollToEnd({ animated: false })
          }
        >
          {rows.map((row) => (
            <View key={row.item.key}>
              {row.day !== null && <Separator label={row.day} theme={theme} />}
              {row.startsUnread && (
                <Separator label={strings.t('thread.new')} theme={theme} tone="accent" />
              )}
              {row.item.kind === 'message' ? (
                <MessageBubble
                  message={row.item.message}
                  firstInGroup={row.firstInGroup}
                  lastInGroup={row.lastInGroup}
                  theme={theme}
                  strings={strings}
                  reviewLabel={reviewLabel}
                  onOpenReview={onOpenReview}
                />
              ) : (
                <View style={{ marginTop: 14, marginBottom: 4 }}>
                  <Separator
                    label={strings.t('thread.resolvedAt', {
                      date: formatDate(row.item.resolvedAt, strings),
                    })}
                    theme={theme}
                  />
                </View>
              )}
            </View>
          ))}
        </ScrollView>
      )}

      {/* Composer — always open: after a resolve, the next message starts
          the next conversation. */}
      <View
        style={{
          borderTopWidth: 1,
          borderTopColor: theme.colors.border,
          paddingHorizontal: 16,
          paddingTop: 10,
          paddingBottom: 4,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 10 }}>
          <TextInput
            value={draft}
            onChangeText={(v) => {
              setDraft(v);
              setFailedMessage(null);
            }}
            multiline
            editable={!sending}
            placeholder={strings.t('chat.placeholder')}
            placeholderTextColor={theme.colors.textTertiary}
            // Matches the sheet even when the theme is pinned against the
            // device's own setting.
            keyboardAppearance={theme.name}
            selectionColor={theme.colors.accent}
            style={{
              flex: 1,
              minHeight: 44,
              maxHeight: 120,
              borderWidth: 1,
              borderColor: theme.colors.border,
              borderRadius: theme.radii.cardLg,
              backgroundColor: theme.colors.surface,
              color: theme.colors.textPrimary,
              fontSize: 15,
              lineHeight: 20,
              paddingHorizontal: 14,
              paddingTop: 12,
              paddingBottom: 12,
              textAlignVertical: 'top',
            }}
          />
          <IconButton
            onPress={handleSend}
            theme={theme}
            tone="accent"
            size={44}
            disabled={!valid || sending}
            accessibilityLabel={strings.t(
              sending ? 'thread.sendingA11y' : 'thread.sendA11y',
            )}
          >
            <ArrowUpIcon color={theme.colors.accentForeground} size={19} />
          </IconButton>
        </View>

        {(draft.length >= COUNTER_VISIBLE_FROM || failedMessage !== null) && (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 10,
              paddingTop: 8,
              paddingHorizontal: 4,
            }}
          >
            {failedMessage !== null && (
              <Text style={{ fontSize: 12, color: theme.colors.statusDanger }}>
                {failedMessage}
              </Text>
            )}
            {draft.length >= COUNTER_VISIBLE_FROM && (
              <Text
                style={[
                  textStyles.meta(theme),
                  { marginLeft: 'auto' },
                  draft.length > USER_MESSAGE_MAX && {
                    color: theme.colors.statusDanger,
                  },
                ]}
              >
                {draft.length}/{USER_MESSAGE_MAX}
              </Text>
            )}
          </View>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}
