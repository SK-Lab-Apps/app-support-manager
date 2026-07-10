import { useEffect, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { SupportTheme } from '../../theme';
import type { Thread } from '../../types';
import { USER_MESSAGE_MAX, USER_MESSAGE_MIN } from '../../types';
import { formatDate, relativeTime } from '../../utils';
import { Chevron } from '../icons';
import {
  PressableRow,
  PrimaryButton,
  StatusIndicator,
  textStyles,
  TypeChipView,
} from '../primitives';

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

  const resolved = thread.status === 'resolved';
  const trimmed = draft.trim();
  const valid =
    trimmed.length >= USER_MESSAGE_MIN && trimmed.length <= USER_MESSAGE_MAX;

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
          gap: 8,
          paddingHorizontal: 12,
          paddingBottom: 10,
          borderBottomWidth: 1,
          borderBottomColor: theme.colors.border,
        }}
      >
        <PressableRow
          onPress={onBack}
          theme={theme}
          accessibilityLabel="Back"
          style={{ padding: 6, borderRadius: theme.radii.control }}
        >
          <Chevron color={theme.colors.textSecondary} direction="left" size={12} />
        </PressableRow>
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
        contentContainerStyle={{ padding: 16, gap: 10 }}
      >
        {thread.messages.map((m) => {
          const own = m.sender === 'user';
          return (
            <View
              key={m.id}
              style={{
                maxWidth: '85%',
                alignSelf: own ? 'flex-end' : 'flex-start',
                alignItems: own ? 'flex-end' : 'flex-start',
                gap: 3,
              }}
            >
              {!own && (
                <Text style={textStyles.meta(theme)}>
                  {m.admin_name ?? 'Support'}
                </Text>
              )}
              <View
                style={{
                  borderRadius: theme.radii.card,
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  backgroundColor: own
                    ? theme.colors.accentMuted
                    : theme.colors.surface,
                  borderWidth: own ? 0 : 1,
                  borderColor: theme.colors.border,
                }}
              >
                <Text style={textStyles.body(theme)}>{m.body}</Text>
              </View>
              <Text style={textStyles.meta(theme)}>
                {relativeTime(m.created_at)}
              </Text>
            </View>
          );
        })}

        {resolved && thread.resolved_at && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 6 }}>
            <View style={{ flex: 1, height: 1, backgroundColor: theme.colors.border }} />
            <Text style={textStyles.meta(theme)}>
              Resolved by {thread.resolved_by_name ?? 'support'} ·{' '}
              {formatDate(thread.resolved_at)}
            </Text>
            <View style={{ flex: 1, height: 1, backgroundColor: theme.colors.border }} />
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
        }}
      >
        {resolved ? (
          <Text
            style={[
              textStyles.meta(theme),
              { textAlign: 'center', paddingVertical: 8 },
            ]}
          >
            This thread is resolved and read-only
          </Text>
        ) : (
          <>
            <TextInput
              value={draft}
              onChangeText={(v) => {
                setDraft(v);
                setFailedMessage(null);
              }}
              multiline
              placeholder="Reply"
              placeholderTextColor={theme.colors.textTertiary}
              style={{
                minHeight: 60,
                maxHeight: 120,
                borderWidth: 1,
                borderColor: theme.colors.border,
                borderRadius: theme.radii.control,
                backgroundColor: theme.colors.surface,
                color: theme.colors.textPrimary,
                fontSize: 14,
                lineHeight: 20,
                padding: 10,
                textAlignVertical: 'top',
              }}
            />
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                paddingVertical: 8,
              }}
            >
              <Text
                style={[
                  textStyles.meta(theme),
                  draft.length > USER_MESSAGE_MAX && {
                    color: theme.colors.statusDanger,
                  },
                ]}
              >
                {draft.length}/{USER_MESSAGE_MAX}
              </Text>
              {failedMessage !== null && (
                <Text style={{ fontSize: 11, color: theme.colors.statusDanger }}>
                  {failedMessage}
                </Text>
              )}
              <View style={{ marginLeft: 'auto' }}>
                <PrimaryButton
                  label={sending ? 'Sending…' : 'Send'}
                  onPress={handleSend}
                  disabled={!valid || sending}
                  theme={theme}
                />
              </View>
            </View>
          </>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}
