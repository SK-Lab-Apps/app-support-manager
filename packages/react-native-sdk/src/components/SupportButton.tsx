import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Pressable, Text, View } from 'react-native';
import { getThreads, markRead, postMessage, submitQuery, SupportApiError, type ApiConfig } from '../api';
import { resolveTheme } from '../theme';
import type { QueryType, SupportButtonProps, Thread } from '../types';
import { validateProps } from '../utils';
import { BottomSheet } from './BottomSheet';
import { BubbleMark } from './icons';
import { ComposeScreen } from './screens/ComposeScreen';
import { HomeScreen } from './screens/HomeScreen';
import { ThreadScreen } from './screens/ThreadScreen';

type Screen =
  | { name: 'home' }
  | { name: 'compose'; type: QueryType }
  | { name: 'thread'; threadId: string };

/**
 * The single entry point of the SDK: a button with an unread badge that
 * opens the support bottom sheet. Polls get-threads on mount and whenever
 * the sheet opens (no websockets in v1).
 */
export function SupportButton(props: SupportButtonProps) {
  const validationError = validateProps(props);
  const theme = resolveTheme(props.theme);

  const config: ApiConfig = useMemo(
    () => ({
      supabaseUrl: props.supabaseUrl,
      apiKey: props.apiKey,
      appName: props.appName,
    }),
    [props.supabaseUrl, props.apiKey, props.appName],
  );

  const [sheetOpen, setSheetOpen] = useState(false);
  const [screen, setScreen] = useState<Screen>({ name: 'home' });
  const [threads, setThreads] = useState<Thread[] | null>(null);
  const [totalUnread, setTotalUnread] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    if (validationError) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getThreads(config, props.user.revenuecatId);
      if (!mounted.current) return;
      setThreads(data.threads);
      setTotalUnread(data.total_unread);
    } catch (e) {
      if (!mounted.current) return;
      setError(
        e instanceof SupportApiError && e.offline
          ? "You're offline — check your connection"
          : "Couldn't load threads",
      );
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [config, props.user.revenuecatId, validationError]);

  // Poll on mount…
  useEffect(() => {
    void refresh();
  }, [refresh]);

  // …in the background so the badge stays current without opening the
  // sheet, and whenever the app returns to the foreground.
  const pollIntervalMs = props.pollIntervalMs ?? 30_000;
  useEffect(() => {
    // Clamp to a sane floor so a typo like `pollIntervalMs={30}` doesn't
    // hammer the API. 0 (or negative) disables interval polling.
    const interval =
      pollIntervalMs > 0
        ? setInterval(() => void refresh(), Math.max(pollIntervalMs, 5_000))
        : null;

    const appStateSub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refresh();
    });

    return () => {
      if (interval !== null) clearInterval(interval);
      appStateSub.remove();
    };
  }, [pollIntervalMs, refresh]);

  // …and on sheet open.
  function openSheet() {
    setScreen({ name: 'home' });
    setSheetOpen(true);
    void refresh();
  }

  function closeSheet() {
    setSheetOpen(false);
    setScreen({ name: 'home' });
  }

  if (validationError) {
    // Dev-mode: loud and actionable. Production: render nothing rather than
    // a broken button.
    if (__DEV__) {
      console.error(validationError);
      return (
        <View
          style={{
            padding: 8,
            borderWidth: 1,
            borderColor: theme.colors.statusDanger,
            borderRadius: theme.radii.control,
          }}
        >
          <Text style={{ fontSize: 11, color: theme.colors.statusDanger }}>
            {validationError}
          </Text>
        </View>
      );
    }
    return null;
  }

  function openThread(thread: Thread) {
    setScreen({ name: 'thread', threadId: thread.id });
    if (thread.unread_count > 0) {
      // Optimistically clear the badge; persist via mark-read.
      setThreads(
        (prev) =>
          prev?.map((t) =>
            t.id === thread.id ? { ...t, unread_count: 0 } : t,
          ) ?? null,
      );
      setTotalUnread((n) => Math.max(0, n - thread.unread_count));
      void markRead(config, {
        queryId: thread.id,
        revenuecatId: props.user.revenuecatId,
      }).catch(() => {
        // Non-fatal: the next get-threads reconciles the badge.
      });
    }
  }

  async function handleSubmit(type: QueryType, message: string) {
    try {
      await submitQuery(config, {
        queryType: type,
        message,
        userName: props.user.name,
        isPaid: props.user.isPaid,
        revenuecatId: props.user.revenuecatId,
        appVersion: props.user.appVersion,
      });
      void refresh();
      return true;
    } catch {
      return false;
    }
  }

  async function handleSend(threadId: string, message: string) {
    try {
      await postMessage(config, {
        queryId: threadId,
        revenuecatId: props.user.revenuecatId,
        message,
      });
      await refresh();
      return true;
    } catch {
      return false;
    }
  }

  const activeThread =
    screen.name === 'thread'
      ? (threads ?? []).find((t) => t.id === screen.threadId) ?? null
      : null;

  return (
    <>
      <Pressable
        onPress={openSheet}
        accessibilityRole="button"
        accessibilityLabel={
          totalUnread > 0
            ? `Support, ${totalUnread} unread ${totalUnread === 1 ? 'reply' : 'replies'}`
            : 'Support'
        }
        style={({ pressed }) => ({
          width: 44,
          height: 44,
          borderRadius: 22,
          borderWidth: 1,
          borderColor: theme.colors.border,
          backgroundColor: pressed
            ? theme.colors.surfaceHover
            : theme.colors.surface,
          alignItems: 'center',
          justifyContent: 'center',
        })}
      >
        <BubbleMark color={theme.colors.textPrimary} size={18} />
        {totalUnread > 0 && (
          <View
            style={{
              position: 'absolute',
              top: -3,
              right: -3,
              minWidth: 16,
              height: 16,
              borderRadius: 8,
              paddingHorizontal: 4,
              backgroundColor: theme.colors.accent,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text
              style={{
                fontSize: 10,
                fontWeight: '600',
                color: theme.colors.accentForeground,
                fontVariant: ['tabular-nums'],
              }}
            >
              {totalUnread > 9 ? '9+' : totalUnread}
            </Text>
          </View>
        )}
      </Pressable>

      <BottomSheet visible={sheetOpen} onClose={closeSheet} theme={theme}>
        {screen.name === 'home' && (
          <HomeScreen
            theme={theme}
            threads={threads}
            loading={loading}
            error={error}
            onRetry={() => void refresh()}
            onCompose={(type) => setScreen({ name: 'compose', type })}
            onOpenThread={openThread}
            onClose={closeSheet}
          />
        )}
        {screen.name === 'compose' && (
          <ComposeScreen
            theme={theme}
            type={screen.type}
            onBack={() => setScreen({ name: 'home' })}
            onSubmit={(message) => handleSubmit(screen.type, message)}
          />
        )}
        {screen.name === 'thread' &&
          (activeThread ? (
            <ThreadScreen
              theme={theme}
              thread={activeThread}
              onBack={() => setScreen({ name: 'home' })}
              onSend={(message) => handleSend(activeThread.id, message)}
            />
          ) : (
            <HomeScreen
              theme={theme}
              threads={threads}
              loading={loading}
              error={error}
              onRetry={() => void refresh()}
              onCompose={(type) => setScreen({ name: 'compose', type })}
              onOpenThread={openThread}
              onClose={closeSheet}
            />
          ))}
      </BottomSheet>
    </>
  );
}
