import React, { useState } from 'react';
import {
  AppWindowMac,
  Volume2,
  Engine,
  EighthNotes,
  Sliders,
} from 'lucide-react';
import { SettingActionRow } from '../../../compounds/SettingActionRow';
import { SettingSliderRow } from '../../../compounds/SettingSliderRow';
import { SettingToggleRow } from '../../../compounds/SettingToggleRow';
import { JetThrustSvg } from '../../../primitives/packagedSvgIcons';
import { useSettingActionRowStore } from '../../../stores/settingRowStore';
import { useSpatialAudioStore } from '../../../stores/spatialAudioStore';
import { useAppStore } from '../../../stores/appStore';
import { useScopedStore } from '../../../stores/storeSnapshotScope';
import type { SurfaceVariantMeta } from '../../../manifest/surfaceMetaTypes';
import { BgmFolderAndSceneConfigSection } from '../components/BgmFolderAndSceneConfigSection';

export interface AudioConfig {
  masterVolume: number;      // 0..100
  engineVolume: number;      // 0..100
  boostVolume: number;       // 0..100
  bgmVolume?: number;        // 0..100
  muteWhenUnfocused?: boolean; // Positive boolean semantics for "Mute When Unfocused"
  bassGain: number;          // -12..12 dB
  midGain: number;           // -12..12 dB
  trebleGain: number;        // -12..12 dB
  hrtfEnabled: boolean;
}

export const DEFAULT_AUDIO_CONFIG: AudioConfig = {
  masterVolume: 100,
  engineVolume: 100,
  boostVolume: 80,
  bgmVolume: 80,
  muteWhenUnfocused: true,
  bassGain: 0,
  midGain: 0,
  trebleGain: 0,
  hrtfEnabled: true,
};

export const SURFACE_VARIANT_META: SurfaceVariantMeta = {
  variantId: 'settings:audio',
  label: '2. Audio Settings',
  description:
    'Master, Engine, Boost, and Background Music volume sliders, Acoustics & EQ entry, and background mute toggle.',
  storeOverrides: {
    appStore: {
      settingsTargetTab: 'audio',
      developerMode: true,
    },
  },
};

export interface AudioTabProps {
  isLight?: boolean;
  developerMode?: boolean;
  audioConfig?: Partial<AudioConfig>;
  onNavigateAcousticsEqualizer?: () => void;
  onHover: (desc: string) => void;
  onLeave: () => void;
}

/**
 * [Layer 2 Settings -> Audio Tab]
 * Streamlined User & Developer unified Audio settings:
 * 1. `Mute When Unfocused` (`app-window-mac`, default active = true)
 * 2. `Background Music` (`eighth-notes`, `More` disclosure + `Upload Folder` button + toggle switch on the right)
 * 3. `Master Volume` (`volume-2`, read-only value readout + draggable slider)
 * 4. `Engine Volume` (`engine`, read-only value readout + draggable slider)
 * 5. `Boost Volume` (Noun Project `4873540` Jet Thrust SVG, read-only value readout + draggable slider)
 * 6. `Background Music Volume` (`eighth-notes`, adjustable when Background Music is enabled, locked when disabled)
 * 7. `Acoustics & Equalizer` (`sliders`, navigates to Layer 3 Acoustics & Equalizer panel)
 */
