// The languages the SDK's picker offers.
//
// Kept in sync by hand with packages/react-native-sdk/src/i18n/languages.ts —
// the two run in different runtimes (Deno vs React Native) and share no build
// step. Adding a language means touching both, plus the SDK's string table.

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

export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

/** The language admins read and write in. */
export const ADMIN_LANGUAGE: SupportedLanguage = 'en';

/** English names — used in translation prompts and in the dashboard. */
export const LANGUAGE_NAMES: Record<string, string> = {
  en: 'English',
  es: 'Spanish',
  fr: 'French',
  de: 'German',
  nl: 'Dutch',
  pt: 'Portuguese',
  it: 'Italian',
  pl: 'Polish',
  tr: 'Turkish',
  ru: 'Russian',
  ja: 'Japanese',
  ko: 'Korean',
  zh: 'Simplified Chinese',
  hi: 'Hindi',
};

/**
 * Strips a region qualifier: "pt-BR" → "pt". Devices report region-qualified
 * locales; everything downstream (prompts, the picker, the dashboard chip)
 * works in base languages.
 */
export function baseLanguage(code: string): string {
  return code.trim().toLowerCase().split(/[-_]/)[0] ?? '';
}

export function isSupportedLanguage(code: string): code is SupportedLanguage {
  return (SUPPORTED_LANGUAGES as readonly string[]).includes(baseLanguage(code));
}

/** English name for a code, falling back to the code itself. */
export function languageName(code: string): string {
  return LANGUAGE_NAMES[baseLanguage(code)] ?? code;
}
