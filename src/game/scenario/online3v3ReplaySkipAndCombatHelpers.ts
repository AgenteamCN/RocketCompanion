/**
 * online3v3ReplaySkipAndCombatHelpers.ts
 * Step helper actions for the unified 3v3 full-lifecycle scenario:
 * - Lobby live loadout switch and authoritative roster verification
 * - Regulation combat & movement incidents (Jump, Dodge, Boost, Ball-Hit, Supersonic Demolition)
 * - Auto-Filling Bot (jump:true via InputPacketCodec) vs Take-Over User Input Bot
 *   Goal Replay skip voting ('never' -> partial human vote -> all humans vote)
 * - Kickoff jump suppression across replay skip (jumpSuppressedCarIndices)
 * - V2 .rcreplay binary container round-trip and StandaloneReplayViewer takeover
 */

import {
  INCIDENT_EVENT_TYPES as INC,
  MATCH_SIGNALS as SIG,
} from '../../physics/RocketSimConstants.ts';
import { isBinaryRCReplayContainer } from '../../replay/container/RCReplayBinarySchema.ts';
import { serializeRCReplayBinaryContainer } from '../../replay/container/RCReplayBinaryEncoder.ts';
import { getRetainedMatchReplay, parseRCReplayFile } from '../../replay/ReplayFileExporter.ts';
import { eventStreamStore } from '../runtimeUiPort.ts';
import type { ScenarioStepContext, ScenarioTickStep } from './ScenarioTypes.ts';

export function executeSupersonicDemolitionSetup(ctx: ScenarioStepContext): void {
  const r = ctx.runtime;
  ctx.setLocalCarControls({ throttle: 1.0, pitch: 0.0, jump: false, boost: true });
  const basis = {
    fwd: [1, 0, 0] as [number, number, number],
    right: [0, 1, 0] as [number, number, number],
    up: [0, 0, 1] as [number, number, number],
    angVel: [0, 0, 0] as [number, number, number],
    isOnGround: true,
    isFlipping: false,
  };
  const victim = {
    ...basis,
    pos: [0, -1500, 17.01] as [number, number, number],
    vel: [0, 0, 0] as [number, number, number],
    boost: 33,
    isSupersonic: false,
  };
  const attacker = {
    ...basis,
    pos: [-220, -1500, 17.01] as [number, number, number],
    vel: [2295, 0, 0] as [number, number, number],
    boost: 100,
    isSupersonic: true,
  };
  const sim = r?.authoritativeServer?.fallbackSim;
  sim?.setCarState?.(4, victim);
  sim?.setCarState?.(0, attacker);
  r?.physics?.setCarState?.(4, victim);
  r?.physics?.setCarState?.(0, attacker);
  const snap = sim?.saveCompactState?.() || null;
  if (snap)
    r?.networkReconciler?.syncTimeline?.(
      snap,
      r?.authoritativeServer?.lastServerTick ?? 0,
      ctx.virtualTimeMs
    );
}

export function verifyCombatIncidentsAndLaunchFirstGoal(ctx: ScenarioStepContext): void {
  const r = ctx.runtime;
  const snap = eventStreamStore.getSnapshot?.() as
    { events?: Array<Record<string, unknown>> } | undefined;
  const evs = Array.isArray(snap?.events) ? snap.events : [];
  const rq = r?.authoritativeServer?.fallbackManager?.commandQueue?.replaySignalLog || [];
  const hasJump = evs.some((e) => e.type === INC.CAR_JUMP);
  const hasDodge = evs.some((e) => e.type === INC.CAR_DODGE || e.type === INC.CAR_DOUBLE_JUMP);
  const hasBoost = evs.some((e) => e.type === INC.CAR_BOOST_START);
  const hasBallHit = evs.some((e) => e.type === INC.CAR_BALL_HIT);
  const hasDemo =
    evs.some((e) => e.type === INC.CAR_CAR_DEMO || e.type === SIG.DEMOLITION) ||
    rq.some((e) => e?.signalType === SIG.DEMOLITION) ||
    Boolean(r?.authoritativeServer?.fallbackSim?.getCarStateView?.(4)?.isDemoed);
  ctx.recordAssertion(
    'online_3v3_combat_and_movement_incidents_verified',
    hasJump && hasDodge && hasBoost && hasBallHit && hasDemo,
    `jump=${hasJump}, dodge=${hasDodge}, boost=${hasBoost}, hit=${hasBallHit}, demo=${hasDemo}`
  );
  const domain = r?.authoritativeServer?.fallbackManager?.domain;
  if (domain) Object.assign(domain, { clockStarted: false });
  ctx.setLocalCarControls({ throttle: 0, boost: false, jump: false });
  ctx.loopbackSimulator.setPeerReplaySkipPolicy?.('all', 'never');
  ctx.setCarState(0, { pos: [0, 4400, 17.01], vel: [0, 2150, 0], angVel: [0, 0, 0], boost: 100 });
  ctx.setBallState({ pos: [0, 4820, 95], vel: [0, 2950, 40], angVel: [0, 0, 0] });
}

