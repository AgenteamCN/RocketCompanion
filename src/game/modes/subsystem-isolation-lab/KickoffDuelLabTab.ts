import { DEFAULT_CAR_CONTROLS } from '../../../ai/experimental/experimentalMultiCarObsPipeline.ts';
import type { BallStateView, CarStateView } from '../../../physics/RocketSimStateViews.ts';
import { useSubsystemIsolationLabStore } from '../../runtimeUiPort.ts';
import type { LabTabContext, LabTabController } from './LabTabTypes.ts';
import { classifyBallOutcome } from '../../../ai/KickoffV2SafeTensorsAgent.ts';
import { KICKOFF_DUEL_PAIRINGS } from '../../../ui-core/config/kickoffDuelConfig.ts';
import {
  type KickoffDuelAgentEnsemble,
  type KickoffStepTraceEntry,
  buildCarStepTraceEntry,
  createKickoffDuelHelpers,
  decideCarControlsForModel,
  ensureKickoffDuelModelsLoaded,
  resetKickoffDuelEnsemble,
  resetSimToKickoffSlotAndSettle,
} from './kickoffDuelSimulationPipeline.ts';
import {
  exportKickoffDuelDiagnosticsData,
  runFullKickoffDuelMatrixBenchmark,
} from './kickoffDuelBenchmarkPipeline.ts';

export class KickoffDuelEpisodeTracker {
  public tick = 0;
  public readonly slotIndex: number;
  public touched = false;
  public touchTick = -1;
  public touchWinner = 'NONE';
  public blueDistAtTouch = 0;
  public orangeDistAtTouch = 0;
  public ballSpeedAtTouch = 0;
  public ballVyAtTouch = 0;
  public inputsCutOff = false;
  public cutoffTick = -1;
  public postCutoffTicks = 0;
  public readonly blueSteps: KickoffStepTraceEntry[] = [];
  public readonly orangeSteps: KickoffStepTraceEntry[] = [];

  constructor(slotIndex: number) {
    this.slotIndex = slotIndex;
  }

  evaluateBallTouchAndCutoff(
    bs: BallStateView,
    c0: CarStateView,
    c1: CarStateView,
    cutoffDelayTicks: number
  ): boolean {
    const ballMoved =
      Math.hypot(bs.posX, bs.posY, bs.posZ - 93.15) > 0.8 ||
      Math.hypot(bs.velX, bs.velY, bs.velZ) > 5.0;

    if (!this.touched && ballMoved) {
      this.touched = true;
      this.touchTick = this.tick;
      const d0 = Math.hypot(c0.posX - bs.posX, c0.posY - bs.posY, c0.posZ - bs.posZ);
      const d1 = Math.hypot(c1.posX - bs.posX, c1.posY - bs.posY, c1.posZ - bs.posZ);
      this.blueDistAtTouch = Math.round(d0);
      this.orangeDistAtTouch = Math.round(d1);
      this.ballSpeedAtTouch = Math.round(Math.hypot(bs.velX, bs.velY, bs.velZ));
      this.ballVyAtTouch = Math.round(bs.velY);

      if (Math.abs(d0 - d1) <= 8.0) {
        this.touchWinner = 'TIE';
      } else if (d0 < d1) {
        this.touchWinner = 'BLUE';
      } else {
        this.touchWinner = 'ORANGE';
      }
    }

    if (this.touched && !this.inputsCutOff && this.tick >= this.touchTick + cutoffDelayTicks) {
      this.inputsCutOff = true;
      this.cutoffTick = this.tick;
    }

    return this.inputsCutOff;
  }

  recordPostCutoffTick(): void {
    this.postCutoffTicks++;
  }

  shouldSampleStepTrace(): boolean {
    return this.tick % 4 === 0 && this.blueSteps.length < 120;
  }

  recordStepTraces(blueEntry: KickoffStepTraceEntry, orangeEntry: KickoffStepTraceEntry): void {
    this.blueSteps.push(blueEntry);
    this.orangeSteps.push(orangeEntry);
  }

  advanceTick(): number {
    this.tick++;
    return this.tick;
  }

  shouldPublishTelemetry(): boolean {
    return (
      this.tick % 4 === 0 || this.tick === this.touchTick + 1 || this.tick === this.cutoffTick + 1
    );
  }

