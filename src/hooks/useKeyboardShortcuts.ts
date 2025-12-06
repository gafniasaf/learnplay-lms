/**
 * Keyboard Shortcuts Hook
 * 
 * Ctrl+S: Save
 * Ctrl+P: Publish
 * Ctrl+Z: Undo (future)
 * Ctrl+Shift+P: Preview
 */

import { useEffect } from 'react';

interface ShortcutHandlers {
  onSave?: () => void;
  onPublish?: () => void;
  onPreview?: () => void;
  onUndo?: () => void;
}

export function useKeyboardShortcuts(handlers: ShortcutHandlers) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+S or Cmd+S: Save
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        handlers.onSave?.();
      }

      // Ctrl+P or Cmd+P: Publish (override print)
      if ((e.ctrlKey || e.metaKey) && e.key === 'p' && !e.shiftKey) {
        e.preventDefault();
        handlers.onPublish?.();
      }

      // Ctrl+Shift+P: Preview
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'P') {
        e.preventDefault();
        handlers.onPreview?.();
      }

      // Ctrl+Z: Undo
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        handlers.onUndo?.();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handlers]);
}

