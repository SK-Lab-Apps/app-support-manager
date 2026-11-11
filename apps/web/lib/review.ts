// Review requests: a message with a "Rate on the App Store / Google Play"
// button under it in SDK 0.4+. Sent as a reply in a conversation, or first
// from the Users tab; both composers share these rules.

import type { StoreListing, StorePlatform } from '@/lib/types';

/** The button's label in the app, or a neutral one when we can't tell. */
export function storeLabel(platform: StorePlatform | null): string {
  if (platform === 'ios') return 'Rate on the App Store';
  if (platform === 'android') return 'Rate on Google Play';
  return 'Rate in the store';
}

/** Whether either store is set up — without one, nothing can be sent. */
export function hasStoreListing(store: StoreListing): boolean {
  return store.app_store_id !== null || store.play_store_package !== null;
}

/**
 * Whether this platform's store is set up. SDKs before 0.4 don't report a
 * platform; for them, either store will do.
 */
export function storeSetUpFor(
  store: StoreListing,
  platform: StorePlatform | null,
): boolean {
  if (platform === 'ios') return store.app_store_id !== null;
  if (platform === 'android') return store.play_store_package !== null;
  return hasStoreListing(store);
}

/**
 * Whether a user's app shows the button: SDK 0.4+ (which reports its
 * version) with a store listing for their platform. Others see the text.
 */
export function showsReviewButton(
  store: StoreListing,
  user: { sdk_version: string | null; platform: StorePlatform | null },
): boolean {
  return user.sdk_version !== null && storeSetUpFor(store, user.platform);
}

export const STORE_LISTING_MISSING =
  "Add this app's store listing first (the star in the app's header)";

export const NO_INCENTIVES =
  "Don't offer anything in exchange — Apple and Google don't allow it.";
