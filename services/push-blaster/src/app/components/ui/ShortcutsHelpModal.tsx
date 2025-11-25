'use client';

import React from 'react';
import { getModifierSymbol } from '@/app/hooks/useKeyboardShortcuts';

interface ShortcutsHelpModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface ShortcutItem {
  keys: string;
  description: string;
}

export function ShortcutsHelpModal({ isOpen, onClose }: ShortcutsHelpModalProps) {
  if (!isOpen) return null;

  const mod = getModifierSymbol();

  const detailPageShortcuts: ShortcutItem[] = [
    { keys: `${mod} + Enter`, description: 'Run automation now' },
    { keys: `${mod} + P`, description: 'Pause / Resume' },
    { keys: `${mod} + E`, description: 'Edit automation' },
  ];

  const globalShortcuts: ShortcutItem[] = [
    { keys: `${mod} + /`, description: 'Show this help' },
    { keys: 'Escape', description: 'Close dialog' },
  ];

  const navigationShortcuts: ShortcutItem[] = [
    { keys: 'J', description: 'Move down' },
    { keys: 'K', description: 'Move up' },
    { keys: 'Enter', description: 'Open selected' },
  ];

  const ShortcutSection = ({ title, items }: { title: string; items: ShortcutItem[] }) => (
    <div className="mb-4">
      <h3 className="text-sm font-medium text-gray-500 mb-2">{title}</h3>
      <div className="space-y-2">
        {items.map(item => (
          <div key={item.keys} className="flex items-center justify-between">
            <kbd className="px-2 py-1 bg-gray-100 rounded text-sm font-mono">
              {item.keys}
            </kbd>
            <span className="text-sm text-gray-600">{item.description}</span>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-gray-900">Keyboard Shortcuts</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-2xl leading-none"
            aria-label="Close"
          >
            &times;
          </button>
        </div>

        <ShortcutSection title="Detail Page" items={detailPageShortcuts} />
        <ShortcutSection title="Global" items={globalShortcuts} />
        <ShortcutSection title="List Navigation" items={navigationShortcuts} />

        <div className="mt-6 pt-4 border-t border-gray-200 text-center text-sm text-gray-500">
          Press <kbd className="px-1 bg-gray-100 rounded">Escape</kbd> to close
        </div>
      </div>
    </div>
  );
}
