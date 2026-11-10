/**
 * replayDirectorStateTypes.ts
 * Strongly typed contracts and initial state factories for Goal Replay Director Camera
 * state transitions, diagnostics, and ReplayTimelineController session state.
 */

import type { ReplayRingBuffer, ReplaySignalEntry, ReplayAudioCue } from './ReplayRingBuffer.ts';
import type { ReplayDirectorTelemetryState } from './ReplayFrameInterpolator.ts';
import type { SuffixDirectorTrajectoryPlan } from './ReplayDirectorTrajectoryPlanner.ts';
import { DEFAULT_GOAL_REPLAY_TICKS, type GoalReplayWindowOptions } from './ReplayPlaybackState.ts';
import type { ReplayTouchEvent } from './ReplayDirectorGazeSolver.ts';
import type { ReplayReboundEvent, ResolvedTouchLookahead } from './ReplayTouchTimelineAnalyzer.ts';
import type { ExtractedBallEntity, ExtractedCarEntity } from './ReplayDirectorSceneAnalysis.ts';

export interface DirectorCameraPose {
  eyeX: number;
  eyeY: number;
  eyeZ: number;
  targetX: number;
  targetY: number;
  targetZ: number;
  rawEyeX?: number;
  rawEyeY?: number;
  rawEyeZ?: number;
  rawTargetX?: number;
  rawTargetY?: number;
  rawTargetZ?: number;
}

export interface DirectorInitialSettledCarPos {
  carIndex?: number;
  x: number;
  y: number;
  z: number;
}

export interface DirectorRecordedCsvRow {
  frame_id?: number;
  replay_frame_index?: number;
  timestamp_sec?: number;
  progress?: number;
  is_selected_cursor?: number;
  slow_mo_factor?: number;
  active_touch_car_idx?: number;
  next_touch_car_idx?: number;
  next_touch_blend?: number;
  lateral_bias?: number;
  cam_eye_x?: number;
  cam_eye_y?: number;
  cam_eye_z?: number;
  cam_target_x?: number;
  cam_target_y?: number;
  cam_target_z?: number;
  cam_dist_to_target?: number;
  cam_yaw_deg?: number;
  cam_pitch_deg?: number;
  raw_eye_x?: number;
  raw_eye_y?: number;
  raw_eye_z?: number;
  raw_target_x?: number;
  raw_target_y?: number;
  raw_target_z?: number;
  ball_x?: number;
  ball_y?: number;
  ball_z?: number;
  ball_vx?: number;
  ball_vy?: number;
  ball_vz?: number;
  ball_speed_kph?: number;
  focus_car_x?: number;
  focus_car_y?: number;
  focus_car_z?: number;
  focus_car_vx?: number;
  focus_car_vy?: number;
  focus_car_vz?: number;
  focus_car_dist_to_ball?: number;
  focus_car_fx?: number;
  focus_car_fy?: number;
  focus_car_fz?: number;
  focus_car_ux?: number;
  focus_car_uy?: number;
  focus_car_uz?: number;
  focus_car_visual_id?: string;
  focus_car_hitbox_id?: string;
  cars_pose_compact?: string;
  eye_step_uu?: number;
  target_step_uu?: number;
  yaw_step_deg?: number;
  pitch_step_deg?: number;
  raw_eye_step_uu?: number;
  raw_target_step_uu?: number;
  eye_accel_uu?: number;
  target_accel_uu?: number;
  car_view_angle_deg?: number;
  ball_view_angle_deg?: number;
}

export interface ReplayCarRosterEntry {
  carIndex?: number;
  team?: number;
  name?: string;
  username?: string;
  isBot?: boolean;
  isLocalPlayer?: boolean;
  botType?: string | null;
  visualId?: string;
  hitboxId?: string | null;
  colorSlot?: number;
  colorHex?: string | null;
  paintFinish?: string | null;
  boostVisual?: string | null;
  boostAudio?: string | null;
  anthemId?: string | null;
}

