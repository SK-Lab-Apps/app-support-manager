// Message templates, for sends from the Users tab and for replies. The
// render rules mirror supabase/functions/send-outreach/index.ts, which does
// the rendering for sends; here they drive the send preview and fill in a
// reply, so keep the two in step.

export const PLACEHOLDERS = [
  { token: '{first_name}', label: 'First name' },
  { token: '{name}', label: 'Full name' },
  { token: '{app}', label: 'App name' },
] as const;

/** Match message_templates' checks. */
export const TEMPLATE_NAME_MAX = 80;
export const TEMPLATE_MAX = 1000;

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
