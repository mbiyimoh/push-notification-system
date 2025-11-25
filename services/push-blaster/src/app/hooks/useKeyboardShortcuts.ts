'use client';

import { useEffect, useCallback } from 'react';

export interface ShortcutConfig {
  key: string;
  ctrl?: boolean;
  meta?: boolean;
  shift?: boolean;
  alt?: boolean;
  action: () => void;
  description: string;
}

export function useKeyboardShortcuts(shortcuts: ShortcutConfig[]) {
  const handler = useCallback((e: KeyboardEvent) => {
    // Don't trigger shortcuts when typing in inputs
    const target = e.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
      // Only allow Escape in inputs
      if (e.key !== 'Escape') return;
    }

    // Allow Enter on buttons and links to work normally
    if ((target.tagName === 'BUTTON' || target.tagName === 'A') && e.key === 'Enter') {
      return;
    }

    for (const shortcut of shortcuts) {
      // Check modifier keys
      // For meta shortcut: support both Cmd (Mac) and Ctrl (Windows)
      const metaMatch = shortcut.meta
        ? (e.metaKey || e.ctrlKey)
        : !(e.metaKey && !shortcut.ctrl); // Don't match if meta pressed but not expected (unless ctrl is expected)
      const ctrlMatch = shortcut.ctrl ? e.ctrlKey : !shortcut.meta ? !e.ctrlKey : true;
      const shiftMatch = shortcut.shift ? e.shiftKey : !e.shiftKey;
      const altMatch = shortcut.alt ? e.altKey : !e.altKey;
      const keyMatch = e.key.toLowerCase() === shortcut.key.toLowerCase();

      if (metaMatch && ctrlMatch && shiftMatch && altMatch && keyMatch) {
        e.preventDefault();
        shortcut.action();
        return;
      }
    }
  }, [shortcuts]);

  useEffect(() => {
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handler]);
}

// Utility to get platform-specific modifier key symbol
export function getModifierSymbol(): string {
  if (typeof window === 'undefined') return 'Ctrl';
  return navigator.platform.toLowerCase().includes('mac') ? '⌘' : 'Ctrl';
}
