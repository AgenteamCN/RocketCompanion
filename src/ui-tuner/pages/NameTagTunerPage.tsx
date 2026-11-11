import React, { useCallback, useEffect } from 'react';
import { NameTagTunerFloatingWindow } from '../../ui-core/panels/dev/NameTagTunerFloatingWindow';
import { Badge } from '../../ui-core/primitives/Badge';
import { updateBallVisualConfig } from '../../ui-core/config/ballVisualConfig';
import {
  setNameTagRuntimeState,
  updateNameTagConfig,
  useNameTagTunerStore,
} from '../../ui-core/stores/nameTagTunerStore';
import { PageJumpDirectory, type JumpDirectoryItem } from '../PageJumpDirectory';
import { NameTagModeShootoutSection } from './name-tag-tuner/NameTagModeShootoutSection';
import {
  NameTagStageHeaderAndDeck,
  NameTagTunerHeaderAndExportBar,
} from './name-tag-tuner/NameTagTunerHeaderAndExportBar';
import { buildKickoffCars, KICKOFF_SLOT_PAIRS } from './name-tag-tuner/nameTagArenaProjectionMath';
import { NameTagStageCanvas } from './name-tag-tuner/NameTagStageCanvas';
import { useNameTagSyncedState } from './name-tag-tuner/useNameTagSyncedState';

const JUMP_ITEMS: JumpDirectoryItem[] = [
  {
    code: '5H.0',
    componentName: 'NameTagStageCanvas',
    label: 'Top-Pinned 6-Car Kickoff Arena Stage & Camera Deck',
    targetId: 'sec-nametag-stage',
    tag: '3D + 2D Pass',
  },
  {
    code: '5H.1',
    componentName: 'NameTagModeShootoutSection',
    label: '4 Boost Modes & Kickoff Ball Occlusion Shootout',
    targetId: 'sec-nametag-shootout',
    tag: '4 Modes + Ball Mask',
  },
  {
    code: '5H.2',
    componentName: 'NameTagTunerFloatingWindow',
    label: 'Shared NameTagTunerFloatingWindow Control Slot (Direct Reuse)',
    targetId: 'sec-nametag-shared-slot',
    tag: 'Zero Duplication',
  },
];

const KICKOFF_COMBINATIONS: Array<[number, number, number]> = [
  [0, 1, 4],
  [0, 2, 3],
  [1, 2, 4],
  [0, 3, 4],
  [1, 3, 2],
];

