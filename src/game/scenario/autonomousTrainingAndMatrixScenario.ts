/**
 * autonomousTrainingAndMatrixScenario.ts
 * Autonomous E2E verification scenarios for:
 * 1. training_session_fifo_and_sys_ctrl_e2e:
 *    Multiplayer-derived Training Session with 60s/90s rolling COUNTUP_FIFO ReplayRingBuffer,
 *    master-slave physics authority control signals (SYS_CTRL_STATE_ONLY 0xA0,
 *    SYS_CTRL_INTERVENE_WILL_RESUME 0xA1, SYS_CTRL_PHYSICS_RESUME 0xA2), training goal
 *    BALL_RESET, disableGoalReset ruleset toggle, and full replay export.
 * 2. roster_combinations_matrix_exploration:
 *    Team roster matrix exploration (1v0, 1v1, 1v2, 2v1, 1v3, 3v1, 2v3, 3v3) across
 *    botFillMode policies (no_bots, auto_fill, custom), verifying active car counts,
 *    spawn slot uniqueness, and finite physics state.
 */

import { ensureExperimentalEngine } from '../../ai/experimental/ExperimentalBotAgent.ts';
import { SYSTEM_CONTROL_SIGNALS } from '../../physics/RocketSimConstants.ts';
import { REPLAY_BUFFER_MODES } from '../../replay/ReplayRingBuffer.ts';
import type {
  ScenarioAuthoritativeServerPort,
  ScenarioScript,
  VirtualPeerLoadoutSpec,
} from './ScenarioTypes.ts';

const TRAINING_SLAVE_PEER: readonly VirtualPeerLoadoutSpec[] = Object.freeze([
  {
    peerId: 'peer_slave_1',
    playerName: 'SlaveClient_Insidio',
    carIndex: 1,
    team: 1,
    visualId: 'insidio',
    hitboxId: 'hitbox-hybrid',
    colorSlot: 5,
    paintFinish: 'metallic',
    boostVisual: 'gold-rush',
    boostAudio: 'standard',
  },
]);

