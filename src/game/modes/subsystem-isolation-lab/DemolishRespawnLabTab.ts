import {
  INCIDENT_EVENT_TYPES,
  RESPAWN_SPAWN_PRESETS,
  SIM_OFFSETS,
} from '../../../physics/RocketSimConstants.ts';
import { DEFAULT_CAR_CONTROLS } from '../../../ai/experimental/experimentalMultiCarObsPipeline.ts';
import { gameAudio } from '../../../audio/GameAudioEngineFacade.ts';
import { hudStore, useSubsystemIsolationLabStore } from '../../runtimeUiPort.ts';
import type { LabRuntimePort, LabTabContext, LabTabController } from './LabTabTypes.ts';

export interface RespawnSlotPresetCoords {
  slotIndex: number;
  label: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
}

export function resolveRespawnSlotPresetCoords(
  team: number,
  slotIndex: number
): RespawnSlotPresetCoords {
  const safeSlot = slotIndex >= 0 && slotIndex < RESPAWN_SPAWN_PRESETS.length ? slotIndex : 0;
  const preset = RESPAWN_SPAWN_PRESETS[safeSlot] || RESPAWN_SPAWN_PRESETS[0];
  const coords = team === 1 ? preset.team1 : preset.team0;
  return {
    slotIndex: safeSlot,
    label: preset.label,
    x: coords.x,
    y: coords.y,
    z: coords.z,
    yaw: coords.yaw,
  };
}

export function computeNextSteerSelectionSlot(
  currentSelection: number,
  direction: 'left' | 'right' | 'random' | string
): number {
  if (direction === 'left') {
    return currentSelection === 1 ? 0 : 1;
  }
  if (direction === 'right') {
    return currentSelection === 2 ? 3 : 2;
  }
  if (direction === 'random') {
    return -1;
  }
  return currentSelection;
}

interface DemolishRespawnRuntimeState {
  prevSteerSign: number;
  syntheticSteerPulseTicks: number;
  syntheticSteerValue: number;
  lastKnownDemoState: boolean;
}

export class DemolishRespawnLabTab implements LabTabController {
  readonly tabId = 'demolish-respawn' as const;
  private ctx: LabTabContext | null = null;
  private demolishRespawnRuntime: DemolishRespawnRuntimeState | null = null;

  private isCarDemolished(r: LabRuntimePort, carIdx = 0): boolean {
    if (typeof r.physics?.isCarDemolished === 'function') {
      return Boolean(r.physics.isCarDemolished(carIdx));
    }
    const timer = r.physics?.carMutators?.getCarDemoRespawnTimer?.(carIdx) ?? 0;
    return Boolean(r.physics?.getCarStateView?.(carIdx)?.isDemoed) || timer > 0;
  }

  private getCarDemoTimer(r: LabRuntimePort, carIdx = 0): number {
    if (typeof r.physics?.getCarDemolishTimer === 'function') {
      return Number(r.physics.getCarDemolishTimer(carIdx) || 0);
    }
    return Number(
      r.physics?.carMutators?.getCarDemoRespawnTimer?.(carIdx) ??
        r.physics?.getCarStateView?.(carIdx)?.demoRespawnTimer ??
        0
    );
  }

  private getCarRespawnSlot(r: LabRuntimePort, carIdx = 0): number {
    if (typeof r.physics?.getCarRespawnSelection === 'function') {
      return Number(r.physics.getCarRespawnSelection(carIdx));
    }
    return Number(
      r.physics?.carMutators?.getCarDemoSpawnSelection?.(carIdx) ??
        r.physics?.getCarStateView?.(carIdx)?.demoSpawnSelection ??
        -1
    );
  }

  private setCarRespawnSlot(r: LabRuntimePort, carIdx: number, slot: number): void {
    if (typeof r.physics?.setCarRespawnSelection === 'function') {
      r.physics.setCarRespawnSelection(carIdx, slot);
    } else {
      r.physics?.carMutators?.setCarDemoSpawnSelection?.(carIdx, slot);
    }
  }

