import React, { useEffect, useState } from 'react';
import { Disc3, Keyboard, Scan, Sliders, Zap } from 'lucide-react';
import { PhaseVariationMatrix } from '../../compounds/PhaseVariationMatrix';
import { SettingActionRow } from '../../compounds/SettingActionRow';
import { SettingSegmentedRow } from '../../compounds/SettingSegmentedRow';
import { SettingSliderRow } from '../../compounds/SettingSliderRow';
import {
  audioConfig,
  DEFAULT_BOOST_VARIATION,
  previewBoostAudioVariation,
  setAllBoostAudioVariations,
  setBoostEndVariation,
  setBoostLoopVariation,
  setBoostStartVariation,
  setCarBallSoundMode,
  setCarCarSoundMode,
} from '../../config/audioConfig';
import { useAppStore } from '../../stores/appStore';
import { useKickoffTrainingStore } from '../../stores/kickoffTrainingStore';
import { useSettingActionRowStore } from '../../stores/settingRowStore';
import { useScopedStore } from '../../stores/storeSnapshotScope';

export interface BoostPhaseSelectionState {
  start: string;
  loop: string;
  end: string;
}

export interface DevActiveTunersInlineControlsSectionProps {
  isLight: boolean;
  onHover: (desc: string | null) => void;
}

const BALL_SOUND_OPTIONS = [
  { value: 'vehicle_body', label: 'Vehicle Body (Random 1 of 4)' },
  { value: 'vehicle_accent', label: 'Vehicle Accent (Single File)' },
];

const CAR_CAR_SOUND_OPTIONS = [
  { value: 'vehicle_detail', label: 'Vehicle Detail (Default)' },
  { value: 'sfx_collision', label: 'SoundFX Collision' },
];

/**
 * Store-connected inline calibration controls inside `Layer3DevActiveTunersRecipe`:
 * - Kickoff Rhythm Overlay W / S Vertical Offset
 * - Under Development Top Margin
 * - Boost Audio PhaseVariationMatrix
 * - Car-Ball / Car-Car Hit Audio variants
 * - Layer 4 navigation rows (Advanced Audio Settings & Event Trigger Rules)
 */
export const DevActiveTunersInlineControlsSection: React.FC<
  DevActiveTunersInlineControlsSectionProps
