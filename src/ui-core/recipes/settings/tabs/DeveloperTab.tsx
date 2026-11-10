import React, { useState } from 'react';
import {
  Sliders,
  ArrowRight,
  PackageOpen,
  BookCheck,
  BugPlay,
  CircleDot,
  AlertTriangle,
  Scan,
  Bot,
  Radio,
  UserCog,
  Zap,
} from 'lucide-react';
import { SettingActionRow } from '../../../compounds/SettingActionRow';
import { SettingSegmentedRow } from '../../../compounds/SettingSegmentedRow';
import { SettingToggleRow } from '../../../compounds/SettingToggleRow';
import { ToggleSwitch } from '../../../primitives/ToggleSwitch';
import { useSettingActionRowStore } from '../../../stores/settingRowStore';
import { useAppStore } from '../../../stores/appStore';
import { useNameTagTunerStore } from '../../../stores/nameTagTunerStore';
import {
  useSignalingProfileStore,
  type SignalingRelayMatchPolicyMode,
} from '../../../stores/signalingProfileStore';
import { useViewportStore, viewportStore } from '../../../stores/viewportStore';
import { getBallVisualConfig, updateBallVisualConfig } from '../../../config/ballVisualConfig';
import { BOTS_LOADOUT_TUNER_PRESET } from '../../../stores/devFloatingPresets';
import { useScopedStore } from '../../../stores/storeSnapshotScope';
import type { SurfaceVariantMeta } from '../../../manifest/surfaceMetaTypes';
import { FloatingWindowCard } from '../components/FloatingWindowCard';
import { DeveloperProfileExportSection } from '../components/DeveloperProfileExportSection';
import type { BallOpacityMode } from './GameplayTab';

export const SURFACE_VARIANT_META: SurfaceVariantMeta = {
  variantId: 'settings:developer',
  label: '5. Developer Hub',
  description:
    'Subsystem Isolation Lab, Active Tuners, Calibrated Presets, Developer Quick Actions, Self Test, Remote Profile Management, Under Development, and Safe Area boundary observer.',
  storeOverrides: {
    appStore: {
      settingsTargetTab: 'developer',
      developerMode: true,
    },
  },
};

export interface DeveloperTabProps {
  isLight?: boolean;
  onNavigateRoute?: (route: string) => void;
  onHover?: (desc: string) => void;
  onLeave?: () => void;
}

const DEV_NAV_ROWS: readonly {
  route: string;
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  iconName: string;
  iconColor: string;
  title: string;
  description: string;
  hoverDescription: string;
  group: 'top' | 'mid';
}[] = [
  {
    route: 'dev-sandboxes',
    icon: PackageOpen,
    iconName: 'package-open',
    iconColor: 'text-amber-400',
    title: 'Sandboxes',
    description: 'Subsystem Isolation & MVP Lab (01–07) and Experimental Multiple Bots Mode',
    hoverDescription:
      'Sandboxes: Choose which isolated subsystem or sandbox scene (Probes, Multi-World Ghost, State Replay, 90s Match, Goal Replay, Kickoff Duel, Demolish Respawn, or Experimental Multiple Bots) you want to test.',
    group: 'top',
  },
  {
    route: 'dev-active-tuners',
    icon: Sliders,
    iconName: 'sliders',
    iconColor: 'text-sky-400',
    title: 'Active Tuners',
    description:
      'Vehicle Offsets, Goal Volume, Reachability, Kickoff PPO, Audio & Event & Trigger Rules',
    hoverDescription:
      'Active Tuners: Frequently accessed live calibration tools, floating window spawners, vehicle offsets, reachability, kickoff PPO, advanced audio, and event & trigger rules.',
    group: 'top',
  },
  {
    route: 'dev-calibrated-presets',
    icon: BookCheck,
    iconName: 'book-check',
    iconColor: 'text-emerald-400',
    title: 'Calibrated Presets',
    description:
      'Atmosphere & FX, Vehicle Global Surfaces, Supersonic Wheel Trail, Driftwoods, Boost Pad & Name Tag',
    hoverDescription:
      'Calibrated Presets: Archive of completed tuners whose parameters have already been calibrated and solidified (Atmosphere & FX, Vehicle Global Surfaces, Supersonic Wheel Trail, Driftwoods, Boost Pad & Name Tag).',
    group: 'top',
  },
  {
    route: 'dev-self-test',
    icon: BugPlay,
    iconName: 'bug-play',
    iconColor: 'text-cyan-400',
    title: 'Self Test',
    description: 'Automated subsystem self-test suites and verification harnesses',
    hoverDescription:
      'Self Test: Browse automated diagnostic and self-test suites available for the active environment.',
    group: 'mid',
  },
  {
    route: 'dev-remote-profile',
    icon: UserCog,
    iconName: 'user-cog',
    iconColor: 'text-violet-400',
    title: 'Remote Profile Management',
    description:
      'Set Others Profile (SETTINGS # alias) & Manage Cloud Accounts (username / password / alias)',
    hoverDescription:
      "Remote Profile Management: Remotely tune another user's settings & active floating windows in real time, or manage plaintext cloud user accounts.",
    group: 'mid',
  },
];

