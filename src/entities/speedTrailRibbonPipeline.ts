import * as THREE from 'three';

/**
 * speedTrailRibbonPipeline.ts
 * Pure shader definitions, geometry buffer initialization, emission state stepping,
 * and camera-facing ribbon vertex extrusion for SpeedTrail.
 */

export const SPEED_TRAIL_THRESHOLD_SPEED = 2000;
export const SPEED_TRAIL_OPACITY_LERP_RATE = 3;
export const SPEED_TRAIL_MAX_TIME_DILATION = 4;
export const SPEED_TRAIL_EMISSION_RATE = 45;
export const SPEED_TRAIL_MAX_POINT_AGE = 1.0;
export const SPEED_TRAIL_RIBBON_WIDTH = 64;
export const SPEED_TRAIL_MAX_OPACITY = 0.2;
export const SPEED_TRAIL_MAX_POINTS = 60;
export const SPEED_TRAIL_MAX_VERTICES = SPEED_TRAIL_MAX_POINTS + 1; // 61
export const SPEED_TRAIL_TELEPORT_RESET_DISTANCE = 512;
export const SPEED_TRAIL_VISIBLE_OPACITY_THRESHOLD = 0.015;

export interface SpeedTrailPoint {
  position: THREE.Vector3;
  age: number;
}

export interface SpeedTrailRibbonState {
  side: THREE.Vector3;
  opacity: number;
  across: Float32Array;
  cameraPosition: THREE.Vector3;
  lastCameraPosition: THREE.Vector3;
  emissionClock: number;
  fallbackAxis: THREE.Vector3;
  geometry: THREE.BufferGeometry;
  geometryDirty: boolean;
  hasSourcePosition: boolean;
  indices: Uint16Array;
  isEmitting: boolean;
  lastEmitting: boolean;
  lifeAlpha: Float32Array;
  lifeAlphaAttribute: THREE.BufferAttribute;
  material: THREE.ShaderMaterial;
  pointPool: SpeedTrailPoint[];
  points: SpeedTrailPoint[];
  positionAttribute: THREE.BufferAttribute;
  positions: Float32Array;
  previousSourcePosition: THREE.Vector3;
  previousSpeed: number;
  ribbon: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
  sourcePosition: THREE.Vector3;
  tangent: THREE.Vector3;
  timeDilation: number;
  viewDirection: THREE.Vector3;
}

export function clearSpeedTrailPoints(state: SpeedTrailRibbonState): void {
  while (state.points.length > 0) {
    const pt = state.points.pop();
    if (pt) state.pointPool.push(pt);
  }
  state.emissionClock = 0;
  state.isEmitting = false;
  state.lastEmitting = false;
}

function acquireTrailPoint(state: SpeedTrailRibbonState): SpeedTrailPoint {
  if (state.points.length >= SPEED_TRAIL_MAX_POINTS) {
    return state.points.pop()!;
  }
  return state.pointPool.pop() || { position: new THREE.Vector3(), age: 0 };
}

function syncMaterialOpacity(material: THREE.ShaderMaterial, opacity: number): void {
  const uOpacity = material.uniforms.uOpacity;
  if (uOpacity) {
    uOpacity.value = opacity * SPEED_TRAIL_MAX_OPACITY;
  }
}

