import { CAR_COLOR_SLOTS } from '../../ui-core/config/vehicleConstants.ts';
import {
  getPreferredColorSlot,
  loadStoredColorPrefs,
} from '../../ui-core/config/vehiclePresets.ts';
import {
  resolveEffectiveClockPacingParams,
  type ClockPacingMode,
  type ClockPacingPriority,
  type ClockPacingParams,
} from '../../ui-core/config/clockPacingConfig.ts';
import {
  useAppStore,
  type AppStorePortState,
  type OnlineSessionPortState,
} from '../runtimeUiPort.ts';
import type { RocketSimPhysicsEngine } from '../../physics/RocketSimPhysicsEngine.ts';
import type {
  OnlineRosterSnapshotPayload,
  RemoteTransportChannelLike,
} from './OnlineRosterSyncCoordinator.ts';

export type LocalVehicleLoadoutState = {
  selectedPreset?: string | null;
  selectedHitbox?: string | null;
  selectedColorSlot?: number | null;
};

export interface OnlineLoadoutOptions {
  playerName?: string;
  visualId?: string;
  hitboxId?: string | null;
  colorSlot?: number;
  paintFinish?: string;
  boostVisual?: string;
  boostAudio?: string;
}

export interface HostOnlineServerOptions extends OnlineLoadoutOptions {
  roomType?: string;
  lobbyMode?: boolean;
  gameMode?: string;
  botFillMode?: string;
  botType?: string;
  durationSeconds?: number;
  skipReplayByDefault?: boolean;
  roomId?: string;
  forceFallback?: boolean;
}

export interface NetworkSessionChannelLike extends RemoteTransportChannelLike {
  rttMs?: number;
  extraLatencyMs?: number;
  extraUplinkMs?: number;
  extraDownlinkMs?: number;
  setExtraLatency?(latencyMs: number): void;
  setAsymmetricLatency?(uplinkMs: number, downlinkMs: number): void;
  forceDropNextInput?(count: number): void;
  sendDiagnosticFleetToggle?(enabled: boolean, anchorMode: string | null): void;
  sendColorChange?(slotId: number, hex: string, carIndex: number): void;
  send?(payload: string | Uint8Array | ArrayBuffer): void;
  destroy?(): void;
  onColorChange?: ((msg: { carIndex?: number; hex: string }) => void) | null;
}

export interface JoinOnlineServerOptions extends OnlineLoadoutOptions {
  channel?: NetworkSessionChannelLike | null;
  preferredTeam?: number | null;
}

export interface MaterialsConfigLike {
  paintFinish?: string;
  boostVisual?: string;
  boostAudio?: string;
}

export interface HandshakeResponseMessage {
  state?: string;
  entityId?: number;
  team?: number;
  colorSlot?: number;
  durationSeconds?: number;
  clockSeconds?: number;
  score?: { blue?: number; orange?: number };
  roomId?: string;
  gameMode?: string;
  botFillMode?: string;
  roster?: OnlineRosterSnapshotPayload & {
    durationSeconds?: number;
    clockSeconds?: number;
    score?: { blue?: number; orange?: number };
  };
}

const MID_MATCH_STATES = new Set([
  'kickoff',
  'playing',
  'prepare',
  'goal',
  'goal_scored',
  'replay',
  'paused',
]);

export function resolveLoadoutDefaults(
  options: OnlineLoadoutOptions,
  localLoadout: LocalVehicleLoadoutState,
  materials: MaterialsConfigLike | null | undefined
) {
  return {
    visualId: options.visualId || localLoadout.selectedPreset || 'fennec',
    hitboxId: options.hitboxId || localLoadout.selectedHitbox || null,
    colorSlot: options.colorSlot ?? localLoadout.selectedColorSlot ?? 0,
    paintFinish: options.paintFinish || materials?.paintFinish || 'metallic',
    boostVisual: options.boostVisual || materials?.boostVisual || 'gold-rush',
    boostAudio: options.boostAudio || materials?.boostAudio || 'rush',
  };
}

export function resolveSessionClockPacingConfig(
  storeState: Partial<AppStorePortState> | null | undefined = useAppStore?.getState?.()
) {
  const mode = (storeState?.clockPacingMode || 'legacy') as ClockPacingMode;
  const priority = (storeState?.clockPacingPriority || 'balanced') as ClockPacingPriority;
  const target = storeState?.inputBufferTarget ?? 3;
  const raw = storeState?.inputBufferThreshold;
  const threshold: [number, number] =
    Array.isArray(raw) && raw.length >= 2 ? [Number(raw[0]), Number(raw[1])] : [-2, 2];
  const custom = storeState?.customClockPacingParams as ClockPacingParams | undefined;
  const params =
    typeof resolveEffectiveClockPacingParams === 'function' && custom
      ? resolveEffectiveClockPacingParams(mode, priority, target, threshold, custom)
      : null;
  return { mode, priority, target, threshold, params };
}

