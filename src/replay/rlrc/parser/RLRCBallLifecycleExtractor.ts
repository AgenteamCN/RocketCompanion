/**
 * RLRCBallLifecycleExtractor.ts
 * Stateful extractor for Rocket League 30Hz network stream ball actor lifecycle:
 * - Tracks ball actor spawns (Archetypes.Ball.*), deletions, and Engine.Actor:bHidden toggles
 * - Handles TAGame.Ball_TA:ReplicatedExplosionData / ReplicatedExplosionDataExtended goal explosions
 * - Prevents underground despawn coordinates or stale downward velocity tangents when inactive
 * - Backfills initial stationary rigid body state on the frame immediately following spawn
 */

import type {
  RLRCBallFrameState120Hz,
  RLRCQuat,
  RLRCRigidBodySample,
  RLRCSourceNetworkFrame,
  RLRCVec3,
} from '../RLRCReplayTypes.ts';

export const RLRC_BALL_REST_Z = 93.15;
const BALL_MIN_VALID_Z = -50;
const BALL_SPAWN_BACKFILL_MAX_SPEED_UU_S = 10;

const ZERO_VEC3: RLRCVec3 = { x: 0, y: 0, z: 0 };
const IDENTITY_QUAT: RLRCQuat = { x: 0, y: 0, z: 0, w: 1 };

export const DEFAULT_BALL_LIFECYCLE_RB: RLRCRigidBodySample = {
  sleeping: true,
  position: { x: 0, y: 0, z: RLRC_BALL_REST_Z },
  rotation: IDENTITY_QUAT,
  linearVelocity: ZERO_VEC3,
  angularVelocity: ZERO_VEC3,
  rbUpdated: false,
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}

function finiteNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function extractVec3OrNull(raw: unknown): RLRCVec3 | null {
  const rec = asRecord(raw);
  if (!rec) return null;
  const x = rec.x ?? rec.X;
  const y = rec.y ?? rec.Y;
  const z = rec.z ?? rec.Z;
  if (typeof x !== 'number' || typeof y !== 'number' || typeof z !== 'number') {
    return null;
  }
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
    return null;
  }
  return { x, y, z };
}

export function decodeActorHiddenFlag(rawAttribute: unknown): boolean {
  if (typeof rawAttribute === 'boolean') return rawAttribute;
  const rec = asRecord(rawAttribute);
  if (!rec) return false;
  if (typeof rec.Boolean === 'boolean') return rec.Boolean;
  if (typeof rec.bHidden === 'boolean') return rec.bHidden;
  return false;
}

export function extractExplosionLocation(rawAttribute: unknown): RLRCVec3 | null {
  const rec = asRecord(rawAttribute);
  if (!rec) return null;
  const explosionPayload = asRecord(rec.Explosion) ?? asRecord(rec.ExtendedExplosion) ?? rec;
  return extractVec3OrNull(explosionPayload.location ?? explosionPayload.position);
}

export function createSpawnBallRigidBody(initialLocation?: RLRCVec3): RLRCRigidBodySample {
  const isNearKickoffCenter =
    !initialLocation ||
    (Math.abs(initialLocation.x) < 2 &&
      Math.abs(initialLocation.y) < 2 &&
      Math.abs(initialLocation.z - 93) < 2.5);

  const position: RLRCVec3 = isNearKickoffCenter
    ? DEFAULT_BALL_LIFECYCLE_RB.position
    : {
        x: initialLocation.x,
        y: initialLocation.y,
        z: initialLocation.z > 0 ? initialLocation.z : RLRC_BALL_REST_Z,
      };

  return {
    ...DEFAULT_BALL_LIFECYCLE_RB,
    position,
    rbUpdated: true,
  };
}

export interface RLRCBallFrameSnapshot30Hz {
  readonly ball: RLRCBallFrameState120Hz;
  readonly ballRbUpdated: boolean;
  readonly activeBallActorId: number;
}

export class RLRCBallLifecycleExtractor {
  private activeBallActorId = -1;
  private ballActive = true;
  private needsInitialRigidBody = false;
  private spawnFrameIndex30Hz = -1;
  private rigidBodyUpdatedThisFrame = false;
  private currentRigidBody: RLRCRigidBodySample = DEFAULT_BALL_LIFECYCLE_RB;

  private readonly explodedBallActorIds = new Set<number>();
  private readonly hiddenActorFlags = new Map<number, boolean>();
  private readonly initialLocationsByActorId = new Map<number, RLRCVec3>();
  private readonly goalExplosionFrames30Hz: number[] = [];

  public beginFrame(): void {
    this.rigidBodyUpdatedThisFrame = false;
  }

  public isActorHidden(actorId: number): boolean {
    return Boolean(this.hiddenActorFlags.get(actorId));
  }

  public getInitialLocation(actorId: number): RLRCVec3 | undefined {
    return this.initialLocationsByActorId.get(actorId);
  }

  public getGoalExplosionFrames(): number[] {
    return this.goalExplosionFrames30Hz;
  }

  public sleepBall(anchorPosition?: RLRCVec3 | null): void {
    this.ballActive = false;
    this.needsInitialRigidBody = false;

    const candidatePos =
      anchorPosition && anchorPosition.z >= BALL_MIN_VALID_Z
        ? anchorPosition
        : this.currentRigidBody.position;

    const safePosition: RLRCVec3 = {
      x: finiteNumber(candidatePos.x, 0),
      y: finiteNumber(candidatePos.y, 0),
      z: candidatePos.z >= RLRC_BALL_REST_Z ? candidatePos.z : RLRC_BALL_REST_Z,
    };

    this.currentRigidBody = {
      ...this.currentRigidBody,
      position: safePosition,
      sleeping: true,
      linearVelocity: ZERO_VEC3,
      angularVelocity: ZERO_VEC3,
      rbUpdated: false,
    };
  }

