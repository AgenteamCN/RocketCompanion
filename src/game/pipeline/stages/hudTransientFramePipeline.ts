/**
 * hudTransientFramePipeline.ts
 * Pure data operator transforming (physicsState, camera, roster) into a HudTransientFramePayload
 * including 6-slot EdgeRosterHudState, 2D pitch mini-map coordinates, and 3D name-tag screen projections.
 */
import * as THREE from 'three';
import { computeRightTeamStartSlotKey } from '../../../replay/container/RCReplayTimelineParser.ts';
import type { RosterTeamEntry } from './hudRosterResolverPipeline.ts';

export type * from './hudRosterResolverPipeline.ts';

const PITCH_HALF_WIDTH_UU = 4096;
const PITCH_HALF_LENGTH_UU = 5120;
const PITCH_MINIMAP_SPAN_X_PCT = 44;
const PITCH_MINIMAP_SPAN_Y_PCT = 43.5;
const UU_PER_SECOND_TO_KPH = 0.036;

export interface CarHudTelemetry {
  boostAmount: number;
  isDemolished: boolean;
  demoRespawnRemainingSec: number;
  demolishedAtMs: number;
}

export interface HudTransientPhysicsStateInput {
  ballPosX?: number;
  ballPosY?: number;
  ballPosZ?: number;
  ballVelX?: number;
  ballVelY?: number;
  ballVelZ?: number;
  carPositions?: ReadonlyArray<{
    carIndex: number;
    posX: number;
    posY: number;
    posZ: number;
  }>;
  resolveCarTelemetry: (carIndex: number) => CarHudTelemetry;
}

export interface HudTransientCameraInput {
  activeCameraCar: number;
  replayCameraMode?: string;
  perspectiveCamera?: THREE.Camera | null;
  viewportWidthPx?: number;
  viewportHeightPx?: number;
}

export interface HudTransientRosterInput {
  blueEntries: readonly RosterTeamEntry[];
  orangeEntries: readonly RosterTeamEntry[];
  detectedLocalTeam: number | null;
  isSpectatingNoHuman: boolean;
  choreographySignal?: string;
  matchPhase?: string;
  localSkipReplayReady?: boolean;
  acknowledgedJumpByCar?: ReadonlyMap<number, boolean>;
}

export interface HudTransientPlayerSlotPayload {
  slotKey: number;
  carIndex?: number;
  team: 'left' | 'right';
  name: string;
  boostAmount: number;
  exists: boolean;
  isSelf: boolean;
  isFocusedPov: boolean;
  isDemolished: boolean;
  demoRespawnRemainingSec: number;
  demoRespawnTotalSec: number;
  demolishedAtMs: number;
  replaySkipReady: boolean;
}

export interface HudTransientMiniMapPayload {
  ballX: number;
  ballY: number;
  ballNormX: number;
  ballNormY: number;
  ballHitKph: number;
  isFlipped: boolean;
}

export interface HudTransientNameTagProjection2D {
  carIndex: number;
  screenX: number;
  screenY: number;
  ndcZ: number;
  visible: boolean;
}

export interface HudTransientFramePayload {
  localTeam: 0 | 1;
  slotKeyToCarIndex: Record<number, number>;
  rosterPatch: {
    viewMode: 'player-live' | 'goal-replay' | 'spectator';
    focusedSlotKey: number | null;
    leftPlayers: HudTransientPlayerSlotPayload[];
    rightPlayers: HudTransientPlayerSlotPayload[];
  };
  miniMap: HudTransientMiniMapPayload;
  nameTagProjections: HudTransientNameTagProjection2D[];
  rosterDirty: boolean;
  miniMapDirty: boolean;
}

const _scratchProjVec = new THREE.Vector3();
const _emptyBlueNames = ['Blue #1', 'Blue #2', 'Blue #3', 'Blue #4', 'Blue #5', 'Blue #6'];
const _emptyOrangeNames = [
  'Orange #1',
  'Orange #2',
  'Orange #3',
  'Orange #4',
  'Orange #5',
  'Orange #6',
];

function createDefaultPlayerSlot(
  side: 'left' | 'right',
  idx: number
): HudTransientPlayerSlotPayload {
  const slotKey = side === 'left' ? idx + 1 : Math.min(6, 4 + idx);
  return {
    slotKey,
    carIndex: undefined,
    team: side,
    name: side === 'left' ? _emptyBlueNames[slotKey - 1] : _emptyOrangeNames[slotKey - 1],
    boostAmount: 0,
    exists: false,
    isSelf: false,
    isFocusedPov: false,
    isDemolished: false,
    demoRespawnRemainingSec: 0,
    demoRespawnTotalSec: 3.0,
    demolishedAtMs: 0,
    replaySkipReady: false,
  };
}

