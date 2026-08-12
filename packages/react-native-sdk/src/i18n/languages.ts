import { NativeModules, Platform } from 'react-native';

/**
 * The languages the picker offers.
 *
 * Kept in sync by hand with supabase/functions/_shared/languages.ts — the two
 * run in different runtimes and share no build step. Adding one means adding a
 * string table here too, which the compiler enforces.
 *
 * Right-to-left languages are deliberately absent for now: React Native only
 * flips layout direction through I18nManager, which needs an app restart the
 * SDK has no business triggering inside a host app.
 */
export const SUPPORTED_LANGUAGES = [
  'en',
  'es',
  'fr',
  'de',
  'nl',
  'pt',
  'it',
  'pl',
  'tr',
  'ru',
  'ja',
  'ko',
  'zh',
  'hi',
] as const;

export type Language = (typeof SUPPORTED_LANGUAGES)[number];

/** The language the support team reads and writes. */
export const DEFAULT_LANGUAGE: Language = 'en';

/**
 * Endonyms — a language is listed the way its own speakers write it, so the
 * picker is readable to someone who can't read the current UI language.
 */
export const LANGUAGE_LABELS: Record<Language, string> = {
  en: 'English',
  es: 'Español',
  fr: 'Français',
  de: 'Deutsch',
  nl: 'Nederlands',
  pt: 'Português',
  it: 'Italiano',
  pl: 'Polski',
  tr: 'Türkçe',
  ru: 'Русский',
  ja: '日本語',
  ko: '한국어',
  zh: '简体中文',
  hi: 'हिन्दी',
};

/** Strips a region qualifier: "pt-BR" → "pt". */
export function baseLanguage(code: string): string {
  return code.trim().toLowerCase().split(/[-_]/)[0] ?? '';
}

export function isSupportedLanguage(code: string): code is Language {
  return (SUPPORTED_LANGUAGES as readonly string[]).includes(baseLanguage(code));
}

/** Narrows any string to a supported language, or null. */
export function asLanguage(code: string | null | undefined): Language | null {
  if (!code) return null;
  const base = baseLanguage(code);
  return isSupportedLanguage(base) ? base : null;
}

function rawDeviceLocale(): string | null {
  try {
    if (Platform.OS === 'ios') {
      const settings = NativeModules.SettingsManager?.settings;
      const locale = settings?.AppleLocale ?? settings?.AppleLanguages?.[0];
      if (typeof locale === 'string') return locale;
    } else {
      const locale = NativeModules.I18nManager?.localeIdentifier;
      if (typeof locale === 'string') return locale;
    }
  } catch {
    // Fall through to Intl.
  }

  try {
    return Intl.DateTimeFormat().resolvedOptions().locale;
  } catch {
    return null;
  }
}

/**
 * The device's language, if the SDK supports it.
 *
 * Used to pre-select a row in the picker and to render the picker itself, so
 * the one screen shown before we know the user's choice is already in a
 * language they probably read. Deliberately not used to *skip* the picker: a
 * device set to French says nothing about which language its owner wants to
 * write support messages in.
 */
export function deviceLanguage(): Language | null {
  const locale = rawDeviceLocale();
  return locale === null ? null : asLanguage(locale);
}
