import { RefreshControl, ScrollView, Text, View } from 'react-native';
import type { Translator } from '../../i18n';
import { LANGUAGE_LABELS, type Language } from '../../i18n/languages';
import type { SupportTheme } from '../../theme';
import type { QueryType, Thread } from '../../types';
import { relativeTime } from '../../utils';
import { Chevron, CloseIcon, GlobeIcon } from '../icons';
import {
  EmptyState,
  ErrorState,
  IconButton,
  PressableRow,
  SectionLabel,
  SkeletonBlock,
  textStyles,
  TypeGlyph,
  UnreadPill,
} from '../primitives';

const COMPOSE_TYPES: QueryType[] = ['feedback', 'feature_request', 'bug_report'];

function ThreadRow({
  thread,
  theme,
  strings,
  onPress,
  last,
}: {
  thread: Thread;
  theme: SupportTheme;
  strings: Translator;
  onPress: () => void;
  last: boolean;
}) {
  const unread = thread.unread_count > 0;
  const type = strings.t(`type.${thread.type}`);
  const preview = thread.last_message?.body ?? strings.t('home.noMessages');
  const at = thread.last_message?.created_at ?? thread.created_at;

  return (
    <PressableRow
      onPress={onPress}
      theme={theme}
      accessibilityLabel={
        unread
          ? strings.t('home.threadUnreadA11y', {
              type,
              count: thread.unread_count,
            })
          : strings.t('home.threadA11y', { type })
      }
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingHorizontal: 16,
        paddingVertical: 13,
        borderBottomWidth: last ? 0 : 1,
        borderBottomColor: theme.colors.border,
        opacity: thread.status === 'resolved' ? 0.75 : 1,
      }}
    >
      <TypeGlyph type={thread.type} theme={theme} size={38} />

      <View style={{ flex: 1, gap: 3 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text
            numberOfLines={1}
            style={{
              flex: 1,
              fontSize: 14,
              fontWeight: unread ? '700' : '600',
              letterSpacing: -0.1,
              color: theme.colors.textPrimary,
            }}
          >
            {type}
          </Text>
          <Text style={textStyles.meta(theme)}>{relativeTime(at, strings)}</Text>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text
            numberOfLines={1}
            style={{
              flex: 1,
              fontSize: 13,
              lineHeight: 18,
              color: unread ? theme.colors.textPrimary : theme.colors.textSecondary,
            }}
          >
            {thread.last_message?.sender === 'user'
              ? `${strings.t('home.you')}: `
              : ''}
            {preview}
          </Text>
          {unread ? (
            <UnreadPill count={thread.unread_count} theme={theme} />
          ) : (
            <Chevron color={theme.colors.textTertiary} />
          )}
        </View>
      </View>
    </PressableRow>
  );
}

function ThreadGroup({
  label,
  threads,
  theme,
  strings,
  onOpenThread,
}: {
  label: string;
  threads: Thread[];
  theme: SupportTheme;
  strings: Translator;
  onOpenThread: (thread: Thread) => void;
}) {
  if (threads.length === 0) return null;
  return (
    <View style={{ marginTop: 24 }}>
      <SectionLabel theme={theme} style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
        {label}
      </SectionLabel>
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
        {threads.map((thread, i) => (
          <ThreadRow
            key={thread.id}
            thread={thread}
            theme={theme}
            strings={strings}
            onPress={() => onOpenThread(thread)}
            last={i === threads.length - 1}
          />
        ))}
      </View>
    </View>
  );
}

