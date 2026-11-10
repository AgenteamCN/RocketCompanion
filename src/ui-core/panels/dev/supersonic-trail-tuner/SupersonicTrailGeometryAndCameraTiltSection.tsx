import React from 'react';
import {
  updateSupersonicTrailConfig,
  type SupersonicTrailConfig,
  type SupersonicTrailOrientationMode,
} from '../../../config/supersonicTrailConfig';
import { SegmentedSwitch } from '../../../primitives/SegmentedSwitch';
import { SliderControl } from '../../../primitives/SliderControl';
import { ToggleSwitch } from '../../../primitives/ToggleSwitch';

export interface SupersonicTrailGeometryAndCameraTiltSectionProps {
  cfg: SupersonicTrailConfig;
  isLight: boolean;
}

export const SupersonicTrailGeometryAndCameraTiltSection: React.FC<
  SupersonicTrailGeometryAndCameraTiltSectionProps
> = ({ cfg, isLight }) => {
  const cardBg = isLight
    ? 'bg-neutral-50 border-neutral-200 text-neutral-900'
    : 'bg-neutral-900/60 border-neutral-700/60 text-neutral-100';
  const mutedText = isLight ? 'text-neutral-500' : 'text-neutral-400';

  return (
    <div className={`p-2.5 rounded-xl border flex flex-col gap-2 shrink-0 ${cardBg}`}>
      <span className="font-bold text-[11px] text-purple-400 border-b border-neutral-500/20 pb-1">
        3. Taper Geometry, Ground-Hinge Upright Stand &amp; POV Preview
      </span>

      <div className="flex flex-col gap-1">
        <span className={`text-[10px] font-semibold ${mutedText}`}>Ribbon Orientation Mode</span>
        <SegmentedSwitch
          value={cfg.orientationMode}
          onValueChange={(val) =>
            updateSupersonicTrailConfig({
              orientationMode: val as SupersonicTrailOrientationMode,
            })
          }
          options={[
            { value: 'surface-aligned', label: 'POV Flat + Remote Tilt' },
            { value: 'flat-ground', label: 'All Cars Pure Flat' },
            { value: 'camera-facing', label: 'Full Upright Stand' },
          ]}
          size="sm"
          fullWidth
          isLight={isLight}
        />
      </div>

      {/* POV Force Upright Preview Toggle */}
      <div className="flex items-center justify-between px-2.5 py-2 rounded-lg border border-amber-500/35 bg-amber-500/10">
        <div className="flex flex-col pr-2">
          <span className="text-[11px] font-bold text-amber-400">
            Force Upright in POV (Calibration Preview)
          </span>
          <span className={`text-[9px] leading-tight ${mutedText}`}>
            Normally POV trails hug the surface flat; enable to stand your own POV trail 90° upright from the ground hinge to tune vertical height &amp; visibility in Free Play / Exhibition
          </span>
        </div>
        <ToggleSwitch
          checked={Boolean(cfg.povForceUprightPreview)}
          onCheckedChange={(povForceUprightPreview) =>
            updateSupersonicTrailConfig({ povForceUprightPreview })
          }
          isLight={isLight}
        />
      </div>

      {cfg.orientationMode !== 'flat-ground' && (
        <div className="p-2 rounded-lg border border-purple-500/25 bg-purple-500/5 flex flex-col gap-2">
          {cfg.orientationMode === 'surface-aligned' && (
            <SliderControl
              label="Other-Car Camera Tilt Strength"
              description="Rotates non-POV car ribbons upright toward the camera around their ground-contact hinge"
              value={cfg.cameraTiltStrength ?? 0.8}
              min={0.0}
              max={1.0}
              step={0.02}
              editable={true}
              onChange={(cameraTiltStrength) =>
                updateSupersonicTrailConfig({ cameraTiltStrength })
              }
              isLight={isLight}
            />
          )}

          <SliderControl
            label="Upright Vertical Height Scale"
            description="Scales ribbon height when tilted upright so vertical stand reaches slightly above wheel axle (~20 UU) for clear long-range visibility"
            value={cfg.uprightHeightScale ?? 1.35}
            min={0.5}
            max={3.0}
            step={0.05}
            unit="x"
            editable={true}
            onChange={(uprightHeightScale) =>
              updateSupersonicTrailConfig({ uprightHeightScale })
            }
            isLight={isLight}
          />

          <SliderControl
            label="Ground-Hinge Axis Lift"
            description="1.0 = bottom edge stays planted on ground while full height extends upward (0.0 = center pivot, >1.0 = extra axle lift)"
            value={cfg.uprightGroundHingeLift ?? 1.0}
            min={0.0}
            max={2.0}
            step={0.05}
            unit="x"
            editable={true}
            onChange={(uprightGroundHingeLift) =>
              updateSupersonicTrailConfig({ uprightGroundHingeLift })
            }
            isLight={isLight}
          />
        </div>
      )}

      <SliderControl
        label="Head Width (Thick Front)"
        value={cfg.headWidthUu}
        min={2.0}
        max={32.0}
        step={0.5}
        unit=" UU"
        editable={true}
        onChange={(headWidthUu) => updateSupersonicTrailConfig({ headWidthUu })}
        isLight={isLight}
      />

      <SliderControl
        label="Tail Width (Thin Tip)"
        value={cfg.tailWidthUu}
        min={0.0}
        max={16.0}
        step={0.25}
        unit=" UU"
        editable={true}
        onChange={(tailWidthUu) => updateSupersonicTrailConfig({ tailWidthUu })}
        isLight={isLight}
      />

      <SliderControl
        label="Width Taper Exponent"
        value={cfg.widthTaperCurve}
        min={0.3}
        max={3.0}
        step={0.05}
        editable={true}
        onChange={(widthTaperCurve) => updateSupersonicTrailConfig({ widthTaperCurve })}
        isLight={isLight}
      />

      <SliderControl
        label="Overall Trail Opacity"
        value={cfg.opacity}
        min={0.05}
        max={1.0}
        step={0.01}
        editable={true}
        onChange={(opacity) => updateSupersonicTrailConfig({ opacity })}
        isLight={isLight}
      />

      <SliderControl
        label="Alpha Fade-Out Curve"
        value={cfg.fadeCurve}
        min={0.3}
        max={3.0}
        step={0.05}
        editable={true}
        onChange={(fadeCurve) => updateSupersonicTrailConfig({ fadeCurve })}
        isLight={isLight}
      />

      <SliderControl
        label="Surface Normal Lift Offset"
        description="Base offset along contact normal to prevent z-fighting on ground/ramps"
        value={cfg.surfaceLiftUu}
        min={0.2}
        max={10.0}
        step={0.2}
        unit=" UU"
        editable={true}
        onChange={(surfaceLiftUu) => updateSupersonicTrailConfig({ surfaceLiftUu })}
        isLight={isLight}
      />
    </div>
  );
};
