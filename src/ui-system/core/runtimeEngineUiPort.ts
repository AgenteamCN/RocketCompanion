import { bindRuntimeUiPort } from '../../game/runtimeUiPort.ts';
import { useAppStore } from '../../ui-core/stores/appStore.ts';
import { hudStore, useHudStore } from '../../ui-core/stores/hudStore.ts';
import {
  useSpatialAudioStore,
  getFilteredBgmTracks,
} from '../../ui-core/stores/spatialAudioStore.ts';
import { useSubsystemIsolationLabStore } from '../../ui-core/stores/subsystemIsolationLabStore.ts';
import { useRewinderStore } from '../../ui-core/stores/rewinderStore.ts';
import { useReplayViewerStore } from '../../ui-core/stores/replayViewerStore.ts';
import { useReplayToRcsImporterStore } from '../../ui-core/stores/replayToRcsImporterStore.ts';
import { networkDiagnosticsStore } from '../../ui-core/stores/networkDiagnosticsStore.ts';
import { determinismStore } from '../../ui-core/stores/determinismStore.ts';
import { eventStreamStore } from '../../ui-core/stores/eventStreamStore.ts';
import { reachabilityStore } from '../../ui-core/stores/reachabilityStore.ts';
import { ballTrajectoryTunerStore } from '../../ui-core/stores/ballTrajectoryTunerStore.ts';
import {
  useStaticTrainingPackStore,
  getActiveEditItemVariable,
  mutateActiveEditItemVariable,
} from '../../ui-core/stores/staticTrainingPackStore.ts';
import { useStaticTrainingBallCamTunerStore } from '../../ui-core/stores/staticTrainingBallCamTunerStore.ts';
import { useKickoffTrainingStore } from '../../ui-core/stores/kickoffTrainingStore.ts';
import { useReferenceOverlayStore } from '../../ui-core/stores/referenceOverlayStore.ts';
import { useExperimentalMultiBotsStore } from '../../ui-core/stores/experimentalMultiBotsStore.ts';
import { getExpColorSwatch } from '../../ui-core/stores/experimentalMultiBotsRosterUtils.ts';
import {
  useQuickNotificationStore,
  quickNotification,
  pushQuickNotification,
  dismissQuickNotification,
  pushOngoingNotification,
  dismissOngoingNotification,
  completeOngoingNotification,
} from '../../ui-core/stores/quickNotificationStore.ts';
import {
  useNameTagTunerStore,
  getNameTagConfig,
  subscribeNameTagConfig,
  getNameTagRuntimeState,
  setNameTagRuntimeState,
  setNameTagTelemetrySnapshot,
  getNameTagTelemetrySnapshot,
} from '../../ui-core/stores/nameTagTunerStore.ts';
import { floatingStore, toggleFloatingPreset } from '../../ui-core/stores/floatingStore.ts';
import { NETWORK_MONITOR_PRESET } from '../../ui-core/stores/floatingPresets.ts';
import { DUAL_ARENA_DETERMINISM_HARNESS_PRESET } from '../../ui-core/stores/devFloatingPresets.ts';
import {
  snapshotCurrentTelemetryPayload,
  notifyNetworkTelemetryExportAvailable,
} from '../../ui-core/stores/pacingTelemetryExporter.ts';
import { globalPacingTelemetryRecorder } from '../../ui-core/stores/pacingTelemetryRecorder.ts';
import { globalHudTransientChannel } from '../../ui-core/stores/hudTransientChannel.ts';
import {
  markReplayTimelineControllerRetained,
  getLatestRetainedReplayTimelineController,
  notifyActiveReplayTimelineController,
  setActiveReplayTimelineController,
  getActiveReplayTimelineController,
  subscribeActiveReplayTimelineController,
  registerReplayDirectorDiagnosticExporter,
  registerReplayDirectorPreviewHandlers,
} from '../../ui-core/stores/replayDirectorStore.ts';

let initialized = false;

export function ensureRuntimeEngineUiPortBound(): void {
  if (initialized) return;
  initialized = true;
  bindRuntimeUiPort({
    useAppStore,
    useHudStore,
    hudStore,
    useSpatialAudioStore,
    useSubsystemIsolationLabStore,
    useRewinderStore,
    useReplayViewerStore,
    useReplayToRcsImporterStore,
    useExperimentalMultiBotsStore,
    useStaticTrainingPackStore,
    useStaticTrainingBallCamTunerStore,
    useKickoffTrainingStore,
    useReferenceOverlayStore,
    useNameTagTunerStore,
    useQuickNotificationStore,
    networkDiagnosticsStore,
    determinismStore,
    eventStreamStore,
    reachabilityStore,
    ballTrajectoryTunerStore,
    floatingStore,
    DUAL_ARENA_DETERMINISM_HARNESS_PRESET,
    NETWORK_MONITOR_PRESET,
    globalPacingTelemetryRecorder,
    globalHudTransientChannel,
    quickNotification,
    markReplayTimelineControllerRetained,
    getLatestRetainedReplayTimelineController,
    notifyActiveReplayTimelineController,
    setActiveReplayTimelineController,
    getActiveReplayTimelineController,
    subscribeActiveReplayTimelineController,
    registerReplayDirectorDiagnosticExporter,
    registerReplayDirectorPreviewHandlers,
    getNameTagConfig,
    subscribeNameTagConfig,
    getNameTagRuntimeState,
    setNameTagRuntimeState,
    setNameTagTelemetrySnapshot,
    getNameTagTelemetrySnapshot,
    getActiveEditItemVariable,
    mutateActiveEditItemVariable,
    getFilteredBgmTracks,
    getExpColorSwatch,
    toggleFloatingPreset,
    snapshotCurrentTelemetryPayload,
    notifyNetworkTelemetryExportAvailable,
    pushQuickNotification,
    dismissQuickNotification,
    pushOngoingNotification,
    dismissOngoingNotification,
    completeOngoingNotification,
  });
}

ensureRuntimeEngineUiPortBound();
