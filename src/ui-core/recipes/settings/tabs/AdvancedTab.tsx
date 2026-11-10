import React, { useState } from 'react';
import {
  Activity,
  Code2,
  Download,
  HatGlasses,
  Router,
  Sliders,
  ChevronsLeftRightEllipsis,
} from 'lucide-react';
import { SettingActionRow } from '../../../compounds/SettingActionRow';
import { SettingSegmentedRow } from '../../../compounds/SettingSegmentedRow';
import { SettingToggleRow } from '../../../compounds/SettingToggleRow';
import { SettingDeveloperStatusRow } from '../../../compounds/SettingDeveloperStatusRow';
import { FloatingWindowCard, type DiagnosticWindowPayload } from '../components/FloatingWindowCard';
import {
  AudioDebugSection,
  type AudioDebugTelemetryProps,
} from '../components/AudioDebugSection';
import { RealisticBgmSection } from '../components/RealisticBgmSection';
import { SignalingProfileSection } from '../components/SignalingProfileSection';
import { InputBufferPacingSection } from '../components/InputBufferPacingSection';
import {
  TelemetryConfigCard,
  DEFAULT_TELEMETRY_CONFIG_STATE,
  type TelemetryConfigState,
} from '../../../compounds/TelemetryConfigCard';
import {
  PERFORMANCE_MONITOR_PRESET,
  NETWORK_MONITOR_PRESET,
  FLOATING_WINDOW_OPACITY_PRESET,
} from '../../../stores/floatingPresets';
import { useFloatingStore } from '../../../stores/floatingStore';
import { useSettingActionRowStore } from '../../../stores/settingRowStore';
import { useAppStore } from '../../../stores/appStore';
import { useCloudProfileSyncStore } from '../../../stores/cloudProfileSyncStore';
import { useNameTagTunerStore } from '../../../stores/nameTagTunerStore';
import type { NameTagAnonymizeMode } from '../../../config/nameTagConfig';
import { useScopedStore } from '../../../stores/storeSnapshotScope';
import type { SurfaceVariantMeta } from '../../../manifest/surfaceMetaTypes';

export type TelemetryOverlayConfig = TelemetryConfigState;
export type InputBufferTargetOption = number;

export const SURFACE_VARIANT_META: SurfaceVariantMeta = {
  variantId: 'settings:advanced',
  label: '4. Advanced & Telemetry',
  description:
    'Input buffer target/thresholds, HUD telemetry overlay configuration, user floating monitors, and Developer Mode status.',
  storeOverrides: {
    appStore: {
      settingsTargetTab: 'advanced',
      developerMode: true,
    },
  },
};

export interface AdvancedTabProps {
  isLight?: boolean;
  developerMode?: boolean;
  telemetryConfig?: Partial<TelemetryConfigState>;
  audioDebug?: AudioDebugTelemetryProps;
  onSpawnDiagnosticWindow?: (window: DiagnosticWindowPayload) => void;
  onHover: (desc: string) => void;
  onLeave: () => void;
}

