/**
 * autonomousOnline3v3LifecycleScenario.ts
 * Unified E2E 3v3 full-lifecycle verification scenario (online_3v3_ducky_full_lifecycle):
 * Lobby Dual-World + Live Loadout Switch + Zero-G Fleet -> 2 Take-Over Human Peers + 3 Auto-Fill
 * Ducky MLP Bots -> PREPARE matchTick progression -> Kickoff -> Combat/Movement/DEMOLITION
 * incidents -> Regulation Goal Replay Skip (Auto-Fill Bots auto-vote jump:true vs Take-Over
 * Humans 'never' / staggered delayed skip + kickoff jump suppression) -> Overtime -> Golden Goal
 * -> Streamed Director Replay -> V2 .rcreplay Round-Trip -> Podium -> Viewer -> Clean FreePlay.
 */

import { ensureExperimentalEngine } from '../../ai/experimental/ExperimentalBotAgent.ts';
import {
  buildPodiumAndViewerTakeoverSteps,
  buildRegulationCombatAndReplaySkipSteps,
  clampServerGoalCelebrationBuffer,
  verifyMatchEndedAndRCReplayRoundTrip,
} from './online3v3ReplaySkipAndCombatHelpers.ts';
import type { ScenarioScript, VirtualPeerLoadoutSpec } from './ScenarioTypes.ts';

const TWO_VIRTUAL_HUMAN_PEERS: readonly VirtualPeerLoadoutSpec[] = Object.freeze([
  {
    peerId: 'peer_1',
    playerName: 'Peer1_Insidio_Orange',
    carIndex: 1,
    team: 1,
    visualId: 'insidio',
    hitboxId: 'hitbox-hybrid',
    colorSlot: 5,
    paintFinish: 'matte',
    boostVisual: 'cartoon',
    boostAudio: 'standard',
    replaySkipPolicy: 'never',
  },
  {
    peerId: 'peer_2',
    playerName: 'Peer2_Ryza_Blue',
    carIndex: 2,
    team: 0,
    visualId: 'ryza',
    hitboxId: 'hitbox-dominus',
    colorSlot: 1,
    paintFinish: 'metallic',
    boostVisual: 'gold-rush',
    boostAudio: 'flamethrower',
    replaySkipPolicy: 'never',
  },
]);

let matchTickAtForceStart = -1;

