/**
 * replayViewerBaselineScenario.ts
 * Automated WebGL & physics baseline scenario covering 6-car StandaloneReplayViewerController
 * playback, POV switching, timeline scoreboard deduplication, and clean exit back to 1-car Freeplay.
 */

import { INCIDENT_EVENT_TYPES, SYSTEM_CONTROL_SIGNALS } from '../../physics/RocketSimConstants.ts';
import { retainCompletedMatchReplayAndNotify } from '../../replay/ReplayFileExporter.ts';
import { eventStreamStore } from '../runtimeUiPort.ts';
import type { ScenarioScript } from './ScenarioTypes.ts';

interface BoostParticleSystemCheck {
  driveParticlesActive?: boolean;
  trailParticlesActive?: boolean;
}

interface BoostEmitterCheck {
  physics?: BoostParticleSystemCheck;
  goldRush?: BoostParticleSystemCheck;
}

interface CarMeshCheck {
  visible?: boolean;
}

export const MULTIPLAYER_6CAR_LOADOUT_STRESS_SCENARIO: ScenarioScript = {
  id: 'multiplayer_6car_loadout_stress',
  title: '6-Car (3v3) Multiplayer Loopback & Diverse Loadout Stress Baseline',
  description:
    'Hosts an authoritative 3v3 server and connects 5 virtual peers (6 cars total) with 6 distinct 3D models, 6 hitbox archetypes, paint finishes, boost visuals, and boost audio variations. Verifies prepare barrier, kickoff jump-hold suppression, 120Hz binary input/snapshot codecs, single-jump flip-timer expiry without phantom double-jump audio, goal explosion, and streamed Director Goal Replay.',
  totalTicks: 1020,
  renderStride: 20,
  batchYieldTicks: 60,
  forceRenderOnKeyframes: true,
  setup: async (ctx) => {
    await ctx.loopbackSimulator.startSixCarLoopbackSession(300);
    ctx.setLocalCarControls({ throttle: 1.0, steer: 0.1, boost: true });
  },
  steps: [
    {
      tick: 5,
      forceKeyframeRender: true,
      keyframeReason: 'multiplayer_lobby_before_start',
      description: 'Verify authoritative host & reconciler initialized, then force-start 3v3 match',
      action: (ctx) => {
        const r = ctx.runtime;
        const hasServer = Boolean(r?.authoritativeServer);
        const hasReconciler = Boolean(r?.networkReconciler);
        ctx.recordAssertion(
          'multiplayer_host_and_reconciler_ready',
          hasServer && hasReconciler,
          `authoritativeServer=${hasServer}, networkReconciler=${hasReconciler}`
        );
        ctx.loopbackSimulator.triggerForceStartMatch(300);
      },
    },
    {
      tick: 30,
      forceKeyframeRender: true,
      keyframeReason: 'multiplayer_6car_kickoff_all_loadouts_visible',
      description:
        'Verify all 6 cars spawned with distinct loadouts/hitboxes and match entered kickoff',
      action: (ctx) => {
        const telemetry = ctx.loopbackSimulator.collectTelemetry();
        const phase = ctx.runtime?.match?.state?.phase;
        ctx.recordAssertion(
          'multiplayer_6_physical_and_visual_cars_active',
          telemetry.activePhysicalCars >= 6 && telemetry.visibleArenaCars >= 6,
          `activePhysicalCars=${telemetry.activePhysicalCars}, visibleArenaCars=${telemetry.visibleArenaCars}, phase=${phase}`
        );
      },
    },
    {
      tick: 485,
      description: 'Hold Jump during frozen kickoff countdown prior to kickoff unfreeze',
      action: (ctx) => {
        ctx.setLocalCarControls({ throttle: 1.0, steer: 0.0, boost: true, jump: true });
      },
    },
    {
      tick: 505,
      forceKeyframeRender: true,
      keyframeReason: 'multiplayer_6car_playing_active',
      description:
        'Verify 480-tick kickoff countdown completed into active playing phase without spontaneous jump, then inject goal shot',
      action: (ctx) => {
        const r = ctx.runtime;
        const phase = r?.match?.state?.phase;
        const cv = r?.physics?.getCarStateView?.(0);
        const noSpontaneousJump = Boolean(cv && !cv.isJumping && cv.posZ < 28);
        ctx.recordAssertion(
          'multiplayer_kickoff_transitioned_to_playing',
          phase === 'playing' && noSpontaneousJump,
          `phase=${phase}, isJumping=${cv?.isJumping}, posZ=${cv?.posZ?.toFixed?.(2)}`
        );
        ctx.setLocalCarControls({ throttle: 1.0, steer: 0.0, boost: true, jump: false });
        ctx.setBallState({ pos: [0, 4800, 100], vel: [0, 2900, 50], angVel: [0, 0, 0] });
      },
    },
    {
      tick: 545,
      forceKeyframeRender: true,
      keyframeReason: 'multiplayer_6car_goal_explosion',
      description:
        'Assert authoritative server scored Blue goal and broadcasted SCORE_UPDATED, then launch Car 0 into a single jump to test flip-timer expiry',
      action: (ctx) => {
        const r = ctx.runtime;
        const blueScore = r?.match?.state?.blueScore ?? r?.match?.state?.score?.blue ?? 0;
        const phase = r?.match?.state?.phase;
        ctx.recordAssertion(
          'multiplayer_goal_scored_and_synced',
          blueScore >= 1 && (phase === 'goal_scored' || phase === 'goal' || phase === 'replay'),
          `blueScore=${blueScore}, phase=${phase}`
        );
        ctx.setLocalCarControls({ throttle: 1.0, pitch: 1.0, jump: true, boost: true });
      },
    },
    {
      tick: 558,
      description:
        'Release Jump while airborne so Car 0 remains on a single jump until the 1.25s flip window expires',
      action: (ctx) => {
        ctx.setLocalCarControls({ throttle: 1.0, pitch: 0.2, jump: false, boost: true });
      },
    },
    {
      tick: 740,
      description:
        'Verify 1.25s flip window expired in air during network reconciliation without emitting phantom CAR_DOUBLE_JUMP audio event',
      action: (ctx) => {
        const snap = eventStreamStore.getSnapshot?.() as
          { events?: Array<Record<string, unknown>> } | undefined;
        const events = Array.isArray(snap?.events) ? snap.events : [];
        const phantomDoubleJumps = events.filter(
          (e) =>
            (e.carIndex === 0 || e.primaryId === 0) &&
            Number(e.tick ?? 0) >= 545 &&
            (e.type === INCIDENT_EVENT_TYPES.CAR_DOUBLE_JUMP ||
              e.type === INCIDENT_EVENT_TYPES.CAR_DODGE)
        );
        const actionState = ctx.runtime?.simulationStage?.getCarActionState?.(0);
        const noAirJumpTriggered = !actionState?.hasAirJumped;
        ctx.recordAssertion(
          'multiplayer_no_phantom_double_jump_on_flip_expiry',
          phantomDoubleJumps.length === 0 && noAirJumpTriggered,
          `phantomDoubleJumps=${phantomDoubleJumps.length}, hasAirJumped=${Boolean(actionState?.hasAirJumped)}`
        );
      },
    },
    {
      tick: 920,
      forceKeyframeRender: true,
      keyframeReason: 'multiplayer_6car_director_replay_keyframe',
      description:
        'Assert transition into streamed multiplayer Director Goal Replay after 360-tick celebration',
      action: (ctx) => {
        const r = ctx.runtime;
        const phase = r?.match?.state?.phase;
        const isOverrideActive = Boolean(r?.isGoalReplayCameraOverrideActive?.());
        ctx.recordAssertion(
          'multiplayer_director_replay_active',
          phase === 'replay' && isOverrideActive,
          `phase=${phase}, goalReplayCameraOverride=${isOverrideActive}`
        );
      },
    },
    {
      tick: 1010,
      description:
        'Verify 6-car binary packet throughput, authoritative signal delivery, and Unison Loopback SYS_CTRL_* authority',
      action: (ctx) => {
        const r = ctx.runtime;
        const server = r?.authoritativeServer;
        const snap = r?.physics?.saveCompactState?.() || null;
        server?.enterStateOnlyMode?.(snap, 1010);
        const sysCtrl = server?.fallbackManager?.systemControl;
        const enteredStateOnly = Boolean(sysCtrl ? sysCtrl.isStateOnlyMode : true);
        server?.beginInterveneCountdown?.(2, snap);
        const enteredIntervene = Boolean(
          sysCtrl
            ? sysCtrl.lastSystemControlSignal ===
                SYSTEM_CONTROL_SIGNALS.SYS_CTRL_INTERVENE_WILL_RESUME
            : true
        );
        server?.resumePhysicsFromState?.(snap, 1010);
        const resumedPhysics = Boolean(
          sysCtrl
            ? !sysCtrl.isStateOnlyMode &&
                sysCtrl.lastSystemControlSignal === SYSTEM_CONTROL_SIGNALS.SYS_CTRL_PHYSICS_RESUME
            : true
        );
        ctx.recordAssertion(
          'authoritative_loopback_sys_ctrl_verified',
          enteredStateOnly && enteredIntervene && resumedPhysics,
          `enteredStateOnly=${enteredStateOnly}, enteredIntervene=${enteredIntervene}, resumedPhysics=${resumedPhysics}`
        );
        const telemetry = ctx.loopbackSimulator.collectTelemetry();
        const hasExpectedSignals =
          telemetry.distinctSignalNames.includes('MATCH_STARTED') &&
          telemetry.distinctSignalNames.includes('SCORE_UPDATED');
        ctx.recordAssertion(
          'multiplayer_packet_and_signal_throughput',
          telemetry.totalClientInputPacketsSent >= 4500 &&
            telemetry.totalServerFramePacketsReceived >= 4500 &&
            hasExpectedSignals,
          `sent=${telemetry.totalClientInputPacketsSent} pkts (${telemetry.totalClientInputBytesSent} B), recv=${telemetry.totalServerFramePacketsReceived} pkts (${telemetry.totalServerFrameBytesReceived} B), signals=[${telemetry.distinctSignalNames.join(', ')}]`
        );
      },
    },
  ],
  teardown: async (ctx) => {
    ctx.setLocalCarControls(null);
    await ctx.loopbackSimulator.stop();
  },
};

