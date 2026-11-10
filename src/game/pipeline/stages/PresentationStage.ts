import type { CarControlsInput } from '../../../network/protocol/GlobalPayloadCodec.ts';
import type { FlipResetVisual } from '../../../effects/FlipResetVisual.ts';
import type { CarStateView } from '../../../physics/RocketSimStateViews.ts';
import type { FrameContext, PipelineStage } from '../FramePipeline.ts';

export interface PresentationStageRuntimePort {
  playerControls: CarControlsInput;
  neutralControls: CarControlsInput;
  playerThrottle: number;
  flipResetVisuals: Map<number, FlipResetVisual>;
  botCoordinator: { isBotMatch: boolean; botControls: CarControlsInput } | null;
  modeManager: {
    getActiveMode(): { getCarControls?(carIdx: number): unknown } | null;
  } | null;
  networkManager: {
    sessionCoordinator: {
      networkReconciler: {
        enableSmoothing: boolean;
        lobbyDualWorldMode?: boolean;
        lobbyPrevAuthoritativeState?: Float32Array | null;
        lobbyCurrAuthoritativeState?: Float32Array | null;
        historyBuffer: {
          lastRemoteControls?: Map<number, unknown>;
        };
        updateSmoothing(dt: number): { x: number; y: number; z: number } | null;
      } | null;
    };
    diagnosticsProbe: {
      multiWorldGhostRenderer?: {
        setVisible(visible: boolean): void;
        updateWorld(
          worldId: string,
          prevState: Float32Array,
          currState: Float32Array,
          alpha: number,
          dt: number,
          options: {
            paletteIndex: number;
            excludeCarIndices: number[];
            getCarControls: (carIdx: number) => CarControlsInput;
            showBall: boolean;
          }
        ): void;
      } | null;
    };
  } | null;
  arena: {
    cars?: Array<unknown>;
    update(
      prevState: Float32Array,
      currState: Float32Array,
      alpha: number,
      dt: number,
      car0Throttle: number,
      car0Controls: CarControlsInput,
      car1Controls: CarControlsInput,
      isMatchActive: boolean,
      getCarControls: (carIdx: number) => CarControlsInput
    ): void;
    updateSubjectShadows?(): void;
  } | null;
  interpolator: {
    prevState: Float32Array;
    currState: Float32Array;
    alpha: number;
    getCurrCarStateView(carIndex: number): CarStateView | null;
  } | null;
  cameraSubsystem: {
    syncArenaCameraMetadata(context: FrameContext): void;
    update(context: FrameContext): void;
  } | null;
  profiler: { mark(): void } | null;
}

/**
 * PresentationStage.ts
 * Synchronizes 3D scene meshes, wheel rotations, network smoothing offsets,
 * flip reset particle visualizers, and delegates camera updates.
 */
export class PresentationStage implements PipelineStage {
  public runtime: PresentationStageRuntimePort;

  constructor(runtime: PresentationStageRuntimePort) {
    this.runtime = runtime;
  }

  public execute(context: FrameContext): void {
    const r = this.runtime;
    const { dt, isMatchActive, activeCar } = context;
    const reconciler = r.networkManager?.sessionCoordinator?.networkReconciler ?? null;
    const botCoord = r.botCoordinator;

    const getCarControls = (carIdx: number): CarControlsInput => {
      const expCtrl = r.modeManager?.getActiveMode()?.getCarControls?.(carIdx) as
        CarControlsInput | null | undefined;
      if (expCtrl) return expCtrl;
      if (carIdx === activeCar) {
        return r.playerControls;
      }
      const remote = reconciler?.historyBuffer.lastRemoteControls?.get(carIdx) as
        (CarControlsInput & { controls?: CarControlsInput }) | undefined;
      const ctrl = remote?.controls ? remote.controls : remote;
      if (ctrl) return ctrl;
      if (botCoord?.isBotMatch && carIdx === 1) return botCoord.botControls || r.neutralControls;
      return r.neutralControls;
    };

    const car0Controls = getCarControls(0);
    const car0Throttle = activeCar === 0 ? r.playerThrottle : (car0Controls?.throttle ?? 0);
    const car1Controls = getCarControls(1);

    if (r.arena && r.interpolator) {
      r.cameraSubsystem?.syncArenaCameraMetadata(context);

      r.arena.update(
        r.interpolator.prevState,
        r.interpolator.currState,
        r.interpolator.alpha,
        dt,
        car0Throttle,
        car0Controls,
        car1Controls,
        isMatchActive,
        getCarControls
      );
    }

    if (reconciler) {
      const activeCarMesh = r.arena?.cars?.[activeCar] as
        { group?: { position: { x: number; y: number; z: number } } } | undefined;
      const smoothOffset = reconciler.updateSmoothing(dt);
      if (reconciler.enableSmoothing && activeCarMesh?.group && smoothOffset) {
        activeCarMesh.group.position.x += smoothOffset.x;
        activeCarMesh.group.position.y += smoothOffset.y;
        activeCarMesh.group.position.z += smoothOffset.z;
      }

      const ghostRenderer = r.networkManager?.diagnosticsProbe?.multiWorldGhostRenderer;
      if (
        reconciler.lobbyDualWorldMode &&
        reconciler.lobbyCurrAuthoritativeState &&
        ghostRenderer
      ) {
        ghostRenderer.setVisible(true);
        ghostRenderer.updateWorld(
          'lobby-remote',
          reconciler.lobbyPrevAuthoritativeState || reconciler.lobbyCurrAuthoritativeState,
          reconciler.lobbyCurrAuthoritativeState,
          r.interpolator?.alpha ?? 1.0,
          dt,
          {
            paletteIndex: 0,
            excludeCarIndices:
              typeof activeCar === 'number' && activeCar > 0
                ? [1, 2, 3, 4, 5, 6, 7, activeCar]
                : [1, 2, 3, 4, 5, 6, 7],
            getCarControls,
            showBall: true,
          }
        );
      }
    }

    let hasActiveFlipResetBloom = false;
    for (const [cIdx, visual] of r.flipResetVisuals.entries()) {
      const cView = r.interpolator?.getCurrCarStateView(cIdx);
      visual.update(dt, cView ? !cView.isDemoed : true);
      if (visual?.bloomActive) {
        hasActiveFlipResetBloom = true;
      }
    }
    context.hasActiveFlipResetBloom = hasActiveFlipResetBloom;

    r.cameraSubsystem?.update?.(context);
    r.arena?.updateSubjectShadows?.();

    if (r.profiler) r.profiler.mark();
  }
}
