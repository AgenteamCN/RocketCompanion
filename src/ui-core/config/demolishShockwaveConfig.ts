/**
 * demolishShockwaveConfig.ts
 * Runtime configuration, smoothstep track evaluator, and 3D coordinate simulation state
 * for the camera-facing demolition shockwave ring effect.
 */

import {
  cloneDemolishShockwaveConfig,
  DEFAULT_DEMOLISH_SHOCKWAVE_CONFIG,
  sampleColorTrack,
  sampleInnerHoleTrack,
  sampleOpacityTrack,
  sampleOuterTrack,
  smoothstep01,
  type DemolishColorKey,
  type DemolishInnerHoleKey,
  type DemolishLiveAnchors,
  type DemolishOpacityKey,
  type DemolishOuterRadiusKey,
  type DemolishShockwaveConfig,
  type DemolishShockwaveEvaluatedFrame,
  type DemolishShockwaveSimState,
  type DemolishSimAnchorMode,
} from './demolishShockwaveTypesAndDefaults';

export type {
  DemolishColorKey,
  DemolishInnerHoleKey,
  DemolishLiveAnchors,
  DemolishOpacityKey,
  DemolishOuterRadiusKey,
  DemolishShockwaveConfig,
  DemolishShockwaveEvaluatedFrame,
  DemolishShockwaveSimState,
  DemolishSimAnchorMode,
};

const runtimeHolder: {
  config: DemolishShockwaveConfig;
  sim: DemolishShockwaveSimState;
  anchors: DemolishLiveAnchors;
} = {
  config: cloneDemolishShockwaveConfig(DEFAULT_DEMOLISH_SHOCKWAVE_CONFIG),
  sim: {
    isPlaying: false,
    activeIn3d: false,
    normT: 0,
    loopDelayRemainingSec: 0,
    triggerId: 0,
    lastStepMs: 0,
  },
  anchors: {
    carX: 0,
    carY: -2048,
    carZ: 17,
    carFwdX: 0,
    carFwdY: 1,
    ballX: 0,
    ballY: 0,
    ballZ: 93,
  },
};

type ConfigListener = (config: DemolishShockwaveConfig) => void;
type SimListener = (
  sim: DemolishShockwaveSimState,
  config: DemolishShockwaveConfig
) => void;

const configListeners: ConfigListener[] = [];
const simListeners: SimListener[] = [];

function notifyConfigListeners(): void {
  const snapshot = cloneDemolishShockwaveConfig(runtimeHolder.config);
  for (let i = 0; i < configListeners.length; i++) configListeners[i]?.(snapshot);
}

function notifySimListeners(): void {
  const simSnapshot = { ...runtimeHolder.sim };
  for (let i = 0; i < simListeners.length; i++) {
    simListeners[i]?.(simSnapshot, runtimeHolder.config);
  }
}

export function getDemolishShockwaveConfig(): DemolishShockwaveConfig {
  return runtimeHolder.config;
}

export function setDemolishShockwaveConfig(
  patch: Partial<DemolishShockwaveConfig>
): DemolishShockwaveConfig {
  const cur = runtimeHolder.config;
  runtimeHolder.config = {
    ...cur,
    ...patch,
    outerKeys: patch.outerKeys
      ? [
          { ...patch.outerKeys[0], t: 0.0 },
          { ...patch.outerKeys[1] },
          { ...patch.outerKeys[2] },
          { ...patch.outerKeys[3], t: 1.0 },
        ]
      : cur.outerKeys,
    innerKeys: patch.innerKeys
      ? [
          { ...patch.innerKeys[0], t: 0.0 },
          { ...patch.innerKeys[1] },
          { ...patch.innerKeys[2] },
          { ...patch.innerKeys[3], t: 1.0 },
        ]
      : cur.innerKeys,
    colorKeys: patch.colorKeys
      ? [
          { ...patch.colorKeys[0], t: 0.0 },
          { ...patch.colorKeys[1] },
          { ...patch.colorKeys[2] },
          { ...patch.colorKeys[3] },
          { ...patch.colorKeys[4] },
          { ...patch.colorKeys[5], t: 1.0 },
        ]
      : cur.colorKeys,
    opacityKeys: patch.opacityKeys
      ? [
          { ...patch.opacityKeys[0], t: 0.0 },
          { ...patch.opacityKeys[1] },
          { ...patch.opacityKeys[2] },
          { ...patch.opacityKeys[3], t: 1.0 },
        ]
      : cur.opacityKeys,
  };
  notifyConfigListeners();
  notifySimListeners();
  return runtimeHolder.config;
}