export function createHudTransientFrameBuffer(): HudTransientFramePayload {
  return {
    localTeam: 0,
    slotKeyToCarIndex: {},
    rosterPatch: {
      viewMode: 'player-live',
      focusedSlotKey: null,
      leftPlayers: [0, 1, 2, 3, 4].map((i) => createDefaultPlayerSlot('left', i)),
      rightPlayers: [0, 1, 2, 3, 4].map((i) => createDefaultPlayerSlot('right', i)),
    },
    miniMap: {
      ballX: 50,
      ballY: 50,
      ballNormX: 0.5,
      ballNormY: 0.5,
      ballHitKph: 0,
      isFlipped: false,
    },
    nameTagProjections: [],
    rosterDirty: true,
    miniMapDirty: true,
  };
}

const _defaultFrameBuffer = createHudTransientFrameBuffer();

export function computeMiniMapCoordinates(
  ballPosX = 0,
  ballPosY = 0,
  ballVelX = 0,
  ballVelY = 0,
  ballVelZ = 0,
  localTeam: 0 | 1 = 0,
  target?: HudTransientMiniMapPayload
): { miniMap: HudTransientMiniMapPayload; dirty: boolean } {
  const clampedX = Math.max(-PITCH_HALF_WIDTH_UU, Math.min(PITCH_HALF_WIDTH_UU, ballPosX));
  const clampedY = Math.max(-PITCH_HALF_LENGTH_UU, Math.min(PITCH_HALF_LENGTH_UU, ballPosY));
  const ballX = 50 + (clampedX / PITCH_HALF_WIDTH_UU) * PITCH_MINIMAP_SPAN_X_PCT;
  const ballY = 50 - (clampedY / PITCH_HALF_LENGTH_UU) * PITCH_MINIMAP_SPAN_Y_PCT;
  const ballSpeedUu = Math.hypot(ballVelX, ballVelY, ballVelZ);
  const ballHitKph = Math.round(ballSpeedUu * UU_PER_SECOND_TO_KPH);
  const ballNormX = ballX / 100;
  const ballNormY = ballY / 100;
  const isFlipped = localTeam === 1;

  if (!target) {
    return {
      miniMap: { ballX, ballY, ballNormX, ballNormY, ballHitKph, isFlipped },
      dirty: true,
    };
  }

  const dirty =
    Math.abs(target.ballX - ballX) >= 0.02 ||
    Math.abs(target.ballY - ballY) >= 0.02 ||
    target.ballHitKph !== ballHitKph ||
    target.isFlipped !== isFlipped;

  if (dirty) {
    target.ballX = ballX;
    target.ballY = ballY;
    target.ballNormX = ballNormX;
    target.ballNormY = ballNormY;
    target.ballHitKph = ballHitKph;
    target.isFlipped = isFlipped;
  }

  return { miniMap: target, dirty };
}

export function projectNameTagScreenPositions(
  carPositions:
    ReadonlyArray<{ carIndex: number; posX: number; posY: number; posZ: number }> | undefined,
  perspectiveCamera: THREE.Camera | null | undefined,
  viewportWidthPx = 1920,
  viewportHeightPx = 1080,
  targetProjections?: HudTransientNameTagProjection2D[]
): HudTransientNameTagProjection2D[] {
  const out = targetProjections ?? [];
  if (!carPositions || carPositions.length === 0 || !perspectiveCamera) {
    out.length = 0;
    return out;
  }
  out.length = carPositions.length;
  for (let i = 0; i < carPositions.length; i++) {
    const car = carPositions[i];
    _scratchProjVec.set(car.posX, car.posZ, car.posY).project(perspectiveCamera);
    const visible = _scratchProjVec.z >= -1 && _scratchProjVec.z <= 1;
    const screenX = (_scratchProjVec.x * 0.5 + 0.5) * viewportWidthPx;
    const screenY = (-_scratchProjVec.y * 0.5 + 0.5) * viewportHeightPx;
    const slot = out[i];
    if (slot) {
      slot.carIndex = car.carIndex;
      slot.screenX = screenX;
      slot.screenY = screenY;
      slot.ndcZ = _scratchProjVec.z;
      slot.visible = visible;
    } else {
      out[i] = { carIndex: car.carIndex, screenX, screenY, ndcZ: _scratchProjVec.z, visible };
    }
  }
  return out;
}

