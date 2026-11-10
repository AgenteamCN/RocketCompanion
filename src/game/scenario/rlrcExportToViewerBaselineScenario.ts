/**
 * rlrcExportToViewerBaselineScenario.ts
 * End-to-end baseline scenario covering:
 * 1. RLRC 30Hz/22Hz alternating-tick keyframe phase-locked dejitter & Hermite-Slerp resampling
 * 2. RLRC -> .rcreplay.gz export (serializeRLRCBinaryContainer / deserializeRLRCBinaryContainer)
 * 3. Direct handoff from active RLRCReplaySessionController to StandaloneReplayViewerController
 *    without manual clearReplay(), verifying 2v2 4-car roster, 5:00 clock, and clean matchPhase.
 */

import {
  deserializeRLRCBinaryContainer,
  serializeRLRCBinaryContainer,
} from '../../replay/rlrc/container/RLRCBinaryContainerCodec.ts';
import { resampleRLRCReplayTo120Hz } from '../../replay/rlrc/synthesis/RLRCHermiteSlerpResampler.ts';
import type {
  RLRCBookmarkRecord,
  RLRCHitboxId,
  RLRCParserOutput,
  RLRCPlayerSlotMeta,
  RLRCResamplerOutput,
  RLRCSourceNetworkFrame,
  RLRCVisualId,
} from '../../replay/rlrc/RLRCReplayTypes.ts';
import { hudStore, useReplayToRcsImporterStore } from '../runtimeUiPort.ts';
import type { ScenarioScript } from './ScenarioTypes.ts';

interface ScenarioFreeplayModeWithRLRCPort {
  rlrcReplaySession?: {
    isActive?: boolean;
    hasLoadedReplay?: boolean;
    activateMode?(): void;
    loadReplayBuffer?(buffer: ArrayBuffer | Uint8Array, fileName?: string): void;
  };
  standaloneReplayViewer?: {
    isActive?: boolean;
    hasLoadedReplay?: boolean;
    handleUploadFile?(file: File): Promise<void>;
    startPlaying?(): void;
    rosterSubController?: { resolvedRoster?: unknown[] };
    takeoverSubController?: { cursor?: number };
  };
  resetToCleanFreeplay?(): void;
}

function makeSlotMeta(
  slotIndex: number,
  userName: string,
  team: 0 | 1,
  bodyProductId: number,
  hitboxId: RLRCHitboxId,
  visualId: RLRCVisualId
): RLRCPlayerSlotMeta {
  return {
    slotIndex,
    userName,
    team,
    priActorId: 100 + slotIndex,
    bodyProductId,
    hitboxId,
    visualId,
  };
}

