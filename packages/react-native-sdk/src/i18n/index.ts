// UI copy, in the user's language.
//
// Message bodies are translated by the backend at write time; the sheet's own
// chrome is not — it is a fixed set of strings that never changes, so it ships
// as a bundled table. A model call to render the word "Send" would be absurd,
// and it would also mean the SDK couldn't draw its own UI offline.

import { DEFAULT_LANGUAGE, type Language } from './languages';
import { en, type StringKey, type StringTable } from './strings/en';
import { de } from './strings/de';
import { es } from './strings/es';
import { fr } from './strings/fr';
import { hi } from './strings/hi';
import { it } from './strings/it';
import { ja } from './strings/ja';
import { ko } from './strings/ko';
import { nl } from './strings/nl';
import { pl } from './strings/pl';
import { pt } from './strings/pt';
import { ru } from './strings/ru';
import { tr } from './strings/tr';
import { zh } from './strings/zh';

const TABLES: Record<Language, StringTable> = {
  en,
  es,
  fr,
  de,
  nl,
  pt,
  it,
  pl,
  tr,
  ru,
  ja,
  ko,
  zh,
  hi,
};

/** Fills `{name}` placeholders. Unknown tokens are left alone, not blanked. */
function format(
  template: string,
  vars?: Record<string, string | number>,
): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in vars ? String(vars[key]) : match,
  );
}

export interface Translator {
  language: Language;
  /**
   * BCP-47 tag for Intl — dates and times stay in the user's chosen language
   * rather than the device's, so a sheet never mixes the two.
   */
  locale: string;
  t: (key: StringKey, vars?: Record<string, string | number>) => string;
}

export function createTranslator(language: Language): Translator {
  const table = TABLES[language] ?? TABLES[DEFAULT_LANGUAGE];
  return {
    language,
    locale: language,
    t: (key, vars) => format(table[key] ?? en[key], vars),
  };
}

export type { StringKey, StringTable };
export {
  asLanguage,
  baseLanguage,
  DEFAULT_LANGUAGE,
  deviceLanguage,
  isSupportedLanguage,
  LANGUAGE_LABELS,
  SUPPORTED_LANGUAGES,
  type Language,
} from './languages';
