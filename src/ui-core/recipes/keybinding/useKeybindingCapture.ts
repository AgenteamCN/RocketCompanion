import React, { useEffect, useRef } from 'react';
import type { ActionBinding, ListeningTarget } from './KeybindingActionRow';

export const GAMEPAD_BUTTON_INDEX_MAP: Record<number, string> = {
  0: 'A',
  1: 'B',
  2: 'X',
  3: 'Y',
  4: 'LB',
  5: 'RB',
  6: 'LT',
  7: 'RT',
  8: 'BACK',
  9: 'START',
  10: 'LS',
  11: 'RS',
  12: 'D-UP',
  13: 'D-DOWN',
  14: 'D-LEFT',
  15: 'D-RIGHT',
  16: 'HOME',
};

/**
 * Format raw keyboard event key into standard human-readable keycap shortcut
 */
export function normalizeKeyboardKey(e: KeyboardEvent): string {
  if (e.code === 'Space' || e.key === ' ') return 'SPACE';
  if (e.code === 'ArrowUp') return 'UP';
  if (e.code === 'ArrowDown') return 'DOWN';
  if (e.code === 'ArrowLeft') return 'LEFT';
  if (e.code === 'ArrowRight') return 'RIGHT';
  if (e.code === 'Enter') return 'ENTER';
  if (e.code === 'Backspace') return 'BKSP';
  if (e.code === 'Tab') return 'TAB';
  if (e.code.startsWith('Key')) return e.code.replace('Key', '').toUpperCase();
  if (e.code.startsWith('Digit')) return e.code.replace('Digit', '');
  if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') return 'SHIFT';
  if (e.code === 'ControlLeft' || e.code === 'ControlRight') return 'CTRL';
  if (e.code === 'AltLeft' || e.code === 'AltRight') return 'ALT';
  if (e.code === 'CapsLock') return 'CAPS';

  if (e.key.length === 1) return e.key.toUpperCase();
  return e.key.toUpperCase();
}

export function useKeybindingCapture(
  listeningTarget: ListeningTarget | null,
  setBindings: React.Dispatch<React.SetStateAction<ActionBinding[]>>,
  setListeningTarget: React.Dispatch<React.SetStateAction<ListeningTarget | null>>,
  showFeedback: (msg: string) => void
) {
  const animFrameRef = useRef<number | null>(null);

  // 1. Keyboard event listener for binding capture
  useEffect(() => {
    if (!listeningTarget || listeningTarget.kind !== 'keyboard') return;

    const handleKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();

      if (e.key === 'Escape') {
        setListeningTarget(null);
        showFeedback('Cancelled binding capture.');
        return;
      }

      const shortcut = normalizeKeyboardKey(e);

      setBindings((prev) =>
        prev.map((item) => {
          if (item.id === listeningTarget.actionId) {
            if (item.keyboard.includes(shortcut)) {
              return item;
            }
            return {
              ...item,
              keyboard: [...item.keyboard, shortcut],
            };
          }
          return item;
        })
      );

      showFeedback(`Bound keyboard key [${shortcut}].`);
      setListeningTarget(null);
    };

    window.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => {
      window.removeEventListener('keydown', handleKeyDown, { capture: true });
    };
  }, [listeningTarget, setBindings, setListeningTarget, showFeedback]);

  // 2. Gamepad API polling listener for physical gamepad button presses
  useEffect(() => {
    if (!listeningTarget || listeningTarget.kind !== 'gamepad') {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      return;
    }

    const pollGamepads = () => {
      const gamepads = typeof navigator.getGamepads === 'function' ? navigator.getGamepads() : [];
      for (const gp of gamepads) {
        if (!gp) continue;
        for (let i = 0; i < gp.buttons.length; i++) {
          const btn = gp.buttons[i];
          if (btn && (btn.pressed || btn.value > 0.5)) {
            const mappedName = GAMEPAD_BUTTON_INDEX_MAP[i] || `BTN ${i}`;

            setBindings((prev) =>
              prev.map((item) => {
                if (item.id === listeningTarget.actionId) {
                  if (item.gamepad.includes(mappedName)) return item;
                  return {
                    ...item,
                    gamepad: [...item.gamepad, mappedName],
                  };
                }
                return item;
              })
            );

            showFeedback(`Bound controller button [${mappedName}].`);
            setListeningTarget(null);
            return;
          }
        }
      }
      animFrameRef.current = requestAnimationFrame(pollGamepads);
    };

    animFrameRef.current = requestAnimationFrame(pollGamepads);

    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [listeningTarget, setBindings, setListeningTarget, showFeedback]);
}