export function resetDemolishShockwaveConfig(): DemolishShockwaveConfig {
  runtimeHolder.config = cloneDemolishShockwaveConfig(
    DEFAULT_DEMOLISH_SHOCKWAVE_CONFIG
  );
  notifyConfigListeners();
  notifySimListeners();
  return runtimeHolder.config;
}

export function subscribeDemolishShockwaveConfig(
  listener: ConfigListener
): () => void {
  if (!configListeners.includes(listener)) configListeners.push(listener);
  return () => {
    const idx = configListeners.indexOf(listener);
    if (idx !== -1) configListeners.splice(idx, 1);
  };
}

export function subscribeDemolishShockwaveSim(listener: SimListener): () => void {
  if (!simListeners.includes(listener)) simListeners.push(listener);
  return () => {
    const idx = simListeners.indexOf(listener);
    if (idx !== -1) simListeners.splice(idx, 1);
  };
}

export function getDemolishShockwaveSimState(): DemolishShockwaveSimState {
  return runtimeHolder.sim;
}

export function triggerDemolishShockwaveSim(customCoords?: {
  x?: number;
  y?: number;
  z?: number;
}): void {
  if (customCoords) {
    runtimeHolder.config = {
      ...runtimeHolder.config,
      simAnchorMode: 'custom-xyz',
      simX:
        typeof customCoords.x === 'number'
          ? customCoords.x
          : runtimeHolder.config.simX,
      simY:
        typeof customCoords.y === 'number'
          ? customCoords.y
          : runtimeHolder.config.simY,
      simZ:
        typeof customCoords.z === 'number'
          ? customCoords.z
          : runtimeHolder.config.simZ,
    };
    notifyConfigListeners();
  }
  runtimeHolder.sim = {
    isPlaying: true,
    activeIn3d: true,
    normT: 0,
    loopDelayRemainingSec: 0,
    triggerId: runtimeHolder.sim.triggerId + 1,
    lastStepMs: typeof performance !== 'undefined' ? performance.now() : 0,
  };
  notifySimListeners();
}

export function scrubDemolishShockwaveSim(
  normT: number,
  isPlaying = false
): void {
  const clamped = Math.max(0, Math.min(1, Number.isFinite(normT) ? normT : 0));
  runtimeHolder.sim = {
    ...runtimeHolder.sim,
    isPlaying,
    activeIn3d: true,
    normT: clamped,
    loopDelayRemainingSec: 0,
    lastStepMs: typeof performance !== 'undefined' ? performance.now() : 0,
  };
  notifySimListeners();
}

export function stopDemolishShockwaveSim(clear3d = false): void {
  runtimeHolder.sim = {
    ...runtimeHolder.sim,
    isPlaying: false,
    loopDelayRemainingSec: 0,
    activeIn3d: clear3d ? false : runtimeHolder.sim.activeIn3d,
  };
  notifySimListeners();
}

export function advanceDemolishShockwaveSimClock(nowMs: number): void {
  const sim = runtimeHolder.sim;
  if (!sim.isPlaying) return;
  if (sim.lastStepMs <= 0) {
    sim.lastStepMs = nowMs;
    return;
  }
  const dtSec = (nowMs - sim.lastStepMs) / 1000;
  if (dtSec < 0.002) return;
  sim.lastStepMs = nowMs;

  const cfg = runtimeHolder.config;
  const stepSec = Math.min(0.1, Math.max(0, dtSec));

  if (sim.loopDelayRemainingSec > 0) {
    const remaining = sim.loopDelayRemainingSec - stepSec;
    if (remaining > 0) {
      runtimeHolder.sim = {
        ...sim,
        activeIn3d: false,
        loopDelayRemainingSec: remaining,
        lastStepMs: nowMs,
      };
    } else {
      runtimeHolder.sim = {
        ...sim,
        isPlaying: true,
        activeIn3d: true,
        normT: 0,
        loopDelayRemainingSec: 0,
        triggerId: sim.triggerId + 1,
        lastStepMs: nowMs,
      };
    }
    notifySimListeners();
    return;
  }

  const duration = Math.max(0.1, cfg.duration || 1.6);
  const nextNormT = sim.normT + stepSec / duration;

  if (nextNormT >= 1.0) {
    if (cfg.simAutoLoop) {
      const delaySec = Math.max(0, Math.min(5.0, cfg.simLoopDelaySec || 0));
      if (delaySec > 0.005) {
        runtimeHolder.sim = {
          ...sim,
          isPlaying: true,
          activeIn3d: false,
          normT: 1.0,
          loopDelayRemainingSec: delaySec,
          lastStepMs: nowMs,
        };
      } else {
        runtimeHolder.sim = {
          ...sim,
          isPlaying: true,
          activeIn3d: true,
          normT: nextNormT % 1.0,
          loopDelayRemainingSec: 0,
          triggerId: sim.triggerId + 1,
          lastStepMs: nowMs,
        };
      }
    } else {
      runtimeHolder.sim = {
        ...sim,
        isPlaying: false,
        activeIn3d: false,
        normT: 1.0,
        loopDelayRemainingSec: 0,
        lastStepMs: nowMs,
      };
    }
  } else {
    runtimeHolder.sim = { ...sim, normT: nextNormT, lastStepMs: nowMs };
  }
  notifySimListeners();
}

