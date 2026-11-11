/**
 * RLRCReplayTypes.ts
 * Pure interface and binary constant contracts for the RLRC Replay (.replay -> 120Hz RLRC)
 * conversion, interpolation, container serialization, playback synchronization, and
 * continuous static-training-style intervention pipeline.
 */

export const RLRC_CONTAINER_MAGIC = 'RLRCREP1';
export const RLRC_CONTAINER_VERSION = 1;
export const RLRC_TICK_RATE = 120;
export const RLRC_FIXED_DT = 1 / RLRC_TICK_RATE;
export const RLRC_MAX_PLAYER_SLOTS = 6;
export const RLRC_BOOST_PAD_COUNT = 34;
export const RLRC_PREROLL_HISTORY_SECONDS = 4.0;
export const RLRC_PREROLL_HISTORY_FRAMES = 480;
export const RLRC_STATE_FLOATS_PER_FRAME = 448;
export const RLRC_STATE_BYTES_PER_FRAME = 1792;
export const RLRC_CONTROLS_BYTES_PER_FRAME = 64;
export const RLRC_TRACK0_FRAME_STRIDE_BYTES = 1856;
export const RLRC_BOOKMARK_RECORD_STRIDE_BYTES = 64;

export type RLRCHitboxId =
  | 'hitbox-octane'
  | 'hitbox-dominus'
  | 'hitbox-plank'
  | 'hitbox-breakout'
  | 'hitbox-hybrid'
  | 'hitbox-merc'
  | 'hitbox-psyclops';

export type RLRCVisualId =
  | 'fennec'
  | 'ryza'
  | 'insidio'
  | 'dominus'
  | 'breakout-mini'
  | 'sentinel'
  | 'merc'
  | 'trioctane'
  | 'trioctane-threewheel';

export type RLRCTeamIndex = 0 | 1;

export type RLRCBookmarkKind =
  'user-mark' | 'goal' | 'save' | 'kickoff' | 'demolish' | 'ue-keyframe';

export type RLRCNonPovInterventionMode = 'disappear' | 'no-input' | 'follow-state' | 'bot-takeover';

export type RLRCInterpolationMethod = 'hermite-clamped' | 'linear';

export type RLRCSessionPhase = 'idle' | 'viewing' | 'preroll-countdown' | 'intervening';

export interface RLRCVec3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface RLRCQuat {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly w: number;
}

export interface RLRCPlayerCameraSettings {
  readonly fov: number;
  readonly height: number;
  readonly pitch: number;
  readonly distance: number;
  readonly stiffness: number;
  readonly swivelSpeed: number;
  readonly transitionSpeed: number;
}

export interface RLRCVehicleLoadoutResolution {
  readonly bodyProductId: number;
  readonly hitboxId: RLRCHitboxId;
  readonly visualId: RLRCVisualId;
  readonly resolvedBy: 'catalog' | 'kinematics-fallback' | 'default';
}

export interface RLRCPlayerSlotMeta {
  readonly slotIndex: number;
  readonly userName: string;
  readonly team: RLRCTeamIndex;
  readonly priActorId: number;
  readonly bodyProductId: number;
  readonly hitboxId: RLRCHitboxId;
  readonly visualId: RLRCVisualId;
  readonly primaryColorHex?: string;
  readonly accentColorHex?: string;
  readonly cameraSettings?: RLRCPlayerCameraSettings;
}

export interface RLRCBookmarkRecord {
  readonly kind: RLRCBookmarkKind;
  readonly frameIndex120Hz: number;
  readonly sourceFrame30Hz: number;
  readonly timeSeconds: number;
  readonly label: string;
  readonly slotIndex: number;
  readonly team: RLRCTeamIndex | -1;
}

export interface RLRCRigidBodySample {
  readonly sleeping: boolean;
  readonly position: RLRCVec3;
  readonly rotation: RLRCQuat;
  readonly linearVelocity: RLRCVec3;
  readonly angularVelocity: RLRCVec3;
  readonly rbUpdated?: boolean;
}

export interface RLRCSynthesizedCarControls {
  readonly throttle: number;
  readonly steer: number;
  readonly pitch: number;
  readonly yaw: number;
  readonly roll: number;
  readonly jump: boolean;
  readonly boost: boolean;
  readonly handbrake: boolean;
}

export interface RLRCCarComponentActiveFlags {
  readonly boostActive: boolean;
  readonly jumpActive: boolean;
  readonly doubleJumpActive: boolean;
  readonly dodgeActive: boolean;
}

export interface RLRCCarFrameState120Hz {
  readonly slotIndex: number;
  readonly entityActive: boolean;
  readonly isDemolished?: boolean;
  readonly rigidBody: RLRCRigidBodySample;
  readonly rbUpdated?: boolean;
  readonly actorId?: number;
  readonly boostAmount: number;
  readonly isOnGround: boolean;
  readonly isSupersonic: boolean;
  readonly hasFlipOrJump: boolean;
  readonly airTimeSinceJump: number;
  readonly activeFlags: RLRCCarComponentActiveFlags;
  readonly controls: RLRCSynthesizedCarControls;
}

export interface RLRCBallFrameState120Hz {
  readonly entityActive: boolean;
  readonly rigidBody: RLRCRigidBodySample;
  readonly rbUpdated?: boolean;
  readonly activeBallActorId?: number;
  readonly actorId?: number;
}

export interface RLRCBoostPadPickupEvent {
  readonly sourceFrame30Hz: number;
  readonly timeSeconds: number;
  readonly pickupActorId: number;
  readonly padIndex: number;
  readonly isBigPad: boolean;
  readonly instigatorSlotIndex: number;
  readonly pickedUpState: 'picked-up' | 'respawned' | 'kickoff-reset';
}

