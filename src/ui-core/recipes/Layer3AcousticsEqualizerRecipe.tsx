import React, { useState, useEffect } from 'react';
import {
  Activity,
  Compass,
  Radio,
  RotateCcw,
  Volume2,
} from 'lucide-react';
import { audioConfig, type DynamicRangeProfileId } from '../config/audioConfig';
import { SettingSegmentedRow } from '../compounds/SettingSegmentedRow';
import { SettingToggleRow } from '../compounds/SettingToggleRow';
import { PanelContainer, PanelHeader, PanelContent } from '../layout/Panel';
import { PanelFooter } from '../layout/PanelFooter';
import { resolveCalibratedSurfaceSizing } from '../manifest/surfaceCalibration';
import type { StandardSurfaceProps, SurfaceMeta } from '../manifest/surfaceMetaTypes';
import { InlineErrorNotice } from '../primitives/InlineErrorNotice';
import { useAppStore } from '../stores/appStore';
import { useMenuLayoutStore } from '../stores/menuLayoutStore';
import { useSettingActionRowStore } from '../stores/settingRowStore';
import { useScopedStore } from '../stores/storeSnapshotScope';
import { AcousticsEqBandSlidersSection } from './layer-sections/AcousticsEqBandSlidersSection';

export const SURFACE_META: SurfaceMeta = {
  id: 'recipe:Layer3AcousticsEqualizerRecipe',
  title: 'Acoustics & Equalizer',
  subtitle: 'Master 3-Band Parametric EQ, Dynamic Range Compressor & 3D Spatial Acoustics',
  icon: 'Sliders',
  layer: 'layer3',
  menuGroup: 'menu-layer',
  defaultSizing: {
    width: 480,
    height: 540,
    minHeight: 220,
    maxHeight: 1080,
    mode: 'adaptive',
  },
  variants: [
    {
      variantId: 'dynamic-default',
      label: 'Dynamic Profile (Default)',
      storeOverrides: {
        appStore: {
          developerMode: true,
        },
      },
    },
    {
      variantId: 'night-compressed',
      label: 'Night Profile + HRTF',
      storeOverrides: {
        appStore: {
          developerMode: true,
          audio: {
            masterVolume: 80,
            sfxVolume: 100,
            engineVolume: 85,
            crowdVolume: 65,
            musicVolume: 50,
            voiceVolume: 90,
            spatialAudio: true,
            hrtfEnabled: true,
            spatialPanningModel: 'HRTF',
            distanceModel: 'smoothstep',
            audibilityFloor: 20,
            arenaAcousticScale: 1.0,
            dynamicRangeProfile: 'compressed',
            bassGain: 2,
            midGain: 1,
            trebleGain: -1,
            farFieldHighShelfDb: -3,
          },
        },
      },
    },
  ],
};

export type Layer3AcousticsEqualizerRecipeProps = StandardSurfaceProps;

/**
 * [Recipe] Layer 3 Acoustics & Equalizer
 */
export const Layer3AcousticsEqualizerRecipe: React.FC<
  Layer3AcousticsEqualizerRecipeProps
