/**
 * kickoffPpoAndGhostScenarioSteps.ts
 * Scenario tick steps for Kickoff Training PPO SafeTensors inference, Ghost trajectory
 * comparison, Easy-Learning input-mismatch pause/resume, Solid Opponent duel,
 * Realistic countdown unfreeze, and clean return to FreePlay.
 */

import { multiDiscreteToControls } from '../../ai/kickoffEpisodePrimitives.ts';
import type { KickoffTrainingMode } from '../modes/KickoffTrainingMode.ts';
import { useKickoffTrainingStore } from '../runtimeUiPort.ts';
import type {
  ScenarioRuntimePort,
  ScenarioStepContext,
  ScenarioTickStep,
} from './ScenarioTypes.ts';

export interface TrainingRuntimeView extends ScenarioRuntimePort {
  matchPort?: {
    startStaticTrainingPack?(): void;
    startKickoffTraining?(): void;
    returnToFreeplay?(unlimitedBoost?: boolean): void;
  };
  modeManager: ScenarioRuntimePort['modeManager'] & { setMode?(mode: string): void };
}

export const asTrainingRuntime = (ctx: ScenarioStepContext): TrainingRuntimeView =>
  ctx.runtime as unknown as TrainingRuntimeView;

export const getKickoffTrainingMode = (ctx: ScenarioStepContext): KickoffTrainingMode | null => {
  const m = ctx.runtime?.modeManager?.getActiveMode?.() as { id?: string } | undefined;
  return m?.id === 'kickoff-training' ? (m as unknown as KickoffTrainingMode) : null;
};

export const getKickoffStore = () => useKickoffTrainingStore.getState();

export const switchTrainingSuiteMode = (
  r: TrainingRuntimeView,
  targetMode: 'freeplay' | 'static-training-pack' | 'kickoff-training'
): void => {
  if (targetMode === 'static-training-pack' && r.matchPort?.startStaticTrainingPack) {
    r.matchPort.startStaticTrainingPack();
    return;
  }
  if (targetMode === 'kickoff-training' && r.matchPort?.startKickoffTraining) {
    r.matchPort.startKickoffTraining();
    return;
  }
  if (targetMode === 'freeplay' && r.matchPort?.returnToFreeplay) {
    r.matchPort.returnToFreeplay(true);
    return;
  }
  if (r.match?.state) r.match.state.mode = targetMode;
  r.modeManager?.setMode?.(targetMode);
  if (targetMode === 'freeplay') r.resetKickoff?.(0);
};

