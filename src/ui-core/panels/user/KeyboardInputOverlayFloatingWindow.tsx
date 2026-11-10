import React, { useEffect, useRef } from 'react';
import type { StandardSurfaceProps, SurfaceMeta } from '../../manifest/surfaceMetaTypes';
import { useFloatingStore } from '../../stores/floatingStore';
import { useKeyboardInputOverlayStore } from '../../stores/keyboardInputOverlayStore';
import { KeyboardInputOverlayMatrixStage } from '../dev/keyboard-input-overlay/KeyboardInputOverlayMatrixStage';

export const SURFACE_META: SurfaceMeta = {
  id: 'keyboard-input-overlay',
  title: 'Keyboard Input Overlay',
  subtitle: '3x3 Retro Keycaps · 3D Attitude Arrows',
  description:
    'Resizable 3x3 retro trapezoid keycap overlay (Q/W/E, A/S/D, Slide/Boost/Jump) with 3D camera-relative WASD attitude arrows.',
  icon: 'keyboard',
  layer: 'floating-user',
  menuGroup: 'user-floating',
  defaultSizing: {
    width: 280,
    height: 320,
    minWidth: 180,
    minHeight: 210,
    maxHeight: 2400,
    mode: 'fixed',
  },
};

export interface KeyboardInputOverlayFloatingWindowProps extends StandardSurfaceProps {
  active?: boolean;
}

export const KeyboardInputOverlayFloatingWindow: React.FC<
  KeyboardInputOverlayFloatingWindowProps
> = ({ isLight = false, active = true }) => {
  const store = useKeyboardInputOverlayStore();
  const { opacity: globalFloatingOpacity } = useFloatingStore();
  const rootRef = useRef<HTMLDivElement | null>(null);

  // Multiplicative Opacity Superposition:
  // Global Floating Window Opacity (e.g. 20%) * Keyboard Opacity (e.g. 500%) = 100% result.
  // Applied directly to the enclosing `[data-floating-window-id="keyboard-input-overlay"]` shell element.
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const shellEl = el.closest('[data-floating-window-id]') as HTMLElement | null;
    if (!shellEl) return;

    const computeDesiredOpacity = () => {
      const globalFrac = Math.max(0.01, Math.min(1, (globalFloatingOpacity ?? 85) / 100));
      const keyFrac = Math.max(0.01, (store.keyboardOpacityPct ?? 100) / 100);
      const effectiveAlpha = store.compensateGlobalOpacity
        ? Math.max(0.02, Math.min(1, globalFrac * keyFrac))
        : Math.max(0.02, Math.min(1, globalFrac * Math.min(1, keyFrac)));
      return effectiveAlpha.toFixed(3);
    };

    shellEl.style.opacity = computeDesiredOpacity();

    if (typeof MutationObserver !== 'undefined') {
      const mo = new MutationObserver(() => {
        const desired = computeDesiredOpacity();
        if (shellEl.style.opacity !== desired) {
          shellEl.style.opacity = desired;
        }
      });
      mo.observe(shellEl, { attributes: true, attributeFilter: ['style'] });
      return () => mo.disconnect();
    }
  }, [
    globalFloatingOpacity,
    store.keyboardOpacityPct,
    store.compensateGlobalOpacity,
  ]);

  if (!active) return null;

  return (
    <div
      ref={rootRef}
      data-ui-interactive="true"
      className="p-2.5 flex flex-col select-none"
    >
      <KeyboardInputOverlayMatrixStage isLight={isLight} />
    </div>
  );
};

KeyboardInputOverlayFloatingWindow.displayName =
  'KeyboardInputOverlayFloatingWindow';
export default KeyboardInputOverlayFloatingWindow;
