/**
 * replayExportAndViewerTakeoverSteps.ts
 * Scenario tick steps for 4-car 180-frame .rcreplay.gz binary container serialization,
 * GZIP compression/parsing, StandaloneReplayViewerController seek & POV switching,
 * takeover pre-roll countdown, live causal hybrid physics intervention, and clean exit.
 */

import {
  INCIDENT_EVENT_TYPES,
  MATCH_SIGNALS,
  SYSTEM_CONTROL_SIGNALS,
} from '../../physics/RocketSimConstants.ts';
import {
  parseRCReplayFile,
  retainCompletedMatchReplayAndNotify,
} from '../../replay/ReplayFileExporter.ts';
import { serializeRCReplayBinaryContainer } from '../../replay/container/RCReplayBinaryEncoder.ts';
import { packAndCompressReplayInBackground } from '../../replay/container/RCReplayCompressionWorkerClient.ts';
import { useReplayViewerStore } from '../runtimeUiPort.ts';
import type { ScenarioStepContext, ScenarioTickStep } from './ScenarioTypes.ts';

export interface DirectorPoseProbe {
  eyeX?: number;
  eyeY?: number;
  eyeZ?: number;
  targetX?: number;
  targetY?: number;
  targetZ?: number;
}

export interface StandaloneViewerProbe {
  isActive?: boolean;
  hasLoadedReplay?: boolean;
  frames?: ArrayLike<Float32Array>;
  incidentTimeline?: { count?: number } | null;
  signalTimeline?: { count?: number } | null;
  rosterSubController?: {
    resolvedRoster: Array<{ slotKey: number; carIndex: number; team: number }>;
    activePovCarIndex: number;
  };
  takeoverSubController?: { cursor?: number };
  causalSyncController?: { causalHybridEngine?: { enabled?: boolean; freeCarSet?: Set<number> } };
  getViewerState?: () => string;
  handleUploadFile?: (file: File) => Promise<void>;
  startPlaying?: () => void;
  seekFrame?: (frameIndex: number) => void;
  selectPovSlot?: (slotKey: number) => void;
  resumeFromCursor?: () => void;
}

export interface FreeplayModeProbe {
  replayController?: {
    sessionState?: { isActive?: boolean; isPaused?: boolean };
    directorCameraState?: DirectorPoseProbe | null;
    ensureSuffixCameraPlan?: () => unknown;
    setPaused?: (paused: boolean) => boolean;
  } | null;
  directorPreview?: { isReplayActive?: boolean; replayCameraMode?: string } | null;
  goalAndTouch?: { goalResetTicks?: number; getEffectiveGoalResetTicks?: () => number } | null;
  standaloneReplayViewer?: StandaloneViewerProbe | null;
  isGoalReplayActive?: () => boolean;
  enterDirectorReferenceFreeCamFromHere?: (opts?: { fov?: number }) => boolean;
  exitDirectorReferenceFreeCam?: () => boolean;
  skipGoalReplay?: () => void;
  resetToCleanFreeplay?: () => void;
}

export const getFreeplayModeProbe = (ctx: ScenarioStepContext): FreeplayModeProbe | undefined =>
  ctx.runtime?.modeManager?.getActiveMode?.() as FreeplayModeProbe | undefined;

export const buildKeyframeScenarioStep = (
  tick: number,
  keyframeReason: string,
  description: string,
  action: (ctx: ScenarioStepContext) => void | Promise<void>
): ScenarioTickStep => ({
  tick,
  forceKeyframeRender: true,
  keyframeReason,
  description,
  action,
});