function buildSynthetic2v2RLRCResampled(): {
  resampled: RLRCResamplerOutput;
  maxVelOscillationRatio: number;
  falseBoostCount: number;
} {
  const roster: RLRCPlayerSlotMeta[] = [
    makeSlotMeta(0, 'BlueOne', 0, 23, 'hitbox-octane', 'trioctane'),
    makeSlotMeta(1, 'BlueTwo', 0, 23, 'hitbox-octane', 'trioctane'),
    makeSlotMeta(2, 'OrangeOne', 1, 403, 'hitbox-dominus', 'dominus'),
    makeSlotMeta(3, 'OrangeTwo', 1, 4284, 'hitbox-octane', 'fennec'),
  ];
  const networkFrames: RLRCSourceNetworkFrame[] = [];
  let wallTime = 0;
  let physTick = 0;
  for (let i = 0; i < 40; i++) {
    const dtPhys = (i % 2 === 0 ? 5 : 6) / 120;
    const dtWall = i === 0 ? 0 : dtPhys + (i % 2 === 0 ? 0.0038 : -0.0038);
    wallTime += dtWall;
    physTick += i === 0 ? 0 : i % 2 === 0 ? 5 : 6;
    const pY = -2000 + (physTick / 120) * 1400;
    networkFrames.push({
      sourceFrame30Hz: i,
      timeSeconds: wallTime,
      deltaSeconds: i === 0 ? 1 / 30 : dtWall,
      secondsRemaining: 300,
      isOvertime: false,
      roundCountdownNumber: 0,
      blueScore: 0,
      orangeScore: 0,
      ball: {
        entityActive: true,
        rbUpdated: true,
        rigidBody: {
          sleeping: false,
          position: { x: 0, y: (physTick / 120) * 800, z: 93 },
          rotation: { x: 0, y: 0, z: 0, w: 1 },
          linearVelocity: { x: 0, y: 800, z: 0 },
          angularVelocity: { x: 0, y: 0, z: 0 },
        },
      },
      cars: roster.map((r, s) => ({
        slotIndex: s,
        entityActive: true,
        rbUpdated: true,
        rigidBody: {
          sleeping: false,
          position: { x: (s - 1.5) * 400, y: pY, z: 17.01 },
          rotation: { x: 0, y: 0, z: 0.7071068, w: 0.7071068 },
          linearVelocity: { x: 0, y: 1400, z: 0 },
          angularVelocity: { x: 0, y: 0, z: 0 },
        },
        boostAmount: 33.3,
        isOnGround: true,
        isSupersonic: false,
        hasFlipOrJump: true,
        airTimeSinceJump: 0,
        activeFlags: {
          boostActive: false,
          jumpActive: false,
          doubleJumpActive: false,
          dodgeActive: false,
        },
        controls: {
          throttle: 1,
          steer: 0,
          pitch: 0,
          yaw: 0,
          roll: 0,
          jump: false,
          boost: false,
          handbrake: false,
        },
      })),
    });
  }
  const bookmarks: RLRCBookmarkRecord[] = [
    {
      kind: 'kickoff',
      frameIndex120Hz: 0,
      sourceFrame30Hz: 0,
      timeSeconds: 0,
      label: 'Kickoff',
      slotIndex: -1,
      team: -1,
    },
    {
      kind: 'ue-keyframe',
      frameIndex120Hz: 24,
      sourceFrame30Hz: 6,
      timeSeconds: 0.2,
      label: 'UE Keyframe 0',
      slotIndex: -1,
      team: -1,
    },
  ];
  const parsed: RLRCParserOutput = {
    header: {
      replayId: 'synthetic-2v2-rlrc',
      replayName: 'Synthetic 2v2 RLRC',
      mapName: 'Stadium_P',
      matchType: 'Online',
      teamSize: 2,
      recordFps: 30,
      sourceFrameCount: networkFrames.length,
      frameCount120Hz: Math.round(wallTime * 120) + 1,
      durationSeconds: 373,
      date: '2026-03-31',
      blueScore: 0,
      orangeScore: 0,
      part1CrcValid: true,
      part2CrcValid: true,
    },
    roster,
    bookmarks,
    boostPadEvents: [],
    lifeSegments: roster.map((r) => ({
      slotIndex: r.slotIndex,
      carActorId: r.priActorId,
      startFrame30Hz: 0,
      endFrame30Hz: networkFrames.length - 1,
      startTimeSeconds: 0,
      endTimeSeconds: wallTime,
    })),
    networkFrames,
  };
  const resampled = resampleRLRCReplayTo120Hz(parsed);
  let minSpeed = Infinity;
  let maxSpeed = 0;
  let falseBoostCount = 0;
  for (let f = 5; f < resampled.frames120Hz.length - 5; f++) {
    const car0 = resampled.frames120Hz[f].cars[0];
    const v = car0.rigidBody.linearVelocity;
    const spd = Math.hypot(v.x, v.y, v.z);
    if (spd < minSpeed) minSpeed = spd;
    if (spd > maxSpeed) maxSpeed = spd;
    if (car0.activeFlags.boostActive || car0.controls.boost) falseBoostCount++;
  }
  const maxVelOscillationRatio = (maxSpeed - minSpeed) / 1400;
  return { resampled, maxVelOscillationRatio, falseBoostCount };
}

