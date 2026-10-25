import { useCallback, useEffect, useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import {
  postMessage,
  registerPush,
  setLanguage as setLanguageRequest,
  submitQuery,
  SupportApiError,
  type ApiConfig,
} from '../api';
import { createTranslator } from '../i18n';
import {
  asLanguage,
  DEFAULT_LANGUAGE,
  deviceLanguage,
  type Language,
} from '../i18n/languages';
import {
  ensurePushPermission,
  isPushAvailable,
  onSupportNotificationTap,
} from '../push';
import { resolveTheme } from '../theme';
import type { QueryType, SupportButtonProps, Thread } from '../types';
import { IDLE_POLL_MS, useSupportThreads } from '../useSupportThreads';
import { validateProps } from '../utils';
import { BottomSheet } from './BottomSheet';
import { LauncherButton } from './LauncherButton';
import { ComposeScreen } from './screens/ComposeScreen';
import { HomeScreen } from './screens/HomeScreen';
import { LanguageScreen } from './screens/LanguageScreen';
import { ThreadScreen } from './screens/ThreadScreen';

type Screen =
  | { name: 'home' }
  | { name: 'language' }
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

  const {
    threads,
    totalUnread,
    loading,
    refreshing,
    errorKey,
    serverLanguage,
    languageLoaded,
    refresh,
    reload,
  } = useSupportThreads({
    config,
    revenuecatId: props.user.revenuecatId,
    enabled: validationError === null,
    sheetOpen,
    activeThreadId: screen.name === 'thread' ? screen.threadId : null,
    idlePollMs: props.pollIntervalMs ?? IDLE_POLL_MS,
  });

  /**
   * What the user picked, once they have picked. Until then the sheet is
   * rendered in the host app's hint or the device's language, which is a
   * guess — hence `chosen`, which is what decides whether to ask.
   */
  const [chosen, setChosen] = useState<Language | null>(null);
  const [draftLanguage, setDraftLanguage] = useState<Language | null>(null);
  const [savingLanguage, setSavingLanguage] = useState(false);
  const [languageError, setLanguageError] = useState<string | null>(null);

  // A preference saved on another device (or an earlier install) wins over
  // any local guess, and answers the "have they chosen?" question for free.
  useEffect(() => {
    const stored = asLanguage(serverLanguage);
    if (stored !== null) setChosen(stored);
  }, [serverLanguage]);

  const fallbackLanguage =
    props.defaultLanguage ?? deviceLanguage() ?? DEFAULT_LANGUAGE;
  const language = chosen ?? fallbackLanguage;
  const strings = useMemo(
    () => createTranslator(draftLanguage ?? language),
    [draftLanguage, language],
  );

  /**
   * Ask once, on first open — but only once the server has told us whether
   * this user already answered. Asking before then would show the picker to
   * someone who chose months ago on another device.
   */
  const mustChooseLanguage = languageLoaded && chosen === null;

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

  // A tapped support-reply notification opens straight into its thread. If
  // the threads haven't loaded yet (cold start), the sheet shows the list
  // until they do, then switches over.
  useEffect(() => {
    if (validationError !== null) return;
    return onSupportNotificationTap((threadId) => {
      setDraftLanguage(null);
      setLanguageError(null);
      setScreen({ name: 'thread', threadId });
      setSheetOpen(true);
    });
  }, [validationError]);

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
    setDraftLanguage(null);
    setLanguageError(null);
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
      if (e.status === 429) return strings.t('error.rateLimited');
      if (e.offline) return strings.t('error.offline');
    }
    return strings.t('error.sendFailed');
  }

  /**
   * Persists the picked language and leaves the picker.
   *
   * A failed save keeps the user on the screen with a retry: getting this
   * wrong means every message they write is translated from the wrong
   * language, which is worse than one more tap.
   */
  async function confirmLanguage() {
    const next = draftLanguage ?? language;
    setSavingLanguage(true);
    setLanguageError(null);
    try {
      await setLanguageRequest(config, {
        revenuecatId: props.user.revenuecatId,
        language: next,
      });
      setChosen(next);
      setDraftLanguage(null);
      setScreen({ name: 'home' });
      // On a change, the server re-queues existing replies for translation
      // into the new language; they arrive over the next poll or two.
      void reload();
    } catch (e) {
      setLanguageError(
        e instanceof SupportApiError && e.offline
          ? strings.t('error.offline')
          : strings.t('lang.saveFailed'),
      );
    } finally {
      setSavingLanguage(false);
    }
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
        language,
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
        language,
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
      strings={strings}
      language={language}
      threads={threads}
      loading={loading}
      refreshing={refreshing}
      error={errorKey === null ? null : strings.t(errorKey)}
      onRefresh={refresh}
      onCompose={(type) => setScreen({ name: 'compose', type })}
      onOpenThread={(thread) =>
        setScreen({ name: 'thread', threadId: thread.id })
      }
      onChangeLanguage={() => {
        setDraftLanguage(language);
        setLanguageError(null);
        setScreen({ name: 'language' });
      }}
      onClose={closeSheet}
    />
  );

  const languagePicker = (
    <LanguageScreen
      theme={theme}
      strings={strings}
      selected={draftLanguage ?? language}
      onSelect={setDraftLanguage}
      onConfirm={() => void confirmLanguage()}
      // No way back on first run: there is nothing behind it yet, so the
      // only exit is choosing — or closing the sheet, which asks again.
      onBack={
        mustChooseLanguage
          ? undefined
          : () => {
              setDraftLanguage(null);
              setLanguageError(null);
              setScreen({ name: 'home' });
            }
      }
      onDismiss={mustChooseLanguage ? closeSheet : undefined}
      saving={savingLanguage}
      error={languageError}
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
        {/* The one-time prompt outranks whatever screen the user is on: it
            only ever fires before they have sent anything. */}
        {mustChooseLanguage || screen.name === 'language' ? (
          languagePicker
        ) : (
          <>
            {screen.name === 'home' && home}
            {screen.name === 'compose' && (
              <ComposeScreen
                theme={theme}
                strings={strings}
                type={screen.type}
                onBack={() => setScreen({ name: 'home' })}
                onSubmit={(message) => handleSubmit(screen.type, message)}
              />
            )}
            {screen.name === 'thread' &&
              (activeThread !== null ? (
                <ThreadScreen
                  theme={theme}
                  strings={strings}
                  thread={activeThread}
                  onBack={() => setScreen({ name: 'home' })}
                  onSend={(message) => handleSend(activeThread.id, message)}
                />
              ) : (
                home
              ))}
          </>
        )}
      </BottomSheet>
    </>
  );
}
