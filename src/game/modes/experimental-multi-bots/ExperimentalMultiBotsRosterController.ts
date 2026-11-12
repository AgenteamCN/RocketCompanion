import {
  ExperimentalBotAgent,
  ensureExperimentalEngine,
  isExperimentalEngineReady,
} from '../../../ai/experimental/ExperimentalBotAgent.ts';
import { DEFAULT_CAR_CONTROLS } from '../../../ai/experimental/experimentalMultiCarObsPipeline.ts';
import { resetSharedBallPredictionCache } from '../../../ai/experimental/botpackSharedBallPredPipeline.ts';
import {
  normalizeVisualId,
  resolveVehicleHitboxId,
} from '../../../ui-core/config/vehicleConstants.ts';
import {
  useExperimentalMultiBotsStore,
  getExpColorSwatch,
  useSpatialAudioStore,
  setNameTagRuntimeState,
} from '../../runtimeUiPort.ts';
import { getMaterialsConfig } from '../../../ui-core/config/materialsConfig.ts';
import { rollRandomBotLoadout } from '../../../ui-core/config/botsLoadoutConfig.ts';
import { assignTeamSlotKeys } from '../../../replay/container/RCReplayTimelineParser.ts';
import {
  type CarControls,
  type ExpActiveCarRef,
  type ExpModeRuntimePort,
  type ExpSpawnedCarEntry,
  computeKickoffSpawnPlacement,
  getExpCarDisplayName,
  getExpModeAudio,
} from './ExperimentalMultiBotsMatchMath.ts';

interface ExpCombinedSlotConfig {
  id?: string;
  team: 0 | 1;
  teamSlotIndex: number;
  isPlayer?: boolean;
  botType: string;
  colorSlot: number;
  visualId?: string;
  hitboxId?: string;
  paintFinish?: string;
  boostVisual?: string;
  boostAudio?: string;
}

export class ExperimentalMultiBotsRosterController {
  private readonly runtime: ExpModeRuntimePort | null;
  public spawnedCars: ExpSpawnedCarEntry[] = [];
  public activeCarsList: ExpActiveCarRef[] = [];
  public readonly carControlsMap = new Map<number, CarControls>();
  public humanPlayerCarIndex = -1;
  public kickoffPermutationSeed = 0;

  constructor(runtime: ExpModeRuntimePort | null) {
    this.runtime = runtime;
  }

  getCarControls(carIndex: number): CarControls {
    return (
      this.carControlsMap.get(carIndex) || this.runtime?.neutralControls || DEFAULT_CAR_CONTROLS
    );
  }

  applyCameraCarIndex(carIdx = 0): number {
    const r = this.runtime;
    if (!r) return 0;
    const maxIdx = Math.max(0, this.spawnedCars.length - 1);
    const clamped = Math.max(0, Math.min(maxIdx, Math.round(carIdx)));
    r.playerCarIndex = clamped;
    if (r.arena) {
      r.arena.playerCarIndex = clamped;
    }
    useExperimentalMultiBotsStore.getState().updateLiveTelemetry({
      activeCameraCarIndex: clamped,
    });
    return clamped;
  }

  resolveDefaultCameraCarIndex(): number {
    if (this.humanPlayerCarIndex >= 0) {
      return this.humanPlayerCarIndex;
    }
    const storeCamIdx = useExperimentalMultiBotsStore.getState().activeCameraCarIndex;
    return Math.max(0, Math.min(this.spawnedCars.length - 1, storeCamIdx));
  }

  applySpeedMultiplier(multiplierPct = 100): void {
    const r = this.runtime;
    if (!r?.interpolator) return;
    const mult = Math.max(100, Math.min(400, Number(multiplierPct) || 100));
    const targetRate = Math.round(120 * (mult / 100));
    r.interpolator.setTrainingPhysicsRate?.(targetRate);
  }

  async preloadNativeModels(): Promise<void> {
    const store = useExperimentalMultiBotsStore.getState();
    const activeTypes = new Set<string>(['nexto', 'necto']);
    for (const s of [...(store.blueSlots || []), ...(store.orangeSlots || [])]) {
      if (s?.botType && s.botType !== 'heuristic') {
        activeTypes.add(s.botType);
      }
    }
    if (store.activeBotpackShowcaseModel) {
      activeTypes.add(store.activeBotpackShowcaseModel);
    }
    await Promise.all(Array.from(activeTypes).map((botType) => ensureExperimentalEngine(botType)));
    useExperimentalMultiBotsStore.getState().updateLiveTelemetry({
      nextoLoaded: isExperimentalEngineReady('nexto'),
      nectoLoaded: isExperimentalEngineReady('necto'),
    });
  }

