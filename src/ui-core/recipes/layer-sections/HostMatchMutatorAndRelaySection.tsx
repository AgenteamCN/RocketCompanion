import React, { useState, useEffect } from 'react';
import { Play } from 'lucide-react';
import { InlineErrorNotice } from '../../primitives/InlineErrorNotice';
import { useAppStore } from '../../stores/appStore';
import { useMenuLayoutStore } from '../../stores/menuLayoutStore';
import { useSettingActionRowStore } from '../../stores/settingRowStore';
import { useScopedStore } from '../../stores/storeSnapshotScope';
import { OnlineRoomIdentityFields } from '../online/OnlineRoomIdentityFields';
import {
  OnlineRoomConfigSummaryCard,
  type HostMatchConfig,
} from '../online/OnlineRoomConfigSummaryCard';
import {
  OnlineRoomCreationProgress,
  type CreationProgressStatus,
  type CreationStepSpec,
} from '../online/OnlineRoomCreationProgress';

export interface Layer3HostMatchStateOverride {
  roomType?: 'match' | 'warmup';
  title?: string;
  defaultEditingConfig?: boolean;
  config?: Partial<HostMatchConfig>;
  defaultConfig?: Partial<HostMatchConfig>;
  onChange?: (next: HostMatchConfig, patch: Partial<HostMatchConfig>) => void;
  onStartHost?: (config: HostMatchConfig) => void;
  progressStatus?: CreationProgressStatus;
  currentStep?: number;
  steps?: CreationStepSpec[];
  onProgressStatusChange?: (status: CreationProgressStatus) => void;
  onCurrentStepChange?: (step: number) => void;
  onRetryHost?: () => void;
  onCancelHost?: () => void;
  onNavigateGarageSync?: () => void;
  onNavigateSignalingConfig?: () => void;
  onNavigateAdvancedSettings?: () => void;
}

export interface HostMatchMutatorAndRelaySectionProps {
  resolvedConfig: HostMatchConfig;
  updateConfig: (patch: Partial<HostMatchConfig>) => void;
  defaultEditingConfig: boolean;
  overrides: Layer3HostMatchStateOverride;
  progress: {
    progressStatus: CreationProgressStatus;
    currentStep: number;
    steps?: CreationStepSpec[];
    onLaunchSequence: (willFail: boolean) => void;
    onRetrySequence: () => void;
    onCancelSequence: () => void;
  };
  onHoverDesc: (desc: string | null) => void;
  isLight: boolean;
}

export const HostMatchMutatorAndRelaySection: React.FC<
  HostMatchMutatorAndRelaySectionProps
> = ({
  resolvedConfig,
  updateConfig,
  defaultEditingConfig,
  overrides,
  progress,
  onHoverDesc,
  isLight,
}) => {
  const appState = useScopedStore('appStore', useAppStore);
  const { navigate, setSettingsTargetTab, setHighlightSetting } = appState;
  const { simulateLayer3Error } = useMenuLayoutStore();
  const { paddingX } = useSettingActionRowStore();

  const [isEditingConfig, setIsEditingConfig] = useState<boolean>(defaultEditingConfig);
  useEffect(() => {
    setIsEditingConfig(Boolean(defaultEditingConfig));
  }, [defaultEditingConfig]);

  const {
    playerName,
    roomCode,
    roomKey,
    teamFormat,
    botPolicy,
    durationPreset,
    customDurationSeconds,
  } = resolvedConfig;

  const {
    progressStatus,
    currentStep,
    steps,
    onLaunchSequence,
    onRetrySequence,
    onCancelSequence,
  } = progress;

  const handleNavigateGarageSync =
    overrides.onNavigateGarageSync ?? (() => navigate('garage'));
  const handleNavigateSignalingConfig =
    overrides.onNavigateSignalingConfig ??
    (() => {
      setSettingsTargetTab('advanced');
      setHighlightSetting('signaling-credential-bundle');
      navigate('settings');
    });
  const handleNavigateAdvancedSettings =
    overrides.onNavigateAdvancedSettings ?? (() => navigate('exp-multi-bots'));

  return (
    <>
      <div data-layout="host-match-list" className="flex flex-col w-full gap-3">
        <OnlineRoomIdentityFields
          identity={{
            playerName,
            onPlayerNameChange: (val) => updateConfig({ playerName: val }),
            roomCode,
            onRoomCodeChange: (val) => updateConfig({ roomCode: val }),
            roomKey,
            onRoomKeyChange: (val) => updateConfig({ roomKey: val }),
          }}
          showRandomize={true}
          onNotYouClick={handleNavigateGarageSync}
          onSignalingConfigClick={handleNavigateSignalingConfig}
          onHoverDesc={onHoverDesc}
          isLight={isLight}
        />

        <div
          style={{
            marginLeft: `${Math.max(0, paddingX)}px`,
            marginRight: `${Math.max(0, paddingX)}px`,
          }}
          data-ui-element="host-match-current-config-box"
        >
          <OnlineRoomConfigSummaryCard
            title="Current Configuration"
            teamFormat={teamFormat}
            botPolicy={botPolicy}
            durationPreset={durationPreset}
            customDurationSeconds={customDurationSeconds}
            handlers={{
              onChangeTeamFormat: (val) => updateConfig({ teamFormat: val }),
              onChangeBotPolicy: (val) => updateConfig({ botPolicy: val }),
              onChangeDurationPreset: (val) => updateConfig({ durationPreset: val }),
              onChangeCustomDurationSeconds: (val) =>
                updateConfig({ customDurationSeconds: val }),
            }}
            editor={{
              editable: true,
              isEditing: isEditingConfig,
              onToggleEditing: () => setIsEditingConfig((prev) => !prev),
              onNavigateAdvancedSettings: handleNavigateAdvancedSettings,
            }}
            onHoverDesc={onHoverDesc}
            isLight={isLight}
          />
        </div>
      </div>

      <div
        style={{
          paddingLeft: `${Math.max(0, paddingX)}px`,
          paddingRight: `${Math.max(0, paddingX)}px`,
        }}
        className="flex flex-col gap-2 shrink-0 pt-1"
      >
        {progressStatus !== 'idle' && (
          <OnlineRoomCreationProgress
            currentStep={currentStep}
            totalSteps={steps?.length ?? 5}
            steps={steps}
            status={progressStatus}
            onRetry={onRetrySequence}
            onCancel={onCancelSequence}
            isLight={isLight}
          />
        )}

        {simulateLayer3Error && <InlineErrorNotice isLight={isLight} />}

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onLaunchSequence(simulateLayer3Error)}
            onMouseEnter={() =>
              onHoverDesc(
                'Create & Host: Launch the 5-step room initialization sequence (Authority -> Signaling -> Room Code -> ICE -> Lobby).'
              )
            }
            onMouseLeave={() => onHoverDesc(null)}
            className="flex-1 py-2.5 px-6 rounded-xl bg-amber-500 hover:bg-amber-400 text-neutral-950 font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all cursor-pointer shrink-0"
          >
            <Play className="h-3.5 w-3.5 fill-current" />
            <span>
              {progressStatus === 'running'
                ? `Creating Room (${currentStep}/5)...`
                : progressStatus === 'completed'
                ? 'Room Created · Restart Sequence'
                : 'Create & Host'}
            </span>
          </button>
        </div>
      </div>
    </>
  );
};