export const AdvancedTab: React.FC<AdvancedTabProps> = ({
  isLight = false,
  developerMode: propDevMode,
  telemetryConfig: propTelemetryConfig,
  audioDebug,
  onSpawnDiagnosticWindow,
  onHover,
  onLeave,
}) => {
  const storeDevMode = useScopedStore('appStore', useAppStore, (s) => s.developerMode);
  const storeTelemetry = useScopedStore('appStore', useAppStore, (s) => s.telemetry);
  const updateStoreTelemetry = useScopedStore(
    'appStore',
    useAppStore,
    (s) => s.updateTelemetry
  );
  const masterVolume = useScopedStore('appStore', useAppStore, (s) => s.audio.masterVolume);

  const developerMode = propDevMode ?? storeDevMode ?? false;

  const allowRemoteProfileDeployment = useScopedStore(
    'cloudProfileSyncStore',
    useCloudProfileSyncStore,
    (s) => s.allowRemoteProfileDeployment
  );
  const setAllowRemoteProfileDeployment = useScopedStore(
    'cloudProfileSyncStore',
    useCloudProfileSyncStore,
    (s) => s.setAllowRemoteProfileDeployment
  );
  const exportLocalUserProfileBackup = useScopedStore(
    'cloudProfileSyncStore',
    useCloudProfileSyncStore,
    (s) => s.exportLocalUserProfileBackup
  );
  const [lastExportedFilename, setLastExportedFilename] = useState<string | null>(null);

  const handleExportBackup = () => {
    const filename = exportLocalUserProfileBackup();
    setLastExportedFilename(filename);
  };

  const nameTagConfig = useScopedStore(
    'nameTagTunerStore',
    useNameTagTunerStore,
    (s) => s.config
  );
  const updateNameTagConfig = useScopedStore(
    'nameTagTunerStore',
    useNameTagTunerStore,
    (s) => s.updateConfig
  );
  const anonymizeMode = nameTagConfig.anonymizePlayerNames || 'disabled';

  const [internalTelemetry, setInternalTelemetry] = useState<TelemetryConfigState>(() => ({
    ...DEFAULT_TELEMETRY_CONFIG_STATE,
    ...(storeTelemetry as unknown as Partial<TelemetryConfigState>),
  }));

  const telemetry: TelemetryConfigState = {
    ...internalTelemetry,
    ...(storeTelemetry as unknown as Partial<TelemetryConfigState>),
    ...propTelemetryConfig,
  };

  const handleUpdateTelemetry = (patch: Partial<TelemetryConfigState>) => {
    const next: TelemetryConfigState = { ...telemetry, ...patch };
    setInternalTelemetry(next);
    updateStoreTelemetry(patch as Parameters<typeof updateStoreTelemetry>[0]);
  };

  const { windows } = useFloatingStore();
  const isOpacityManagerActive = windows.some((w) => w.id === FLOATING_WINDOW_OPACITY_PRESET.id);

  const {
    rowGap,
    bordered: storeBordered,
    advancedBordered,
    advancedShowBadges,
    floatingOpacityOrder,
  } = useSettingActionRowStore();

  const resolvedBordered = storeBordered || advancedBordered;

  const opacityManagerCard = (
    <FloatingWindowCard
      preset={FLOATING_WINDOW_OPACITY_PRESET}
      icon={Sliders}
      bordered={resolvedBordered}
      description="Opacity adjustment (1% - 100%) for all floating telemetry windows"
      hoverTooltip="Floating Window Opacity: Adjust transparency across all active floating windows. Minimum 1%."
      onSpawnDiagnosticWindow={onSpawnDiagnosticWindow}
      onHover={onHover}
      onLeave={onLeave}
      isLight={isLight}
    />
  );

  const renderOpacityAtFirst =
    floatingOpacityOrder === 'first' ||
    (floatingOpacityOrder === 'first-when-inactive' && !isOpacityManagerActive);

  const renderOpacityAtLast =
    floatingOpacityOrder === 'last' ||
    (floatingOpacityOrder === 'first-when-inactive' && isOpacityManagerActive);

  return (
    <div
      data-layout="advanced-settings-list"
      className="flex flex-col w-full"
      style={{ gap: `${rowGap}px` }}
    >
      <SettingDeveloperStatusRow
        icon={Code2}
        title="Developer Settings"
        developerMode={developerMode}
        interactiveToggle={false}
        bordered={resolvedBordered}
        onHover={onHover}
        onLeave={onLeave}
        isLight={isLight}
      />

      <SettingToggleRow
        icon={ChevronsLeftRightEllipsis}
        iconName="chevrons-left-right-ellipsis"
        title="Allow Remote Profile Deployment"
        description={
          allowRemoteProfileDeployment
            ? 'Maintains a persistent live connection so developer profile updates apply instantaneously'
            : 'Paused live developer push subscription (updates apply only when you manually click Sync)'
        }
        hoverDescription="Allow Remote Profile Deployment: Keep a persistent subscription active so any developer remote profile tuning change is applied in real time without manual syncing."
        checked={allowRemoteProfileDeployment}
        onChange={setAllowRemoteProfileDeployment}
        bordered={resolvedBordered}
        onHover={(desc) => desc && onHover(desc)}
        onLeave={onLeave}
        isLight={isLight}
      />

      <SettingActionRow
        icon={Download}
        title="Export Profile Backup"
        description={
          lastExportedFilename
            ? `Exported ${lastExportedFilename}`
            : 'Download a structured JSON backup of all Garage, Settings, Audio & Keybinding parameters'
        }
        hoverDescription="Export Profile Backup: Save a complete, LLM-readable JSON backup of your current profile so your settings can be restored or migrated across major UI/schema updates."
        actionLabel="Export JSON"
        showButtonArrow={false}
        bordered={resolvedBordered}
        onAction={handleExportBackup}
        onHover={onHover}
        onLeave={onLeave}
        isLight={isLight}
      />

      <SignalingProfileSection
        bordered={resolvedBordered}
        onHover={onHover}
        onLeave={onLeave}
        isLight={isLight}
      />

      <RealisticBgmSection
        bordered={resolvedBordered}
        onHover={onHover}
        onLeave={onLeave}
        isLight={isLight}
      />

      {renderOpacityAtFirst && opacityManagerCard}

      <SettingSegmentedRow
        icon={HatGlasses}
        iconName="hat-glasses"
        title="Anonymize Player Names"
        description={
          anonymizeMode === 'disabled'
            ? 'Disabled: Display normal player usernames on on-screen name tags.'
            : anonymizeMode === 'opponents'
            ? 'Opponents Only: Replace opponent names with single-char indicators (A, M, Z).'
            : anonymizeMode === 'teammates'
            ? 'Teammates Only: Replace teammate names with single-char indicators (X, W, E).'
            : 'Both: Replace all player names with single-char indicators (X, W, E · A, M, Z).'
        }
        value={anonymizeMode}
        onChange={(val) =>
          updateNameTagConfig({ anonymizePlayerNames: val as NameTagAnonymizeMode })
        }
        options={[
          { value: 'disabled', label: 'Disabled' },
          { value: 'opponents', label: 'Opponents Only' },
          { value: 'teammates', label: 'Teammates Only' },
          { value: 'both', label: 'Both' },
        ]}
        bordered={resolvedBordered}
        hoverDescription="Anonymize Player Names: Replace player usernames on on-screen name tags with single-character slot indicators (X/W/E · A/M/Z) using the Single-Char Indicator profile."
        onHover={(desc) => desc && onHover(desc)}
        onLeave={onLeave}
        isLight={isLight}
      />

      <InputBufferPacingSection
        bordered={resolvedBordered}
        showBadges={advancedShowBadges}
        isLight={isLight}
        onHover={onHover}
        onLeave={onLeave}
      />

      <FloatingWindowCard
        preset={PERFORMANCE_MONITOR_PRESET}
        icon={Activity}
        bordered={resolvedBordered}
        description="Real-time CPU phase breakdown, physics simulation sub-ticks, and WebGL rendering pipeline metrics."
        hoverTooltip="Performance Monitor: Inspect live frame pacing, tick rate stability, CPU pipeline phases, and GPU draw calls in a dockable floating overlay."
        onSpawnDiagnosticWindow={onSpawnDiagnosticWindow}
        onHover={onHover}
        onLeave={onLeave}
        isLight={isLight}
      />

      <TelemetryConfigCard
        telemetry={telemetry}
        onUpdateTelemetry={handleUpdateTelemetry}
        onHover={onHover}
        onLeave={onLeave}
        isLight={isLight}
      />

      <FloatingWindowCard
        preset={NETWORK_MONITOR_PRESET}
        icon={Router}
        bordered={resolvedBordered}
        description="Real-time RTT & jitter oscilloscope, input buffer queue depth, and 20-minute session telemetry export."
        hoverTooltip="Network Monitor: Monitor live connection health, input buffer starvation/hysteresis curves, and export full 20-minute session telemetry (.json / .csv)."
        onSpawnDiagnosticWindow={onSpawnDiagnosticWindow}
        onHover={onHover}
        onLeave={onLeave}
        isLight={isLight}
      />

      <AudioDebugSection
        telemetry={audioDebug}
        masterVolume={masterVolume}
        bordered={resolvedBordered}
        onHover={onHover}
        onLeave={onLeave}
        isLight={isLight}
      />

      {renderOpacityAtLast && opacityManagerCard}
    </div>
  );
};