function updateSlotInPlace(
  slot: HudTransientPlayerSlotPayload,
  side: 'left' | 'right',
  slotKeyRaw: number,
  emptyNames: readonly string[],
  entry: RosterTeamEntry | undefined,
  physicsState: HudTransientPhysicsStateInput,
  isGoalReplayView: boolean,
  replayCameraMode: string | undefined,
  viewMode: 'player-live' | 'goal-replay' | 'spectator',
  activeCameraCar: number,
  localSkipReplayReady: boolean | undefined,
  acknowledgedJumpByCar: ReadonlyMap<number, boolean> | undefined
): boolean {
  const slotKey = Math.min(6, Math.max(1, slotKeyRaw));
  let dirty = false;

  if (!entry) {
    const emptyName = emptyNames[slotKey - 1] || `Slot #${slotKey}`;
    if (
      slot.exists !== false ||
      slot.slotKey !== slotKey ||
      slot.carIndex !== undefined ||
      slot.team !== side ||
      slot.name !== emptyName ||
      slot.boostAmount !== 0 ||
      slot.isSelf !== false ||
      slot.isFocusedPov !== false ||
      slot.isDemolished !== false ||
      slot.demoRespawnRemainingSec !== 0 ||
      slot.demolishedAtMs !== 0 ||
      slot.replaySkipReady !== false
    ) {
      slot.slotKey = slotKey;
      slot.carIndex = undefined;
      slot.team = side;
      slot.name = emptyName;
      slot.boostAmount = 0;
      slot.exists = false;
      slot.isSelf = false;
      slot.isFocusedPov = false;
      slot.isDemolished = false;
      slot.demoRespawnRemainingSec = 0;
      slot.demoRespawnTotalSec = 3.0;
      slot.demolishedAtMs = 0;
      slot.replaySkipReady = false;
      dirty = true;
    }
    return dirty;
  }

  const tel = physicsState.resolveCarTelemetry(entry.carIndex);
  const isFocused =
    isGoalReplayView && replayCameraMode === 'director'
      ? false
      : viewMode === 'player-live'
        ? Boolean(entry.isSelf || entry.carIndex === activeCameraCar)
        : entry.carIndex === activeCameraCar;

  const replaySkipReady = isGoalReplayView
    ? Boolean(
        entry.isBot ||
        (entry.isSelf && localSkipReplayReady) ||
        acknowledgedJumpByCar?.get(entry.carIndex)
      )
    : false;

  if (
    slot.exists !== true ||
    slot.slotKey !== slotKey ||
    slot.carIndex !== entry.carIndex ||
    slot.team !== side ||
    slot.name !== entry.name ||
    slot.boostAmount !== tel.boostAmount ||
    slot.isSelf !== entry.isSelf ||
    slot.isFocusedPov !== isFocused ||
    slot.isDemolished !== tel.isDemolished ||
    slot.demoRespawnRemainingSec !== tel.demoRespawnRemainingSec ||
    slot.demolishedAtMs !== tel.demolishedAtMs ||
    slot.replaySkipReady !== replaySkipReady
  ) {
    slot.slotKey = slotKey;
    slot.carIndex = entry.carIndex;
    slot.team = side;
    slot.name = entry.name;
    slot.boostAmount = tel.boostAmount;
    slot.exists = true;
    slot.isSelf = entry.isSelf;
    slot.isFocusedPov = isFocused;
    slot.isDemolished = tel.isDemolished;
    slot.demoRespawnRemainingSec = tel.demoRespawnRemainingSec;
    slot.demoRespawnTotalSec = 3.0;
    slot.demolishedAtMs = tel.demolishedAtMs;
    slot.replaySkipReady = replaySkipReady;
    dirty = true;
  }
  return dirty;
}

