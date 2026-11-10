import React, { useState } from 'react';
import { Play, Shuffle, XCircle, Eye, Copy, Check, Sliders, Sparkles } from 'lucide-react';
import {
  formatNameTagDisplayText,
  resolveNameTagVariantParams,
  type NameTagTelemetrySnapshot,
} from '../../../config/nameTagConfig';
import {
  computeFittedParametersFromSamples,
  getNameTagTelemetrySnapshot,
  subscribeNameTagConfig,
  subscribeNameTagTelemetry,
  useNameTagTunerStore,
} from '../../../stores/nameTagTunerStore';
import { useAppStore } from '../../../stores/appStore';
import { useHudStore } from '../../../stores/hudStore';
import { Button } from '../../../primitives/Button';
import { SliderControl } from '../../../primitives/SliderControl';
import { ToggleSwitch } from '../../../primitives/ToggleSwitch';
import { KeycapBadge } from '../../../primitives/KeycapBadge';

export const CAR_SLOT_BADGES = [
  { index: 0, keyLabel: '1', slotCode: 'B1', colorHex: '#0ea5e9' },
  { index: 1, keyLabel: '2', slotCode: 'B2', colorHex: '#38bdf8' },
  { index: 2, keyLabel: '3', slotCode: 'B3', colorHex: '#2563eb' },
  { index: 3, keyLabel: '4', slotCode: 'O1', colorHex: '#f97316' },
  { index: 4, keyLabel: '5', slotCode: 'O2', colorHex: '#fb923c' },
  { index: 5, keyLabel: '6', slotCode: 'O3', colorHex: '#ea580c' },
];

export interface NameTagCalibrationSectionProps {
  isLight?: boolean;
}

