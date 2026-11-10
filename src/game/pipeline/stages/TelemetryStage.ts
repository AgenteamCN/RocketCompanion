/**
 * TelemetryStage.ts
 * Updates speedometer HUD needles, flip availability indicator (with countdown & unlimited state),
 * Layer 5A 6-slot player HUD roster strips, and finalizes frame profiling metrics.
 */
import {
  hudStore,
  useAppStore,
  useExperimentalMultiBotsStore,
  useReplayToRcsImporterStore,
  useReplayViewerStore,
  globalHudTransientChannel,
} from '../../runtimeUiPort.ts';
import {
  createResolvedModeRosterBuffer,
  resolveModeRosterEntries,
  type HudRosterSourceContext,
  type ReplayViewerRosterEntryInput,
} from './hudRosterResolverPipeline.ts';
import {
  buildHudTransientFramePayload,
  createHudTransientFrameBuffer,
  type CarHudTelemetry,
  type HudTransientCameraInput,
  type HudTransientPhysicsStateInput,
  type HudTransientRosterInput,
} from './hudTransientFramePipeline.ts';
import { buildRuntimeDiagnosticReport } from './runtimeDiagnosticReportBuilder.ts';
import type { FrameContext, PipelineStage } from '../FramePipeline.ts';

const _EMPTY_ARRAY: readonly never[] = [];

export class TelemetryStage implements PipelineStage {
  public runtime: any;
  private readonly _demolishedAtMsByCar: Record<number, number> = {};
  private readonly _carTelemetryScratch: CarHudTelemetry = {
    boostAmount: 33,
    isDemolished: false,
    demoRespawnRemainingSec: 0,
    demolishedAtMs: 0,
  };
  private _currentRlrcFrame: {
    cars?: ReadonlyArray<{
      slotIndex: number;
      boostAmount?: number;
      entityActive?: boolean;
    }>;
  } | null = null;
  private readonly _boundResolveCarTelemetry = (carIdx: number): CarHudTelemetry =>
    this._resolveCarHudTelemetry(carIdx, this._currentRlrcFrame);
  private readonly _rlrcResolvedRosterScratch: ReplayViewerRosterEntryInput[] = [];
  private readonly _rlrcResolvedPool: ReplayViewerRosterEntryInput[] = [];
  private readonly _ackJumpByCar = new Map<number, boolean>();
  private readonly _rosterBuffer = createResolvedModeRosterBuffer();
  private readonly _frameBuffer = createHudTransientFrameBuffer();
  private readonly _rosterSourceScratch: HudRosterSourceContext = {
    matchMode: 'freeplay',
    isReplayViewerLoaded: false,
  };
  private readonly _physicsInputScratch: HudTransientPhysicsStateInput = {
    ballPosX: 0,
    ballPosY: 0,
    ballPosZ: 0,
    ballVelX: 0,
    ballVelY: 0,
    ballVelZ: 0,
    resolveCarTelemetry: this._boundResolveCarTelemetry,
  };
  private readonly _cameraInputScratch: HudTransientCameraInput = {
    activeCameraCar: 0,
    replayCameraMode: undefined,
    perspectiveCamera: null,
  };
  private readonly _rosterInputScratch: HudTransientRosterInput = {
    blueEntries: _EMPTY_ARRAY,
    orangeEntries: _EMPTY_ARRAY,
    detectedLocalTeam: null,
    isSpectatingNoHuman: false,
  };
  private _hasPushedInitialRoster = false;
  private _hasPushedInitialMiniMap = false;

  constructor(runtime: any) {
    this.runtime = runtime;
    if (typeof window !== 'undefined') {
      (window as unknown as Record<string, unknown>).exportRuntimeDiagnosticReport = () =>
        buildRuntimeDiagnosticReport(this.runtime);
    }
  }

