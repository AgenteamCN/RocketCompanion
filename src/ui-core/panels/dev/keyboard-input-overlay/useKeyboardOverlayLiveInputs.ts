import { useEffect, useState } from 'react';
import {
  getKeyboardInputOverlayTelemetry,
  subscribeKeyboardInputOverlayTelemetry,
  type KeyboardInputOverlayTelemetry,
} from '../../../config/keyboardInputOverlayTelemetry';

export type KeyboardOverlayKeyId =
  | 'q'
  | 'w'
  | 'e'
  | 'a'
  | 's'
  | 'd'
  | 'slide'
  | 'boost'
  | 'jump';

const KEY_CODE_TO_ID: Readonly<Record<string, KeyboardOverlayKeyId>> = {
  KeyQ: 'q',
  KeyW: 'w',
  ArrowUp: 'w',
  KeyE: 'e',
  KeyA: 'a',
  ArrowLeft: 'a',
  KeyS: 's',
  ArrowDown: 's',
  KeyD: 'd',
  ArrowRight: 'd',
  ShiftLeft: 'slide',
  ShiftRight: 'slide',
  Space: 'jump',
};

const EMPTY_HELD: Record<KeyboardOverlayKeyId, boolean> = {
  q: false,
  w: false,
  e: false,
  a: false,
  s: false,
  d: false,
  slide: false,
  boost: false,
  jump: false,
};

export function useKeyboardOverlayLiveInputs() {
  const [telemetry, setTelemetry] = useState<KeyboardInputOverlayTelemetry>(() => ({
    ...getKeyboardInputOverlayTelemetry(),
  }));
  const [localHeld, setLocalHeld] = useState<Record<KeyboardOverlayKeyId, boolean>>({
    ...EMPTY_HELD,
  });

  useEffect(() => {
    return subscribeKeyboardInputOverlayTelemetry((next) => {
      setTelemetry(next);
    });
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target;
      if (
        (target instanceof HTMLInputElement &&
          (target.type === 'text' ||
            target.type === 'number' ||
            target.type === 'search' ||
            target.type === 'password')) ||
        target instanceof HTMLTextAreaElement
      ) {
        return;
      }
      const mapped = KEY_CODE_TO_ID[e.code];
      if (mapped) {
        setLocalHeld((prev) => (prev[mapped] ? prev : { ...prev, [mapped]: true }));
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      const mapped = KEY_CODE_TO_ID[e.code];
      if (mapped) {
        setLocalHeld((prev) => (!prev[mapped] ? prev : { ...prev, [mapped]: false }));
      }
    };

    const onMouseDown = (e: MouseEvent) => {
      const target = e.target;
      if (target instanceof Element && target.closest('[data-floating-window-id]')) {
        return;
      }
      if (e.button === 0) {
        setLocalHeld((prev) => (prev.boost ? prev : { ...prev, boost: true }));
      } else if (e.button === 2) {
        setLocalHeld((prev) => (prev.jump ? prev : { ...prev, jump: true }));
      }
    };

    const onMouseUp = (e: MouseEvent) => {
      if (e.button === 0) {
        setLocalHeld((prev) => (!prev.boost ? prev : { ...prev, boost: false }));
      } else if (e.button === 2) {
        setLocalHeld((prev) => (!prev.jump ? prev : { ...prev, jump: false }));
      }
    };

    const onBlur = () => {
      setLocalHeld({ ...EMPTY_HELD });
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('blur', onBlur);
    };
  }, []);

  const isKeyPressed = (id: KeyboardOverlayKeyId): boolean => {
    switch (id) {
      case 'q':
        return Boolean(localHeld.q || telemetry.qPressed);
      case 'w':
        return Boolean(localHeld.w || telemetry.wPressed);
      case 'e':
        return Boolean(localHeld.e || telemetry.ePressed);
      case 'a':
        return Boolean(localHeld.a || telemetry.aPressed);
      case 's':
        return Boolean(localHeld.s || telemetry.sPressed);
      case 'd':
        return Boolean(localHeld.d || telemetry.dPressed);
      case 'slide':
        return Boolean(localHeld.slide || telemetry.slidePressed);
      case 'boost':
        return Boolean(localHeld.boost || telemetry.boostPressed);
      case 'jump':
        return Boolean(localHeld.jump || telemetry.jumpPressed);
    }
  };

  const setPointerHeld = (id: KeyboardOverlayKeyId, held: boolean) => {
    setLocalHeld((prev) => (prev[id] === held ? prev : { ...prev, [id]: held }));
  };

  return {
    telemetry,
    isKeyPressed,
    setPointerHeld,
  };
}
