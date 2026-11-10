/**
 * trainingAndKickoffScenario.ts
 * Automated scenario covering FreePlay, Static Training Pack (Mirror/Variation/Editor/Goal),
 * and Kickoff Training PPO (Ghost timeline, Same/Opposite, Easy-Learning, Solid Duel, Realistic).
 */

import type { StaticTrainingPackMode } from '../modes/static-training/StaticTrainingPackMode.ts';
import { useStaticTrainingPackStore } from '../runtimeUiPort.ts';
import {
  asTrainingRuntime,
  buildKickoffPpoAndGhostScenarioSteps,
  buildTrainingKeyframeStep,
  switchTrainingSuiteMode,
} from './kickoffPpoAndGhostScenarioSteps.ts';
import type { ScenarioScript, ScenarioStepContext } from './ScenarioTypes.ts';

const getStaticMode = (ctx: ScenarioStepContext): StaticTrainingPackMode | null => {
  const m = ctx.runtime?.modeManager?.getActiveMode?.() as { id?: string } | undefined;
  return m?.id === 'static-training-pack' ? (m as unknown as StaticTrainingPackMode) : null;
};
const getStaticStore = () => useStaticTrainingPackStore.getState();

export const TRAINING_AND_KICKOFF_SCENARIO: ScenarioScript = {
  id: 'training_and_kickoff',
  title: 'FreePlay -> Static Training Pack -> Kickoff PPO & Ghost Trajectory',
  description:
    'Validates FreePlay, Static Training Pack (shot timer, mirror flip, Kevpert variation, goal reset, Editor FreeCam/trajectory), and Kickoff PPO SafeTensors with Ghost trajectory comparison.',
  totalTicks: 900,
  renderStride: 15,
  batchYieldTicks: 60,
  forceRenderOnKeyframes: true,
  setup: async (ctx) => {
    const r = asTrainingRuntime(ctx);
    if (r?.authoritativeServer || r?.networkReconciler) {
      await r.networkManager?.sessionCoordinator?.stopOnlineServer?.({ rebindLoopback: false });
    }
    switchTrainingSuiteMode(r, 'freeplay');
    await getStaticStore().initStore('normal');
    ctx.setLocalCarControls({ throttle: 1.0, boost: true });
  },
  steps: [
    buildTrainingKeyframeStep(
      1,
      'training_suite_freeplay_entry',
      'Verify FreePlay single-player local authority and initial car/ball state',
      (ctx) => {
        const r = asTrainingRuntime(ctx);
        const currentMode = r?.match?.state?.mode;
        const single = !r?.authoritativeServer && !r?.networkReconciler;
        const n = r?.physics?.numCars ?? 0;
        ctx.recordAssertion(
          'freeplay_single_player_pipeline_active',
          currentMode === 'freeplay' && single && n === 1,
          `mode=${currentMode}, single=${single}, n=${n}`
        );
      }
    ),
    buildTrainingKeyframeStep(
      20,
      'static_training_pack_mode_enter',
      'Transition into Static Training Pack mode and stage a shot',
      (ctx) => {
        const r = asTrainingRuntime(ctx);
        ctx.setLocalCarControls(null);
        const s = getStaticStore();
        s.setDownCounterEnabled(false);
        s.setShotMirrored(false);
        s.setVariationToggles({ enableCustomVariationOverride: false, enableFToMirror: true });
        switchTrainingSuiteMode(r, 'static-training-pack');
        const m = getStaticMode(ctx);
        const ok = Boolean(s.activePack && s.activePack.items.length > 0);
        ctx.recordAssertion(
          'static_training_pack_loaded_and_staged',
          r?.match?.state?.mode === 'static-training-pack' &&
            ok &&
            m?.playPhase === 'waiting-input',
          `mode=${r?.match?.state?.mode}, pack=${ok}, phase=${m?.playPhase}`
        );
      }
    ),
    buildTrainingKeyframeStep(
      35,
      'static_training_mirror_shot_verified',
      'Verify Mirror Shot (enableFToMirror) reflects car and ball X across X=0',
      (ctx) => {
        const m = getStaticMode(ctx);
        const s = getStaticStore();
        const base = m?._getCurrentShotConfig();
        if (base && Math.abs(base.car.location?.[0] ?? 0) < 10) {
          base.car.location = [-850, -2200, 17.01];
          base.car.headingYaw = 1.25;
          base.ball.location = [420, 1200, 93.15];
        }
        m?.reloadCurrentShot();
        const cx0 = m?.stagedShot?.car?.location?.[0] ?? 0;
        const bx0 = m?.stagedShot?.ball?.location?.[0] ?? 0;
        s.toggleShotMirror();
        const mir = getStaticStore().isShotMirrored;
        const cx1 = m?.stagedShot?.car?.location?.[0] ?? 0;
        const bx1 = m?.stagedShot?.ball?.location?.[0] ?? 0;
        const ok =
          mir && Math.abs(cx1 + cx0) < 1e-2 && Math.abs(bx1 + bx0) < 1e-2 && Math.abs(cx0) > 10;
        ctx.recordAssertion(
          'static_training_mirror_shot_flipped',
          ok,
          `mir=${mir}, carX=${cx0.toFixed(1)}->${cx1.toFixed(1)}, ballX=${bx0.toFixed(1)}->${bx1.toFixed(1)}`
        );
        s.toggleShotMirror();
      }
    ),
    {
      tick: 50,
      description: 'Verify Kevpert variation preset & custom perturbation on shot reload',
      action: (ctx) => {
        const m = getStaticMode(ctx);
        const s = getStaticStore();
        s.applyKevpertVariationPreset('F3');
        s.setCustomVariation({
          ballLocationModifierXY: [0, 0],
          ballHeightModifierZ: [180, 180],
          boostLimitOverride: 42,
        });
        m?.reloadCurrentShot();
        const vShot = m?.stagedShot;
        const bz0 = m?._getCurrentShotConfig()?.ball?.location?.[2] ?? 93.15;
        const bz1 = vShot?.ball?.location?.[2] ?? 0;
        const boost = vShot?.car?.initialBoost ?? -1;
        ctx.recordAssertion(
          'static_training_kevpert_variation_applied',
          Math.abs(bz1 - (bz0 + 180)) < 1.0 && boost === 42 && vShot?.car?.unlimitedBoost === false,
          `baseZ=${bz0.toFixed(1)}, varZ=${bz1.toFixed(1)}, boost=${boost}`
        );
        s.setVariationToggles({ enableCustomVariationOverride: false });
        m?.reloadCurrentShot();
      },
    },
    buildTrainingKeyframeStep(
      65,
      'static_training_editor_freecam_and_trajectory',
      'Verify Edit Mode, Editor FreeCam toggle, and trajectory preview',
      (ctx) => {
        const r = asTrainingRuntime(ctx);
        const m = getStaticMode(ctx);
        const s = getStaticStore();
        s.setSessionMode('edit');
        s.enterItemEditMode(s.currentShotIndex);
        s.setEditSubMode('car-heading');
        const camOvr = Boolean(
          r?.camera?.isEditorOverrideActive || r?.camera?.currentMode === 'editor'
        );
        s.setEditSubMode('free-cam');
        const freeCam = Boolean(r?.camera?.isFreeCam);
        m?.toggleFreeCamTrajectoryTest();
        const traj = Boolean(m?.isFreeCamTrajectoryTesting);
        ctx.recordAssertion(
          'static_training_editor_freecam_and_trajectory_active',
          camOvr && freeCam && traj,
          `camOvr=${camOvr}, freeCam=${freeCam}, traj=${traj}`
        );
      }
    ),
    {
      tick: 85,
      description: 'Stop trajectory test, return to Play mode, and launch shot',
      action: (ctx) => {
        const m = getStaticMode(ctx);
        m?.stopFreeCamTrajectoryTest();
        getStaticStore().setSessionMode('play');
        if (m?.stagedShot) {
          m.stagedShot.timeoutSeconds = 8;
          m.simulationController.setTimeoutSeconds(8);
        }
        ctx.setLocalCarControls({ throttle: 1.0, boost: true });
      },
    },
    {
      tick: 115,
      description: 'Verify shot launched into live phase, timer counting down, then inject goal',
      action: (ctx) => {
        const sc = getStaticMode(ctx)?.simulationController;
        const rem = sc?.remainingTimeoutTicks ?? 960;
        ctx.recordAssertion(
          'static_training_shot_launched_and_timer_counting',
          Boolean(sc?.playPhase === 'live' && rem < 960 && rem > 0),
          `phase=${sc?.playPhase}, rem=${rem}/960`
        );
        ctx.setBallState({ pos: [0, 4820, 95], vel: [0, 2900, 40], angVel: [0, 0, 0] });
      },
    },
    buildTrainingKeyframeStep(
      155,
      'static_training_goal_and_reset_verified',
      'Verify goal scored in Static Training Pack, skip replay, and verify shot reset',
      (ctx) => {
        const m = getStaticMode(ctx);
        const sc = m?.simulationController;
        const goal =
          sc?.playPhase === 'goal' || (sc?.goalResetTicks ?? 0) > 0 || Boolean(m?.isReplayActive);
        ctx.setLocalCarControls(null);
        m?.skipGoalReplay();
        const resetOk = sc?.playPhase === 'waiting-input' && !m?.isReplayActive;
        ctx.recordAssertion(
          'static_training_goal_scored_and_reset_verified',
          Boolean(goal && resetOk),
          `goal=${goal}, postSkip=${sc?.playPhase}, replay=${m?.isReplayActive}`
        );
      }
    ),
    ...buildKickoffPpoAndGhostScenarioSteps(),
  ],
  teardown: async (ctx) => {
    ctx.setLocalCarControls(null);
  },
};
