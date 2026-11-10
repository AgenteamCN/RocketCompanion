import type {
  AppStorePortState,
  ExperimentalMultiBotsStorePortState,
  FloatingStorePort,
  FloatingStoreSnapshotPort,
  HudStorePortState,
  KickoffTrainingStorePortState,
  NetworkDiagnosticsSnapshotPort,
  NetworkDiagnosticsStoreMethods,
  PendingSubscriberEntry,
  QuickNotificationStorePortState,
  ReferenceOverlayStorePortState,
  ReplayToRcsImporterStorePortState,
  ReplayViewerStorePortState,
  RewinderStorePortState,
  SpatialAudioStorePortState,
  StaticTrainingBallCamTunerStorePortState,
  StaticTrainingPackStorePortState,
  StoreBoundTarget,
  StoreListener,
  StoreProxy,
  SubsystemIsolationLabStorePortState,
} from './runtimeUiStorePortTypes.ts';

export const DEFAULT_STATIC_TRAINING_BALL_CAM_CONFIG = {
  fov: 110,
  distance: 330,
  height: 400,
  angle: -45,
  lateralOffset: 150,
  editBallOpacity: 0.7,
  enableEditOpacityOverride: true,
  expiredBallOpacity: 0.7,
  arrowOpacity: 0.78,
  shadowOpacity: 0.52,
  shadowScale: 1.18,
  haloScale: 95,
  coneRadius: 20,
  coneLength: 58,
  tipRadius: 2.5,
  shaftRadius: 7.0,
  arrowBaseLength: 155,
  arrowMaxExtraLength: 300,
  arrowHeightOffset: 32,
  arrowForwardOffset: 18,
};

export function createStoreProxy<T extends object, M extends object = Record<string, never>>(
  initialFallback: Partial<T> = {},
  extraMethods: M = {} as M
): StoreProxy<T, M> {
  let boundStore: StoreBoundTarget<T> | null = null;
  const pendingSubscribers = new Set<PendingSubscriberEntry<T>>();
  const pendingMethodCalls: Array<[string, unknown[]]> = [];
  let fallbackState: Record<string, unknown> = {
    ...(initialFallback as Record<string, unknown>),
    registerRuntimeCallbacks(callbacks: unknown) {
      pendingMethodCalls.push(['registerRuntimeCallbacks', [callbacks]]);
    },
    setRuntimeHandlers(handlers: unknown) {
      pendingMethodCalls.push(['setRuntimeHandlers', [handlers]]);
    },
  };

  const proxyRecord: Record<string, unknown> = {
    ...extraMethods,
    _bind(store: unknown) {
      if (boundStore === store) return;
      boundStore = (store as StoreBoundTarget<T>) ?? null;
      if (boundStore && (typeof boundStore === 'object' || typeof boundStore === 'function')) {
        for (const [k, v] of Object.entries(boundStore)) {
          if (typeof v === 'function' && !(k in proxyRecord)) {
            proxyRecord[k] = (...args: unknown[]) => {
              const fn = boundStore?.[k];
              return typeof fn === 'function'
                ? (fn as (...a: unknown[]) => unknown)(...args)
                : undefined;
            };
          }
        }
        for (const k of Object.keys(extraMethods)) {
          if (typeof boundStore[k] === 'function') {
            proxyRecord[k] = (...args: unknown[]) => {
              const fn = boundStore?.[k];
              return typeof fn === 'function'
                ? (fn as (...a: unknown[]) => unknown)(...args)
                : undefined;
            };
          }
        }
        const liveState =
          typeof boundStore.getState === 'function'
            ? (boundStore.getState() as Record<string, unknown>)
            : typeof boundStore.getSnapshot === 'function'
              ? (boundStore.getSnapshot() as Record<string, unknown>)
              : null;
        if (liveState && pendingMethodCalls.length > 0) {
          for (const [methodName, args] of pendingMethodCalls.splice(0)) {
            const targetFn = liveState[methodName];
            if (typeof targetFn === 'function') {
              (targetFn as (...a: unknown[]) => unknown)(...args);
            }
          }
        }
        if (typeof boundStore.subscribe === 'function' && pendingSubscribers.size > 0) {
          for (const entry of pendingSubscribers) {
            entry.unsub = boundStore.subscribe(entry.listener);
            if (liveState !== null) {
              try {
                entry.listener(liveState as unknown as T, liveState as unknown as T);
              } catch {
                // Ignore listener sync errors during initial port binding
              }
            }
          }
          pendingSubscribers.clear();
        }
      }
    },
    getState(): T {
      if (!boundStore) return fallbackState as unknown as T;
      if (typeof boundStore.getState === 'function') return boundStore.getState();
      if (typeof boundStore.getSnapshot === 'function') return boundStore.getSnapshot();
      return fallbackState as unknown as T;
    },
    setState(
      partial:
        Partial<T> | Record<string, unknown> | ((state: T) => Partial<T> | Record<string, unknown>),
      replace?: boolean
    ): T {
      if (boundStore && typeof boundStore.setState === 'function') {
        return boundStore.setState(partial, replace);
      }
      if (typeof partial === 'function') {
        fallbackState = { ...fallbackState, ...partial(fallbackState as unknown as T) };
      } else if (partial && typeof partial === 'object') {
        fallbackState = replace ? { ...partial } : { ...fallbackState, ...partial };
      }
      return fallbackState as unknown as T;
    },
    subscribe(listener: StoreListener<T>): () => boolean | void {
      if (typeof listener !== 'function') return () => false;
      if (boundStore && typeof boundStore.subscribe === 'function') {
        return boundStore.subscribe(listener);
      }
      const entry: PendingSubscriberEntry<T> = { listener, unsub: null };
      pendingSubscribers.add(entry);
      return () => {
        pendingSubscribers.delete(entry);
        return typeof entry.unsub === 'function' ? entry.unsub() : false;
      };
    },
    getSnapshot(): T {
      if (boundStore && typeof boundStore.getSnapshot === 'function') {
        return boundStore.getSnapshot();
      }
      return (boundStore && typeof boundStore.getState === 'function'
        ? boundStore.getState()
        : fallbackState) as unknown as T;
    },
  };
  return proxyRecord as unknown as StoreProxy<T, M>;
}

