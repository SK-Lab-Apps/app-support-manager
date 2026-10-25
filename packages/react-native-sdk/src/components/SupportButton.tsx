import { useCallback, useEffect, useMemo, useState } from 'react';
import { Platform, Text, useColorScheme, View } from 'react-native';
import {
  registerPush,
  registerUser,
  reviewOpened,
  sendMessage,
  setLanguage as setLanguageRequest,
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
import { openStoreReview, storeLinks, storePlatform } from '../review';
import { themeFor } from '../theme';
import type { SupportButtonProps, ThemeName } from '../types';
import { IDLE_POLL_MS, useSupportThreads } from '../useSupportThreads';
import { userPlan, validateProps } from '../utils';
import { BottomSheet } from './BottomSheet';
import { LauncherButton } from './LauncherButton';
import { ChatScreen } from './screens/ChatScreen';
import { LanguageScreen } from './screens/LanguageScreen';

type Screen = 'chat' | 'language';

/**
 * The single entry point of the SDK: a launcher with an unread badge that
 * opens the support chat in a bottom sheet. Conversations, polling, and read
 * receipts are handled by useSupportThreads.
 */
export function SupportButton(props: SupportButtonProps) {
  const validationError = validateProps(props);

  // "system" (the default) follows the host app's appearance and re-renders
  // when it changes.
  const colorScheme = useColorScheme();
  const themeName: ThemeName =
    props.theme === 'light' || props.theme === 'dark'
      ? props.theme
      : colorScheme === 'dark'
        ? 'dark'
        : 'light';
  // Picked down to one string first, so an inline `{ light, dark }` object
  // doesn't rebuild the theme on every render.
  const perModeAccent =
    typeof props.accentColor === 'object' && props.accentColor !== null;
  const accent = perModeAccent
    ? (props.accentColor as { light: string; dark: string })[themeName]
    : (props.accentColor as string | undefined);
  const theme = useMemo(
    () => themeFor(themeName, accent, !perModeAccent),
    [themeName, accent, perModeAccent],
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
  const [screen, setScreen] = useState<Screen>('chat');

  /**
   * What the user picked, once they have picked. Until then the sheet is
   * rendered in the host app's hint or the device's language, which is a
   * guess — hence `chosen`, which is what decides whether to ask.
   */
  const [chosen, setChosen] = useState<Language | null>(null);

  const {
    threads,
    totalUnread,
    loading,
    errorKey,
    serverLanguage,
    languageLoaded,
    store,
    refresh,
    reload,
  } = useSupportThreads({
    config,
    revenuecatId: props.user.revenuecatId,
    enabled: validationError === null,
    sheetOpen,
    // Not while the first-run language prompt covers it: nothing behind
    // the prompt has been seen, so nothing may be marked read.
    chatVisible: sheetOpen && screen === 'chat' && chosen !== null,
    idlePollMs: props.pollIntervalMs ?? IDLE_POLL_MS,
  });

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

  const { name: userName, revenuecatId, appVersion } = props.user;
  const plan = userPlan(props.user);

  /**
   * Reports the user on load, and whenever who they are changes, so the team
   * can find and message them before they ever open support. Refreshes the
   * push token too when permission was already granted — never prompting:
   * the OS prompt only appears once the user opens support.
   */
  useEffect(() => {
    if (validationError !== null) return;
    registerUser(config, {
      revenuecatId,
      user: { name: userName, plan, appVersion, platform: storePlatform() },
    }).catch(() => {
      // Best effort; the next load reports again.
    });
    if (!isPushAvailable) return;
    void (async () => {
      const registration = await ensurePushPermission(props.expoProjectId, {
        prompt: false,
      });
      if (registration.status !== 'granted') return;
      await registerPush(config, {
        revenuecatId,
        permissionStatus: registration.status,
        expoPushToken: registration.token,
        asked: false,
      });
    })().catch(() => {});
  }, [
    config,
    validationError,
    revenuecatId,
    userName,
    plan,
    appVersion,
    props.expoProjectId,
  ]);

  // A tapped support-reply notification opens the chat. If the threads
  // haven't loaded yet (cold start), it fills in as soon as they do.
  useEffect(() => {
    if (validationError !== null) return;
    return onSupportNotificationTap(() => {
      setDraftLanguage(null);
      setLanguageError(null);
      setScreen('chat');
      setSheetOpen(true);
    });
  }, [validationError]);

  function openSheet() {
    setScreen('chat');
    setSheetOpen(true);
    // The OS prompt appears right as the sheet opens; if the user declines,
    // everything below carries on exactly as before.
    void syncPushPermission();
  }

  function closeSheet() {
    setSheetOpen(false);
    setScreen('chat');
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
      setScreen('chat');
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

  async function handleSend(message: string): Promise<string | null> {
    try {
      await sendMessage(config, {
        revenuecatId,
        message,
        language,
        user: { name: userName, plan, appVersion, platform: storePlatform() },
      });
      await reload();
      return null;
    } catch (e) {
      return writeErrorMessage(e);
    }
  }

  const reviewLinks = storeLinks(store);
  const reviewLabel =
    reviewLinks === null
      ? null
      : strings.t(Platform.OS === 'ios' ? 'review.appStore' : 'review.playStore');

  /** Opens the store's review page and lets the team know it was tapped. */
  function openReview(messageId: string) {
    if (reviewLinks === null) return;
    void openStoreReview(reviewLinks);
    reviewOpened(config, { revenuecatId, messageId }).catch(() => {
      // The receipt is for the dashboard; the user already has the store.
    });
  }

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
              setScreen('chat');
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
        {mustChooseLanguage || screen === 'language' ? (
          languagePicker
        ) : (
          <ChatScreen
            theme={theme}
            strings={strings}
            language={language}
            threads={threads}
            loading={loading}
            error={errorKey === null ? null : strings.t(errorKey)}
            onRetry={refresh}
            onSend={handleSend}
            onChangeLanguage={() => {
              setDraftLanguage(language);
              setLanguageError(null);
              setScreen('language');
            }}
            onClose={closeSheet}
            reviewLabel={reviewLabel}
            onOpenReview={openReview}
          />
        )}
      </BottomSheet>
    </>
  );
}
