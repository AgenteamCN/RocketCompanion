import { MATCH_SIGNALS } from '../../network/protocol/GlobalPayloadCodec.ts';
import {
  INCIDENT_EVENT_TYPES,
  FLIP_RESET_SUBTYPES,
  FLIP_RESET_OBJECT_TYPES,
} from '../../physics/RocketSimConstants.ts';
import {
  CAR_COLOR_SLOTS,
  unpackLoadoutSignalParam2,
} from '../../ui-core/config/vehicleConstants.ts';
import { gameAudio } from '../../audio/GameAudioEngineFacade.ts';
import { useAppStore, useSpatialAudioStore, eventStreamStore } from '../runtimeUiPort.ts';
import type { ArenaWorld } from '../../entities/ArenaWorld.ts';
import type { EntityManager } from '../../entities/EntityManager.ts';
import type { RocketSimPhysicsEngine } from '../../physics/RocketSimPhysicsEngine.ts';
import type { PhysicsStateInterpolator } from '../../physics/PhysicsStateInterpolator.ts';
import type { CameraManager } from '../../camera/CameraManager.ts';
import type { RuntimeMatchState } from './RuntimeMatchState.ts';
import type { AuthoritativeServerHost } from '../../network/server/AuthoritativeServerHost.ts';
import type { PredictionReconciler } from '../../network/client/PredictionReconciler.ts';
import type { ReplayTimelineController } from '../../replay/ReplayTimelineController.ts';
import type { PodiumCelebrationController } from '../modes/PodiumCelebrationController.ts';
import type { SimulationStage } from '../pipeline/stages/SimulationStage.ts';
import type { GameAudioSubsystem } from '../subsystems/GameAudioSubsystem.ts';
import type { OnlineRosterSnapshotPayload } from './OnlineRosterSyncCoordinator.ts';

export interface RuntimeSignalPacket {
  signalId?: number;
  signalType: number;
  frameId?: number;
  param1?: number;
  param2?: number;
}

export interface SignalAudioFacadeLike {
  play(soundId: string, volume?: number, cooldownMs?: number): void;
  resetIncidentDebounceState?(): void;
  handleEvent?(event: Record<string, unknown>, camera: unknown): void;
  setCarBoostAudioVariation?(carIndex: number, variation: string): void;
}

export interface RuntimeSignalLatchState {
  readonly seenSignalIds: Set<number>;
  lastPreparedMatchSeq: number;
  hostMatchReplayNotified: boolean;
  overtimeAudioPlayed: boolean;
  lastKickoffTargetFrame: number;
  readonly latchedKickoffSeconds: Set<number>;
  lastKickoffStartedFrame: number;
  lastAlert60Frame: number;
  lastAlert30Frame: number;
}

export interface RuntimeSignalActiveModePort {
  id?: string;
  onPhysicsEvent?(event: Record<string, unknown>): void;
  skipGoalReplay?(): void;
  setReplayCameraMode?(mode: 'director' | 'pov'): void;
  replaySession?: {
    isReplayActive?: boolean;
    replayCameraMode?: 'director' | 'pov' | string;
    replayPovCarIndex?: number | null;
  } | null;
  directorPreview?: {
    isReplayActive?: boolean;
    goalScorerCarIndex?: number;
  } | null;
  rewinderController?: {
    isBlockingLivePhysics?: boolean;
    isScrubbing?: boolean;
  } | null;
  standaloneReplayViewer?: {
    isActive?: boolean;
  } | null;
  isGoalReplayActive?(): boolean;
  goalReplayPhase?: string;
}