export function createFloatingStoreProxy(): FloatingStorePort {
  return {
    _bound: null,
    _pendingSubscribers: new Set(),
    _bind(store: unknown) {
      this._bound = (store as FloatingStorePort['_bound']) ?? null;
      if (
        this._bound &&
        typeof this._bound.subscribe === 'function' &&
        this._pendingSubscribers.size > 0
      ) {
        for (const entry of this._pendingSubscribers) {
          entry.unsub = this._bound.subscribe(entry.listener);
        }
        this._pendingSubscribers.clear();
      }
    },
    getSnapshot() {
      return this._bound ? this._bound.getSnapshot() : { windows: [] };
    },
    subscribe(listener) {
      if (typeof listener !== 'function') return () => false;
      if (this._bound) return this._bound.subscribe(listener);
      const entry: PendingSubscriberEntry<FloatingStoreSnapshotPort> = { listener, unsub: null };
      this._pendingSubscribers.add(entry);
      return () => {
        this._pendingSubscribers.delete(entry);
        return typeof entry.unsub === 'function' ? entry.unsub() : false;
      };
    },
    openWindow(id: string) {
      return this._bound?.openWindow?.(id);
    },
    closeWindow(id: string) {
      return this._bound?.closeWindow?.(id);
    },
    toggleWindow(id: string) {
      return this._bound?.toggleWindow?.(id);
    },
  };
}

