import { useCallback, useEffect, useMemo, useState } from 'react';
import { Platform, Text, useColorScheme, View } from 'react-native';
import {
  registerPush,
  registerUser,
  reviewOpened,
  sendMessage,
  SupportApiError,
  type ApiConfig,
} from '../api';
import { createTranslator } from '../i18n';
import { asLanguage, DEFAULT_LANGUAGE } from '../i18n/languages';
import {
  ensurePushPermission,
  isPushAvailable,
  onSupportNotificationTap,
} from '../push';
import { openStoreReview, storeLinks, storePlatform } from '../review';
import { themeFor } from '../theme';
import type { SupportButtonProps, ThemeName } from '../types';
import { useOutbox } from '../useOutbox';
import { IDLE_POLL_MS, useSupportThreads } from '../useSupportThreads';
import { userPlan, validateProps } from '../utils';
import { BottomSheet } from './BottomSheet';
import { LauncherButton } from './LauncherButton';
import { ChatScreen } from './screens/ChatScreen';

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

  const {
    threads,
    totalUnread,
    newSince,
    loading,
    errorKey,
    store,
    refresh,
    reload,
  } = useSupportThreads({
    config,
    revenuecatId: props.user.revenuecatId,
    enabled: validationError === null,
    sheetOpen,
    idlePollMs: props.pollIntervalMs ?? IDLE_POLL_MS,
  });

  /**
   * The host app decides the language; the SDK never asks. Anything it
   * passes that the SDK doesn't support — or nothing — is English, the
   * language the team writes in, so the user still reads every reply.
   */
  const requestedLanguage = props.language ?? props.defaultLanguage;
  const language = asLanguage(requestedLanguage) ?? DEFAULT_LANGUAGE;
  useEffect(() => {
    if (__DEV__ && requestedLanguage && asLanguage(requestedLanguage) === null) {
      console.warn(
        `SupportButton: language "${requestedLanguage}" isn't supported, so support is shown in English. ` +
          'Supported: see SUPPORTED_LANGUAGES.',
      );
    }
  }, [requestedLanguage]);
  const strings = useMemo(() => createTranslator(language), [language]);

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

  const {
    outbox,
    error: sendError,
    send,
    retry: retrySend,
    clearError: clearSendError,
  } = useOutbox({
    threads,
    deliver: async (message) => {
      const sent = await sendMessage(config, {
        revenuecatId,
        message,
        language,
        user: { name: userName, plan, appVersion, platform: storePlatform() },
      });
      // Not awaited: the bubble is already up, and it stays until the
      // reload brings the server's copy.
      void reload();
      return sent.message_id;
    },
  });

  /**
   * Reports the user on load, and whenever who they are changes, so the team
   * can find and message them before they ever open support. Their language
   * rides along, so a message the team sends first arrives translated.
   * Refreshes the push token too when permission was already granted —
   * never prompting: the OS prompt only appears once the user opens
   * support. Free users aren't messaged first, so their token waits until
   * they open support.
   */
  useEffect(() => {
    if (validationError !== null) return;
    registerUser(config, {
      revenuecatId,
      language,
      user: { name: userName, plan, appVersion, platform: storePlatform() },
    }).catch(() => {
      // Best effort; the next load reports again.
    });
    if (!isPushAvailable || plan === 'free') return;
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
    language,
    userName,
    plan,
    appVersion,
    props.expoProjectId,
  ]);

  // A tapped support-reply notification opens the chat. If the threads
  // haven't loaded yet (cold start), it fills in as soon as they do.
  useEffect(() => {
    if (validationError !== null) return;
    return onSupportNotificationTap(() => setSheetOpen(true));
  }, [validationError]);

  function openSheet() {
    setSheetOpen(true);
    // The OS prompt appears right as the sheet opens; if the user declines,
    // everything below carries on exactly as before.
    void syncPushPermission();
  }

  function closeSheet() {
    setSheetOpen(false);
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
        <ChatScreen
          theme={theme}
          strings={strings}
          threads={threads}
          newSince={newSince}
          loading={loading}
          error={errorKey === null ? null : strings.t(errorKey)}
          onRetry={refresh}
          outbox={outbox}
          sendError={sendError === null ? null : writeErrorMessage(sendError)}
          onSend={send}
          onRetrySend={retrySend}
          onClearSendError={clearSendError}
          onClose={closeSheet}
          reviewLabel={reviewLabel}
          onOpenReview={openReview}
        />
      </BottomSheet>
    </>
  );
}
