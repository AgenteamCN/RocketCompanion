import React, { useState, useEffect } from 'react';
import { Download, Copy, Check, RotateCcw, Layers } from 'lucide-react';
import { SliderControl } from '../../../primitives/SliderControl';
import { ToggleSwitch } from '../../../primitives/ToggleSwitch';
import { AUDIO_ATTENUATION_CATEGORIES } from '../../../config/spatialAttenuationPresets';
import {
  spatialAttenuationProfiles,
  type AttenuationArchetypeId,
  type AttenuationCurveType,
  type AudioAttenuationCategory,
  type SpatialAttenuationProfile,
  type SpatialAttenuationProfileMap,
} from '../../../config/spatialAttenuationProfiles';
import {
  getSpatialAudioVisualizerConfig,
  getSpatialAudioVisualizerTelemetry,
  subscribeSpatialAudioVisualizerConfig,
  subscribeSpatialAudioVisualizerTelemetry,
  updateSpatialAudioVisualizerConfig,
  type SpatialAudioVisualizerConfig,
  type SpatialAudioVisualizerTelemetry,
} from '../../../config/spatialAudioVisualizerConfig';
import { SpatialAudio3dGizmoControlCard } from './SpatialAudio3dGizmoControlCard';
import { DistanceAttenuationCurveCanvas } from './DistanceAttenuationCurveCanvas';

export interface DistanceAttenuationTunerTabProps {
  isLight: boolean;
}

const ARCHETYPE_LABELS: Record<AttenuationArchetypeId, string> = {
  tactical_global: '1. Tactical Global',
  primary_gameplay: '2. Primary Gameplay',
  opponent_action: '3. Opponent Boost/Action',
  opponent_engine: '4. Opponent Engine',
  world_surface_pads: '5. World Surface & Pads',
  ball_continuous: '6. Ball Loops',
};

const CURVE_TYPES: { id: AttenuationCurveType; label: string }[] = [
  { id: 'power', label: 'Power ((1-t)^p)' },
  { id: 'smoothstep', label: 'Smoothstep (Hermite)' },
  { id: 'linear', label: 'Linear (1-t)' },
  { id: 'custom-bezier', label: 'Cubic-Bezier' },
  { id: 'inverse', label: 'Inverse Hyperbolic' },
];

const BEZIER_FIELDS: ReadonlyArray<{
  key: 'x1' | 'y1' | 'x2' | 'y2';
  label: string;
  min: number;
  max: number;
}> = [
  { key: 'x1', label: 'Bezier P1.x', min: 0.01, max: 0.99 },
  { key: 'y1', label: 'Bezier P1.y', min: 0.0, max: 1.0 },
  { key: 'x2', label: 'Bezier P2.x', min: 0.01, max: 0.99 },
  { key: 'y2', label: 'Bezier P2.y', min: 0.0, max: 1.0 },
];

export const DistanceAttenuationTunerTab: React.FC<
  DistanceAttenuationTunerTabProps