export function stepSpeedTrailEmission(
  state: SpeedTrailRibbonState,
  sourcePos: THREE.Vector3,
  velocity: THREE.Vector3,
  dt: number
): void {
  const clampedDt = Math.max(0, Math.min(dt, 0.1));
  const speed = velocity.length();
  const isSupersonic = speed >= SPEED_TRAIL_THRESHOLD_SPEED;

  if (!state.hasSourcePosition) {
    state.sourcePosition.copy(sourcePos);
    state.previousSourcePosition.copy(sourcePos);
    state.previousSpeed = speed;
    state.hasSourcePosition = true;
  }

  const stepDist = sourcePos.distanceTo(state.previousSourcePosition);

  // Freeze trail state in place when replay or simulation is paused mid-flight.
  if (stepDist < 1e-2 && speed > 5 && clampedDt > 0) {
    if (isSupersonic && state.points.length > 0 && state.opacity < 1) {
      state.opacity = 1;
      syncMaterialOpacity(state.material, state.opacity);
    }
    state.ribbon.visible =
      state.opacity >= SPEED_TRAIL_VISIBLE_OPACITY_THRESHOLD && state.points.length > 0;
    state.geometryDirty = true;
    return;
  }

  const maxStepSpeed = Math.max(speed, state.previousSpeed, SPEED_TRAIL_THRESHOLD_SPEED);
  const maxPlausibleStepDist = Math.max(
    320,
    maxStepSpeed * Math.max(clampedDt, 1 / 30) * 2.5 + 120
  );
  if (
    stepDist > SPEED_TRAIL_TELEPORT_RESET_DISTANCE ||
    (state.points.length > 0 && stepDist > maxPlausibleStepDist)
  ) {
    clearSpeedTrailPoints(state);
    state.opacity = isSupersonic ? state.opacity : 0;
    state.previousSourcePosition.copy(sourcePos);
  }

  state.timeDilation = THREE.MathUtils.clamp(
    speed / SPEED_TRAIL_THRESHOLD_SPEED,
    1,
    SPEED_TRAIL_MAX_TIME_DILATION
  );
  const targetOpacity = isSupersonic ? 1 : 0;
  const opacityLerpRate = isSupersonic || speed >= 1700 ? SPEED_TRAIL_OPACITY_LERP_RATE : 7.5;

  state.opacity += (targetOpacity - state.opacity) * Math.min(1, clampedDt * opacityLerpRate);
  if (!isSupersonic && state.opacity < SPEED_TRAIL_VISIBLE_OPACITY_THRESHOLD) {
    state.opacity = 0;
  } else if (Math.abs(state.opacity - targetOpacity) < 5e-4) {
    state.opacity = targetOpacity;
  }
  syncMaterialOpacity(state.material, state.opacity);

  const scaledDeltaTime = clampedDt * state.timeDilation;
  for (let i = 0; i < state.points.length; i++) {
    state.points[i].age += scaledDeltaTime;
  }
  while (
    state.points.length > 0 &&
    state.points[state.points.length - 1].age >= SPEED_TRAIL_MAX_POINT_AGE
  ) {
    state.pointPool.push(state.points.pop()!);
  }

  const shouldEmit =
    isSupersonic || (state.lastEmitting && state.opacity >= SPEED_TRAIL_VISIBLE_OPACITY_THRESHOLD);
  state.isEmitting = shouldEmit;

  if (shouldEmit) {
    const interval = 1 / SPEED_TRAIL_EMISSION_RATE;
    if (!state.lastEmitting) {
      const anchor = acquireTrailPoint(state);
      anchor.position.copy(state.previousSourcePosition);
      anchor.age = scaledDeltaTime;
      state.points.unshift(anchor);
      state.emissionClock = 0;
    }

    if (stepDist >= 0.5) {
      state.emissionClock += scaledDeltaTime;
      while (state.emissionClock >= interval) {
        state.emissionClock -= interval;
        const subTime = state.emissionClock / state.timeDilation;
        const factor = clampedDt > 0 ? THREE.MathUtils.clamp(1 - subTime / clampedDt, 0, 1) : 1;
        if (state.points.length > 0) {
          const headPos = state.points[0].position;
          const dx =
            THREE.MathUtils.lerp(state.previousSourcePosition.x, sourcePos.x, factor) - headPos.x;
          const dy =
            THREE.MathUtils.lerp(state.previousSourcePosition.y, sourcePos.y, factor) - headPos.y;
          const dz =
            THREE.MathUtils.lerp(state.previousSourcePosition.z, sourcePos.z, factor) - headPos.z;
          if (dx * dx + dy * dy + dz * dz < 4.0) continue;
        }
        const pt = acquireTrailPoint(state);
        pt.position.lerpVectors(state.previousSourcePosition, sourcePos, factor);
        pt.age = state.emissionClock;
        state.points.unshift(pt);
      }
    }
    state.lastEmitting = true;
  } else if (state.lastEmitting || state.points.length > 0) {
    clearSpeedTrailPoints(state);
  }

  state.sourcePosition.copy(sourcePos);
  state.previousSourcePosition.copy(sourcePos);
  state.previousSpeed = speed;

  state.ribbon.visible =
    state.opacity >= SPEED_TRAIL_VISIBLE_OPACITY_THRESHOLD && state.points.length > 0;
  state.geometryDirty = true;
}