  private respawnCarAtPreset(
    r: LabRuntimePort,
    carIdx: number,
    team: number,
    slotIndex: number
  ): void {
    if (typeof r.physics?.respawnCarAtPreset === 'function') {
      r.physics.respawnCarAtPreset(carIdx, team, slotIndex);
      return;
    }
    const coords = resolveRespawnSlotPresetCoords(team, slotIndex);
    const cy = Math.cos(coords.yaw);
    const sy = Math.sin(coords.yaw);
    if (this.isCarDemolished(r, carIdx)) {
      this.setCarRespawnSlot(r, carIdx, coords.slotIndex);
      r.physics?.carMutators?.respawnCar?.(carIdx, coords.slotIndex, 33.33);
    }
    r.physics?.setCarState?.(carIdx, {
      pos: [coords.x, coords.y, coords.z],
      vel: [0, 0, 0],
      angVel: [0, 0, 0],
      forward: [cy, sy, 0],
      right: [-sy, cy, 0],
      up: [0, 0, 1],
      boost: 33.33,
    });
  }

  onActivate(ctx: LabTabContext): void {
    this.ctx = ctx;
    this.setupBench();
  }

  onDeactivate(): void {
    this.demolishRespawnRuntime = null;
    this.ctx = null;
  }

  setupBench(): void {
    const r = this.ctx?.runtime;
    if (!r?.physics) return;
    const store = useSubsystemIsolationLabStore.getState();

    const team = store.demolishRespawnTeam ?? 0;
    const visualId = store.demolishRespawnVisualId || 'octane';

    while (r.physics.numCars > 2 && typeof r.physics.removeCar === 'function') {
      r.physics.removeCar(r.physics.numCars - 1);
    }
    if (r.physics.numCars < 1 && typeof r.physics.addCar === 'function') {
      r.physics.addCar(team, visualId);
    }
    if (r.physics.numCars < 2 && typeof r.physics.addCar === 'function') {
      r.physics.addCar(team === 0 ? 1 : 0, 'octane');
    }

    r.playerCarIndex = 0;
    if (r.arena) {
      r.arena.playerCarIndex = 0;
      r.arena.setCarTeam?.(0, team);
      r.arena.swapCarVisual?.(0, visualId);
      if (r.arena.cars?.[0]) r.arena.cars[0].visible = true;
      if (r.arena.cars?.[1]) {
        r.arena.setCarTeam?.(1, team === 0 ? 1 : 0);
        r.arena.cars[1].visible = Boolean(store.demolishRespawnObstacleEnabled);
      }
    }

    r.physics.setBallState?.({ pos: [0, 0, 93.15], vel: [0, 0, 0], angVel: [0, 0, 0] });
    this.respawnCarAtPreset(r, 0, team, 1);
    this.syncDummyObstacleCar(store);

    this.demolishRespawnRuntime = {
      prevSteerSign: 0,
      syntheticSteerPulseTicks: 0,
      syntheticSteerValue: 0,
      lastKnownDemoState: false,
    };

    if (store.demolishRespawnAutoHoldDemo) {
      this.triggerDemolish(false);
    } else {
      this.syncTelemetry();
    }

    r.interpolator?.sync?.();
    r.camera?.resetView?.();
  }

  private syncDummyObstacleCar(store = useSubsystemIsolationLabStore.getState()): void {
    const r = this.ctx?.runtime;
    if (!r?.physics || r.physics.numCars < 2) return;

    const enabled = Boolean(store.demolishRespawnObstacleEnabled);
    const team = store.demolishRespawnTeam ?? 0;
    const obstacleSlot = Math.max(0, Math.min(3, store.demolishRespawnObstacleSlot ?? 0));

    if (r.arena?.cars?.[1]) {
      r.arena.cars[1].visible = enabled;
      r.arena.setCarTeam?.(1, team === 0 ? 1 : 0);
    }

    if (enabled) {
      const coords = resolveRespawnSlotPresetCoords(team, obstacleSlot);
      const cy = Math.cos(coords.yaw);
      const sy = Math.sin(coords.yaw);
      r.physics.setCarState?.(1, {
        pos: [coords.x, coords.y, coords.z],
        vel: [0, 0, 0],
        angVel: [0, 0, 0],
        forward: [cy, sy, 0],
        right: [-sy, cy, 0],
        up: [0, 0, 1],
      });
      r.physics.setControls?.(1, { ...DEFAULT_CAR_CONTROLS, handbrake: true });
    } else {
      const oppY = team === 0 ? 3800 : -3800;
      r.physics.setCarState?.(1, {
        pos: [3200, oppY, 17.01],
        vel: [0, 0, 0],
        angVel: [0, 0, 0],
      });
      r.physics.setControls?.(1, DEFAULT_CAR_CONTROLS);
    }
  }

