/**
 * runtimeUiPort.ts
 * Engine-owned dependency-inversion port for UI store telemetry, notifications,
 * active session hooks, and domain-partitioned GameRuntime -> UI bridge ports
 * (`cameraPort`, `matchPort`, `tunerPort`, `replayPort`).
 */

import { DEFAULT_NAME_TAG_CONFIG } from '../ui-core/config/nameTagConfig.ts';
import {
  createRuntimeUiStoreProxies,
  DEFAULT_STATIC_TRAINING_BALL_CAM_CONFIG as _DEFAULT_STATIC_TRAINING_BALL_CAM_CONFIG,
} from './runtimeUiStoreProxies.ts';
import type {
  BgmTrackEntryPort,
  HudTransientChannelPort,
  NameTagConfig,
  NameTagRuntimeStatePort,
  NameTagTelemetrySnapshot,
  PacingTelemetryRecorderPort,
  ReplayTimelineControllerPort,
  StaticTrainingShotItem,
} from './runtimeUiStorePortTypes.ts';

export type * from './runtimeUiStorePortTypes.ts';
export type * from './runtimeDomainPortTypes.ts';

export const DEFAULT_STATIC_TRAINING_BALL_CAM_CONFIG = _DEFAULT_STATIC_TRAINING_BALL_CAM_CONFIG;

const _runtimeUiStores = createRuntimeUiStoreProxies();

export const {
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
} = _runtimeUiStores;

export let DUAL_ARENA_DETERMINISM_HARNESS_PRESET: Record<string, unknown> = {
  id: 'dual-arena-harness',
};
export let NETWORK_MONITOR_PRESET: Record<string, unknown> = { id: 'network-monitor' };
export let globalPacingTelemetryRecorder: PacingTelemetryRecorderPort | null = null;
export let globalHudTransientChannel: HudTransientChannelPort = {
  setRoster: () => {},
  setMiniMap: () => {},
};
export let quickNotification: {
  info: (msg: string, opts?: Record<string, unknown>) => void;
  success: (msg: string, opts?: Record<string, unknown>) => void;
  warning: (msg: string, opts?: Record<string, unknown>) => void;
  error: (msg: string, opts?: Record<string, unknown>) => void;
} = { info: () => {}, success: () => {}, warning: () => {}, error: () => {} };

const _pendingHandlerRegistrations: {
  registerReplayDirectorDiagnosticExporter: [unknown, unknown, unknown, unknown] | null;
  registerReplayDirectorPreviewHandlers: Record<string, unknown> | null;
} = {
  registerReplayDirectorDiagnosticExporter: null,
  registerReplayDirectorPreviewHandlers: null,
};

type PortHandlerFn = (...args: unknown[]) => unknown;

const _handlers: Record<string, PortHandlerFn | null> = {
  markReplayTimelineControllerRetained: null,
  getLatestRetainedReplayTimelineController: null,
  notifyActiveReplayTimelineController: null,
  setActiveReplayTimelineController: null,
  getActiveReplayTimelineController: null,
  subscribeActiveReplayTimelineController: null,
  registerReplayDirectorDiagnosticExporter: null,
  registerReplayDirectorPreviewHandlers: null,
  getNameTagConfig: null,
  subscribeNameTagConfig: null,
  getNameTagRuntimeState: null,
  setNameTagRuntimeState: null,
  setNameTagTelemetrySnapshot: null,
  getNameTagTelemetrySnapshot: null,
  getActiveEditItemVariable: null,
  mutateActiveEditItemVariable: null,
  getFilteredBgmTracks: null,
  getExpColorSwatch: null,
  toggleFloatingPreset: null,
  snapshotCurrentTelemetryPayload: null,
  notifyNetworkTelemetryExportAvailable: null,
  pushQuickNotification: null,
  dismissQuickNotification: null,
  pushOngoingNotification: null,
  dismissOngoingNotification: null,
  completeOngoingNotification: null,
};

