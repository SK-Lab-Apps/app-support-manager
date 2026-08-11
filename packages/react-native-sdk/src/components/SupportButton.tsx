import { useCallback, useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import {
  postMessage,
  registerPush,
  submitQuery,
  SupportApiError,
  type ApiConfig,
} from '../api';
import { ensurePushPermission, isPushAvailable } from '../push';
import { resolveTheme } from '../theme';
import type { QueryType, SupportButtonProps, Thread } from '../types';
import { IDLE_POLL_MS, useSupportThreads } from '../useSupportThreads';
import { validateProps } from '../utils';
import { BottomSheet } from './BottomSheet';
import { LauncherButton } from './LauncherButton';
import { ComposeScreen } from './screens/ComposeScreen';
import { HomeScreen } from './screens/HomeScreen';
import { ThreadScreen } from './screens/ThreadScreen';

type Screen =
  | { name: 'home' }
  | { name: 'compose'; type: QueryType }
  | { name: 'thread'; threadId: string };

/**
 * The single entry point of the SDK: a launcher with an unread badge that
 * opens the support bottom sheet. Threads, polling, and read receipts are
 * handled by useSupportThreads.
 */
export function SupportButton(props: SupportButtonProps) {
  const validationError = validateProps(props);
  const theme = useMemo(
    () => resolveTheme(props.theme, props.accentColor),
    [props.theme, props.accentColor],
  );

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

  const { threads, totalUnread, loading, refreshing, error, refresh, reload } =
    useSupportThreads({
      config,
      revenuecatId: props.user.revenuecatId,
      enabled: validationError === null,
      sheetOpen,
      activeThreadId: screen.name === 'thread' ? screen.threadId : null,
      idlePollMs: props.pollIntervalMs ?? IDLE_POLL_MS,
    });

  /**
   * Asks for notification permission the moment the sheet opens, then
   * reports the outcome (including denials) so the dashboard knows whether
   * this user is reachable. Deliberately fire-and-forget: nothing in the
   * support flow waits on it or breaks if it fails.
   */
  const syncPushPermission = useCallback(async () => {
    if (validationError !== null || !isPushAvailable) return;
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

  function openSheet() {
    setScreen({ name: 'home' });
    setSheetOpen(true);
    // The OS prompt appears right as the sheet opens; if the user declines,
    // everything below carries on exactly as before.
    void syncPushPermission();
  }

  function closeSheet() {
    setSheetOpen(false);
    setScreen({ name: 'home' });
  }

  if (validationError !== null) {
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
      void reload();
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
      await reload();
      return null;
    } catch (e) {
      return writeErrorMessage(e);
    }
  }

  const activeThread: Thread | null =
    screen.name === 'thread'
      ? ((threads ?? []).find((t) => t.id === screen.threadId) ?? null)
      : null;

  const home = (
    <HomeScreen
      theme={theme}
      threads={threads}
      loading={loading}
      refreshing={refreshing}
      error={error}
      onRefresh={refresh}
      onCompose={(type) => setScreen({ name: 'compose', type })}
      onOpenThread={(thread) =>
        setScreen({ name: 'thread', threadId: thread.id })
      }
      onClose={closeSheet}
    />
  );

  return (
    <>
      <LauncherButton
        theme={theme}
        unread={totalUnread}
        variant={props.variant}
        size={props.size}
        label={props.label}
        style={props.style}
        onPress={openSheet}
      />

      <BottomSheet visible={sheetOpen} onClose={closeSheet} theme={theme}>
        {screen.name === 'home' && home}
        {screen.name === 'compose' && (
          <ComposeScreen
            theme={theme}
            type={screen.type}
            onBack={() => setScreen({ name: 'home' })}
            onSubmit={(message) => handleSubmit(screen.type, message)}
          />
        )}
        {screen.name === 'thread' &&
          (activeThread !== null ? (
            <ThreadScreen
              theme={theme}
              thread={activeThread}
              onBack={() => setScreen({ name: 'home' })}
              onSend={(message) => handleSend(activeThread.id, message)}
            />
          ) : (
            home
          ))}
      </BottomSheet>
    </>
  );
}
