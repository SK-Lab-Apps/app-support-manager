import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Text, TextInput, View } from 'react-native';
import type { SupportTheme } from '../../theme';
import type { QueryType } from '../../types';
import { QUERY_TYPE_LABEL, USER_MESSAGE_MAX, USER_MESSAGE_MIN } from '../../types';
import { CheckIcon, Chevron } from '../icons';
import { PressableRow, PrimaryButton, textStyles } from '../primitives';

export function ComposeScreen({
  theme,
  type,
  onBack,
  onSubmit,
}: {
  theme: SupportTheme;
  type: QueryType;
  onBack: () => void;
  /** Resolves null on success, or a user-facing error message. */
  onSubmit: (message: string) => Promise<string | null>;
}) {
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [failedMessage, setFailedMessage] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const trimmed = message.trim();
  const valid =
    trimmed.length >= USER_MESSAGE_MIN && trimmed.length <= USER_MESSAGE_MAX;
  const overLimit = message.length > USER_MESSAGE_MAX;

  async function handleSubmit() {
    if (!valid || submitting) return;
    setSubmitting(true);
    setFailedMessage(null);
    const errorMessage = await onSubmit(trimmed);
    setSubmitting(false);
    if (errorMessage === null) setSent(true);
    else setFailedMessage(errorMessage);
  }

  if (sent) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 }}>
        <View
          style={{
            width: 40,
            height: 40,
            borderRadius: 20,
            borderWidth: 1,
            borderColor: theme.colors.statusResolved,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <CheckIcon color={theme.colors.statusResolved} size={14} />
        </View>
        <Text style={textStyles.body(theme)}>Sent</Text>
        <Text style={[textStyles.secondary(theme), { textAlign: 'center' }]}>
          We&apos;ll reply here. You&apos;ll see the thread under Open.
        </Text>
        <View style={{ marginTop: 8 }}>
          <PrimaryButton label="Done" onPress={onBack} theme={theme} />
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Header: back + read-only chosen type */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          paddingHorizontal: 12,
          paddingBottom: 12,
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
        <Text style={textStyles.title(theme)}>{QUERY_TYPE_LABEL[type]}</Text>
      </View>

      <View style={{ flex: 1, paddingHorizontal: 16 }}>
        <TextInput
          value={message}
          onChangeText={(v) => {
            setMessage(v);
            setFailedMessage(null);
          }}
          multiline
          autoFocus
          placeholder={
            type === 'bug_report'
              ? 'What happened, and what did you expect?'
              : type === 'feature_request'
                ? 'What would you like to see?'
                : 'What should we know?'
          }
          placeholderTextColor={theme.colors.textTertiary}
          style={{
            minHeight: 120,
            maxHeight: 220,
            borderWidth: 1,
            borderColor: theme.colors.border,
            borderRadius: theme.radii.control,
            backgroundColor: theme.colors.surface,
            color: theme.colors.textPrimary,
            fontSize: 14,
            lineHeight: 20,
            padding: 12,
            textAlignVertical: 'top',
          }}
        />
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            marginTop: 8,
            gap: 12,
          }}
        >
          <Text
            style={[
              textStyles.meta(theme),
              overLimit && { color: theme.colors.statusDanger },
            ]}
          >
            {message.length}/{USER_MESSAGE_MAX}
          </Text>
          {trimmed.length > 0 && trimmed.length < USER_MESSAGE_MIN && (
            <Text style={textStyles.meta(theme)}>
              At least {USER_MESSAGE_MIN} characters
            </Text>
          )}
          {failedMessage !== null && (
            <Text style={{ fontSize: 11, color: theme.colors.statusDanger }}>
              {failedMessage}
            </Text>
          )}
          <View style={{ marginLeft: 'auto' }}>
            <PrimaryButton
              label={submitting ? 'Sending…' : 'Send'}
              onPress={handleSubmit}
              disabled={!valid || submitting}
              theme={theme}
            />
          </View>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}