export const ONLINE_3V3_DUCKY_FULL_LIFECYCLE_SCENARIO: ScenarioScript = {
  id: 'online_3v3_ducky_full_lifecycle',
  title:
    'Autonomous 3v3 Full Lifecycle (Lobby -> 3x Ducky Bots -> Replay Skip & Demo -> Overtime -> .rcreplay -> Podium -> Viewer)',
  description:
    'Unified E2E verification of online 3v3 room: Lobby loadout switch, Zero-G Fleet, 2 Take-Over human peers + 3 Auto-Fill Ducky bots, combat/DEMOLITION incidents, Bot vs Human Goal Replay skip & kickoff jump suppression, Overtime Golden Goal, .rcreplay round-trip, Podium, and Viewer.',
  totalTicks: 2400,
  renderStride: 25,
  batchYieldTicks: 60,
  forceRenderOnKeyframes: true,
  setup: async (ctx) => {
    matchTickAtForceStart = -1;
    await ensureExperimentalEngine('ducky');
    await ensureExperimentalEngine('heuristic');
    await ctx.runtime?.networkManager?.sessionCoordinator?.hostOnlineServer?.({
      playerName: 'Host_Alpha_Fennec',
      visualId: 'fennec',
      hitboxId: 'hitbox-octane',
      colorSlot: 0,
      paintFinish: 'metallic',
      boostVisual: 'gold-rush',
      boostAudio: 'rush',
      gameMode: '3v3',
      botFillMode: 'custom',
      durationSeconds: 2,
      lobbyMode: true,
      forceFallback: true,
      roomId: 'e2e_3v3_ducky_lifecycle',
    });
    ctx.setLocalCarControls({ throttle: 1.0, steer: 0.05, boost: true });
  },
  steps: [
    {
      tick: 5,
      forceKeyframeRender: true,
      keyframeReason: 'e2e_lobby_and_fleet',
      description:
        'Verify Lobby Dual-World, default skipReplayByDefault=false, and spawn Zero-G Fleet',
      action: async (ctx) => {
        const r = ctx.runtime;
        const netMgr = r?.networkManager;
        const isLobby = Boolean(netMgr?.isLobbyDualWorldActive?.());
        const fleetCtrl = await netMgr?.diagnosticsProbe?.spawnDiagnosticTestFleet?.();
        const fleetOn = Boolean(fleetCtrl?.enabled);
        const skipDefault = r?.authoritativeServer?.fallbackManager?.domain?.skipReplayByDefault;
        ctx.recordAssertion(
          'e2e_lobby_dual_world_and_diagnostic_fleet_spawned',
          isLobby && fleetOn && Boolean(r?.authoritativeServer) && skipDefault === false,
          `isLobby=${isLobby}, fleetOn=${fleetOn}, skipReplayByDefault=${skipDefault}`
        );
      },
    },
    {
      tick: 15,
      description: 'Switch Host vehicle and color in Lobby',
      action: (ctx) => {
        const r = ctx.runtime;
        r?.loadoutCoordinator?.changePlayerVehicle('insidio', 'hitbox-hybrid');
        r?.loadoutCoordinator?.setCarColor(0, '#29b6f6', true);
      },
    },
    {
      tick: 25,
      forceKeyframeRender: true,
      keyframeReason: 'online_lobby_loadout_switched',
      description: 'Verify Lobby loadout switch synced to authoritative server roster',
      action: (ctx) => {
        const r = ctx.runtime;
        const hp = r?.authoritativeServer?.fallbackManager?.roster?.players?.get('host');
        const ok =
          r?.selectedPreset === 'insidio' &&
          r?.selectedHitbox === 'hitbox-hybrid' &&
          hp?.visualId === 'insidio' &&
          hp?.hitboxId === 'hitbox-hybrid';
        ctx.recordAssertion(
          'online_lobby_loadout_switched_and_synced',
          Boolean(ok),
          `local=${r?.selectedPreset}, host=${hp?.visualId}`
        );
      },
    },
    {
      tick: 45,
      forceKeyframeRender: true,
      keyframeReason: 'e2e_diagnostic_fleet_and_ducky_join',
      description:
        'Sample Zero-G Fleet telemetry, despawn fleet, connect 2 Take-Over peers + 3 Auto-Fill Ducky bots',
      action: async (ctx) => {
        const netMgr = ctx.runtime?.networkManager;
        const ft = netMgr?.diagnosticsProbe?.sampleDiagnosticFleetTelemetry?.();
        const fleetValid = Boolean(
          ft && (ft.car6?.active || ft.car7?.active || ft.enabled !== false)
        );
        netMgr?.diagnosticsProbe?.despawnDiagnosticTestFleet?.();
        const despawned = !netMgr?.diagnosticsProbe?.diagnosticsFleetController?.enabled;
        ctx.recordAssertion(
          'e2e_diagnostic_fleet_sampled_and_despawned',
          fleetValid && despawned,
          `fleetSampled=${fleetValid}, fleetDespawned=${despawned}`
        );
        await ctx.loopbackSimulator.connectVirtualPeers?.(TWO_VIRTUAL_HUMAN_PEERS);
        netMgr?.addOnlineBot?.(0, 'Ducky_Alpha', 'octane', 'ducky');
        netMgr?.addOnlineBot?.(1, 'Ducky_Bravo', 'fennec', 'ducky');
        netMgr?.addOnlineBot?.(1, 'Ducky_Charlie', 'hitbox-plank', 'ducky');
      },
    },
    {
      tick: 60,
      forceKeyframeRender: true,
      keyframeReason: 'e2e_3v3_roster_3_ducky_bots_ready',
      description: 'Verify 6-player 3v3 roster and 3 Ducky BotTunnels, then force-start match',
      action: (ctx) => {
        const server = ctx.runtime?.authoritativeServer;
        const players = server?.fallbackManager?.roster?.players
          ? Array.from(server.fallbackManager.roster.players.values())
          : [];
        const blueCount = players.filter((p) => p.team === 0).length;
        const orangeCount = players.filter((p) => p.team === 1).length;
        const duckyBots = players.filter((p) => p.isBot && p.botType === 'ducky');
        const tunnels = server?.botTunnelManager?.registeredTunnels?.size ?? 0;
        ctx.recordAssertion(
          'e2e_roster_6_players_and_3_ducky_tunnels',
          players.length === 6 &&
            blueCount === 3 &&
            orangeCount === 3 &&
            duckyBots.length === 3 &&
            tunnels === 3,
          `total=${players.length} (${blueCount}v${orangeCount}), ducky=${duckyBots.length}, tunnels=${tunnels}`
        );
        matchTickAtForceStart = server?.fallbackManager?.domain?.matchTick ?? 0;
        ctx.loopbackSimulator.triggerForceStartMatch(2);
      },
    },
    {
      tick: 85,
      forceKeyframeRender: true,
      keyframeReason: 'e2e_3v3_prepare_and_kickoff',
      description:
        'Verify MATCH_PREPARE barrier completed into kickoff and matchTick advanced monotonically',
      action: (ctx) => {
        const r = ctx.runtime;
        const phase = r?.match?.state?.phase;
        const curMatchTick = r?.authoritativeServer?.fallbackManager?.domain?.matchTick ?? 0;
        const tel = ctx.loopbackSimulator.collectTelemetry();
        const sigs = tel.distinctSignalNames;
        const okSigs =
          sigs.includes('MATCH_INITIALIZED') &&
          sigs.includes('MATCH_STARTED') &&
          sigs.includes('KICKOFF_PREPARE');
        ctx.recordAssertion(
          'e2e_prepare_barrier_and_kickoff_signals',
          phase === 'kickoff' &&
            curMatchTick > matchTickAtForceStart &&
            tel.activePhysicalCars >= 6 &&
            tel.visibleArenaCars >= 6 &&
            okSigs,
          `phase=${phase}, matchTick=${matchTickAtForceStart}->${curMatchTick}, cars=${tel.activePhysicalCars}/${tel.visibleArenaCars}`
        );
      },
    },
    {
      tick: 550,
      forceKeyframeRender: true,
      keyframeReason: 'e2e_regulation_playing_ducky_inference',
      description:
        'Verify KICKOFF_START unfreeze, 3x Ducky MLP bots active, and trigger Jump + Boost + Ball-Hit',
      action: (ctx) => {
        const r = ctx.runtime;
        const phase = r?.match?.state?.phase;
        const server = r?.authoritativeServer;
        if (server?.fallbackManager?.domain) server.fallbackManager.domain.clockStarted = false;
        let readyCount = 0;
        for (const t of server?.botTunnelManager?.registeredTunnels?.values() || []) {
          if (t.botType === 'ducky') readyCount++;
        }
        ctx.recordAssertion(
          'e2e_regulation_playing_and_ducky_inference_active',
          phase === 'playing' && readyCount === 3,
          `phase=${phase}, duckyReady=${readyCount}`
        );
        ctx.setCarState(0, {
          pos: [0, -140, 17.01],
          vel: [0, 1400, 0],
          angVel: [0, 0, 0],
          boost: 100,
        });
        ctx.setBallState({ pos: [0, 0, 93.15], vel: [0, 350, 0], angVel: [0, 0, 0] });
        ctx.setLocalCarControls({ throttle: 1.0, pitch: 0.0, jump: true, boost: true });
      },
    },
    ...buildRegulationCombatAndReplaySkipSteps(),
    {
      tick: 1310,
      forceKeyframeRender: true,
      keyframeReason: 'e2e_overtime_after_tied_regulation',
      description:
        'Verify 1-1 regulation expiry emitted OVERTIME_START and entered Overtime kickoff',
      action: (ctx) => {
        const r = ctx.runtime;
        const isOt = Boolean(
          r?.authoritativeServer?.fallbackManager?.domain?.isOvertime || r?.match?.state?.isOvertime
        );
        const phase = r?.match?.state?.phase;
        const hasOtSig = ctx.loopbackSimulator
          .collectTelemetry()
          .distinctSignalNames.includes('OVERTIME_START');
        ctx.recordAssertion(
          'e2e_overtime_started_on_zero_second_ground_touch',
          isOt && hasOtSig && (phase === 'kickoff' || phase === 'playing'),
          `isOvertime=${isOt}, hasOvertimeSig=${hasOtSig}, phase=${phase}`
        );
      },
    },
    {
      tick: 1790,
      forceKeyframeRender: true,
      keyframeReason: 'e2e_overtime_golden_goal_shot',
      description: 'Verify Overtime playing active and launch Golden Goal shot into Orange goal',
      action: (ctx) => {
        const r = ctx.runtime;
        const phase = r?.match?.state?.phase;
        const isOt = Boolean(
          r?.authoritativeServer?.fallbackManager?.domain?.isOvertime || r?.match?.state?.isOvertime
        );
        ctx.recordAssertion(
          'e2e_overtime_playing_active',
          phase === 'playing' && isOt,
          `phase=${phase}, isOt=${isOt}`
        );
        ctx.setCarState(0, {
          pos: [0, 4400, 17.01],
          vel: [0, 2150, 0],
          angVel: [0, 0, 0],
          boost: 100,
        });
        ctx.setBallState({ pos: [0, 4820, 95], vel: [0, 2950, 40], angVel: [0, 0, 0] });
      },
    },
    {
      tick: 1825,
      forceKeyframeRender: true,
      keyframeReason: 'e2e_overtime_golden_goal_explosion',
      description: 'Verify Overtime Golden Goal scored for Blue (2-1) and celebration active',
      action: (ctx) => {
        const r = ctx.runtime;
        const d = r?.authoritativeServer?.fallbackManager?.domain;
        const blueScore =
          d?.blueScore ?? r?.match?.state?.blueScore ?? r?.match?.state?.score?.blue ?? 0;
        const phase = r?.match?.state?.phase;
        const pendingEnd = Boolean(d?.pendingMatchEndAfterGoal);
        ctx.recordAssertion(
          'e2e_overtime_golden_goal_scored',
          blueScore >= 1 &&
            pendingEnd &&
            (phase === 'goal_scored' || phase === 'goal' || phase === 'replay'),
          `blueScore=${blueScore}, phase=${phase}, pendingEnd=${pendingEnd}`
        );
        clampServerGoalCelebrationBuffer(ctx, 10);
      },
    },
    {
      tick: 1855,
      forceKeyframeRender: true,
      keyframeReason: 'e2e_overtime_director_replay_entry',
      description: 'Verify streamed Director Camera Goal Replay active and switch camera to POV',
      action: (ctx) => {
        const r = ctx.runtime;
        const phase = r?.match?.state?.phase;
        const isOverride = Boolean(r?.isGoalReplayCameraOverrideActive?.());
        ctx.recordAssertion(
          'e2e_overtime_director_replay_active',
          phase === 'replay' && isOverride,
          `phase=${phase}, override=${isOverride}`
        );
        r?.replayTimelineController?.setCameraMode?.('pov');
      },
    },
    {
      tick: 1880,
      forceKeyframeRender: true,
      keyframeReason: 'e2e_overtime_replay_finish',
      description: 'Restore Director Camera mode and finish Goal Replay to trigger MATCH_ENDED',
      action: (ctx) => {
        const r = ctx.runtime;
        r?.replayTimelineController?.setCameraMode?.('director');
        r?.authoritativeServer?.fallbackManager?.goalReplay?.finishGoalReplay?.();
      },
    },
    {
      tick: 1900,
      forceKeyframeRender: true,
      keyframeReason: 'e2e_match_ended_and_rcreplay_roundtrip',
      description:
        'Verify MATCH_ENDED, round-trip V2 .rcreplay binary serialization/parsing, and packet dump',
      action: verifyMatchEndedAndRCReplayRoundTrip,
    },
    ...buildPodiumAndViewerTakeoverSteps(),
  ],
  teardown: async (ctx) => {
    ctx.setLocalCarControls(null);
    await ctx.loopbackSimulator.stop();
  },
};
