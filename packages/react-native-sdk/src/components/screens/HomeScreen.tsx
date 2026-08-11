import { RefreshControl, ScrollView, Text, View } from 'react-native';
import type { SupportTheme } from '../../theme';
import type { QueryType, Thread } from '../../types';
import { QUERY_TYPE_LABEL } from '../../types';
import { relativeTime } from '../../utils';
import { Chevron, CloseIcon } from '../icons';
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

const COMPOSE_HINT: Record<QueryType, string> = {
  feedback: 'Tell us what you think',
  feature_request: 'Suggest an improvement',
  bug_report: "Something isn't working",
};

function ThreadRow({
  thread,
  theme,
  onPress,
  last,
}: {
  thread: Thread;
  theme: SupportTheme;
  onPress: () => void;
  last: boolean;
}) {
  const unread = thread.unread_count > 0;
  const preview = thread.last_message?.body ?? 'No messages yet';
  const at = thread.last_message?.created_at ?? thread.created_at;

  return (
    <PressableRow
      onPress={onPress}
      theme={theme}
      accessibilityLabel={
        unread
          ? `${QUERY_TYPE_LABEL[thread.type]} thread, ${thread.unread_count} unread`
          : `${QUERY_TYPE_LABEL[thread.type]} thread`
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
            {QUERY_TYPE_LABEL[thread.type]}
          </Text>
          <Text style={textStyles.meta(theme)}>{relativeTime(at)}</Text>
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
            {thread.last_message?.sender === 'user' ? 'You: ' : ''}
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
  onOpenThread,
}: {
  label: string;
  threads: Thread[];
  theme: SupportTheme;
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
  threads,
  loading,
  refreshing,
  error,
  onRefresh,
  onCompose,
  onOpenThread,
  onClose,
}: {
  theme: SupportTheme;
  threads: Thread[] | null;
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  onRefresh: () => void;
  onCompose: (type: QueryType) => void;
  onOpenThread: (thread: Thread) => void;
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
          <Text style={textStyles.title(theme)}>Support</Text>
          <Text style={textStyles.secondary(theme)}>
            Start a conversation — we reply right here.
          </Text>
        </View>
        <IconButton
          onPress={onClose}
          theme={theme}
          accessibilityLabel="Close support"
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
              accessibilityLabel={`New ${QUERY_TYPE_LABEL[type].toLowerCase()}`}
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
                  {QUERY_TYPE_LABEL[type]}
                </Text>
                <Text style={textStyles.meta(theme)}>{COMPOSE_HINT[type]}</Text>
              </View>
              <Chevron color={theme.colors.textTertiary} />
            </PressableRow>
          ))}
        </View>

        {/* Threads */}
        {error !== null && threads === null ? (
          // Only take over the screen when there's nothing cached to show —
          // a failed background poll shouldn't hide an already-loaded list.
          <ErrorState message={error} onRetry={onRefresh} theme={theme} />
        ) : loading && threads === null ? (
          <View style={{ paddingHorizontal: 16, paddingTop: 28, gap: 12 }}>
            <SkeletonBlock width={110} height={11} theme={theme} radius={4} />
            <SkeletonBlock width="100%" height={64} theme={theme} radius={theme.radii.card} />
            <SkeletonBlock width="100%" height={64} theme={theme} radius={theme.radii.card} />
          </View>
        ) : (threads ?? []).length === 0 ? (
          <EmptyState
            message="No conversations yet"
            hint="Anything you send lands with the team, and their replies come back to this sheet."
            theme={theme}
          />
        ) : (
          <>
            <ThreadGroup
              label={`Open · ${open.length}`}
              threads={open}
              theme={theme}
              onOpenThread={onOpenThread}
            />
            <ThreadGroup
              label="Resolved"
              threads={resolved}
              theme={theme}
              onOpenThread={onOpenThread}
            />
          </>
        )}
      </ScrollView>
    </View>
  );
}