  publishSpawnedCarsTelemetry(): void {
    const store = useExperimentalMultiBotsStore.getState();
    store.updateLiveTelemetry({
      spawnedCars: this.spawnedCars.map((c) => ({
        carIndex: c.carIndex,
        keyNumber: c.keyNumber,
        team: c.team,
        teamSlotIndex: c.teamSlotIndex,
        isPlayer: c.isPlayer,
        botType: c.botType,
        visualId: c.visualId,
        hitboxId: c.hitboxId,
        colorSlot: c.colorSlot,
        colorHex: c.colorHex,
        colorName: c.colorName,
        paintFinish: c.paintFinish,
        boostVisual: c.boostVisual,
        boostAudio: c.boostAudio,
        anthemId: c.anthemId,
        name: c.name,
        label: c.label,
      })),
      nextoLoaded: isExperimentalEngineReady('nexto'),
      nectoLoaded: isExperimentalEngineReady('necto'),
    });

    setNameTagRuntimeState({
      isMultiplayerOrMultiCarMode: true,
      carEntries: this.spawnedCars.map((c) => ({
        carIndex: c.carIndex,
        name: c.name || getExpCarDisplayName(c, this.spawnedCars),
        team: c.team === 1 ? 1 : 0,
      })),
    });
  }

  syncCarColorsFromStore(): void {
    const r = this.runtime;
    const store = useExperimentalMultiBotsStore.getState();
    for (const entry of this.spawnedCars) {
      const slotList = entry.team === 0 ? store.blueSlots : store.orangeSlots;
      const cfg = slotList[entry.teamSlotIndex];
      if (!cfg) continue;
      const swatch = getExpColorSwatch(cfg.colorSlot);
      entry.colorSlot = swatch.id;
      entry.colorHex = swatch.hex;
      entry.colorName = swatch.name;
      r?.arena?.setCarColor?.(entry.carIndex, swatch.hex);
    }
    this.publishSpawnedCarsTelemetry();
  }

