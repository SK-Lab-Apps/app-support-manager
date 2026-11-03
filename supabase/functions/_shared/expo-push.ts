// Expo push for messages the team sends first — from the Users tab or an
// automation. The SDK opens the chat when one is tapped.

const EXPO_PUSH_ENDPOINT = 'https://exp.host/--/api/v2/push/send';
const EXPO_BATCH = 100;
const PREVIEW_MAX = 150;

export interface SupportPush {
  to: string;
  title: string;
  body: string;
  queryId: string;
}

/** The start of a message, for a notification body. */
export function pushPreview(text: string): string {
  return text.length > PREVIEW_MAX
    ? `${text.slice(0, PREVIEW_MAX - 1).trimEnd()}…`
    : text;
}

/**
 * Sends in batches and returns how many Expo accepted. A failed batch is
 * logged and skipped: the messages are in the chat either way.
 */
export async function sendSupportPushes(pushes: SupportPush[]): Promise<number> {
  let accepted = 0;
  for (let i = 0; i < pushes.length; i += EXPO_BATCH) {
    const batch = pushes.slice(i, i + EXPO_BATCH).map((p) => ({
      to: p.to,
      title: p.title,
      body: p.body,
      sound: 'default',
      data: { query_id: p.queryId, type: 'support_reply' },
    }));
    try {
      const response = await fetch(EXPO_PUSH_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(batch),
      });
      const result = await response.json();
      const tickets = Array.isArray(result?.data) ? result.data : [];
      accepted += tickets.filter((t: { status?: string }) => t?.status === 'ok').length;
    } catch (e) {
      console.error('expo-push: batch failed', e);
    }
  }
  return accepted;
}
