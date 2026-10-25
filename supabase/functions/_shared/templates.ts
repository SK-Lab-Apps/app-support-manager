// Message templates for sends from the dashboard's Users tab: {first_name},
// {name} and {app}, filled in per recipient.
//
// Mirrored in apps/web/lib/outreach.ts for the composer's preview; keep the
// two in step.

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