  triggerDemolish(playAudio = true): void {
    const r = this.ctx?.runtime;
    if (!r?.physics) return;
    const store = useSubsystemIsolationLabStore.getState();
    const team = store.demolishRespawnTeam ?? 0;

    if (r.arena) {
      r.arena.setCarTeam?.(0, team);
      if (store.demolishRespawnVisualId) {
        r.arena.swapCarVisual?.(0, store.demolishRespawnVisualId);
      }
    }

    const cv = r.physics.getCarStateView?.(0);
    const demoX = cv?.posX ?? 0;
    const demoY = cv?.posY ?? 0;
    const demoZ = cv?.posZ ?? 17.01;

    const timerSec = Math.max(0.5, Math.min(10.0, store.demolishRespawnTimerDurationSec ?? 3.0));
    r.physics.demolishCar?.(0, timerSec);

    if (playAudio) {
      const audio = r.options?.gameAudio || gameAudio;
      audio?.handleEvent?.(
        {
          type: INCIDENT_EVENT_TYPES.CAR_CAR_DEMO,
          carIndex: 0,
          primaryId: 0,
          x: demoX,
          y: demoY,
          z: demoZ,
        },
        r.camera
      );
    }

    if (store.demolishRespawnSelectedSlot >= 0 && store.demolishRespawnSelectedSlot <= 3) {
      this.setCarRespawnSlot(r, 0, store.demolishRespawnSelectedSlot);
    } else {
      this.setCarRespawnSlot(r, 0, -1);
    }

    this.syncDummyObstacleCar(store);
    r.interpolator?.sync?.();
    this.syncTelemetry();
  }

  forceRespawnNow(): void {
    const r = this.ctx?.runtime;
    if (!r?.physics) return;
    const store = useSubsystemIsolationLabStore.getState();
    const team = store.demolishRespawnTeam ?? 0;
    const selectedSlot =
      this.getCarRespawnSlot(r, 0) >= 0
        ? this.getCarRespawnSlot(r, 0)
        : (store.demolishRespawnSelectedSlot ?? -1);

    const slotToUse = selectedSlot >= 0 ? selectedSlot : 0;
    this.respawnCarAtPreset(r, 0, team, slotToUse);

    r.interpolator?.sync?.();
    this.syncTelemetry();
  }

  simulateSteerEdge(direction: 'left' | 'right' | 'random' | string): void {
    const r = this.ctx?.runtime;
    if (!r?.physics) return;
    const store = useSubsystemIsolationLabStore.getState();

    if (!this.isCarDemolished(r, 0)) {
      this.triggerDemolish();
    }

    const currentSel = this.getCarRespawnSlot(r, 0);
    const nextSlot = computeNextSteerSelectionSlot(currentSel, direction);

    this.setCarRespawnSlot(r, 0, nextSlot);
    store.updateLiveTelemetry({
      demolishRespawnSelectedSlot: nextSlot,
      demolishRespawnLastInputEdge:
        direction === 'left'
          ? `LEFT (A / Steer < -0.5) -> Slot ${nextSlot}`
          : direction === 'right'
            ? `RIGHT (D / Steer > +0.5) -> Slot ${nextSlot}`
            : 'RESET -> Random (-1)',
    });

    this.syncTelemetry();
  }

  selectSlotDirect(slotIndex: number): void {
    const r = this.ctx?.runtime;
    if (!r?.physics) return;
    const store = useSubsystemIsolationLabStore.getState();
    const clamped = slotIndex < 0 ? -1 : Math.max(0, Math.min(3, Math.round(slotIndex)));

    if (!this.isCarDemolished(r, 0)) {
      this.triggerDemolish();
    }

    this.setCarRespawnSlot(r, 0, clamped);
    store.updateLiveTelemetry({
      demolishRespawnSelectedSlot: clamped,
      demolishRespawnLastInputEdge: clamped < 0 ? 'Direct: Random (-1)' : `Direct: Slot ${clamped}`,
    });

    this.syncTelemetry();
  }

  applyConfigChange(): void {
    const r = this.ctx?.runtime;
    if (!r?.physics) return;
    const store = useSubsystemIsolationLabStore.getState();
    const team = store.demolishRespawnTeam ?? 0;
    const visualId = store.demolishRespawnVisualId || 'octane';

    if (r.physics.state) {
      const car0Base = SIM_OFFSETS.CARS;
      r.physics.state[car0Base + 25] = team;
    }
    if (r.arena) {
      r.arena.setCarTeam?.(0, team);
      r.arena.swapCarVisual?.(0, visualId);
    }

    this.syncDummyObstacleCar(store);

    if (!this.isCarDemolished(r, 0)) {
      if (store.demolishRespawnAutoHoldDemo) {
        this.triggerDemolish();
      } else {
        const slot = store.demolishRespawnSelectedSlot >= 0 ? store.demolishRespawnSelectedSlot : 1;
        this.respawnCarAtPreset(r, 0, team, slot);
        r.interpolator?.sync?.();
      }
    }
    this.syncTelemetry();
  }

