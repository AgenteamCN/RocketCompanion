import React, { useState, useEffect, useRef } from 'react';
import { Eye, Wifi } from 'lucide-react';
import type { StandardSurfaceProps, SurfaceMeta } from '../manifest/surfaceMetaTypes';
import { PanelContainer, PanelHeader, PanelContent } from '../layout/Panel';
import { PanelFooter } from '../layout/PanelFooter';
import { InlineErrorNotice } from '../primitives/InlineErrorNotice';
import { SettingToggleRow } from '../compounds/SettingToggleRow';
import { useAppStore } from '../stores/appStore';
import { useMenuLayoutStore } from '../stores/menuLayoutStore';
import { useSettingActionRowStore } from '../stores/settingRowStore';
import {
  useScopedStore,
  useStoreSnapshotOverride,
} from '../stores/storeSnapshotScope';
import {
  generateDefaultPlayerName,
  loadStoredPlayerName,
  saveStoredPlayerName,
} from '../config/vehiclePresets';
import {
  generateRandomRoomCode,
  parseRoomCode,
} from '../config/roomCodeConnectivityCodec';
import { OnlineRoomIdentityFields } from './online/OnlineRoomIdentityFields';
import {
  OnlineRoomCreationProgress,
  dispatchOnlineRoomErrorNotification,
  type CreationProgressStatus,
  type CreationStepSpec,
} from './online/OnlineRoomCreationProgress';

export interface JoinRoomConfig {
  playerName: string;
  roomCode: string;
  roomKey: string;
  allowSpectating: boolean;
}

export interface Layer3JoinRoomStateOverride {
  config?: Partial<JoinRoomConfig>;
  defaultConfig?: Partial<JoinRoomConfig>;
  onChange?: (next: JoinRoomConfig, patch: Partial<JoinRoomConfig>) => void;
  onJoinRoom?: (config: JoinRoomConfig) => void;
  progressStatus?: CreationProgressStatus;
  currentStep?: number;
  steps?: CreationStepSpec[];
  onProgressStatusChange?: (status: CreationProgressStatus) => void;
  onCurrentStepChange?: (step: number) => void;
  onRetryJoin?: () => void;
  onCancelJoin?: () => void;
  onNavigateGarageSync?: () => void;
  onNavigateSignalingConfig?: () => void;
}

export interface Layer3JoinRoomRecipeProps extends StandardSurfaceProps {
  progressStatus?: CreationProgressStatus;
  currentStep?: number;
  stateOverride?: Layer3JoinRoomStateOverride;
}

export const SURFACE_META: SurfaceMeta = {
  id: 'recipe:Layer3JoinRoomRecipe',
  title: 'Join Room (Client Join)',
  subtitle: 'Connect to peer-to-peer room via room code, optional key, and daisy-chain spectating relay',
  icon: 'Wifi',
  layer: 'layer3',
  menuGroup: 'menu-layer',
  defaultSizing: {
    width: 500,
    height: 440,
    minHeight: 200,
    maxHeight: 640,
    mode: 'adaptive',
  },
  variants: [
    {
      variantId: 'idle',
      label: 'Idle Form',
      description: 'Initial join room form prior to initiating peer signaling handshake.',
      entryFile: 'recipes/Layer3JoinRoomRecipe.tsx',
      storeOverrides: {
        onlineRoomStore: { progressStatus: 'idle', currentStep: 1 },
      },
    },
    {
      variantId: 'running-step-2',
      label: 'Step 2/5 · Signaling Handshake',
      description: 'Connecting to WebSocket signaling relay (wss://relay.carball.dev).',
      entryFile: 'recipes/online/OnlineRoomCreationProgress.tsx',
      storeOverrides: {
        onlineRoomStore: { progressStatus: 'running', currentStep: 2 },
      },
    },
    {
      variantId: 'running-step-4',
      label: 'Step 4/5 · ICE & DataChannel',
      description: 'Negotiating WebRTC SDP offers and probing STUN/TURN candidates.',
      entryFile: 'recipes/online/OnlineRoomCreationProgress.tsx',
      storeOverrides: {
        onlineRoomStore: { progressStatus: 'running', currentStep: 4 },
      },
    },
    {
      variantId: 'completed',
      label: 'Step 5/5 · Connected',
      description: 'Arena snapshot synchronized and ready to enter peer lobby.',
      entryFile: 'recipes/online/OnlineRoomCreationProgress.tsx',
      storeOverrides: {
        onlineRoomStore: { progressStatus: 'completed', currentStep: 5 },
      },
    },
    {
      variantId: 'error-step-3',
      label: 'Step 3/5 · Error (Room Not Found)',
      description: 'Room lookup failed or access key was rejected during step 3.',
      entryFile: 'recipes/online/OnlineRoomCreationProgress.tsx',
      storeOverrides: {
        onlineRoomStore: { progressStatus: 'error', currentStep: 3 },
      },
    },
  ],
};

