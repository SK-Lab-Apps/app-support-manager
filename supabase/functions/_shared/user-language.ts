// The end user's language preference, shared by every write endpoint.
//
// The SDK sends the language it currently believes on each write, so the
// stored preference self-heals if a set-language call was lost. A user who
// never picked one (or whose pick never reached us) is treated as English,
// which is also the no-translation path.

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
 * Stores `incoming` when present and returns the language in force for this
 * user. Storage failures are logged, not raised: a preference that didn't
 * persist must not fail the message the user is sending.
 */
export async function resolveUserLanguage(
  supabase: SupabaseClient,
  appId: string,
  revenuecatId: string,
  incoming?: string,
): Promise<string> {
  const previous = await storedLanguage(supabase, appId, revenuecatId);

  if (incoming) {
    const language = baseLanguage(incoming);
    const { error } = await supabase.from('user_locales').upsert(
      {
        app_id: appId,
        revenuecat_id: revenuecatId,
        language,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'app_id,revenuecat_id' },
    );

    if (!error) {
      // Covers the case where set-language never landed and the first sign
      // of the change is the message the user is sending right now.
      if (previous !== null && previous !== language) {
        await requeueAdminTranslations(supabase, appId, revenuecatId, language);
      }
      return language;
    }
    console.error('user-language: upsert failed', error);
  }

  return previous ?? ADMIN_LANGUAGE;
}