  async spawnRosterFromStore(): Promise<number> {
    const r = this.runtime;
    if (!r?.physics) return 0;

    if (useExperimentalMultiBotsStore.getState().isExhibitionMode) {
      useExperimentalMultiBotsStore.getState().syncExhibitionFromColorPrefs?.(false);
    }
    const store = useExperimentalMultiBotsStore.getState();

    await r.arena?.ensureOpponent?.();
    if (r.match?.state?.mode !== 'exp-multi-bots') return 0;

    const blueSlots = store.blueSlots.slice(0, 5);
    const orangeSlots = store.orangeSlots.slice(0, 5);
    const combinedSlots: ExpCombinedSlotConfig[] = [
      ...blueSlots.map((s, idx) => ({ ...s, team: 0 as const, teamSlotIndex: idx })),
      ...orangeSlots.map((s, idx) => ({ ...s, team: 1 as const, teamSlotIndex: idx })),
    ].slice(0, 6);

    if (combinedSlots.length === 0) {
      combinedSlots.push({
        id: 'blue-0',
        team: 0 as const,
        teamSlotIndex: 0,
        isPlayer: false,
        botType: 'necto',
        colorSlot: 3,
      });
    }

    while (r.physics.numCars > 0) {
      r.physics.removeCar(r.physics.numCars - 1);
    }

    this.spawnedCars = [];
    this.activeCarsList = [];
    this.carControlsMap.clear();
    this.humanPlayerCarIndex = -1;

    const matCfg = getMaterialsConfig();
    const audio = getExpModeAudio(r);
    const userAnthemId = useSpatialAudioStore.getState?.()?.selectedAnthem || 'random';
    const usedColorSlotsByTeam: Record<0 | 1, Set<number>> = {
      0: new Set<number>(),
      1: new Set<number>(),
    };
    const usedBotBoostVisualsByTeam: Record<0 | 1, Set<string>> = {
      0: new Set<string>(),
      1: new Set<string>(),
    };

    for (let i = 0; i < combinedSlots.length; i++) {
      const slot = combinedSlots[i];
      const carIndex = i;
      const keyNumber = i + 1;
      const isPlayer =
        (store.playerParticipation === 'blue' && slot.team === 0 && slot.teamSlotIndex === 0) ||
        (store.playerParticipation === 'orange' && slot.team === 1 && slot.teamSlotIndex === 0);

      const teamKey: 0 | 1 = slot.team === 1 ? 1 : 0;
      const rolledBot = isPlayer
        ? null
        : rollRandomBotLoadout(
            null,
            teamKey,
            usedColorSlotsByTeam[teamKey],
            usedBotBoostVisualsByTeam[teamKey]
          );

      const swatch =
        typeof slot.colorSlot === 'number' && !usedColorSlotsByTeam[teamKey].has(slot.colorSlot)
          ? getExpColorSwatch(slot.colorSlot)
          : getExpColorSwatch(rolledBot?.colorSlot ?? slot.colorSlot);
      usedColorSlotsByTeam[teamKey].add(swatch.id);

      const visualId = normalizeVisualId(
        isPlayer ? r.selectedPreset || 'fennec' : rolledBot?.visualId || slot.visualId || 'fennec'
      );
      const hitboxId = isPlayer
        ? r.selectedHitbox || resolveVehicleHitboxId(visualId)
        : rolledBot?.hitboxId || slot.hitboxId || resolveVehicleHitboxId(visualId);
      const paintFinish = isPlayer
        ? matCfg?.paintFinish || 'metallic'
        : rolledBot?.paintFinish || slot.paintFinish || 'metallic';
      const boostVisual = isPlayer
        ? matCfg?.boostVisual || 'light-wave'
        : rolledBot?.boostVisual || slot.boostVisual || 'light-wave';
      if (!isPlayer) {
        usedBotBoostVisualsByTeam[teamKey].add(boostVisual);
      }
      const boostAudio = isPlayer
        ? matCfg?.boostAudio || 'standard'
        : rolledBot?.boostAudio || slot.boostAudio || 'standard';
      const anthemId = isPlayer ? userAnthemId : rolledBot?.anthemId || 'TrainStation';

      r.physics.addCar(teamKey, hitboxId);
      r.physics.setCarTeam?.(carIndex, teamKey);
      r.physics.setCarHitbox?.(carIndex, hitboxId);

      if (r.arena) {
        r.arena.ensureCar?.(carIndex, teamKey, visualId);
        r.arena.setCarTeam?.(carIndex, teamKey);
        r.arena.setCarColor?.(carIndex, swatch.hex);
        r.arena.setCarLoadout?.(carIndex, {
          colorHex: swatch.hex,
          paintFinish,
          boostVisual,
          boostAudio,
          isBot: !isPlayer,
        });
        if (r.arena.cars?.[carIndex]) {
          r.arena.cars[carIndex].visible = true;
        }
      }
      audio?.setCarBoostAudioVariation?.(carIndex, boostAudio);

      if (isPlayer) {
        this.humanPlayerCarIndex = carIndex;
        r.selectedColorSlot = swatch.id;
      }

      const agent = isPlayer ? null : new ExperimentalBotAgent(slot.botType, carIndex, teamKey);

      const label = isPlayer
        ? `PLAYER (${teamKey === 0 ? 'Blue' : 'Orange'})`
        : `${String(slot.botType || 'bot').toUpperCase()} #${keyNumber}`;

      this.spawnedCars.push({
        carIndex,
        keyNumber,
        team: teamKey,
        teamSlotIndex: slot.teamSlotIndex,
        isPlayer,
        botType: slot.botType,
        visualId,
        hitboxId,
        colorSlot: swatch.id,
        colorHex: swatch.hex,
        colorName: swatch.name,
        paintFinish,
        boostVisual,
        boostAudio,
        anthemId,
        label,
        agent,
      });

      this.activeCarsList.push({
        carIndex,
        team: teamKey,
      });
      this.carControlsMap.set(carIndex, { ...DEFAULT_CAR_CONTROLS });
    }

    const localTeamForKeys =
      this.humanPlayerCarIndex >= 0 && this.spawnedCars[this.humanPlayerCarIndex]?.team === 1
        ? 1
        : 0;
    const blueCarsForKeys = this.spawnedCars.filter((c) => c.team === 0);
    const orangeCarsForKeys = this.spawnedCars.filter((c) => c.team === 1);
    const leftCarsForKeys = localTeamForKeys === 1 ? orangeCarsForKeys : blueCarsForKeys;
    const rightCarsForKeys = localTeamForKeys === 1 ? blueCarsForKeys : orangeCarsForKeys;
    const { leftSlotKeys, rightSlotKeys } = assignTeamSlotKeys(leftCarsForKeys, rightCarsForKeys);
    leftCarsForKeys.forEach((c, idx) => {
      c.keyNumber = leftSlotKeys[idx] ?? idx + 1;
    });
    rightCarsForKeys.forEach((c, idx) => {
      c.keyNumber = rightSlotKeys[idx] ?? idx + 4;
    });

    for (const entry of this.spawnedCars) {
      entry.label = entry.isPlayer
        ? `PLAYER (${entry.team === 0 ? 'Blue' : 'Orange'})`
        : `${String(entry.botType || 'bot').toUpperCase()} #${entry.keyNumber}`;
      entry.name = getExpCarDisplayName(entry, this.spawnedCars);
      r.arena?.setCarLoadout?.(entry.carIndex, { name: entry.name });
    }

    if (r.arena?.cars) {
      for (let i = combinedSlots.length; i < r.arena.cars.length; i++) {
        if (r.arena.cars[i]) {
          r.arena.cars[i].visible = false;
        }
      }
    }

    const targetCamIdx = this.resolveDefaultCameraCarIndex();
    this.applyCameraCarIndex(targetCamIdx);
    this.applySpeedMultiplier(store.speedMultiplier);

    r.physics.setUnlimitedBoost(Boolean(store.unlimitedBoost));
    r.physics.setPossessionReportingEnabled?.(true);
    r.physics.resetPossessionStats?.();
    this.kickoffPermutationSeed = 0;

    return targetCamIdx;
  }

