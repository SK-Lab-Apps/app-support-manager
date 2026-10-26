// Outgoing chat messages, from the tap on Send until the server's copy is
// in the thread list.
//
// A message shows in the chat the moment it is sent, and the composer is
// free for the next one straight away — it used to sit greyed out through
// the send and a full reload. Messages go out one at a time in the order
// they were written, so the server sees them in the order the user does.
// A failure leaves the bubble in place, marked as not sent, for a tap to
// retry: nothing the user wrote is dropped.
//
// The outbox lives with the launcher rather than the chat screen, so a send
// in flight (or a failed one) survives the sheet closing.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Thread } from './types';

export interface OutgoingMessage {
  /** Local key, stable for the life of the bubble. */
  key: string;
  body: string;
  /** Device time — only places the bubble until the server's copy lands. */
  created_at: string;
  status: 'sending' | 'failed' | 'sent';
  /** The server's id once delivered; the bubble then yields to its copy. */
  messageId: string | null;
}

export interface OutboxState {
  /** Messages whose server copy isn't in the thread list yet, oldest first. */
  outbox: OutgoingMessage[];
  /** Why the latest send failed; cleared by the next send or retry. */
  error: unknown;
  send: (body: string) => void;
  retry: (key: string) => void;
  clearError: () => void;
}

let lastKey = 0;

export function useOutbox({
  threads,
  deliver,
}: {
  threads: Thread[] | null;
  /** Sends one message and resolves with the server's id for it. */
  deliver: (body: string) => Promise<string>;
}): OutboxState {
  const [outbox, setOutbox] = useState<OutgoingMessage[]>([]);
  const [error, setError] = useState<unknown>(null);
  const mounted = useRef(true);
  /** Tail of the send queue: each message waits for the one before it. */
  const queue = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // Delivered messages leave once the thread list has the server's copy.
  useEffect(() => {
    if (threads === null) return;
    const landed = new Set(
      threads.flatMap((thread) => thread.messages.map((message) => message.id)),
    );
    setOutbox((items) => {
      const next = items.filter(
        (item) => item.messageId === null || !landed.has(item.messageId),
      );
      return next.length === items.length ? items : next;
    });
  }, [threads, outbox]);

  const enqueue = useCallback(
    (key: string, body: string) => {
      const settle = (patch: Partial<OutgoingMessage>) =>
        setOutbox((items) =>
          items.map((item) => (item.key === key ? { ...item, ...patch } : item)),
        );
      queue.current = queue.current.then(async () => {
        try {
          const messageId = await deliver(body);
          if (mounted.current) settle({ status: 'sent', messageId });
        } catch (e) {
          if (!mounted.current) return;
          settle({ status: 'failed' });
          setError(e);
        }
      });
    },
    [deliver],
  );

  const send = useCallback(
    (body: string) => {
      lastKey += 1;
      const key = `outgoing-${lastKey}`;
      setError(null);
      setOutbox((items) => [
        ...items,
        {
          key,
          body,
          created_at: new Date().toISOString(),
          status: 'sending',
          messageId: null,
        },
      ]);
      enqueue(key, body);
    },
    [enqueue],
  );

  const retry = useCallback(
    (key: string) => {
      const item = outbox.find((candidate) => candidate.key === key);
      if (item === undefined || item.status !== 'failed') return;
      setError(null);
      // It goes out after anything already queued, so it moves there too.
      setOutbox((items) => [
        ...items.filter((candidate) => candidate.key !== key),
        { ...item, status: 'sending', created_at: new Date().toISOString() },
      ]);
      enqueue(key, item.body);
    },
    [outbox, enqueue],
  );

  const clearError = useCallback(() => setError(null), []);

  return { outbox, error, send, retry, clearError };
}