export function updateDemolishLiveAnchors(
  carX: number,
  carY: number,
  carZ: number,
  carFwdX: number,
  carFwdY: number,
  ballX: number,
  ballY: number,
  ballZ: number
): void {
  const a = runtimeHolder.anchors;
  a.carX = carX;
  a.carY = carY;
  a.carZ = carZ;
  a.carFwdX = carFwdX;
  a.carFwdY = carFwdY;
  a.ballX = ballX;
  a.ballY = ballY;
  a.ballZ = ballZ;
}

export function getDemolishLiveAnchors(): DemolishLiveAnchors {
  return runtimeHolder.anchors;
}

export function resolveDemolishSimTargetUu(
  config: DemolishShockwaveConfig = runtimeHolder.config
): { x: number; y: number; z: number } {
  const a = runtimeHolder.anchors;
  if (config.simAnchorMode === 'local-car') {
    return {
      x: Math.round(a.carX),
      y: Math.round(a.carY),
      z: Math.max(17, Math.round(a.carZ)),
    };
  }
  if (config.simAnchorMode === 'in-front-car') {
    const len = Math.hypot(a.carFwdX, a.carFwdY) || 1;
    return {
      x: Math.round(a.carX + (a.carFwdX / len) * 420),
      y: Math.round(a.carY + (a.carFwdY / len) * 420),
      z: Math.max(35, Math.round(a.carZ + 20)),
    };
  }
  if (config.simAnchorMode === 'ball') {
    return {
      x: Math.round(a.ballX),
      y: Math.round(a.ballY),
      z: Math.max(40, Math.round(a.ballZ)),
    };
  }
  return { x: config.simX, y: config.simY, z: config.simZ };
}

export function evaluateDemolishShockwaveFrame(
  normT: number,
  config: DemolishShockwaveConfig = runtimeHolder.config
): DemolishShockwaveEvaluatedFrame {
  const clampedT = Math.max(0, Math.min(1, Number.isFinite(normT) ? normT : 0));
  const duration = Math.max(0.1, config.duration || 1.6);
  const totalFrames120 = Math.max(1, Math.round(duration * 120));
  const frameIndex120 = Math.round(clampedT * totalFrames120);
  const size = Math.max(1, sampleOuterTrack(config.outerKeys, clampedT));
  const worldDiameterUu = size * Math.max(0.1, config.worldScale || 1.0);
  const innerHolePct = Math.max(
    0,
    Math.min(100, sampleInnerHoleTrack(config.innerKeys, clampedT))
  );
  const rgb = sampleColorTrack(config.colorKeys, clampedT);

  const glowFactor =
    config.glowEndNormT > 1e-4 && clampedT < config.glowEndNormT
      ? (1 - smoothstep01(clampedT / config.glowEndNormT)) * config.glowStrength
      : 0;

  const opacityPct = Math.max(
    0,
    Math.min(100, sampleOpacityTrack(config.opacityKeys, clampedT))
  );
  const trackOpacity = opacityPct / 100;
  const tailFade =
    clampedT > config.fadeStartNormT
      ? 1 -
        smoothstep01(
          (clampedT - config.fadeStartNormT) /
            Math.max(1e-4, 1 - config.fadeStartNormT)
        )
      : 1;
  const opacity = Math.max(0, Math.min(1, trackOpacity * tailFade));

  return {
    normT: clampedT,
    elapsedSec: clampedT * duration,
    frameIndex120,
    totalFrames120,
    size,
    worldDiameterUu,
    innerHolePct,
    rgb,
    rgbNormalized: [rgb[0] / 255, rgb[1] / 255, rgb[2] / 255],
    cssRgb: `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`,
    glowFactor,
    opacityPct,
    opacity,
  };
}