export const DEFAULT_JOIN_ROOM_STEPS: CreationStepSpec[] = [
  {
    step: 1,
    stageTitle: 'Validating Room Code & Key',
    description: 'Verifying room code checksum and preparing client authentication payload...',
    errorTitle: 'Invalid Room Code',
    errorDescription: 'Room code is empty or failed checksum validation. Please enter a valid room code.',
  },
  {
    step: 2,
    stageTitle: 'Connecting Signaling Relay',
    description: 'Establishing WebSocket handshake with signaling server (wss://relay.carball.dev)...',
    errorTitle: 'Signaling Handshake Timed Out',
    errorDescription: 'Could not reach wss://relay.carball.dev/signaling within 10s (ERR_CONNECTION_TIMED_OUT).',
  },
  {
    step: 3,
    stageTitle: 'Resolving Host Room Session',
    description: 'Looking up active host session and verifying room access key...',
    errorTitle: 'Room Not Found or Key Mismatch',
    errorDescription: 'No active room matched this code, or the room access key was rejected.',
  },
  {
    step: 4,
    stageTitle: 'Negotiating WebRTC ICE & DataChannel',
    description: 'Exchanging SDP offers, probing STUN/TURN candidates, and opening P2P channels...',
    errorTitle: 'ICE / NAT Traversal Failed',
    errorDescription: 'Could not establish peer-to-peer or TURN relay transport with the host.',
  },
  {
    step: 5,
    stageTitle: 'Synchronizing Arena & Joining Lobby',
    description: 'Receiving initial match snapshot, registering spectating relay preference, and entering lobby...',
    errorTitle: 'Lobby Sync Aborted',
    errorDescription: 'Host closed the lobby before initial state synchronization completed.',
  },
];

export const DEFAULT_JOIN_ROOM_CONFIG: JoinRoomConfig = {
  playerName: `Player${Math.floor(1000 + Math.random() * 9000)}`,
  roomCode: generateRandomRoomCode(0x0f),
  roomKey: '',
  allowSpectating: true,
};

/**
 * [Recipe] Layer 3 Join Room (Connect to Peer Lobby)
 */