export const DeveloperTab: React.FC<DeveloperTabProps> = ({
  isLight = false,
  onNavigateRoute,
  onHover,
  onLeave,
}) => {
  const navigate = useScopedStore('appStore', useAppStore, (s) => s.navigate);
  const { showSafeAreaHud } = useViewportStore();
  const setShowSafeAreaHud = viewportStore.setShowSafeAreaHud;
  const relayMatchPolicy = useScopedStore(
    'signalingProfileStore',
    useSignalingProfileStore,
    (s) => s.relayMatchPolicy
  );
  const setRelayMatchPolicy = useScopedStore(
    'signalingProfileStore',
    useSignalingProfileStore,
    (s) => s.setRelayMatchPolicy
  );
  const offscreenIndicatorEnabled = useScopedStore(
    'nameTagTunerStore',
    useNameTagTunerStore,
    (s) => s.config.offscreenIndicatorEnabled
  );
  const updateNameTagConfig = useScopedStore(
    'nameTagTunerStore',
    useNameTagTunerStore,
    (s) => s.updateConfig
  );

  const navigateRoute = (route: string) => {
    if (onNavigateRoute) {
      onNavigateRoute(route);
    } else {
      navigate(route as Parameters<typeof navigate>[0]);
    }
  };

  const [ballOpacityMode, setBallOpacityMode] = useState<BallOpacityMode>(() => {
    const op = getBallVisualConfig()?.opacity ?? 1.0;
    const pct = Math.round(op * 100);
    return pct === 100 ? '100' : pct === 70 ? '70' : 'custom';
  });

  const handleBallOpacityChange = (next: BallOpacityMode) => {
    setBallOpacityMode(next);
    if (next === '100' || next === 'solid') {
      updateBallVisualConfig({ opacity: 1.0 });
    } else if (next === '70' || next === 'ghost') {
      updateBallVisualConfig({ opacity: 0.7 });
    } else if (next === 'hidden') {
      updateBallVisualConfig({ opacity: 0.05 });
    }
  };

  const {
    rowGap,
    buttonFontSize,
    buttonPaddingX,
    buttonPaddingY,
    buttonRadius,
    showButtonArrow,
    underDevelopmentTopMargin,
  } = useSettingActionRowStore();

  const btnStyle: React.CSSProperties = {
    fontSize: `${buttonFontSize}px`,
    paddingLeft: `${buttonPaddingX}px`,
    paddingRight: `${buttonPaddingX}px`,
    paddingTop: `${buttonPaddingY}px`,
    paddingBottom: `${buttonPaddingY}px`,
    borderRadius: `${Math.max(0, buttonRadius)}px`,
  };

  const renderNavRow = (row: (typeof DEV_NAV_ROWS)[number]) => (
    <SettingActionRow
      key={row.route}
      icon={row.icon}
      iconName={row.iconName}
      iconColor={row.iconColor}
      title={row.title}
      actionLabel="Browse"
      description={row.description}
      hoverDescription={row.hoverDescription}
      onAction={() => navigateRoute(row.route)}
      onHover={onHover}
      onLeave={onLeave}
      isLight={isLight}
    />
  );

  return (
    <div
      data-layout="developer-settings-list"
      className="flex flex-col w-full"
      style={{ gap: `${rowGap}px` }}
    >
      {DEV_NAV_ROWS.filter((r) => r.group === 'top').map(renderNavRow)}

      <SettingActionRow
        icon={Zap}
        iconName="zap"
        iconColor="text-amber-400"
        title="Developer Quick Actions"
        description="Off-Screen Indicator (auto-enabled in Developer Mode; toggleable & cloud-syncable)"
        hoverDescription="Developer Quick Actions: Automatically enables the Off-Screen Indicator when Developer Mode is active. Toggle it directly here or browse quick actions, and push to other players via Remote Profile Management."
        onHover={onHover}
        onLeave={onLeave}
        isLight={isLight}
        rightSlot={
          <div className="flex items-center gap-2.5 shrink-0">
            <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
              <span
                className={`text-[10px] font-mono uppercase tracking-wider ${
                  offscreenIndicatorEnabled
                    ? isLight
                      ? 'text-emerald-600 font-semibold'
                      : 'text-emerald-400 font-semibold'
                    : isLight
                    ? 'text-slate-400'
                    : 'text-white/40'
                }`}
              >
                Off-Screen
              </span>
              <ToggleSwitch
                checked={offscreenIndicatorEnabled}
                onChange={(checked) => updateNameTagConfig({ offscreenIndicatorEnabled: checked })}
                isLight={isLight}
              />
            </div>
            <button
              type="button"
              onClick={() => navigateRoute('dev-quick-actions')}
              style={btnStyle}
              className={`flex items-center gap-2 font-bold uppercase tracking-wider transition-all border shrink-0 whitespace-nowrap leading-none cursor-pointer ${
                isLight
                  ? 'bg-sky-500/10 hover:bg-sky-500/20 text-sky-600 border-sky-500/30 hover:border-sky-500/50'
                  : 'bg-sky-500/15 hover:bg-sky-500/25 text-sky-400 border-sky-500/30 hover:border-sky-500/50 shadow-[0_0_12px_rgba(56,189,248,0.12)]'
              }`}
            >
              <span>Browse</span>
              {showButtonArrow && <ArrowRight className="w-3.5 h-3.5 shrink-0" />}
            </button>
          </div>
        }
      />

      {DEV_NAV_ROWS.filter((r) => r.group === 'mid').map(renderNavRow)}

      <FloatingWindowCard
        preset={BOTS_LOADOUT_TUNER_PRESET}
        icon={Bot}
        iconColor="text-amber-400"
        badge="3 GLB Default · Multi-Select"
        badgeClass="bg-amber-500/15 border-amber-500/30 text-amber-400"
        description="Configure multi-select Bot Loadout randomizer pools (Car GLB models, Metallic paint, Cartoon boost, Standard boost audio, Random TrainStation anthem)"
        hoverTooltip="Bots Loadout Tuner: Spawn floating window to configure multi-select randomizable bot loadout pools for Exhibition and Auto-Fill."
        onHover={(desc) => onHover?.(desc)}
        onLeave={() => onLeave?.()}
        isLight={isLight}
      />

      <SettingSegmentedRow
        icon={CircleDot}
        iconName="circle-dot"
        title="Ball Opacity"
        description="70% translucent · 100% opaque (default) · Custom (via Active Tuners)"
        value={ballOpacityMode}
        onChange={(v) => handleBallOpacityChange(v as BallOpacityMode)}
        options={[
          { value: '70', label: '70%' },
          { value: '100', label: '100%' },
          { value: 'custom', label: 'Custom' },
        ]}
        hoverDescription="Ball Opacity: Quickly toggle ball opacity between 70% translucent, 100% opaque (default), or Custom (custom values are calibrated inside Active Tuners)."
        onHover={(desc) => desc && onHover?.(desc)}
        onLeave={onLeave}
        isLight={isLight}
      />

      <SettingToggleRow
        icon={Scan}
        iconName="scan"
        title="Observe Safe Area Boundary"
        description="Display green safe area outline, 18:9 canonical zone, and floating telemetry calibration pill"
        checked={showSafeAreaHud}
        onChange={setShowSafeAreaHud}
        hoverDescription="Observe Safe Area Boundary: Displays boundary guides and bottom telemetry pill to observe and calibrate UI scaling and bezel margins in real-time."
        onHover={(desc) => desc && onHover?.(desc)}
        onLeave={onLeave}
        isLight={isLight}
      />

      <SettingSegmentedRow
        icon={Radio}
        iconName="radio"
        title="Signaling Match Relay Policy"
        description="Smart Prune keeps active player relays + probed EMQX · Keep All keeps all probed relays open"
        value={relayMatchPolicy}
        onChange={(v) => setRelayMatchPolicy(v as SignalingRelayMatchPolicyMode)}
        options={[
          { value: 'smart-prune', label: 'Smart Prune' },
          { value: 'keep-all-probed', label: 'Keep All' },
        ]}
        hoverDescription="Signaling Match Relay Policy: Controls whether Host pauses unused non-EMQX relays during an active Match (Smart Prune, default) or keeps all probed relays open."
        onHover={(desc) => desc && onHover?.(desc)}
        onLeave={onLeave}
        isLight={isLight}
      />

      <DeveloperProfileExportSection onHover={onHover} onLeave={onLeave} isLight={isLight} />

      <SettingActionRow
        icon={AlertTriangle}
        iconColor={isLight ? 'text-rose-600' : 'text-rose-400'}
        title={<span className={isLight ? 'text-rose-700' : 'text-rose-400'}>Under Development</span>}
        description="Unstable staging workspace: Three-Wheeler (Tricycle / Psyclops), Throwback Stadium & Per-Car Boost"
        hoverDescription="Under Development: Unstable staging workspace for early experimental prototypes (Three-Wheeler Tricycle physics, Throwback Stadium 36 CMF & GLB, and Per-Car Boost mechanics)."
        onAction={() => navigateRoute('dev-under-development')}
        onHover={onHover}
        onLeave={onLeave}
        isLight={isLight}
        style={{ marginTop: `${Math.max(0, underDevelopmentTopMargin)}px` }}
        className={
          isLight
            ? '!bg-rose-500/[0.06] hover:!bg-rose-500/[0.12] !border-rose-500/25'
            : '!bg-rose-500/[0.08] hover:!bg-rose-500/[0.14] !border-rose-500/25'
        }
        rightSlot={
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              navigateRoute('dev-under-development');
            }}
            style={btnStyle}
            className={`shrink-0 font-semibold border transition-all duration-150 cursor-pointer inline-flex items-center gap-1.5 leading-tight active:scale-95 whitespace-nowrap ${
              isLight
                ? 'bg-rose-500/15 hover:bg-rose-500/25 border-rose-500/35 text-rose-700'
                : 'bg-rose-500/15 hover:bg-rose-500/25 border-rose-500/35 text-rose-300'
            }`}
          >
            <span>Browse</span>
            {showButtonArrow && (
              <ArrowRight
                style={{
                  width: `${Math.max(12, buttonFontSize + 1)}px`,
                  height: `${Math.max(12, buttonFontSize + 1)}px`,
                }}
                className="opacity-80 transition-transform duration-150 group-hover:translate-x-0.5"
              />
            )}
          </button>
        }
      />
    </div>
  );
};