export const NameTagTunerPage: React.FC<{ isLight?: boolean }> = ({ isLight = false }) => {
  const {
    config,
    isTunerArenaActive,
    kickoffPermutationIndex,
    activeCameraMode,
    focusedCarIndex: storeFocusedCarIndex,
    boostBorderOverride,
    reshuffleKickoffPositions,
    selectPovCar,
    focusFreeCamOverview,
  } = useNameTagTunerStore();

  const {
    arenaPreset,
    setArenaPreset,
    stageHeight,
    setStageHeight,
    cameraFovDeg,
    setCameraFovDeg,
    ballHeightOffset,
    setBallHeightOffset,
    animateBoostWave,
    setAnimateBoostWave,
    customNameOverride,
    setCustomNameOverride,
    slotLayoutMode,
    setSlotLayoutMode,
    resetStageControls,
    handleReset5HDefaults,
    build5HExportCode,
  } = useNameTagSyncedState();

  useEffect(() => {
    setNameTagRuntimeState({
      isTunerArenaActive: true,
      isMultiplayerOrMultiCarMode: true,
    });
  }, [isTunerArenaActive]);

  const comboIndex =
    ((kickoffPermutationIndex % KICKOFF_COMBINATIONS.length) +
      KICKOFF_COMBINATIONS.length) %
    KICKOFF_COMBINATIONS.length;

  const effectiveFocusedCarIndex =
    activeCameraMode === 'free' ? null : storeFocusedCarIndex;

  const cars = React.useMemo(
    () => buildKickoffCars(KICKOFF_COMBINATIONS[comboIndex]),
    [comboIndex]
  );

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT')
      ) {
        return;
      }
      if (e.key === '0') {
        focusFreeCamOverview();
      } else if (e.key >= '1' && e.key <= '6') {
        selectPovCar(Number(e.key) - 1);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [focusFreeCamOverview, selectPovCar]);

  const handleUpdateConfigFromShootout = useCallback(
    (patch: Partial<typeof config>) => {
      updateNameTagConfig(patch);
      if (typeof patch.ballOcclusionOpacity === 'number') {
        updateBallVisualConfig({ opacity: patch.ballOcclusionOpacity });
      }
    },
    []
  );

  const slotCombo = KICKOFF_COMBINATIONS[comboIndex];
  const slotSummary = slotCombo.map((idx) => KICKOFF_SLOT_PAIRS[idx].name).join(' + ');

  return (
    <div className="flex flex-col gap-8 max-w-6xl w-full">
      <div className="flex flex-col gap-1.5 pb-2 border-b border-neutral-200/80 dark:border-neutral-800">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="amber" size="sm" isLight={isLight}>
            5H · Five Hotel
          </Badge>
          <h1 className="text-2xl font-bold tracking-tight">
            Multiplayer Name Tag &amp; Boost Progress Calibration System
          </h1>
          <Badge variant="primary" size="sm" isLight={isLight}>
            Analytical 2D Canvas + Ball Occlusion Pass
          </Badge>
        </div>
        <p className={`text-xs leading-relaxed ${isLight ? 'text-neutral-600' : 'text-neutral-400'}`}>
          Static top-pinned View Box stage (non-sticky for comfortable dual-monitor workflows) — all
          camera POV selections, kickoff permutations, boost progress modes, ball occlusion masks,
          and per-car calibration overrides synchronize in real time across multiple browser windows
          and tabs.
        </p>
      </div>

      <section
        id="sec-nametag-stage"
        className={`p-5 rounded-3xl border flex flex-col gap-5 scroll-mt-24 ${
          isLight
            ? 'bg-white border-neutral-200 text-neutral-900 shadow-xs'
            : 'bg-neutral-900/80 border-neutral-800 text-neutral-100 shadow-xl'
        }`}
      >
        <NameTagStageCanvas
          config={config}
          cars={cars}
          focusedCarIndex={effectiveFocusedCarIndex}
          boostBorderOverride={boostBorderOverride}
          cameraFovDeg={cameraFovDeg}
          ballHeightOffset={ballHeightOffset}
          animateBoostWave={animateBoostWave}
          customNameOverride={customNameOverride}
          arenaPreset={arenaPreset}
          stageHeight={stageHeight}
        />

        <NameTagStageHeaderAndDeck
          isLight={isLight}
          comboIndex={comboIndex}
          slotSummary={slotSummary}
          cars={cars}
          effectiveFocusedCarIndex={effectiveFocusedCarIndex}
          focusFreeCamOverview={focusFreeCamOverview}
          selectPovCar={selectPovCar}
          reshuffleKickoffPositions={reshuffleKickoffPositions}
          stageControls={{
            animateBoostWave,
            setAnimateBoostWave,
            ballHeightOffset,
            setBallHeightOffset,
            cameraFovDeg,
            setCameraFovDeg,
            stageHeight,
            setStageHeight,
            arenaPreset,
            setArenaPreset,
            resetStageControls,
          }}
        />
      </section>

      <PageJumpDirectory
        layerTag="L5H · SPECIALS"
        title="5H · Multiplayer Name Tag & Boost Tuner"
        subtitle="Dedicated calibration workbench for 2D multiplayer name tags, 4 boost progress modes, and kickoff ball entity occlusion"
        items={JUMP_ITEMS}
        isLight={isLight}
      />

      <section
        id="sec-nametag-shootout"
        className={`rounded-2xl border p-6 flex flex-col gap-4 scroll-mt-24 ${
          isLight
            ? 'bg-neutral-900 text-neutral-100 border-neutral-800'
            : 'bg-neutral-900/75 border-neutral-800'
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-3">
          <div>
            <div className="text-xs font-mono font-bold text-teal-400">5H.1 · VISUAL SHOOTOUT</div>
            <h2 className="text-base font-bold text-white">
              4 Boost Indicator Modes &amp; Kickoff Ball Entity Occlusion
            </h2>
            <p className="text-xs text-neutral-400">
              Compare all 4 boost progress designs across short (&quot;K&quot;) vs long (&quot;AlphaStriker&quot;) names, and inspect analytical 2D destination-out ball occlusion (default 100% solid ball).
            </p>
          </div>
        </div>

        <NameTagModeShootoutSection
          config={config}
          onSelectMode={(mode) => updateNameTagConfig({ boostIndicatorMode: mode })}
          onUpdateConfig={handleUpdateConfigFromShootout}
        />
      </section>

      <NameTagTunerHeaderAndExportBar
        isLight={isLight}
        build5HExportCode={build5HExportCode}
        handleReset5HDefaults={handleReset5HDefaults}
        customNameOverride={customNameOverride}
        setCustomNameOverride={setCustomNameOverride}
        slotLayoutMode={slotLayoutMode}
        setSlotLayoutMode={setSlotLayoutMode}
      >
        <NameTagTunerFloatingWindow
          isLight={isLight}
          layout={slotLayoutMode === 'grid' ? 'grid' : 'column'}
        />
      </NameTagTunerHeaderAndExportBar>
    </div>
  );
};
