import './runtimeEngineUiPort.ts';
import { useAppStore } from '../../ui-core/stores/appStore.ts';
import type { AppState } from '../../ui-core/stores/appStoreTypes.ts';
import { perfTelemetryStore } from '../../ui-core/stores/perfTelemetryStore.ts';
import { hudStore } from '../../ui-core/stores/hudStore.ts';
import { floatingStore } from '../../ui-core/stores/floatingStore.ts';
import { useRewinderStore } from '../../ui-core/stores/rewinderStore.ts';
import { useReplayViewerStore } from '../../ui-core/stores/replayViewerStore.ts';
import { useReplayToRcsImporterStore } from '../../ui-core/stores/replayToRcsImporterStore.ts';
import { loadInputBindings } from '../../ui-core/config/inputBindings.ts';
import {
  getPreferredColorHex,
  getPreferredFreeplayTeam,
} from '../../ui-core/config/vehiclePresets.ts';
import { createOnlineBridgeHandlers } from './runtimeOnlineBridgeHandlers.ts';
import { createModeBridgeHandlers } from './runtimeModeBridgeHandlers.ts';
import { createTunerBridgeHandlers, syncMaterialsToGame } from './runtimeTunerBridgeHandlers.ts';
import { cameraDeterminismStore } from '../../ui-core/stores/cameraDeterminismStore.ts';
import { getCameraDeterminismHarness } from '../../camera/CameraDeterminismHarness.ts';
import { useQuickNotificationStore } from '../../ui-core/stores/quickNotificationStore.ts';
import type { QuickNotificationPushOptions as QuickNotificationInput } from '../../ui-core/stores/notificationTypes.ts';
import { setPacingTelemetryNotificationHandler } from '../../ui-core/stores/pacingTelemetryExporter.ts';
import { useGoalBarrierStore } from '../../ui-core/stores/goalBarrierStore.ts';
import { buildGoalBarrierCmfChunks } from '../../ui-core/config/goalBarrierConfig.ts';
import { syncRuntimeNetworkDiagnostics } from './runtimeNetworkDiagnosticsBridge.ts';
import type {
  GameRuntimeUiBridgePort,
  GoalBarrierDecompositionPort,
} from '../../game/runtimeUiPort.ts';

let goalBarrierUnsubscribe: (() => void) | null = null;
let floatingFlagsUnsubscribe: (() => void) | null = null;
let modeScopeUnsubscribe: (() => void) | null = null;
let lastSyncedBarrierMeshKey = '';

function syncFloatingWindowFlags(): void {
  const snap = floatingStore.getSnapshot();
  const rewinderWin = snap.windows.find((w) => w.id === 'rewinder-configurator');
  const viewerWin = snap.windows.find((w) => w.id === 'replay-viewer');
  const importerWin = snap.windows.find((w) => w.id === 'replay-to-rcs-importer');
  const rewinderIdx = rewinderWin ? snap.windows.indexOf(rewinderWin) : -1;
  const viewerIdx = viewerWin ? snap.windows.indexOf(viewerWin) : -1;
  const importerIdx = importerWin ? snap.windows.indexOf(importerWin) : -1;
  const rewinderOpen = Boolean(rewinderWin);
  const viewerOpen = Boolean(viewerWin);
  const importerOpen = Boolean(importerWin);
  const rewinderHasPriority = rewinderOpen && (!viewerOpen || rewinderIdx < viewerIdx);
  const viewerHasPriority = viewerOpen && (!rewinderOpen || viewerIdx < rewinderIdx);
  const importerHasPriority =
    importerOpen &&
    (!rewinderOpen || importerIdx < rewinderIdx) &&
    (!viewerOpen || importerIdx < viewerIdx);

  const rewinderState = useRewinderStore.getState();
  if (
    rewinderState.rewinderWindowOpen !== rewinderOpen ||
    rewinderState.rewinderHasHotkeyPriority !== rewinderHasPriority
  ) {
    useRewinderStore.setState({
      rewinderWindowOpen: rewinderOpen,
      rewinderHasHotkeyPriority: rewinderHasPriority,
    });
  }
  const rvState = useReplayViewerStore.getState();
  if (rvState.isWindowOpen !== viewerOpen || rvState.hasHotkeyPriority !== viewerHasPriority) {
    useReplayViewerStore.setState({
      isWindowOpen: viewerOpen,
      hasHotkeyPriority: viewerHasPriority,
    });
  }
  const impState = useReplayToRcsImporterStore.getState();
  if (
    impState.isWindowOpen !== importerOpen ||
    impState.hasHotkeyPriority !== importerHasPriority
  ) {
    useReplayToRcsImporterStore.setState({
      isWindowOpen: importerOpen,
      hasHotkeyPriority: importerHasPriority,
    });
  }

  const replayDirectorTunerOpen = snap.windows.some((w) => w.id === 'replay-director-tuner');
  const hud = hudStore.getState();
  if (!replayDirectorTunerOpen && hud.matchPhase === 'replay' && hud.replayPaused) {
    hud.onReplayTogglePause?.();
  }
}

