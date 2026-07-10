import { ScrollView, Text, View } from 'react-native';
import type { SupportTheme } from '../../theme';
import type { QueryType, Thread } from '../../types';
import { QUERY_TYPE_LABEL } from '../../types';
import { relativeTime } from '../../utils';
import { Chevron, CloseIcon } from '../icons';
import {
  EmptyState,
  ErrorState,
  PressableRow,
  SkeletonBlock,
  textStyles,
  typeColor,
  typeIcon,
} from '../primitives';

const COMPOSE_TYPES: QueryType[] = ['feedback', 'feature_request', 'bug_report'];

function ThreadRow({
  thread,
  theme,
  onPress,
}: {
  thread: Thread;
  theme: SupportTheme;
  onPress: () => void;
}) {
  const preview = thread.last_message?.body ?? '';
  return (
    <PressableRow
      onPress={onPress}
      theme={theme}
      accessibilityLabel={`${QUERY_TYPE_LABEL[thread.type]} thread`}
      style={{
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.border,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        {thread.unread_count > 0 && (
          <View
            style={{
              width: 6,
              height: 6,
              borderRadius: 3,
              backgroundColor: theme.colors.accent,
            }}
          />
        )}
        <Text style={{ fontSize: 11, fontWeight: '500', color: typeColor(thread.type, theme) }}>
          {QUERY_TYPE_LABEL[thread.type]}
        </Text>
        <Text style={[textStyles.meta(theme), { marginLeft: 'auto' }]}>
          {thread.last_message
            ? relativeTime(thread.last_message.created_at)
            : relativeTime(thread.created_at)}
        </Text>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 3 }}>
        <Text
          numberOfLines={1}
          style={{
            flex: 1,
            fontSize: 13,
            color:
              thread.unread_count > 0
                ? theme.colors.textPrimary
                : theme.colors.textSecondary,
            fontWeight: thread.unread_count > 0 ? '500' : '400',
          }}
        >
          {preview}
        </Text>
        <Chevron color={theme.colors.textTertiary} />
      </View>
    </PressableRow>
  );
}

export function HomeScreen({
  theme,
  threads,
  loading,
  error,
  onRetry,
  onCompose,
  onOpenThread,
  onClose,
}: {
  theme: SupportTheme;
  threads: Thread[] | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
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
          alignItems: 'center',
          paddingHorizontal: 16,
          paddingBottom: 12,
        }}
      >
        <Text style={textStyles.title(theme)}>Support</Text>
        <PressableRow
          onPress={onClose}
          theme={theme}
          accessibilityLabel="Close"
          style={{ marginLeft: 'auto', padding: 6, borderRadius: theme.radii.control }}
        >
          <CloseIcon color={theme.colors.textSecondary} size={13} />
        </PressableRow>
      </View>

      <ScrollView style={{ flex: 1 }}>
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
                gap: 10,
                paddingHorizontal: 14,
                paddingVertical: 12,
                borderTopWidth: i === 0 ? 0 : 1,
                borderTopColor: theme.colors.border,
              }}
            >
              {typeIcon(type, typeColor(type, theme))}
              <Text style={{ fontSize: 14, color: theme.colors.textPrimary, flex: 1 }}>
                {QUERY_TYPE_LABEL[type]}
              </Text>
              <Chevron color={theme.colors.textTertiary} />
            </PressableRow>
          ))}
        </View>

        {/* Threads */}
        {error && threads === null ? (
          // Only take over the screen when there's nothing cached to show —
          // a failed background poll shouldn't hide an already-loaded list.
          <ErrorState message={error} onRetry={onRetry} theme={theme} />
        ) : loading && threads === null ? (
          <View style={{ paddingHorizontal: 16, paddingTop: 24, gap: 14 }}>
            <SkeletonBlock width={80} height={12} theme={theme} />
            <SkeletonBlock width="100%" height={40} theme={theme} />
            <SkeletonBlock width="100%" height={40} theme={theme} />
          </View>
        ) : (threads ?? []).length === 0 ? (
          <EmptyState message="No queries yet" theme={theme} />
        ) : (
          <>
            {open.length > 0 && (
              <>
                <Text
                  style={{
                    fontSize: 11,
                    fontWeight: '500',
                    textTransform: 'uppercase',
                    letterSpacing: 0.4,
                    color: theme.colors.textTertiary,
                    paddingHorizontal: 16,
                    paddingTop: 20,
                    paddingBottom: 6,
                  }}
                >
                  Open
                </Text>
                {open.map((t) => (
                  <ThreadRow
                    key={t.id}
                    thread={t}
                    theme={theme}
                    onPress={() => onOpenThread(t)}
                  />
                ))}
              </>
            )}
            {resolved.length > 0 && (
              <>
                <Text
                  style={{
                    fontSize: 11,
                    fontWeight: '500',
                    textTransform: 'uppercase',
                    letterSpacing: 0.4,
                    color: theme.colors.textTertiary,
                    paddingHorizontal: 16,
                    paddingTop: 20,
                    paddingBottom: 6,
                  }}
                >
                  Resolved
                </Text>
                {resolved.map((t) => (
                  <ThreadRow
                    key={t.id}
                    thread={t}
                    theme={theme}
                    onPress={() => onOpenThread(t)}
                  />
                ))}
              </>
            )}
            <View style={{ height: 16 }} />
          </>
        )}
      </ScrollView>
    </View>
  );
}