  private _resolveCarHudTelemetry(
    carIndex: number,
    rlrcCurrentFrame?: {
      cars?: ReadonlyArray<{
        slotIndex: number;
        boostAmount?: number;
        entityActive?: boolean;
      }>;
    } | null
  ): CarHudTelemetry {
    const r = this.runtime;
    const cv =
      r?.interpolator?.getCurrCarStateView?.(carIndex) || r?.physics?.getCarStateView?.(carIndex);
    let rlrcCar: {
      slotIndex: number;
      boostAmount?: number;
      entityActive?: boolean;
    } | null = null;
    const rlrcCars = rlrcCurrentFrame?.cars;
    if (rlrcCars) {
      if (carIndex < rlrcCars.length && rlrcCars[carIndex]?.slotIndex === carIndex) {
        rlrcCar = rlrcCars[carIndex];
      } else {
        for (let i = 0; i < rlrcCars.length; i++) {
          if (rlrcCars[i]?.slotIndex === carIndex) {
            rlrcCar = rlrcCars[i];
            break;
          }
        }
      }
    }
    const rawBoost =
      rlrcCar && typeof rlrcCar.boostAmount === 'number'
        ? rlrcCar.boostAmount
        : cv
          ? cv.boost || 0
          : 33;
    const boostAmount = Math.max(0, Math.min(100, Math.round(rawBoost)));
    const isDemolished =
      Boolean(cv && (cv.isDemoed || cv.demoRespawnTimer > 0)) ||
      Boolean(rlrcCar && !rlrcCar.entityActive);
    const demoRespawnRemainingSec = isDemolished
      ? Math.max(0, Math.round((cv?.demoRespawnTimer || 0) * 100) / 100)
      : 0;

    if (isDemolished) {
      if (!this._demolishedAtMsByCar[carIndex]) {
        this._demolishedAtMsByCar[carIndex] =
          typeof performance !== 'undefined' ? performance.now() : Date.now();
      }
    } else if (this._demolishedAtMsByCar[carIndex]) {
      this._demolishedAtMsByCar[carIndex] = 0;
    }

    const out = this._carTelemetryScratch;
    out.boostAmount = boostAmount;
    out.isDemolished = isDemolished;
    out.demoRespawnRemainingSec = demoRespawnRemainingSec;
    out.demolishedAtMs = this._demolishedAtMsByCar[carIndex] || 0;
    return out;
  }

