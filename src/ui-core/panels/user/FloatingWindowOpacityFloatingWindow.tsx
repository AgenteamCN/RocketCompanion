import React from 'react';
import { SettingSliderRow } from '../../compounds/SettingSliderRow';
import type { StandardSurfaceProps, SurfaceMeta } from '../../manifest/surfaceMetaTypes';
import { useStoreSnapshotOverride } from '../../stores/storeSnapshotScope';
import { useFloatingStore, floatingSandboxStore } from '../../stores/floatingStore';

export const SURFACE_META: SurfaceMeta = {
  id: 'floating-window-opacity',
  title: 'Floating Window Opacity',
  description:
    'Global opacity adjustment (1% - 100%) for all active floating telemetry windows.',
  icon: 'sliders-horizontal',
  layer: 'floating-user',
  menuGroup: 'user-floating',
  defaultSizing: {
    width: 343,
    height: 123,
    minWidth: 343,
    minHeight: 115,
    mode: 'adaptive',
  },
};

export interface FloatingWindowOpacityFloatingWindowProps extends StandardSurfaceProps {}

/**
 * 6. [User] Floating Window Opacity (`floating-window-opacity`)
 * Standalone L6 Floating Window Panel — non-resizable, single inline row:
 * Left: "Opacity", Middle: Slider (1%–100%, >= 180px track for >=99px 1% resolution), Right: Editable numeric input (Enter to confirm).
 */
export const FloatingWindowOpacityFloatingWindow: React.FC<
  FloatingWindowOpacityFloatingWindowProps
> = React.memo(({ isLight = false }) => {
  const { opacity: storeOpacity, setOpacity: setMainOpacity } = useFloatingStore();
  const scopedOverride = useStoreSnapshotOverride<{ opacity?: number }>('floatingStore');
  const effectiveOpacity = scopedOverride?.opacity ?? storeOpacity;

  const setOpacity = (val: number) => {
    const clamped = Math.max(1, Math.min(100, Math.round(val)));
    setMainOpacity(clamped);
    floatingSandboxStore.setOpacity(clamped);
  };

  return (
    <div className="px-3 py-2 flex flex-col justify-center text-xs select-none">
      <SettingSliderRow
        label="Opacity"
        title={<span className="whitespace-nowrap">Opacity</span>}
        value={effectiveOpacity}
        min={1}
        max={100}
        step={1}
        unit="%"
        layout="inline"
        trackWidth={148}
        showStepper={false}
        editable={true}
        bordered={false}
        showDescription={false}
        onChange={setOpacity}
        hoverDescription="Global opacity (1% - 100%) for all floating windows. Type a value and press Enter to confirm."
        isLight={isLight}
      />
    </div>
  );
});
FloatingWindowOpacityFloatingWindow.displayName = 'FloatingWindowOpacityFloatingWindow';
export default FloatingWindowOpacityFloatingWindow;
