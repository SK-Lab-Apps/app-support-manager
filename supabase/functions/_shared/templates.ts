// Message templates for sends from the dashboard's Users tab and for
// automated messages: {first_name}, {name} and {app}, filled in per
// recipient.
//
// The render rules are mirrored in apps/web/lib/outreach.ts for the
// composer's preview; keep the two in step.

import { translateText } from './translate.ts';

const PLACEHOLDER = /\{(first_name|name|app)\}/g;

export interface TemplateValues {
  first_name: string | null;
  name: string | null;
  app: string;
}

/**
 * Fills the placeholders. A user with no name on record loses the
 * placeholder along with the space before it — "Hi {first_name}," reads
 * "Hi," — which works in any language, unlike a stand-in word.
 */
export function render(template: string, values: TemplateValues): string {
  return template
    .replace(/\s?\{(first_name|name)\}/g, (match, key: 'first_name' | 'name') => {
      const value = values[key];
      return value ? match.replace(`{${key}}`, value) : '';
    })
    .replace(/\{app\}/g, values.app);
}

export function placeholdersIn(text: string): string {
  return (text.match(PLACEHOLDER) ?? []).sort().join(',');
}

export function valuesFor(name: string | null, app: string): TemplateValues {
  const trimmed = name?.trim() || null;
  return {
    name: trimmed,
    first_name: trimmed ? trimmed.split(/\s+/)[0]! : null,
    app,
  };
}

/**
 * Translates a template once per language with its placeholders intact,
 * to be filled in per recipient afterwards — one model call per language
 * rather than per user. Null for a language whose translation failed or
 * came back with the placeholders mangled: those copies go out in English
 * marked pending, for the translation sweep.
 */
export async function translateTemplate(
  template: string,
  languages: string[],
): Promise<Map<string, string | null>> {
  const expected = placeholdersIn(template);
  const results = await Promise.all(
    languages.map(async (language) => {
      try {
        const { translation } = await translateText(template, language);
        if (placeholdersIn(translation) !== expected) {
          console.error('templates: placeholders lost in', language);
          return [language, null] as const;
        }
        return [language, translation] as const;
      } catch (e) {
        console.error('templates: translation failed for', language, e);
        return [language, null] as const;
      }
    }),
  );
  return new Map(results);
}
