import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import type { Translator } from '../../i18n';
import {
  LANGUAGE_LABELS,
  SUPPORTED_LANGUAGES,
  type Language,
} from '../../i18n/languages';
import type { SupportTheme } from '../../theme';
import { CheckIcon, Chevron, CloseIcon } from '../icons';
import {
  IconButton,
  PressableRow,
  PrimaryButton,
  textStyles,
} from '../primitives';

/**
 * The one-time language prompt, and the same screen again whenever the user
 * changes their mind from the home header.
 *
 * Selecting a row re-renders the whole sheet in that language immediately —
 * the confirmation button is the only way to see what you are choosing before
 * you commit to it.
 */
export function LanguageScreen({
  theme,
  strings,
  selected,
  onSelect,
  onConfirm,
  onBack,
  onDismiss,
  saving,
  error,
}: {
  theme: SupportTheme;
  strings: Translator;
  selected: Language;
  onSelect: (language: Language) => void;
  onConfirm: () => void;
  /** Absent on first run: there is nothing to go back to yet. */
  onBack?: () => void;
  /**
   * First run only — dismissing without choosing closes the sheet and leaves
   * the preference unset, so the prompt appears again next time. Saving a
   * language the user never actually picked would be worse: every message
   * they write would be translated from the wrong one.
   */
  onDismiss?: () => void;
  saving: boolean;
  error: string | null;
}) {
  // Held so the list doesn't reorder under a finger mid-scroll.
  const [languages] = useState(() => [...SUPPORTED_LANGUAGES]);

  return (
    <View style={{ flex: 1 }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'flex-start',
          paddingHorizontal: 16,
          paddingTop: 4,
          paddingBottom: 16,
          gap: 10,
        }}
      >
        {onBack !== undefined && (
          <IconButton
            onPress={onBack}
            theme={theme}
            accessibilityLabel={strings.t('compose.back')}
            size={32}
          >
            <Chevron
              color={theme.colors.textSecondary}
              direction="left"
              size={12}
            />
          </IconButton>
        )}
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={textStyles.title(theme)}>{strings.t('lang.title')}</Text>
          <Text style={textStyles.secondary(theme)}>
            {strings.t('lang.subtitle')}
          </Text>
        </View>
        {onDismiss !== undefined && (
          <IconButton
            onPress={onDismiss}
            theme={theme}
            accessibilityLabel={strings.t('home.close')}
            size={32}
          >
            <CloseIcon color={theme.colors.textSecondary} size={12} />
          </IconButton>
        )}
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 8 }}>
        <View
          style={{
            marginHorizontal: 16,
            borderWidth: 1,
            borderColor: theme.colors.border,
            borderRadius: theme.radii.card,
            backgroundColor: theme.colors.surface,
            overflow: 'hidden',
          }}
        >
          {languages.map((language, i) => {
            const active = language === selected;
            return (
              <PressableRow
                key={language}
                onPress={() => onSelect(language)}
                theme={theme}
                accessibilityLabel={LANGUAGE_LABELS[language]}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                  paddingHorizontal: 16,
                  paddingVertical: 13,
                  borderTopWidth: i === 0 ? 0 : 1,
                  borderTopColor: theme.colors.border,
                }}
              >
                <Text
                  style={{
                    flex: 1,
                    fontSize: 15,
                    fontWeight: active ? '600' : '400',
                    color: theme.colors.textPrimary,
                  }}
                >
                  {LANGUAGE_LABELS[language]}
                </Text>
                {active && <CheckIcon color={theme.colors.accent} size={16} />}
              </PressableRow>
            );
          })}
        </View>
      </ScrollView>

      <View
        style={{
          paddingHorizontal: 16,
          paddingTop: 12,
          paddingBottom: 8,
          gap: 8,
          borderTopWidth: 1,
          borderTopColor: theme.colors.border,
        }}
      >
        {error !== null && (
          <Text style={{ fontSize: 12, color: theme.colors.statusDanger }}>
            {error}
          </Text>
        )}
        <PrimaryButton
          label={saving ? strings.t('compose.sending') : strings.t('lang.continue')}
          onPress={onConfirm}
          disabled={saving}
          theme={theme}
          fullWidth
        />
      </View>
    </View>
  );
}
