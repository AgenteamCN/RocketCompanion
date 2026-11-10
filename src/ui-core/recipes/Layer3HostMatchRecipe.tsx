import React, { useState, useEffect, useRef } from 'react';
import type { StandardSurfaceProps, SurfaceMeta } from '../manifest/surfaceMetaTypes';
import { PanelContainer, PanelHeader, PanelContent } from '../layout/Panel';
import { PanelFooter } from '../layout/PanelFooter';
import { useAppStore } from '../stores/appStore';
import { useMenuLayoutStore } from '../stores/menuLayoutStore';
import { useSignalingProfileStore } from '../stores/signalingProfileStore';
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
  applyConnectivityMaskToRoomCode,
  finalizeHostRoomCode,
} from '../config/roomCodeConnectivityCodec';
import {
  FORMAT_TO_GAME_MODE,
  GAME_MODE_TO_FORMAT,
} from './Layer2ManageRoomRecipe';
import {
  dispatchOnlineRoomErrorNotification,
  type CreationProgressStatus,
} from './online/OnlineRoomCreationProgress';
import type {
  HostMatchBotPolicy,
  HostMatchConfig,
  HostMatchDurationPreset,
  HostMatchTeamFormat,
} from './online/OnlineRoomConfigSummaryCard';
import {
  HostMatchMutatorAndRelaySection,
  type Layer3HostMatchStateOverride,
} from './layer-sections/HostMatchMutatorAndRelaySection';

export type {
  HostMatchBotPolicy,
  HostMatchConfig,
  HostMatchDurationPreset,
  HostMatchTeamFormat,
  Layer3HostMatchStateOverride,
};

export interface Layer3HostMatchRecipeProps extends StandardSurfaceProps {
  developerMode?: boolean;
  roomType?: 'match' | 'warmup';
  title?: string;
  defaultEditingConfig?: boolean;
  progressStatus?: CreationProgressStatus;
  currentStep?: number;
  stateOverride?: Layer3HostMatchStateOverride;
}

export const SURFACE_META: SurfaceMeta = {
  id: 'recipe:Layer3HostMatchRecipe',
  title: 'Host Match (Create Room)',
  subtitle: 'Create & host online peer-to-peer match lobby with 5-step initialization sequence',
  icon: 'Play',
  layer: 'layer3',
  menuGroup: 'menu-layer',
  defaultSizing: {
    width: 520,
    height: 500,
    minHeight: 220,
    maxHeight: 680,
    mode: 'adaptive',
  },
  variants: [
    {
      variantId: 'idle-collapsed',
      label: 'Idle (Summary Collapsed)',
      description: 'Default compact host match form showing 3-column configuration summary.',
      entryFile: 'recipes/online/OnlineRoomConfigSummaryCard.tsx',
      storeOverrides: {
        onlineRoomStore: { defaultEditingConfig: false, progressStatus: 'idle', currentStep: 1 },
      },
    },
    {
      variantId: 'idle-expanded',
      label: 'Idle (Configuration Expanded)',
      description: 'Expanded disclosure box showing Team Format, Bot Fill Policy, Match Duration, and Advanced Settings.',
      entryFile: 'recipes/online/OnlineRoomConfigSummaryCard.tsx',
      storeOverrides: {
        onlineRoomStore: { defaultEditingConfig: true, progressStatus: 'idle', currentStep: 1 },
      },
    },
    {
      variantId: 'running-step-3',
      label: 'Step 3/5 · Registering Room Code',
      description: 'Binding room access code and key on the peer discovery relay.',
      entryFile: 'recipes/online/OnlineRoomCreationProgress.tsx',
      storeOverrides: {
        onlineRoomStore: { defaultEditingConfig: false, progressStatus: 'running', currentStep: 3 },
      },
    },
    {
      variantId: 'completed',
      label: 'Step 5/5 · Room Created',
      description: 'Local 120Hz authority initialized and match lobby spawned.',
      entryFile: 'recipes/online/OnlineRoomCreationProgress.tsx',
      storeOverrides: {
        onlineRoomStore: { defaultEditingConfig: false, progressStatus: 'completed', currentStep: 5 },
      },
    },
    {
      variantId: 'error-step-3',
      label: 'Step 3/5 · Error (Code Conflict)',
      description: 'Room code conflict or relay rejection encountered during registration.',
      entryFile: 'recipes/online/OnlineRoomCreationProgress.tsx',
      storeOverrides: {
        onlineRoomStore: { defaultEditingConfig: false, progressStatus: 'error', currentStep: 3 },
      },
    },
  ],
};

