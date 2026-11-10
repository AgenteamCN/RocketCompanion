import React from 'react';
import { NameTagCalibrationSection } from './name-tag-tuner/NameTagCalibrationSection';
import { NameTagPillGeometryAndPreviewSection } from './name-tag-tuner/NameTagPillGeometryAndPreviewSection';
import { NameTagSingleCharIndicatorSection } from './name-tag-tuner/NameTagSingleCharIndicatorSection';
import { NameTagBoostBorderSection } from './name-tag-tuner/NameTagBoostBorderSection';
import { NameTagOffscreenAndAerialAlertSection } from './name-tag-tuner/NameTagOffscreenAndAerialAlertSection';
import { NameTagColorsAndNamesSection } from './name-tag-tuner/NameTagColorsAndNamesSection';
import type { StandardSurfaceProps, SurfaceMeta } from '../../manifest/surfaceMetaTypes';

/**
 * Self-describing surface metadata for the 3D Nameplate & Off-Screen Indicator Tuner.
 * Consumed by `import.meta.glob` in `surfaceRegistry.ts` and `floatingWindowRegistry.tsx`.
 */
export const SURFACE_META: SurfaceMeta = {
  id: 'name-tag-tuner',
  title: '3D Nameplate & Off-Screen Indicator Tuner',
  layer: 'floating-dev',
  menuGroup: 'calibrated-presets',
  defaultSizing: {
    width: 480,
    height: 620,
    minWidth: 460,
    minHeight: 200,
    mode: 'adaptive',
  },
};

export interface NameTagTunerFloatingWindowProps extends StandardSurfaceProps {
  active?: boolean;
  layout?: 'column' | 'grid';
}

/**
 * [Calibrated Preset] 3D Nameplate & Off-Screen Indicator Tuner (`name-tag-tuner`)
 *
 * Composes 5 Store-First sections reading directly from `useNameTagTunerStore`,
 * `useAppStore`, and `useHudStore`:
 * 1. `NameTagCalibrationSection`: 1-parameter distance scale power-law fit & anchors
 * 2. `NameTagPillGeometryAndPreviewSection`: 2D SVG pill geometry & live preview
 * 3. `NameTagBoostBorderSection`: 0–100% perimeter boost track & depletion alert
 * 4. `NameTagOffscreenAndAerialAlertSection`: off-screen edge chevron & aerial alert
 * 5. `NameTagColorsAndNamesSection`: team palette, POV vehicle selector & custom names
 */
export const NameTagTunerFloatingWindow: React.FC<NameTagTunerFloatingWindowProps> = ({
  isLight = false,
  active = true,
  layout = 'column',
}) => {
  if (!active) return null;

  const containerClassName =
    layout === 'grid'
      ? 'grid grid-cols-1 lg:grid-cols-2 gap-3 items-start select-none text-xs'
      : 'flex flex-col gap-2.5 select-none text-xs';

  return (
    <div className={containerClassName}>
      {/* 1. Distance Scale Power-Law Calibration & Anchor Points */}
      <NameTagCalibrationSection isLight={isLight} />

      {/* 1b. On-Screen Single-Char Indicator & Match Slot Codes */}
      <NameTagSingleCharIndicatorSection isLight={isLight} />

      {/* 2. Pill Geometry, Typography & Live 2D SVG Preview */}
      <NameTagPillGeometryAndPreviewSection isLight={isLight} />

      {/* 3. Boost Perimeter Border & Low-Boost Alert */}
      <NameTagBoostBorderSection isLight={isLight} />

      {/* 4. Off-Screen Edge Indicator & Aerial Threat Alert */}
      <NameTagOffscreenAndAerialAlertSection isLight={isLight} />

      {/* 5. Team Colors, POV Car Selector & Custom Preview Names */}
      <NameTagColorsAndNamesSection isLight={isLight} />
    </div>
  );
};

export default NameTagTunerFloatingWindow;