export function resolveHostSessionLaunchConfig(
  options: HostOnlineServerOptions,
  localLoadout: LocalVehicleLoadoutState,
  onlineSession: OnlineSessionPortState | null | undefined,
  materials: MaterialsConfigLike | null | undefined
) {
  const ld = resolveLoadoutDefaults(options, localLoadout, materials);
  const storedPrefs = loadStoredColorPrefs();
  const preferredBlueSlot = getPreferredColorSlot(storedPrefs, 0);
  const preferredOrangeSlot = getPreferredColorSlot(storedPrefs, 1);
  const rawHostColorSlot = options.colorSlot ?? localLoadout.selectedColorSlot;
  const hostColorSlot =
    typeof rawHostColorSlot === 'number' && CAR_COLOR_SLOTS[rawHostColorSlot]?.team === 0
      ? rawHostColorSlot
      : preferredBlueSlot;
  const playerName =
    options.playerName && options.playerName !== 'Host'
      ? options.playerName
      : onlineSession?.playerName && onlineSession.playerName !== 'Host'
        ? onlineSession.playerName
        : `Player${Math.floor(1000 + Math.random() * 9000)}`;
  const roomId = options.roomId || 'local_room';
  const roomType = options.roomType || onlineSession?.roomType || 'match';
  const isMatchLobby = options.lobbyMode !== undefined ? Boolean(options.lobbyMode) : true;
  const gameMode = options.gameMode || onlineSession?.gameMode || '2v2';
  const botFillMode = options.botFillMode || onlineSession?.botFillMode || 'auto_fill';
  const durationSeconds = options.durationSeconds ?? onlineSession?.matchDurationSeconds ?? 300;
  const skipReplayByDefault =
    options.skipReplayByDefault !== undefined ? Boolean(options.skipReplayByDefault) : false;

  return {
    hostVisualId: ld.visualId,
    hostColorSlot,
    isMatchLobby,
    serverOptions: {
      snapshotInterval: 1,
      hostPlayerName: playerName,
      hostVisualId: ld.visualId,
      hostHitboxId: ld.hitboxId,
      hostColorSlot,
      hostBlueColorSlot: preferredBlueSlot,
      hostOrangeColorSlot: preferredOrangeSlot,
      hostPaintFinish: ld.paintFinish,
      hostBoostVisual: ld.boostVisual,
      hostBoostAudio: ld.boostAudio,
      gameMode,
      botFillMode,
      botType: options.botType,
      durationSeconds,
      lobbyMode: isMatchLobby,
      skipReplayByDefault,
      roomId,
      forceFallback: Boolean(options.forceFallback),
    },
    onlineSessionPatch: {
      isHosting: true,
      roomId,
      playerName,
      signalingConnected: true,
      roomType,
      gameMode,
      botFillMode,
      matchDurationSeconds: durationSeconds,
    },
  };
}

export function resolveClientJoinConfig(
  options: JoinOnlineServerOptions,
  localLoadout: LocalVehicleLoadoutState,
  materials: MaterialsConfigLike | null | undefined
) {
  const ld = resolveLoadoutDefaults(options, localLoadout, materials);
  const initialColorPrefs = loadStoredColorPrefs();
  const preferredBlueSlot = getPreferredColorSlot(initialColorPrefs, 0);
  const preferredOrangeSlot = getPreferredColorSlot(initialColorPrefs, 1);
  const preferredTeam = typeof options.preferredTeam === 'number' ? options.preferredTeam : null;
  const fallbackColorTeam =
    preferredTeam === 0 || preferredTeam === 1
      ? preferredTeam
      : initialColorPrefs.primaryTeam === 'blue'
        ? 0
        : 1;
  const localColorSlot =
    options.colorSlot ?? getPreferredColorSlot(initialColorPrefs, fallbackColorTeam);
  const playerName = options.playerName || 'Player 2';

  return {
    playerName,
    localVisualId: ld.visualId,
    loadout: ld,
    joinPayload: {
      type: 'join',
      playerName,
      role: 'player',
      preferredTeam,
      ...ld,
      colorSlot: localColorSlot,
      blueColorSlot: preferredBlueSlot,
      orangeColorSlot: preferredOrangeSlot,
    },
  };
}

export function resolveHandshakeTeamColorSlot(msg: HandshakeResponseMessage | null | undefined): {
  assignedTeam: 0 | 1;
  colorSlot: number;
  colorHex: string | null;
} {
  const assignedTeam: 0 | 1 = msg?.team === 1 ? 1 : 0;
  const teamPreferredSlot = getPreferredColorSlot(loadStoredColorPrefs(), assignedTeam);
  const resolvedHandshakeSlot =
    typeof msg?.colorSlot === 'number' && CAR_COLOR_SLOTS[msg.colorSlot]?.team === assignedTeam
      ? msg.colorSlot
      : teamPreferredSlot;
  return {
    assignedTeam,
    colorSlot: resolvedHandshakeSlot,
    colorHex: CAR_COLOR_SLOTS[resolvedHandshakeSlot]?.hex || null,
  };
}