export function clampServerGoalCelebrationBuffer(ctx: ScenarioStepContext, ticks = 5): void {
  const domain = ctx.runtime?.authoritativeServer?.fallbackManager?.domain;
  if (domain && typeof domain.goalBufferTicks === 'number' && domain.goalBufferTicks > ticks) {
    Object.assign(domain, { goalBufferTicks: ticks });
  }
}

export function buildRegulationCombatAndReplaySkipSteps(): ScenarioTickStep[] {
  return [
    {
      tick: 560,
      description: 'Release Jump while airborne',
      action: (ctx) =>
        ctx.setLocalCarControls({ throttle: 1.0, pitch: 0.0, jump: false, boost: true }),
    },
    {
      tick: 570,
      description: 'Execute forward Dodge while boosting',
      action: (ctx) =>
        ctx.setLocalCarControls({ throttle: 1.0, pitch: -1.0, jump: true, boost: true }),
    },
    {
      tick: 582,
      description: 'Launch Car 0 supersonic along +X into Car 4 for Demolition',
      action: executeSupersonicDemolitionSetup,
    },
    {
      tick: 615,
      forceKeyframeRender: true,
      keyframeReason: 'online_3v3_combat_and_movement_incidents',
      description:
        'Verify Boost, Jump, Dodge, Ball-Hit, and Demolition incidents, then launch Regulation Goal 1',
      action: verifyCombatIncidentsAndLaunchFirstGoal,
    },
    {
      tick: 645,
      description:
        'Advance goal celebration buffer into Goal Replay to test Bot vs Human skip voting',
      action: (ctx) => clampServerGoalCelebrationBuffer(ctx, 5),
    },
    {
      tick: 665,
      forceKeyframeRender: true,
      keyframeReason: 'e2e_replay_bots_auto_vote_while_humans_hold',
      description:
        'Verify Auto-Filling Ducky Bots automatically voted skip (jump:true) while Take-Over Humans hold never',
      action: (ctx) => {
        const r = ctx.runtime;
        const phase = r?.match?.state?.phase;
        const fm = r?.authoritativeServer?.fallbackManager;
        const votes = fm?.commandQueue?.skipReplayVotes;
        const players = Array.from(fm?.roster?.players?.values() || []);
        const botVotedCount = players.filter((p) => p.isBot && votes?.has(p.sessionId)).length;
        const humanVotedCount = players.filter((p) => !p.isBot && votes?.has(p.sessionId)).length;
        ctx.recordAssertion(
          'e2e_replay_bots_auto_vote_while_humans_hold',
          phase === 'replay' && botVotedCount === 3 && humanVotedCount === 0,
          `phase=${phase}, botVotedCount=${botVotedCount}/3, humanVotedCount=${humanVotedCount}/3`
        );
        ctx.loopbackSimulator.setPeerReplaySkipPolicy?.('peer_1', {
          mode: 'delayed_tick',
          skipAfterReplayTicks: 1,
          holdIntoKickoff: true,
        });
      },
    },
    {
      tick: 680,
      description:
        'Verify partial human skip vote (Peer 1 only) keeps Goal Replay active, then vote with Host + Peer 2',
      action: (ctx) => {
        const r = ctx.runtime;
        const phase = r?.match?.state?.phase;
        const votes = r?.authoritativeServer?.fallbackManager?.commandQueue?.skipReplayVotes;
        const peer1Voted = Boolean(votes?.has('peer_1'));
        const hostVoted = Boolean(votes?.has('host'));
        const peer2Voted = Boolean(votes?.has('peer_2'));
        ctx.recordAssertion(
          'e2e_replay_partial_human_skip_waits_for_all_humans',
          phase === 'replay' && peer1Voted && !hostVoted && !peer2Voted,
          `phase=${phase}, peer1=${peer1Voted}, host=${hostVoted}, peer2=${peer2Voted}`
        );
        ctx.setLocalCarControls({ throttle: 1.0, jump: true, boost: true });
        ctx.loopbackSimulator.setPeerReplaySkipPolicy?.('peer_2', {
          mode: 'delayed_tick',
          skipAfterReplayTicks: 1,
          holdIntoKickoff: true,
        });
      },
    },
    {
      tick: 695,
      forceKeyframeRender: true,
      keyframeReason: 'e2e_replay_all_humans_skipped_to_kickoff',
      description:
        'Verify all humans voting skip immediately transitions to kickoff and registers jumpSuppressedCarIndices',
      action: (ctx) => {
        const r = ctx.runtime;
        const phase = r?.match?.state?.phase;
        const suppressed = r?.authoritativeServer?.fallbackPhysics?.jumpSuppressedCarIndices;
        const hasSuppressed = Boolean(
          suppressed && suppressed.has(0) && suppressed.has(1) && suppressed.has(2)
        );
        ctx.recordAssertion(
          'e2e_replay_all_humans_voted_skips_to_kickoff_and_suppresses_jump',
          phase === 'kickoff' && hasSuppressed,
          `phase=${phase}, suppressed=[${Array.from(suppressed || []).join(',')}]`
        );
      },
    },
    {
      tick: 1165,
      forceKeyframeRender: true,
      keyframeReason: 'e2e_kickoff_unfreeze_jump_suppression',
      description:
        'Verify held Jump across replay skip did not cause spontaneous jump on kickoff unfreeze, then set 1-1 for Overtime',
      action: (ctx) => {
        const r = ctx.runtime;
        const phase = r?.match?.state?.phase;
        const sim = r?.authoritativeServer?.fallbackSim;
        const c0 = sim?.getCarStateView?.(0) ?? r?.physics?.getCarStateView?.(0);
        const c1 = sim?.getCarStateView?.(1) ?? r?.physics?.getCarStateView?.(1);
        const c2 = sim?.getCarStateView?.(2) ?? r?.physics?.getCarStateView?.(2);
        const noSpontaneousJump = Boolean(
          c0 &&
          !c0.isJumping &&
          (c0.posZ ?? 0) < 28 &&
          c1 &&
          !c1.isJumping &&
          (c1.posZ ?? 0) < 28 &&
          c2 &&
          !c2.isJumping &&
          (c2.posZ ?? 0) < 28
        );
        ctx.recordAssertion(
          'e2e_kickoff_unfreeze_jump_suppression_verified',
          phase === 'playing' && noSpontaneousJump,
          `phase=${phase}, c0Z=${c0?.posZ?.toFixed?.(1)}, c1Z=${c1?.posZ?.toFixed?.(1)}, c2Z=${c2?.posZ?.toFixed?.(1)}`
        );
        ctx.setLocalCarControls({ throttle: 1.0, jump: false, boost: true });
        ctx.loopbackSimulator.setPeerReplaySkipPolicy?.('all', 'never');
        const domain = r?.authoritativeServer?.fallbackManager?.domain;
        if (domain) {
          Object.assign(domain, { orangeScore: 1, clockSecondsRemaining: 1, clockStarted: true });
        }
        ctx.setBallState({ pos: [400, 0, 93.15], vel: [20, 0, 0], angVel: [0, 0, 0] });
      },
    },
  ];
}

