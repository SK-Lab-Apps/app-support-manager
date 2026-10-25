// Review requests: a support reply with a "Rate on the App Store / Google
// Play" button. The button opens the store's write-a-review page — the store
// app where there is one, its website otherwise. It is a link, not a prompt:
// Apple's guidelines reserve in-app rating prompts for SKStoreReviewController,
// and linking to the review page is what they document for everything else.

import { Linking, Platform } from 'react-native';
import type { StoreListing } from './types';

interface StoreLinks {
  /** Opens the store app. */
  app: string;
  /** The same page on the web, if the store app won't open. */
  web: string;
}

/** Links for this device's store, or null when the team hasn't set one up. */
export function storeLinks(store: StoreListing | null | undefined): StoreLinks | null {
  if (Platform.OS === 'ios' && store?.app_store_id) {
    const id = encodeURIComponent(store.app_store_id);
    return {
      app: `itms-apps://apps.apple.com/app/id${id}?action=write-review`,
      web: `https://apps.apple.com/app/id${id}?action=write-review`,
    };
  }
  if (Platform.OS === 'android' && store?.play_store_package) {
    const pkg = encodeURIComponent(store.play_store_package);
    return {
      app: `market://details?id=${pkg}&showAllReviews=true`,
      web: `https://play.google.com/store/apps/details?id=${pkg}&showAllReviews=true`,
    };
  }
  return null;
}

/** Opens the review page; resolves false if neither link would open. */
export async function openStoreReview(links: StoreLinks): Promise<boolean> {
  try {
    await Linking.openURL(links.app);
    return true;
  } catch {
    try {
      await Linking.openURL(links.web);
      return true;
    } catch {
      return false;
    }
  }
}

/** The platform the backend should know this user by, if it's a store one. */
export function storePlatform(): 'ios' | 'android' | undefined {
  return Platform.OS === 'ios' || Platform.OS === 'android' ? Platform.OS : undefined;
}