export const buildTrainingKeyframeStep = (
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

export function buildKickoffPpoAndGhostScenarioSteps(): ScenarioTickStep[] {
  return [
    buildTrainingKeyframeStep(
      180,
      'kickoff_training_mode_enter_and_ppo_ready',
      'Transition into Kickoff Training mode, await Ghost Sim + PPO weights, and verify timeline',
      async (ctx) => {
        const r = asTrainingRuntime(ctx);
        ctx.setLocalCarControls(null);
        switchTrainingSuiteMode(r, 'kickoff-training');
        const km = getKickoffTrainingMode(ctx);
        await km?.episodeController?.waitForReady?.();
        km?.selectSpawn(0);
        const ks = getKickoffStore();
        const stepsLen = ks.timeline?.steps?.length ?? 0;
        const barsLen = ks.timeline?.noteBars?.length ?? 0;
        const aiTouch = ks.aiTouchTick ?? -1;
        const gVis = Boolean(km?.ghostVisuals?.ghostCarRoot?.visible);
        ctx.recordAssertion(
          'kickoff_ppo_timeline_and_ghost_initialized',
          r?.match?.state?.mode === 'kickoff-training' &&
            stepsLen > 20 &&
            barsLen > 0 &&
            aiTouch > 50 &&
            gVis,
          `mode=${r?.match?.state?.mode}, steps=${stepsLen}, bars=${barsLen}, aiTouch=${aiTouch}, ghostVis=${gVis}`
        );
      }
    ),
    {
      tick: 190,
      description: 'Start Kickoff Training Instant episode with throttle + boost',
      action: (ctx) => {
        ctx.setLocalCarControls({ throttle: 1.0, boost: true });
      },
    },
    buildTrainingKeyframeStep(
      445,
      'kickoff_ppo_ghost_trajectory_and_touch_verified',
      'Verify PPO Ghost touched ball and recorded trajectory points, then trigger player touch',
      (ctx) => {
        const km = getKickoffTrainingMode(ctx);
        const ks = getKickoffStore();
        const pts = km?.ghostVisuals?.ghostTrajectoryCount ?? 0;
        if (!ks.playerTouchTick) {
          ctx.setCarState(0, {
            pos: [0, -140, 17.01],
            vel: [0, 2200, 0],
            angVel: [0, 0, 0],
            boost: 50,
          });
          ctx.setBallState({ pos: [0, 0, 93.15], vel: [0, 650, 0], angVel: [0, 0, 0] });
        }
        ctx.recordAssertion(
          'kickoff_ppo_ghost_trajectory_and_episode_stepped',
          ks.episodeTick >= 240 && pts > 0,
          `epTick=${ks.episodeTick}, pts=${pts}, aiTouch=${ks.aiTouchTick}`
        );
      }
    ),
    {
      tick: 460,
      description:
        'Verify player touch delta vs PPO AI touch recorded, then switch to Easy-Learning',
      action: (ctx) => {
        const ks = getKickoffStore();
        const ok =
          typeof ks.playerTouchTick === 'number' &&
          ks.playerTouchTick > 0 &&
          typeof ks.lastDeltaTicks === 'number';
        ctx.recordAssertion(
          'kickoff_player_touch_delta_vs_ai_recorded',
          ok,
          `pTouch=${ks.playerTouchTick}, aiTouch=${ks.aiTouchTick}, delta=${ks.lastDeltaTicks}`
        );
        ctx.setLocalCarControls(null);
        ks.setGhostPlacement('opposite');
        ks.setSubMode('easy-learning');
      },
    },
    buildTrainingKeyframeStep(
      470,
      'kickoff_easy_learning_mismatch_pause',
      'Verify Easy-Learning pauses on mismatch, then feed required PPO action for step 0',
      (ctx) => {
        const ks = getKickoffStore();
        ctx.recordAssertion(
          'kickoff_easy_learning_pauses_on_mismatch',
          String(ks.phase) === 'paused-mismatch' && !ks.isInputMatching,
          `phase=${ks.phase}, match=${ks.isInputMatching}, req=${ks.requiredKeyStr}`
        );
        const act = ks.timeline?.steps?.[0]?.action;
        ctx.setLocalCarControls(
          act ? multiDiscreteToControls(act) : { throttle: 1.0, boost: true }
        );
      }
    ),
    buildTrainingKeyframeStep(
      473,
      'kickoff_solid_opponent_duel_mode',
      'Verify Easy-Learning resumed on matching input, then switch to Solid Opponent duel',
      (ctx) => {
        const r = asTrainingRuntime(ctx);
        const ks = getKickoffStore();
        ctx.recordAssertion(
          'kickoff_easy_learning_resumed_on_matching_input',
          ks.phase === 'running' && ks.episodeTick > 0,
          `phase=${ks.phase}, epTick=${ks.episodeTick}`
        );
        ks.setSubMode('instant');
        ks.setGhostPlacement('opposite');
        ks.setGhostModeEnabled(false);
        ks.setSpawnIndex(1);
        ctx.setLocalCarControls({ throttle: 1.0, boost: true });
        const n = r?.physics?.numCars ?? 0;
        const gVis = Boolean(getKickoffTrainingMode(ctx)?.ghostVisuals?.ghostCarRoot?.visible);
        ctx.recordAssertion(
          'kickoff_solid_physical_opponent_spawned',
          n >= 2 && !gVis,
          `n=${n}, ghostVis=${gVis}`
        );
      }
    ),
    buildTrainingKeyframeStep(
      615,
      'kickoff_solid_opponent_ppo_driven_verified',
      'Verify Solid Opponent Car 1 visible and driven toward ball by PPO agent, then test Realistic countdown',
      (ctx) => {
        const r = asTrainingRuntime(ctx);
        const c0 = r?.physics?.getCarStateView?.(0);
        const c1 = r?.physics?.getCarStateView?.(1);
        const d0 = c0 ? Math.hypot(c0.posX, c0.posY) : 9999;
        const d1 = c1 ? Math.hypot(c1.posX, c1.posY) : 9999;
        const oppVis = Boolean(r?.arena?.cars?.[1]?.visible);
        ctx.recordAssertion(
          'kickoff_solid_ppo_agent_drove_opponent_car',
          oppVis && d0 < 3000 && d1 < 3000,
          `oppVis=${oppVis}, d0=${d0.toFixed(1)}, d1=${d1.toFixed(1)}`
        );
        const ks = getKickoffStore();
        ks.setGhostModeEnabled(true);
        ks.setGhostPlacement('same');
        ks.setRealisticWaitTicks(120);
        ks.setSubMode('realistic' as never);
      }
    ),
    {
      tick: 630,
      description: 'Verify Realistic kickoff mode enters countdown phase',
      action: (ctx) => {
        const r = asTrainingRuntime(ctx);
        const ks = getKickoffStore();
        ctx.recordAssertion(
          'kickoff_realistic_countdown_active',
          ks.phase === 'countdown' &&
            r?.match?.state?.phase === 'kickoff' &&
            ks.countdownRemainingTicks > 0,
          `ko=${ks.phase}, match=${r?.match?.state?.phase}, rem=${ks.countdownRemainingTicks}`
        );
      },
    },
    buildTrainingKeyframeStep(
      765,
      'kickoff_realistic_countdown_unfreeze',
      'Verify Realistic 120-tick countdown completed into running phase',
      (ctx) => {
        const r = asTrainingRuntime(ctx);
        const ks = getKickoffStore();
        ctx.recordAssertion(
          'kickoff_realistic_countdown_transitioned_to_running',
          ks.phase === 'running' && r?.match?.state?.phase === 'playing' && ks.episodeTick > 0,
          `ko=${ks.phase}, match=${r?.match?.state?.phase}, tick=${ks.episodeTick}`
        );
      }
    ),
    buildTrainingKeyframeStep(
      860,
      'training_suite_return_to_freeplay',
      'Return cleanly from Kickoff Training to FreePlay and verify Ghost and Car 1 are hidden',
      (ctx) => {
        const r = asTrainingRuntime(ctx);
        const km = getKickoffTrainingMode(ctx);
        switchTrainingSuiteMode(r, 'freeplay');
        const currentMode = r?.match?.state?.mode;
        const n = r?.physics?.numCars ?? 0;
        const gHid = !km?.ghostVisuals?.ghostCarRoot?.visible;
        const c1Hid = !r?.arena?.cars?.[1]?.visible;
        ctx.recordAssertion(
          'training_suite_clean_return_to_freeplay',
          currentMode === 'freeplay' && n === 1 && gHid && c1Hid,
          `mode=${currentMode}, n=${n}, gHid=${gHid}, c1Hid=${c1Hid}`
        );
      }
    ),
  ];
}