  private _syncEdgeRosterHud(context: FrameContext, hudState: any): void {
    const r = this.runtime;
    const appState = useAppStore?.getState?.();
    const matchMode = r?.match?.state?.mode || appState?.matchMode || 'freeplay';
    const freeplayMode = r?.modeManager?.modes?.get?.('freeplay') || null;
    const replayViewer = freeplayMode?.standaloneReplayViewer || null;
    const rlrcSession = freeplayMode?.rlrcReplaySession || null;
    const isStandaloneLoaded =
      (matchMode === 'freeplay' || matchMode === 'replay-viewer') &&
      Boolean(replayViewer?.hasLoadedReplay);
    const isRlrcLoaded =
      (matchMode === 'freeplay' || matchMode === 'replay-viewer') &&
      Boolean(rlrcSession?.hasLoadedReplay);
    const useRlrcSession = isRlrcLoaded && Boolean(rlrcSession?.isActive || !isStandaloneLoaded);
    const isReplayViewerLoaded = isStandaloneLoaded || isRlrcLoaded;

    if (
      !isReplayViewerLoaded &&
      matchMode !== 'exp-multi-bots' &&
      matchMode !== 'match' &&
      matchMode !== 'online-warmup' &&
      matchMode !== 'dev-test-lab'
    ) {
      return;
    }

    const isReplayPov =
      (r?.match?.state?.phase === 'replay' || hudState?.matchPhase === 'replay') &&
      !r?.isGoalReplayCameraOverrideActive?.() &&
      typeof r?.replayPovCarIndex === 'number' &&
      r.replayPovCarIndex >= 0;

    const viewerRoster = replayViewer?.rosterSubController;
    const rlrcStoreState = useRlrcSession ? useReplayToRcsImporterStore.getState() : null;
    const rlrcRosterMeta: ReadonlyArray<{ slotIndex: number; userName: string; team: number }> =
      useRlrcSession ? (rlrcSession?.session?.roster ?? _EMPTY_ARRAY) : _EMPTY_ARRAY;
    const rlrcActivePovIdx = useRlrcSession
      ? typeof rlrcSession?.activePovSlotIndex === 'number'
        ? rlrcSession.activePovSlotIndex
        : (rlrcStoreState?.activePovCarIndex ?? 0)
      : 0;
    let rlrcActivePovTeam = 0;
    if (useRlrcSession) {
      let foundTeam: number | undefined;
      for (let i = 0; i < rlrcRosterMeta.length; i++) {
        if (rlrcRosterMeta[i].slotIndex === rlrcActivePovIdx) {
          foundTeam = rlrcRosterMeta[i].team;
          break;
        }
      }
      rlrcActivePovTeam = foundTeam ?? rlrcStoreState?.activePovTeam ?? 0;
    }
    const isRlrcIntervening = Boolean(rlrcSession?.isIntervening);
    let rlrcResolvedRoster: ReadonlyArray<ReplayViewerRosterEntryInput> | undefined;
    if (useRlrcSession) {
      const scratch = this._rlrcResolvedRosterScratch;
      const pool = this._rlrcResolvedPool;
      scratch.length = rlrcRosterMeta.length;
      for (let i = 0; i < rlrcRosterMeta.length; i++) {
        const m = rlrcRosterMeta[i];
        let slot = pool[i];
        const name = m.userName || `Player ${m.slotIndex + 1}`;
        const team = m.team === 1 ? 1 : 0;
        const isSelf = isRlrcIntervening && m.slotIndex === rlrcActivePovIdx;
        if (!slot) {
          slot = { carIndex: m.slotIndex, name, team, isSelf };
          pool[i] = slot;
        } else {
          slot.carIndex = m.slotIndex;
          slot.name = name;
          slot.team = team;
          slot.isSelf = isSelf;
        }
        scratch[i] = slot;
      }
      rlrcResolvedRoster = scratch;
    }

    this._currentRlrcFrame =
      useRlrcSession && !isRlrcIntervening
        ? (rlrcSession?.session?.frames120Hz?.[rlrcSession?.cursorFrame120Hz ?? 0] ?? null)
        : null;

    const activeCameraCar: number = isReplayViewerLoaded
      ? useRlrcSession
        ? rlrcActivePovIdx
        : typeof viewerRoster?.activePovCarIndex === 'number'
          ? viewerRoster.activePovCarIndex
          : (r?.playerCarIndex ?? 0)
      : isReplayPov
        ? r.replayPovCarIndex
        : typeof context?.activeCar === 'number'
          ? context.activeCar
          : typeof r?.playerCarIndex === 'number'
            ? r.playerCarIndex
            : 0;

    const expStore =
      matchMode === 'exp-multi-bots' ? useExperimentalMultiBotsStore.getState() : null;
    const activeMode = r?.modeManager?.getActiveMode?.();
    const modeSpawnedCars = activeMode?.rosterController?.spawnedCars;
    const expSpawnedCars =
      Array.isArray(modeSpawnedCars) && modeSpawnedCars.length > 0
        ? modeSpawnedCars
        : Array.isArray(expStore?.spawnedCars)
          ? expStore.spawnedCars
          : _EMPTY_ARRAY;

    const localCarIdx: number =
      typeof r?.networkReconciler?.localCarIndex === 'number' &&
      r.networkReconciler.localCarIndex >= 0
        ? r.networkReconciler.localCarIndex
        : typeof r?.reconciler?.localCarIndex === 'number' && r.reconciler.localCarIndex >= 0
          ? r.reconciler.localCarIndex
          : (r?.playerCarIndex ?? 0);

    const src = this._rosterSourceScratch;
    src.matchMode = matchMode;
    src.isReplayViewerLoaded = isReplayViewerLoaded;
    src.replayViewerState = isReplayViewerLoaded
      ? useRlrcSession
        ? rlrcStoreState?.viewerState
        : useReplayViewerStore.getState().viewerState
      : undefined;
    src.replayViewerActivePovTeam = useRlrcSession
      ? rlrcActivePovTeam
      : viewerRoster?.activePovTeam;
    src.replayViewerLocalTeam = useRlrcSession
      ? isRlrcIntervening
        ? rlrcActivePovTeam
        : 0
      : viewerRoster?.localTeam;
    src.replayViewerActivePovCarIndex = useRlrcSession
      ? rlrcActivePovIdx
      : viewerRoster?.activePovCarIndex;
    src.replayViewerResolvedRoster = useRlrcSession
      ? rlrcResolvedRoster
      : viewerRoster?.resolvedRoster;
    src.expPlayerParticipation = expStore?.playerParticipation;
    src.expSpawnedCars = expSpawnedCars;
    src.rawRosterSnapshot =
      r?.networkManager?.rosterSyncCoordinator?.lastRosterSnapshot ||
      r?.authoritativeServer?.lastRoomState?.roster;
    src.replayTimelineCarEntries = r?.replayTimelineController?.carEntries;
    src.connectedPeers = appState?.onlineSession?.connectedPeers;
    src.localPeerId = r?.multiplayerSession?.localPeerId || appState?.onlineSession?.localPeerId;
    src.localCarIdx = localCarIdx;
    src.participantTeams =
      r?.networkManager?.rosterSyncCoordinator?.participantTeams instanceof Map
        ? r.networkManager.rosterSyncCoordinator.participantTeams
        : null;
    src.arenaCarTeams = r?.arena?.carTeams;
    src.localPlayerName = r?.multiplayerSession?.playerName || appState?.onlineSession?.playerName;
    src.carNamesByIndex = r?.networkReconciler?.carNames;
    src.activeBotName = r?.activeBotName;
    src.numCars = r?.physics?.numCars;

    const { blueEntries, orangeEntries, isSpectatingNoHuman, detectedLocalTeam } =
      resolveModeRosterEntries(src, this._rosterBuffer);

    const ackJumpByCar = this._ackJumpByCar;
    if (ackJumpByCar.size > 0) ackJumpByCar.clear();
    const ackControls = r?.networkReconciler?.lastParsedPacket?.acknowledgedControls;
    if (Array.isArray(ackControls)) {
      for (let i = 0; i < ackControls.length; i++) {
        const item = ackControls[i];
        if (item && typeof item.carIndex === 'number') {
          ackJumpByCar.set(item.carIndex, Boolean(item.controls?.jump));
        }
      }
    }

    const ballView = r?.interpolator?.getCurrBallStateView?.() || r?.physics?.getBallStateView?.();
    const physIn = this._physicsInputScratch;
    physIn.ballPosX = ballView?.posX ?? 0;
    physIn.ballPosY = ballView?.posY ?? 0;
    physIn.ballPosZ = ballView?.posZ ?? 0;
    physIn.ballVelX = ballView?.velX ?? 0;
    physIn.ballVelY = ballView?.velY ?? 0;
    physIn.ballVelZ = ballView?.velZ ?? 0;

    const camIn = this._cameraInputScratch;
    camIn.activeCameraCar = activeCameraCar;
    camIn.replayCameraMode = hudState?.replayCameraMode;
    camIn.perspectiveCamera = r?.camera?.camera ?? null;

    const rosIn = this._rosterInputScratch;
    rosIn.blueEntries = blueEntries;
    rosIn.orangeEntries = orangeEntries;
    rosIn.detectedLocalTeam = detectedLocalTeam;
    rosIn.isSpectatingNoHuman = isSpectatingNoHuman;
    rosIn.choreographySignal = hudState?.choreographySignal;
    rosIn.matchPhase = hudState?.matchPhase;
    rosIn.localSkipReplayReady = Boolean(
      r?._localSkipReplayReady || r?.networkReconciler?.localSkipReplayReady
    );
    rosIn.acknowledgedJumpByCar = ackJumpByCar;

    const payload = buildHudTransientFramePayload(physIn, camIn, rosIn, this._frameBuffer);

    if (hudState && hudState.localTeam !== payload.localTeam) {
      hudState.setMatchState?.({ localTeam: payload.localTeam });
    }
    if (r) {
      r._lastHudSlotCarMap = payload.slotKeyToCarIndex;
    }

    if (payload.rosterDirty || !this._hasPushedInitialRoster) {
      this._hasPushedInitialRoster = true;
      globalHudTransientChannel.setRoster(payload.rosterPatch);
    }
    if (payload.miniMapDirty || !this._hasPushedInitialMiniMap) {
      this._hasPushedInitialMiniMap = true;
      globalHudTransientChannel.setMiniMap?.(payload.miniMap);
    }
  }