async function synthesizeAndLoadFourCarReplayInViewer(ctx: ScenarioStepContext): Promise<void> {
  const r = ctx.runtime;
  const viewer = getFreeplayModeProbe(ctx)?.standaloneReplayViewer;
  if (!r?.physics || !viewer) return;
  while (r.physics.numCars < 4 && typeof r.physics.addCar === 'function') {
    r.physics.addCar(r.physics.numCars % 2, 'fennec');
  }
  r.physics.resetKickoff?.(0);

  const slots: Array<{
    tick: number;
    snapshot: Float32Array;
    acknowledgedControls: Array<{ carIndex: number; controls: Record<string, unknown> }>;
    incidents: Array<Record<string, unknown>>;
    signals: Array<Record<string, unknown>>;
  }> = [];

  for (let f = 0; f < 180; f++) {
    const ack: Array<{ carIndex: number; controls: Record<string, unknown> }> = [];
    for (let c = 0; c < 4; c++) {
      const ctrl = {
        throttle: 1.0,
        steer: c % 2 === 0 ? 0.1 : -0.1,
        pitch: 0,
        yaw: 0,
        roll: 0,
        jump: false,
        boost: f < 60,
        handbrake: false,
      };
      r.physics.setControls?.(c, ctrl);
      ack.push({ carIndex: c, controls: ctrl });
    }
    r.physics.step?.(1 / 120);
    const snap = r.physics.saveCompactState?.();
    if (snap) {
      slots.push({
        tick: f + 1,
        snapshot: new Float32Array(snap),
        acknowledgedControls: ack,
        incidents:
          f === 60
            ? [
                {
                  type: INCIDENT_EVENT_TYPES.GOAL_SCORED,
                  tick: 61,
                  frameIndex: 60,
                  carIndex: 0,
                  team: 0,
                  speedKph: 108.5,
                },
              ]
            : [],
        signals:
          f === 60
            ? [
                {
                  signalId: 1,
                  signalType: MATCH_SIGNALS.SCORE_UPDATED,
                  frameId: 61,
                  param1: 1,
                  param2: 0,
                },
              ]
            : [],
      });
    }
  }

  const retained = retainCompletedMatchReplayAndNotify({
    frames: slots,
    mode: 'standard_2v2',
    gameMode: 'match',
    durationSeconds: 1.5,
    blueScore: 1,
    orangeScore: 0,
    winner: 'blue',
    roster: [
      { carIndex: 0, team: 0, name: 'BlueOne', visualId: 'fennec', isSelf: true },
      { carIndex: 1, team: 1, name: 'OrangeOne', visualId: 'octane', isSelf: false },
      { carIndex: 2, team: 0, name: 'BlueTwo', visualId: 'dominus', isSelf: false },
      { carIndex: 3, team: 1, name: 'OrangeTwo', visualId: 'insidio', isSelf: false },
    ],
    suppressNotification: true,
  });

  const raw = serializeRCReplayBinaryContainer({ slots, ...(retained || {}) });
  const magicOk =
    raw.byteLength > 24 && raw[0] === 0x52 && raw[1] === 0x43 && raw[2] === 0x52 && raw[3] === 0x45;
  const packed = await packAndCompressReplayInBackground(retained!);
  const bytes = new Uint8Array(packed.buffer);
  const gzipOk =
    Boolean(packed.compressed) && bytes.byteLength > 32 && bytes[0] === 0x1f && bytes[1] === 0x8b;
  const parsed = await parseRCReplayFile(packed.buffer);
  await viewer.handleUploadFile?.(
    new File([packed.buffer], 'bench.rcreplay.gz', { type: 'application/gzip' })
  );
  viewer.startPlaying?.();

  const rosterLen = viewer.rosterSubController?.resolvedRoster?.length ?? 0;
  const incCount = viewer.incidentTimeline?.count ?? 0;
  const sigCount = viewer.signalTimeline?.count ?? 0;
  ctx.recordAssertion(
    'rcreplay_binary_export_gzip_and_viewer_load',
    magicOk &&
      gzipOk &&
      parsed.frames.length === 180 &&
      Boolean(viewer.isActive && viewer.hasLoadedReplay) &&
      (viewer.frames?.length ?? 0) === 180 &&
      rosterLen === 4 &&
      incCount >= 1 &&
      sigCount >= 1,
    `magic=${magicOk}, gzip=${gzipOk} (${bytes.byteLength}B), frames=${viewer.frames?.length ?? 0}, roster=${rosterLen}, inc=${incCount}, sig=${sigCount}`
  );
}