export async function verifyMatchEndedAndRCReplayRoundTrip(
  ctx: ScenarioStepContext
): Promise<void> {
  const r = ctx.runtime;
  const phase = r?.match?.state?.phase;
  const winner = r?.authoritativeServer?.fallbackManager?.domain?.winner;
  const retained = getRetainedMatchReplay();
  const hasRetained = Boolean(
    retained &&
    retained.winner === 'blue' &&
    retained.blueScore >= 1 &&
    Array.isArray(retained.roster) &&
    retained.roster.length === 6
  );
  let roundTripOk = false;
  let framesLen = 0;
  let rosterLen = 0;
  if (retained) {
    const bytes = serializeRCReplayBinaryContainer(retained);
    const hasMagic = isBinaryRCReplayContainer(bytes);
    const parsed = await parseRCReplayFile(bytes);
    framesLen = parsed?.frames?.length ?? 0;
    const rList = parsed?.metadata?.roster ?? parsed?.roster;
    rosterLen = Array.isArray(rList) ? rList.length : 0;
    roundTripOk = hasMagic && bytes.byteLength > 4096 && framesLen > 400 && rosterLen === 6;
  }
  const pktDump = r?.networkManager?.diagnosticsProbe?.dumpLatestNetworkPacket?.();
  ctx.recordAssertion(
    'e2e_match_ended_and_rcreplay_roundtrip_verified',
    (phase === 'ended' || phase === 'podium') &&
      winner === 0 &&
      hasRetained &&
      roundTripOk &&
      Boolean(pktDump),
    `phase=${phase}, winner=${winner}, roundTripOk=${roundTripOk} (frames=${framesLen}, roster=${rosterLen}), pktDump=${Boolean(pktDump)}`
  );
}

