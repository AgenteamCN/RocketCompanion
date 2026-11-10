/**
 * keyboardInputOverlayTelemetry.ts
 * Pure L1 transient telemetry bus for camera-relative WASD 3D arrow angles
 * and live keyboard/controller pressed states.
 * Can be imported directly by both engine subsystems (`src/entities/`, `src/game/`)
 * and UI-Core components (`src/ui-core/`).
 */

export type CameraSpaceVec3 = readonly [number, number, number];

export interface KeyboardInputOverlayTelemetry {
  /** Screen-space 2D angle in degrees (0 deg = Up, +90 deg = Right, 180 deg = Down, -90 deg = Left) for W (car nose -> car bottom) */
  wAngleDeg: number;
  /** Screen-space 2D angle in degrees for S (car nose -> car roof/top) */
  sAngleDeg: number;
  /** Screen-space 2D angle in degrees for A (car nose -> car left) */
  aAngleDeg: number;
  /** Screen-space 2D angle in degrees for D (car nose -> car right) */
  dAngleDeg: number;

  /** Camera-view-space 3D unit vector [vx, vy, vz] (+x=right, +y=up, +z=out of screen, -z=into screen) */
  wDir: CameraSpaceVec3;
  sDir: CameraSpaceVec3;
  aDir: CameraSpaceVec3;
  dDir: CameraSpaceVec3;

  /** Live pressed state for the 9 keys (from engine controls or direct keyboard events) */
  qPressed: boolean;
  wPressed: boolean;
  ePressed: boolean;
  aPressed: boolean;
  sPressed: boolean;
  dPressed: boolean;
  slidePressed: boolean;
  boostPressed: boolean;
  jumpPressed: boolean;
}

const DEFAULT_TELEMETRY: KeyboardInputOverlayTelemetry = {
  wAngleDeg: 0,
  sAngleDeg: 180,
  aAngleDeg: -90,
  dAngleDeg: 90,
  wDir: [0, 1, 0],
  sDir: [0, -1, 0],
  aDir: [-1, 0, 0],
  dDir: [1, 0, 0],
  qPressed: false,
  wPressed: false,
  ePressed: false,
  aPressed: false,
  sPressed: false,
  dPressed: false,
  slidePressed: false,
  boostPressed: false,
  jumpPressed: false,
};

const liveTelemetryHolder: KeyboardInputOverlayTelemetry = {
  ...DEFAULT_TELEMETRY,
};

type TelemetryListener = (telemetry: KeyboardInputOverlayTelemetry) => void;
const telemetryListeners: TelemetryListener[] = [];

function vec3DiffExceeds(a: CameraSpaceVec3, b: CameraSpaceVec3, eps = 0.004): boolean {
  return (
    Math.abs(a[0] - b[0]) > eps ||
    Math.abs(a[1] - b[1]) > eps ||
    Math.abs(a[2] - b[2]) > eps
  );
}

export function getKeyboardInputOverlayTelemetry(): KeyboardInputOverlayTelemetry {
  return liveTelemetryHolder;
}

export function updateKeyboardInputOverlayTelemetry(
  patch: Partial<KeyboardInputOverlayTelemetry>
): void {
  let changed = false;
  if (
    patch.wAngleDeg !== undefined &&
    Math.abs(patch.wAngleDeg - liveTelemetryHolder.wAngleDeg) > 0.15
  ) {
    liveTelemetryHolder.wAngleDeg = patch.wAngleDeg;
    changed = true;
  }
  if (
    patch.sAngleDeg !== undefined &&
    Math.abs(patch.sAngleDeg - liveTelemetryHolder.sAngleDeg) > 0.15
  ) {
    liveTelemetryHolder.sAngleDeg = patch.sAngleDeg;
    changed = true;
  }
  if (
    patch.aAngleDeg !== undefined &&
    Math.abs(patch.aAngleDeg - liveTelemetryHolder.aAngleDeg) > 0.15
  ) {
    liveTelemetryHolder.aAngleDeg = patch.aAngleDeg;
    changed = true;
  }
  if (
    patch.dAngleDeg !== undefined &&
    Math.abs(patch.dAngleDeg - liveTelemetryHolder.dAngleDeg) > 0.15
  ) {
    liveTelemetryHolder.dAngleDeg = patch.dAngleDeg;
    changed = true;
  }

  const dirKeys = ['wDir', 'sDir', 'aDir', 'dDir'] as const;
  for (const dk of dirKeys) {
    const nextDir = patch[dk];
    if (nextDir && vec3DiffExceeds(nextDir, liveTelemetryHolder[dk])) {
      liveTelemetryHolder[dk] = [nextDir[0], nextDir[1], nextDir[2]];
      changed = true;
    }
  }

  const boolKeys = [
    'qPressed',
    'wPressed',
    'ePressed',
    'aPressed',
    'sPressed',
    'dPressed',
    'slidePressed',
    'boostPressed',
    'jumpPressed',
  ] as const;

  for (const k of boolKeys) {
    if (patch[k] !== undefined && patch[k] !== liveTelemetryHolder[k]) {
      liveTelemetryHolder[k] = Boolean(patch[k]);
      changed = true;
    }
  }

  if (changed && telemetryListeners.length > 0) {
    const snap = { ...liveTelemetryHolder };
    for (const listener of telemetryListeners) {
      listener(snap);
    }
  }
}

export function subscribeKeyboardInputOverlayTelemetry(
  listener: TelemetryListener
): () => void {
  if (!telemetryListeners.includes(listener)) {
    telemetryListeners.push(listener);
  }
  return () => {
    const idx = telemetryListeners.indexOf(listener);
    if (idx !== -1) telemetryListeners.splice(idx, 1);
  };
}