export const AudioTab: React.FC<AudioTabProps> = ({
  isLight = false,
  developerMode = false,
  audioConfig: propAudioConfig,
  onNavigateAcousticsEqualizer,
  onHover,
  onLeave,
}) => {
  const navigate = useScopedStore('appStore', useAppStore, (s) => s.navigate);
  const storeAudio = useScopedStore('appStore', useAppStore, (s) => s.audio);
  const updateStoreAudio = useScopedStore(
    'appStore',
    useAppStore,
    (s) => s.updateAudio
  );

  const [internalConfig, setInternalConfig] = useState<AudioConfig>(() => ({
    ...DEFAULT_AUDIO_CONFIG,
    masterVolume: storeAudio.masterVolume,
    engineVolume: storeAudio.engineVolume,
    boostVolume: storeAudio.boostVolume,
    muteWhenUnfocused: !storeAudio.continueAudioOnLostFocus,
    bassGain: storeAudio.bassGain,
    midGain: storeAudio.midGain,
    trebleGain: storeAudio.trebleGain,
    hrtfEnabled: storeAudio.hrtfEnabled,
  }));

  const resolvedConfig: AudioConfig = {
    ...internalConfig,
    masterVolume: storeAudio.masterVolume,
    engineVolume: storeAudio.engineVolume,
    boostVolume: storeAudio.boostVolume,
    muteWhenUnfocused: !storeAudio.continueAudioOnLostFocus,
    bassGain: storeAudio.bassGain,
    midGain: storeAudio.midGain,
    trebleGain: storeAudio.trebleGain,
    hrtfEnabled: storeAudio.hrtfEnabled,
    ...propAudioConfig,
  };

  const muteWhenUnfocused = resolvedConfig.muteWhenUnfocused ?? true;
  const masterVolume = resolvedConfig.masterVolume;
  const engineVolume = resolvedConfig.engineVolume;
  const boostVolume = resolvedConfig.boostVolume;

  const storeBgmEnabled = useScopedStore(
    'spatialAudioStore',
    useSpatialAudioStore,
    (s) => s.bgmEnabled
  );
  const storeBgmVolume = useScopedStore(
    'spatialAudioStore',
    useSpatialAudioStore,
    (s) => s.bgmVolume
  );
  const setStoreBgmVolume = useScopedStore(
    'spatialAudioStore',
    useSpatialAudioStore,
    (s) => s.setBgmVolume
  );

  const bgmEnabled = storeBgmEnabled;
  const bgmVolume = storeBgmVolume ?? resolvedConfig.bgmVolume ?? 80;

  const updateAudioField = <K extends keyof AudioConfig>(key: K, value: AudioConfig[K]) => {
    const patch: Partial<AudioConfig> = { [key]: value };
    const nextConfig: AudioConfig = { ...resolvedConfig, ...patch };
    setInternalConfig(nextConfig);
    if (key === 'muteWhenUnfocused') {
      updateStoreAudio({ continueAudioOnLostFocus: !Boolean(value) });
    } else if (key === 'masterVolume' || key === 'engineVolume' || key === 'boostVolume') {
      updateStoreAudio({ [key]: Number(value) });
    }
  };

  const handleBgmVolumeChange = (next: number) => {
    setStoreBgmVolume(next);
    updateAudioField('bgmVolume', next);
  };

  const { rowGap } = useSettingActionRowStore();

  return (
    <div
      data-layout="audio-settings-list"
      className="flex flex-col w-full"
      style={{ gap: `${rowGap}px` }}
    >
      <SettingToggleRow
        icon={AppWindowMac}
        label="Mute When Unfocused"
        subtitle="Automatically mute engine synthesis and game audio when the window or tab loses focus"
        checked={muteWhenUnfocused}
        onChange={(next) => updateAudioField('muteWhenUnfocused', next)}
        hoverDescription="Automatically mute game sound and engine synthesis when the application window or tab is unfocused."
        onHover={(desc) => desc && onHover(desc)}
        onLeave={onLeave}
        isLight={isLight}
      />

      <BgmFolderAndSceneConfigSection
        isLight={isLight}
        developerMode={developerMode}
        onHover={onHover}
        onLeave={onLeave}
      />

      <SettingSliderRow
        icon={Volume2}
        label="Master Volume"
        description="Global audio output ceiling across all spatial audio and powertrain sound channels"
        value={masterVolume}
        min={0}
        max={100}
        step={1}
        unit="%"
        developerMode={developerMode}
        onChange={(next) => updateAudioField('masterVolume', next)}
        hoverDescription="Global audio output ceiling across all spatial audio and powertrain sound channels."
        onHover={(desc) => desc && onHover(desc)}
        onLeave={onLeave}
        isLight={isLight}
      />

      <SettingSliderRow
        icon={Engine}
        label="Engine Volume"
        description="Turtle Modem 40-slice granular REV powertrain continuous audio and exhaust backfire pops"
        value={engineVolume}
        min={0}
        max={100}
        step={1}
        unit="%"
        developerMode={developerMode}
        onChange={(next) => updateAudioField('engineVolume', next)}
        hoverDescription="Turtle Modem 40-slice granular REV powertrain continuous audio and exhaust backfire pops."
        onHover={(desc) => desc && onHover(desc)}
        onLeave={onLeave}
        isLight={isLight}
      />

      <SettingSliderRow
        icon={JetThrustSvg}
        iconName="jet-thrust"
        iconColor={
          isLight
            ? 'text-neutral-400 group-hover:text-neutral-600'
            : 'text-neutral-500 group-hover:text-neutral-300'
        }
        label="Boost Volume"
        description="Rocket thruster discharge loop and supersonic acceleration sound"
        value={boostVolume}
        min={0}
        max={100}
        step={1}
        unit="%"
        developerMode={developerMode}
        onChange={(next) => updateAudioField('boostVolume', next)}
        hoverDescription="Rocket thruster discharge loop and supersonic acceleration sound."
        onHover={(desc) => desc && onHover(desc)}
        onLeave={onLeave}
        isLight={isLight}
      />

      <SettingSliderRow
        icon={EighthNotes}
        iconName="eighth-notes"
        label="Background Music Volume"
        description="Soundtrack playback volume level (locked while Background Music is disabled)"
        value={bgmVolume}
        min={0}
        max={100}
        step={1}
        unit="%"
        disabled={!bgmEnabled}
        developerMode={developerMode}
        onChange={handleBgmVolumeChange}
        hoverDescription="Adjust Background Music volume level. Available when Background Music is enabled; temporarily locked when disabled."
        onHover={(desc) => desc && onHover(desc)}
        onLeave={onLeave}
        isLight={isLight}
      />

      <SettingActionRow
        icon={Sliders}
        title="Acoustics & Equalizer"
        description="3-band parametric equalizer, dynamic range compressor & 3D spatial acoustics"
        hoverDescription="Configure 3-band parametric equalizer (Bass 100Hz, Midrange 1kHz, Treble 10kHz), Dynamic Range Profile (Night, Dynamic, Studio), and 3D spatial acoustics."
        buttonHoverDescription="Open Acoustics & Equalizer panel to tune 3-band EQ, dynamic range compression, and 3D spatial roll-off."
        onAction={onNavigateAcousticsEqualizer ?? (() => navigate('acoustics-equalizer'))}
        onHover={onHover}
        onLeave={onLeave}
        isLight={isLight}
      />
    </div>
  );
};
