/**
 * freeplayChaosSoakScenario.ts
 * High-pressure 120Hz Free Play chaos soak scenario (default 72,000 ticks / 10 min sim)
 * stressing TurtleModemGranularVoiceGraph (40 slices), EngineAudioEqualizer,
 * SpatialAudioSource 9-axis listener & panners, VehicleAudioEmitter boost/supersonic loops,
 * BallAudioEmitter rolling/flying/bounce SFX, FreeplayGoalAndTouchSubController,
 * BallTrajectoryAnomalyDetector history ring, and HUD transient flip/boost channels.
 */

import { getAudioContext } from '../../audio/audioContext.ts';
import { audioConfig } from '../../ui-core/config/audioConfig.ts';
import type { ScenarioScript } from './ScenarioTypes.ts';

export const FREEPLAY_CHAOS_SOAK_SCENARIO: ScenarioScript = {
  id: 'freeplay_chaos_soak',
  title: 'High-Pressure Free Play 120Hz Stream Soak & Circuit-Breaker Watchdog',
  description:
    'Continuous 120Hz Free Play chaos soak (72,000 ticks / 10 min sim) exercising granular engine synth RPM/load sweeps, 3D spatial audio listener & emitters, boost/supersonic loops, ball rolling/flying/bounce acoustics, car-ball touch detection, ball trajectory anomaly history, and HUD transient flip/boost updates.',
  totalTicks: 72000,
  renderStride: 999999,
  batchYieldTicks: 300,
  forceRenderOnKeyframes: false,
  setup: async (ctx) => {
    const r = ctx.runtime;
    if (r?.authoritativeServer || r?.networkReconciler) {
      await r.networkManager?.sessionCoordinator?.stopOnlineServer?.({ rebindLoopback: false });
    }
    r?.modeManager?.setActiveMode?.('freeplay');
    if (r?.trainingOptions) {
      r.trainingOptions.disableGoalReset = true;
      r.trainingOptions.boostOption = 'unlimited';
    }
    r?.resetKickoff?.(0);

    audioConfig.set('continueAudioOnLostFocus', true);
    const audioCtx = getAudioContext();
    if (audioCtx && (audioCtx.state as string) !== 'running') {
      try {
        await audioCtx.resume();
      } catch {
        // Ignore resume warning in headless environment
      }
    }

    const btp = (
      r as unknown as {
        ballTrajectoryPredictor?: {
          forcePredictAnyMovement?: boolean;
          setRuntimeOverride?: (ov: { enabled: boolean } | null) => void;
          updateSettings?: (patch: { enabled?: boolean }) => void;
        } | null;
      }
    )?.ballTrajectoryPredictor;
    if (btp) {
      btp.forcePredictAnyMovement = true;
      btp.setRuntimeOverride?.({ enabled: true });
      btp.updateSettings?.({ enabled: true });
    }

    ctx.setLocalCarControls({ throttle: 1.0, boost: true, steer: 0.15 });
  },
  perTick: (ctx) => {
    const tick = ctx.tick;

    // Every 60 ticks (0.5s sim), step the car across different RPM/gear speed bands (250 -> 850 -> 1450 -> 2050 UU/s)
    // and keep the ball in active midfield play so all 40 granular slices and spatial emitters are stressed.
    if (tick % 60 === 0) {
      const band = Math.floor(tick / 60) % 4;
      const targetSpeedY = band === 0 ? 280 : band === 1 ? 880 : band === 2 ? 1480 : 2080;
      const xOffset = (band - 1.5) * 350;
      ctx.setCarState(0, {
        pos: [xOffset, -1400 + band * 450, 17.01],
        vel: [band * 60 - 90, targetSpeedY, 0],
        angVel: [0, 0, (band % 2 === 0 ? 1 : -1) * 0.25],
        boost: 100,
      });
      if (tick % 240 === 0) {
        ctx.setBallState({
          pos: [xOffset, -750 + band * 350, 95 + (band % 2) * 180],
          vel: [-140 + band * 80, 1150 - band * 450, 160 + band * 90],
          angVel: [2.5, -1.5, 1.0],
        });
      }
    }

    // Update controls every 4 ticks (30Hz control modulation) to sweep RPM, boost, steer, and jumps
    if (tick % 4 === 0) {
      const cycle = tick % 240;
      const throttle =
        cycle < 160 ? 0.35 + 0.65 * Math.sin(tick * 0.07) : -0.8 * Math.cos(tick * 0.09);
      const steer = Math.sin(tick * 0.05) * 0.85;
      const boost = cycle < 110 || (cycle >= 140 && cycle < 190);
      const handbrake = cycle >= 160 && cycle < 188;
      const jump = cycle === 28 || cycle === 32 || cycle === 56 || cycle === 60;
      const pitch = jump ? -0.75 : Math.cos(tick * 0.06) * 0.3;
      const roll = cycle >= 30 && cycle < 75 ? 0.6 : 0;

      ctx.setLocalCarControls({
        throttle,
        steer,
        pitch,
        yaw: steer * 0.5,
        roll,
        jump,
        boost,
        handbrake,
      });
    }
  },
  steps: [
    {
      tick: 1,
      description: 'Verify Free Play Chaos Soak initialized in single-engine playing state',
      action: (ctx) => {
        const r = ctx.runtime;
        const mode = r?.match?.state?.mode;
        const isSingleEngine = !r?.authoritativeServer && !r?.networkReconciler;
        ctx.recordAssertion(
          'soak_freeplay_initialized',
          mode === 'freeplay' && isSingleEngine,
          `mode=${mode}, isSingleEngine=${isSingleEngine}`
        );
      },
    },
  ],
  teardown: async (ctx) => {
    const r = ctx.runtime;
    const btp = (
      r as unknown as {
        ballTrajectoryPredictor?: {
          forcePredictAnyMovement?: boolean;
          setRuntimeOverride?: (ov: { enabled: boolean } | null) => void;
        } | null;
      }
    )?.ballTrajectoryPredictor;
    if (btp) {
      btp.forcePredictAnyMovement = false;
      btp.setRuntimeOverride?.(null);
    }
    ctx.setLocalCarControls(null);
  },
};