export const TRAINING_SESSION_FIFO_AND_SYS_CTRL_E2E_SCENARIO: ScenarioScript = {
  id: 'training_session_fifo_and_sys_ctrl_e2e',
  title: 'Multiplayer Training Session: 60s/90s FIFO RingBuffer & Master/Slave SYS_CTRL Authority',
  description:
    'Verifies multiplayer-derived Training Session: 60s (7200) and 90s (10800) COUNTUP_FIFO ReplayRingBuffer, master-to-slave SYS_CTRL_STATE_ONLY (0xA0) / SYS_CTRL_INTERVENE_WILL_RESUME (0xA1) / SYS_CTRL_PHYSICS_RESUME (0xA2), goal BALL_RESET, disableGoalReset, and manual replay export.',
  totalTicks: 420,
  renderStride: 20,
  batchYieldTicks: 60,
  forceRenderOnKeyframes: true,
  setup: async (ctx) => {
    const netMgr = ctx.runtime?.networkManager;
    if (!netMgr?.sessionCoordinator?.hostOnlineServer) {
      throw new Error('[training_session_fifo_and_sys_ctrl_e2e] networkManager unavailable');
    }
    await netMgr.sessionCoordinator.hostOnlineServer({
      playerName: 'Trainer_Host_Fennec',
      visualId: 'fennec',
      hitboxId: 'hitbox-octane',
      colorSlot: 0,
      paintFinish: 'metallic',
      boostVisual: 'gold-rush',
      boostAudio: 'rush',
      gameMode: '2v2',
      botFillMode: 'no_bots',
      durationSeconds: 0,
      lobbyMode: true,
      skipReplayByDefault: true,
      forceFallback: true,
      roomId: 'e2e_training_sys_ctrl',
    });
    await ctx.loopbackSimulator.connectVirtualPeers?.(TRAINING_SLAVE_PEER);
    ctx.setLocalCarControls({ throttle: 1.0, boost: true });
  },
  steps: [
    {
      tick: 10,
      forceKeyframeRender: true,
      keyframeReason: 'training_start_60s_and_90s_fifo',
      description:
        'Start authoritative Training Mode with 60s (7200) then 90s (10800) COUNTUP_FIFO ring buffer',
      action: (ctx) => {
        const server = ctx.runtime?.authoritativeServer;
        const fm = server?.fallbackManager;
        server?.startTrainingMode?.({
          fifoDurationSeconds: 60,
          unlimitedBoost: true,
          goalReplayEnabled: false,
          goalCelebrationTicks: 30,
          resetKickoff: true,
        });
        const cap60 = fm?.replayBuffer?.capacity ?? 0;
        const mode60 = fm?.replayBuffer?.mode ?? '';
        server?.startTrainingMode?.({
          fifoDurationSeconds: 90,
          unlimitedBoost: true,
          goalReplayEnabled: false,
          goalCelebrationTicks: 30,
          resetKickoff: false,
        });
        const cap90 = fm?.replayBuffer?.capacity ?? 0;
        const isTraining = Boolean(fm?.domain?.isTrainingMode);
        ctx.recordAssertion(
          'training_fifo_60s_and_90s_capacity_verified',
          isTraining &&
            mode60 === REPLAY_BUFFER_MODES.COUNTUP_FIFO &&
            cap60 === 7200 &&
            cap90 === 10800,
          `isTraining=${isTraining}, mode=${mode60}, cap60=${cap60}, cap90=${cap90}`
        );
      },
    },
    {
      tick: 60,
      forceKeyframeRender: true,
      keyframeReason: 'training_sys_ctrl_state_only_0xa0',
      description:
        'Enter SYS_CTRL_STATE_ONLY (0xA0) on server and verify state-only authority freeze',
      action: (ctx) => {
        const r = ctx.runtime;
        const server = r?.authoritativeServer;
        const fm = server?.fallbackManager;
        const snap = r?.physics?.saveCompactState?.() || null;
        server?.enterStateOnlyMode?.(snap, 60);
        const stateOnly = Boolean(fm?.domain?.stateOnlyMode);
        const sig = fm?.systemControl?.lastSystemControlSignal;
        ctx.recordAssertion(
          'training_sys_ctrl_state_only_active',
          stateOnly && sig === SYSTEM_CONTROL_SIGNALS.SYS_CTRL_STATE_ONLY,
          `stateOnly=${stateOnly}, sig=0x${(sig || 0).toString(16)}`
        );
      },
    },
    {
      tick: 95,
      forceKeyframeRender: true,
      keyframeReason: 'training_sys_ctrl_intervene_0xa1',
      description:
        'Verify slave received SYS_CTRL_STATE_ONLY, then trigger SYS_CTRL_INTERVENE_WILL_RESUME (0xA1)',
      action: (ctx) => {
        const r = ctx.runtime;
        const server = r?.authoritativeServer;
        const fm = server?.fallbackManager;
        const snap = r?.physics?.saveCompactState?.() || null;
        const sigs = ctx.loopbackSimulator.collectTelemetry().distinctSignalNames;
        const slaveGotStateOnly = sigs.includes('SYS_CTRL_STATE_ONLY');
        server?.beginInterveneCountdown?.(1, snap);
        const sig = fm?.systemControl?.lastSystemControlSignal;
        const target = fm?.domain?.interveneTargetTick ?? -1;
        ctx.recordAssertion(
          'training_sys_ctrl_intervene_countdown_active',
          slaveGotStateOnly &&
            sig === SYSTEM_CONTROL_SIGNALS.SYS_CTRL_INTERVENE_WILL_RESUME &&
            target > 60,
          `slaveGotStateOnly=${slaveGotStateOnly}, sig=0x${(sig || 0).toString(16)}, target=${target}`
        );
      },
    },
    {
      tick: 130,
      forceKeyframeRender: true,
      keyframeReason: 'training_sys_ctrl_physics_resume_0xa2',
      description:
        'Trigger SYS_CTRL_PHYSICS_RESUME (0xA2) and verify live physics stepping resumes',
      action: (ctx) => {
        const r = ctx.runtime;
        const server = r?.authoritativeServer;
        const fm = server?.fallbackManager;
        const snap = r?.physics?.saveCompactState?.() || null;
        server?.resumePhysicsFromState?.(snap, 130);
        const stateOnly = Boolean(fm?.domain?.stateOnlyMode);
        const sig = fm?.systemControl?.lastSystemControlSignal;
        ctx.recordAssertion(
          'training_sys_ctrl_physics_resumed',
          !stateOnly && sig === SYSTEM_CONTROL_SIGNALS.SYS_CTRL_PHYSICS_RESUME,
          `stateOnly=${stateOnly}, sig=0x${(sig || 0).toString(16)}`
        );
      },
    },
    {
      tick: 170,
      description: 'Verify slave decoded all 3 SYS_CTRL_* signals, then shoot ball into goal',
      action: (ctx) => {
        const sigs = ctx.loopbackSimulator.collectTelemetry().distinctSignalNames;
        const hasAll =
          sigs.includes('SYS_CTRL_STATE_ONLY') &&
          (sigs.includes('SYS_CTRL_TAKEOVER_COUNTDOWN') ||
            sigs.includes('SYS_CTRL_INTERVENE_WILL_RESUME')) &&
          sigs.includes('SYS_CTRL_PHYSICS_RESUME');
        ctx.recordAssertion(
          'training_slave_peer_decoded_all_sys_ctrl_signals',
          hasAll,
          `sigs=[${sigs.join(', ')}]`
        );
        ctx.setBallState({ pos: [0, 4850, 95], vel: [0, 2950, 30], angVel: [0, 0, 0] });
      },
    },
    {
      tick: 250,
      forceKeyframeRender: true,
      keyframeReason: 'training_goal_reset_and_export',
      description:
        'Verify BALL_RESET completed, toggle disableGoalReset=true, and test manual replay export',
      action: async (ctx) => {
        const server = ctx.runtime?.authoritativeServer;
        const fm = server?.fallbackManager;
        const hadReset = ctx.loopbackSimulator
          .collectTelemetry()
          .distinctSignalNames.includes('BALL_RESET');
        server?.configureTrainingRuleset?.({ disableGoalReset: true, unlimitedBoost: true });
        const rulesetOk = Boolean(fm?.domain?.trainingDisableGoalReset);
        const exp = await server?.requestFullReplayExport?.();
        const frameCount = exp?.frameCount ?? exp?.frames?.length ?? fm?.replayBuffer?.size ?? 0;
        const hasFrames = frameCount > 50;
        ctx.recordAssertion(
          'training_ball_reset_ruleset_and_replay_export_verified',
          hadReset && rulesetOk && hasFrames,
          `hadReset=${hadReset}, disableGoalReset=${rulesetOk}, exportedFrameCount=${frameCount}`
        );
      },
    },
  ],
  teardown: async (ctx) => {
    ctx.setLocalCarControls(null);
    await ctx.loopbackSimulator.stop();
  },
};