export interface ReplayFrameCarControlEntry {
  carIndex?: number;
  throttle?: number;
  steer?: number;
  pitch?: number;
  yaw?: number;
  roll?: number;
  jump?: boolean | number;
  boost?: boolean | number;
  handbrake?: boolean | number;
  controls?: ReplayFrameCarControlEntry;
}

export interface ReplayIncidentEntry {
  [key: string]: unknown;
  type?: number;
  subType?: number;
  frameIndex?: number;
  tick?: number;
  carIndex?: number;
  otherCarIndex?: number;
  team?: number;
  posX?: number;
  posY?: number;
  posZ?: number;
  ballX?: number;
  ballY?: number;
  ballZ?: number;
  normX?: number;
  normY?: number;
  normZ?: number;
  speedKph?: number;
}

export interface ReplayTimelineFrameEntry {
  tick: number;
  timestamp?: number;
  snapshot: Float32Array | null;
  acknowledgedControls?: ReplayFrameCarControlEntry[] | null;
  controls?: ReplayFrameCarControlEntry[] | null;
  incidents?: ReplayIncidentEntry[];
  events?: ReplayIncidentEntry[];
  signals?: ReplaySignalEntry[];
  audioEvents?: ReplayAudioCue[];
  recordedCsvRow?: DirectorRecordedCsvRow | null;
}

export type ReplayActiveFrameEntry = ReplayTimelineFrameEntry;
export type DirectorSmoothnessSummary = Record<string, unknown>;
export type DirectorAnomalyPeaks = Record<string, unknown>;

export interface ReplayInterpolatorPort {
  currState: Float32Array;
  prevState: Float32Array;
  alpha: number;
  sync?: () => void;
}

export interface ReplayPhysicsEnginePort {
  numCars?: number;
  state?: Float32Array | null;
  isCarSlotActive?: (carIndex: number) => boolean;
  addCar?: (team: number, preset: string) => number | void;
  addCarAtSlot?: (carIndex: number, team: number, preset: string) => number | void;
  restoreState?: (buffer: Float32Array, options?: { preserveEngineTick?: boolean }) => void;
  setBallState?: (state: Float32Array) => boolean | void;
  setCarState?: (carIndex: number, state: Float32Array) => boolean | void;
  setControls?: (carIndex: number, controls: ReplayFrameCarControlEntry) => void;
  setCarControls?: (carIndex: number, controls: ReplayFrameCarControlEntry) => void;
  getReplayFrameCount?: () => number;
  getReplayFrameByIndex?: (index: number) => Float32Array | null;
  getReplayFrameByOffset?: (ticksAgo: number) => Float32Array | null;
  getReplayControlsByIndex?: (index: number) => Uint8Array | null;
  getReplayIncidentTrackBytes?: () => Uint8Array | null;
  getReplaySignalTrackBytes?: () => Uint8Array | null;
}

export interface DirectorCameraState {
  initialized: boolean;
  eyeX: number;
  eyeY: number;
  eyeZ: number;
  targetX: number;
  targetY: number;
  targetZ: number;
  lateralBias: number;
  hasResolvedInitialLateralBias?: boolean;
  scorerCarIndex?: number;
  activeTouchCarIndex: number;
  nextTouchCarIndex: number;
  nextTouchBlend: number;
  nextTouchBallPos: { x: number; y: number; z: number } | null;
  interceptorCarIndex: number;
  interceptorBlend: number;
  plannedPose?: DirectorCameraPose | null;
  suffixCameraPlan: SuffixDirectorTrajectoryPlan | null;
  touchEvents: ReplayTouchEvent[];
  reboundEvents?: ReplayReboundEvent[];
  lastScoringTouchFrameIdx: number;
  goalLineFrameIdx: number;
  useRecordedCsvPose?: boolean;
  recordedPose?: DirectorCameraPose | null;
  isPaused?: boolean;
  isScrubbing?: boolean;
  currentFrameIndex?: number;
  postGoalElapsedSec?: number;
  goalAnchorEyeY?: number;
  initialSettledCarPos?: DirectorInitialSettledCarPos | null;
  smoothedCarX?: number;
  smoothedCarY?: number;
  smoothedCarZ?: number;
  carSwitchBlend?: number;
  smoothedUgX?: number;
  smoothedUgY?: number;
  smoothedLateralBias?: number;
}

