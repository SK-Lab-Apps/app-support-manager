import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  KeyboardAvoidingView,
  Platform,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { Translator } from '../../i18n';
import type { SupportTheme } from '../../theme';
import type { QueryType } from '../../types';
import { USER_MESSAGE_MAX, USER_MESSAGE_MIN } from '../../types';
import { CheckIcon, Chevron } from '../icons';
import {
  IconButton,
  PrimaryButton,
  textStyles,
  TypeGlyph,
} from '../primitives';

/** Scales in once on success — the only celebratory motion in the SDK. */
function SentMark({ theme }: { theme: SupportTheme }) {
  const scale = useRef(new Animated.Value(0.6)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(scale, {
        toValue: 1,
        duration: 320,
        easing: Easing.bezier(0.16, 1, 0.3, 1),
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 1,
        duration: 200,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [scale, opacity]);

  return (
    <Animated.View
      style={{
        width: 56,
        height: 56,
        borderRadius: 28,
        backgroundColor: theme.colors.statusResolvedBg,
        borderWidth: 1,
        borderColor: theme.colors.statusResolved,
        alignItems: 'center',
        justifyContent: 'center',
        opacity,
        transform: [{ scale }],
      }}
    >
      <CheckIcon color={theme.colors.statusResolved} size={20} />
    </Animated.View>
  );
}

export function ComposeScreen({
  theme,
  strings,
  type,
  onBack,
  onSubmit,
}: {
  theme: SupportTheme;
  strings: Translator;
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
  const tooShort = trimmed.length > 0 && trimmed.length < USER_MESSAGE_MIN;

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
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          gap: 14,
          paddingHorizontal: 32,
          paddingBottom: 40,
        }}
      >
        <SentMark theme={theme} />
        <Text style={textStyles.title(theme)}>{strings.t('compose.sent')}</Text>
        <Text style={[textStyles.secondary(theme), { textAlign: 'center' }]}>
          {strings.t('compose.sentHint')}
        </Text>
        <View style={{ marginTop: 6 }}>
          <PrimaryButton
            label={strings.t('compose.done')}
            onPress={onBack}
            theme={theme}
          />
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Header: back + the chosen type */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          paddingHorizontal: 12,
          paddingBottom: 14,
        }}
      >
        <IconButton
          onPress={onBack}
          theme={theme}
          accessibilityLabel={strings.t('compose.back')}
          size={32}
        >
          <Chevron color={theme.colors.textSecondary} direction="left" size={12} />
        </IconButton>
        <TypeGlyph type={type} theme={theme} size={32} />
        <View style={{ flex: 1, gap: 1 }}>
          <Text style={textStyles.heading(theme)}>
            {strings.t(`type.${type}`)}
          </Text>
          <Text style={textStyles.meta(theme)}>{strings.t(`sub.${type}`)}</Text>
        </View>
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
          editable={!submitting}
          placeholder={strings.t(`prompt.${type}`)}
          placeholderTextColor={theme.colors.textTertiary}
          style={{
            minHeight: 140,
            maxHeight: 240,
            borderWidth: 1,
            borderColor: theme.colors.border,
            borderRadius: theme.radii.card,
            backgroundColor: theme.colors.surface,
            color: theme.colors.textPrimary,
            fontSize: 15,
            lineHeight: 21,
            padding: 14,
            textAlignVertical: 'top',
          }}
        />

        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
            paddingTop: 10,
            paddingHorizontal: 2,
            minHeight: 20,
          }}
        >
          {failedMessage !== null ? (
            <Text style={{ fontSize: 12, color: theme.colors.statusDanger }}>
              {failedMessage}
            </Text>
          ) : tooShort ? (
            <Text style={textStyles.meta(theme)}>
              {strings.t('compose.minChars', { count: USER_MESSAGE_MIN })}
            </Text>
          ) : null}
          <Text
            style={[
              textStyles.meta(theme),
              { marginLeft: 'auto' },
              overLimit && { color: theme.colors.statusDanger },
            ]}
          >
            {message.length}/{USER_MESSAGE_MAX}
          </Text>
        </View>

        <View style={{ paddingTop: 12 }}>
          <PrimaryButton
            label={strings.t(submitting ? 'compose.sending' : 'compose.send')}
            onPress={handleSubmit}
            disabled={!valid || submitting}
            theme={theme}
            fullWidth
          />
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}
