/**
 * replayDirectorStore.ts
 * Active session subscription and diagnostic service locator for the Goal Replay Director Camera & Slow-Motion.
 */
import { create } from 'zustand';
import { REPLAY_DIRECTOR_CONFIG, getReplayDirectorConfig, resetReplayDirectorConfig, setReplayDirectorActiveControllerHooks, subscribeReplayDirectorConfig, updateReplayDirectorConfig, type ReplayDirectorActiveControllerConfigTarget, type ReplayDirectorConfigListener, type ReplayDirectorConfigState } from '../config/replayDirectorConfig';

export type { ReplayDirectorConfigListener, ReplayDirectorConfigState };

export interface ReplayDirectorStoreState {
  config: ReplayDirectorConfigState;
  updateConfig: (patch?: Partial<ReplayDirectorConfigState>) => ReplayDirectorConfigState;
  resetConfig: () => ReplayDirectorConfigState;
}

export const useReplayDirectorStore = create<ReplayDirectorStoreState>(() => ({
  config: getReplayDirectorConfig(),
  updateConfig: (patch = {}) => updateReplayDirectorConfig(patch),
  resetConfig: () => resetReplayDirectorConfig(),
}));

subscribeReplayDirectorConfig((snapshot) => {
  useReplayDirectorStore.setState({ config: snapshot });
});

export interface ReplayDirectorAnomalyPeakEntry {
  frameId?: number;
  replayFrameIndex?: number;
  valueUu?: number;
  valueDeg?: number;
}

export interface ReplayDirectorAnomalyPeaks {
  maxEyeStep?: ReplayDirectorAnomalyPeakEntry;
  maxYawStep?: ReplayDirectorAnomalyPeakEntry;
  maxEyeAccel?: ReplayDirectorAnomalyPeakEntry;
}

export interface ReplayDirectorFrameCameraPose {
  dampedEyeUnreal: [number, number, number];
  dampedTargetUnreal: [number, number, number];
  yawDeg: number;
  pitchDeg: number;
  distanceToTarget: number;
  carViewAngleDeg?: number;
  ballViewAngleDeg?: number;
  interceptorViewAngleDeg?: number;
  eyeStepUu?: number;
  yawStepDeg?: number;
}

export interface ReplayDirectorFrameLookahead {
  activeTouchCarIndex: number;
  nextTouchCarIndex: number;
  interceptorCarIndex?: number;
  interceptorBlend?: number;
}

export interface ReplayDirectorDiagnosticSnapshot {
  frameId?: number;
  replayFrameIndex?: number;
  totalReplayFrames?: number;
  importedFileName?: string;
  hasRecordedCsvCamera?: boolean;
  useRecordedCsvCamera?: boolean;
  anomalyPeaks?: ReplayDirectorAnomalyPeaks | null;
  importedSummary?: {
    totalYawPathDeg?: number;
    netYawSpanDeg?: number;
  } | null;
  cameraPose: ReplayDirectorFrameCameraPose;
  lookahead: ReplayDirectorFrameLookahead;
  cars?: unknown[];
  [key: string]: unknown;
}

export interface ReplayDirectorLiveCameraState {
  eyeUnreal?: [number, number, number];
  yawUnrealDeg?: number;
  pitchUnrealDeg?: number;
  fovDeg?: number;
  [key: string]: unknown;
}

export interface ReplayDirectorExportResult {
  filename?: string;
  content?: string;
  [key: string]: unknown;
}