export interface RuntimeSignalHostPort {
  readonly arena: ArenaWorld | null;
  readonly physics: RocketSimPhysicsEngine | null;
  readonly entityManager: EntityManager | null;
  readonly options: { gameAudio?: SignalAudioFacadeLike; [key: string]: unknown } | null;
  readonly flipResetVisuals: Map<number, { stopVisual(): void; play?(): void }>;
  readonly match: RuntimeMatchState | null;
  readonly modeManager: {
    setMode?(modeName: string): void;
    getActiveMode?(): RuntimeSignalActiveModePort | null;
  } | null;
  readonly replayTimelineController: ReplayTimelineController | null;
  readonly podiumController: PodiumCelebrationController | null;
  readonly camera: CameraManager | null;
  readonly interpolator: PhysicsStateInterpolator | null;
  readonly simulationStage: SimulationStage | null;
  readonly audioSubsystem: GameAudioSubsystem | null;
  readonly authoritativeServer: AuthoritativeServerHost | null;
  readonly remotePeerCarMap: Map<string, number>;
  playerCarIndex: number;
  replayPovCarIndex?: number | null;
  selectedColorSlot: number | null;
  clientReplayOverflowPaused: boolean;
  _clientGoalIncidentLatched: boolean;
  _localSkipReplayReady: boolean;
  getLastRosterSnapshot(): OnlineRosterSnapshotPayload | null;
  getParticipantTeams(): Map<number, number>;
  syncHostLobbyOngoingNotification(): void;
  isLobbyDualWorldActive(reconciler?: PredictionReconciler | null): boolean;
  despawnDiagnosticTestFleet(): void;
  setLobbyGhostMode(
    enabled: boolean,
    options?: { syncServerLobby?: boolean }
  ): Promise<boolean> | boolean;
  setLatestServerRosterState(state: string): void;
  isNetworkTelemetryNotified(): boolean;
  markNetworkTelemetryNotified(notified: boolean): void;
  resetBotKickoffStep(): void;
  isGoalReplayCameraOverrideActive(): boolean;
  acquireGoalReplayCameraOverride?(source?: string): void;
  releaseGoalReplayCameraOverride(source?: string | null): void;
  getFlipResetVisual?(carIdx: number): { play(): void } | null;
  resetAudio?(): void;
  latchJumpSuppression?(): void;
  setCarColor(carIndex: number, hexColor: string, persistPreference?: boolean): void;
}

export interface RosterPlayerEntryLike {
  carIndex?: number;
  entityId?: number;
  name?: string;
  username?: string;
  anthemId?: string;
  isBot?: boolean;
}

function extractRosterPlayers(
  lastRosterSnapshot: OnlineRosterSnapshotPayload | RosterPlayerEntryLike[] | null | undefined
): RosterPlayerEntryLike[] {
  if (!lastRosterSnapshot) return [];
  if (Array.isArray(lastRosterSnapshot)) return lastRosterSnapshot;
  return Array.isArray(lastRosterSnapshot.players)
    ? (lastRosterSnapshot.players as RosterPlayerEntryLike[])
    : [];
}

export function resolveParticipantDisplayName(
  lastRosterSnapshot: OnlineRosterSnapshotPayload | RosterPlayerEntryLike[] | null | undefined,
  playerCarIndex: number,
  carIndex: number,
  scoringTeam = 0
): string {
  const rosterPlayers = extractRosterPlayers(lastRosterSnapshot);
  const found = rosterPlayers.find(
    (p) => p && (p.carIndex === carIndex || p.entityId === carIndex)
  );
  if (found && (found.name || found.username)) return found.name || found.username || 'Player';
  const peers = useAppStore?.getState?.()?.onlineSession?.connectedPeers || [];
  const peer = peers.find((p) => p && p.carIndex === carIndex);
  if (peer && peer.name) return peer.name;
  if (carIndex === playerCarIndex) {
    return useAppStore?.getState?.()?.onlineSession?.playerName || 'Player';
  }
  return scoringTeam === 1 ? 'ORANGE' : 'BLUE';
}

export function resolveParticipantAnthemId(
  lastRosterSnapshot: OnlineRosterSnapshotPayload | RosterPlayerEntryLike[] | null | undefined,
  playerCarIndex: number,
  carIndex: number
): string | null {
  if (carIndex === playerCarIndex) {
    const localAnthem = useSpatialAudioStore?.getState?.()?.selectedAnthem;
    if (localAnthem) return localAnthem;
  }
  const rosterPlayers = extractRosterPlayers(lastRosterSnapshot);
  const found = rosterPlayers.find(
    (p) => p && (p.carIndex === carIndex || p.entityId === carIndex)
  );
  return found?.anthemId || null;
}

export class RuntimeParticipantAndCombatSignalSubController {
  public readonly host: RuntimeSignalHostPort;

  constructor(host: RuntimeSignalHostPort) {
    this.host = host;
  }

  private syncJoinedParticipantCarInWorld(
    carIdx: number,
    team: number,
    preset: string,
    isLobbyDualWorld: boolean
  ): void {
    const { physics, arena, playerCarIndex } = this.host;
    if (isLobbyDualWorld && carIdx !== playerCarIndex) {
      if (arena?.cars?.[carIdx]) arena.cars[carIdx].visible = false;
      return;
    }
    if (physics) {
      physics.addCarAtSlot(carIdx, team, preset);
      physics.setCarTeam?.(carIdx, team);
    }
    if (arena) {
      arena.vehicleRegistry.ensureCar(carIdx, team, 'fennec');
      arena.vehicleRegistry.setCarTeam(carIdx, team);
      if (arena.cars[carIdx]) {
        arena.cars[carIdx].visible = isLobbyDualWorld ? carIdx === playerCarIndex : true;
      }
    }
    if (preset) physics?.setCarHitbox?.(carIdx, preset);
  }

