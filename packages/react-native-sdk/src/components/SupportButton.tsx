import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Pressable, Text, View } from 'react-native';
import {
  getThreads,
  getUnreadCount,
  markRead,
  postMessage,
  registerPush,
  submitQuery,
  SupportApiError,
  type ApiConfig,
} from '../api';
import { ensurePushPermission, isPushAvailable } from '../push';
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

// Poll cadence by context: fast where latency is felt (staring at a thread
// waiting for a reply), slow when the sheet is closed — and the idle tick
// uses the count-only endpoint, so it costs ~18 bytes instead of the full
// thread list.
const THREAD_POLL_MS = 5_000;
const SHEET_POLL_MS = 15_000;
const IDLE_POLL_MS = 60_000;
const MIN_POLL_MS = 3_000;

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

  /** Badge-only refresh — the cheap endpoint used while idle. */
  const refreshBadge = useCallback(async () => {
    if (validationError) return;
    try {
      const data = await getUnreadCount(config, props.user.revenuecatId);
      if (mounted.current) setTotalUnread(data.total_unread);
    } catch {
      // Best-effort: the next tick or the next sheet open reconciles.
    }
  }, [config, props.user.revenuecatId, validationError]);

  // Poll on mount…
  useEffect(() => {
    void refresh();
  }, [refresh]);

  // …then adapt the cadence to what the user is looking at, and refresh
  // whenever the app returns to the foreground.
  const idlePollMs = props.pollIntervalMs ?? IDLE_POLL_MS;
  const screenName = screen.name;
  useEffect(() => {
    const idle = !sheetOpen;
    const intervalMs = idle
      ? idlePollMs
      : screenName === 'thread'
        ? THREAD_POLL_MS
        : SHEET_POLL_MS;

    // While idle only the badge matters, so use the count-only endpoint.
    const tick = () => void (idle ? refreshBadge() : refresh());

    // Clamped so a typo like `pollIntervalMs={30}` can't hammer the API;
    // 0 (or negative) disables idle polling entirely.
    const timer =
      intervalMs > 0 ? setInterval(tick, Math.max(intervalMs, MIN_POLL_MS)) : null;

    const appStateSub = AppState.addEventListener('change', (state) => {
      if (state === 'active') tick();
    });

    return () => {
      if (timer !== null) clearInterval(timer);
      appStateSub.remove();
    };
  }, [sheetOpen, screenName, idlePollMs, refresh, refreshBadge]);

  /**
   * Asks for notification permission the moment the sheet opens, then
   * reports the outcome (including denials) so the dashboard knows whether
   * this user is reachable. Deliberately fire-and-forget: nothing in the
   * support flow waits on it or breaks if it fails.
   */
  const syncPushPermission = useCallback(async () => {
    if (validationError || !isPushAvailable) return;
    try {
      const registration = await ensurePushPermission(props.expoProjectId);
      await registerPush(config, {
        revenuecatId: props.user.revenuecatId,
        permissionStatus: registration.status,
        expoPushToken: registration.token,
        asked: registration.asked,
      });
    } catch {
      // Push is an enhancement — never surfaced to the user as an error.
    }
  }, [config, props.user.revenuecatId, props.expoProjectId, validationError]);

  // …and on sheet open.
  function openSheet() {
    setScreen({ name: 'home' });
    setSheetOpen(true);
    void refresh();
    // The OS prompt appears right as the sheet opens; if the user declines,
    // everything below carries on exactly as before.
    void syncPushPermission();
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

  function writeErrorMessage(e: unknown): string {
    if (e instanceof SupportApiError) {
      if (e.status === 429) return 'Too many requests — try again later';
      if (e.offline) return "You're offline — check your connection";
    }
    return "Couldn't send — try again";
  }

  async function handleSubmit(
    type: QueryType,
    message: string,
  ): Promise<string | null> {
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
      return null;
    } catch (e) {
      return writeErrorMessage(e);
    }
  }

  async function handleSend(
    threadId: string,
    message: string,
  ): Promise<string | null> {
    try {
      await postMessage(config, {
        queryId: threadId,
        revenuecatId: props.user.revenuecatId,
        message,
      });
      await refresh();
      return null;
    } catch (e) {
      return writeErrorMessage(e);
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