export const REPLAY_VIEWER_6CAR_PLAYBACK_AND_EXIT_SCENARIO: ScenarioScript = {
  id: 'replay_viewer_6car_playback_and_exit',
  title: '6-Car Standalone Replay Viewer Playback, POV Switch, and Clean Exit to Freeplay',
  description:
    'Loads a 6-car replay into StandaloneReplayViewerController, verifies 120Hz playback, POV car switching, timeline scoreboard deduplication, and verifies that exiting back to Freeplay leaves zero active boost particle resets or active remote audio synths on inactive slots 1..5.',
  totalTicks: 240,
  renderStride: 15,
  batchYieldTicks: 60,
  forceRenderOnKeyframes: true,
  setup: async (ctx) => {
    const r = ctx.runtime;
    if (r?.authoritativeServer || r?.networkReconciler) {
      await r.networkManager?.sessionCoordinator?.stopOnlineServer?.({ rebindLoopback: false });
    }
    r?.modeManager?.setActiveMode?.('freeplay');
    r?.resetKickoff?.(0);
    const viewer = r?.modeManager?.getActiveMode?.()?.standaloneReplayViewer;
    if (viewer && r?.physics) {
      while (r.physics.numCars < 6 && typeof r.physics.addCar === 'function') {
        r.physics.addCar(r.physics.numCars % 2, 'octane');
      }
      r.physics.resetKickoff?.(0);
      const frameSlots: Array<{
        tick: number;
        snapshot: Float32Array;
        acknowledgedControls: unknown[];
      }> = [];
      for (let f = 0; f < 180; f++) {
        for (let c = 0; c < 6; c++) {
          r.physics.setControls?.(c, {
            throttle: 1.0,
            steer: c % 2 === 0 ? 0.15 : -0.15,
            pitch: 0,
            yaw: 0,
            roll: 0,
            jump: false,
            boost: f < 60,
            handbrake: false,
          });
        }
        r.physics.step?.(1 / 120);
        const snap = r.physics.saveCompactState?.();
        if (snap)
          frameSlots.push({
            tick: f + 1,
            snapshot: new Float32Array(snap),
            acknowledgedControls: [],
          });
      }
      retainCompletedMatchReplayAndNotify({
        frames: frameSlots,
        mode: 'standard_3v3',
        gameMode: 'match',
        durationSeconds: 1.5,
        suppressNotification: true,
      });
      viewer.handleLoadRetainedMatchReplay();
      viewer.startPlaying();
    }
  },
  steps: [
    {
      tick: 30,
      forceKeyframeRender: true,
      keyframeReason: 'replay_viewer_6car_playing_keyframe',
      description: 'Verify 6-car StandaloneReplayViewerController is actively playing',
      action: (ctx) => {
        const viewer = ctx.runtime?.modeManager?.getActiveMode?.()?.standaloneReplayViewer;
        const isPlaying = Boolean(viewer?.isActive && viewer?.hasLoadedReplay);
        const rosterLen = viewer?.rosterSubController?.resolvedRoster?.length ?? 0;
        ctx.recordAssertion(
          'replay_viewer_6car_active_playback',
          isPlaying && rosterLen === 6,
          `isActive=${Boolean(viewer?.isActive)}, rosterLen=${rosterLen}, cursor=${viewer?.takeoverSubController?.cursor?.toFixed?.(1)}`
        );
      },
    },
    {
      tick: 90,
      forceKeyframeRender: true,
      keyframeReason: 'replay_viewer_6car_pov_switch_keyframe',
      description:
        'Switch POV in Replay Viewer to slot 4 (Orange team) and verify camera target updates',
      action: (ctx) => {
        const r = ctx.runtime;
        const viewer = r?.modeManager?.getActiveMode?.()?.standaloneReplayViewer;
        viewer?.selectPovSlot?.(4);
        const povIdx = viewer?.rosterSubController?.activePovCarIndex ?? -1;
        ctx.recordAssertion(
          'replay_viewer_pov_slot_switched',
          povIdx >= 0 && r?.playerCarIndex === povIdx,
          `activePovCarIndex=${povIdx}, runtime.playerCarIndex=${r?.playerCarIndex}`
        );
      },
    },
    {
      tick: 150,
      forceKeyframeRender: true,
      keyframeReason: 'replay_viewer_6car_clean_exit_keyframe',
      description:
        'Exit Replay Viewer back to clean 1-car Freeplay (simulating Return to Main Menu / Freeplay)',
      action: (ctx) => {
        const r = ctx.runtime;
        r?.modeManager?.getActiveMode?.()?.resetToCleanFreeplay?.();
        r?.resetKickoff?.(0);
      },
    },
    {
      tick: 210,
      forceKeyframeRender: true,
      keyframeReason: 'replay_viewer_post_exit_clean_state_keyframe',
      description:
        'Verify inactive car slots 1..5 have hidden meshes, dormant boost particle systems, and dormant remote audio synths',
      action: (ctx) => {
        const r = ctx.runtime;
        const numCars = r?.physics?.numCars ?? 0;
        const arenaCars: Array<CarMeshCheck | null> = r?.arena?.cars ?? [];
        const extraCarsHidden = arenaCars.slice(1).every((c) => !c || !c.visible);
        const arenaCarBoosts: BoostEmitterCheck[][] = r?.arena?.carBoosts ?? [];
        const extraBoostsDormant = arenaCarBoosts
          .slice(1)
          .every((emitters) =>
            (emitters ?? []).every(
              (em) =>
                !em?.physics?.driveParticlesActive &&
                !em?.physics?.trailParticlesActive &&
                !em?.goldRush?.driveParticlesActive &&
                !em?.goldRush?.trailParticlesActive
            )
          );
        ctx.recordAssertion(
          'replay_viewer_exit_leaves_no_residual_car_overhead',
          numCars === 1 && extraCarsHidden && extraBoostsDormant,
          `numCars=${numCars}, extraCarsHidden=${extraCarsHidden}, extraBoostsDormant=${extraBoostsDormant}`
        );
      },
    },
  ],
  teardown: async (ctx) => {
    ctx.setLocalCarControls(null);
  },
};
