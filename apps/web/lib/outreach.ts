// Message templates for sends from the Users tab. The render rules mirror
// supabase/functions/send-outreach/index.ts, which does the real rendering;
// this copy only drives the composer's preview, so keep the two in step.

export const PLACEHOLDERS = [
  { token: '{first_name}', label: 'First name' },
  { token: '{name}', label: 'Full name' },
  { token: '{app}', label: 'App name' },
] as const;

export const OUTREACH_MAX = 1000;
/** Matches the function's cap; larger audiences go in several sends. */
export const OUTREACH_MAX_RECIPIENTS = 1000;

/**
 * Fills the placeholders for one user. A user with no name on record loses
 * the placeholder along with the space before it — "Hi {first_name}," reads
 * "Hi," — which works in any language, unlike a stand-in word.
 */
export function renderTemplate(
  template: string,
  user: { name: string | null },
  appName: string,
): string {
  const name = user.name?.trim() || null;
  const values: Record<'first_name' | 'name', string | null> = {
    name,
    first_name: name ? (name.split(/\s+/)[0] ?? name) : null,
  };
  return template
    .replace(/\s?\{(first_name|name)\}/g, (match, key: 'first_name' | 'name') => {
      const value = values[key];
      return value ? match.replace(`{${key}}`, value) : '';
    })
    .replace(/\{app\}/g, appName);
}