export interface ReplayDirectorDiagnosticPattern {
  name?: string;
  activeFrames?: unknown[];
  directorConfig?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface ReplayDirectorSessionStateSlice {
  isActive?: boolean;
  isPaused?: boolean;
  isPersistent?: boolean;
  isScrubbing?: boolean;
  isImportedPreview?: boolean;
  hasRetainedReplay?: boolean;
  playbackSpeed?: number;
  activeFrames?: unknown[];
  retainedReplaySeq?: number;
  useRecordedCsvCamera?: boolean;
}

export interface ReplayDirectorControllerHandle extends ReplayDirectorActiveControllerConfigTarget {
  sessionState?: ReplayDirectorSessionStateSlice;
  setRecordedCsvCameraMode?: (useRecordedCsv: boolean) => boolean;
  isActive?: boolean;
  isPaused?: boolean;
  isPersistent?: boolean;
  isScrubbing?: boolean;
  isImportedPreview?: boolean;
  hasRetainedReplay?: boolean;
  ActiveWindowCount?: number;
  playbackSpeed?: number;
  activeFrames?: unknown[];
  retainedReplaySeq?: number;
  useRecordedCsvCamera?: boolean;
  copyRetainedReplayFrom?: (other: ReplayDirectorControllerHandle) => void;
  getCurrentFrameDiagnosticSnapshot: () => ReplayDirectorDiagnosticSnapshot | null;
  togglePause: () => void;
  cyclePlaybackSpeed: () => void;
  seekToNormalized: (norm01: number) => void;
  endReplaySession?: () => void;
  buildDirectorFrameWindowDiagnostic?: (windowRadius: number) => Record<string, unknown> | null;
  loadImportedDiagnosticPattern?: (
    parsed: ReplayDirectorDiagnosticPattern,
    options: Record<string, unknown>
  ) => void;
}

export type ReplayDirectorDiagnosticExporterFn = (
  ctrl: ReplayDirectorControllerHandle | null,
  format: string,
  options: Record<string, unknown>
) => ReplayDirectorExportResult | null;

export type ReplayDirectorDiagnosticParserFn = (
  fileOrInput: unknown,
  fileName: string
) => Promise<ReplayDirectorDiagnosticPattern | null>;

export type ReplayDirectorWindowDiagnosticBuilderFn = (
  ctrl: ReplayDirectorControllerHandle,
  windowRadius: number
) => Record<string, unknown> | null;

export type ReplayDirectorReferenceKeyframeExporterFn = (
  ctrl: ReplayDirectorControllerHandle,
  options: Record<string, unknown>
) => ReplayDirectorExportResult | null;

let _activeReplayController: ReplayDirectorControllerHandle | null = null;
let _latestRetainedReplayController: ReplayDirectorControllerHandle | null = null;
let _retainedReplaySequence = 0;
let _diagnosticExporter: ReplayDirectorDiagnosticExporterFn | null = null;
let _diagnosticParser: ReplayDirectorDiagnosticParserFn | null = null;
let _windowDiagnosticBuilder: ReplayDirectorWindowDiagnosticBuilderFn | null = null;
let _referenceKeyframeExporter: ReplayDirectorReferenceKeyframeExporterFn | null = null;

export interface ReplayDirectorPreviewHandlers {
  onImportPattern?: ((
    parsed: ReplayDirectorDiagnosticPattern,
    options: Record<string, unknown>
  ) => ReplayDirectorDiagnosticPattern | null) | null;
  onStartPreview?: ((options: Record<string, unknown>) => boolean) | null;
  onExitPreview?: (() => boolean) | null;
  onEnterReferenceFreeCam?: ((options: Record<string, unknown>) => boolean) | null;
  onExitReferenceFreeCam?: (() => boolean) | null;
  onGetLiveCameraState?: (() => ReplayDirectorLiveCameraState | null) | null;
}

const _previewHandlers: ReplayDirectorPreviewHandlers = {
  onImportPattern: null,
  onStartPreview: null,
  onExitPreview: null,
  onEnterReferenceFreeCam: null,
  onExitReferenceFreeCam: null,
  onGetLiveCameraState: null,
};

export type ReplaySessionListener = (controller: ReplayDirectorControllerHandle | null) => void;
const _replaySessionListeners = new Set<ReplaySessionListener>();

setReplayDirectorActiveControllerHooks({
  getActiveController: () => _activeReplayController,
  notifyActiveController: () => notifyActiveReplayTimelineController(),
});

export function markReplayTimelineControllerRetained(
  ctrl: ReplayDirectorControllerHandle | null | undefined
): number {
  const s = ctrl?.sessionState;
  if (!s || !Array.isArray(s.activeFrames) || s.activeFrames.length === 0) {
    return 0;
  }
  _retainedReplaySequence += 1;
  s.retainedReplaySeq = _retainedReplaySequence;
  _latestRetainedReplayController = ctrl;
  return _retainedReplaySequence;
}

export function getLatestRetainedReplayTimelineController(): ReplayDirectorControllerHandle | null {
  return _latestRetainedReplayController;
}

export function notifyActiveReplayTimelineController(): void {
  for (const fn of _replaySessionListeners) {
    try {
      fn(_activeReplayController);
    } catch (err) {
      console.warn('[replayDirectorStore] Replay session listener failed:', err);
    }
  }
}

export function setActiveReplayTimelineController(
  ctrl: ReplayDirectorControllerHandle | null
): void {
  if (
    ctrl &&
    !ctrl.sessionState?.isActive &&
    _latestRetainedReplayController &&
    _latestRetainedReplayController !== ctrl &&
    Array.isArray(_latestRetainedReplayController.sessionState?.activeFrames) &&
    _latestRetainedReplayController.sessionState.activeFrames.length > 0 &&
    (_latestRetainedReplayController.sessionState?.retainedReplaySeq || 0) > (ctrl.sessionState?.retainedReplaySeq || 0) &&
    typeof ctrl.copyRetainedReplayFrom === 'function'
  ) {
    ctrl.copyRetainedReplayFrom(_latestRetainedReplayController);
  }
  _activeReplayController = ctrl;
  notifyActiveReplayTimelineController();
}

export function getActiveReplayTimelineController(): ReplayDirectorControllerHandle | null {
  return _activeReplayController;
}

export function subscribeActiveReplayTimelineController(
  listener: ReplaySessionListener
): () => boolean {
  if (typeof listener !== 'function') return () => false;
  _replaySessionListeners.add(listener);
  return () => _replaySessionListeners.delete(listener);
}

export function registerReplayDirectorDiagnosticExporter(
  exporterFn: ReplayDirectorDiagnosticExporterFn,
  parserFn: ReplayDirectorDiagnosticParserFn | null = null,
  windowBuilderFn: ReplayDirectorWindowDiagnosticBuilderFn | null = null,
  referenceKeyframeExporterFn: ReplayDirectorReferenceKeyframeExporterFn | null = null
): void {
  _diagnosticExporter = exporterFn;
  if (typeof parserFn === 'function') {
    _diagnosticParser = parserFn;
  }
  if (typeof windowBuilderFn === 'function') {
    _windowDiagnosticBuilder = windowBuilderFn;
  }
  if (typeof referenceKeyframeExporterFn === 'function') {
    _referenceKeyframeExporter = referenceKeyframeExporterFn;
  }
}

export function registerReplayDirectorPreviewHandlers(
  handlers: ReplayDirectorPreviewHandlers = {}
): void {
  if (!handlers || typeof handlers !== 'object') return;
  if (typeof handlers.onImportPattern === 'function') {
    _previewHandlers.onImportPattern = handlers.onImportPattern;
  }
  if (typeof handlers.onStartPreview === 'function') {
    _previewHandlers.onStartPreview = handlers.onStartPreview;
  }
  if (typeof handlers.onExitPreview === 'function') {
    _previewHandlers.onExitPreview = handlers.onExitPreview;
  }
  if (typeof handlers.onEnterReferenceFreeCam === 'function') {
    _previewHandlers.onEnterReferenceFreeCam = handlers.onEnterReferenceFreeCam;
  }
  if (typeof handlers.onExitReferenceFreeCam === 'function') {
    _previewHandlers.onExitReferenceFreeCam = handlers.onExitReferenceFreeCam;
  }
  if (typeof handlers.onGetLiveCameraState === 'function') {
    _previewHandlers.onGetLiveCameraState = handlers.onGetLiveCameraState;
  }
}

export function enterActiveReplayDirectorReferenceFreeCam(
  options: Record<string, unknown> = {}
): boolean {
  if (typeof _previewHandlers.onEnterReferenceFreeCam === 'function') {
    return _previewHandlers.onEnterReferenceFreeCam(options);
  }
  return false;
}

export function exitActiveReplayDirectorReferenceFreeCam(): boolean {
  if (typeof _previewHandlers.onExitReferenceFreeCam === 'function') {
    return _previewHandlers.onExitReferenceFreeCam();
  }
  return false;
}

export function getActiveReplayDirectorLiveCameraState(): ReplayDirectorLiveCameraState | null {
  if (typeof _previewHandlers.onGetLiveCameraState === 'function') {
    return _previewHandlers.onGetLiveCameraState();
  }
  return null;
}

export function exportActiveReplayDirectorReferenceKeyframe(
  options: {
    controller?: ReplayDirectorControllerHandle | null;
    liveCameraState?: ReplayDirectorLiveCameraState | null;
    [key: string]: unknown;
  } = {}
): ReplayDirectorExportResult | null {
  const ctrl = options.controller || _activeReplayController;
  if (!ctrl) return null;
  const liveCameraState = options.liveCameraState || getActiveReplayDirectorLiveCameraState();
  if (typeof _referenceKeyframeExporter === 'function') {
    return _referenceKeyframeExporter(ctrl, { ...options, liveCameraState });
  }
  return null;
}

export function exportActiveReplayDirectorDiagnosticPattern(
  format = 'rcgr',
  options: {
    controller?: ReplayDirectorControllerHandle | null;
    [key: string]: unknown;
  } = {}
): ReplayDirectorExportResult | null {
  const ctrl = options.controller || _activeReplayController;
  if (typeof _diagnosticExporter === 'function') {
    return _diagnosticExporter(ctrl, format, options);
  }
  return null;
}

export function buildActiveReplayDirectorWindowDiagnostic(
  windowRadius = 15,
  options: {
    controller?: ReplayDirectorControllerHandle | null;
    [key: string]: unknown;
  } = {}
): Record<string, unknown> | null {
  const ctrl = options.controller || _activeReplayController;
  if (!ctrl) return null;
  if (typeof ctrl.buildDirectorFrameWindowDiagnostic === 'function') {
    return ctrl.buildDirectorFrameWindowDiagnostic(windowRadius);
  }
  if (typeof _windowDiagnosticBuilder === 'function') {
    return _windowDiagnosticBuilder(ctrl, windowRadius);
  }
  return null;
}

export async function importActiveReplayDirectorDiagnosticPattern(
  fileOrInput: unknown,
  options: {
    fileName?: string;
    applyImportedConfig?: boolean;
    [key: string]: unknown;
  } = {}
): Promise<ReplayDirectorDiagnosticPattern | null> {
  const inputRecord =
    fileOrInput && typeof fileOrInput === 'object'
      ? (fileOrInput as ReplayDirectorDiagnosticPattern)
      : null;
  const fileName =
    options.fileName ||
    (inputRecord && typeof inputRecord.name === 'string' && inputRecord.name) ||
    'imported.rcgr.gz';

  let parsed: ReplayDirectorDiagnosticPattern | null = null;
  if (inputRecord && Array.isArray(inputRecord.activeFrames)) {
    parsed = inputRecord;
  } else if (typeof _diagnosticParser === 'function') {
    parsed = await _diagnosticParser(fileOrInput, fileName);
  }

  if (!parsed || !Array.isArray(parsed.activeFrames) || parsed.activeFrames.length === 0) {
    return null;
  }

  if (parsed.directorConfig && options.applyImportedConfig === true) {
    const patch: Record<string, number> = {};
    for (const [key, val] of Object.entries(parsed.directorConfig)) {
      if (key in REPLAY_DIRECTOR_CONFIG && typeof val === 'number' && Number.isFinite(val)) {
        patch[key] = val;
      }
    }
    updateReplayDirectorConfig(patch);
  }

  const effectiveOptions: Record<string, unknown> = {
    useRecordedCsvCamera: false,
    ...options,
    fileName,
  };

  if (typeof _previewHandlers.onImportPattern === 'function') {
    return _previewHandlers.onImportPattern(parsed, effectiveOptions);
  }

  if (_activeReplayController?.loadImportedDiagnosticPattern) {
    _activeReplayController.loadImportedDiagnosticPattern(parsed, effectiveOptions);
    notifyActiveReplayTimelineController();
  }
  return parsed;
}

export function startActiveReplayDirectorPreview(
  options: Record<string, unknown> = {}
): boolean {
  if (typeof _previewHandlers.onStartPreview === 'function') {
    return _previewHandlers.onStartPreview(options);
  }
  return false;
}

export function exitActiveReplayDirectorPreview(): boolean {
  if (typeof _previewHandlers.onExitPreview === 'function') {
    return _previewHandlers.onExitPreview();
  }
  if (_activeReplayController?.sessionState?.isActive) {
    _activeReplayController.endReplaySession?.();
    return true;
  }
  return false;
}

export function setActiveReplayDirectorCsvCameraMode(useRecordedCsv: boolean): boolean {
  if (!_activeReplayController) return false;
  return Boolean(_activeReplayController.setRecordedCsvCameraMode?.(useRecordedCsv));
}
