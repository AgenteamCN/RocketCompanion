import React, { useState, useEffect } from 'react';
import { Ghost, Play } from 'lucide-react';
import type { StandardSurfaceProps, SurfaceMeta } from '../manifest/surfaceMetaTypes';
import { PanelContainer, PanelHeader, PanelContent } from '../layout/Panel';
import { PanelFooter } from '../layout/PanelFooter';
import { SettingSegmentedRow } from '../compounds/SettingSegmentedRow';
import { InlineErrorNotice } from '../primitives/InlineErrorNotice';
import { useAppStore } from '../stores/appStore';
import { useMenuLayoutStore } from '../stores/menuLayoutStore';
import { useSettingActionRowStore } from '../stores/settingRowStore';
import { useSignalingProfileStore } from '../stores/signalingProfileStore';
import {
  useScopedStore,
  useStoreSnapshotOverride,
} from '../stores/storeSnapshotScope';
import {
  applyConnectivityMaskToRoomCode,
  finalizeHostRoomCode,
  generateRandomRoomCode,
} from '../config/roomCodeConnectivityCodec';
import {
  generateDefaultPlayerName,
  loadStoredPlayerName,
  saveStoredPlayerName,
} from '../config/vehiclePresets';
import { OnlineRoomIdentityFields } from './online/OnlineRoomIdentityFields';
import {
  DEFAULT_HOST_CREATION_STEPS,
  OnlineRoomCreationProgress,
  type CreationProgressStatus,
} from './online/OnlineRoomCreationProgress';
import { useOnlineRoomProgressController } from './online/useOnlineRoomProgressController';

export type HostTrainingGhostMode = 'automatically-enable' | 'manual';

export interface HostTrainingConfig {
  playerName: string;
  roomCode: string;
  roomKey: string;
  ghostMode: HostTrainingGhostMode;
}

export interface Layer3HostTrainingStateOverride {
  defaultConfig?: Partial<HostTrainingConfig>;
  defaultGhostMode?: HostTrainingGhostMode;
  progressStatus?: CreationProgressStatus;
  currentStep?: number;
  onStartTraining?: (config: HostTrainingConfig) => void;
  onNavigateGarageSync?: () => void;
  onNavigateSignalingConfig?: () => void;
}

export interface Layer3HostTrainingRecipeProps extends StandardSurfaceProps {
  defaultConfig?: Partial<HostTrainingConfig>;
  defaultGhostMode?: HostTrainingGhostMode;
  progressStatus?: CreationProgressStatus;
  currentStep?: number;
  className?: string;
  stateOverride?: Layer3HostTrainingStateOverride;
}

export const SURFACE_META: SurfaceMeta = {
  id: 'recipe:Layer3HostTrainingRecipe',
  title: 'Host Training (Online Training)',
  subtitle: 'Create shared online co-op training room with ghost collision mode and 5-step initialization',
  icon: 'Ghost',
  layer: 'layer3',
  menuGroup: 'menu-layer',
  defaultSizing: {
    width: 500,
    height: 420,
    minHeight: 200,
    maxHeight: 620,
    mode: 'adaptive',
  },
  variants: [
    {
      variantId: 'idle',
      label: 'Idle Form',
      description: 'Default host training setup with identity fields and Ghost Mode policy.',
      entryFile: 'recipes/Layer3HostTrainingRecipe.tsx',
      storeOverrides: {
        onlineRoomStore: {
          defaultGhostMode: 'automatically-enable',
          progressStatus: 'idle',
          currentStep: 1,
        },
      },
    },
    {
      variantId: 'running-step-3',
      label: 'Step 3/5 · Registering Training Room',
      description: 'Registering shared training session code on signaling relay.',
      entryFile: 'recipes/online/OnlineRoomCreationProgress.tsx',
      storeOverrides: {
        onlineRoomStore: {
          defaultGhostMode: 'automatically-enable',
          progressStatus: 'running',
          currentStep: 3,
        },
      },
    },
    {
      variantId: 'completed',
      label: 'Step 5/5 · Training Room Ready',
      description: 'Shared training session initialized and ready for peers.',
      entryFile: 'recipes/online/OnlineRoomCreationProgress.tsx',
      storeOverrides: {
        onlineRoomStore: {
          defaultGhostMode: 'manual',
          progressStatus: 'completed',
          currentStep: 5,
        },
      },
    },
    {
      variantId: 'error-step-3',
      label: 'Step 3/5 · Error (Signaling Rejected)',
      description: 'Simulated signaling or registration failure on step 3.',
      entryFile: 'recipes/online/OnlineRoomCreationProgress.tsx',
      storeOverrides: {
        onlineRoomStore: {
          defaultGhostMode: 'automatically-enable',
          progressStatus: 'error',
          currentStep: 3,
        },
      },
    },
  ],
};