> = ({ isLight }) => {
  const [profiles, setProfiles] = useState<SpatialAttenuationProfileMap>(() => ({
    ...spatialAttenuationProfiles.profiles,
  }));
  const [vizConfig, setVizConfig] = useState<SpatialAudioVisualizerConfig>(() =>
    getSpatialAudioVisualizerConfig()
  );
  const [telemetry, setTelemetry] = useState<SpatialAudioVisualizerTelemetry>(() =>
    getSpatialAudioVisualizerTelemetry()
  );
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const unsubProfiles = spatialAttenuationProfiles.subscribe((next) => setProfiles({ ...next }));
    const unsubViz = subscribeSpatialAudioVisualizerConfig(setVizConfig);
    const unsubTelemetry = subscribeSpatialAudioVisualizerTelemetry(setTelemetry);
    return () => {
      unsubProfiles();
      unsubViz();
      unsubTelemetry();
    };
  }, []);

  const activeCategory: AudioAttenuationCategory = vizConfig.activeCategory || 'boost_other';
  const activeProfile: SpatialAttenuationProfile =
    profiles[activeCategory] || spatialAttenuationProfiles.getProfile(activeCategory);

  const handleUpdateProfile = (patch: Partial<SpatialAttenuationProfile>) => {
    spatialAttenuationProfiles.updateProfile(activeCategory, patch);
  };

  const handleCopyAllJson = () => {
    const json = spatialAttenuationProfiles.exportJson();
    navigator?.clipboard?.writeText?.(json).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const handleDownloadAllJson = () => {
    const json = spatialAttenuationProfiles.exportJson();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'spatial-attenuation-profiles.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const isPower =
    activeProfile.curveType === 'power' || activeProfile.curveType === 'exponential';
  const isBezier =
    activeProfile.curveType === 'custom-bezier' || activeProfile.curveType === 'bezier';

  const cardBg = isLight
    ? 'bg-neutral-100/80 border-neutral-200'
    : 'bg-neutral-900/75 border-neutral-800';
  const resetBtnClass = `flex items-center gap-1 px-2 py-1.5 rounded-lg text-[11px] font-medium border transition-colors cursor-pointer ${
    isLight
      ? 'bg-neutral-100 border-neutral-300 text-neutral-600 hover:bg-neutral-200'
      : 'bg-neutral-900 border-neutral-700 text-neutral-400 hover:text-neutral-200'
  }`;

  return (
    <div className="flex flex-col gap-2.5 text-xs select-none">
      {/* 1. 3D Arena Visualizer & Anchor Controls */}
      <SpatialAudio3dGizmoControlCard
        isLight={isLight}
        vizConfig={vizConfig}
        telemetry={telemetry}
        onUpdateVizConfig={updateSpatialAudioVisualizerConfig}
      />

      {/* 2. Acoustic Category Selector */}
      <div className={`flex flex-col gap-1.5 p-2.5 rounded-xl border ${cardBg}`}>
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5 text-amber-400" />
            <span>Tactical Attenuation Category ({AUDIO_ATTENUATION_CATEGORIES.length})</span>
          </span>
          <span className="text-[10px] font-mono text-amber-400">
            {ARCHETYPE_LABELS[activeProfile.archetype]}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-1 max-h-32 overflow-y-auto pr-0.5">
          {AUDIO_ATTENUATION_CATEGORIES.map((cat) => {
            const prof = profiles[cat];
            const isSelected = cat === activeCategory;
            return (
              <button
                key={cat}
                type="button"
                onClick={() => updateSpatialAudioVisualizerConfig({ activeCategory: cat })}
                className={`flex items-center justify-between px-2 py-1 rounded-lg text-[10px] border transition-colors cursor-pointer ${
                  isSelected
                    ? 'bg-amber-500/20 border-amber-500/60 text-amber-300 font-semibold'
                    : isLight
                      ? 'bg-white border-neutral-200 text-neutral-700 hover:bg-neutral-100'
                      : 'bg-neutral-950 border-neutral-800/90 text-neutral-300 hover:border-neutral-700'
                }`}
              >
                <span className="truncate">{prof.label}</span>
                <span className="font-mono text-[9px] opacity-75 shrink-0 ml-1">
                  {prof.minDistanceUU}-{prof.maxDistanceUU}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 3. Interactive SVG Rolloff Curve & Live Arena Operating Point */}
      <DistanceAttenuationCurveCanvas
        isLight={isLight}
        profile={activeProfile}
        telemetry={telemetry}
        onUpdateProfile={handleUpdateProfile}
      />

      {/* 4. Curve Mathematical Model & Radius Parameters */}
      <div className={`flex flex-col gap-2 p-2.5 rounded-xl border ${cardBg}`}>
        <div className="grid grid-cols-5 gap-1">
          {CURVE_TYPES.map((ct) => {
            const selected =
              activeProfile.curveType === ct.id ||
              (ct.id === 'power' && activeProfile.curveType === 'exponential') ||
              (ct.id === 'custom-bezier' && activeProfile.curveType === 'bezier');
            return (
              <button
                key={ct.id}
                type="button"
                onClick={() => handleUpdateProfile({ curveType: ct.id })}
                className={`px-1.5 py-1 rounded text-[10px] font-medium border transition-colors cursor-pointer truncate ${
                  selected
                    ? 'bg-sky-500/20 border-sky-500/60 text-sky-300 font-semibold'
                    : isLight
                      ? 'bg-white border-neutral-200 text-neutral-600 hover:bg-neutral-100'
                      : 'bg-neutral-950 border-neutral-800 text-neutral-400 hover:text-neutral-200'
                }`}
              >
                {ct.label}
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <SliderControl
            editable={true}
            allowOutOfBoundsInput={true}
            showStepper={false}
            colorScheme="amber"
            label="Inner Radius R_min (100%)"
            unit="UU"
            value={activeProfile.minDistanceUU}
            min={0}
            max={3000}
            step={25}
            isLight={isLight}
            onChange={(minDistanceUU) => handleUpdateProfile({ minDistanceUU })}
          />
          <SliderControl
            editable={true}
            allowOutOfBoundsInput={true}
            showStepper={false}
            colorScheme="amber"
            label="Outer Cutoff R_max"
            unit="UU"
            value={activeProfile.maxDistanceUU}
            min={500}
            max={16000}
            step={100}
            isLight={isLight}
            onChange={(maxDistanceUU) => handleUpdateProfile({ maxDistanceUU })}
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <SliderControl
            editable={true}
            allowOutOfBoundsInput={false}
            showStepper={false}
            colorScheme="amber"
            label="Far-Field Floor (G_min)"
            unit=""
            value={activeProfile.minGainFloor}
            min={0.0}
            max={0.6}
            step={0.01}
            isLight={isLight}
            onChange={(minGainFloor) => handleUpdateProfile({ minGainFloor })}
          />
          {isPower ? (
            <SliderControl
              editable={true}
              allowOutOfBoundsInput={false}
              showStepper={false}
              colorScheme="amber"
              label="Power Exponent p (<1 slow, >1 fast)"
              unit=""
              value={activeProfile.curveExponent}
              min={0.25}
              max={4.0}
              step={0.05}
              isLight={isLight}
              onChange={(curveExponent) => handleUpdateProfile({ curveExponent })}
            />
          ) : (
            <SliderControl
              editable={true}
              allowOutOfBoundsInput={false}
              showStepper={false}
              colorScheme="amber"
              label="Inner Core Stereo Spread"
              unit=""
              value={activeProfile.innerSpread}
              min={0.0}
              max={1.0}
              step={0.05}
              isLight={isLight}
              onChange={(innerSpread) => handleUpdateProfile({ innerSpread })}
            />
          )}
        </div>

        {isBezier && (
          <div className="grid grid-cols-2 gap-2">
            {BEZIER_FIELDS.map((bf) => (
              <SliderControl
                key={bf.key}
                editable={true}
                allowOutOfBoundsInput={false}
                showStepper={false}
                colorScheme="amber"
                label={bf.label}
                unit=""
                value={activeProfile.bezierPoints[bf.key]}
                min={bf.min}
                max={bf.max}
                step={0.01}
                isLight={isLight}
                onChange={(val) =>
                  handleUpdateProfile({
                    bezierPoints: { ...activeProfile.bezierPoints, [bf.key]: val },
                  })
                }
              />
            ))}
          </div>
        )}

        <div className="flex items-center justify-between pt-1.5 border-t border-neutral-700/30">
          <div className="flex flex-col min-w-0">
            <span className="font-semibold text-[11px] truncate">
              Hard Distance Culling Beyond R_max
            </span>
            <span className={`text-[10px] truncate ${isLight ? 'text-neutral-500' : 'text-neutral-400'}`}>
              Skip voice slot allocation &amp; force 0.0 gain when Dist &ge; R_max and G_min = 0
            </span>
          </div>
          <ToggleSwitch
            checked={activeProfile.cullBeyondMax}
            onCheckedChange={(cullBeyondMax) => handleUpdateProfile({ cullBeyondMax })}
            isLight={isLight}
            variant="amber"
          />
        </div>
      </div>

      {/* 5. Export / Copy / Reset Footer */}
      <div className="flex items-center justify-between gap-2 pt-0.5">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={handleDownloadAllJson}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium border transition-colors cursor-pointer ${
              isLight
                ? 'bg-sky-50 border-sky-200 text-sky-700 hover:bg-sky-100'
                : 'bg-sky-500/15 border-sky-500/35 text-sky-300 hover:bg-sky-500/25'
            }`}
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export Profiles</span>
          </button>

          <button
            type="button"
            onClick={handleCopyAllJson}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium border transition-colors cursor-pointer ${
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

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => spatialAttenuationProfiles.resetProfile(activeCategory)}
            className={resetBtnClass}
          >
            <RotateCcw className="w-3 h-3" />
            <span>Reset Category</span>
          </button>

          <button
            type="button"
            onClick={() => spatialAttenuationProfiles.resetAll()}
            className={resetBtnClass}
          >
            <span>Reset All</span>
          </button>
        </div>
      </div>
    </div>
  );
};