  public execute(context: FrameContext): void {
    const r = this.runtime;
    const { playerCarView } = context;
    const hudState = hudStore?.getState?.();

    if (playerCarView) {
      const hasFlipNow =
        !playerCarView.isDemoed && Boolean(playerCarView.isOnGround || playerCarView.hasFlipOrJump);
      const flipStatus = playerCarView.flipStatus;
      const flipRemainingSeconds = playerCarView.flipRemainingSeconds;
      const flipsRemaining = playerCarView.flipsRemaining;

      const carSpeed =
        typeof context.overrideCarSpeed === 'number'
          ? context.overrideCarSpeed
          : playerCarView.isDemoed
            ? 0
            : Math.hypot(playerCarView.velX, playerCarView.velY, playerCarView.velZ);
      hudState?.setHasFlip?.(hasFlipNow, flipStatus, flipRemainingSeconds, flipsRemaining);
      hudState?.setDemoRespawnState?.(
        playerCarView.isDemoed,
        playerCarView.demoRespawnTimer,
        playerCarView.demoSpawnSelection
      );
      hudState?.setCarSpeed?.(carSpeed);
    }

    this._syncEdgeRosterHud(context, hudStore?.getState?.() || hudState);

    if (r.profiler) {
      r.profiler.mark();
      const totalTicks = (r.pipeline?._accumSimTicks ?? 0) + (r.interpolator?.lastTicks ?? 0);
      const totalDropped = (r.pipeline?._accumSimDropped ?? 0) + (r.interpolator?.lastDropped ?? 0);
      const totalStalled = Boolean(r.pipeline?._accumSimStalled || r.interpolator?.lastStalled);
      const appState = useAppStore?.getState?.();
      const pauseTelemetryInPowerSave = appState?.telemetry?.pauseTelemetryInPowerSave !== false;
      const skipSample =
        Boolean(context.shouldSkipGpuRender) ||
        (pauseTelemetryInPowerSave && Boolean(r.isPowerSavingActive));
      r.profiler.frameEnd(totalTicks, totalDropped, totalStalled, skipSample);
    }
  }
}