/**
 * [Recipe] Layer 3 Host Training
 */
export const Layer3HostTrainingRecipe: React.FC<Layer3HostTrainingRecipeProps> = React.memo(({
  isLight = true,
  defaultConfig: propDefaultConfig,
  defaultGhostMode: propDefaultGhostMode,
  progressStatus: propProgressStatus,
  currentStep: propCurrentStep,
  onBack: propOnBack,
  className = '',
  stateOverride,
}) => {
  const appState = useScopedStore('appStore', useAppStore);
  const scopedRoom = useStoreSnapshotOverride<Layer3HostTrainingStateOverride>('onlineRoomStore');
  const overrides: Layer3HostTrainingStateOverride = {
    ...scopedRoom,
    ...stateOverride,
  };

  const {
    goBack: storeGoBack,
    navigate,
    closeMenu,
    setMatchMode,
    onlineSession,
    setOnlineSession,
    bridge,
    setSettingsTargetTab,
    setHighlightSetting,
  } = appState;
  const hostMask = useSignalingProfileStore((s) => s.hostMask);
  const verifyRelays = useSignalingProfileStore((s) => s.verifyRelays);
  const onBack = propOnBack ?? storeGoBack;

  const resolvedDefaultConfig = propDefaultConfig ?? overrides.defaultConfig;
  const resolvedDefaultGhostMode =
    propDefaultGhostMode ?? overrides.defaultGhostMode ?? resolvedDefaultConfig?.ghostMode ?? 'automatically-enable';

  const [playerName, setPlayerName] = useState<string>(() =>
    resolvedDefaultConfig?.playerName ??
      (onlineSession?.playerName && onlineSession.playerName !== 'Host'
        ? onlineSession.playerName
        : loadStoredPlayerName())
  );
  const [roomCode, setRoomCode] = useState<string>(
    resolvedDefaultConfig?.roomCode ?? onlineSession?.roomId ?? ''
  );
  const [roomKey, setRoomKey] = useState<string>(
    resolvedDefaultConfig?.roomKey ?? onlineSession?.password ?? ''
  );
  const [ghostMode, setGhostMode] = useState<HostTrainingGhostMode>(resolvedDefaultGhostMode);
  useEffect(() => {
    setGhostMode(resolvedDefaultGhostMode);
  }, [resolvedDefaultGhostMode]);
  const [hoveredDesc, setHoveredDesc] = useState<string | null>(null);

  const { panels, simulateLayer3Error } = useMenuLayoutStore();
  const sizing = panels['layer3-host-training'];
  const { rowGap, paddingX } = useSettingActionRowStore();

  useEffect(() => {
    let cancelled = false;
    void verifyRelays().then((probedMask) => {
      if (cancelled) return;
      setRoomCode((prev) =>
        prev.trim() ? applyConnectivityMaskToRoomCode(prev, probedMask) : ''
      );
    });
    return () => {
      cancelled = true;
    };
  }, [verifyRelays]);

  const {
    progressStatus,
    currentStep,
    totalSteps,
    effectiveSteps,
    startSequence,
    cancelSequence,
  } = useOnlineRoomProgressController({
    mode: 'host',
    steps: DEFAULT_HOST_CREATION_STEPS,
    controlledProgressStatus: propProgressStatus ?? overrides.progressStatus,
    controlledCurrentStep: propCurrentStep ?? overrides.currentStep,
  });

  const handleRandomizeCode = () => {
    const code = generateRandomRoomCode(hostMask);
    setRoomCode(code);
  };

  const handleSignalingConfigJump = () => {
    if (overrides.onNavigateSignalingConfig) {
      overrides.onNavigateSignalingConfig();
      return;
    }
    setSettingsTargetTab('advanced');
    setHighlightSetting('signaling-credential-bundle');
    navigate('settings');
  };

  const startStepSequence = (willFail: boolean) => {
    const cleanCode = finalizeHostRoomCode(roomCode, hostMask);
    setRoomCode(cleanCode);

    const cleanName = playerName.trim() || generateDefaultPlayerName();
    saveStoredPlayerName(cleanName);
    const finalConfig: HostTrainingConfig = {
      playerName: cleanName,
      roomCode: cleanCode,
      roomKey,
      ghostMode,
    };

    const sessionPatch = {
      playerName: cleanName,
      roomId: cleanCode,
      password: roomKey || undefined,
      roomType: 'warmup',
      gameMode: '3v3',
      botFillMode: 'no_bots',
      matchDurationSeconds: 0,
    } as const;

    const hostViaBridge =
      !overrides.onStartTraining && bridge.onHostOnlineWarmup
        ? () => {
            setOnlineSession(sessionPatch);
            return bridge.onHostOnlineWarmup!({
              roomId: cleanCode,
              password: roomKey || undefined,
              playerName: cleanName,
              roomType: 'warmup',
              gameMode: '3v3',
              botFillMode: 'no_bots',
              durationSeconds: 0,
              lobbyMode: false,
              ghostMode,
            });
          }
        : undefined;

    startSequence({
      roomCode: cleanCode,
      willFail,
      executeAsyncLaunch: hostViaBridge,
      onSuccess: () => {
        setMatchMode('online-warmup');
        closeMenu();
      },
      onPreviewComplete: () => {
        setOnlineSession(sessionPatch);
        overrides.onStartTraining?.(finalConfig);
      },
    });
  };

  return (
    <PanelContainer
      isLight={isLight}
      sizing={sizing}
      className={`w-full select-none ${className}`}
    >
      <PanelHeader isLight={isLight} title="HOST TRAINING" onBack={onBack} />

      <PanelContent scrollable={true} className="flex flex-col justify-between gap-4">
        <div
          data-layout="host-training-list"
          className="flex flex-col w-full"
          style={{ gap: `${Math.max(8, rowGap)}px` }}
        >
          <OnlineRoomIdentityFields
            isLight={isLight}
            identity={{
              playerName,
              onPlayerNameChange: setPlayerName,
              roomCode,
              onRoomCodeChange: setRoomCode,
              roomKey,
              onRoomKeyChange: setRoomKey,
            }}
            showRandomize={true}
            onRandomizeRoomCode={handleRandomizeCode}
            onNotYouClick={overrides.onNavigateGarageSync ?? (() => navigate('garage'))}
            onSignalingConfigClick={handleSignalingConfigJump}
            onHoverDesc={setHoveredDesc}
          />

          <SettingSegmentedRow
            icon={Ghost}
            iconColor="text-purple-400"
            title="Ghost Mode"
            value={ghostMode}
            onChange={(v) => setGhostMode(v as HostTrainingGhostMode)}
            layout="inline"
            bordered={false}
            showDescription={false}
            options={[
              { label: 'Automatically Enable', value: 'automatically-enable' },
              { label: 'Manual', value: 'manual' },
            ]}
            hoverDescription="Ghost Mode: Choose Automatically Enable to phase car collisions automatically, or Manual so clients can toggle Ghost Mode individually."
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
              onRetry={() => startStepSequence(false)}
              onCancel={() => {
                cancelSequence(() => {
                  bridge.onLeaveOnlineServer?.();
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
              onClick={() => startStepSequence(simulateLayer3Error)}
              onMouseEnter={() =>
                setHoveredDesc('Create & Host: Launch the 5-step shared training session initialization.')
              }
              onMouseLeave={() => setHoveredDesc(null)}
              className="flex-1 py-2.5 px-6 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-70 text-neutral-950 font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all cursor-pointer disabled:cursor-wait shrink-0"
            >
              <Play className="h-3.5 w-3.5 fill-current" />
              <span>
                {progressStatus === 'running'
                  ? `Creating Room (${currentStep}/${totalSteps})...`
                  : progressStatus === 'completed'
                  ? 'Room Created · Restart Sequence'
                  : 'Create & Host'}
              </span>
            </button>
          </div>
        </div>
      </PanelContent>

      <PanelFooter
        isLight={isLight}
        defaultDescription="Configure room identity and ghost collision rules for shared online training."
        hoveredDescription={hoveredDesc}
      />
    </PanelContainer>
  );
});

Layer3HostTrainingRecipe.displayName = 'Layer3HostTrainingRecipe';
