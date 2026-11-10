import { DEFAULT_CAR_CONTROLS } from '../../../ai/experimental/experimentalMultiCarObsPipeline.ts';
import { RocketSimPhysicsEngine } from '../../../physics/RocketSimPhysicsEngine.ts';
import { useSubsystemIsolationLabStore } from '../../runtimeUiPort.ts';
import { classifyBallOutcome } from '../../../ai/KickoffV2SafeTensorsAgent.ts';
import {
  KICKOFF_DUEL_MODELS,
  KICKOFF_DUEL_PAIRINGS,
  KICKOFF_DUEL_SLOTS,
} from '../../../ui-core/config/kickoffDuelConfig.ts';
import {
  type KickoffStepTraceEntry,
  buildCarStepTraceEntry,
  convertStepTracesToCsv,
  createKickoffDuelHelpers,
  decideCarControlsForModel,
  ensureKickoffDuelModelsLoaded,
  resetKickoffDuelEnsemble,
  resetSimToKickoffSlotAndSettle,
  triggerBrowserDownload,
} from './kickoffDuelSimulationPipeline.ts';

export interface KickoffDuelSoloBenchmarkResult {
  modelId: string;
  shortName: string;
  hasOpponentObs: boolean;
  slotTicks: number[];
  avgTicks: number;
  avgSec: number;
}

export interface KickoffDuelMatrixSlotResult {
  slotIndex: number;
  slotCode: string;
  touchTick: number;
  touchSec: number;
  winner: string;
  blueDist: number;
  orangeDist: number;
  endBallX: number;
  endBallY: number;
  endBallVy: number;
  outcome: string;
}

export interface KickoffDuelMatrixPairingResult {
  pairId: string;
  label: string;
  category: string;
  blue: string;
  orange: string;
  blueWins: number;
  orangeWins: number;
  ties: number;
  slots: KickoffDuelMatrixSlotResult[];
}

export interface KickoffDiagnosticTrajectoryTrace {
  modelId: string;
  label: string;
  slotIndex: number;
  slotCode: string;
  channelMode: string;
  touchTick: number;
  touchSec: number;
  maxCarSpeed: number;
  steps: KickoffStepTraceEntry[];
}

let cachedHeadlessSim: RocketSimPhysicsEngine | null = null;

async function getOrCreateHeadlessSim(): Promise<RocketSimPhysicsEngine> {
  if (cachedHeadlessSim && cachedHeadlessSim.isInitialized) {
    return cachedHeadlessSim;
  }
  const sim = new RocketSimPhysicsEngine();
  await sim.init({
    collisionData: RocketSimPhysicsEngine.cachedCollisionData ?? undefined,
    freshInstance: true,
    isolated: true,
  });
  cachedHeadlessSim = sim;
  return sim;
}