export function buildHudTransientFramePayload(
  physicsState: HudTransientPhysicsStateInput,
  camera: HudTransientCameraInput,
  roster: HudTransientRosterInput,
  targetBuffer: HudTransientFramePayload = _defaultFrameBuffer
): HudTransientFramePayload {
  const { blueEntries, orangeEntries, detectedLocalTeam, isSpectatingNoHuman } = roster;
  let localInOrange = false;
  for (let i = 0; i < orangeEntries.length; i++) {
    if (orangeEntries[i].isSelf) {
      localInOrange = true;
      break;
    }
  }
  let localInBlue = false;
  for (let i = 0; i < blueEntries.length; i++) {
    if (blueEntries[i].isSelf) {
      localInBlue = true;
      break;
    }
  }
  const localTeam: 0 | 1 =
    detectedLocalTeam === 1 || localInOrange ? 1 : detectedLocalTeam === 0 || localInBlue ? 0 : 0;

  const leftEntries = localTeam === 1 ? orangeEntries : blueEntries;
  const rightEntries = localTeam === 1 ? blueEntries : orangeEntries;
  const leftEmptyNames = localTeam === 1 ? _emptyOrangeNames : _emptyBlueNames;
  const rightEmptyNames = localTeam === 1 ? _emptyBlueNames : _emptyOrangeNames;

  const L = Math.min(5, leftEntries.length);
  const R = Math.min(5, rightEntries.length);
  const rightStartKey = computeRightTeamStartSlotKey(L, R);
  const slotKeyToCarIndex = targetBuffer.slotKeyToCarIndex;
  for (let k = 1; k <= 6; k++) {
    delete slotKeyToCarIndex[k];
  }
  for (let i = 0; i < L; i++) {
    const slotKey = Math.min(6, i + 1);
    const entry = leftEntries[i];
    if (entry && typeof entry.carIndex === 'number') {
      slotKeyToCarIndex[slotKey] = entry.carIndex;
    }
  }
  for (let j = 0; j < R; j++) {
    const slotKey = Math.min(6, rightStartKey + j);
    const entry = rightEntries[j];
    if (entry && typeof entry.carIndex === 'number') {
      slotKeyToCarIndex[slotKey] = entry.carIndex;
    }
  }

  const sig = roster.choreographySignal || 'kickoff-will-start';
  const isGoalReplayView =
    sig === 'goal-replay-started' ||
    sig === 'goal-replay-will-end' ||
    roster.matchPhase === 'replay';

  const viewMode: 'player-live' | 'goal-replay' | 'spectator' = isGoalReplayView
    ? 'goal-replay'
    : isSpectatingNoHuman
      ? 'spectator'
      : 'player-live';

  const activeCameraCar = camera.activeCameraCar;
  let focusedSlotKey: number | null = null;
  let rosterDirty = false;

  const leftPlayers = targetBuffer.rosterPatch.leftPlayers;
  const rightPlayers = targetBuffer.rosterPatch.rightPlayers;

  for (let idx = 0; idx < 5; idx++) {
    const slotKeyRaw = idx < L ? Math.min(6, idx + 1) : idx + 1;
    const slot = leftPlayers[idx];
    if (
      updateSlotInPlace(
        slot,
        'left',
        slotKeyRaw,
        leftEmptyNames,
        leftEntries[idx],
        physicsState,
        isGoalReplayView,
        camera.replayCameraMode,
        viewMode,
        activeCameraCar,
        roster.localSkipReplayReady,
        roster.acknowledgedJumpByCar
      )
    ) {
      rosterDirty = true;
    }
    if (slot.exists && slot.isFocusedPov) {
      focusedSlotKey = slot.slotKey;
    }
  }

  for (let idx = 0; idx < 5; idx++) {
    const slotKeyRaw = idx < R ? Math.min(6, rightStartKey + idx) : rightStartKey + idx;
    const slot = rightPlayers[idx];
    if (
      updateSlotInPlace(
        slot,
        'right',
        slotKeyRaw,
        rightEmptyNames,
        rightEntries[idx],
        physicsState,
        isGoalReplayView,
        camera.replayCameraMode,
        viewMode,
        activeCameraCar,
        roster.localSkipReplayReady,
        roster.acknowledgedJumpByCar
      )
    ) {
      rosterDirty = true;
    }
    if (slot.exists && slot.isFocusedPov) {
      focusedSlotKey = slot.slotKey;
    }
  }

  if (
    targetBuffer.rosterPatch.viewMode !== viewMode ||
    targetBuffer.rosterPatch.focusedSlotKey !== focusedSlotKey ||
    targetBuffer.localTeam !== localTeam
  ) {
    targetBuffer.rosterPatch.viewMode = viewMode;
    targetBuffer.rosterPatch.focusedSlotKey = focusedSlotKey;
    targetBuffer.localTeam = localTeam;
    rosterDirty = true;
  }

  const { dirty: miniMapDirty } = computeMiniMapCoordinates(
    physicsState.ballPosX ?? 0,
    physicsState.ballPosY ?? 0,
    physicsState.ballVelX ?? 0,
    physicsState.ballVelY ?? 0,
    physicsState.ballVelZ ?? 0,
    localTeam,
    targetBuffer.miniMap
  );

  projectNameTagScreenPositions(
    physicsState.carPositions,
    camera.perspectiveCamera,
    camera.viewportWidthPx,
    camera.viewportHeightPx,
    targetBuffer.nameTagProjections
  );

  targetBuffer.rosterDirty = rosterDirty;
  targetBuffer.miniMapDirty = miniMapDirty;
  return targetBuffer;
}
