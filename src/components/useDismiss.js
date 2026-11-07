import { useEffect, useRef } from 'react';

// Dropdowns and popovers: while `open`, a click outside the returned ref's element or Escape calls close().
export function useCloseOnOutside(open, close) {
  const root = useRef(null);
  const latestClose = useRef(close);
  latestClose.current = close;

  useEffect(() => {
    if (!open) return undefined;

    function onPointer(event) {
      if (!root.current?.contains(event.target)) latestClose.current();
    }
    function onKey(event) {
      if (event.key === 'Escape') latestClose.current();
    }
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return root;
}

// Modal dialogs: focuses the returned ref's element once and calls onCancel() on Escape.
// Runs only on mount, so live re-renders (lobby updates) never steal focus.
export function useDialogFocus(onCancel) {
  const focusTarget = useRef(null);
  const cancel = useRef(onCancel);
  cancel.current = onCancel;

  useEffect(() => {
    focusTarget.current?.focus();
    function onKey(event) {
      if (event.key === 'Escape') cancel.current();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  return focusTarget;
}

// Backdrop handler: a press on the backdrop itself (not the dialog) cancels
export function cancelOnBackdrop(onCancel) {
  return event => {
    if (event.target === event.currentTarget) onCancel();
  };
}
