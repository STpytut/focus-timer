// Keyboard shortcut help: a native modal <dialog> that remembers what had
// focus when it opened and returns focus there when it closes.

/**
 * @param {{dialog: any, opener: any, closeButton: any, document: any,
 *   canOpen?: () => boolean}} options
 *   `canOpen` lets the page refuse to stack help on top of another modal.
 */
export function createHelpDialog({ dialog, opener, closeButton, document, canOpen = () => true }) {
  let returnTo = null;

  function open() {
    if (dialog.open || !canOpen()) return false;
    const active = document.activeElement;
    returnTo = active && active !== document.body ? active : null;
    dialog.showModal();
    closeButton.focus();
    return true;
  }

  function close() {
    if (dialog.open) dialog.close();
  }

  // Covers Close, Escape and any other way the dialog closes.
  dialog.addEventListener('close', () => {
    const target = returnTo;
    returnTo = null;
    if (target && target.isConnected && !target.closest?.('[hidden]')) target.focus();
    else opener.focus();
  });

  opener.addEventListener('click', open);
  closeButton.addEventListener('click', close);

  return { open, close, isOpen: () => dialog.open === true };
}