> = ({ isLight, onHover }) => {
  const navigate = useScopedStore('appStore', useAppStore, (s) => s.navigate);
  const wsVerticalOffsetPct = useScopedStore(
    'kickoffTrainingStore',
    useKickoffTrainingStore,
    (s) => s.wsVerticalOffsetPct
  );
  const setWsVerticalOffsetPct = useScopedStore(
    'kickoffTrainingStore',
    useKickoffTrainingStore,
    (s) => s.setWsVerticalOffsetPct
  );
  const { underDevelopmentTopMargin, setToken } = useSettingActionRowStore();

  const [carBallMode, setCarBallMode] = useState<string>(() =>
    String(audioConfig.get('carBallSoundMode') || 'vehicle_body')
  );
  const [carCarMode, setCarCarMode] = useState<string>(() =>
    String(audioConfig.get('carCarSoundMode') || 'vehicle_detail')
  );
  const [boostSelection, setBoostSelection] = useState<BoostPhaseSelectionState>(() => ({
    start: String(audioConfig.get('boostStartVariation') || DEFAULT_BOOST_VARIATION),
    loop: String(audioConfig.get('boostLoopVariation') || DEFAULT_BOOST_VARIATION),
    end: String(audioConfig.get('boostEndVariation') || DEFAULT_BOOST_VARIATION),
  }));

  useEffect(() => {
    const handleSettingsChanged = () => {
      setCarBallMode(String(audioConfig.get('carBallSoundMode') || 'vehicle_body'));
      setCarCarMode(String(audioConfig.get('carCarSoundMode') || 'vehicle_detail'));
      setBoostSelection({
        start: String(audioConfig.get('boostStartVariation') || DEFAULT_BOOST_VARIATION),
        loop: String(audioConfig.get('boostLoopVariation') || DEFAULT_BOOST_VARIATION),
        end: String(audioConfig.get('boostEndVariation') || DEFAULT_BOOST_VARIATION),
      });
    };
    const unsub = audioConfig.subscribe(handleSettingsChanged);
    return () => {
      unsub();
    };
  }, []);

  const handleCarBallModeChange = (mode: string) => {
    setCarBallMode(mode);
    setCarBallSoundMode(mode);
  };

  const handleCarCarModeChange = (mode: string) => {
    setCarCarMode(mode);
    setCarCarSoundMode(mode);
  };

  const handleSelectBoostPhase = (
    variationId: string,
    phase: 'start' | 'loop' | 'end'
  ) => {
    const next = { ...boostSelection, [phase]: variationId };
    setBoostSelection(next);
    if (next.start === next.loop && next.loop === next.end) {
      useAppStore.getState().updateMaterials({
        boostAudio: variationId as 'rush' | 'standard' | 'flamethrower' | 'plasma',
      });
    }
    if (phase === 'start') {
      setBoostStartVariation(variationId);
    } else if (phase === 'loop') {
      setBoostLoopVariation(variationId);
    } else {
      setBoostEndVariation(variationId);
    }
    previewBoostAudioVariation(variationId, phase);
  };

  const handleSelectAllBoostPhases = (variationId: string) => {
    setBoostSelection({
      start: variationId,
      loop: variationId,
      end: variationId,
    });
    setAllBoostAudioVariations(variationId);
    useAppStore.getState().updateMaterials({
      boostAudio: variationId as 'rush' | 'standard' | 'flamethrower' | 'plasma',
    });
    previewBoostAudioVariation(variationId, 'start');
  };

  return (
    <>
      <SettingSliderRow
        icon={Keyboard}
        iconColor="text-sky-400"
        title="W / S Vertical Offset"
        label="W / S Vertical Offset"
        description="W (upward) & S (downward) vertical container offset (0% – 50%, default 10%)"
        value={wsVerticalOffsetPct}
        min={0}
        max={50}
        step={1}
        unit="%"
        developerMode={true}
        bordered={false}
        showDescription={false}
        onChange={setWsVerticalOffsetPct}
        hoverDescription="Kickoff Rhythm Overlay Key Stagger: Adjusts the vertical stagger of W (upward) and S (downward) key receptors in the Kickoff Training rhythm overlay."
        onHover={(desc) => desc && onHover(desc)}
        onLeave={() => onHover(null)}
        isLight={isLight}
      />

      <SettingSliderRow
        icon={Scan}
        iconColor="text-rose-400"
        title="Under Development Top Margin"
        label="Under Development Top Margin"
        description="Extra top spacing above Under Development in Developer Tab to avoid hover overlap"
        value={underDevelopmentTopMargin}
        min={0}
        max={24}
        step={1}
        unit="px"
        developerMode={true}
        bordered={false}
        showDescription={false}
        onChange={(val) => setToken('underDevelopmentTopMargin', val)}
        hoverDescription="Under Development Top Margin: Adjusts the extra vertical space between Observe Safe Area Boundary and the bordered Under Development row in Developer Tab."
        onHover={(desc) => desc && onHover(desc)}
        onLeave={() => onHover(null)}
        isLight={isLight}
      />

      <div className="my-1">
        <PhaseVariationMatrix
          selection={boostSelection}
          onSelectPhase={handleSelectBoostPhase}
          onSelectAllPhases={handleSelectAllBoostPhases}
          isLight={isLight}
          onHover={onHover}
          onLeave={() => onHover(null)}
        />
      </div>

      <SettingSegmentedRow
        icon={Disc3}
        iconColor="text-amber-500"
        title="Car-Ball Hit Audio"
        label="Car-Ball Hit Audio"
        subtitle="Vehicle Body (Random 1 of 4) vs Vehicle Accent"
        value={carBallMode}
        onChange={handleCarBallModeChange}
        options={BALL_SOUND_OPTIONS}
        bordered={false}
        showDescription={false}
        hoverDescription="Car-Ball impact audio scheme: Vehicle Body (random 01-04) or Vehicle Accent (single asset)."
        onHover={(desc) => desc && onHover(desc)}
        onLeave={() => onHover(null)}
        isLight={isLight}
      />

      <SettingSegmentedRow
        icon={Disc3}
        iconColor="text-amber-500"
        title="Car-Car Bump Audio"
        label="Car-Car Bump Audio"
        subtitle="Vehicle Detail default (Random 1 of 6) vs SoundFX Collision"
        value={carCarMode}
        onChange={handleCarCarModeChange}
        options={CAR_CAR_SOUND_OPTIONS}
        bordered={false}
        showDescription={false}
        hoverDescription="Car-Car collision audio scheme: Vehicle Detail (Random 1 of 6, default) or SoundFX Collision."
        onHover={(desc) => desc && onHover(desc)}
        onLeave={() => onHover(null)}
        isLight={isLight}
      />

      <SettingActionRow
        icon={Sliders}
        iconColor="text-amber-500"
        title="Advanced Audio Settings"
        actionLabel="Configure"
        bordered={false}
        showDescription={false}
        onAction={() => navigate('advanced-audio')}
        hoverDescription="Open Layer 4 Advanced Audio Settings: Multi-bus audio calibration (0% - 500%), direct numeric inputs, and JSON export."
        onHover={onHover}
        onLeave={() => onHover(null)}
        isLight={isLight}
      />

      <SettingActionRow
        icon={Zap}
        iconColor="text-sky-400"
        title="Event & Trigger Rules"
        actionLabel="Configure"
        bordered={false}
        showDescription={false}
        onAction={() => navigate('event-trigger-rules')}
        hoverDescription="Open Layer 4 Event & Trigger Rules: Configure collision impulse thresholds, audio/VFX event bindings, and trigger rules."
        onHover={onHover}
        onLeave={() => onHover(null)}
        isLight={isLight}
      />
    </>
  );
};
