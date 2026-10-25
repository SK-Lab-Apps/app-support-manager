// Which SDK is calling, for keeping old builds working.
//
// SDK 0.4 and later send `x-sdk-version` on every request. Anything without
// it is a build that predates the single support chat — still in the App
// Store, possibly for months — and has to keep receiving exactly what it was
// built against.

/** The calling SDK's version, or null for builds older than 0.4. */
export function sdkVersion(req: Request): string | null {
  const version = req.headers.get('x-sdk-version')?.trim();
  return version && version.length <= 32 ? version : null;
}

/**
 * The query type to show this caller. Builds before 0.4 label threads by
 * type and have no label for 'support' (chats from 0.4 and conversations we
 * start), so those reach them as feedback — the type they treat as general.
 */
export function typeForClient(type: string, req: Request): string {
  return type === 'support' && sdkVersion(req) === null ? 'feedback' : type;
}