  buildLiveTelemetryPatch(
    bs: BallStateView,
    c0: CarStateView,
    c1: CarStateView,
    cutoffDelayTicks: number
  ): Record<string, unknown> {
    const d0Now = Math.round(Math.hypot(c0.posX - bs.posX, c0.posY - bs.posY, c0.posZ - bs.posZ));
    const d1Now = Math.round(Math.hypot(c1.posX - bs.posX, c1.posY - bs.posY, c1.posZ - bs.posZ));
    const bSpd = Math.round(Math.hypot(bs.velX, bs.velY, bs.velZ));
    const outcome = this.touched
      ? classifyBallOutcome(bs.posX, bs.posY, bs.velX, bs.velY)
      : 'Approaching Ball...';

    let phase = 'APPROACHING';
    if (this.inputsCutOff) {
      phase = 'INPUTS CUT OFF (OBSERVING BALL)';
    } else if (this.touched) {
      phase = `POST-TOUCH FOLLOW-THROUGH (${Math.max(0, this.touchTick + cutoffDelayTicks - this.tick)}f left)`;
    }

    return {
      kickoffDuelPhase: phase,
      kickoffDuelCurrentTick: this.tick,
      kickoffDuelTouchTick: this.touchTick,
      kickoffDuelTouchWinner: this.touchWinner,
      kickoffDuelInputsCutOff: this.inputsCutOff,
      kickoffDuelBlueDist: this.touched ? this.blueDistAtTouch : d0Now,
      kickoffDuelOrangeDist: this.touched ? this.orangeDistAtTouch : d1Now,
      kickoffDuelBallPos: [Math.round(bs.posX), Math.round(bs.posY), Math.round(bs.posZ)],
      kickoffDuelBallVel: [Math.round(bs.velX), Math.round(bs.velY), Math.round(bs.velZ)],
      kickoffDuelBallSpeed: bSpd,
      kickoffDuelBallOutcome: outcome,
      kickoffDuelLiveBlueSteps: this.blueSteps.slice(-16),
      kickoffDuelLiveOrangeSteps: this.orangeSteps.slice(-16),
    };
  }

  isEpisodeComplete(maxObservationTicks = 180): boolean {
    const timedOut = !this.touched && this.tick >= 420;
    const finishedObservation = this.inputsCutOff && this.postCutoffTicks >= maxObservationTicks;
    return finishedObservation || timedOut;
  }
}

export class KickoffDuelLabTab implements LabTabController {
  readonly tabId = 'kickoff-duel' as const;
  private ctx: LabTabContext | null = null;
  private kickoffDuelHelpers: KickoffDuelAgentEnsemble | null = null;
  private kickoffDuelRuntime: KickoffDuelEpisodeTracker | null = null;

  onActivate(ctx: LabTabContext): void {
    this.ctx = ctx;
    void this.setupBench();
  }

  onDeactivate(): void {
    this.kickoffDuelRuntime = null;
    this.ctx = null;
  }

  async setupBench(): Promise<void> {
    if (!this.ctx) return;
    const r = this.ctx.runtime;
    if (!r?.physics) return;
    const store = useSubsystemIsolationLabStore.getState();
    const epoch = this.ctx.getSwitchEpoch();

    if (!this.kickoffDuelHelpers) {
      this.kickoffDuelHelpers = createKickoffDuelHelpers(store.kickoffDuelChannelMode);
    }

    this.startEpisode();

    await r.arena?.ensureOpponent?.();
    await ensureKickoffDuelModelsLoaded([store.kickoffDuelBlueModel, store.kickoffDuelOrangeModel]);

    if (
      this.ctx?.getSwitchEpoch() !== epoch ||
      useSubsystemIsolationLabStore.getState().activeTab !== 'kickoff-duel'
    ) {
      return;
    }

    if (r.arena?.cars) {
      if (r.arena.cars[0]) {
        r.arena.cars[0].visible = true;
        r.arena.setCarTeam?.(0, 0);
      }
      if (r.arena.cars[1]) {
        r.arena.cars[1].visible = true;
        r.arena.setCarTeam?.(1, 1);
      }
      for (let i = 2; i < r.arena.cars.length; i++) {
        if (r.arena.cars[i]) r.arena.cars[i].visible = false;
      }
    }

    const mult = Math.max(100, Math.min(400, Number(store.kickoffDuelSpeedMultiplier) || 100));
    r.interpolator?.setTrainingPhysicsRate?.(Math.round(120 * (mult / 100)));

    this.startEpisode();
  }

  startEpisode(overrideSlotIndex: number | null = null): void {
    const r = this.ctx?.runtime;
    if (!r?.physics) return;
    const store = useSubsystemIsolationLabStore.getState();

    void ensureKickoffDuelModelsLoaded([store.kickoffDuelBlueModel, store.kickoffDuelOrangeModel]);

    const slotIdx =
      typeof overrideSlotIndex === 'number' ? overrideSlotIndex : (store.kickoffDuelSlotIndex ?? 0);

    resetSimToKickoffSlotAndSettle(r.physics, slotIdx);
    r.physics.clearEvents?.();
    r.arena?.resetAllCarEffects?.();
    r.interpolator?.sync?.();

    if (this.kickoffDuelHelpers) {
      this.kickoffDuelHelpers.koV2Blue.channelMode = store.kickoffDuelChannelMode;
      this.kickoffDuelHelpers.koV2Orange.channelMode = store.kickoffDuelChannelMode;
      this.kickoffDuelHelpers.expBlue.setBotType(
        store.kickoffDuelBlueModel === 'necto' ? 'necto' : 'nexto'
      );
      this.kickoffDuelHelpers.expOrange.setBotType(
        store.kickoffDuelOrangeModel === 'necto' ? 'necto' : 'nexto'
      );
      this.kickoffDuelHelpers = resetKickoffDuelEnsemble(this.kickoffDuelHelpers);
    }

    this.kickoffDuelRuntime = new KickoffDuelEpisodeTracker(slotIdx);

    store.updateLiveTelemetry({
      kickoffDuelSlotIndex: slotIdx,
      kickoffDuelPhase: 'APPROACHING',
      kickoffDuelCurrentTick: 0,
      kickoffDuelTouchTick: -1,
      kickoffDuelTouchWinner: 'NONE',
      kickoffDuelInputsCutOff: false,
      kickoffDuelBlueDist: 0,
      kickoffDuelOrangeDist: 0,
      kickoffDuelBallPos: [0, 0, 93.15],
      kickoffDuelBallVel: [0, 0, 0],
      kickoffDuelBallSpeed: 0,
      kickoffDuelBallOutcome: 'Waiting for First Touch...',
      kickoffDuelLiveBlueSteps: [],
      kickoffDuelLiveOrangeSteps: [],
    });
  }

