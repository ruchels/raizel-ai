'use client';

import { useCallback, useEffect, useState } from 'react';
import type { ThemePreference } from '@/types/chat';

const DARK_QUERY = '(prefers-color-scheme: dark)';

function resolve(preference: ThemePreference): 'light' | 'dark' {
  if (preference === 'system') {
    if (typeof window === 'undefined') return 'light';
    return window.matchMedia(DARK_QUERY).matches ? 'dark' : 'light';
  }
  return preference;
}

function apply(resolved: 'light' | 'dark'): void {
  document.documentElement.classList.toggle('dark', resolved === 'dark');
}

/**
 * Keeps the `dark` class on <html> in sync with the user's preference.
 * The initial class is set by the inline script in layout.tsx; this hook takes
 * over afterwards and follows OS changes while the preference is "system".
 */
export function useTheme(preference: ThemePreference) {
  const [resolved, setResolved] = useState<'light' | 'dark'>(() => resolve(preference));

  useEffect(() => {
    const next = resolve(preference);
    setResolved(next);
    apply(next);

    if (preference !== 'system') return;

    const media = window.matchMedia(DARK_QUERY);
    const onChange = (event: MediaQueryListEvent) => {
      const value = event.matches ? 'dark' : 'light';
      setResolved(value);
      apply(value);
    };
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [preference]);

  return resolved;
}

/** Matches a media query reactively; false during SSR. */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const media = window.matchMedia(query);
    setMatches(media.matches);
    const onChange = (event: MediaQueryListEvent) => setMatches(event.matches);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [query]);

  return matches;
}

/** True on viewports below the md breakpoint. */
export function useIsMobile(): boolean {
  return useMediaQuery('(max-width: 767px)');
}

/** Locks body scroll while an overlay is open, restoring the previous value. */
export function useBodyScrollLock(locked: boolean): void {
  useEffect(() => {
    if (!locked) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [locked]);
}

/** Calls `onClose` on Escape. */
export function useEscapeKey(active: boolean, onClose: () => void): void {
  const handler = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    },
    [onClose]
  );

  useEffect(() => {
    if (!active) return;
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [active, handler]);
}
