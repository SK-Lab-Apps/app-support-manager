import { useEffect, useMemo, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { SupportTheme } from '../../theme';
import type { Thread, ThreadMessage } from '../../types';
import { USER_MESSAGE_MAX, USER_MESSAGE_MIN } from '../../types';
import { dayLabel, formatDate, formatTime, isSameDay, relativeTime } from '../../utils';
import { ArrowUpIcon, Chevron } from '../icons';
import {
  IconButton,
  StatusIndicator,
  textStyles,
  TypeChipView,
} from '../primitives';

/** Consecutive messages from one sender inside this window form a group. */
const GROUP_WINDOW_MS = 5 * 60 * 1000;
/** The counter only appears once the limit is actually in play. */
const COUNTER_VISIBLE_FROM = USER_MESSAGE_MAX - 60;

interface Row {
  message: ThreadMessage;
  firstInGroup: boolean;
  lastInGroup: boolean;
  /** Date separator to draw above this message, if any. */
  day: string | null;
  /** "New" separator above the first message the user hasn't seen. */
  startsUnread: boolean;
}

function buildRows(messages: ThreadMessage[], unreadCount: number): Row[] {
  // Unread messages are always the newest admin ones, so the divider goes
  // above the Nth-from-last admin message.
  let remaining = unreadCount;
  let firstUnreadId: string | null = null;
  for (let i = messages.length - 1; i >= 0 && remaining > 0; i -= 1) {
    const candidate = messages[i];
    if (candidate === undefined || candidate.sender !== 'admin') continue;
    remaining -= 1;
    firstUnreadId = candidate.id;
  }

  return messages.map((message, i) => {
    const previous = i > 0 ? (messages[i - 1] ?? null) : null;
    const next = i < messages.length - 1 ? (messages[i + 1] ?? null) : null;
    const withinGroup = (a: ThreadMessage | null, b: ThreadMessage) =>
      a !== null &&
      a.sender === b.sender &&
      a.admin_name === b.admin_name &&
      Math.abs(Date.parse(b.created_at) - Date.parse(a.created_at)) <
        GROUP_WINDOW_MS;

    const day =
      previous === null || !isSameDay(previous.created_at, message.created_at)
        ? dayLabel(message.created_at)
        : null;
    const startsUnread = message.id === firstUnreadId;

    return {
      message,
      // A separator always breaks a group.
      firstInGroup: day !== null || startsUnread || !withinGroup(previous, message),
      lastInGroup:
        next === null ||
        next.id === firstUnreadId ||
        !isSameDay(next.created_at, message.created_at) ||
        !withinGroup(next, message),
      day,
      startsUnread,
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
    tone === 'accent' ? theme.colors.accent : theme.colors.textTertiary;
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingVertical: 6,
      }}
    >
      <View
        style={{
          flex: 1,
          height: 1,
          backgroundColor:
            tone === 'accent' ? theme.colors.accentMuted : theme.colors.border,
        }}
      />
      <Text
        style={{
          fontSize: 11,
          fontWeight: '600',
          letterSpacing: 0.3,
          color,
        }}
      >
        {label}
      </Text>
      <View
        style={{
          flex: 1,
          height: 1,
          backgroundColor:
            tone === 'accent' ? theme.colors.accentMuted : theme.colors.border,
        }}
      />
    </View>
  );
}

function MessageBubble({ row, theme }: { row: Row; theme: SupportTheme }) {
  const { message, firstInGroup, lastInGroup } = row;
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
          {message.admin_name ?? 'Support'}
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
      </View>
      {lastInGroup && (
        <Text style={[textStyles.meta(theme), { paddingHorizontal: 4 }]}>
          {formatTime(message.created_at)}
        </Text>
      )}
    </View>
  );
}