export const NameTagCalibrationSection: React.FC<NameTagCalibrationSectionProps> = ({ isLight = false }) => {
  const {
    config,
    isTunerArenaActive,
    kickoffPermutationIndex,
    activeCameraMode,
    focusedCarIndex,
    selectedCalibrationCarIndex,
    updateConfig,
    selectCalibrationCar,
    updateCarOverride,
    resetCarOverride,
    resetAllCarOverrides,
    applyFittedFromCarOverrides,
    exportCalibrationJson,
    enterTunerArenaAndSpawnSixCars,
    exitTunerArena,
    reshuffleKickoffPositions,
    selectPovCar,
    focusFreeCamOverview,
  } = useNameTagTunerStore();

  const [telemetry, setTelemetry] = useState<NameTagTelemetrySnapshot>(() => getNameTagTelemetrySnapshot());
  const [copiedStatus, setCopiedStatus] = useState<'idle' | 'copied'>('idle');

  React.useEffect(() => {
    const refresh = () => setTelemetry({ ...getNameTagTelemetrySnapshot() });
    refresh();
    const unsubTel = subscribeNameTagTelemetry((snapshot) => setTelemetry({ ...snapshot }));
    const unsubCfg = subscribeNameTagConfig(refresh);
    return () => {
      unsubTel();
      unsubCfg();
    };
  }, []);

  const isFreeCamApp = useAppStore((s) => s.isFreeCam);
  const hudCameraMode = useHudStore((s) => s.cameraMode);
  const hudFocusedCarIndex = useHudStore((s) => s.focusedCarIndex);

  const effCamMode = isFreeCamApp ? 'free' : activeCameraMode || hudCameraMode || 'pov';
  const isPov = effCamMode === 'pov' || effCamMode === 'wasmPov' || effCamMode === 'rearView';
  const effFocusedIdx = isTunerArenaActive ? focusedCarIndex : hudFocusedCarIndex;
  const focusedSlotCode = CAR_SLOT_BADGES[effFocusedIdx]?.slotCode || `#${effFocusedIdx + 1}`;

  const isSingleChar = config.cardDisplayMode === 'single-char';
  const activeVariant = resolveNameTagVariantParams(config, isSingleChar);
  const calibIdx = Math.max(0, Math.min(5, selectedCalibrationCarIndex || 0));
  const calibSlot = CAR_SLOT_BADGES[calibIdx] || CAR_SLOT_BADGES[0];
  const carOverride = activeVariant.carOverrides?.[calibIdx] || {
    enabled: false,
    scaleMultiplier: 1.0,
    worldOffsetUu: activeVariant.verticalOffsetUu,
    screenOffsetPx: activeVariant.screenVerticalOffsetPx,
  };
  const carTel = telemetry.cars?.find((c) => c.carIndex === calibIdx) || null;
  const enabledOverrideCount = (activeVariant.carOverrides || []).filter((c) => c?.enabled).length;
  const fitted = computeFittedParametersFromSamples();

  const cardBg = isLight
    ? 'bg-neutral-50/95 border-neutral-200/90 text-neutral-800 shadow-2xs'
    : 'bg-neutral-850/60 border-neutral-700/60 text-neutral-200';
  const subCardBg = isLight ? 'bg-white border-neutral-200 text-neutral-800' : 'bg-neutral-950/40 border-neutral-700/50 text-neutral-200';
  const muted = isLight ? 'text-neutral-500' : 'text-neutral-400';
  const divider = isLight ? 'border-neutral-200' : 'border-neutral-700/40';
  const slotInactive = isLight
    ? 'bg-white hover:bg-neutral-100 border-neutral-200 text-neutral-700'
    : 'bg-neutral-900/70 hover:bg-neutral-800 border-neutral-700/70 text-neutral-300';

  const trunc = (rawName: string) => formatNameTagDisplayText(rawName, activeVariant.maxChars);

  const handleCopyCalibrationJson = async () => {
    const jsonText = exportCalibrationJson();
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) await navigator.clipboard.writeText(jsonText);
    } catch {
      // Ignore
    }
    setCopiedStatus('copied');
    window.setTimeout(() => setCopiedStatus('idle'), 2200);
  };

  return (
    <>
      <div className={`p-2.5 rounded-xl border flex flex-col gap-2 ${cardBg}`}>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className={`h-2 w-2 rounded-full shrink-0 ${isTunerArenaActive ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
            <span className="font-bold text-xs truncate">
              {isTunerArenaActive ? `6-Car Kickoff Arena Active (Formation #${kickoffPermutationIndex + 1})` : 'Stadium Evaluation Standby (Calibrated Preset)'}
            </span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <span className={`text-[10px] ${muted}`}>Enabled</span>
            <ToggleSwitch checked={config.enabled} onChange={(v) => updateConfig({ enabled: v })} isLight={isLight} />
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <Button
            variant="primary"
            size="sm"
            onClick={isTunerArenaActive ? focusFreeCamOverview : enterTunerArenaAndSpawnSixCars}
            isLight={isLight}
            className="flex-1 gap-1.5 py-1.5 text-[11px] font-semibold justify-center"
          >
            <Play className="h-3.5 w-3.5 fill-current" />
            <span>{isTunerArenaActive ? 'FreeCam Overview [0]' : 'Enter Arena & Spawn 6 Kickoff Cars'}</span>
          </Button>
          <Button variant="secondary" size="sm" onClick={reshuffleKickoffPositions} isLight={isLight} className="gap-1.5 px-2.5 py-1.5 text-[11px] font-semibold">
            <Shuffle className="h-3.5 w-3.5" />
            <span>Reshuffle Kickoff</span>
          </Button>
          {isTunerArenaActive && (
            <Button variant="secondary" size="sm" onClick={exitTunerArena} isLight={isLight} className="gap-1 px-2 py-1.5 text-[11px] font-semibold text-rose-500">
              <XCircle className="h-3.5 w-3.5" />
              <span>Exit</span>
            </Button>
          )}
        </div>

        <div className={`pt-1 border-t flex flex-col gap-1.5 ${divider}`}>
          <div className="flex items-center justify-between gap-2">
            <span className="font-bold text-[11px] flex items-center gap-1.5">
              <Eye className="h-3.5 w-3.5 text-amber-500" />
              <span>Camera Mode &amp; POV Switcher (Keys 1–6)</span>
            </span>
            <span
              className={`text-[10px] font-mono px-1.5 py-0.5 rounded border font-semibold ${
                isPov ? 'bg-amber-500/15 border-amber-500/40 text-amber-500' : 'bg-sky-500/15 border-sky-500/40 text-sky-500'
              }`}
            >
              {isPov ? `POV · ${focusedSlotCode} (${trunc(config.previewNames[effFocusedIdx] || '')})` : `CAMERA: ${effCamMode.toUpperCase()}`}
            </span>
          </div>

          <div className="grid grid-cols-6 gap-1">
            {CAR_SLOT_BADGES.map((slot) => {
              const isSelected = isTunerArenaActive && isPov && effFocusedIdx === slot.index;
              return (
                <button
                  key={slot.index}
                  type="button"
                  onClick={() => selectPovCar(slot.index)}
                  title={`Switch to ${slot.slotCode} POV (Key ${slot.keyLabel})`}
                  className={`px-1.5 py-1 rounded-lg border flex items-center justify-center gap-1 transition-all cursor-pointer ${
                    isSelected ? 'bg-amber-500/20 border-amber-400 text-amber-400 font-bold' : slotInactive
                  }`}
                >
                  <KeycapBadge label={slot.keyLabel} size="sm" isLight={isLight} />
                  <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: slot.colorHex }} />
                  <span className="text-[10px] font-mono">{slot.slotCode}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className={`p-2.5 rounded-xl border flex flex-col gap-2 ${cardBg}`}>
        <div className="flex items-center justify-between gap-2">
          <span className="font-bold text-[11px] flex items-center gap-1.5">
            <Sliders className="h-3.5 w-3.5 text-emerald-500" />
            <span>Per-Car Calibration ({isSingleChar ? 'Single-Char' : 'Standard Pill'})</span>
          </span>
          <div className="flex items-center gap-1.5">
            {enabledOverrideCount > 0 && (
              <button type="button" onClick={resetAllCarOverrides} className="text-[10px] font-mono hover:underline cursor-pointer text-rose-500">
                Clear All ({enabledOverrideCount})
              </button>
            )}
            <button
              type="button"
              onClick={handleCopyCalibrationJson}
              className={`px-2 py-0.5 rounded border text-[10px] font-mono font-bold flex items-center gap-1 cursor-pointer transition-colors ${
                copiedStatus === 'copied'
                  ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400'
                  : 'bg-sky-500/15 border-sky-500/40 text-sky-400 hover:bg-sky-500/25'
              }`}
            >
              {copiedStatus === 'copied' ? <><Check className="h-3 w-3" /><span>Copied JSON!</span></> : <><Copy className="h-3 w-3" /><span>Copy Calibration JSON</span></>}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-6 gap-1">
          {CAR_SLOT_BADGES.map((slot) => {
            const isTarget = calibIdx === slot.index;
            const hasOverride = Boolean(activeVariant.carOverrides?.[slot.index]?.enabled);
            const tel = telemetry.cars?.find((c) => c.carIndex === slot.index);
            return (
              <button
                key={slot.index}
                type="button"
                onClick={() => selectCalibrationCar(slot.index)}
                title={`Select ${slot.slotCode} for independent calibration`}
                className={`px-1 py-1 rounded-lg border flex flex-col items-center justify-center gap-0.5 transition-all cursor-pointer ${
                  isTarget ? 'bg-emerald-500/20 border-emerald-400 text-emerald-400 font-bold' : hasOverride ? 'bg-amber-500/15 border-amber-500/50 text-amber-400' : slotInactive
                }`}
              >
                <div className="flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ backgroundColor: slot.colorHex }} />
                  <span className="text-[10px] font-mono">{slot.slotCode}</span>
                  {hasOverride && <span className="h-1.5 w-1.5 rounded-full bg-amber-500 shrink-0" />}
                </div>
                <span className={`text-[9px] font-mono ${muted}`}>{tel ? `${Math.round(tel.activeDepthUu)}u` : slot.slotCode}</span>
              </button>
            );
          })}
        </div>

        <div className={`p-2 rounded-lg border flex flex-col gap-1.5 ${subCardBg}`}>
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: calibSlot.colorHex }} />
              <span className="font-mono font-bold text-[11px] truncate">
                Target: {calibSlot.slotCode} ({trunc(config.previewNames[calibIdx] || '')})
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {carOverride.enabled && (
                <button type="button" onClick={() => resetCarOverride(calibIdx)} className="text-[10px] font-mono hover:underline cursor-pointer text-amber-500">
                  Reset {calibSlot.slotCode}
                </button>
              )}
              <span className={`text-[10px] ${muted}`}>Override</span>
              <ToggleSwitch checked={carOverride.enabled} onChange={(v) => updateCarOverride(calibIdx, { enabled: v })} isLight={isLight} />
            </div>
          </div>

          {carTel ? (
            <div className="grid grid-cols-3 gap-1 text-[10px] font-mono p-1.5 rounded border border-neutral-700/50 bg-neutral-900/40">
              <div><span className={muted}>View-Z: </span><span className="font-semibold text-sky-400">{Math.round(carTel.viewZDepthUu)} UU</span></div>
              <div><span className={muted}>3D Dist: </span><span>{Math.round(carTel.euclideanDistanceUu)} UU</span></div>
              <div><span className={muted}>Angle: </span><span>{carTel.offAxisAngleDeg.toFixed(1)}°</span></div>
              <div><span className={muted}>Screen: </span><span className="font-semibold text-emerald-400">{carTel.screenPillWidthPx.toFixed(1)}×{carTel.screenPillHeightPx.toFixed(1)}px</span></div>
              <div><span className={muted}>Scale×: </span><span>{carTel.effectiveScaleMultiplier.toFixed(2)}x</span></div>
              <div><span className={muted}>Total Y: </span><span>{Math.round(carTel.totalWorldVerticalOffsetUu)} UU</span></div>
            </div>
          ) : (
            <div className={`text-[10px] font-mono ${muted}`}>Enter the 6-Car Arena to stream live distance, depth, and screen pixel telemetry.</div>
          )}

          <SliderControl
            label={`${calibSlot.slotCode} Scale Multiplier`}
            value={carOverride.scaleMultiplier}
            min={0.2}
            max={3.0}
            step={0.01}
            unit="x"
            onChange={(v) => updateCarOverride(calibIdx, { enabled: true, scaleMultiplier: v })}
            isLight={isLight}
          />
          <SliderControl
            label={`${calibSlot.slotCode} 3D World Offset (Car Relative)`}
            value={carOverride.worldOffsetUu}
            min={0}
            max={360}
            step={2}
            unit="UU"
            onChange={(v) => updateCarOverride(calibIdx, { enabled: true, worldOffsetUu: v })}
            isLight={isLight}
          />
          <SliderControl
            label={`${calibSlot.slotCode} 2D Screen Offset (Viewport Relative)`}
            value={carOverride.screenOffsetPx}
            min={-60}
            max={160}
            step={1}
            unit="px"
            onChange={(v) => updateCarOverride(calibIdx, { enabled: true, screenOffsetPx: v })}
            isLight={isLight}
          />

          <div className={`flex items-center justify-between gap-2 pt-1 border-t ${divider}`}>
            <span className={`text-[10px] font-mono ${muted} truncate`}>
              Fit: Scale {fitted.cameraScaleFactor} · γ={fitted.distanceScaleExponent} · World {fitted.verticalOffsetUu}UU · Screen {fitted.screenVerticalOffsetPx}px
            </span>
            <button
              type="button"
              onClick={applyFittedFromCarOverrides}
              className="px-2 py-0.5 rounded border text-[10px] font-mono font-semibold flex items-center gap-1 shrink-0 cursor-pointer border-amber-500/40 bg-amber-500/15 hover:bg-amber-500/25 text-amber-400"
            >
              <Sparkles className="h-3 w-3" />
              <span>Apply Fit</span>
            </button>
          </div>
        </div>
      </div>
    </>
  );
};