  private applyParticipantLoadoutToWorld(
    carIdx: number,
    loadout: ReturnType<typeof unpackLoadoutSignalParam2>,
    isLobbyDualWorld: boolean
  ): void {
    const {
      visualId,
      hitboxId,
      colorSlot: colorSlotId,
      paintFinish,
      boostVisual,
      boostAudio,
    } = loadout;
    const { arena, physics, entityManager, playerCarIndex, options } = this.host;

    if (isLobbyDualWorld && carIdx !== playerCarIndex) {
      if (arena?.cars?.[carIdx]) arena.cars[carIdx].visible = false;
      return;
    }
    if (arena && !arena.cars[carIdx]) arena.vehicleRegistry.ensureCar(carIdx, carIdx % 2, 'fennec');
    const currentConfig = entityManager?.getVehicle?.(carIdx);
    if (currentConfig?.visual !== visualId || currentConfig?.hitbox !== hitboxId) {
      if (entityManager) {
        entityManager.hotSwapVehicle(carIdx, { visual: visualId, hitbox: hitboxId });
      } else {
        arena?.vehicleRegistry.swapCarVisual(carIdx, visualId);
        physics?.setCarHitbox?.(carIdx, hitboxId);
      }
    } else {
      physics?.setCarHitbox?.(carIdx, hitboxId);
    }

    let colorHex: string | null = null;
    if (colorSlotId >= 0 && colorSlotId < CAR_COLOR_SLOTS.length) {
      const slotObj =
        CAR_COLOR_SLOTS[colorSlotId] || CAR_COLOR_SLOTS.find((s) => s.id === colorSlotId);
      if (slotObj) {
        colorHex = slotObj.hex;
        arena?.vehicleRegistry.setCarColor(carIdx, slotObj.hex);
        if (carIdx === playerCarIndex) this.host.selectedColorSlot = slotObj.id;
      }
    }
    const rosterPlayers = extractRosterPlayers(this.host.getLastRosterSnapshot());
    const matchedPlayer = rosterPlayers.find(
      (p) => p && (p.carIndex === carIdx || p.entityId === carIdx)
    );
    const isBot =
      carIdx === playerCarIndex
        ? false
        : matchedPlayer?.isBot !== undefined
          ? Boolean(matchedPlayer.isBot)
          : undefined;

    arena?.vehicleRegistry.setCarLoadout(carIdx, {
      colorHex: colorHex || undefined,
      paintFinish,
      boostVisual,
      boostAudio,
      ...(isBot !== undefined ? { isBot } : {}),
    });
    const audioEngine = options?.gameAudio || gameAudio;
    audioEngine?.setCarBoostAudioVariation?.(carIdx, boostAudio || 'rush');
  }

  private removeLeftParticipantFromWorld(leftCarIndex: number): void {
    const { physics, arena, flipResetVisuals, playerCarIndex } = this.host;
    if (leftCarIndex < 0 || leftCarIndex >= 65535 || leftCarIndex === playerCarIndex) return;
    physics?.removeCar(leftCarIndex);
    arena?.vehicleRegistry.removeCar(leftCarIndex);
    if (flipResetVisuals.has(leftCarIndex)) {
      flipResetVisuals.get(leftCarIndex)?.stopVisual();
      flipResetVisuals.delete(leftCarIndex);
    }
  }

  public handleRosterSignal(reconciler: PredictionReconciler, sig: RuntimeSignalPacket): boolean {
    const h = this.host;
    const isLobbyDualWorld = h.isLobbyDualWorldActive(reconciler);
    const participantTeams = h.getParticipantTeams();
    switch (sig.signalType) {
      case MATCH_SIGNALS.PLAYER_JOINED:
      case MATCH_SIGNALS.PLAYER_SLOT_UPDATED: {
        const carIdx = sig.param1 ?? -1;
        const team = (sig.param2 ?? 0) & 0xff;
        if (typeof carIdx === 'number' && carIdx >= 0 && carIdx < 8) {
          if (team === 0 || team === 1) participantTeams.set(carIdx, team);
          const preset = reconciler.carVisualPresets?.get(carIdx) || 'fennec';
          this.syncJoinedParticipantCarInWorld(carIdx, team, preset, isLobbyDualWorld);
        }
        h.syncHostLobbyOngoingNotification();
        return true;
      }

      case MATCH_SIGNALS.PLAYER_LOADOUT_UPDATED: {
        const carIdx = sig.param1 ?? -1;
        const loadout = unpackLoadoutSignalParam2(sig.param2 ?? 0);
        if (typeof carIdx === 'number' && carIdx >= 0 && carIdx < 8) {
          reconciler.setCarVisualPreset?.(carIdx, loadout.visualId);
          this.applyParticipantLoadoutToWorld(carIdx, loadout, isLobbyDualWorld);
        }
        return true;
      }

      case MATCH_SIGNALS.PLAYER_LEFT: {
        const leftCarIndex = sig.param1 ?? -1;
        if (leftCarIndex >= 0 && leftCarIndex < 65535) participantTeams.delete(leftCarIndex);
        this.removeLeftParticipantFromWorld(leftCarIndex);
        h.syncHostLobbyOngoingNotification();
        return true;
      }

      default:
        return false;
    }
  }