export interface RLRCFrame120Hz {
  readonly frameIndex120Hz: number;
  readonly sourceFrame30Hz: number;
  readonly timeSeconds: number;
  readonly secondsRemaining: number;
  readonly isOvertime: boolean;
  readonly roundCountdownNumber: number;
  readonly blueScore: number;
  readonly orangeScore: number;
  readonly ball: RLRCBallFrameState120Hz;
  readonly cars: readonly RLRCCarFrameState120Hz[];
  readonly boostPadCooldowns: Float32Array;
}

export interface RLRCReplayHeaderMeta {
  readonly replayId: string;
  readonly replayName: string;
  readonly mapName: string;
  readonly matchType: string;
  readonly teamSize: number;
  readonly recordFps: number;
  readonly sourceFrameCount: number;
  readonly frameCount120Hz: number;
  readonly durationSeconds: number;
  readonly date: string;
  readonly blueScore: number;
  readonly orangeScore: number;
  readonly part1CrcValid: boolean;
  readonly part2CrcValid: boolean;
}

export interface RLRCSourceEntityLifeSegment {
  readonly slotIndex: number;
  readonly carActorId: number;
  readonly startFrame30Hz: number;
  readonly endFrame30Hz: number;
  readonly startTimeSeconds: number;
  readonly endTimeSeconds: number;
}

export interface RLRCSourceNetworkFrame {
  readonly sourceFrame30Hz: number;
  readonly timeSeconds: number;
  readonly deltaSeconds: number;
  readonly secondsRemaining: number;
  readonly isOvertime: boolean;
  readonly roundCountdownNumber: number;
  readonly blueScore: number;
  readonly orangeScore: number;
  readonly ball: RLRCBallFrameState120Hz;
  readonly cars: readonly RLRCCarFrameState120Hz[];
  readonly ballRbUpdated?: boolean;
  readonly carRbUpdatedMask?: number;
  readonly rbUpdatedMask?: number;
  readonly activeBallActorId?: number;
}

export interface RLRCParserOutput {
  readonly header: RLRCReplayHeaderMeta;
  readonly roster: readonly RLRCPlayerSlotMeta[];
  readonly bookmarks: readonly RLRCBookmarkRecord[];
  readonly boostPadEvents: readonly RLRCBoostPadPickupEvent[];
  readonly lifeSegments: readonly RLRCSourceEntityLifeSegment[];
  readonly networkFrames: readonly RLRCSourceNetworkFrame[];
}

export interface RLRCResamplerOutput {
  readonly header: RLRCReplayHeaderMeta;
  readonly roster: readonly RLRCPlayerSlotMeta[];
  readonly bookmarks: readonly RLRCBookmarkRecord[];
  readonly frames120Hz: readonly RLRCFrame120Hz[];
  readonly stateInputTrackBytes: Uint8Array;
}

export interface RLRCContainerPacket {
  readonly header: RLRCReplayHeaderMeta;
  readonly roster: readonly RLRCPlayerSlotMeta[];
  readonly bookmarks: readonly RLRCBookmarkRecord[];
  readonly stateInputTrackBytes: Uint8Array;
  readonly bookmarkTrackBytes: Uint8Array;
}

export interface RLRCInterveneLaunchConfig {
  readonly targetFrame120Hz: number;
  readonly povSlotIndex: number;
  readonly playerHitboxId: RLRCHitboxId;
  readonly playerVisualId: RLRCVisualId;
  readonly playerColorHex?: string;
  readonly downCounterSeconds: 0 | 1 | 2 | 3;
  readonly nonPovMode: RLRCNonPovInterventionMode;
  readonly prerollHistoryFrames: number;
}

export interface RLRCBasis3x3 {
  readonly fwd: RLRCVec3;
  readonly right: RLRCVec3;
  readonly up: RLRCVec3;
}

export interface RLRCNetStreamRawFrame {
  readonly time: number;
  readonly delta: number;
  readonly new_actors?: readonly {
    readonly actor_id: number;
    readonly object_id: number;
    readonly initial_trajectory?: { readonly location?: unknown } | null;
  }[];
  readonly deleted_actors?: readonly number[];
  readonly updated_actors?: readonly {
    readonly actor_id: number;
    readonly object_id: number;
    readonly attribute?: Record<string, unknown> | null;
  }[];
}

export interface RLRCNetStreamExtractorInput {
  readonly frames: readonly RLRCNetStreamRawFrame[];
  readonly objects: readonly string[];
  readonly names?: readonly string[];
  readonly keyframeIndices?: ReadonlySet<number>;
  readonly roster?: readonly RLRCPlayerSlotMeta[];
  readonly slotByPriActorId?: ReadonlyMap<number, number>;
  readonly boostPadEvents?: readonly RLRCBoostPadPickupEvent[];
}

export interface RLRCBoostAnchorMapBySlot {
  readonly anchorsBySlot: ReadonlyArray<ReadonlyMap<number, number>>;
  readonly spawnFramesBySlot: ReadonlyArray<ReadonlySet<number>>;
  readonly grantChangedBySlot?: ReadonlyArray<ReadonlySet<number>>;
  readonly rawFrames?: readonly RLRCNetStreamRawFrame[];
  readonly objects?: readonly string[];
}

export interface RLRCNetStreamExtractorOutput {
  readonly networkFrames: readonly RLRCSourceNetworkFrame[];
  readonly demolishBookmarks: readonly RLRCBookmarkRecord[];
  readonly goalExplosionFrames: readonly number[];
  readonly restingSamplesBySlot: ReadonlyMap<number, readonly RLRCRigidBodySample[]>;
}