  resetMultiCarKickoffSpawns(): void {
    const r = this.runtime;
    const sim = r?.physics;
    if (!sim) return;

    sim.resetGoalLatch?.();
    sim.resetKickoff(0, false);

    const seed = this.kickoffPermutationSeed++;
    const unlimitedBoost = Boolean(useExperimentalMultiBotsStore.getState().unlimitedBoost);

    for (const entry of this.spawnedCars) {
      const placement = computeKickoffSpawnPlacement(entry, seed, unlimitedBoost);
      sim.setCarTeam?.(entry.carIndex, entry.team);
      sim.setCarState(entry.carIndex, placement);
      entry.agent?.reset();
      this.carControlsMap.set(entry.carIndex, { ...DEFAULT_CAR_CONTROLS });
    }

    sim.setBallState({
      pos: [0, 0, 93.15],
      vel: [0, 0, 0],
      angVel: [0, 0, 0],
    });
    resetSharedBallPredictionCache();
    r.ballTrajectoryPredictor?.clear?.();

    const targetCamIdx = this.resolveDefaultCameraCarIndex();
    this.applyCameraCarIndex(targetCamIdx);

    r.camera?.resetView?.();
    r.interpolator?.sync?.();
  }

  cleanupExtraCarsOnLeave(): void {
    const r = this.runtime;
    this.humanPlayerCarIndex = -1;
    this.spawnedCars = [];
    this.activeCarsList = [];
    this.carControlsMap.clear();
    resetSharedBallPredictionCache();
    r?.ballTrajectoryPredictor?.clear?.();
    r?.interpolator?.setTrainingPhysicsRate?.(120);
    if (r?.physics) {
      while (r.physics.numCars > 1) {
        r.physics.removeCar(r.physics.numCars - 1);
      }
      if (r.physics.numCars < 1) {
        const preferredTeam: 0 | 1 = (r.teamAssignment?.playerTeam ?? 0) === 1 ? 1 : 0;
        r.physics.addCar(preferredTeam, r.selectedHitbox || 'octane');
      }
      r.physics.setSimulationFrozen?.(false, 0, false);
      r.physics.setUnlimitedBoost?.(true);
    }
    setNameTagRuntimeState({
      isMultiplayerOrMultiCarMode: false,
      carEntries: [],
    });
    if (r?.arena?.cars) {
      if (r.arena.cars[0]) r.arena.cars[0].visible = true;
      for (let i = 1; i < r.arena.cars.length; i++) {
        if (r.arena.cars[i]) r.arena.cars[i].visible = false;
        r.arena.resetCarBoosts?.(i);
        r.arena.carDemolitions?.[i]?.stop?.();
        r.arena.supersonicWheelTrailSystem?.resetCar?.(i);
      }
      r.arena.lighting?.updateSunIntensities?.(1);
    }
    r?.audioSubsystem?.resetAudio?.();
    if (r) {
      r.playerCarIndex = 0;
      if (r.arena) r.arena.playerCarIndex = 0;
      r.loadoutCoordinator?.restoreLocalPlayerFreeplayLoadout?.(0);
    }
  }
}