export interface ReplaySessionState {
  activeFrames: ReplayTimelineFrameEntry[];
  cursorFloat: number;
  isPaused: boolean;
  isPersistent: boolean;
  playbackSpeed: number;
  isScrubbing: boolean;
  scoringTeam: number;
  scorerCarIndex: number;
  carTeamResolver: ((carIndex: number) => number) | null;
  isActive: boolean;
  isNetworkStreamed: boolean;
  expectedDurationTicks: number;
  streamedFramesReceived: number;
  hasRetainedReplay: boolean;
  retainedReplaySeq: number;
  isImportedPreview: boolean;
  importedFileName: string | null;
  importedSummary: Record<string, unknown> | null;
  importedAnomalyPeaks: Record<string, unknown> | null;
  importedCarEntries: ReplayCarRosterEntry[] | null;
  carEntries: ReplayCarRosterEntry[] | null;
  cachedSuffixCameraPlan: SuffixDirectorTrajectoryPlan | null;
  cachedSmoothnessSummary: Record<string, unknown> | null;
  cachedAnomalyPeaks: Record<string, unknown> | null;
  useRecordedCsvCamera: boolean;
  isLoopingPreview: boolean;
  disableSlowMo: boolean;
  watchAllTouches: boolean;
  goalLineFrameIdx: number;
  reboundEvents: ReplayReboundEvent[];
  lateralBias: number;
  lastDispatchedFrameIndex: number;
  smoothedEye: DirectorCameraPose | null;
  smoothedTarget: DirectorCameraPose | null;
}

export interface ReplaySessionInitOptions extends GoalReplayWindowOptions {
  frames?: ReplayTimelineFrameEntry[];
  isNetworkStreamed?: boolean;
  scoringTeam?: number;
  scorerCarIndex?: number;
  carTeamResolver?: ((carIndex: number) => number) | null;
  disableSlowMo?: boolean;
  watchAllTouches?: boolean;
  isImportedPreview?: boolean;
  importedFileName?: string | null;
  importedSummary?: Record<string, unknown> | null;
  importedAnomalyPeaks?: Record<string, unknown> | null;
  useRecordedCsvCamera?: boolean;
  isLoopingPreview?: boolean;
  isPersistent?: boolean;
  carEntries?: ReplayCarRosterEntry[] | null;
  touchEvents?: ReplayTouchEvent[];
  goalLineFrameIdx?: number;
  lateralBias?: number;
}

export interface ImportedDiagnosticPatternInput {
  fileName?: string;
  activeFrames: ReplayTimelineFrameEntry[];
  scoringTeam?: number;
  scorerCarIndex?: number;
  selectedCursorIndex?: number;
  lateralBias?: number;
  touchEvents?: ReplayTouchEvent[];
  lastScoringTouchFrameIdx?: number;
  goalLineFrameIdx?: number;
  initialSettledCarPos?: DirectorInitialSettledCarPos | null;
  hasRecordedCsvRows?: boolean;
  carEntries?: ReplayCarRosterEntry[];
  summary?: Record<string, unknown> | null;
  anomalyPeaks?: Record<string, unknown> | null;
}

export interface ImportedDiagnosticLoadOptions {
  fileName?: string;
  useRecordedCsvCamera?: boolean;
  startFromBeginning?: boolean;
}

