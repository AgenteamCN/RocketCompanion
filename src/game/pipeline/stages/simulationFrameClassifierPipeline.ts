export interface ActiveModeSimulationPort {
  directorPreview?: { isReplayActive?: boolean } | null;
  lifecycleController?: { podiumDelayTicks?: number } | null;
  rewinderController?: {
    isBlockingLivePhysics?: boolean;
    getRewinderState?(): string;
  } | null;
  standaloneReplayViewer?: {
    isActive?: boolean;
    hasLoadedReplay?: boolean;
    isIntervening?: boolean;
    getViewerState?(): string;
  } | null;
  rlrcReplaySession?: {
    isActive?: boolean;
    hasLoadedReplay?: boolean;
    isIntervening?: boolean;
    getPhase?(): string;
  } | null;
  replayController?: { sessionState?: { isPaused?: boolean } | null } | null;
  replaySession?: {
    replayController?: { sessionState?: { isPaused?: boolean } | null } | null;
  } | null;
  onBeforePhysicsTick?(): boolean | void;
  onStepPhysicsTick?(): boolean | void;
  onAfterPhysicsTick?(): void;
  onPhysicsEvent?(event: unknown): void;
}

export interface SimulationMatchStateSnapshot {
  mode: string;
  phase: string;
  paused?: boolean;
  scorer?: number | null;
  scorerCarIndex?: number | null;
}

export interface SimulationFrameExecutionFlags {
  readonly isPodiumActive: boolean;
  readonly isMatchEnded: boolean;
  readonly isLocalDirectorPreview: boolean;
  readonly isGoalReplay: boolean;
  readonly isMinimizedOffline: boolean;
  readonly isLocalReplayControllerStepping: boolean;
  readonly shouldHoldAccumulator: boolean;
  readonly isMatchActive: boolean;
  readonly shouldSynthesizeTickEvents: boolean;
}

export function evaluateSimulationFrameFlags(params: {
  readonly matchState: SimulationMatchStateSnapshot;
  readonly activeMode: ActiveModeSimulationPort | null;
  readonly isPodiumControllerActive: boolean;
  readonly hasReconciler: boolean;
  readonly hasServer: boolean;
}): SimulationFrameExecutionFlags {
  const { matchState, activeMode, isPodiumControllerActive, hasReconciler, hasServer } = params;
  const { mode, phase, paused } = matchState;

  const isPodiumActive = Boolean(isPodiumControllerActive || phase === 'podium');
  const isExpPodiumDelayActive =
    mode === 'exp-multi-bots' &&
    phase === 'ended' &&
    (activeMode?.lifecycleController?.podiumDelayTicks ?? 0) > 0;
  const isMatchEnded =
    (mode === 'match' || mode === 'exp-multi-bots') &&
    (phase === 'ended' || phase === 'podium') &&
    !isExpPodiumDelayActive;
  const isLocalDirectorPreview = Boolean(activeMode?.directorPreview?.isReplayActive);
  const isGoalReplay =
    isLocalDirectorPreview ||
    ((mode === 'match' ||
      mode === 'exp-multi-bots' ||
      mode === 'freeplay' ||
      mode === 'replay-viewer' ||
      mode === 'static-training-pack') &&
      phase === 'replay');

  const isMinimizedOffline =
    typeof document !== 'undefined' && Boolean(document.hidden) && !hasReconciler && !hasServer;

  const isLocalReplayControllerStepping = Boolean(
    isLocalDirectorPreview ||
    activeMode?.rewinderController?.isBlockingLivePhysics ||
    activeMode?.standaloneReplayViewer?.isActive ||
    activeMode?.rlrcReplaySession?.isActive
  );

  const shouldHoldAccumulator =
    Boolean(paused && !isLocalReplayControllerStepping) ||
    isMatchEnded ||
    isGoalReplay ||
    isMinimizedOffline;

  const modeReplayCtrl =
    activeMode?.replayController ?? activeMode?.replaySession?.replayController;
  const isGoalReplayPaused = Boolean(isGoalReplay && modeReplayCtrl?.sessionState?.isPaused);
  const isStandaloneViewerPaused = Boolean(
    activeMode?.standaloneReplayViewer?.hasLoadedReplay &&
    activeMode.standaloneReplayViewer.getViewerState?.() === 'paused'
  );
  const isRlrcViewerPaused = Boolean(
    activeMode?.rlrcReplaySession?.hasLoadedReplay &&
    activeMode.rlrcReplaySession.getPhase?.() === 'paused-viewer'
  );
  const isRewinderPausedScrub = Boolean(
    activeMode?.rewinderController &&
    activeMode.rewinderController.getRewinderState?.() === 'paused-scrub'
  );
  const isReplayPaused =
    isGoalReplayPaused || isStandaloneViewerPaused || isRlrcViewerPaused || isRewinderPausedScrub;
  const isMatchPhaseEndedOrPodium = phase === 'ended' || phase === 'podium';
  const isMatchActive =
    !isReplayPaused &&
    !isMatchPhaseEndedOrPodium &&
    (mode === 'freeplay' ||
      mode === 'replay-viewer' ||
      mode === 'kickoff-training' ||
      mode === 'dev-test-lab' ||
      mode === 'exp-multi-bots' ||
      mode === 'static-training-pack' ||
      (!paused && (phase === 'playing' || phase === 'kickoff' || phase === 'goal')));

  const isStandaloneViewerPassive = Boolean(
    activeMode?.standaloneReplayViewer?.isActive && !activeMode.standaloneReplayViewer.isIntervening
  );
  const isRlrcSessionPassive = Boolean(
    activeMode?.rlrcReplaySession?.isActive && !activeMode.rlrcReplaySession.isIntervening
  );
  const shouldSynthesizeTickEvents = !isStandaloneViewerPassive && !isRlrcSessionPassive;

  return {
    isPodiumActive,
    isMatchEnded,
    isLocalDirectorPreview,
    isGoalReplay,
    isMinimizedOffline,
    isLocalReplayControllerStepping,
    shouldHoldAccumulator,
    isMatchActive,
    shouldSynthesizeTickEvents,
  };
}