export function bindRuntimeUiPort(port: Record<string, unknown> = {}): void {
  for (const [key, target] of Object.entries(_runtimeUiStores)) {
    if (port[key]) target._bind(port[key]);
  }
  if (port.DUAL_ARENA_DETERMINISM_HARNESS_PRESET) {
    DUAL_ARENA_DETERMINISM_HARNESS_PRESET = port.DUAL_ARENA_DETERMINISM_HARNESS_PRESET as Record<
      string,
      unknown
    >;
  }
  if (port.NETWORK_MONITOR_PRESET) {
    NETWORK_MONITOR_PRESET = port.NETWORK_MONITOR_PRESET as Record<string, unknown>;
  }
  if (port.globalPacingTelemetryRecorder) {
    globalPacingTelemetryRecorder =
      port.globalPacingTelemetryRecorder as PacingTelemetryRecorderPort;
  }
  if (port.globalHudTransientChannel) {
    globalHudTransientChannel = port.globalHudTransientChannel as HudTransientChannelPort;
  }
  if (port.quickNotification) {
    quickNotification = port.quickNotification as typeof quickNotification;
  }

  for (const key of Object.keys(_handlers)) {
    if (typeof port[key] === 'function') _handlers[key] = port[key] as PortHandlerFn;
  }

  if (
    _pendingHandlerRegistrations.registerReplayDirectorDiagnosticExporter &&
    typeof _handlers.registerReplayDirectorDiagnosticExporter === 'function'
  ) {
    _handlers.registerReplayDirectorDiagnosticExporter(
      ..._pendingHandlerRegistrations.registerReplayDirectorDiagnosticExporter
    );
    _pendingHandlerRegistrations.registerReplayDirectorDiagnosticExporter = null;
  }
  if (
    _pendingHandlerRegistrations.registerReplayDirectorPreviewHandlers &&
    typeof _handlers.registerReplayDirectorPreviewHandlers === 'function'
  ) {
    _handlers.registerReplayDirectorPreviewHandlers(
      _pendingHandlerRegistrations.registerReplayDirectorPreviewHandlers
    );
    _pendingHandlerRegistrations.registerReplayDirectorPreviewHandlers = null;
  }
}

export function markReplayTimelineControllerRetained(ctrl: unknown): number {
  return (_handlers.markReplayTimelineControllerRetained?.(ctrl) as number | undefined) ?? 0;
}
export function getLatestRetainedReplayTimelineController(): ReplayTimelineControllerPort | null {
  return (
    (_handlers.getLatestRetainedReplayTimelineController?.() as ReplayTimelineControllerPort | null) ??
    null
  );
}
export function notifyActiveReplayTimelineController(): void {
  _handlers.notifyActiveReplayTimelineController?.();
}
export function setActiveReplayTimelineController(ctrl: unknown): void {
  _handlers.setActiveReplayTimelineController?.(ctrl);
}
export function getActiveReplayTimelineController(): ReplayTimelineControllerPort | null {
  return (
    (_handlers.getActiveReplayTimelineController?.() as ReplayTimelineControllerPort | null) ?? null
  );
}
export function subscribeActiveReplayTimelineController(
  listener: (...args: unknown[]) => void
): () => boolean | void {
  return (
    (_handlers.subscribeActiveReplayTimelineController?.(listener) as
      (() => boolean | void) | undefined) ?? (() => false)
  );
}

export function registerReplayDirectorDiagnosticExporter(
  exporterFn: unknown,
  parserFn: unknown = null,
  windowBuilderFn: unknown = null,
  referenceKeyframeExporterFn: unknown = null
): void {
  if (typeof _handlers.registerReplayDirectorDiagnosticExporter === 'function') {
    _handlers.registerReplayDirectorDiagnosticExporter(
      exporterFn,
      parserFn,
      windowBuilderFn,
      referenceKeyframeExporterFn
    );
  } else {
    _pendingHandlerRegistrations.registerReplayDirectorDiagnosticExporter = [
      exporterFn,
      parserFn,
      windowBuilderFn,
      referenceKeyframeExporterFn,
    ];
  }
}

export function registerReplayDirectorPreviewHandlers(
  handlers: Record<string, unknown> = {}
): void {
  if (typeof _handlers.registerReplayDirectorPreviewHandlers === 'function') {
    _handlers.registerReplayDirectorPreviewHandlers(handlers);
  } else {
    _pendingHandlerRegistrations.registerReplayDirectorPreviewHandlers = handlers;
  }
}