export function ThreadScreen({
  theme,
  thread,
  onBack,
  onSend,
}: {
  theme: SupportTheme;
  thread: Thread;
  onBack: () => void;
  /** Resolves null on success, or a user-facing error message. */
  onSend: (message: string) => Promise<string | null>;
}) {
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [failedMessage, setFailedMessage] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  // Captured once: opening the thread marks it read within a tick, but the
  // "New" divider should stay put while the user is reading.
  const [unreadOnOpen] = useState(thread.unread_count);

  const resolved = thread.status === 'resolved';
  const trimmed = draft.trim();
  const valid =
    trimmed.length >= USER_MESSAGE_MIN && trimmed.length <= USER_MESSAGE_MAX;
  const tooShort = trimmed.length > 0 && trimmed.length < USER_MESSAGE_MIN;

  const rows = useMemo(
    () => buildRows(thread.messages, unreadOnOpen),
    [thread.messages, unreadOnOpen],
  );

  useEffect(() => {
    scrollRef.current?.scrollToEnd({ animated: false });
  }, [thread.messages.length]);

  async function handleSend() {
    if (!valid || sending || resolved) return;
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
          gap: 10,
          paddingHorizontal: 12,
          paddingBottom: 12,
          borderBottomWidth: 1,
          borderBottomColor: theme.colors.border,
        }}
      >
        <IconButton
          onPress={onBack}
          theme={theme}
          accessibilityLabel="Back to conversations"
          size={32}
        >
          <Chevron color={theme.colors.textSecondary} direction="left" size={12} />
        </IconButton>
        <TypeChipView type={thread.type} theme={theme} />
        <StatusIndicator status={thread.status} theme={theme} />
        <Text style={[textStyles.meta(theme), { marginLeft: 'auto' }]}>
          {relativeTime(thread.created_at)}
        </Text>
      </View>

      {/* Messages */}
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
          <View key={row.message.id}>
            {row.day !== null && <Separator label={row.day} theme={theme} />}
            {row.startsUnread && (
              <Separator label="New" theme={theme} tone="accent" />
            )}
            <MessageBubble row={row} theme={theme} />
          </View>
        ))}

        {resolved && thread.resolved_at !== null && (
          <View style={{ marginTop: 16 }}>
            <Separator
              label={`Resolved by ${thread.resolved_by_name ?? 'support'} · ${formatDate(
                thread.resolved_at,
              )}`}
              theme={theme}
            />
          </View>
        )}
      </ScrollView>

      {/* Composer */}
      <View
        style={{
          borderTopWidth: 1,
          borderTopColor: theme.colors.border,
          paddingHorizontal: 16,
          paddingTop: 10,
          paddingBottom: 4,
        }}
      >
        {resolved ? (
          <View
            style={{
              alignItems: 'center',
              paddingVertical: 10,
              borderRadius: theme.radii.control,
              backgroundColor: theme.colors.surface,
            }}
          >
            <Text style={textStyles.secondary(theme)}>
              This conversation is resolved and read-only
            </Text>
          </View>
        ) : (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 10 }}>
              <TextInput
                value={draft}
                onChangeText={(v) => {
                  setDraft(v);
                  setFailedMessage(null);
                }}
                multiline
                editable={!sending}
                placeholder="Write a reply…"
                placeholderTextColor={theme.colors.textTertiary}
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
                accessibilityLabel={sending ? 'Sending' : 'Send reply'}
              >
                <ArrowUpIcon color={theme.colors.accentForeground} size={19} />
              </IconButton>
            </View>

            {(tooShort ||
              draft.length >= COUNTER_VISIBLE_FROM ||
              failedMessage !== null) && (
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 10,
                  paddingTop: 8,
                  paddingHorizontal: 4,
                }}
              >
                {failedMessage !== null ? (
                  <Text style={{ fontSize: 12, color: theme.colors.statusDanger }}>
                    {failedMessage}
                  </Text>
                ) : tooShort ? (
                  <Text style={textStyles.meta(theme)}>
                    At least {USER_MESSAGE_MIN} characters
                  </Text>
                ) : null}
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
          </>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}