  applySpeedMultiplier(mult: number): void {
    const r = this.ctx?.runtime;
    if (!r) return;
    const m = Math.max(100, Math.min(400, Number(mult) || 100));
    r.interpolator?.setTrainingPhysicsRate?.(Math.round(120 * (m / 100)));
  }

  runMatrixBenchmark(): Promise<void> {
    return runFullKickoffDuelMatrixBenchmark();
  }

  exportDiagnostics(format = 'json', scope = 'all_models_all_slots'): Promise<void> {
    return exportKickoffDuelDiagnosticsData(
      {
        blueSteps: this.kickoffDuelRuntime?.blueSteps || [],
        orangeSteps: this.kickoffDuelRuntime?.orangeSteps || [],
      },
      format,
      scope
    );
  }

  onPhysicsTick(_dt: number): boolean {
    const r = this.ctx?.runtime;
    const store = useSubsystemIsolationLabStore.getState();
    const sim = r?.physics;
    if (!sim || sim.numCars < 2 || !this.kickoffDuelRuntime || !this.kickoffDuelHelpers) {
      return true;
    }

    const rt = this.kickoffDuelRuntime;
    let helpers = this.kickoffDuelHelpers;

    const bs = sim.getBallStateView();
    const c0 = sim.getCarStateView(0);
    const c1 = sim.getCarStateView(1);

    const cutoffDelayTicks = Math.max(
      0,
      Math.round((store.kickoffDuelCutoffDelaySec ?? 0.5) * 120)
    );
    const isCutOff = rt.evaluateBallTouchAndCutoff(bs, c0, c1, cutoffDelayTicks);

    if (isCutOff) {
      sim.setControls(0, DEFAULT_CAR_CONTROLS);
      sim.setControls(1, DEFAULT_CAR_CONTROLS);
      rt.recordPostCutoffTick();
    } else {
      const blueModel = store.kickoffDuelBlueModel || 'ko_v2';
      const orangeModel = store.kickoffDuelOrangeModel || 'ko_v1';
      const decideOpts = {
        nextoScripted: Boolean(store.kickoffDuelNextoScripted),
        channelMode: store.kickoffDuelChannelMode || 'keyboard_coupled',
      };

      const dec0 = decideCarControlsForModel(sim, blueModel, 0, 0, rt.tick, helpers, decideOpts);
      helpers = dec0.nextHelpers;
      const dec1 = decideCarControlsForModel(sim, orangeModel, 1, 1, rt.tick, helpers, decideOpts);
      helpers = dec1.nextHelpers;
      this.kickoffDuelHelpers = helpers;

      if (rt.shouldSampleStepTrace()) {
        rt.recordStepTraces(
          buildCarStepTraceEntry(sim, blueModel, 0, rt.tick, helpers, dec0.controls),
          buildCarStepTraceEntry(sim, orangeModel, 1, rt.tick, helpers, dec1.controls)
        );
      }

      sim.setControls(0, dec0.controls);
      sim.setControls(1, dec1.controls);
    }

    rt.advanceTick();

    if (rt.shouldPublishTelemetry()) {
      store.updateLiveTelemetry(rt.buildLiveTelemetryPatch(bs, c0, c1, cutoffDelayTicks));
    }

    if (rt.isEpisodeComplete(180) && store.kickoffDuelAutoCycle) {
      const nextSlot = (rt.slotIndex + 1) % 5;
      if (nextSlot === 0 && store.kickoffDuelAutoCycleAllPairs) {
        const currentPairIdx = KICKOFF_DUEL_PAIRINGS.findIndex(
          (p) => p.blue === store.kickoffDuelBlueModel && p.orange === store.kickoffDuelOrangeModel
        );
        const nextPair = KICKOFF_DUEL_PAIRINGS[(currentPairIdx + 1) % KICKOFF_DUEL_PAIRINGS.length];
        store.updateLiveTelemetry({
          kickoffDuelBlueModel: nextPair.blue,
          kickoffDuelOrangeModel: nextPair.orange,
        });
      }
      this.startEpisode(nextSlot);
    }

    return true;
  }
}