export function getNameTagConfig(): NameTagConfig {
  return (_handlers.getNameTagConfig?.() as NameTagConfig | undefined) ?? DEFAULT_NAME_TAG_CONFIG;
}

export function subscribeNameTagConfig(listener: () => void): () => void {
  return (_handlers.subscribeNameTagConfig?.(listener) as (() => void) | undefined) ?? (() => {});
}

export function getNameTagRuntimeState(): NameTagRuntimeStatePort {
  return (
    (_handlers.getNameTagRuntimeState?.() as NameTagRuntimeStatePort | undefined) ?? {
      isTunerArenaActive: false,
      isMultiplayerOrMultiCarMode: false,
      kickoffPermutationIndex: 0,
      activeCameraMode: 'pov',
      focusedCarIndex: 0,
      selectedCalibrationCarIndex: 0,
      carEntries: [],
      boostBorderOverride: null,
      onEnterTunerArena: null,
      onExitTunerArena: null,
      onReshuffleKickoffPositions: null,
      onSelectPovCar: null,
      onFocusFreeCamOverview: null,
    }
  );
}

export function setNameTagRuntimeState(
  patch: Partial<NameTagRuntimeStatePort> | Record<string, unknown>
): unknown {
  return _handlers.setNameTagRuntimeState?.(patch);
}
export function setNameTagTelemetrySnapshot(
  snapshot: NameTagTelemetrySnapshot | Record<string, unknown>
): void {
  _handlers.setNameTagTelemetrySnapshot?.(snapshot);
}
export function getNameTagTelemetrySnapshot(): NameTagTelemetrySnapshot | null {
  return (_handlers.getNameTagTelemetrySnapshot?.() as NameTagTelemetrySnapshot | null) ?? null;
}
export function getActiveEditItemVariable(): StaticTrainingShotItem | null {
  return (_handlers.getActiveEditItemVariable?.() as StaticTrainingShotItem | null) ?? null;
}
export function mutateActiveEditItemVariable(...args: unknown[]): StaticTrainingShotItem | null {
  return (
    (_handlers.mutateActiveEditItemVariable?.(...args) as StaticTrainingShotItem | null) ?? null
  );
}
export function getFilteredBgmTracks(state?: unknown): BgmTrackEntryPort[] {
  return (_handlers.getFilteredBgmTracks?.(state) as BgmTrackEntryPort[] | undefined) ?? [];
}
export function getExpColorSwatch(slot: number): {
  id: number;
  hex: string;
  name: string;
  [key: string]: unknown;
} {
  return (
    (_handlers.getExpColorSwatch?.(slot) as
      { id: number; hex: string; name: string; [key: string]: unknown } | undefined) ?? {
      id: slot,
      hex: '#38bdf8',
      name: 'Blue',
    }
  );
}
export function toggleFloatingPreset(preset: unknown): unknown {
  return _handlers.toggleFloatingPreset?.(preset);
}
export function snapshotCurrentTelemetryPayload(
  ...args: unknown[]
): Record<string, unknown> | null {
  return (
    (_handlers.snapshotCurrentTelemetryPayload?.(...args) as Record<string, unknown> | null) ?? null
  );
}
export function notifyNetworkTelemetryExportAvailable(...args: unknown[]): unknown {
  return _handlers.notifyNetworkTelemetryExportAvailable?.(...args);
}
export function pushQuickNotification(config: Record<string, unknown>): unknown {
  return _handlers.pushQuickNotification?.(config);
}
export function dismissQuickNotification(id: string): unknown {
  return _handlers.dismissQuickNotification?.(id);
}
export function pushOngoingNotification(config: Record<string, unknown>): unknown {
  return _handlers.pushOngoingNotification?.(config);
}
export function dismissOngoingNotification(id: string): unknown {
  return _handlers.dismissOngoingNotification?.(id);
}
export function completeOngoingNotification(...args: unknown[]): unknown {
  return _handlers.completeOngoingNotification?.(...args);
}