> = ({ isLight = false, onBack: propOnBack }) => {
  const storeGoBack = useScopedStore('appStore', useAppStore, (s) => s.goBack);
  const storeDevMode = useScopedStore('appStore', useAppStore, (s) => s.developerMode);
  const storeAudio = useScopedStore('appStore', useAppStore, (s) => s.audio);
  const updateAudio = useScopedStore('appStore', useAppStore, (s) => s.updateAudio);

  const onBack = propOnBack ?? storeGoBack;
  const developerMode = storeDevMode ?? true;
  const { panels, simulateLayer3Error } = useScopedStore(
    'menuLayoutStore',
    useMenuLayoutStore
  );
  const calibratedSizing = resolveCalibratedSurfaceSizing(
    SURFACE_META.id,
    SURFACE_META.defaultSizing
  );
  const sizing = panels?.['layer3-acoustics-equalizer'] ?? {
    mode: calibratedSizing.mode === 'fixed' ? ('fixed' as const) : ('auto' as const),
    width: calibratedSizing.width,
    targetHeight:
      typeof calibratedSizing.height === 'number' ? calibratedSizing.height : 540,
    minHeight: calibratedSizing.minHeight ?? 220,
    maxHeight: calibratedSizing.maxHeight ?? 1080,
  };
  const showError = Boolean(simulateLayer3Error);
  const { rowGap } = useScopedStore('settingRowStore', useSettingActionRowStore);

  useEffect(() => {
    const unsub = audioConfig.subscribe((cfg) => {
      const nextDyn: DynamicRangeProfileId =
        cfg.dynamicRangeProfile === 'compressed' ||
        cfg.dynamicRangeProfile === 'monitor' ||
        cfg.dynamicRangeProfile === 'dynamic'
          ? cfg.dynamicRangeProfile
          : 'dynamic';
      const nextPan: 'equalpower' | 'HRTF' =
        cfg.spatialPanningModel === 'HRTF' ? 'HRTF' : 'equalpower';
      const nextDist: 'smoothstep' | 'inverse' | 'linear' | 'exponential' =
        cfg.distanceModel === 'inverse' ||
        cfg.distanceModel === 'linear' ||
        cfg.distanceModel === 'exponential' ||
        cfg.distanceModel === 'smoothstep'
          ? cfg.distanceModel
          : 'smoothstep';
      const nextFloor = Number.isFinite(Number(cfg.minAudibleGainFloor))
        ? Math.round(Math.max(0, Math.min(0.5, Number(cfg.minAudibleGainFloor))) * 100)
        : 15;
      const nextScale = Number.isFinite(Number(cfg.arenaAcousticScale))
        ? Number(cfg.arenaAcousticScale)
        : 1.0;
      const nextBass = Number.isFinite(Number(cfg.eqBass)) ? Number(cfg.eqBass) : 0;
      const nextMid = Number.isFinite(Number(cfg.eqMid)) ? Number(cfg.eqMid) : 0;
      const nextTreble = Number.isFinite(Number(cfg.eqTreble)) ? Number(cfg.eqTreble) : 0;
      const nextShelf = Number.isFinite(Number(cfg.farFieldHighShelfDb))
        ? Number(cfg.farFieldHighShelfDb)
        : 0;
      const nextSpatial = cfg.spatialAudio !== undefined ? Boolean(cfg.spatialAudio) : true;

      const cur = useAppStore.getState().audio;
      if (
        cur.dynamicRangeProfile !== nextDyn ||
        cur.spatialPanningModel !== nextPan ||
        cur.distanceModel !== nextDist ||
        cur.audibilityFloor !== nextFloor ||
        cur.arenaAcousticScale !== nextScale ||
        cur.bassGain !== nextBass ||
        cur.midGain !== nextMid ||
        cur.trebleGain !== nextTreble ||
        cur.farFieldHighShelfDb !== nextShelf ||
        cur.hrtfEnabled !== nextSpatial
      ) {
        useAppStore.setState((s) => ({
          audio: {
            ...s.audio,
            dynamicRangeProfile: nextDyn,
            spatialPanningModel: nextPan,
            distanceModel: nextDist,
            audibilityFloor: nextFloor,
            arenaAcousticScale: nextScale,
            bassGain: nextBass,
            midGain: nextMid,
            trebleGain: nextTreble,
            farFieldHighShelfDb: nextShelf,
            hrtfEnabled: nextSpatial,
          },
        }));
      }
    });
    return () => {
      unsub();
    };
  }, []);

  const compressionMode: DynamicRangeProfileId =
    storeAudio.dynamicRangeProfile ?? 'dynamic';
  const spatialAudio: boolean = storeAudio.hrtfEnabled ?? true;
  const panningModel: 'equalpower' | 'HRTF' =
    storeAudio.spatialPanningModel ?? 'equalpower';
  const rolloffCurve: 'smoothstep' | 'inverse' | 'linear' | 'exponential' =
    storeAudio.distanceModel ?? 'smoothstep';

  const [hoveredDesc, setHoveredDesc] = useState<string | null>(null);

  const handleResetDefaults = () => {
    updateAudio({
      dynamicRangeProfile: 'dynamic',
      hrtfEnabled: true,
      spatialPanningModel: 'equalpower',
      distanceModel: 'smoothstep',
      audibilityFloor: 15,
      arenaAcousticScale: 1.0,
      bassGain: 0,
      midGain: 0,
      trebleGain: 0,
      farFieldHighShelfDb: 0,
    });
  };

  const resetActionSlot = (
    <button
      type="button"
      onClick={handleResetDefaults}
      onMouseEnter={() =>
        setHoveredDesc(
          'Reset 3-Band EQ (0 dB), Dynamic Range (Dynamic), Spatial Panning, and Acoustic Scale back to calibrated defaults.'
        )
      }
      onMouseLeave={() => setHoveredDesc(null)}
      className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg border text-[10px] font-bold uppercase tracking-wider cursor-pointer transition-colors ${
        isLight
          ? 'bg-neutral-100 hover:bg-neutral-200 border-neutral-300 text-neutral-700'
          : 'bg-white/[0.06] hover:bg-white/[0.12] border-white/[0.12] text-neutral-300'
      }`}
    >
      <RotateCcw className="h-3 w-3 text-amber-500" />
      <span>Reset Defaults</span>
    </button>
  );

  return (
    <PanelContainer isLight={isLight} sizing={sizing} className="w-full select-none">
      <PanelHeader
        title="ACOUSTICS & EQUALIZER"
        onBack={onBack}
        isLight={isLight}
        rightElement={resetActionSlot}
      />

      <PanelContent scrollable={true}>
        <div
          data-layout="audio-detail-list"
          className="flex flex-col w-full"
          style={{ gap: `${rowGap}px` }}
        >
          <InlineErrorNotice visible={showError} isLight={isLight} />

          <SettingSegmentedRow
            icon={Volume2}
            iconColor="text-amber-500"
            title="Dynamic Range Profile"
            value={compressionMode}
            onChange={(v) =>
              updateAudio({ dynamicRangeProfile: v as DynamicRangeProfileId })
            }
            layout="inline"
            bordered={false}
            showDescription={false}
            options={[
              { value: 'compressed', label: 'Night' },
              { value: 'dynamic', label: 'Dynamic' },
              { value: 'monitor', label: 'Studio' },
            ]}
            hoverDescription="Dynamic range profile: Night (peak control + detail lift), Dynamic (competitive limiter), or Studio (uncompressed reference)."
            onHover={(desc) => desc && setHoveredDesc(desc)}
            onLeave={() => setHoveredDesc(null)}
            isLight={isLight}
          />

          <SettingToggleRow
            icon={Radio}
            iconColor="text-sky-400"
            title="3D Spatial Audio"
            checked={spatialAudio}
            onChange={(checked) => updateAudio({ hrtfEnabled: checked })}
            bordered={false}
            showDescription={false}
            hoverDescription="Enable 3D spatial azimuth/elevation positioning for ball, boost, and opponent vehicle emitters."
            onHover={(desc) => desc && setHoveredDesc(desc)}
            onLeave={() => setHoveredDesc(null)}
            isLight={isLight}
          />

          <SettingSegmentedRow
            icon={Compass}
            iconColor="text-sky-400"
            title="3D Spatial Panning Model"
            value={panningModel}
            onChange={(v) =>
              updateAudio({ spatialPanningModel: v as 'equalpower' | 'HRTF' })
            }
            layout="inline"
            bordered={false}
            showDescription={false}
            options={[
              { value: 'equalpower', label: 'Equal Power' },
              { value: 'HRTF', label: 'HRTF Binaural' },
            ]}
            hoverDescription="Select WebAudio PannerNode spatialization algorithm (Equal Power stereo panning vs HRTF binaural head model)."
            onHover={(desc) => desc && setHoveredDesc(desc)}
            onLeave={() => setHoveredDesc(null)}
            isLight={isLight}
          />

          <SettingSegmentedRow
            icon={Activity}
            iconColor="text-emerald-400"
            title="Distance Rolloff Curve"
            value={rolloffCurve}
            onChange={(v) =>
              updateAudio({
                distanceModel: v as 'smoothstep' | 'inverse' | 'linear' | 'exponential',
              })
            }
            layout="inline"
            bordered={false}
            showDescription={false}
            options={[
              { value: 'smoothstep', label: 'Smoothstep' },
              { value: 'inverse', label: 'Inverse' },
              { value: 'linear', label: 'Linear' },
              { value: 'exponential', label: 'Exponential' },
            ]}
            hoverDescription="Baseline distance attenuation curve model applied across 3D spatial audio emitters."
            onHover={(desc) => desc && setHoveredDesc(desc)}
            onLeave={() => setHoveredDesc(null)}
            isLight={isLight}
          />

          <AcousticsEqBandSlidersSection
            developerMode={developerMode}
            isLight={isLight}
            onHoverDesc={setHoveredDesc}
          />
        </div>
      </PanelContent>

      <PanelFooter
        isLight={isLight}
        defaultDescription="Configure Master 3-Band EQ (100Hz / 1kHz / 10kHz), Dynamic Range Compressor, and 3D spatial acoustics."
        hoveredDescription={hoveredDesc}
      />
    </PanelContainer>
  );
};

export default Layer3AcousticsEqualizerRecipe;