export const Layer3JoinRoomRecipe: React.FC<Layer3JoinRoomRecipeProps> = React.memo(({
  isLight = false,
  progressStatus: propProgressStatus,
  currentStep: propCurrentStep,
  onBack: propOnBack,
  stateOverride,
}) => {
  const appState = useScopedStore('appStore', useAppStore);
  const scopedRoom = useStoreSnapshotOverride<Layer3JoinRoomStateOverride>('onlineRoomStore');
  const overrides: Layer3JoinRoomStateOverride = {
    ...scopedRoom,
    ...stateOverride,
  };

  const {
    goBack: storeGoBack,
    navigate,
    closeMenu,
    setMatchMode,
    setSettingsTargetTab,
    setHighlightSetting,
    onlineSession,
    setOnlineSession,
    bridge,
  } = appState;

  const { panels, simulateLayer3Error, setToken } = useMenuLayoutStore();
  const sizing = panels['layer3-join-room'];
  const { rowGap, paddingX } = useSettingActionRowStore();
  const onBack = propOnBack ?? storeGoBack;
  const steps = overrides.steps ?? DEFAULT_JOIN_ROOM_STEPS;

  const [internalConfig, setInternalConfig] = useState<JoinRoomConfig>(() => ({
    playerName:
      overrides.defaultConfig?.playerName ??
      (onlineSession?.playerName && onlineSession.playerName !== 'Host'
        ? onlineSession.playerName
        : loadStoredPlayerName()),
    roomCode:
      overrides.defaultConfig?.roomCode ??
      (onlineSession?.roomId || DEFAULT_JOIN_ROOM_CONFIG.roomCode),
    roomKey: overrides.defaultConfig?.roomKey ?? (onlineSession?.password || ''),
    allowSpectating:
      overrides.defaultConfig?.allowSpectating ?? DEFAULT_JOIN_ROOM_CONFIG.allowSpectating,
  }));

  const resolvedConfig: JoinRoomConfig = {
    ...internalConfig,
    ...overrides.config,
  };

  const updateConfig = (patch: Partial<JoinRoomConfig>) => {
    const next: JoinRoomConfig = {
      ...resolvedConfig,
      ...patch,
    };
    if (overrides.config === undefined) {
      setInternalConfig(next);
    }
    if (next.playerName) {
      setOnlineSession({ playerName: next.playerName });
    }
    overrides.onChange?.(next, patch);
  };

  const { playerName, roomCode, roomKey, allowSpectating } = resolvedConfig;
  const [hoveredDesc, setHoveredDesc] = useState<string | null>(null);

  const [internalProgressStatus, setInternalProgressStatus] =
    useState<CreationProgressStatus>('idle');
  const [internalCurrentStep, setInternalCurrentStep] = useState<number>(1);
  const controlledProgressStatus = propProgressStatus ?? overrides.progressStatus;
  const controlledCurrentStep = propCurrentStep ?? overrides.currentStep;
  const progressStatus = controlledProgressStatus ?? internalProgressStatus;
  const currentStep = controlledCurrentStep ?? internalCurrentStep;

  const setProgressStatus = (status: CreationProgressStatus) => {
    if (controlledProgressStatus === undefined) {
      setInternalProgressStatus(status);
    }
    overrides.onProgressStatusChange?.(status);
  };

  const setCurrentStep = (stepOrUpdater: number | ((prev: number) => number)) => {
    const nextStep =
      typeof stepOrUpdater === 'function' ? stepOrUpdater(currentStep) : stepOrUpdater;
    if (controlledCurrentStep === undefined) {
      setInternalCurrentStep(nextStep);
    }
    overrides.onCurrentStepChange?.(nextStep);
  };

  const stepTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const clearStepTimer = () => {
    if (stepTimerRef.current) {
      clearInterval(stepTimerRef.current);
      stepTimerRef.current = null;
    }
  };

  useEffect(() => () => clearStepTimer(), []);

  const commitJoinRoom = (cleanCode: string) => {
    const cleanName = playerName.trim() || generateDefaultPlayerName();
    saveStoredPlayerName(cleanName);
    const finalConfig: JoinRoomConfig = {
      playerName: cleanName,
      roomCode: cleanCode,
      roomKey,
      allowSpectating,
    };

    setOnlineSession({
      playerName: cleanName,
      roomId: cleanCode,
      password: roomKey || undefined,
    });

    if (overrides.onJoinRoom) {
      overrides.onJoinRoom(finalConfig);
      return;
    }

    if (bridge.onJoinOnlineWarmup) {
      void bridge
        .onJoinOnlineWarmup({
          roomId: cleanCode,
          password: roomKey || undefined,
          playerName: cleanName,
        })
        .then((ok) => {
          if (ok) {
            setMatchMode('online-warmup');
            closeMenu();
          } else {
            setProgressStatus('error');
          }
        });
    }
  };

  const startJoinSequence = (willFail: boolean) => {
    clearStepTimer();
    const cleanCode = roomCode.trim();
    const parsedCode = parseRoomCode(cleanCode);
    if (!parsedCode) {
      setCurrentStep(1);
      setProgressStatus('error');
      setToken('simulateLayer3Error', true);
      dispatchOnlineRoomErrorNotification();
      return;
    }

    if (controlledProgressStatus !== undefined) {
      commitJoinRoom(parsedCode.canonicalRoomCode);
      return;
    }

    setToken('simulateLayer3Error', false);
    setInternalCurrentStep(1);
    setProgressStatus('running');

    stepTimerRef.current = setInterval(() => {
      setInternalCurrentStep((prev) => {
        const next = prev + 1;
        overrides.onCurrentStepChange?.(next);
        if (willFail && next === 3) {
          clearStepTimer();
          setProgressStatus('error');
          setToken('simulateLayer3Error', true);
          dispatchOnlineRoomErrorNotification();
          return 3;
        }
        if (next >= (steps?.length ?? 5)) {
          clearStepTimer();
          setProgressStatus('completed');
          commitJoinRoom(parsedCode.canonicalRoomCode);
          return steps?.length ?? 5;
        }
        return next;
      });
    }, 520);
  };

  const handleNavigateGarageSync =
    overrides.onNavigateGarageSync ?? (() => navigate('garage'));
  const handleNavigateSignalingConfig =
    overrides.onNavigateSignalingConfig ??
    (() => {
      setSettingsTargetTab('advanced');
      setHighlightSetting('signaling-credential-bundle');
      navigate('settings');
    });

  return (
    <PanelContainer isLight={isLight} sizing={sizing} className="w-full select-none">
      <PanelHeader title="JOIN ROOM" onBack={onBack} isLight={isLight} />

      <PanelContent scrollable={true} className="flex flex-col justify-between gap-4">
        <div className="flex flex-col w-full" style={{ gap: `${Math.max(8, rowGap)}px` }}>
          <OnlineRoomIdentityFields
            identity={{
              playerName,
              onPlayerNameChange: (val) => updateConfig({ playerName: val }),
              roomCode,
              onRoomCodeChange: (val) => updateConfig({ roomCode: val }),
              roomKey,
              onRoomKeyChange: (val) => updateConfig({ roomKey: val }),
            }}
            showRandomize={false}
            onNotYouClick={handleNavigateGarageSync}
            onSignalingConfigClick={handleNavigateSignalingConfig}
            onHoverDesc={setHoveredDesc}
            isLight={isLight}
          />

          <SettingToggleRow
            icon={Eye}
            iconColor="text-emerald-400"
            title="Allow Spectating"
            description="Stay connected to signaling relay so spectators can daisy-chain through you and reduce host upload load."
            checked={allowSpectating}
            onChange={(val) => updateConfig({ allowSpectating: val })}
            bordered={false}
            showDescription={false}
            hoverDescription="Allow Spectating: Default ON. Keeps a lightweight signaling session so other spectators can daisy-chain through your client, saving Host P2P upload bandwidth."
            onHover={(desc) => desc && setHoveredDesc(desc)}
            onLeave={() => setHoveredDesc(null)}
            isLight={isLight}
          />
        </div>

        <div
          style={{
            paddingLeft: `${Math.max(0, paddingX)}px`,
            paddingRight: `${Math.max(0, paddingX)}px`,
          }}
          className="flex flex-col gap-2 shrink-0"
        >
          {progressStatus !== 'idle' && (
            <OnlineRoomCreationProgress
              currentStep={currentStep}
              totalSteps={steps?.length ?? 5}
              steps={steps}
              status={progressStatus}
              onRetry={() => {
                overrides.onRetryJoin?.();
                startJoinSequence(false);
              }}
              onCancel={() => {
                clearStepTimer();
                setProgressStatus('idle');
                setCurrentStep(1);
                setToken('simulateLayer3Error', false);
                bridge.onLeaveOnlineServer?.();
                overrides.onCancelJoin?.();
              }}
              isLight={isLight}
            />
          )}

          {simulateLayer3Error && <InlineErrorNotice isLight={isLight} />}

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => startJoinSequence(simulateLayer3Error)}
              onMouseEnter={() =>
                setHoveredDesc('Join Room: Connect to the target peer-to-peer room using the room code and key.')
              }
              onMouseLeave={() => setHoveredDesc(null)}
              className="flex-1 py-2.5 px-6 rounded-xl bg-amber-500 hover:bg-amber-400 text-neutral-950 font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all cursor-pointer shrink-0"
            >
              <Wifi className="h-3.5 w-3.5" />
              <span>
                {progressStatus === 'running'
                  ? `Joining Room (${currentStep}/${steps?.length ?? 5})...`
                  : progressStatus === 'completed'
                  ? 'Connected · Reconnect'
                  : 'Join Room'}
              </span>
            </button>
          </div>
        </div>
      </PanelContent>

      <PanelFooter
        isLight={isLight}
        defaultDescription="Enter player name, room code, optional key, and spectating relay preference to join."
        hoveredDescription={hoveredDesc}
      />
    </PanelContainer>
  );
});

Layer3JoinRoomRecipe.displayName = 'Layer3JoinRoomRecipe';
