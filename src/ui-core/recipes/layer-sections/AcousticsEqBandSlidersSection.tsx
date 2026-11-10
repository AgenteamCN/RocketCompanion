import React from 'react';
import {
  Gauge,
  Maximize2,
  Sliders,
  Sparkles,
  Speaker,
} from 'lucide-react';
import { SettingSliderRow } from '../../compounds/SettingSliderRow';
import { useAppStore } from '../../stores/appStore';
import { useScopedStore } from '../../stores/storeSnapshotScope';

export interface AcousticsEqBandSlidersSectionProps {
  developerMode: boolean;
  isLight: boolean;
  onHoverDesc: (desc: string | null) => void;
}

export const AcousticsEqBandSlidersSection: React.FC<
  AcousticsEqBandSlidersSectionProps
> = ({ developerMode, isLight, onHoverDesc }) => {
  const storeAudio = useScopedStore('appStore', useAppStore, (s) => s.audio);
  const updateAudio = useScopedStore('appStore', useAppStore, (s) => s.updateAudio);

  const audibilityFloor: number = storeAudio.audibilityFloor ?? 15;
  const acousticScale: number = storeAudio.arenaAcousticScale ?? 1.0;
  const bassGain: number = storeAudio.bassGain ?? 0;
  const midGain: number = storeAudio.midGain ?? 0;
  const trebleGain: number = storeAudio.trebleGain ?? 0;
  const farFieldHighShelfDb: number = storeAudio.farFieldHighShelfDb ?? 0;

  return (
    <>
      <SettingSliderRow
        icon={Gauge}
        iconColor="text-amber-400"
        label="Distant Audibility Floor"
        title="Distant Audibility Floor"
        value={audibilityFloor}
        min={0}
        max={50}
        step={1}
        unit="%"
        developerMode={developerMode}
        layout="inline"
        bordered={false}
        showDescription={false}
        onChange={(val) => updateAudio({ audibilityFloor: val })}
        hoverDescription="Minimum volume floor for non-culled far-field 3D audio sources (0% to 50%, default 15%)."
        onHover={(desc) => desc && onHoverDesc(desc)}
        onLeave={() => onHoverDesc(null)}
        isLight={isLight}
      />

      <SettingSliderRow
        icon={Maximize2}
        iconColor="text-emerald-400"
        label="Arena Acoustic Scale"
        title="Arena Acoustic Scale"
        value={acousticScale}
        min={0.5}
        max={2.0}
        step={0.05}
        unit="x"
        developerMode={developerMode}
        layout="inline"
        bordered={false}
        showDescription={false}
        onChange={(val) => updateAudio({ arenaAcousticScale: val })}
        hoverDescription="Spatial distance scale multiplier for arena attenuation radii (0.50x to 2.00x, default 1.00x)."
        onHover={(desc) => desc && onHoverDesc(desc)}
        onLeave={() => onHoverDesc(null)}
        isLight={isLight}
      />

      <SettingSliderRow
        icon={Speaker}
        iconColor="text-amber-500"
        label="Bass (100Hz)"
        title="Bass (100Hz)"
        value={bassGain}
        min={-12}
        max={12}
        step={0.5}
        unit=" dB"
        developerMode={developerMode}
        layout="inline"
        bordered={false}
        showDescription={false}
        colorScheme={bassGain !== 0 ? 'amber' : 'neutral'}
        onChange={(val) => updateAudio({ bassGain: val })}
        hoverDescription="Master low-frequency bass shelf (100Hz, -12dB to +12dB) for engine roar, demolish sub-bass, and goal impact weight."
        onHover={(desc) => desc && onHoverDesc(desc)}
        onLeave={() => onHoverDesc(null)}
        isLight={isLight}
      />

      <SettingSliderRow
        icon={Sliders}
        iconColor="text-amber-500"
        label="Midrange (1kHz)"
        title="Midrange (1kHz)"
        value={midGain}
        min={-12}
        max={12}
        step={0.5}
        unit=" dB"
        developerMode={developerMode}
        layout="inline"
        bordered={false}
        showDescription={false}
        colorScheme={midGain !== 0 ? 'amber' : 'neutral'}
        onChange={(val) => updateAudio({ midGain: val })}
        hoverDescription="Master midrange peaking band (1000Hz, Q=0.85, -12dB to +12dB) for ball impact snap and mechanical clarity."
        onHover={(desc) => desc && onHoverDesc(desc)}
        onLeave={() => onHoverDesc(null)}
        isLight={isLight}
      />

      <SettingSliderRow
        icon={Sliders}
        iconColor="text-amber-500"
        label="Treble (10kHz)"
        title="Treble (10kHz)"
        value={trebleGain}
        min={-12}
        max={12}
        step={0.5}
        unit=" dB"
        developerMode={developerMode}
        layout="inline"
        bordered={false}
        showDescription={false}
        colorScheme={trebleGain !== 0 ? 'amber' : 'neutral'}
        onChange={(val) => updateAudio({ trebleGain: val })}
        hoverDescription="Master high-frequency shelf (10kHz, -12dB to +12dB) for boost discharge hiss, crossbar ping, and air presence."
        onHover={(desc) => desc && onHoverDesc(desc)}
        onLeave={() => onHoverDesc(null)}
        isLight={isLight}
      />

      <SettingSliderRow
        icon={Sparkles}
        iconColor="text-sky-400"
        label="Far-Field High-Shelf Softening"
        title="Far-Field High-Shelf Softening"
        value={farFieldHighShelfDb}
        min={-12}
        max={0}
        step={0.5}
        unit=" dB"
        developerMode={developerMode}
        layout="inline"
        bordered={false}
        showDescription={false}
        colorScheme={farFieldHighShelfDb !== 0 ? 'sky' : 'neutral'}
        onChange={(val) => updateAudio({ farFieldHighShelfDb: val })}
        hoverDescription="High-shelf roll-off (5.5kHz, 0dB to -12dB) to gently tame far-field harshness."
        onHover={(desc) => desc && onHoverDesc(desc)}
        onLeave={() => onHoverDesc(null)}
        isLight={isLight}
      />
    </>
  );
};