export interface RefreshDirectorPoseInput {
  totalFrames: number;
  cursorFloat: number;
  isPaused: boolean;
  isScrubbing: boolean;
  isImportedPreview: boolean;
  useRecordedCsvCamera: boolean;
  scoringTeam: number;
  scorerCarIndex: number;
  getFrameEntryByIndex: (index: number) => ReplayTimelineFrameEntry | null;
  getFrameBufferByIndex: (index: number) => Float32Array | null;
  ensureSuffixCameraPlan: () => SuffixDirectorTrajectoryPlan | null;
  resolveTouchLookaheadForFrame: (
    frameIdx: number,
    fallbackScorerCarIndex: number
  ) => ResolvedTouchLookahead;
}

export interface StepDirectorCameraSyncInput {
  baseIdx: number;
  nextIdx: number;
  alpha: number;
  useCsvPose: boolean;
  cursorFloat: number;
  isPaused: boolean;
  isScrubbing: boolean;
  prevEntry: ReplayTimelineFrameEntry | null;
  nextEntry: ReplayTimelineFrameEntry | null;
  currFrame: Float32Array | null;
  suffixPlan: SuffixDirectorTrajectoryPlan | null;
  scorerCarIndex: number;
  resolveTouchLookaheadForFrame: (
    frameIdx: number,
    fallbackScorerCarIndex: number
  ) => ResolvedTouchLookahead;
}

export interface StepDirectorCameraSyncResult {
  embeddedTelemetry: ReplayDirectorTelemetryState | null;
  resolvedScorerCarIndex: number;
}

export interface TimelineReplaySessionInitInput {
  ringBuffer: ReplayRingBuffer | null;
  engine: ReplayPhysicsEnginePort | null;
  options: ReplaySessionInitOptions;
  currentRetainedReplaySeq: number;
}

export interface RetainedReplaySnapshotCloneInput {
  currentSessionState: ReplaySessionState;
  sourceSessionState: ReplaySessionState;
}

export interface ReplayDirectorDiagnosticInput {
  totalFrames: number;
  activeWindowCount: number;
  currentFrameIndex: number;
  cursorFloat: number;
  progress: number;
  playbackSpeed: number;
  isPaused: boolean;
  isPersistent: boolean;
  isScrubbing: boolean;
  isActive: boolean;
  isImportedPreview: boolean;
  importedFileName: string | null;
  useRecordedCsvCamera: boolean;
  cachedSmoothnessSummary: DirectorSmoothnessSummary | null;
  importedSummary: DirectorSmoothnessSummary | null;
  cachedAnomalyPeaks: DirectorAnomalyPeaks | null;
  importedAnomalyPeaks: DirectorAnomalyPeaks | null;
  scoringTeam: number;
  scorerCarIndex: number;
  carTeamResolver: ((carIndex: number) => number) | null;
  carEntries?: ReadonlyArray<ReplayCarRosterEntry> | null;
  directorCameraState: DirectorCameraState;
  getFrameEntryByIndex: (index: number) => ReplayActiveFrameEntry | null;
  getFrameBufferByIndex: (index: number) => Float32Array | null;
  ensureSuffixCameraPlan: () => SuffixDirectorTrajectoryPlan | null;
  resolveTouchLookaheadForFrame: (
    frameIdx: number,
    fallbackScorerCarIndex: number
  ) => ResolvedTouchLookahead;
  computeDramaticSlowMoFactor: (
    cursorFloat: number,
    options?: { ignoreScrubState?: boolean }
  ) => number;
}

export interface DirectorDiagnosticPatternOptions {
  extraMetadata?: Record<string, unknown>;
  carEntries?: ReplayCarRosterEntry[];
}

export interface DirectorDiagnosticFrameLookahead {
  activeTouchCarIndex: number;
  nextTouchCarIndex: number;
  nextTouchBlend: number;
  nextTouchBallPos: [number, number, number] | null;
  interceptorCarIndex: number;
  interceptorBlend: number;
  postGoalElapsedSec: number;
  smoothedStrikerPos: [number, number, number];
  carSwitchBlend: number;
  lateralBias: number;
}

