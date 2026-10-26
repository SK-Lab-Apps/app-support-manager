// The app_users directory: who each app's paying and trial users are and
// which plan they're on, for the dashboard's Users tab and messages we send
// first. Free users aren't kept — their conversations are, like anyone's.

import { z } from 'npm:zod@3.23.8';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

export const PlanSchema = z.enum(['free', 'trial', 'pro']);
export type UserPlan = z.infer<typeof PlanSchema>;
/**
 * What the directory holds: the plans apps report, plus the cancelled ones
 * RevenueCat's webhook sets (see the revenuecat-webhook function).
 */
export type StoredPlan = UserPlan | 'trial_cancelled' | 'pro_cancelled';

/** What SDK 0.4+ sends about the current user. */
export const ReportedUserSchema = z.object({
  name: z.string().trim().min(1).max(120),
  plan: PlanSchema,
  app_version: z.string().trim().min(1).max(40),
  // Which store a review request should open.
  platform: z.enum(['ios', 'android']).optional(),
});

/** Builds before 0.4 only report paid-or-not. */
export function planFromIsPaid(isPaid: boolean): UserPlan {
  return isPaid ? 'pro' : 'free';
}

/**
 * Records that this user was just seen, with whatever was reported. A free
 * user isn't stored, and one whose trial or subscription lapsed leaves the
 * directory. Fields left undefined keep their stored value; first_seen_at is
 * set only on insert. Best effort — the directory must never fail a user's
 * request.
 */
export async function touchAppUser(
  supabase: SupabaseClient,
  appId: string,
  revenuecatId: string,
  fields: {
    name?: string;
    plan: UserPlan;
    appVersion?: string;
    sdkVersion?: string | null;
    platform?: 'ios' | 'android';
  },
): Promise<void> {
  if (fields.plan === 'free') {
    const { error } = await supabase
      .from('app_users')
      .delete()
      .eq('app_id', appId)
      .eq('revenuecat_id', revenuecatId);
    if (error) console.error('app-users: delete failed', error);
    return;
  }

  const seen: Record<string, unknown> = {
    last_seen_at: new Date().toISOString(),
  };
  if (fields.name !== undefined) seen.name = fields.name;
  if (fields.appVersion !== undefined) seen.app_version = fields.appVersion;
  if (fields.sdkVersion) seen.sdk_version = fields.sdkVersion;
  if (fields.platform !== undefined) seen.platform = fields.platform;

  // A cancelled plan comes from RevenueCat's webhook. The app can't tell it
  // apart — the user keeps their access until the period ends — so a report
  // of the same plan leaves it marked cancelled.
  const { data: kept, error: keepError } = await supabase
    .from('app_users')
    .update(seen)
    .eq('app_id', appId)
    .eq('revenuecat_id', revenuecatId)
    .eq('plan', `${fields.plan}_cancelled`)
    .select('revenuecat_id');
  if (keepError) console.error('app-users: update failed', keepError);
  if (kept && kept.length > 0) return;

  const { error } = await supabase.from('app_users').upsert(
    { app_id: appId, revenuecat_id: revenuecatId, plan: fields.plan, ...seen },
    { onConflict: 'app_id,revenuecat_id' },
  );
  if (error) console.error('app-users: upsert failed', error);
}