  public handleCombatIncidentSignal(
    sig: RuntimeSignalPacket,
    isFirstSeenSignalId: boolean,
    audio: SignalAudioFacadeLike | null | undefined
  ): boolean {
    if (sig.signalType === MATCH_SIGNALS.FLIP_RESET_GAINED) {
      if (!isFirstSeenSignalId) return true;
      const h = this.host;
      const physics = h.physics;
      const targetCarIdx =
        typeof sig.param1 === 'number' && sig.param1 >= 0 ? sig.param1 : h.playerCarIndex;
      const resetSubType =
        typeof sig.param2 === 'number' && sig.param2 > 0 ? sig.param2 : FLIP_RESET_SUBTYPES.BALL;
      if (resetSubType !== FLIP_RESET_SUBTYPES.BALL) return true;

      const cv = physics?.getCarStateView?.(targetCarIdx);
      const st = h.simulationStage?.getCarActionState?.(targetCarIdx);
      const nowMs = performance.now();
      const signalTick = sig.frameId || 0;
      const tickDelta =
        signalTick > 0 && st && st.lastFlipResetTick > 0
          ? Math.abs(signalTick - st.lastFlipResetTick)
          : Infinity;
      const timeDeltaMs = st ? nowMs - (st.lastFlipResetTimeMs || 0) : Infinity;
      if (tickDelta < 60 || timeDeltaMs < 450) return true;

      if (cv && !cv.isOnGround && !cv.hasFlipOrJump) {
        const maxFlips = Math.max(1, physics?.getCarMaxFlipCount?.(targetCarIdx) ?? 1);
        physics?.setCarState?.(targetCarIdx, { hasFlipOrJump: true, flipsRemaining: maxFlips });
      }
      if (st) {
        if (!cv?.isFlipping) st.hasAirJumped = false;
        st.jumpReleasedSinceSingleJump = true;
        st.lastFlipResetTick = signalTick;
        st.lastFlipResetTimeMs = nowMs;
      }
      const flipResetEvt = {
        type: 0x0f,
        subType: FLIP_RESET_SUBTYPES.BALL,
        resetSubType: FLIP_RESET_SUBTYPES.BALL,
        resetObjectCode: FLIP_RESET_OBJECT_TYPES.BALL,
        resetObjectType: 'ball',
        isBallFlipReset: true,
        carIndex: targetCarIdx,
        primaryId: targetCarIdx,
        x: cv?.posX ?? 0,
        y: cv?.posY ?? 0,
        z: cv?.posZ ?? 0,
        speed: Math.hypot(cv?.velX ?? 0, cv?.velY ?? 0, cv?.velZ ?? 0),
        impulse: 0,
        tick: signalTick,
      };
      eventStreamStore.addEvent(flipResetEvt);
      h.modeManager?.getActiveMode?.()?.onPhysicsEvent?.(flipResetEvt);
      h.getFlipResetVisual?.(targetCarIdx)?.play();
      audio?.handleEvent?.(flipResetEvt, h.camera);
      return true;
    }

    if (sig.signalType === MATCH_SIGNALS.DEMOLITION) {
      if (!isFirstSeenSignalId) return true;
      const h = this.host;
      const carIndex =
        typeof sig.param1 === 'number' && sig.param1 >= 0 ? sig.param1 : h.playerCarIndex;
      const cv = h.physics?.getCarStateView?.(carIndex);
      const demoEvt = {
        type: INCIDENT_EVENT_TYPES.CAR_CAR_DEMO,
        carIndex,
        primaryId: sig.param2 ?? 0,
        secondaryId: carIndex,
        x: cv?.posX ?? 0,
        y: cv?.posY ?? 0,
        z: cv?.posZ ?? 0,
        tick: sig.frameId || 0,
      };
      eventStreamStore.addEvent(demoEvt);
      h.modeManager?.getActiveMode?.()?.onPhysicsEvent?.(demoEvt);
      audio?.handleEvent?.(demoEvt, h.camera);
      return true;
    }

    return false;
  }
}
