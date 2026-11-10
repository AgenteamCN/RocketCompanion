/**
 * scenarioWebGlAndPacingPipeline.ts
 * WebGL renderer telemetry queries, keyframe & camera pose sample builders,
 * fast-forward speed pacing preset resolution, and tick-step scheduling helpers.
 */

import { type CameraPoseSample, roundMetric } from './scenarioMetricsPipeline.ts';
import type { KeyframeRenderSample } from './ScenarioTypes.ts';

export interface WebGlRendererPort {
  info?: {
    programs?: unknown[] | null;
    render?: { calls?: number; triangles?: number };
    memory?: { geometries?: number; textures?: number };
  } | null;
  getContext?: () => WebGLRenderingContext | WebGL2RenderingContext | null;
}

export function queryCompiledShaderProgramCount(
  renderer: WebGlRendererPort | null | undefined
): number {
  const programs = renderer?.info?.programs;
  return Array.isArray(programs) ? programs.length : 0;
}

export function queryWebGlContextAttributesSummary(
  renderer: WebGlRendererPort | null | undefined
): { renderer: string; vendor: string } {
  try {
    const gl = renderer?.getContext?.() as WebGLRenderingContext | null;
    if (!gl) return { renderer: 'unavailable', vendor: 'unavailable' };
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    const gpuRenderer = dbg
      ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) || gl.getParameter(gl.RENDERER))
      : String(gl.getParameter(gl.RENDERER) || 'WebGL');
    const vendor = dbg
      ? String(gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) || gl.getParameter(gl.VENDOR))
      : String(gl.getParameter(gl.VENDOR) || 'WebGL');
    return { renderer: gpuRenderer, vendor };
  } catch {
    return { renderer: 'error', vendor: 'error' };
  }
}

export function queryWebGlError(renderer: WebGlRendererPort | null | undefined): number {
  try {
    const gl = renderer?.getContext?.() as WebGLRenderingContext | null;
    return gl ? gl.getError() : 0;
  } catch {
    return 0;
  }
}

export function resolveRuntimeCameraMode(
  rt:
    | {
        isGoalReplayCameraOverrideActive?: () => boolean;
        modeManager?: {
          getActiveMode?: () => {
            directorPreview?: { replayCameraMode?: string } | null;
            replaySession?: { replayCameraMode?: string } | null;
          } | null;
        } | null;
        camera?: { isFreeCam?: boolean; mode?: string } | null;
      }
    | null
    | undefined
): string {
  if (rt?.isGoalReplayCameraOverrideActive?.()) {
    const activeMode = rt?.modeManager?.getActiveMode?.();
    const replayCamMode =
      activeMode?.directorPreview?.replayCameraMode || activeMode?.replaySession?.replayCameraMode;
    if (replayCamMode) return String(replayCamMode);
    return 'director';
  }
  if (rt?.camera?.isFreeCam) return 'freecam';
  return rt?.camera?.mode || 'ball';
}

export function buildKeyframeRenderSample(
  tick: number,
  virtualTimeOffsetMs: number,
  reason: string,
  phase: string,
  gameMode: string,
  cameraMode: string,
  renderStageWallMs: number,
  totalFrameWallMs: number,
  shaderProgramsBefore: number,
  shaderProgramsAfter: number,
  shaderProgramsDelta: number,
  glError: number,
  renderInfo: WebGlRendererPort['info']
): KeyframeRenderSample {
  return {
    tick,
    virtualTimeMs: roundMetric(virtualTimeOffsetMs, 2),
    reason,
    phase,
    gameMode,
    cameraMode,
    renderStageWallMs: roundMetric(renderStageWallMs, 4),
    totalFrameWallMs: roundMetric(totalFrameWallMs, 4),
    shaderProgramsBefore,
    shaderProgramsAfter,
    shaderProgramsDelta,
    glError,
    drawCalls: renderInfo?.render?.calls ?? 0,
    triangles: renderInfo?.render?.triangles ?? 0,
    geometries: renderInfo?.memory?.geometries ?? 0,
    textures: renderInfo?.memory?.textures ?? 0,
  };
}