  public onActorDeleted(actorId: number): void {
    this.hiddenActorFlags.delete(actorId);
    this.initialLocationsByActorId.delete(actorId);
    this.explodedBallActorIds.delete(actorId);
    if (actorId === this.activeBallActorId) {
      this.activeBallActorId = -1;
      this.sleepBall();
    }
  }

  public onActorSpawned(
    actorId: number,
    objectTypeName: string,
    initialLocation: RLRCVec3 | null | undefined,
    frameIndex30Hz: number,
    isKeyframe: boolean,
    frameNewActors: readonly { readonly actor_id: number }[] | undefined
  ): void {
    if (!isKeyframe) {
      this.hiddenActorFlags.delete(actorId);
      this.explodedBallActorIds.delete(actorId);
    }
    if (initialLocation) {
      this.initialLocationsByActorId.set(actorId, initialLocation);
    }
    if (
      objectTypeName.includes('Archetypes.Ball.') &&
      !this.explodedBallActorIds.has(actorId) &&
      !this.hiddenActorFlags.get(actorId)
    ) {
      const activeBallSpawnedInSameFrame = Boolean(
        frameNewActors?.some((entry) => entry.actor_id === this.activeBallActorId)
      );
      if (
        !isKeyframe ||
        this.activeBallActorId < 0 ||
        !this.ballActive ||
        (actorId !== this.activeBallActorId && !activeBallSpawnedInSameFrame)
      ) {
        this.activeBallActorId = actorId;
        this.ballActive = true;
        this.needsInitialRigidBody = true;
        this.rigidBodyUpdatedThisFrame = true;
        this.spawnFrameIndex30Hz = frameIndex30Hz;
        this.currentRigidBody = createSpawnBallRigidBody(
          this.initialLocationsByActorId.get(actorId)
        );
      }
    }
  }

  public onActorHiddenChanged(
    actorId: number,
    objectTypeName: string,
    rawAttribute: unknown
  ): boolean {
    const isHidden = decodeActorHiddenFlag(rawAttribute);
    this.hiddenActorFlags.set(actorId, isHidden);

    if (
      objectTypeName.includes('Ball') &&
      (actorId === this.activeBallActorId || (!isHidden && this.activeBallActorId < 0))
    ) {
      this.activeBallActorId = actorId;
      if (isHidden) {
        this.sleepBall();
      } else if (!this.explodedBallActorIds.has(actorId)) {
        this.ballActive = true;
        if (this.currentRigidBody.position.z < RLRC_BALL_REST_Z) {
          this.currentRigidBody = createSpawnBallRigidBody(
            this.initialLocationsByActorId.get(actorId)
          );
        }
      }
    }

    return isHidden;
  }

  public onBallRigidBodySample(
    actorId: number,
    sample: RLRCRigidBodySample,
    frameIndex30Hz: number,
    previousFrames: RLRCSourceNetworkFrame[]
  ): void {
    if (this.hiddenActorFlags.get(actorId) || this.explodedBallActorIds.has(actorId)) {
      return;
    }
    if (this.activeBallActorId >= 0 && actorId !== this.activeBallActorId && this.ballActive) {
      return;
    }
    if (sample.position.z < BALL_MIN_VALID_Z) {
      if (actorId === this.activeBallActorId) {
        this.sleepBall();
      }
      return;
    }

    const updatedSample: RLRCRigidBodySample = {
      ...sample,
      rbUpdated: true,
    };

    const prevFrame = frameIndex30Hz > 0 ? previousFrames[frameIndex30Hz - 1] : undefined;
    if (
      this.needsInitialRigidBody &&
      this.activeBallActorId === actorId &&
      frameIndex30Hz === this.spawnFrameIndex30Hz + 1 &&
      prevFrame?.ball.entityActive
    ) {
      const linearSpeed = Math.hypot(
        sample.linearVelocity.x,
        sample.linearVelocity.y,
        sample.linearVelocity.z
      );
      if (linearSpeed < BALL_SPAWN_BACKFILL_MAX_SPEED_UU_S) {
        (prevFrame as { ball: RLRCBallFrameState120Hz }).ball = {
          entityActive: true,
          rigidBody: updatedSample,
          rbUpdated: true,
          activeBallActorId: actorId,
          actorId,
        };
      }
    }

    this.activeBallActorId = actorId;
    this.ballActive = true;
    this.rigidBodyUpdatedThisFrame = true;
    this.needsInitialRigidBody = false;
    this.currentRigidBody = updatedSample;
  }

  public onBallExplosion(
    actorId: number,
    rawAttribute: unknown,
    frameIndex30Hz: number,
    isKeyframe: boolean
  ): void {
    this.explodedBallActorIds.add(actorId);
    const explosionLocation = extractExplosionLocation(rawAttribute);
    if (actorId === this.activeBallActorId || this.activeBallActorId < 0) {
      this.sleepBall(explosionLocation);
    }
    if (!isKeyframe) {
      this.goalExplosionFrames30Hz.push(frameIndex30Hz);
    }
  }

  public buildFrameBallState(): RLRCBallFrameSnapshot30Hz {
    const ballRbUpdated = this.ballActive && this.rigidBodyUpdatedThisFrame;
    const activeBallActorId = this.ballActive ? this.activeBallActorId : -1;
    const rigidBody: RLRCRigidBodySample = {
      ...this.currentRigidBody,
      rbUpdated: ballRbUpdated,
    };
    return {
      ball: {
        entityActive: this.ballActive,
        rigidBody,
        rbUpdated: ballRbUpdated,
        activeBallActorId,
        actorId: activeBallActorId,
      },
      ballRbUpdated,
      activeBallActorId,
    };
  }
}