export function exportDemolishShockwaveJson(
  cfg: DemolishShockwaveConfig = runtimeHolder.config
): string {
  const {
    duration,
    worldScale,
    verticalOffsetUu,
    featherPct,
    outerFeatherPct,
    glowEndNormT,
    glowStrength,
    fadeStartNormT,
    outerKeys,
    innerKeys,
    colorKeys,
    opacityKeys,
    simLoopDelaySec,
  } = cfg;
  return JSON.stringify(
    {
      duration,
      worldScale,
      verticalOffsetUu,
      featherPct,
      outerFeatherPct,
      glowEndNormT,
      glowStrength,
      fadeStartNormT,
      outerKeys,
      innerKeys,
      colorKeys,
      opacityKeys,
      simLoopDelaySec,
    },
    null,
    2
  );
}

export function importDemolishShockwaveJson(rawJson: string): boolean {
  try {
    const p = JSON.parse(rawJson);
    if (!p || typeof p !== 'object') return false;
    const patch: Partial<DemolishShockwaveConfig> = {};
    const numKeys = [
      'duration',
      'worldScale',
      'verticalOffsetUu',
      'featherPct',
      'outerFeatherPct',
      'glowEndNormT',
      'glowStrength',
      'fadeStartNormT',
      'simLoopDelaySec',
    ] as const;
    for (const k of numKeys) {
      if (typeof p[k] === 'number' && Number.isFinite(p[k])) patch[k] = p[k];
    }
    if (Array.isArray(p.outerKeys) && p.outerKeys.length === 4) {
      patch.outerKeys = [
        { t: 0.0, size: Number(p.outerKeys[0]?.size ?? 6) },
        {
          t: Number(p.outerKeys[1]?.t ?? 0.15),
          size: Number(p.outerKeys[1]?.size ?? 470),
        },
        {
          t: Number(p.outerKeys[2]?.t ?? 0.55),
          size: Number(p.outerKeys[2]?.size ?? 720),
        },
        { t: 1.0, size: Number(p.outerKeys[3]?.size ?? 850) },
      ];
    }
    if (Array.isArray(p.innerKeys) && p.innerKeys.length === 4) {
      patch.innerKeys = [
        { t: 0.0, innerHole: Number(p.innerKeys[0]?.innerHole ?? 0) },
        {
          t: Number(p.innerKeys[1]?.t ?? 0.28),
          innerHole: Number(p.innerKeys[1]?.innerHole ?? 0),
        },
        {
          t: Number(p.innerKeys[2]?.t ?? 0.65),
          innerHole: Number(p.innerKeys[2]?.innerHole ?? 35),
        },
        { t: 1.0, innerHole: Number(p.innerKeys[3]?.innerHole ?? 100) },
      ];
    }
    if (Array.isArray(p.colorKeys) && p.colorKeys.length === 6) {
      patch.colorKeys = [
        { t: 0.0, color: String(p.colorKeys[0]?.color || '#ffffff') },
        {
          t: Number(p.colorKeys[1]?.t ?? 0.08),
          color: String(p.colorKeys[1]?.color || '#ffe600'),
        },
        {
          t: Number(p.colorKeys[2]?.t ?? 0.25),
          color: String(p.colorKeys[2]?.color || '#ff4500'),
        },
        {
          t: Number(p.colorKeys[3]?.t ?? 0.48),
          color: String(p.colorKeys[3]?.color || '#8c1d00'),
        },
        {
          t: Number(p.colorKeys[4]?.t ?? 0.72),
          color: String(p.colorKeys[4]?.color || '#222020'),
        },
        { t: 1.0, color: String(p.colorKeys[5]?.color || '#0d0d0d') },
      ];
    }
    if (Array.isArray(p.opacityKeys) && p.opacityKeys.length === 4) {
      patch.opacityKeys = [
        { t: 0.0, opacity: Number(p.opacityKeys[0]?.opacity ?? 100) },
        {
          t: Number(p.opacityKeys[1]?.t ?? 0.15),
          opacity: Number(p.opacityKeys[1]?.opacity ?? 100),
        },
        {
          t: Number(p.opacityKeys[2]?.t ?? 0.65),
          opacity: Number(p.opacityKeys[2]?.opacity ?? 72),
        },
        { t: 1.0, opacity: Number(p.opacityKeys[3]?.opacity ?? 0) },
      ];
    }
    setDemolishShockwaveConfig(patch);
    return true;
  } catch {
    return false;
  }
}
