// The end user's language preference, shared by every write endpoint.
//
// SDK 0.5+ takes it from the host app and reports it on every load
// (register-user); older builds ask the user once (set-language). Both also
// send it on each write, so the stored preference self-heals if a call was
// lost. A user with none stored is treated as English, which is also the
// no-translation path — and what replies already sent to them are in.

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { ADMIN_LANGUAGE, baseLanguage } from './languages.ts';

/** Reads the stored preference, or null if this user has never picked one. */
export async function storedLanguage(
  supabase: SupabaseClient,
  appId: string,
  revenuecatId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from('user_locales')
    .select('language')
    .eq('app_id', appId)
    .eq('revenuecat_id', revenuecatId)
    .maybeSingle();
  return data?.language ? baseLanguage(data.language) : null;
}

/**
 * Re-queues every admin reply in this user's threads after they change
 * language.
 *
 * Their own messages need nothing — those were translated *into* English,
 * which is still what admins read. Replies are the other direction, so a
 * thread switched from French to German would otherwise stay French forever.
 *
 * The stale translation is cleared rather than left in place: until the new
 * one lands the SDK falls back to `body`, and English is a better thing to
 * show a German reader than French. The pg_cron sweep picks these up within
 * the minute — a language change is rare enough not to warrant blocking the
 * response on a batch of model calls.
 */
export async function requeueAdminTranslations(
  supabase: SupabaseClient,
  appId: string,
  revenuecatId: string,
  language: string,
): Promise<void> {
  const { data: queries, error } = await supabase
    .from('queries')
    .select('id')
    .eq('app_id', appId)
    .eq('revenuecat_id', revenuecatId);

  if (error) {
    console.error('user-language: thread lookup failed', error);
    return;
  }

  const ids = (queries ?? []).map((q) => (q as { id: string }).id);
  if (ids.length === 0) return;

  const { error: updateError } = await supabase
    .from('messages')
    .update({
      body_translated: null,
      translation_status: language === ADMIN_LANGUAGE ? 'skipped' : 'pending',
      translation_attempts: 0,
    })
    .in('query_id', ids)
    .eq('sender', 'admin');

  if (updateError) {
    console.error('user-language: re-queue failed', updateError);
  }
}

/**
 * Stores `incoming` as this user's language, unless it already is, and
 * returns the language now in force. A change re-queues the replies already
 * in their threads — including a first one away from English: everything
 * sent before a language was stored went out in English.
 *
 * `onlyIfStored` leaves a user with nothing stored as they are, for callers
 * that shouldn't create a row (register-user, for free users). Storage
 * failures are logged, not raised, and leave the previous language in
 * force: a preference that didn't persist must not fail the request.
 */
export async function updateUserLanguage(
  supabase: SupabaseClient,
  appId: string,
  revenuecatId: string,
  incoming: string,
  { onlyIfStored = false }: { onlyIfStored?: boolean } = {},
): Promise<string> {
  const language = baseLanguage(incoming);
  const previous = await storedLanguage(supabase, appId, revenuecatId);
  if (previous === language) return language;
  if (previous === null && onlyIfStored) return ADMIN_LANGUAGE;

  const { error } = await supabase.from('user_locales').upsert(
    {
      app_id: appId,
      revenuecat_id: revenuecatId,
      language,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'app_id,revenuecat_id' },
  );
  if (error) {
    console.error('user-language: upsert failed', error);
    return previous ?? ADMIN_LANGUAGE;
  }

  if ((previous ?? ADMIN_LANGUAGE) !== language) {
    await requeueAdminTranslations(supabase, appId, revenuecatId, language);
  }
  return language;
}

/**
 * Stores `incoming` when present and returns the language in force for this
 * user — what the write endpoints translate the user's message from.
 */
export async function resolveUserLanguage(
  supabase: SupabaseClient,
  appId: string,
  revenuecatId: string,
  incoming?: string,
): Promise<string> {
  if (incoming) {
    return updateUserLanguage(supabase, appId, revenuecatId, incoming);
  }
  return (await storedLanguage(supabase, appId, revenuecatId)) ?? ADMIN_LANGUAGE;
}
