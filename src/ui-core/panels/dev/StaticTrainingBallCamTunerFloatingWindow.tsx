import React, { useState, useEffect } from 'react';
import {
  Camera,
  Compass,
  Eye,
  Download,
  Copy,
  Check,
  RotateCcw,
  ArrowLeftRight,
} from 'lucide-react';
import {
  useStaticTrainingBallCamTunerStore,
  DEFAULT_STATIC_TRAINING_BALL_CAM_TUNER_CONFIG,
} from '../../stores/staticTrainingBallCamTunerStore';
import { useStaticTrainingPackStore } from '../../stores/staticTrainingPackStore';
import {
  ballVisualRuntimeConfig,
  setTemporaryBallOpacityOverride,
} from '../../config/ballVisualConfig';
import { SliderControl } from '../../primitives/SliderControl';
import { DirectionArrowVisualsSection } from './static-training-ball-cam-tuner/DirectionArrowVisualsSection';
import type { StandardSurfaceProps, SurfaceMeta } from '../../manifest/surfaceMetaTypes';

export const SURFACE_META: SurfaceMeta = {
  id: 'static-training-ball-cam-tuner',
  title: 'Static Training Ball Camera & Opacity Tuner',
  layer: 'floating-dev',
  menuGroup: 'active-tuners',
  defaultSizing: {
    width: 460,
    height: 580,
    minHeight: 200,
    mode: 'adaptive',
  },
  variants: [
    { variantId: 'arrow', label: '1. Direction Arrow & Expire' },
    { variantId: 'ballcam', label: '2. Ball Cam & Edit Opacity' },
  ],
};

export interface StaticTrainingBallCamTunerFloatingWindowProps extends StandardSurfaceProps {
  active?: boolean;
}

export const StaticTrainingBallCamTunerFloatingWindow: React.FC<
  StaticTrainingBallCamTunerFloatingWindowProps
