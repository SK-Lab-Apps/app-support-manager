// The app_users directory: who each app's users are and which plan they're
// on, for the dashboard's Users tab and messages we send first.

import { z } from 'npm:zod@3.23.8';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

export const PlanSchema = z.enum(['free', 'trial', 'pro']);
export type UserPlan = z.infer<typeof PlanSchema>;

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
 * Records that this user was just seen, with whatever was reported. Fields
 * left undefined keep their stored value; first_seen_at is set only on
 * insert. Best effort — the directory must never fail a user's request.
 */
export async function touchAppUser(
  supabase: SupabaseClient,
  appId: string,
  revenuecatId: string,
  fields: {
    name?: string;
    plan?: UserPlan;
    appVersion?: string;
    sdkVersion?: string | null;
    platform?: 'ios' | 'android';
  },
): Promise<void> {
  const row: Record<string, unknown> = {
    app_id: appId,
    revenuecat_id: revenuecatId,
    last_seen_at: new Date().toISOString(),
  };
  if (fields.name !== undefined) row.name = fields.name;
  if (fields.plan !== undefined) row.plan = fields.plan;
  if (fields.appVersion !== undefined) row.app_version = fields.appVersion;
  if (fields.sdkVersion) row.sdk_version = fields.sdkVersion;
  if (fields.platform !== undefined) row.platform = fields.platform;

  const { error } = await supabase
    .from('app_users')
    .upsert(row, { onConflict: 'app_id,revenuecat_id' });
  if (error) console.error('app-users: upsert failed', error);
}