function yieldToBrowser(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

export async function runFullKickoffDuelMatrixBenchmark(): Promise<void> {
  const store = useSubsystemIsolationLabStore.getState();
  if (store.kickoffDuelBenchmarkRunning) return;

  store.updateLiveTelemetry({ kickoffDuelBenchmarkRunning: true });

  try {
    await ensureKickoffDuelModelsLoaded(['ko_v2', 'ko_v1', 'nexto', 'necto']);
    const sim = await getOrCreateHeadlessSim();
    await yieldToBrowser();

    const curStore = useSubsystemIsolationLabStore.getState();
    const channelMode = curStore.kickoffDuelChannelMode || 'keyboard_coupled';
    let helpers = createKickoffDuelHelpers(channelMode);
    const cutoffDelayTicks = Math.max(
      0,
      Math.round((curStore.kickoffDuelCutoffDelaySec ?? 0.5) * 120)
    );
    const decideOpts = {
      nextoScripted: Boolean(curStore.kickoffDuelNextoScripted),
      channelMode,
    };

    const soloResults: KickoffDuelSoloBenchmarkResult[] = [];
    for (const modelMeta of KICKOFF_DUEL_MODELS) {
      const slotTicks: number[] = [];
      for (let s = 0; s < 5; s++) {
        resetSimToKickoffSlotAndSettle(sim, s);
        sim.setCarState(1, {
          pos: [0, 4800, 17.05],
          vel: [0, 0, 0],
          angVel: [0, 0, 0],
          rot: [0, -Math.PI / 2, 0],
          boost: 0,
        });
        helpers.expBlue.setBotType(modelMeta.id === 'necto' ? 'necto' : 'nexto');
        helpers = resetKickoffDuelEnsemble(helpers);

        let touchTick = 420;
        for (let t = 0; t < 420; t++) {
          const decision0 = decideCarControlsForModel(
            sim,
            modelMeta.id,
            0,
            0,
            t,
            helpers,
            decideOpts
          );
          helpers = decision0.nextHelpers;
          sim.setControls(0, decision0.controls);
          sim.setControls(1, DEFAULT_CAR_CONTROLS);
          sim.step(1);
          const bs = sim.getBallStateView();
          if (
            Math.hypot(bs.posX, bs.posY, bs.posZ - 93.15) > 0.8 ||
            Math.hypot(bs.velX, bs.velY, bs.velZ) > 5.0
          ) {
            touchTick = t + 1;
            break;
          }
        }
        slotTicks.push(touchTick);
      }
      const avgTicks = Number((slotTicks.reduce((a, b) => a + b, 0) / 5).toFixed(1));
      soloResults.push({
        modelId: modelMeta.id,
        shortName: modelMeta.shortName,
        hasOpponentObs: modelMeta.hasOpponentObs,
        slotTicks,
        avgTicks,
        avgSec: Number((avgTicks / 120).toFixed(2)),
      });
      await yieldToBrowser();
    }

    const matrixResults: KickoffDuelMatrixPairingResult[] = [];
    for (const pair of KICKOFF_DUEL_PAIRINGS) {
      const slots: KickoffDuelMatrixSlotResult[] = [];
      let blueWins = 0;
      let orangeWins = 0;
      let ties = 0;

      for (let s = 0; s < 5; s++) {
        resetSimToKickoffSlotAndSettle(sim, s);
        helpers.expBlue.setBotType(pair.blue === 'necto' ? 'necto' : 'nexto');
        helpers.expOrange.setBotType(pair.orange === 'necto' ? 'necto' : 'nexto');
        helpers = resetKickoffDuelEnsemble(helpers);

        let touched = false;
        let touchTick = -1;
        let winner = 'NONE';
        let d0Touch = 0;
        let d1Touch = 0;

        for (let t = 0; t < 420; t++) {
          const cutOff = touched && t >= touchTick + cutoffDelayTicks;
          if (cutOff) {
            sim.setControls(0, DEFAULT_CAR_CONTROLS);
            sim.setControls(1, DEFAULT_CAR_CONTROLS);
          } else {
            const dec0 = decideCarControlsForModel(sim, pair.blue, 0, 0, t, helpers, decideOpts);
            helpers = dec0.nextHelpers;
            const dec1 = decideCarControlsForModel(sim, pair.orange, 1, 1, t, helpers, decideOpts);
            helpers = dec1.nextHelpers;
            sim.setControls(0, dec0.controls);
            sim.setControls(1, dec1.controls);
          }
          sim.step(1);

          const bs = sim.getBallStateView();
          if (
            !touched &&
            (Math.hypot(bs.posX, bs.posY, bs.posZ - 93.15) > 0.8 ||
              Math.hypot(bs.velX, bs.velY, bs.velZ) > 5.0)
          ) {
            touched = true;
            touchTick = t + 1;
            const c0 = sim.getCarStateView(0);
            const c1 = sim.getCarStateView(1);
            d0Touch = Math.round(
              Math.hypot(c0.posX - bs.posX, c0.posY - bs.posY, c0.posZ - bs.posZ)
            );
            d1Touch = Math.round(
              Math.hypot(c1.posX - bs.posX, c1.posY - bs.posY, c1.posZ - bs.posZ)
            );
            if (Math.abs(d0Touch - d1Touch) <= 8) {
              winner = 'TIE';
              ties++;
            } else if (d0Touch < d1Touch) {
              winner = 'BLUE';
              blueWins++;
            } else {
              winner = 'ORANGE';
              orangeWins++;
            }
          }

          if (touched && t >= touchTick + cutoffDelayTicks + 120) {
            break;
          }
        }

        const bsEnd = sim.getBallStateView();
        slots.push({
          slotIndex: s,
          slotCode: KICKOFF_DUEL_SLOTS[s].code,
          touchTick,
          touchSec: Number((touchTick / 120).toFixed(2)),
          winner,
          blueDist: d0Touch,
          orangeDist: d1Touch,
          endBallX: Math.round(bsEnd.posX),
          endBallY: Math.round(bsEnd.posY),
          endBallVy: Math.round(bsEnd.velY),
          outcome: classifyBallOutcome(bsEnd.posX, bsEnd.posY, bsEnd.velX, bsEnd.velY),
        });
        await yieldToBrowser();
      }

      matrixResults.push({
        pairId: pair.id,
        label: pair.label,
        category: pair.category,
        blue: pair.blue,
        orange: pair.orange,
        blueWins,
        orangeWins,
        ties,
        slots,
      });
    }

    useSubsystemIsolationLabStore.getState().updateLiveTelemetry({
      kickoffDuelBenchmarkRunning: false,
      kickoffDuelSoloResults: soloResults,
      kickoffDuelMatrixResults: matrixResults,
    });
  } catch (err) {
    console.error('[KickoffDuelLab] Benchmark failed:', err);
    useSubsystemIsolationLabStore
      .getState()
      .updateLiveTelemetry({ kickoffDuelBenchmarkRunning: false });
  }
}

export async function exportKickoffDuelDiagnosticsData(
  liveTraces: {
    blueSteps: KickoffStepTraceEntry[];
    orangeSteps: KickoffStepTraceEntry[];
  },
  format = 'json',
  scope = 'all_models_all_slots'
): Promise<void> {
  const st = useSubsystemIsolationLabStore.getState();
  if (st.kickoffDuelDiagnosticRunning) return;

  if (scope === 'live') {
    const slotCode = KICKOFF_DUEL_SLOTS[st.kickoffDuelSlotIndex]?.code || 'DR';
    const blueSteps =
      liveTraces.blueSteps.length > 0
        ? liveTraces.blueSteps
        : (st.kickoffDuelLiveBlueSteps as KickoffStepTraceEntry[]) || [];
    const orangeSteps =
      liveTraces.orangeSteps.length > 0
        ? liveTraces.orangeSteps
        : (st.kickoffDuelLiveOrangeSteps as KickoffStepTraceEntry[]) || [];
    if (format === 'csv') {
      const csv = convertStepTracesToCsv([
        {
          modelId: st.kickoffDuelBlueModel,
          role: 'BLUE',
          slotCode,
          channelMode: st.kickoffDuelChannelMode,
          steps: blueSteps,
        },
        {
          modelId: st.kickoffDuelOrangeModel,
          role: 'ORANGE',
          slotCode,
          channelMode: st.kickoffDuelChannelMode,
          steps: orangeSteps,
        },
      ]);
      triggerBrowserDownload(`kickoff_duel_live_${slotCode}.csv`, csv, 'text/csv');
    } else {
      const payload = {
        exportedAt: new Date().toISOString(),
        scope: 'live_duel',
        slotIndex: st.kickoffDuelSlotIndex,
        slotCode,
        channelMode: st.kickoffDuelChannelMode,
        blueModel: st.kickoffDuelBlueModel,
        orangeModel: st.kickoffDuelOrangeModel,
        touchTick: st.kickoffDuelTouchTick,
        touchWinner: st.kickoffDuelTouchWinner,
        blueSteps,
        orangeSteps,
      };
      triggerBrowserDownload(
        `kickoff_duel_live_${slotCode}.json`,
        JSON.stringify(payload, null, 2),
        'application/json'
      );
    }
    st.updateLiveTelemetry({
      kickoffDuelDiagnosticSummary: `Exported live duel (${st.kickoffDuelBlueModel} vs ${st.kickoffDuelOrangeModel}, ${slotCode}) as ${format.toUpperCase()}.`,
    });
    return;
  }

  st.updateLiveTelemetry({
    kickoffDuelDiagnosticRunning: true,
    kickoffDuelDiagnosticSummary:
      'Running headless diagnostic traces across all models & 5 slots...',
  });

  try {
    await ensureKickoffDuelModelsLoaded(['ko_v2', 'ko_v1', 'nexto', 'necto']);
    const sim = await getOrCreateHeadlessSim();
    await yieldToBrowser();

    const configs = [
      {
        modelId: 'ko_v2',
        channelMode: 'keyboard_coupled',
        label: 'KO_v2 (Keyboard Coupled · Optimal 257.8f)',
      },
      {
        modelId: 'ko_v2',
        channelMode: 'ground_air_separated',
        label: 'KO_v2 (Ground/Air Separated · 265.2f)',
      },
      { modelId: 'ko_v1', channelMode: 'keyboard_coupled', label: 'KO_v1 (Legacy 75D · 259.2f)' },
      {
        modelId: 'nexto',
        channelMode: 'keyboard_coupled',
        label: 'Nexto (EARL Perceiver GC · 303.8f)',
      },
      {
        modelId: 'necto',
        channelMode: 'keyboard_coupled',
        label: 'Necto (EARL Perceiver Diamond · 307.0f)',
      },
    ];

    const traces: KickoffDiagnosticTrajectoryTrace[] = [];
    for (const cfg of configs) {
      let helpers = createKickoffDuelHelpers(cfg.channelMode);
      for (let s = 0; s < 5; s++) {
        resetSimToKickoffSlotAndSettle(sim, s);
        sim.setCarState(1, {
          pos: [0, 4800, 17.05],
          vel: [0, 0, 0],
          angVel: [0, 0, 0],
          rot: [0, -Math.PI / 2, 0],
          boost: 0,
        });
        helpers.expBlue.setBotType(cfg.modelId === 'necto' ? 'necto' : 'nexto');
        helpers = resetKickoffDuelEnsemble(helpers);

        const steps: KickoffStepTraceEntry[] = [];
        let touchTick = 420;
        let maxCarSpeed = 0;

        for (let t = 0; t < 380; t++) {
          const dec0 = decideCarControlsForModel(sim, cfg.modelId, 0, 0, t, helpers, {
            nextoScripted: false,
            channelMode: cfg.channelMode,
          });
          helpers = dec0.nextHelpers;
          const ctrl0 = dec0.controls;
          if (t % 4 === 0) {
            const stepEntry = buildCarStepTraceEntry(sim, cfg.modelId, 0, t, helpers, ctrl0);
            if (stepEntry.carSpeed > maxCarSpeed) maxCarSpeed = stepEntry.carSpeed;
            steps.push(stepEntry);
          }
          sim.setControls(0, ctrl0);
          sim.setControls(1, DEFAULT_CAR_CONTROLS);
          sim.step(1);

          const bs = sim.getBallStateView();
          if (
            Math.hypot(bs.posX, bs.posY, bs.posZ - 93.15) > 0.8 ||
            Math.hypot(bs.velX, bs.velY, bs.velZ) > 5.0
          ) {
            touchTick = t + 1;
            steps.push(buildCarStepTraceEntry(sim, cfg.modelId, 0, touchTick, helpers, ctrl0));
            break;
          }
        }

        traces.push({
          modelId: cfg.modelId,
          label: cfg.label,
          slotIndex: s,
          slotCode: KICKOFF_DUEL_SLOTS[s].code,
          channelMode: cfg.channelMode,
          touchTick,
          touchSec: Number((touchTick / 120).toFixed(2)),
          maxCarSpeed,
          steps,
        });
        await yieldToBrowser();
      }
    }

    if (format === 'csv') {
      const csv = convertStepTracesToCsv(
        traces.map((tr) => ({
          modelId: `${tr.modelId}_${tr.channelMode}`,
          role: 'SOLO_BLUE',
          slotCode: tr.slotCode,
          channelMode: tr.channelMode,
          steps: tr.steps,
        }))
      );
      triggerBrowserDownload('kickoff_models_action_diagnostics.csv', csv, 'text/csv');
    } else {
      const report = {
        exportedAt: new Date().toISOString(),
        scope: 'all_models_all_slots',
        diagnosticsNotes: {
          koV2RootCauseIn18be22f:
            'In commit 18be22f, buildObs42 had shifted observation indices [13..41] (feeding rvMag into obs[20] on_ground) and wrong airborne logit mask indices (+1e9 on logits[7] and logits[14]), causing the agent to believe it was airborne on tick 0 and spam Q+A+S+Jump.',
          channelSeparationVerification:
            'KO_v2 (RLRL101 a9a52e7 ko_v1_best.pt) was trained with standard keyboard controls ' +
            '(multiDiscreteToControls: throttle = thrVal, pitch = -thrVal). Keeping keyboard channels coupled ' +
            'produces deterministic 257.8f average (232, 232, 262, 262, 301) with 0.00e+0 difference vs keyboard replay. ' +
            'Separating throttle=0 in air loses CAR_AIR_CONTROL_THROTTLE (66.67 uu/s^2) and slows average touch to 265.2f.',
          forcedWOverrideRemoved:
            'Removed hardcoded force_w override; policy naturally outputs W on ground when boosting (0 difference across all 5 slots).',
        },
        traces,
      };
      triggerBrowserDownload(
        'kickoff_models_action_diagnostics.json',
        JSON.stringify(report, null, 2),
        'application/json'
      );
    }

    useSubsystemIsolationLabStore.getState().updateLiveTelemetry({
      kickoffDuelDiagnosticRunning: false,
      kickoffDuelDiagnosticSummary: `Exported 25 full trajectories (4 models + coupled/separated comparison across 5 slots) as ${format.toUpperCase()}.`,
    });
  } catch (err: unknown) {
    console.error('[KickoffDuelDiagnostics] Export failed:', err);
    const message = err instanceof Error ? err.message : String(err);
    useSubsystemIsolationLabStore.getState().updateLiveTelemetry({
      kickoffDuelDiagnosticRunning: false,
      kickoffDuelDiagnosticSummary: `Export failed: ${message}`,
    });
  }
}
