import {
  useAppStore,
  hudStore,
  setNameTagRuntimeState,
  notifyNetworkTelemetryExportAvailable,
} from '../runtimeUiPort.ts';
import { captureRuntimeReplayCarEntries } from '../../replay/replayDirectorCarRosterPipeline.ts';
import { retainCompletedMatchReplayAndNotify } from '../../replay/ReplayFileExporter.ts';
import type { PredictionReconciler } from '../../network/client/PredictionReconciler.ts';
import type { RocketSimPhysicsEngine } from '../../physics/RocketSimPhysicsEngine.ts';
import type { ArenaWorld } from '../../entities/ArenaWorld.ts';
import type {
  RuntimeSignalHostPort,
  RuntimeSignalLatchState,
  RuntimeSignalPacket,
} from './RuntimeParticipantAndCombatSignalSubController.ts';
import {
  resolveFocusedPlayerCarIndex,
  collectActiveMatchParticipantMap,
  mergeExportedHostMatchReplayPayload,
} from './runtimeBridgeSnapshotPipeline.ts';

export type SignalFocusCarPort = Pick<
  RuntimeSignalHostPort,
  'playerCarIndex' | 'arena' | 'camera' | 'interpolator'
>;

export type SignalCameraOverridePort = Pick<
  RuntimeSignalHostPort,
  | 'replayPovCarIndex'
  | 'isGoalReplayCameraOverrideActive'
  | 'acquireGoalReplayCameraOverride'
  | 'releaseGoalReplayCameraOverride'
> & {
  readonly cameraSubsystem?: {
    isGoalReplayCameraOverrideActive(): boolean;
    acquireGoalReplayCameraOverride(source?: string): void;
    releaseGoalReplayCameraOverride(source?: string | null): void;
  } | null;
};

export function isLocalReplayOrRewinderBlockingLivePhysics(
  modeManager: RuntimeSignalHostPort['modeManager']
): boolean {
  const activeMode = modeManager?.getActiveMode?.();
  return Boolean(
    activeMode?.rewinderController?.isBlockingLivePhysics ||
    activeMode?.standaloneReplayViewer?.isActive
  );
}

export function focusLocalPlayerCarInArenaAndCamera(
  reconciler: PredictionReconciler | null | undefined,
  focusPort: SignalFocusCarPort,
  options: { resetView?: boolean; syncInterpolator?: boolean; alwaysAssign?: boolean } = {}
): number {
  const { arena, camera, interpolator } = focusPort;
  const idx = resolveFocusedPlayerCarIndex(
    reconciler?.localCarIndex,
    focusPort.playerCarIndex,
    options.alwaysAssign
  );
  if (idx !== null) {
    focusPort.playerCarIndex = idx;
    if (arena) arena.playerCarIndex = idx;
    camera?.setFocusedCarIndex?.(idx);
  }
  if (options.resetView) camera?.resetView?.();
  if (options.syncInterpolator) interpolator?.sync?.();
  return focusPort.playerCarIndex;
}

function isCameraOverrideActive(port: SignalCameraOverridePort): boolean {
  return port.cameraSubsystem
    ? port.cameraSubsystem.isGoalReplayCameraOverrideActive()
    : port.isGoalReplayCameraOverrideActive();
}

function setCameraOverrideActive(
  port: SignalCameraOverridePort,
  active: boolean,
  source = 'goal-replay'
): void {
  if (active) {
    if (port.cameraSubsystem) port.cameraSubsystem.acquireGoalReplayCameraOverride(source);
    else port.acquireGoalReplayCameraOverride?.(source);
  } else if (port.cameraSubsystem) {
    port.cameraSubsystem.releaseGoalReplayCameraOverride(null);
  } else {
    port.releaseGoalReplayCameraOverride();
  }
}

export function teardownSignalReplayAndPodiumSession(
  port: SignalCameraOverridePort &
    Pick<
      RuntimeSignalHostPort,
      'authoritativeServer' | 'replayTimelineController' | 'podiumController' | 'camera'
    >,
  options: { exitPodium?: boolean; resetCameraIfWasInReplay?: boolean } = {}
): void {
  const wasOverride = Boolean(options.resetCameraIfWasInReplay && isCameraOverrideActive(port));
  port.replayPovCarIndex = null;
  setCameraOverrideActive(port, false);
  const timeline = port.replayTimelineController;
  const serverCtrl = port.authoritativeServer?.fallbackManager?.goalReplay?.replayController;
  if (timeline && serverCtrl && serverCtrl !== timeline && serverCtrl.ActiveWindowCount > 0) {
    const existingEntries = timeline.sessionState?.carEntries;
    timeline.copyRetainedReplayFrom(serverCtrl);
    if (!timeline.sessionState.carEntries?.length && existingEntries?.length) {
      timeline.sessionState.carEntries = existingEntries;
    }
  }
  timeline?.endReplaySession?.();
  if (options.exitPodium) port.podiumController?.exitPodium?.();
  if (wasOverride) port.camera?.resetView?.();
}