export function resolveClientHandshakeTransition(
  msg: HandshakeResponseMessage | null | undefined,
  currentOnlineSession: OnlineSessionPortState | null | undefined
) {
  const state = msg?.state;
  const isMidMatchJoin = Boolean(state && MID_MATCH_STATES.has(state));
  const isLobbyOrWarmup = state === 'lobby' || state === 'freeplay' || !state;
  const assignedCarIndex =
    typeof msg?.entityId === 'number' && msg.entityId >= 0 ? msg.entityId : null;
  const localTeam: 0 | 1 = msg?.team === 1 ? 1 : 0;
  const resolvedDuration =
    typeof msg?.durationSeconds === 'number' && Number.isFinite(msg.durationSeconds)
      ? msg.durationSeconds
      : (msg?.roster?.durationSeconds ?? 300);
  const resolvedClock =
    typeof msg?.clockSeconds === 'number' && Number.isFinite(msg.clockSeconds)
      ? msg.clockSeconds
      : (msg?.roster?.clockSeconds ?? resolvedDuration);
  const resolvedScore = {
    blue: msg?.score?.blue ?? msg?.roster?.score?.blue ?? 0,
    orange: msg?.score?.orange ?? msg?.roster?.score?.orange ?? 0,
  };
  const resolvedPhase =
    state === 'goal_scored' ? 'goal' : state === 'prepare' ? 'kickoff' : state || 'lobby';
  const onlineSessionPatch: Record<string, unknown> = {
    roomId: msg?.roomId || currentOnlineSession?.roomId || 'online_room',
    gameMode: msg?.gameMode || currentOnlineSession?.gameMode || '3v3',
    roomType: state === 'lobby' || isMidMatchJoin ? 'match' : 'warmup',
  };
  if (typeof msg?.botFillMode === 'string') onlineSessionPatch.botFillMode = msg.botFillMode;
  if (typeof msg?.durationSeconds === 'number' && Number.isFinite(msg.durationSeconds)) {
    onlineSessionPatch.matchDurationSeconds = msg.durationSeconds;
  }
  if (typeof msg?.team === 'number' && msg.team >= 0) {
    onlineSessionPatch.localTeam = msg.team === 2 ? 'neutral' : msg.team === 1 ? 'orange' : 'blue';
  }
  return {
    assignedCarIndex,
    isMidMatchJoin,
    isLobbyOrWarmup,
    localTeam,
    resolvedDuration,
    resolvedClock,
    resolvedScore,
    resolvedPhase,
    onlineSessionPatch,
  };
}

export function computeClientLobbyCarSpawnPose(
  view: { posX: number; posY: number; posZ: number } | null | undefined,
  carIndex: number,
  team = 1,
  forceReset = false
) {
  const isInvalid =
    forceReset ||
    !view ||
    !Number.isFinite(view.posX) ||
    !Number.isFinite(view.posY) ||
    !Number.isFinite(view.posZ) ||
    view.posZ < 14.0 ||
    Math.abs(view.posX) > 4050 ||
    Math.abs(view.posY) > 5100 ||
    (Math.abs(view.posX) < 1 && Math.abs(view.posY) < 1 && view.posZ < 16.0);
  if (!isInvalid) return null;
  const isOrange = (team ?? carIndex % 2) === 1;
  const yaw = isOrange ? -0.75 * Math.PI : 0.25 * Math.PI;
  const cosYaw = Math.cos(yaw);
  const sinYaw = Math.sin(yaw);
  return {
    pos: [isOrange ? 2048 : -2048, isOrange ? 2560 : -2560, 17.0] as [number, number, number],
    forward: [cosYaw, sinYaw, 0] as [number, number, number],
    right: [-sinYaw, cosYaw, 0] as [number, number, number],
    up: [0, 0, 1] as [number, number, number],
    vel: [0, 0, 0] as [number, number, number],
    angVel: [0, 0, 0] as [number, number, number],
    boost: 100,
    isOnGround: true,
    isDemoed: false,
    hasFlipOrJump: true,
    isBoosting: false,
    isFlipping: false,
  };
}

export function ensureValidClientLobbyLocalCarPose(
  physics: RocketSimPhysicsEngine | null | undefined,
  carIndex: number,
  team = 1,
  forceReset = false
): void {
  if (!physics || typeof physics.setCarState !== 'function') return;
  const pose = computeClientLobbyCarSpawnPose(
    physics.getCarStateView?.(carIndex),
    carIndex,
    team,
    forceReset
  );
  if (pose) physics.setCarState(carIndex, pose);
}

export function resetLobbyWorldPhysicsPose(
  physics: RocketSimPhysicsEngine | null | undefined,
  localCarIndex: number,
  localTeam: number,
  isHost: boolean
): void {
  if (!physics) return;
  if (!isHost) {
    physics.setCarCollisionMask?.(localCarIndex, true, false);
    physics.setCarLinearFactorAndGravity?.(localCarIndex, 1, 1, 1, 1);
  }
  physics.resetKickoff?.(isHost ? 0 : -1);
  physics.setBallState?.({ pos: [0, 0, 93.15], vel: [0, 0, 0], angVel: [0, 0, 0] });
  ensureValidClientLobbyLocalCarPose(physics, isHost ? 0 : localCarIndex, localTeam, true);
}