export function createRuntimeUiStoreProxies() {
  const useAppStore = createStoreProxy<AppStorePortState>({
    isMenuOpen: false,
    isOpen: false,
    activeRoute: 'main-menu',
    matchMode: 'freeplay',
    cameraMode: 'ball',
    isFreeCam: false,
    freeCamFov: 110,
    touchMode: false,
    touchHeadlessMode: false,
    touchInputAgent: false,
    onlineSession: { role: 'none', status: 'idle', peers: [] },
  });

  const useHudStore = createStoreProxy<HudStorePortState>({
    matchPhase: 'PLAYING',
    replayProgress: 0,
    scoreBlue: 0,
    scoreOrange: 0,
    localTeam: 0,
    boost: 33,
    speedKph: 0,
    setMatchState: () => {},
    setReplayState: () => {},
    clearReplayState: () => {},
  });

  const useSpatialAudioStore = createStoreProxy<SpatialAudioStorePortState>({
    selectedAnthem: 'MX_CelebrationStadium_Stingers_0001',
    randomAnthemScope: 'all',
    randomAnthemCategory: 'TrainStation',
    isGarageAnthemTabActive: false,
    previewingAnthemId: null,
    previewSource: null,
    activeGoalAnthemId: null,
    anthemLinearPhase: 0,
    anthemBlend: 0,
    isGoalReplaySkipped: false,
    bgmEnabled: false,
    bgmVolume: 75,
    bgmScenes: {
      freePlay: true,
      singlePlayerTraining: true,
      multiplayerTraining: false,
      match: false,
    },
    realisticBgmEnabled: true,
    bgmCategorizedMode: true,
    bgmDeselectedVolumes: [],
    bgmDeselectedTrackNames: [],
    bgmTracks: [],
    bgmVolumes: [],
    bgmCurrentTrackId: null,
    bgmCurrentTrackTitle: null,
    bgmIsPlaying: false,
    bgmLinearPhase: 1,
    bgmBlend: 1,
    tunerConfig: {},
    setGoalReplaySkipped: () => {},
    setActiveGoalAnthemId: () => {},
    setPreviewingAnthemId: () => {},
    setAnthemTransitionState: () => {},
    setBgmPlaybackState: () => {},
    setBgmTransitionState: () => {},
  });

  const useSubsystemIsolationLabStore = createStoreProxy<SubsystemIsolationLabStorePortState>({
    activePresetId: 'default',
    liveTelemetry: {},
    updateLiveTelemetry: () => {},
  });

  const useRewinderStore = createStoreProxy<RewinderStorePortState>({
    rewinderState: 'idle',
    currentFrameIndex: 0,
    totalFrames: 0,
  });

  const useReplayViewerStore = createStoreProxy<ReplayViewerStorePortState>({
    viewerState: 'idle',
    currentFrameIndex: 0,
    totalFrames: 0,
  });

  const useReplayToRcsImporterStore = createStoreProxy<ReplayToRcsImporterStorePortState>({
    viewerState: 'idle',
    currentFrameIndex: 0,
    totalFrames: 0,
  });

  const useExperimentalMultiBotsStore = createStoreProxy<ExperimentalMultiBotsStorePortState>({});
  const useStaticTrainingPackStore = createStoreProxy<StaticTrainingPackStorePortState>({
    liveTelemetry: {},
  });
  const useStaticTrainingBallCamTunerStore =
    createStoreProxy<StaticTrainingBallCamTunerStorePortState>(
      DEFAULT_STATIC_TRAINING_BALL_CAM_CONFIG
    );
  const useKickoffTrainingStore = createStoreProxy<KickoffTrainingStorePortState>({});
  const useReferenceOverlayStore = createStoreProxy<ReferenceOverlayStorePortState>({});
  const useNameTagTunerStore = createStoreProxy<Record<string, unknown>>({});
  const useQuickNotificationStore = createStoreProxy<QuickNotificationStorePortState>({
    pushNotification: () => {},
    dismissNotification: () => {},
  });

  const networkDiagnosticsStore = createStoreProxy<
    NetworkDiagnosticsSnapshotPort,
    NetworkDiagnosticsStoreMethods
  >(
    {},
    {
      setSession: () => {},
      toggleBurstDrop: () => {},
      setExtraLatency: () => {},
      setTestCarAudioEnabled: () => {},
      setLobbyGhostMode: () => {},
      syncZeroGFleetState: () => {},
      registerBridge: () => {},
      updateDiagnosticBuffers: () => {},
    }
  );

  const determinismStore = createStoreProxy<
    Record<string, unknown>,
    { setHarness(harness: unknown): void }
  >({}, { setHarness: () => {} });

  const eventStreamStore = createStoreProxy<
    Record<string, unknown>,
    { addEvent(event: Record<string, unknown>): void }
  >({}, { addEvent: () => {} });

  const reachabilityStore = createStoreProxy<
    Record<string, unknown>,
    { getConfig(): Record<string, unknown>; publishTelemetry(telemetry: unknown): void }
  >({}, { getConfig: () => ({}), publishTelemetry: () => {} });

  const ballTrajectoryTunerStore = createStoreProxy<
    Record<string, unknown>,
    {
      publishTelemetry(telemetry: unknown): void;
      resetTelemetryCounters(): void;
      getNotifyAnomalyAlerts(): boolean;
      registerAnomalyHandlers(
        handlers: {
          exportJson: (includeAll?: boolean) => void;
          copyJson: (includeAll?: boolean) => Promise<boolean>;
          resetAndArmNext: () => void;
          clearSamples: () => void;
        } | null
      ): void;
    }
  >(
    {},
    {
      publishTelemetry: () => {},
      resetTelemetryCounters: () => {},
      getNotifyAnomalyAlerts: () => true,
      registerAnomalyHandlers: () => {},
    }
  );

  const floatingStore = createFloatingStoreProxy();

  return {
    useAppStore,
    useHudStore,
    hudStore: useHudStore,
    useSpatialAudioStore,
    useSubsystemIsolationLabStore,
    useRewinderStore,
    useReplayViewerStore,
    useReplayToRcsImporterStore,
    useExperimentalMultiBotsStore,
    useStaticTrainingPackStore,
    useStaticTrainingBallCamTunerStore,
    useKickoffTrainingStore,
    useReferenceOverlayStore,
    useNameTagTunerStore,
    useQuickNotificationStore,
    networkDiagnosticsStore,
    determinismStore,
    eventStreamStore,
    reachabilityStore,
    ballTrajectoryTunerStore,
    floatingStore,
  };
}