export function toggleGoalReplayCameraViewMode(
  port: SignalCameraOverridePort & Pick<RuntimeSignalHostPort, 'modeManager'>,
  scorerCarIdx: number
): void {
  const nextMode = hudStore.getState().replayCameraMode === 'pov' ? 'director' : 'pov';
  const activeMode = port.modeManager?.getActiveMode?.();
  if (typeof activeMode?.setReplayCameraMode === 'function') {
    activeMode.setReplayCameraMode(nextMode);
  } else if (activeMode?.replaySession) {
    activeMode.replaySession.replayCameraMode = nextMode;
  } else {
    port.replayPovCarIndex = nextMode === 'pov' ? scorerCarIdx : null;
    setCameraOverrideActive(port, nextMode === 'director', 'goal-replay');
    hudStore.getState().setReplayState?.({ replayCameraMode: nextMode });
  }
}

export function startGoalReplayDirectorSession(
  directorPort: RuntimeSignalHostPort,
  options: { durationTicks: number; scoringTeam: number; scorerCarIndex: number }
): void {
  directorPort.replayPovCarIndex = null;
  setCameraOverrideActive(directorPort, true, 'goal-replay');
  const carEntries = captureRuntimeReplayCarEntries(directorPort, {
    defaultTeam: options.scoringTeam,
  });
  setNameTagRuntimeState({ carEntries });
  directorPort.replayTimelineController?.beginReplaySession?.({
    ...options,
    carEntries,
    isNetworkStreamed: true,
  });
}

export function resetGoalReplayIncidentFlags(
  flagPort: Pick<RuntimeSignalHostPort, '_clientGoalIncidentLatched' | '_localSkipReplayReady'>,
  clearIncidentLatch = false
): void {
  if (clearIncidentLatch) flagPort._clientGoalIncidentLatched = false;
  flagPort._localSkipReplayReady = false;
}

export function exitLobbyDualWorldAndActivateMatchMode(
  port: Pick<
    RuntimeSignalHostPort,
    'arena' | 'setLobbyGhostMode' | 'setLatestServerRosterState' | 'interpolator' | 'modeManager'
  >
): void {
  if (port.arena) {
    port.arena.isLobbyMode = false;
    port.arena.isHostLobby = false;
  }
  port.setLobbyGhostMode(false, { syncServerLobby: false });
  port.setLatestServerRosterState('match');
  port.interpolator?.sync?.();
  port.modeManager?.setMode?.('match');
  useAppStore.getState().setMatchMode('match');
}

export function preparePhysicsReplayRecordingForMatch(
  port: Pick<RuntimeSignalHostPort, 'physics' | 'clientReplayOverflowPaused' | 'arena'>,
  options: { clearBuffer?: boolean; resetBallTrail?: boolean } = {}
): void {
  const { physics, arena } = port;
  if (options.clearBuffer) {
    physics?.clearReplayBuffer?.();
    port.clientReplayOverflowPaused = false;
  }
  if (!port.clientReplayOverflowPaused) physics?.setReplayRecordingActive?.(true);
  physics?.resetGoalLatch?.();
  physics?.setSimulationFrozen?.(false);
  physics?.setUnlimitedBoost?.(false);
  if (options.resetBallTrail) arena?.resetBallTrail?.();
}

export function pushMatchPrepareSignalToPhysicsBuffer(
  physicsPort: Pick<RuntimeSignalHostPort, 'physics'>,
  sig: RuntimeSignalPacket,
  currentTick: number
): void {
  const { physics } = physicsPort;
  if (typeof physics?.pushSignalEvent !== 'function') return;
  const p1 = Number(sig.param1 || 0) >>> 0;
  const p2 = Number(sig.param2 || 0) >>> 0;
  physics.pushSignalEvent(
    sig.signalType || 0,
    (sig.frameId ?? currentTick) >>> 0,
    Number(sig.param1 || 0),
    Number(sig.param2 || 0),
    0,
    0,
    0,
    0,
    p1 & 0xffff,
    (p1 >>> 16) & 0xffff,
    p2,
    (sig.signalId || 0) >>> 0,
    0,
    0
  );
}

export function isKickoffTransitioningFromReplay(
  port: SignalCameraOverridePort & Pick<RuntimeSignalHostPort, 'replayTimelineController' | 'match'>
): boolean {
  return Boolean(
    isCameraOverrideActive(port) ||
    port.replayTimelineController?.sessionState?.isActive ||
    port.match?.state?.phase === 'replay'
  );
}

export function resetCameraViewIfInvalidOrWasInReplay(
  cameraPort: Pick<RuntimeSignalHostPort, 'camera'>,
  wasInReplay: boolean
): void {
  const pos = cameraPort.camera?.camera?.position;
  if (
    wasInReplay ||
    (pos && (!Number.isFinite(pos.x) || !Number.isFinite(pos.y) || !Number.isFinite(pos.z)))
  ) {
    cameraPort.camera?.resetView?.();
  }
}