export function buildReplayExportAndViewerTakeoverSteps(): ScenarioTickStep[] {
  return [
    buildKeyframeScenarioStep(
      380,
      'rcreplay_export_import',
      'Serialize and GZIP-compress a 4-car 180-frame replay into .rcreplay.gz and load into Viewer',
      synthesizeAndLoadFourCarReplayInViewer
    ),
    buildKeyframeScenarioStep(
      430,
      'viewer_seek_and_pov_switch',
      'Seek frame 140 and switch POV slot in Viewer',
      (ctx) => {
        const r = ctx.runtime;
        const viewer = getFreeplayModeProbe(ctx)?.standaloneReplayViewer;
        viewer?.seekFrame?.(140);
        const seekSig = r?.lastSystemControlSignal;
        viewer?.selectPovSlot?.(4);
        const povIdx = viewer?.rosterSubController?.activePovCarIndex ?? -1;
        const cursor = Math.round(viewer?.takeoverSubController?.cursor ?? -1);
        ctx.recordAssertion(
          'viewer_seek_and_pov_switch_verified',
          seekSig === SYSTEM_CONTROL_SIGNALS.SYS_CTRL_STATE_ONLY &&
            cursor === 140 &&
            povIdx >= 0 &&
            r?.playerCarIndex === povIdx,
          `seekSig=0x${(seekSig || 0).toString(16)}, cursor=${cursor}, pov=${povIdx}, player=${r?.playerCarIndex}`
        );
      }
    ),
    buildKeyframeScenarioStep(
      450,
      'viewer_takeover_preroll',
      'Trigger Takeover pre-roll countdown',
      (ctx) => {
        const viewer = getFreeplayModeProbe(ctx)?.standaloneReplayViewer;
        useReplayViewerStore.getState().setDownCounterSec(0);
        viewer?.resumeFromCursor?.();
        const vState = viewer?.getViewerState?.();
        const sig = ctx.runtime?.lastSystemControlSignal;
        ctx.recordAssertion(
          'viewer_takeover_preroll_countdown_started',
          vState === 'preroll-countdown' &&
            sig === SYSTEM_CONTROL_SIGNALS.SYS_CTRL_INTERVENE_WILL_RESUME,
          `state=${vState}, sig=0x${(sig || 0).toString(16)}`
        );
        ctx.setLocalCarControls({ throttle: 1.0, steer: -0.25, boost: true });
      }
    ),
    buildKeyframeScenarioStep(
      590,
      'viewer_live_intervention',
      'Verify live causal hybrid physics intervention',
      (ctx) => {
        const r = ctx.runtime;
        const viewer = getFreeplayModeProbe(ctx)?.standaloneReplayViewer;
        const vState = viewer?.getViewerState?.();
        const povIdx = viewer?.rosterSubController?.activePovCarIndex ?? 0;
        const eng = viewer?.causalSyncController?.causalHybridEngine;
        const hybrid = Boolean(eng?.enabled && eng?.freeCarSet?.has(povIdx));
        const sig = r?.lastSystemControlSignal;
        const cv = r?.physics?.getCarStateView?.(povIdx);
        const speed = Math.hypot(cv?.velX ?? 0, cv?.velY ?? 0, cv?.velZ ?? 0);
        ctx.recordAssertion(
          'viewer_takeover_live_physics_intervening',
          vState === 'intervening' &&
            hybrid &&
            sig === SYSTEM_CONTROL_SIGNALS.SYS_CTRL_PHYSICS_RESUME &&
            speed > 50,
          `state=${vState}, hybrid=${hybrid}, sig=0x${(sig || 0).toString(16)}, speed=${speed.toFixed(1)}`
        );
      }
    ),
    buildKeyframeScenarioStep(
      700,
      'viewer_clean_exit',
      'Exit Replay Viewer back to FreePlay',
      (ctx) => {
        getFreeplayModeProbe(ctx)?.resetToCleanFreeplay?.();
        ctx.runtime?.resetKickoff?.(0);
      }
    ),
    buildKeyframeScenarioStep(
      760,
      'viewer_post_exit_clean',
      'Verify clean 1-car FreePlay restoration',
      (ctx) => {
        const r = ctx.runtime;
        const viewer = getFreeplayModeProbe(ctx)?.standaloneReplayViewer;
        const vState = viewer?.getViewerState?.() ?? 'idle';
        const numCars = r?.physics?.numCars ?? 0;
        const hidden = (r?.arena?.cars ?? []).slice(1).every((c) => !c || !c.visible);
        const dormant = (r?.arena?.carBoosts ?? [])
          .slice(1)
          .every((emList) =>
            (emList ?? []).every(
              (em) =>
                !em?.physics?.driveParticlesActive &&
                !em?.physics?.trailParticlesActive &&
                !em?.goldRush?.driveParticlesActive &&
                !em?.goldRush?.trailParticlesActive
            )
          );
        ctx.recordAssertion(
          'viewer_clean_exit_to_1car_freeplay_verified',
          vState === 'idle' &&
            !viewer?.isActive &&
            r?.match?.state?.mode === 'freeplay' &&
            numCars === 1 &&
            hidden &&
            dormant,
          `state=${vState}, mode=${r?.match?.state?.mode}, cars=${numCars}, hidden=${hidden}, dormant=${dormant}`
        );
      }
    ),
  ];
}
