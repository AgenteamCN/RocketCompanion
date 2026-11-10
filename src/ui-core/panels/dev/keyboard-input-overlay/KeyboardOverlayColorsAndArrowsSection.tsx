import React from 'react';
import { Compass, Palette } from 'lucide-react';
import { TunerColorRow } from '../../../compounds/TunerControls';
import { SliderControl } from '../../../primitives/SliderControl';
import { ToggleSwitch } from '../../../primitives/ToggleSwitch';
import { useKeyboardInputOverlayStore } from '../../../stores/keyboardInputOverlayStore';

export interface KeyboardOverlayColorsAndArrowsSectionProps {
  isLight?: boolean;
}

export const KeyboardOverlayColorsAndArrowsSection: React.FC<
  KeyboardOverlayColorsAndArrowsSectionProps
> = ({ isLight = false }) => {
  const {
    wIdleBgColor,
    wPressedBgColor,
    aIdleBgColor,
    aPressedBgColor,
    sIdleBgColor,
    sPressedBgColor,
    dIdleBgColor,
    dPressedBgColor,
    actionIdleBgDark,
    actionPressedBgDark,
    actionIconColorDark,
    actionIdleBgLight,
    actionPressedBgLight,
    actionIconColorLight,
    overlayArrowFollowsCarAttitude,
    overlayArrowRotationOffsetDeg,
    overlayArrowScale,
    overlayArrowExtrudeDepth,
    overlayArrowShadowIntensity,
    overlayArrowUseDistinctColors,
    overlayArrowUnifiedColor,
    wArrowColor,
    aArrowColor,
    sArrowColor,
    dArrowColor,
    updateConfig,
  } = useKeyboardInputOverlayStore();

  const cardBg = isLight
    ? 'bg-neutral-100/80 border-neutral-200 text-neutral-900'
    : 'bg-neutral-900/70 border-neutral-800 text-neutral-100';

  return (
    <div className="flex flex-col gap-2.5">
      {/* 3. WASD 3D Extruded Arrow Attitude & Shading */}
      <div className={`flex flex-col gap-2 p-2.5 rounded-xl border ${cardBg}`}>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <Compass className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
            <span className="text-[11px] font-bold uppercase tracking-wider">
              3. WASD 3D Beveled Arrow Attitude &amp; Depth
            </span>
          </div>
          <span className="text-[10px] font-mono opacity-60">Car Camera Style</span>
        </div>

        <div className="flex items-center justify-between gap-2">
          <div className="flex flex-col leading-tight min-w-0 pr-2">
            <span className="text-[11px] font-semibold">
              Dynamic Camera-Space Car Attitude Tracking
            </span>
            <span className="text-[10px] text-neutral-400">
              W=Nose→Bottom · S=Nose→Top · A=Nose→Left · D=Nose→Right in current camera view
            </span>
          </div>
          <ToggleSwitch
            checked={overlayArrowFollowsCarAttitude}
            onCheckedChange={(checked) =>
              updateConfig({ overlayArrowFollowsCarAttitude: checked })
            }
            isLight={isLight}
          />
        </div>

        <SliderControl
          editable={true}
          allowOutOfBoundsInput={true}
          showStepper={false}
          colorScheme="sky"
          label="Arrow Orientation Offset Angle"
          unit="deg"
          value={overlayArrowRotationOffsetDeg}
          min={-180}
          max={180}
          step={1}
          isLight={isLight}
          onChange={(v) => updateConfig({ overlayArrowRotationOffsetDeg: v })}
        />

        <SliderControl
          editable={true}
          allowOutOfBoundsInput={true}
          showStepper={false}
          colorScheme="sky"
          label="Arrow Keycap Scale"
          unit="x"
          value={overlayArrowScale}
          min={0.35}
          max={1.35}
          step={0.02}
          isLight={isLight}
          onChange={(v) => updateConfig({ overlayArrowScale: v })}
        />

        <SliderControl
          editable={true}
          allowOutOfBoundsInput={true}
          showStepper={false}
          colorScheme="amber"
          label="3D Extrusion Depth (Bevel Thickness)"
          unit="px"
          value={overlayArrowExtrudeDepth}
          min={0}
          max={8}
          step={0.2}
          isLight={isLight}
          onChange={(v) => updateConfig({ overlayArrowExtrudeDepth: v })}
        />

        <SliderControl
          editable={true}
          allowOutOfBoundsInput={true}
          showStepper={false}
          colorScheme="amber"
          label="3D Shadow &amp; Specular Relief Intensity"
          unit=""
          value={overlayArrowShadowIntensity}
          min={0}
          max={1}
          step={0.02}
          isLight={isLight}
          onChange={(v) => updateConfig({ overlayArrowShadowIntensity: v })}
        />

        <div className="flex items-center justify-between gap-2 pt-0.5">
          <span className="text-[11px] font-semibold">
            Distinct Per-Key Arrow Face Colors (W/A/S/D)
          </span>
          <ToggleSwitch
            checked={overlayArrowUseDistinctColors}
            onCheckedChange={(checked) =>
              updateConfig({ overlayArrowUseDistinctColors: checked })
            }
            isLight={isLight}
          />
        </div>

        {!overlayArrowUseDistinctColors ? (
          <TunerColorRow
            label="Unified WASD Arrow Face Color"
            value={overlayArrowUnifiedColor}
            onChange={(hex) => updateConfig({ overlayArrowUnifiedColor: hex })}
            isLight={isLight}
          />
        ) : (
          <div className="grid grid-cols-1 gap-1.5">
            <TunerColorRow
              label="W Arrow Face Color (Nose → Bottom)"
              value={wArrowColor}
              onChange={(hex) => updateConfig({ wArrowColor: hex })}
              isLight={isLight}
            />
            <TunerColorRow
              label="A Arrow Face Color (Nose → Left)"
              value={aArrowColor}
              onChange={(hex) => updateConfig({ aArrowColor: hex })}
              isLight={isLight}
            />
            <TunerColorRow
              label="S Arrow Face Color (Nose → Top)"
              value={sArrowColor}
              onChange={(hex) => updateConfig({ sArrowColor: hex })}
              isLight={isLight}
            />
            <TunerColorRow
              label="D Arrow Face Color (Nose → Right)"
              value={dArrowColor}
              onChange={(hex) => updateConfig({ dArrowColor: hex })}
              isLight={isLight}
            />
          </div>
        )}
      </div>

      {/* 4. WASD 4-Way Distinct Background Colors (Idle & Pressed) */}
      <div className={`flex flex-col gap-2 p-2.5 rounded-xl border ${cardBg}`}>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <Palette className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span className="text-[11px] font-bold uppercase tracking-wider">
              4. WASD 4-Way Differentiated Keycap Colors
            </span>
          </div>
          <span className="text-[10px] font-mono opacity-60">Idle &amp; Pressed</span>
        </div>

        <div className="grid grid-cols-1 gap-1.5">
          <TunerColorRow
            label="W Key Idle Background (Pitch Down / Throttle)"
            value={wIdleBgColor}
            onChange={(hex) => updateConfig({ wIdleBgColor: hex })}
            isLight={isLight}
          />
          <TunerColorRow
            label="W Key Pressed Background"
            value={wPressedBgColor}
            onChange={(hex) => updateConfig({ wPressedBgColor: hex })}
            isLight={isLight}
          />
          <TunerColorRow
            label="A Key Idle Background (Yaw / Steer Left)"
            value={aIdleBgColor}
            onChange={(hex) => updateConfig({ aIdleBgColor: hex })}
            isLight={isLight}
          />
          <TunerColorRow
            label="A Key Pressed Background"
            value={aPressedBgColor}
            onChange={(hex) => updateConfig({ aPressedBgColor: hex })}
            isLight={isLight}
          />
          <TunerColorRow
            label="S Key Idle Background (Pitch Up / Reverse)"
            value={sIdleBgColor}
            onChange={(hex) => updateConfig({ sIdleBgColor: hex })}
            isLight={isLight}
          />
          <TunerColorRow
            label="S Key Pressed Background"
            value={sPressedBgColor}
            onChange={(hex) => updateConfig({ sPressedBgColor: hex })}
            isLight={isLight}
          />
          <TunerColorRow
            label="D Key Idle Background (Yaw / Steer Right)"
            value={dIdleBgColor}
            onChange={(hex) => updateConfig({ dIdleBgColor: hex })}
            isLight={isLight}
          />
          <TunerColorRow
            label="D Key Pressed Background"
            value={dPressedBgColor}
            onChange={(hex) => updateConfig({ dPressedBgColor: hex })}
            isLight={isLight}
          />
        </div>
      </div>

      {/* 5. Action Keys (Q, E, Slide, Boost, Jump) Unified Dark & Light Palette */}
      <div className={`flex flex-col gap-2 p-2.5 rounded-xl border ${cardBg}`}>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <Palette className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span className="text-[11px] font-bold uppercase tracking-wider">
              5. Action Keys Unified Palette (Q / E / Slide / Boost / Jump)
            </span>
          </div>
          <span className="text-[10px] font-mono opacity-60">
            {isLight ? 'Light Active' : 'Dark Active'}
          </span>
        </div>

        <div className="grid grid-cols-1 gap-1.5">
          <TunerColorRow
            label="Dark Mode Action Key Idle Background"
            value={actionIdleBgDark}
            onChange={(hex) => updateConfig({ actionIdleBgDark: hex })}
            isLight={isLight}
          />
          <TunerColorRow
            label="Dark Mode Action Key Pressed Background"
            value={actionPressedBgDark}
            onChange={(hex) => updateConfig({ actionPressedBgDark: hex })}
            isLight={isLight}
          />
          <TunerColorRow
            label="Dark Mode Action Icon Stroke Color"
            value={actionIconColorDark}
            onChange={(hex) => updateConfig({ actionIconColorDark: hex })}
            isLight={isLight}
          />
          <TunerColorRow
            label="Light Mode Action Key Idle Background"
            value={actionIdleBgLight}
            onChange={(hex) => updateConfig({ actionIdleBgLight: hex })}
            isLight={isLight}
          />
          <TunerColorRow
            label="Light Mode Action Key Pressed Background"
            value={actionPressedBgLight}
            onChange={(hex) => updateConfig({ actionPressedBgLight: hex })}
            isLight={isLight}
          />
          <TunerColorRow
            label="Light Mode Action Icon Stroke Color"
            value={actionIconColorLight}
            onChange={(hex) => updateConfig({ actionIconColorLight: hex })}
            isLight={isLight}
          />
        </div>
      </div>
    </div>
  );
};

KeyboardOverlayColorsAndArrowsSection.displayName =
  'KeyboardOverlayColorsAndArrowsSection';
export default KeyboardOverlayColorsAndArrowsSection;