export function rebuildSpeedTrailRibbonGeometry(
  state: SpeedTrailRibbonState,
  camera: THREE.Camera | null | undefined
): void {
  if (!state.ribbon.visible) return;
  if (camera) {
    camera.getWorldPosition(state.cameraPosition);
    if (state.cameraPosition.distanceToSquared(state.lastCameraPosition) > 1e-2) {
      state.lastCameraPosition.copy(state.cameraPosition);
      state.geometryDirty = true;
    }
  }
  if (!state.geometryDirty) return;
  state.geometryDirty = false;

  if (state.points.length === 0) {
    state.geometry.setDrawRange(0, 0);
    return;
  }

  const firstPointSkip =
    state.points.length >= 2 &&
    state.sourcePosition.distanceToSquared(state.points[0].position) < 4.0
      ? 1
      : 0;
  const activePointCount = state.points.length - firstPointSkip;
  if (
    activePointCount <= 0 ||
    (activePointCount === 1 &&
      state.sourcePosition.distanceToSquared(state.points[firstPointSkip].position) < 1.0)
  ) {
    state.geometry.setDrawRange(0, 0);
    return;
  }

  const totalVertices = Math.min(SPEED_TRAIL_MAX_VERTICES, activePointCount + 1);
  const halfWidth = SPEED_TRAIL_RIBBON_WIDTH * 0.5;
  const positions = state.positions;
  const lifeAlpha = state.lifeAlpha;

  for (let i = 0; i < totalVertices; i++) {
    const pos = i === 0 ? state.sourcePosition : state.points[firstPointSkip + i - 1].position;
    const prevIdx = Math.max(0, i - 1);
    const nextIdx = Math.min(totalVertices - 1, i + 1);
    const prevPos =
      prevIdx === 0 ? state.sourcePosition : state.points[firstPointSkip + prevIdx - 1].position;
    const nextPos =
      nextIdx === 0 ? state.sourcePosition : state.points[firstPointSkip + nextIdx - 1].position;

    state.tangent.subVectors(nextPos, prevPos);
    if (state.tangent.lengthSq() < 1e-4) {
      state.tangent.subVectors(pos, prevPos);
      if (state.tangent.lengthSq() < 1e-4) {
        state.tangent.set(1, 0, 0);
      }
    }
    state.tangent.normalize();

    state.viewDirection.subVectors(state.cameraPosition, pos).normalize();
    state.side.crossVectors(state.tangent, state.viewDirection);
    if (state.side.lengthSq() < 1e-6) {
      state.side.crossVectors(state.tangent, state.fallbackAxis);
      if (state.side.lengthSq() < 1e-6) {
        state.side.set(1, 0, 0);
      }
    }
    state.side.normalize().multiplyScalar(halfWidth);

    const age = i === 0 ? 0 : state.points[firstPointSkip + i - 1].age;
    const lifeFade = Math.pow(
      1 - THREE.MathUtils.clamp(age / SPEED_TRAIL_MAX_POINT_AGE, 0, 1),
      1.35
    );

    for (let sideIdx = 0; sideIdx < 2; sideIdx++) {
      const vertexIndex = i * 2 + sideIdx;
      const sign = sideIdx === 0 ? -1 : 1;
      positions[vertexIndex * 3] = pos.x + state.side.x * sign;
      positions[vertexIndex * 3 + 1] = pos.y + state.side.y * sign;
      positions[vertexIndex * 3 + 2] = pos.z + state.side.z * sign;
      lifeAlpha[vertexIndex] = lifeFade;
    }
  }

  state.positionAttribute.needsUpdate = true;
  state.lifeAlphaAttribute.needsUpdate = true;
  state.geometry.setDrawRange(0, (totalVertices - 1) * 6);
}