export function extractCameraPoseSample(
  tick: number,
  phase: string,
  cameraMode: string,
  camObj:
    | {
        position?: { x: number; y: number; z: number } | null;
        quaternion?: { x: number; y: number; z: number; w: number } | null;
      }
    | null
    | undefined
): CameraPoseSample | null {
  if (!camObj?.position || !camObj?.quaternion) return null;
  return {
    tick,
    phase,
    cameraMode,
    px: camObj.position.x,
    py: camObj.position.y,
    pz: camObj.position.z,
    qx: camObj.quaternion.x,
    qy: camObj.quaternion.y,
    qz: camObj.quaternion.z,
    qw: camObj.quaternion.w,
  };
}

export interface SpeedPacingConfig {
  presetLabel: string;
  renderStride: number;
  batchYieldTicks: number;
  failOnConsoleError: boolean;
  includeGoldenDiff: boolean;
}

export function resolveSpeedPacingConfig(
  scriptRenderStride = 15,
  scriptBatchYieldTicks = 60,
  options?: {
    speed?: string | number;
    renderStrideOverride?: number;
    batchYieldTicksOverride?: number;
    failOnConsoleError?: boolean;
    includeGoldenDiff?: boolean;
  }
): SpeedPacingConfig {
  const rawSpeed = String(options?.speed ?? '20x')
    .trim()
    .toLowerCase();
  let presetLabel = rawSpeed || '20x';
  let renderStride = Math.max(1, scriptRenderStride || 15);
  let batchYieldTicks = Math.max(10, scriptBatchYieldTicks || 60);

  if (rawSpeed === '1x' || rawSpeed === '1') {
    presetLabel = '1x';
    renderStride = 1;
    batchYieldTicks = 15;
  } else if (rawSpeed === '10x' || rawSpeed === '10') {
    presetLabel = '10x';
    renderStride = 10;
    batchYieldTicks = 40;
  } else if (rawSpeed === '20x' || rawSpeed === '20') {
    presetLabel = '20x';
    renderStride = Math.max(15, scriptRenderStride || 20);
    batchYieldTicks = 60;
  } else if (rawSpeed === '50x' || rawSpeed === '50') {
    presetLabel = '50x';
    renderStride = 50;
    batchYieldTicks = 150;
  } else if (rawSpeed === 'max') {
    presetLabel = 'max';
    renderStride = 240;
    batchYieldTicks = 240;
  } else {
    const numeric = Number.parseFloat(rawSpeed.replace(/x$/, ''));
    if (Number.isFinite(numeric) && numeric > 0) {
      presetLabel = `${numeric}x`;
      renderStride = Math.max(1, Math.round(numeric));
      batchYieldTicks = Math.max(15, Math.round(numeric * 3));
    }
  }

  if (typeof options?.renderStrideOverride === 'number' && options.renderStrideOverride >= 1) {
    renderStride = Math.round(options.renderStrideOverride);
  }
  if (
    typeof options?.batchYieldTicksOverride === 'number' &&
    options.batchYieldTicksOverride >= 1
  ) {
    batchYieldTicks = Math.round(options.batchYieldTicksOverride);
  }

  return {
    presetLabel,
    renderStride,
    batchYieldTicks,
    failOnConsoleError: options?.failOnConsoleError !== false,
    includeGoldenDiff: options?.includeGoldenDiff !== false,
  };
}

export function normalizeCarControls<
  T extends {
    throttle?: number;
    steer?: number;
    pitch?: number;
    yaw?: number;
    roll?: number;
    jump?: boolean | number;
    boost?: boolean | number;
    handbrake?: boolean | number;
  },
>(controls: Partial<T> | null): T | null {
  if (!controls) return null;
  return {
    throttle: controls.throttle ?? 0,
    steer: controls.steer ?? 0,
    pitch: controls.pitch ?? 0,
    yaw: controls.yaw ?? 0,
    roll: controls.roll ?? 0,
    jump: Boolean(controls.jump),
    boost: Boolean(controls.boost),
    handbrake: Boolean(controls.handbrake),
  } as T;
}

export function buildStepsByTickMap<T extends { tick: number }>(
  steps: readonly T[]
): Map<number, T[]> {
  const map = new Map<number, T[]>();
  for (const step of steps) {
    const list = map.get(step.tick) || [];
    list.push(step);
    map.set(step.tick, list);
  }
  return map;
}
