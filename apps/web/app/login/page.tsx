'use client';

import { useState, type FormEvent } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    const supabase = createClient();

    // Username → auth email via SECURITY DEFINER lookup, then password auth.
    const { data: email, error: lookupError } = await supabase.rpc(
      'admin_email_for_username',
      { p_username: username.trim() },
    );

    if (lookupError || !email) {
      setError('Invalid username or password');
      setSubmitting(false);
      return;
    }

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email as string,
      password,
    });

    if (signInError) {
      setError('Invalid username or password');
      setSubmitting(false);
      return;
    }

    // Full navigation so the server layout picks up the new session cookie.
    window.location.assign('/');
  }

  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10 pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))]">
      <div className="w-full max-w-[320px]">
        <div className="mb-6">
          <div className="mb-4 flex h-7 w-7 items-center justify-center rounded-control border border-border bg-surface text-xs font-semibold">
            S
          </div>
          <h1 className="text-lg font-semibold tracking-heading">Sign in</h1>
          <p className="mt-1 text-sm text-secondary">
            Admin access only. Accounts are provisioned manually.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="username" className="text-xs text-secondary">
              Username
            </label>
            <Input
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              autoFocus
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="password" className="text-xs text-secondary">
              Password
            </label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </div>

          {error && (
            <p role="alert" className="text-xs text-status-danger">
              {error}
            </p>
          )}

          <Button
            type="submit"
            variant="primary"
            disabled={submitting || !username || !password}
            className="mt-1"
          >
            {submitting ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>
      </div>
    </main>
  );
}
