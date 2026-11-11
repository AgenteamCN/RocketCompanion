import React, { useState } from 'react';
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
import { parseRoomCode } from '../config/roomCodeConnectivityCodec';
import { OnlineRoomIdentityFields } from './online/OnlineRoomIdentityFields';
import {
  DEFAULT_JOIN_ROOM_STEPS,
  OnlineRoomCreationProgress,
  type CreationProgressStatus,
  type CreationStepSpec,
} from './online/OnlineRoomCreationProgress';
import { useOnlineRoomProgressController } from './online/useOnlineRoomProgressController';

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

export const DEFAULT_JOIN_ROOM_CONFIG: JoinRoomConfig = {
  playerName: `Player${Math.floor(1000 + Math.random() * 9000)}`,
  roomCode: '',
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

  const { panels, simulateLayer3Error } = useMenuLayoutStore();
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
    if (patch.playerName !== undefined && next.playerName) {
      setOnlineSession({ playerName: next.playerName });
    }
    overrides.onChange?.(next, patch);
  };

  const { playerName, roomCode, roomKey, allowSpectating } = resolvedConfig;
  const [hoveredDesc, setHoveredDesc] = useState<string | null>(null);

  const {
    progressStatus,
    currentStep,
    totalSteps,
    effectiveSteps,
    failAtStep,
    startSequence,
    cancelSequence,
  } = useOnlineRoomProgressController({
    mode: 'join',
    steps,
    controlledProgressStatus: propProgressStatus ?? overrides.progressStatus,
    controlledCurrentStep: propCurrentStep ?? overrides.currentStep,
    onProgressStatusChange: overrides.onProgressStatusChange,
    onCurrentStepChange: overrides.onCurrentStepChange,
  });

  const startJoinSequence = (willFail: boolean) => {
    const cleanCode = roomCode.trim();
    const parsedCode = parseRoomCode(cleanCode);
    if (!parsedCode) {
      failAtStep(1, undefined, undefined, cleanCode || undefined);
      return;
    }

    const canonicalCode = parsedCode.canonicalRoomCode;
    const cleanName = playerName.trim() || generateDefaultPlayerName();
    saveStoredPlayerName(cleanName);

    const finalConfig: JoinRoomConfig = {
      playerName: cleanName,
      roomCode: canonicalCode,
      roomKey,
      allowSpectating,
    };

    const joinViaBridge =
      !overrides.onJoinRoom && bridge.onJoinOnlineWarmup
        ? () =>
            bridge.onJoinOnlineWarmup!({
              roomId: canonicalCode,
              password: roomKey || undefined,
              playerName: cleanName,
            })
        : undefined;

    startSequence({
      roomCode: canonicalCode,
      willFail,
      executeAsyncLaunch: joinViaBridge,
      onSuccess: () => {
        setOnlineSession({
          playerName: cleanName,
          roomId: canonicalCode,
          password: roomKey || undefined,
        });
        setMatchMode('online-warmup');
        closeMenu();
      },
      onFailure: () => {
        setOnlineSession({
          roomId: '',
          signalingConnected: false,
          connectedPeers: [],
          pairingCode: undefined,
        });
      },
      onPreviewComplete: () => {
        setOnlineSession({
          playerName: cleanName,
          roomId: canonicalCode,
          password: roomKey || undefined,
        });
        overrides.onJoinRoom?.(finalConfig);
      },
    });
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
              totalSteps={totalSteps}
              steps={effectiveSteps}
              status={progressStatus}
              onRetry={() => {
                overrides.onRetryJoin?.();
                startJoinSequence(false);
              }}
              onCancel={() => {
                cancelSequence(() => {
                  bridge.onLeaveOnlineServer?.();
                  overrides.onCancelJoin?.();
                });
              }}
              isLight={isLight}
            />
          )}

          {simulateLayer3Error && <InlineErrorNotice isLight={isLight} />}

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={progressStatus === 'running'}
              onClick={() => startJoinSequence(simulateLayer3Error)}
              onMouseEnter={() =>
                setHoveredDesc('Join Room: Connect to the target peer-to-peer room using the room code and key.')
              }
              onMouseLeave={() => setHoveredDesc(null)}
              className="flex-1 py-2.5 px-6 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-70 text-neutral-950 font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all cursor-pointer disabled:cursor-wait shrink-0"
            >
              <Wifi className="h-3.5 w-3.5" />
              <span>
                {progressStatus === 'running'
                  ? `Joining Room (${currentStep}/${totalSteps})...`
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