export function syncGoalBarrierToGame(
  runtimePort: GameRuntimeUiBridgePort | null | undefined
): void {
  if (!runtimePort) return;
  const gbState = useGoalBarrierStore.getState();
  const { enabled, targetGoal, opacity, decomposition } = gbState;

  const rectsKey = enabled
    ? `${targetGoal}:${decomposition.mergedRects
        .map((r) => `${r.u0},${r.v0},${r.u1},${r.v1}`)
        .join(';')}`
    : 'disabled';

  const updatePhysicsChunks = rectsKey !== lastSyncedBarrierMeshKey;
  let chunks: unknown = null;
  if (updatePhysicsChunks) {
    lastSyncedBarrierMeshKey = rectsKey;
    chunks = buildGoalBarrierCmfChunks(decomposition, targetGoal, enabled);
  }

  runtimePort.tunerPort.syncGoalBarrier(
    decomposition as unknown as GoalBarrierDecompositionPort,
    targetGoal,
    enabled,
    opacity,
    chunks,
    updatePhysicsChunks
  );
}

export function attachGameRuntimeBridge(
  runtimePort: GameRuntimeUiBridgePort | null | undefined
): void {
  if (!runtimePort) return;
  const { cameraPort, matchPort, tunerPort } = runtimePort;

  cameraDeterminismStore.setHarness(getCameraDeterminismHarness());
  syncRuntimeNetworkDiagnostics(runtimePort);
  setPacingTelemetryNotificationHandler((notification) => {
    useQuickNotificationStore
      .getState()
      .pushNotification(notification as unknown as QuickNotificationInput);
  });

  syncFloatingWindowFlags();
  if (floatingFlagsUnsubscribe) {
    floatingFlagsUnsubscribe();
  }
  floatingFlagsUnsubscribe = floatingStore.subscribe(syncFloatingWindowFlags);

  perfTelemetryStore.setSampler(tunerPort.createPerfTelemetrySampler());

  const appState = useAppStore.getState();
  matchPort.syncInitialClockPacing({
    clockPacingMode: appState.clockPacingMode,
    clockPacingPriority: appState.clockPacingPriority,
    inputBufferTarget: appState.inputBufferTarget,
    inputBufferThreshold: appState.inputBufferThreshold,
    customClockPacingParams: appState.customClockPacingParams as unknown as Record<
      string,
      unknown
    > | null,
  });

  const currentCar = tunerPort.getInitialVehiclePreset() || appState.activeCar;
  if (currentCar) {
    useAppStore.setState({ activeCar: currentCar as AppState['activeCar'] });
  }

  const currentMode = matchPort.getMatchMode();
  if (currentMode) {
    useAppStore.setState({ matchMode: currentMode as AppState['matchMode'] });
  }

  try {
    const targetHex = getPreferredColorHex();
    const freeplayTeam = getPreferredFreeplayTeam();
    tunerPort.syncInitialFreeplayTeamAndColor(targetHex, freeplayTeam);
  } catch (err) {
    console.warn('[mountGameUI] Failed to sync initial car color:', err);
  }

  const initialGraphics = useAppStore.getState().graphics;
  tunerPort.applyGraphicsSettings(initialGraphics);
  tunerPort.applyBoostPadTuner(
    useAppStore.getState().boostPadTuner as unknown as Record<string, unknown>
  );
  tunerPort.applyDriftwoodsTuner(
    useAppStore.getState().driftwoodsTuner as unknown as Record<string, unknown>
  );

  useAppStore.getState().setBridge({
    ...createModeBridgeHandlers(runtimePort),
    ...createOnlineBridgeHandlers(runtimePort),
    ...createTunerBridgeHandlers(runtimePort),
  });

  const initialCamera = useAppStore.getState().camera;
  cameraPort.applyPovSettings(initialCamera as unknown as Record<string, unknown>);

  const initialTrajectory = useAppStore.getState().trajectory;
  tunerPort.applyTrajectorySettings(initialTrajectory as unknown as Record<string, unknown>);

  const initialMaterials = useAppStore.getState().materials;
  syncMaterialsToGame(runtimePort, initialMaterials as unknown as Record<string, unknown>);

  const initialBindings = loadInputBindings();
  hudStore.getState().syncBindings(initialBindings);

  const initialGameplay = useAppStore.getState().gameplay;
  tunerPort.applyGameplaySettings(initialGameplay);

  lastSyncedBarrierMeshKey = '';
  syncGoalBarrierToGame(runtimePort);
  if (goalBarrierUnsubscribe) {
    goalBarrierUnsubscribe();
  }
  goalBarrierUnsubscribe = useGoalBarrierStore.subscribe(() => {
    syncGoalBarrierToGame(runtimePort);
  });

  if (modeScopeUnsubscribe) {
    modeScopeUnsubscribe();
  }
  let lastObservedMode = useAppStore.getState().matchMode;
  let lastObservedRoomId = useAppStore.getState().onlineSession?.roomId ?? '';
  modeScopeUnsubscribe = useAppStore.subscribe((state) => {
    const nextMode = state.matchMode;
    const nextRoomId = state.onlineSession?.roomId ?? '';
    if (nextMode !== lastObservedMode || nextRoomId !== lastObservedRoomId) {
      lastObservedMode = nextMode;
      lastObservedRoomId = nextRoomId;
      tunerPort.reconcileTrainingScopeForMode?.(nextMode);
    }
  });
}