function resetToHostOnly(server: ScenarioAuthoritativeServerPort): void {
  const fm = server.fallbackManager;
  if (!fm?.roster?.players) return;
  for (const [sid] of Array.from(fm.roster.players.entries())) {
    if (sid !== 'host') fm.removePlayerSession(sid);
  }
}

function syncSpawns(server: ScenarioAuthoritativeServerPort): void {
  const fm = server.fallbackManager;
  if (!fm) return;
  fm.roster.syncRosterPhysicsEntities();
  fm.roster.applyRosterKickoffSpawns();
}

interface RosterMatrixCase {
  tick: number;
  label: string;
  expectedBlue: number;
  expectedOrange: number;
  configure: (server: ScenarioAuthoritativeServerPort) => void;
}

const ROSTER_MATRIX_CASES: readonly RosterMatrixCase[] = Object.freeze([
  {
    tick: 15,
    label: '1v0_solo_no_bots',
    expectedBlue: 1,
    expectedOrange: 0,
    configure: (s) => {
      s.setGameMode?.('1v1', 300);
      s.setBotFillMode?.('no_bots');
      resetToHostOnly(s);
      s.fallbackManager?.roster.applyBotFillPolicy();
      syncSpawns(s);
    },
  },
  {
    tick: 60,
    label: '1v1_auto_fill_heuristic',
    expectedBlue: 1,
    expectedOrange: 1,
    configure: (s) => {
      s.setGameMode?.('1v1', 300);
      s.setBotFillMode?.('auto_fill');
      s.fallbackManager?.roster.applyBotFillPolicy();
      syncSpawns(s);
    },
  },
  {
    tick: 105,
    label: '1v2_asymmetric_custom_bots',
    expectedBlue: 1,
    expectedOrange: 2,
    configure: (s) => {
      s.setGameMode?.('3v3', 300);
      s.setBotFillMode?.('custom');
      resetToHostOnly(s);
      s.addBotPlayer?.(1, 'Bot_1v2_A', 'octane', 'heuristic');
      s.addBotPlayer?.(1, 'Bot_1v2_B', 'fennec', 'ducky');
      syncSpawns(s);
    },
  },
  {
    tick: 150,
    label: '2v1_asymmetric_custom_bots',
    expectedBlue: 2,
    expectedOrange: 1,
    configure: (s) => {
      resetToHostOnly(s);
      s.addBotPlayer?.(0, 'Bot_2v1_Blue', 'ryza', 'ducky');
      s.addBotPlayer?.(1, 'Bot_2v1_Orange', 'insidio', 'heuristic');
      syncSpawns(s);
    },
  },
  {
    tick: 195,
    label: '1v3_asymmetric_challenge',
    expectedBlue: 1,
    expectedOrange: 3,
    configure: (s) => {
      resetToHostOnly(s);
      s.addBotPlayer?.(1, 'Bot_1v3_1', 'octane', 'ducky');
      s.addBotPlayer?.(1, 'Bot_1v3_2', 'fennec', 'ducky');
      s.addBotPlayer?.(1, 'Bot_1v3_3', 'hitbox-plank', 'heuristic');
      syncSpawns(s);
    },
  },
  {
    tick: 240,
    label: '3v1_asymmetric_powerplay',
    expectedBlue: 3,
    expectedOrange: 1,
    configure: (s) => {
      resetToHostOnly(s);
      s.addBotPlayer?.(0, 'Bot_3v1_B2', 'octane', 'ducky');
      s.addBotPlayer?.(0, 'Bot_3v1_B3', 'fennec', 'heuristic');
      s.addBotPlayer?.(1, 'Bot_3v1_O1', 'hitbox-merc', 'ducky');
      syncSpawns(s);
    },
  },
  {
    tick: 285,
    label: '2v3_asymmetric_five_car',
    expectedBlue: 2,
    expectedOrange: 3,
    configure: (s) => {
      resetToHostOnly(s);
      s.addBotPlayer?.(0, 'Bot_2v3_B2', 'octane', 'ducky');
      s.addBotPlayer?.(1, 'Bot_2v3_O1', 'fennec', 'ducky');
      s.addBotPlayer?.(1, 'Bot_2v3_O2', 'insidio', 'heuristic');
      s.addBotPlayer?.(1, 'Bot_2v3_O3', 'ryza', 'ducky');
      syncSpawns(s);
    },
  },
  {
    tick: 330,
    label: '3v3_full_auto_fill_six_car',
    expectedBlue: 3,
    expectedOrange: 3,
    configure: (s) => {
      resetToHostOnly(s);
      s.setGameMode?.('3v3', 300);
      s.setBotFillMode?.('auto_fill');
      s.fallbackManager?.roster.applyBotFillPolicy();
      syncSpawns(s);
    },
  },
]);