export interface DirectorDiagnosticFrameCameraPose {
  eyeUnreal: [number, number, number];
  targetUnreal: [number, number, number];
  eyeThreeJs: [number, number, number];
  targetThreeJs: [number, number, number];
  forwardUnreal: [number, number, number];
  distanceToTarget: number;
  yawDeg: number;
  pitchDeg: number;
  carViewAngleDeg: number;
  interceptorViewAngleDeg: number;
  ballViewAngleDeg: number;
  rawUndampedEyeUnreal: [number, number, number];
  rawUndampedTargetUnreal: [number, number, number];
  rawDistanceToTarget: number;
  rawYawDeg: number;
  rawPitchDeg: number;
  eyeStepUu: number;
  targetStepUu: number;
  yawStepDeg: number;
  pitchStepDeg: number;
  rawEyeStepUu: number;
  rawTargetStepUu: number;
  eyeAccelUu: number;
  targetAccelUu: number;
}

export interface DirectorDiagnosticFrameEntry {
  frameId: number;
  replayFrameIndex: number;
  timestampSec: number;
  progress: number;
  slowMoFactor: number;
  isSelectedCursorFrame: boolean;
  lookahead: DirectorDiagnosticFrameLookahead;
  cameraPose: DirectorDiagnosticFrameCameraPose;
  ball: ExtractedBallEntity;
  cars: ExtractedCarEntity[];
  incidents?: Array<Record<string, unknown>>;
}

export interface DirectorDiagnosticTouchTimelineEntry {
  replayFrameIndex: number;
  frameId: number;
  timestampSec: number;
  carIndex: number;
  team: number;
  ballPos: [number, number, number];
}

export function createInitialDirectorCameraState(): DirectorCameraState {
  return {
    initialized: false,
    eyeX: 0,
    eyeY: 0,
    eyeZ: 0,
    targetX: 0,
    targetY: 0,
    targetZ: 0,
    lateralBias: 1.0,
    activeTouchCarIndex: 0,
    nextTouchCarIndex: -1,
    nextTouchBlend: 0,
    nextTouchBallPos: null,
    interceptorCarIndex: -1,
    interceptorBlend: 0,
    plannedPose: null,
    suffixCameraPlan: null,
    touchEvents: [],
    lastScoringTouchFrameIdx: -1,
    goalLineFrameIdx: -1,
    useRecordedCsvPose: false,
    recordedPose: null,
    isPaused: false,
    isScrubbing: false,
  };
}

export function createInitialReplaySessionState(): ReplaySessionState {
  return {
    activeFrames: [],
    cursorFloat: 0,
    isPaused: false,
    isPersistent: false,
    playbackSpeed: 1.0,
    isScrubbing: false,
    scoringTeam: 0,
    scorerCarIndex: 0,
    carTeamResolver: null,
    isActive: false,
    isNetworkStreamed: false,
    expectedDurationTicks: DEFAULT_GOAL_REPLAY_TICKS,
    streamedFramesReceived: 0,
    hasRetainedReplay: false,
    retainedReplaySeq: 0,
    isImportedPreview: false,
    importedFileName: null,
    importedSummary: null,
    importedAnomalyPeaks: null,
    importedCarEntries: null,
    carEntries: null,
    cachedSuffixCameraPlan: null,
    cachedSmoothnessSummary: null,
    cachedAnomalyPeaks: null,
    useRecordedCsvCamera: false,
    isLoopingPreview: false,
    disableSlowMo: false,
    watchAllTouches: false,
    goalLineFrameIdx: -1,
    reboundEvents: [],
    lateralBias: 1.0,
    lastDispatchedFrameIndex: -1,
    smoothedEye: null,
    smoothedTarget: null,
  };
}