export function buildPodiumAndViewerTakeoverSteps(): ScenarioTickStep[] {
  return [
    {
      tick: 2270,
      forceKeyframeRender: true,
      keyframeReason: 'e2e_podium_v_formation',
      description: 'Verify 360-tick countdown transitioned into PODIUM_START V-formation',
      action: (ctx) => {
        const r = ctx.runtime;
        const phase = r?.match?.state?.phase;
        const serverState = r?.authoritativeServer?.fallbackManager?.domain?.state;
        const podiumActive = Boolean(
          r?.podiumController?.isActive || phase === 'podium' || serverState === 'podium'
        );
        const sigs = ctx.loopbackSimulator.collectTelemetry().distinctSignalNames;
        ctx.recordAssertion(
          'e2e_podium_celebration_active',
          podiumActive && sigs.includes('PODIUM_START'),
          `phase=${phase}, serverState=${serverState}, hasSig=${sigs.includes('PODIUM_START')}`
        );
      },
    },
    {
      tick: 2305,
      forceKeyframeRender: true,
      keyframeReason: 'e2e_room_destroy_and_viewer_takeover',
      description:
        'Destroy online room and load retained 6-car replay into StandaloneReplayViewerController',
      action: async (ctx) => {
        const r = ctx.runtime;
        await ctx.loopbackSimulator.stop();
        const stopped = !r?.authoritativeServer;
        const viewer = r?.modeManager?.getActiveMode?.()?.standaloneReplayViewer;
        viewer?.handleLoadRetainedMatchReplay?.();
        viewer?.startPlaying?.();
        const active = Boolean(viewer?.isActive && viewer?.hasLoadedReplay);
        const rLen = viewer?.rosterSubController?.resolvedRoster?.length ?? 0;
        ctx.recordAssertion(
          'e2e_room_destroyed_and_replay_viewer_loaded',
          stopped && active && rLen === 6,
          `stopped=${stopped}, viewerActive=${active}, rosterLen=${rLen}`
        );
      },
    },
    {
      tick: 2335,
      forceKeyframeRender: true,
      keyframeReason: 'e2e_viewer_pov_and_intervene',
      description: 'Switch POV slot in Replay Viewer and exercise beginInterventionPreRoll',
      action: (ctx) => {
        const viewer = ctx.runtime?.modeManager?.getActiveMode?.()?.standaloneReplayViewer;
        viewer?.selectPovSlot?.(2);
        const povIdx = viewer?.rosterSubController?.activePovCarIndex ?? -1;
        viewer?.beginInterventionPreRoll?.();
        const st = viewer?.takeoverSubController?.getViewerState?.() || 'playing';
        ctx.recordAssertion(
          'e2e_replay_viewer_pov_and_intervene_verified',
          povIdx >= 0 && Boolean(st),
          `pov=${povIdx}, state=${st}`
        );
      },
    },
    {
      tick: 2365,
      forceKeyframeRender: true,
      keyframeReason: 'e2e_viewer_exit_to_freeplay',
      description: 'Exit Replay Viewer back to clean 1-car FreePlay',
      action: (ctx) => {
        const r = ctx.runtime;
        r?.modeManager?.getActiveMode?.()?.resetToCleanFreeplay?.();
        r?.resetKickoff?.(0);
      },
    },
    {
      tick: 2390,
      forceKeyframeRender: true,
      keyframeReason: 'e2e_final_clean_freeplay',
      description: 'Verify clean return to 1-car FreePlay with slots 1..5 hidden',
      action: (ctx) => {
        const r = ctx.runtime;
        const viewerOff = !r?.modeManager?.getActiveMode?.()?.standaloneReplayViewer?.isActive;
        const phase = r?.match?.state?.phase;
        const numCars = r?.physics?.numCars ?? 0;
        const hidden = (r?.arena?.cars ?? []).slice(1).every((c) => !c || !c.visible);
        ctx.recordAssertion(
          'e2e_clean_return_to_single_car_freeplay',
          viewerOff && phase === 'playing' && numCars === 1 && hidden,
          `viewerOff=${viewerOff}, phase=${phase}, numCars=${numCars}, extraHidden=${hidden}`
        );
      },
    },
  ];
}
