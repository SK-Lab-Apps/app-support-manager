/**
 * Sent as `x-sdk-version` on every request. The backend uses its presence to
 * tell 0.4+ (one support chat) from older builds still in the App Store, so
 * keep it in step with package.json.
 */
export const SDK_VERSION = '0.4.0';