export const ROSTER_COMBINATIONS_MATRIX_EXPLORATION_SCENARIO: ScenarioScript = {
  id: 'roster_combinations_matrix_exploration',
  title: 'Team Size & Bot Policy Matrix Exploration (1v0, 1v1, 1v2, 2v1, 1v3, 3v1, 2v3, 3v3)',
  description:
    'Transitions an active match across 8 team configurations (1v0, 1v1, 1v2, 2v1, 1v3, 3v1, 2v3, 3v3) and bot fill policies, verifying active car counts, spawn slot uniqueness, and finite physics state.',
  totalTicks: 390,
  renderStride: 20,
  batchYieldTicks: 60,
  forceRenderOnKeyframes: true,
  setup: async (ctx) => {
    await ensureExperimentalEngine('ducky');
    await ensureExperimentalEngine('heuristic');
    await ctx.runtime?.networkManager?.sessionCoordinator?.hostOnlineServer?.({
      playerName: 'Matrix_Host',
      visualId: 'fennec',
      hitboxId: 'hitbox-octane',
      colorSlot: 0,
      paintFinish: 'metallic',
      boostVisual: 'gold-rush',
      boostAudio: 'rush',
      gameMode: '3v3',
      botFillMode: 'no_bots',
      durationSeconds: 300,
      lobbyMode: false,
      skipReplayByDefault: true,
      forceFallback: true,
      roomId: 'e2e_roster_matrix',
    });
    ctx.setLocalCarControls({ throttle: 1.0, steer: 0.1, boost: true });
  },
  steps: ROSTER_MATRIX_CASES.map((mc) => ({
    tick: mc.tick,
    forceKeyframeRender: true,
    keyframeReason: `matrix_${mc.label}`,
    description: `Verify ${mc.label} (${mc.expectedBlue}v${mc.expectedOrange}) roster and physics`,
    action: (ctx) => {
      const server = ctx.runtime?.authoritativeServer;
      const fm = server?.fallbackManager;
      if (!server || !fm) {
        ctx.recordAssertion(`matrix_${mc.label}`, false, 'Server unavailable');
        return;
      }
      mc.configure(server);
      server.onRoomStateChange?.(fm.buildRosterSnapshot());
      const players = Array.from(fm.roster.players.values());
      const blue = players.filter((p) => p.team === 0);
      const orange = players.filter((p) => p.team === 1);
      const uniqueSpawns =
        new Set(blue.map((p) => p.spawnSlot)).size === blue.length &&
        new Set(orange.map((p) => p.spawnSlot)).size === orange.length;
      let finitePos = true;
      for (const p of players) {
        const cv = fm.physicsManager?.sim?.getCarStateView?.(p.entityId);
        if (
          !cv ||
          !Number.isFinite(cv.posX) ||
          !Number.isFinite(cv.posY) ||
          !Number.isFinite(cv.posZ)
        ) {
          finitePos = false;
        }
      }
      const passed =
        players.length === mc.expectedBlue + mc.expectedOrange &&
        blue.length === mc.expectedBlue &&
        orange.length === mc.expectedOrange &&
        uniqueSpawns &&
        finitePos;
      ctx.recordAssertion(
        `matrix_${mc.label}`,
        passed,
        `expected=${mc.expectedBlue}v${mc.expectedOrange}, actual=${blue.length}v${orange.length}, uniqueSpawns=${uniqueSpawns}, finitePos=${finitePos}`
      );
    },
  })),
  teardown: async (ctx) => {
    ctx.setLocalCarControls(null);
    await ctx.loopbackSimulator.stop();
  },
};