export const DEFAULT_HOST_MATCH_CONFIG: HostMatchConfig = {
  playerName: `Player${Math.floor(1000 + Math.random() * 9000)}`,
  roomCode: '',
  roomKey: '',
  teamFormat: 'doubles',
  botPolicy: 'auto-fill',
  durationPreset: '300',
  customDurationSeconds: 180,
};

/**
 * [Recipe] Layer 3 Host Match (Create & Host Online Lobby)
 */
export const Layer3HostMatchRecipe: React.FC<Layer3HostMatchRecipeProps> = React.memo(({
  isLight = false,
  roomType: propRoomType,
  title: propTitle,
  defaultEditingConfig: propDefaultEditing,
  progressStatus: propProgressStatus,
  currentStep: propCurrentStep,
  onBack: propOnBack,
  stateOverride,
}) => {
  const appState = useScopedStore('appStore', useAppStore);
  const scopedRoom = useStoreSnapshotOverride<Layer3HostMatchStateOverride>('onlineRoomStore');
  const overrides: Layer3HostMatchStateOverride = {
    ...scopedRoom,
    ...stateOverride,
  };

  const {
    goBack: storeGoBack,
    closeMenu,
    setMatchMode,
    onlineSession,
    setOnlineSession,
    bridge,
  } = appState;

  const hostMask = useSignalingProfileStore((s) => s.hostMask);
  const verifyRelays = useSignalingProfileStore((s) => s.verifyRelays);
  const { panels, setToken } = useMenuLayoutStore();
  const sizing = panels['layer3-host-match'];

  const resolvedRoomType: 'match' | 'warmup' =
    propRoomType ??
    overrides.roomType ??
    (onlineSession?.roomType === 'warmup' ? 'warmup' : 'match');
  const title = propTitle ?? overrides.title;
  const defaultEditingConfig =
    propDefaultEditing ?? overrides.defaultEditingConfig ?? false;
  const onBack = propOnBack ?? storeGoBack;

  const [internalConfig, setInternalConfig] = useState<HostMatchConfig>(() => ({
    ...DEFAULT_HOST_MATCH_CONFIG,
    playerName:
      onlineSession?.playerName && onlineSession.playerName !== 'Host'
        ? onlineSession.playerName
        : loadStoredPlayerName(),
    roomCode: onlineSession?.roomId || '',
    roomKey: onlineSession?.password || '',
    teamFormat: GAME_MODE_TO_FORMAT[onlineSession?.gameMode || '2v2'] || 'doubles',
    botPolicy:
      onlineSession?.botFillMode === 'no_bots'
        ? 'none'
        : onlineSession?.botFillMode === 'bots_vs_humans'
        ? 'vs-ai'
        : 'auto-fill',
    durationPreset:
      onlineSession?.matchDurationSeconds === 90
        ? '90'
        : onlineSession?.matchDurationSeconds === 180
        ? '180'
        : onlineSession?.matchDurationSeconds === 300
        ? '300'
        : 'custom',
    customDurationSeconds: onlineSession?.matchDurationSeconds ?? 180,
    ...overrides.defaultConfig,
  }));

  useEffect(() => {
    let cancelled = false;
    void verifyRelays().then((probedMask) => {
      if (cancelled) return;
      setInternalConfig((prev) => ({
        ...prev,
        roomCode: prev.roomCode.trim()
          ? applyConnectivityMaskToRoomCode(prev.roomCode, probedMask)
          : '',
      }));
    });
    return () => {
      cancelled = true;
    };
  }, [verifyRelays]);

  const resolvedConfig: HostMatchConfig = {
    ...internalConfig,
    ...overrides.config,
  };

  const updateConfig = (patch: Partial<HostMatchConfig>) => {
    const next: HostMatchConfig = {
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

  const {
    playerName,
    roomCode,
    roomKey,
    teamFormat,
    botPolicy,
    durationPreset,
    customDurationSeconds,
  } = resolvedConfig;

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

  const resolvedDurationSeconds =
    durationPreset === 'custom' ? customDurationSeconds : Number(durationPreset);

  const commitHostLaunch = (cleanCode: string) => {
    const cleanName = playerName.trim() || generateDefaultPlayerName();
    saveStoredPlayerName(cleanName);
    const botFillMode =
      botPolicy === 'none'
        ? 'no_bots'
        : botPolicy === 'vs-ai'
        ? 'bots_vs_humans'
        : botPolicy === 'custom'
        ? 'custom'
        : 'auto_fill';
    const gameMode = FORMAT_TO_GAME_MODE[teamFormat] || '2v2';
    const finalConfig: HostMatchConfig = {
      playerName: cleanName,
      roomCode: cleanCode,
      roomKey,
      teamFormat,
      botPolicy,
      durationPreset,
      customDurationSeconds: resolvedDurationSeconds,
    };

    setOnlineSession({
      playerName: cleanName,
      roomId: cleanCode,
      password: roomKey || undefined,
      roomType: resolvedRoomType,
      gameMode,
      botFillMode,
      matchDurationSeconds: resolvedDurationSeconds,
    });

    if (overrides.onStartHost) {
      overrides.onStartHost(finalConfig);
      return;
    }

    if (bridge.onHostOnlineWarmup) {
      void bridge
        .onHostOnlineWarmup({
          roomId: cleanCode,
          password: roomKey || undefined,
          playerName: cleanName,
          roomType: resolvedRoomType,
          gameMode,
          botFillMode,
          durationSeconds: resolvedDurationSeconds,
          lobbyMode: resolvedRoomType === 'match',
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

  const startStepSequence = (willFail: boolean) => {
    clearStepTimer();
    const cleanCode = finalizeHostRoomCode(roomCode, hostMask);
    if (cleanCode !== roomCode) {
      updateConfig({ roomCode: cleanCode });
    }

    if (controlledProgressStatus !== undefined) {
      commitHostLaunch(cleanCode);
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
        if (next >= 5) {
          clearStepTimer();
          setProgressStatus('completed');
          commitHostLaunch(cleanCode);
          return 5;
        }
        return next;
      });
    }, 520);
  };

  return (
    <PanelContainer isLight={isLight} sizing={sizing} className="w-full select-none">
      <PanelHeader
        title={title ?? (resolvedRoomType === 'warmup' ? 'HOST ONLINE WARMUP' : 'HOST MATCH')}
        onBack={onBack}
        isLight={isLight}
      />

      <PanelContent scrollable={true} className="flex flex-col justify-between gap-3">
        <HostMatchMutatorAndRelaySection
          resolvedConfig={resolvedConfig}
          updateConfig={updateConfig}
          defaultEditingConfig={defaultEditingConfig}
          overrides={overrides}
          progress={{
            progressStatus,
            currentStep,
            steps: overrides.steps,
            onLaunchSequence: startStepSequence,
            onRetrySequence: () => {
              overrides.onRetryHost?.();
              startStepSequence(false);
            },
            onCancelSequence: () => {
              clearStepTimer();
              setProgressStatus('idle');
              setCurrentStep(1);
              setToken('simulateLayer3Error', false);
              bridge.onLeaveOnlineServer?.();
              overrides.onCancelHost?.();
            },
          }}
          onHoverDesc={setHoveredDesc}
          isLight={isLight}
        />
      </PanelContent>

      <PanelFooter
        isLight={isLight}
        defaultDescription="Configure player identity, room code & key, and match configuration."
        hoveredDescription={hoveredDesc}
      />
    </PanelContainer>
  );
});

Layer3HostMatchRecipe.displayName = 'Layer3HostMatchRecipe';