> = ({ isLight = false, active = true, activeTab: controlledTab, onTabChange }) => {
  const store = useStaticTrainingBallCamTunerStore();
  const {
    fov,
    distance,
    height,
    angle,
    lateralOffset,
    editBallOpacity,
    enableEditOpacityOverride,
    updateConfig,
    switchLateralSide,
    resetDefaults,
  } = store;

  const sessionMode = useStaticTrainingPackStore((s) => s.sessionMode);
  const isTestingSingleShot = useStaticTrainingPackStore((s) => s.isTestingSingleShot);
  const editSubMode = useStaticTrainingPackStore((s) => s.editSubMode);
  const setEditSubMode = useStaticTrainingPackStore((s) => s.setEditSubMode);

  const [localTab, setLocalTab] = useState<'arrow' | 'ballcam'>('arrow');
  const activeTab: 'arrow' | 'ballcam' =
    controlledTab === 'arrow' || controlledTab === 'ballcam' ? controlledTab : localTab;
  const handleSelectTab = (tab: 'arrow' | 'ballcam') => {
    setLocalTab(tab);
    onTabChange?.(tab);
  };
  const [copied, setCopied] = useState(false);

  const isInEditModeUntested = sessionMode === 'edit' && !isTestingSingleShot;
  const globalOpacity = Number(ballVisualRuntimeConfig.opacity ?? 0.7);
  const globalModeLabel =
    Math.abs(globalOpacity - 0.7) < 0.005
      ? '70%'
      : Math.abs(globalOpacity - 1.0) < 0.005
        ? '100%'
        : `Custom (${Math.round(globalOpacity * 100)}%)`;

  useEffect(() => {
    setTemporaryBallOpacityOverride(
      isInEditModeUntested && enableEditOpacityOverride ? editBallOpacity : null
    );
  }, [isInEditModeUntested, enableEditOpacityOverride, editBallOpacity]);

  if (!active) return null;

  const buildExportJson = () =>
    JSON.stringify(
      {
        directionArrow3D: {
          arrowOpacity: store.arrowOpacity,
          shadowOpacity: store.shadowOpacity,
          shadowScale: store.shadowScale,
          haloScale: store.haloScale,
          coneRadius: store.coneRadius,
          coneLength: store.coneLength,
          tipRadius: store.tipRadius,
          shaftRadius: store.shaftRadius,
          arrowBaseLength: store.arrowBaseLength,
          arrowMaxExtraLength: store.arrowMaxExtraLength,
          arrowHeightOffset: store.arrowHeightOffset,
          arrowForwardOffset: store.arrowForwardOffset,
        },
        expiredBallOpacity: store.expiredBallOpacity,
        relativeBallCamera: { fov, distance, height, angle, lateralOffset },
        editModeBallOpacity: {
          defaultOpacity: editBallOpacity,
          temporaryOverrideEnabled: enableEditOpacityOverride,
        },
      },
      null,
      2
    );

  const handleCopyJson = () => {
    navigator?.clipboard?.writeText?.(buildExportJson()).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const handleDownloadJson = () => {
    const blob = new Blob([buildExportJson()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'static-training-visuals-tuner-config.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const inactiveTabTone = isLight
    ? 'bg-neutral-100 border-neutral-200 text-neutral-600 hover:bg-neutral-200'
    : 'bg-neutral-900 border-neutral-800 text-neutral-400 hover:bg-neutral-800';

  const cardBg = isLight
    ? 'bg-neutral-100/80 border-neutral-200'
    : 'bg-neutral-900/70 border-neutral-800';

  return (
    <div
      data-ui-interactive="true"
      className="flex flex-col gap-3 text-xs select-none"
    >
      <div className="grid grid-cols-2 gap-1.5">
        {(
          [
            {
              id: 'arrow',
              label: '1. Direction Arrow & Expire',
              Icon: Compass,
              activeTone: isLight
                ? 'bg-cyan-600 border-cyan-700 text-white shadow-xs'
                : 'bg-cyan-500/20 border-cyan-400 text-cyan-300 shadow-xs',
            },
            {
              id: 'ballcam',
              label: '2. Ball Cam & Edit Opacity',
              Icon: Camera,
              activeTone: isLight
                ? 'bg-amber-500 border-amber-600 text-white shadow-xs'
                : 'bg-amber-500/20 border-amber-400 text-amber-300 shadow-xs',
            },
          ] as const
        ).map(({ id, label, Icon, activeTone }) => (
          <button
            key={id}
            type="button"
            onClick={() => handleSelectTab(id)}
            className={`flex items-center justify-center gap-1.5 py-1.5 px-2.5 rounded-lg border font-bold text-[11px] transition-all cursor-pointer ${
              activeTab === id ? activeTone : inactiveTabTone
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
            <span>{label}</span>
          </button>
        ))}
      </div>

      {activeTab === 'arrow' ? (
        <DirectionArrowVisualsSection isLight={isLight} />
      ) : (
        <>
          <div className={`flex items-center justify-between gap-2 px-2.5 py-2 rounded-xl border ${cardBg}`}>
            <div className="flex items-center gap-2 min-w-0">
              <Camera className="w-4 h-4 text-sky-400 shrink-0" />
              <div className="flex flex-col leading-snug truncate">
                <span className="font-semibold text-[11px] truncate">
                  Relative Ball Camera (Ball Speed Sub-Mode)
                </span>
                <span className="text-[10px] text-neutral-400 truncate">
                  Unbounded text input + Enter · [F] Switch Side · Default FOV 110 deg
                </span>
              </div>
            </div>

            {sessionMode === 'edit' && editSubMode !== 'ball-speed' && (
              <button
                type="button"
                onClick={() => setEditSubMode('ball-speed')}
                className="px-2 py-1 rounded-md text-[10px] font-semibold bg-sky-500/20 border border-sky-500/40 text-sky-300 hover:bg-sky-500/30 transition-colors shrink-0"
              >
                Focus Ball Cam
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 gap-2">
            {(
              [
                { key: 'fov', label: 'Field of View (FOV)', unit: 'deg', value: fov, min: 60, max: 140, step: 1, color: 'sky' },
                { key: 'distance', label: 'Distance', unit: 'UU', value: distance, min: 50, max: 1200, step: 5, color: 'amber' },
                { key: 'height', label: 'Height Offset', unit: 'UU', value: height, min: -200, max: 800, step: 5, color: 'amber' },
                { key: 'angle', label: 'Pitch Angle Offset', unit: 'deg', value: angle, min: -90, max: 90, step: 0.5, color: 'amber' },
              ] as const
            ).map((item) => (
              <SliderControl
                key={item.key}
                editable={true}
                allowOutOfBoundsInput={true}
                showStepper={false}
                colorScheme={item.color}
                label={item.label}
                unit={item.unit}
                value={item.value}
                min={item.min}
                max={item.max}
                step={item.step}
                isLight={isLight}
                onChange={(v) => updateConfig({ [item.key]: v })}
              />
            ))}

            <SliderControl
              editable={true}
              allowOutOfBoundsInput={true}
              showStepper={false}
              colorScheme="amber"
              label="Lateral Offset"
              unit="UU"
              value={lateralOffset}
              min={-400}
              max={400}
              step={5}
              isLight={isLight}
              extraAction={
                <button
                  type="button"
                  onClick={switchLateralSide}
                  title="Switch lateral offset side (Hotkey: F)"
                  className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold border transition-colors ${
                    isLight
                      ? 'bg-neutral-100 border-neutral-300 text-neutral-700 hover:bg-neutral-200'
                      : 'bg-neutral-800 border-neutral-700 text-sky-300 hover:bg-neutral-700'
                  }`}
                >
                  <ArrowLeftRight className="w-2.5 h-2.5" />
                  <span>[F] Switch Side</span>
                </button>
              }
              onChange={(v) => updateConfig({ lateralOffset: v })}
            />
          </div>

          <div className={`flex flex-col gap-2 p-2.5 rounded-xl border ${cardBg}`}>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <Eye className="w-4 h-4 text-amber-400 shrink-0" />
                <div className="flex flex-col leading-tight">
                  <span className={`text-[11px] font-semibold ${isLight ? 'text-neutral-800' : 'text-neutral-100'}`}>
                    Edit-Mode Ball Opacity (Temporary Override)
                  </span>
                  <span className="text-[10px] text-neutral-400">
                    Reverts to Follow Global ({globalModeLabel}) when testing [G] or playing
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => updateConfig({ enableEditOpacityOverride: !enableEditOpacityOverride })}
                className={`px-2 py-1 rounded-md text-[10px] font-mono font-semibold border transition-colors shrink-0 ${
                  enableEditOpacityOverride
                    ? 'bg-amber-500/20 border-amber-500/50 text-amber-300'
                    : 'bg-neutral-800 border-neutral-700 text-neutral-400'
                }`}
              >
                {enableEditOpacityOverride ? 'Override ON' : 'Follow Global'}
              </button>
            </div>

            <SliderControl
              editable={true}
              allowOutOfBoundsInput={true}
              showStepper={false}
              colorScheme="amber"
              label="Edit Mode Ball Opacity"
              unit=""
              value={editBallOpacity}
              min={0.05}
              max={1.0}
              step={0.05}
              disabled={!enableEditOpacityOverride}
              isLight={isLight}
              onChange={(v) => updateConfig({ editBallOpacity: v })}
            />

            <div className="flex items-center justify-between text-[10px] font-mono px-1 text-neutral-400">
              <span>
                Status:{' '}
                <strong className={isInEditModeUntested && enableEditOpacityOverride ? 'text-amber-400' : 'text-emerald-400'}>
                  {isInEditModeUntested && enableEditOpacityOverride
                    ? `Edit Override (${Math.round(editBallOpacity * 100)}%)`
                    : `Following Global (${globalModeLabel})`}
                </strong>
              </span>
              <span>
                Default: {DEFAULT_STATIC_TRAINING_BALL_CAM_TUNER_CONFIG.editBallOpacity.toFixed(2)}
              </span>
            </div>
          </div>
        </>
      )}

      <div className="flex items-center justify-between gap-2 pt-1">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={handleDownloadJson}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium border transition-colors ${
              isLight
                ? 'bg-sky-50 border-sky-200 text-sky-700 hover:bg-sky-100'
                : 'bg-sky-500/15 border-sky-500/35 text-sky-300 hover:bg-sky-500/25'
            }`}
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export JSON</span>
          </button>

          <button
            type="button"
            onClick={handleCopyJson}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium border transition-colors ${
              isLight
                ? 'bg-neutral-100 border-neutral-300 text-neutral-700 hover:bg-neutral-200'
                : 'bg-neutral-800 border-neutral-700 text-neutral-200 hover:bg-neutral-700'
            }`}
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-emerald-400">Copied</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>Copy JSON</span>
              </>
            )}
          </button>
        </div>

        <button
          type="button"
          onClick={resetDefaults}
          className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium border transition-colors ${
            isLight
              ? 'bg-neutral-100 border-neutral-300 text-neutral-600 hover:bg-neutral-200'
              : 'bg-neutral-900 border-neutral-700 text-neutral-400 hover:text-neutral-200 hover:border-neutral-600'
          }`}
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>Reset</span>
        </button>
      </div>
    </div>
  );
};

export default StaticTrainingBallCamTunerFloatingWindow;
