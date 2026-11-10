let _persistentReplayFileInput: HTMLInputElement | null = null;
let _pendingReplaySelectHandler: ((file: File) => void) | null = null;

export function triggerReplayFilePicker(onSelect: (file: File) => void): void {
  if (typeof document === 'undefined') return;
  _pendingReplaySelectHandler = onSelect;
  if (!_persistentReplayFileInput || !_persistentReplayFileInput.isConnected) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept =
      '.rcreplay,.rcreplay.gz,.rcgr,.rcgr.gz,.json,.gz,application/gzip,application/x-gzip,application/json';
    input.style.position = 'fixed';
    input.style.left = '-9999px';
    input.style.top = '-9999px';
    input.style.width = '1px';
    input.style.height = '1px';
    input.style.opacity = '0';
    input.style.pointerEvents = 'none';
    input.tabIndex = -1;
    input.setAttribute('aria-hidden', 'true');
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      input.value = '';
      if (file && _pendingReplaySelectHandler) {
        const handler = _pendingReplaySelectHandler;
        handler(file);
      }
    });
    document.body.appendChild(input);
    _persistentReplayFileInput = input;
  }
  _persistentReplayFileInput.value = '';
  _persistentReplayFileInput.click();
}
