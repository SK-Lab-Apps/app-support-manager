'use client';

import { Moon, Sun } from 'lucide-react';
import { useEffect, useState } from 'react';
import { IconButton } from '@/components/ui/icon-button';

/**
 * Toggles data-theme on <html> and persists to localStorage.
 * prefers-color-scheme is only consulted on first visit (see root layout).
 */
export function ThemeToggle() {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');

  useEffect(() => {
    const current = document.documentElement.getAttribute('data-theme');
    if (current === 'light') setTheme('light');
  }, []);

  function toggle() {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    document.documentElement.setAttribute('data-theme', next);
    try {
      localStorage.setItem('theme', next);
    } catch {
      // Storage unavailable — theme still applies for this session.
    }
  }

  return (
    <IconButton
      onClick={toggle}
      aria-label={
        theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'
      }
    >
      {theme === 'dark' ? (
        <Sun size={15} strokeWidth={1.5} />
      ) : (
        <Moon size={15} strokeWidth={1.5} />
      )}
    </IconButton>
  );
}