export const RLRC_EXPORT_TO_VIEWER_BASELINE_SCENARIO: ScenarioScript = {
  id: 'rlrc_export_to_viewer_baseline',
  title: 'RLRC 2v2 Dejitter, .rcreplay.gz Export, and Direct Standalone Viewer Handoff',
  description:
    'Verifies 120Hz phase-locked keyframe dejitter, zero false boost synthesis, .rcreplay.gz export sanitization, and direct playback in StandaloneReplayViewerController without manual rlrcReplaySession.clearReplay().',
  totalTicks: 90,
  renderStride: 15,
  batchYieldTicks: 30,
  forceRenderOnKeyframes: true,
  setup: async (ctx) => {
    const r = ctx.runtime;
    if (r?.authoritativeServer || r?.networkReconciler) {
      await r.networkManager?.sessionCoordinator?.stopOnlineServer?.({ rebindLoopback: false });
    }
    r?.modeManager?.setActiveMode?.('freeplay');
    r?.resetKickoff?.(0);
  },
  steps: [
    {
      tick: 10,
      forceKeyframeRender: true,
      keyframeReason: 'rlrc_session_loaded_and_exported',
      description:
        'Load 2v2 RLRC session, verify 120Hz resampler dejitter, then export binary container and load directly into StandaloneReplayViewerController',
      action: async (ctx) => {
        const mode =
          (ctx.runtime?.modeManager?.getActiveMode?.() as ScenarioFreeplayModeWithRLRCPort | null) ??
          null;
        const { resampled, maxVelOscillationRatio, falseBoostCount } =
          buildSynthetic2v2RLRCResampled();
        ctx.recordAssertion(
          'rlrc_resampler_dejitter_and_no_false_boost',
          maxVelOscillationRatio < 0.02 && falseBoostCount === 0,
          `maxVelOscillationRatio=${maxVelOscillationRatio.toFixed(4)}, falseBoostCount=${falseBoostCount}`
        );
        const binaryBytes = serializeRLRCBinaryContainer(resampled);
        const roundtrip = deserializeRLRCBinaryContainer(binaryBytes);
        mode?.rlrcReplaySession?.loadReplayBuffer?.(binaryBytes, 'synthetic-2v2.rcreplay.gz');
        mode?.rlrcReplaySession?.activateMode?.();
        const exportedFile = new File([binaryBytes as BlobPart], 'synthetic-2v2.rcreplay.gz', {
          type: 'application/octet-stream',
        });
        await mode?.standaloneReplayViewer?.handleUploadFile?.(exportedFile);
        mode?.standaloneReplayViewer?.startPlaying?.();
        ctx.recordAssertion(
          'rlrc_container_roundtrip_preserves_keyframes_and_roster',
          roundtrip.roster.length === 4 && roundtrip.bookmarks.length === 2,
          `roster=${roundtrip.roster.length}, bookmarks=${roundtrip.bookmarks.length}`
        );
      },
    },
    {
      tick: 60,
      forceKeyframeRender: true,
      keyframeReason: 'rlrc_exported_viewer_playback_verified',
      description:
        'Verify StandaloneReplayViewerController auto-deactivated RLRC session, advances cursor, resolves 4-car 2v2 roster, shows 5:00 clock, and stays in playing phase',
      action: (ctx) => {
        const mode =
          (ctx.runtime?.modeManager?.getActiveMode?.() as ScenarioFreeplayModeWithRLRCPort | null) ??
          null;
        const viewer = mode?.standaloneReplayViewer;
        const rlrcActive = Boolean(mode?.rlrcReplaySession?.isActive);
        const cursor = viewer?.takeoverSubController?.cursor ?? 0;
        const roster = viewer?.rosterSubController?.resolvedRoster ?? [];
        const hud = hudStore.getState();
        const remSec = hud.remainingSeconds ?? 0;
        const impState = useReplayToRcsImporterStore.getState().viewerState;
        ctx.recordAssertion(
          'standalone_viewer_handoff_and_2v2_hud_clean',
          !rlrcActive &&
            cursor > 5 &&
            roster.length === 4 &&
            hud.matchPhase === 'playing' &&
            remSec >= 295 &&
            remSec <= 300 &&
            impState === 'idle',
          `rlrcActive=${rlrcActive}, cursor=${cursor.toFixed(1)}, roster=${roster.length}, phase=${hud.matchPhase}, clock=${remSec}, impState=${impState}`
        );
      },
    },
  ],
  teardown: async (ctx) => {
    ctx.runtime?.modeManager?.getActiveMode?.()?.resetToCleanFreeplay?.();
  },
};
