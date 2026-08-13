/**
 * End-user languages, for display only.
 *
 * The dashboard never picks a language — the SDK does, and the backend
 * translates against it. This is the label map for showing which one a thread
 * is in. Kept in sync by hand with supabase/functions/_shared/languages.ts and
 * packages/react-native-sdk/src/i18n/languages.ts.
 */
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

/** The language admins read and write. */
export const ADMIN_LANGUAGE = 'en';

/** English name for a code, falling back to the code itself. */
export function languageName(code: string | null | undefined): string {
  if (!code) return 'Unknown';
  return LANGUAGE_NAMES[code] ?? code;
}

/** True when this thread involves translation at all. */
export function isTranslated(code: string | null | undefined): boolean {
  return Boolean(code) && code !== ADMIN_LANGUAGE;
}