  onPhysicsTick(_dt: number): boolean {
    const r = this.ctx?.runtime;
    const store = useSubsystemIsolationLabStore.getState();
    if (!r?.physics) return true;

    if (!this.demolishRespawnRuntime) {
      this.demolishRespawnRuntime = {
        prevSteerSign: 0,
        syntheticSteerPulseTicks: 0,
        syntheticSteerValue: 0,
        lastKnownDemoState: false,
      };
    }

    const isDemo = this.isCarDemolished(r, 0);
    let demoTimer = this.getCarDemoTimer(r, 0);

    if (isDemo && store.demolishRespawnFreezeTimer && demoTimer > 0.05) {
      const holdSec = Math.max(0.5, store.demolishRespawnTimerDurationSec ?? 2.5);
      const currentSel = this.getCarRespawnSlot(r, 0);
      r.physics.demolishCar?.(0, holdSec);
      this.setCarRespawnSlot(r, 0, currentSel);
      demoTimer = holdSec;
    }

    const currentSel = this.getCarRespawnSlot(r, 0);
    if (isDemo && currentSel !== store.demolishRespawnSelectedSlot) {
      store.updateLiveTelemetry({
        demolishRespawnSelectedSlot: currentSel,
        demolishRespawnLastInputEdge: `Keyboard Steer -> Slot ${currentSel}`,
      });
    }

    this.demolishRespawnRuntime.lastKnownDemoState = isDemo;
    this.syncTelemetry();
    return true;
  }

  private syncTelemetry(): void {
    const r = this.ctx?.runtime;
    if (!r?.physics) return;
    const store = useSubsystemIsolationLabStore.getState();

    const isDemo = this.isCarDemolished(r, 0);
    const demoTimer = this.getCarDemoTimer(r, 0);
    const selectedSlot = this.getCarRespawnSlot(r, 0);
    const team = store.demolishRespawnTeam ?? 0;
    const effectiveSlot = selectedSlot >= 0 && selectedSlot <= 3 ? selectedSlot : 0;
    const coords = resolveRespawnSlotPresetCoords(team, effectiveSlot);

    if (isDemo && r.physics.state) {
      r.arena?.respawnGhostPreview?.update?.(r.physics.state, 0);
    }

    const carView = r.interpolator?.getCarView?.(0, r.arena);
    const carPos = carView
      ? [
          Number(carView.pos?.[0]?.toFixed?.(1) ?? 0),
          Number(carView.pos?.[1]?.toFixed?.(1) ?? 0),
          Number(carView.pos?.[2]?.toFixed?.(1) ?? 0),
        ]
      : [coords.x, coords.y, coords.z];

    let wheelLocalYs: number[] = [];
    const ghostWheels = r.arena?.respawnGhostPreview?.wheels;
    if (Array.isArray(ghostWheels) && ghostWheels.length > 0) {
      wheelLocalYs = ghostWheels.map((w) =>
        Number((w?.steer?.position?.y ?? w?.position?.y ?? 0).toFixed(2))
      );
    }

    hudStore
      .getState()
      .setDemoRespawnState?.(isDemo, isDemo ? Math.max(0.1, demoTimer) : 0, selectedSlot);

    store.updateLiveTelemetry({
      demolishRespawnIsDemolished: isDemo,
      demolishRespawnRemainingSec: Number(demoTimer.toFixed(2)),
      demolishRespawnSelectedSlot: selectedSlot,
      demolishRespawnPreviewSlotLabel:
        selectedSlot < 0
          ? `Random (Preview: ${coords.label})`
          : `${coords.label} (Slot ${selectedSlot})`,
      demolishRespawnPreviewCoords: [coords.x, coords.y, coords.z],
      demolishRespawnPreviewYawDeg: Number(((coords.yaw * 180) / Math.PI).toFixed(1)),
      demolishRespawnCarActualPos: carPos,
      demolishRespawnWheelLocalY: wheelLocalYs,
    });
  }
}