export function HomeScreen({
  theme,
  strings,
  language,
  threads,
  loading,
  refreshing,
  error,
  onRefresh,
  onCompose,
  onOpenThread,
  onChangeLanguage,
  onClose,
}: {
  theme: SupportTheme;
  strings: Translator;
  language: Language;
  threads: Thread[] | null;
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  onRefresh: () => void;
  onCompose: (type: QueryType) => void;
  onOpenThread: (thread: Thread) => void;
  onChangeLanguage: () => void;
  onClose: () => void;
}) {
  const open = (threads ?? []).filter((t) => t.status === 'open');
  const resolved = (threads ?? []).filter((t) => t.status === 'resolved');

  return (
    <View style={{ flex: 1 }}>
      {/* Header */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'flex-start',
          paddingHorizontal: 16,
          paddingTop: 4,
          paddingBottom: 16,
        }}
      >
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={textStyles.title(theme)}>{strings.t('home.title')}</Text>
          <Text style={textStyles.secondary(theme)}>
            {strings.t('home.subtitle')}
          </Text>
        </View>
        <IconButton
          onPress={onClose}
          theme={theme}
          accessibilityLabel={strings.t('home.close')}
          size={32}
        >
          <CloseIcon color={theme.colors.textSecondary} size={12} />
        </IconButton>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 24 }}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={theme.colors.textTertiary}
            colors={[theme.colors.accent]}
            progressBackgroundColor={theme.colors.surface}
          />
        }
      >
        {/* Compose actions */}
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
          {COMPOSE_TYPES.map((type, i) => (
            <PressableRow
              key={type}
              onPress={() => onCompose(type)}
              theme={theme}
              accessibilityLabel={strings.t('home.newA11y', {
                type: strings.t(`type.${type}`),
              })}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                paddingHorizontal: 14,
                paddingVertical: 12,
                borderTopWidth: i === 0 ? 0 : 1,
                borderTopColor: theme.colors.border,
              }}
            >
              <TypeGlyph type={type} theme={theme} size={34} />
              <View style={{ flex: 1, gap: 1 }}>
                <Text style={textStyles.heading(theme)}>
                  {strings.t(`type.${type}`)}
                </Text>
                <Text style={textStyles.meta(theme)}>
                  {strings.t(`hint.${type}`)}
                </Text>
              </View>
              <Chevron color={theme.colors.textTertiary} />
            </PressableRow>
          ))}
        </View>

        {/* Language — a quiet row rather than a settings screen, since it is
            the only preference the sheet has. */}
        <View
          style={{
            marginTop: 12,
            marginHorizontal: 16,
            borderWidth: 1,
            borderColor: theme.colors.border,
            borderRadius: theme.radii.card,
            backgroundColor: theme.colors.surface,
            overflow: 'hidden',
          }}
        >
          <PressableRow
            onPress={onChangeLanguage}
            theme={theme}
            accessibilityLabel={strings.t('lang.change')}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 12,
              paddingHorizontal: 14,
              paddingVertical: 11,
            }}
          >
            <GlobeIcon color={theme.colors.textTertiary} size={16} />
            <Text style={[textStyles.secondary(theme), { flex: 1 }]}>
              {strings.t('home.language')}
            </Text>
            <Text style={textStyles.meta(theme)}>
              {LANGUAGE_LABELS[language]}
            </Text>
            <Chevron color={theme.colors.textTertiary} />
          </PressableRow>
        </View>

        {/* Threads */}
        {error !== null && threads === null ? (
          // Only take over the screen when there's nothing cached to show —
          // a failed background poll shouldn't hide an already-loaded list.
          <ErrorState
            message={error}
            onRetry={onRefresh}
            theme={theme}
            strings={strings}
          />
        ) : loading && threads === null ? (
          <View style={{ paddingHorizontal: 16, paddingTop: 28, gap: 12 }}>
            <SkeletonBlock width={110} height={11} theme={theme} radius={4} />
            <SkeletonBlock width="100%" height={64} theme={theme} radius={theme.radii.card} />
            <SkeletonBlock width="100%" height={64} theme={theme} radius={theme.radii.card} />
          </View>
        ) : (threads ?? []).length === 0 ? (
          <EmptyState
            message={strings.t('home.empty')}
            hint={strings.t('home.emptyHint')}
            theme={theme}
          />
        ) : (
          <>
            <ThreadGroup
              label={`${strings.t('home.open')} · ${open.length}`}
              threads={open}
              theme={theme}
              strings={strings}
              onOpenThread={onOpenThread}
            />
            <ThreadGroup
              label={strings.t('home.resolved')}
              threads={resolved}
              theme={theme}
              strings={strings}
              onOpenThread={onOpenThread}
            />
          </>
        )}
      </ScrollView>
    </View>
  );
}