function syncParticipantCarSlotInWorld(
  physics: RocketSimPhysicsEngine,
  arena: ArenaWorld | null,
  slotIndex: number,
  team: number | undefined,
  preset: string
): void {
  if (team !== undefined) {
    if (typeof physics.addCarAtSlot === 'function') physics.addCarAtSlot(slotIndex, team, preset);
    else if (physics.numCars <= slotIndex) physics.addCar(team, preset);
    physics.setCarTeam?.(slotIndex, team);
    physics.setCarCollisionMask?.(slotIndex, true, true);
    physics.setCarLinearFactorAndGravity?.(slotIndex, 1, 1, 1, 1);
    if (arena) {
      arena.vehicleRegistry.ensureCar(slotIndex, team, preset);
      if (arena.cars?.[slotIndex]) arena.cars[slotIndex].visible = true;
    }
    return;
  }
  if (physics.isCarSlotActive?.(slotIndex)) physics.removeCar?.(slotIndex);
  if (arena?.cars?.[slotIndex]) arena.cars[slotIndex].visible = false;
}

export function syncMatchParticipantsInLocalWorld(
  port: SignalFocusCarPort &
    Pick<RuntimeSignalHostPort, 'physics' | 'remotePeerCarMap'> &
    Partial<Pick<RuntimeSignalHostPort, 'getLastRosterSnapshot' | 'getParticipantTeams'>>,
  reconciler: PredictionReconciler | null
): void {
  const physics = port?.physics;
  if (!port || !physics) return;
  const presets = reconciler?.carVisualPresets;
  const peers = useAppStore?.getState?.()?.onlineSession?.connectedPeers || [];
  const localIdx = focusLocalPlayerCarInArenaAndCamera(reconciler, port, { alwaysAssign: true });
  const lastRoster = port.getLastRosterSnapshot?.() ?? null;
  const participantTeams = port.getParticipantTeams?.();
  const activeMap = collectActiveMatchParticipantMap(
    localIdx,
    presets,
    peers,
    port.remotePeerCarMap,
    lastRoster,
    participantTeams
  );
  const arena = port.arena ?? null;
  for (let c = 0; c < 8; c++) {
    const preset = presets?.get?.(c) || 'octane';
    syncParticipantCarSlotInWorld(physics, arena, c, activeMap.get(c), preset);
  }
}

export function enterPodiumAndResetEndgameAudio(
  port: Pick<
    RuntimeSignalHostPort,
    | 'podiumController'
    | 'isNetworkTelemetryNotified'
    | 'markNetworkTelemetryNotified'
    | 'resetAudio'
    | 'audioSubsystem'
  >,
  reconciler: PredictionReconciler,
  isPodiumStart: boolean,
  winningTeam: number,
  winReason: string
): void {
  if (isPodiumStart) {
    reconciler.setMatchTelemetryActive?.(false, false);
    port.podiumController?.enterPodium?.(winningTeam, winReason);
  }
  if (!port.isNetworkTelemetryNotified()) {
    port.markNetworkTelemetryNotified(true);
    notifyNetworkTelemetryExportAvailable('match-complete', reconciler.telemetryCollector.recorder);
  }
  port.audioSubsystem?.resetAudio?.();
}

export function retainHostMatchReplayAfterEnd(
  exportPort: Pick<RuntimeSignalHostPort, 'authoritativeServer' | 'match' | 'physics'>,
  latch: RuntimeSignalLatchState,
  winningTeam: number,
  winReasonCode: number
): void {
  const { authoritativeServer: server, match, physics } = exportPort;
  const matchState = match?.state;
  if (!server || latch.hostMatchReplayNotified) return;
  latch.hostMatchReplayNotified = true;
  const roster =
    (server as { lastRoomState?: { roster?: { players?: Array<Record<string, unknown>> } } })
      .lastRoomState?.roster?.players || [];
  const basePayload = {
    ringBuffer: server.hostReplayRingBuffer,
    fallbackState: server.cachedSnapshot || physics?.state,
    mode: 'Host Match',
    durationSeconds: matchState?.durationSeconds ?? 300,
    roster,
    loadouts: roster,
    blueScore: matchState?.blueScore ?? hudStore.getState().blueScore ?? 0,
    orangeScore: matchState?.orangeScore ?? hudStore.getState().orangeScore ?? 0,
    winnerTeam: winningTeam,
    winReason: winReasonCode,
  };
  server
    .requestFullReplayExport()
    .then((exp: Record<string, unknown> | null) =>
      retainCompletedMatchReplayAndNotify(mergeExportedHostMatchReplayPayload(basePayload, exp))
    )
    .catch((err: unknown) => {
      console.warn('[RuntimeSignalDomain] requestFullReplayExport fallback:', err);
      retainCompletedMatchReplayAndNotify(basePayload);
    });
}
