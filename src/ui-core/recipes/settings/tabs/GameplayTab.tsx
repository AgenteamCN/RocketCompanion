import React, { useState } from 'react';
import {
  NotebookPen,
  Keyboard,
  Video,
  Sliders,
  ArrowRight,
  Crosshair,
  Box,
  SmilePlus,
} from 'lucide-react';
import { BounceSolidSvg } from '../../../primitives/packagedSvgIcons';
import { SettingActionRow } from '../../../compounds/SettingActionRow';
import { SettingToggleRow } from '../../../compounds/SettingToggleRow';
import { SettingSegmentedRow } from '../../../compounds/SettingSegmentedRow';
import { useSettingActionRowStore } from '../../../stores/settingRowStore';
import { useAppStore } from '../../../stores/appStore';
import {
  useSettingsPacingStore,
  type ExperiencePriorityOption,
} from '../../../stores/settingsPacingStore';
import { useScopedStore } from '../../../stores/storeSnapshotScope';
import type { SurfaceVariantMeta } from '../../../manifest/surfaceMetaTypes';

export type ClockPacingPriority = ExperiencePriorityOption;
export type BallOpacityMode = '70' | '100' | 'custom' | 'solid' | 'ghost' | 'hidden';

export interface GameplayConfig {
  goalRestart: boolean;
  unlimitedBoost: boolean;
  showCarHitbox: boolean;
  showAllCarHitboxes?: boolean;
  ballCamIndicator: boolean;
  enableFToMirror?: boolean;
}

export const DEFAULT_GAMEPLAY_CONFIG: GameplayConfig = {
  goalRestart: true,
  unlimitedBoost: true,
  showCarHitbox: false,
  showAllCarHitboxes: false,
  ballCamIndicator: true,
  enableFToMirror: true,
};

export const SURFACE_VARIANT_META: SurfaceVariantMeta = {
  variantId: 'settings:gameplay',
  label: '1. Gameplay Settings',
  description:
    'Camera, Keybindings, Ball Cam Indicator, Trajectory Predictor, Show POV Hitbox, Training Config, and Experience Priority.',
  storeOverrides: {
    appStore: {
      settingsTargetTab: 'gameplay',
      developerMode: true,
    },
  },
};

export interface GameplayTabProps {
  isLight?: boolean;
  gameplayConfig?: Partial<GameplayConfig>;
  onNavigateRoute?: (route: string) => void;
  onHover: (desc: string) => void;
  onLeave: () => void;
}

export const GameplayTab: React.FC<GameplayTabProps> = ({
  isLight = false,
  gameplayConfig: propGameplayConfig,
  onNavigateRoute,
  onHover,
  onLeave,
}) => {
  const navigate = useScopedStore('appStore', useAppStore, (s) => s.navigate);
  const storeGameplay = useScopedStore('appStore', useAppStore, (s) => s.gameplay);
  const updateStoreGameplay = useScopedStore(
    'appStore',
    useAppStore,
    (s) => s.updateGameplay
  );
  const storeTrajectoryEnabled = useScopedStore(
    'appStore',
    useAppStore,
    (s) => s.trajectory.enabled
  );
  const updateStoreTrajectory = useScopedStore(
    'appStore',
    useAppStore,
    (s) => s.updateTrajectory
  );
  const setAppClockPacingPriority = useScopedStore(
    'appStore',
    useAppStore,
    (s) => s.setClockPacingPriority
  );

  const [internalConfig, setInternalConfig] = useState<GameplayConfig>(() => ({
    ...DEFAULT_GAMEPLAY_CONFIG,
    ...storeGameplay,
  }));

  const resolvedGameplayConfig: GameplayConfig = {
    ...internalConfig,
    ...storeGameplay,
    ...propGameplayConfig,
  };

  const ballCamIndicator = resolvedGameplayConfig.ballCamIndicator;

  const handleBallCamIndicatorChange = (next: boolean) => {
    const patch: Partial<GameplayConfig> = { ballCamIndicator: next };
    const nextConfig: GameplayConfig = { ...resolvedGameplayConfig, ...patch };
    setInternalConfig(nextConfig);
    updateStoreGameplay(patch);
  };

  const handleTrajectoryEnabledChange = (next: boolean) => {
    updateStoreTrajectory({ enabled: next });
  };

  const handleShowCarHitboxChange = (checked: boolean) => {
    const patch: Partial<GameplayConfig> = { showCarHitbox: checked };
    const nextConfig: GameplayConfig = { ...resolvedGameplayConfig, ...patch };
    setInternalConfig(nextConfig);
    updateStoreGameplay(patch);
  };

  const storeExperiencePriority = useScopedStore(
    'settingsPacingStore',
    useSettingsPacingStore,
    (s) => s.experiencePriority
  );
  const setStoreExperiencePriority = useScopedStore(
    'settingsPacingStore',
    useSettingsPacingStore,
    (s) => s.setExperiencePriority
  );

  const handleExperiencePriorityChange = (next: ClockPacingPriority) => {
    setStoreExperiencePriority(next);
    setAppClockPacingPriority(next as Parameters<typeof setAppClockPacingPriority>[0]);
  };

  const navigateRoute = (route: string) => {
    if (onNavigateRoute) {
      onNavigateRoute(route);
    } else {
      navigate(route as Parameters<typeof navigate>[0]);
    }
  };

  const handleOpenTrajectoryConfig = () => {
    navigateRoute('trajectory');
  };

  const {
    rowGap,
    trajectoryRowLayout,
    pacingPriorityControl,
    buttonFontSize,
    buttonPaddingX,
    buttonPaddingY,
    buttonRadius,
    showButtonArrow,
  } = useSettingActionRowStore();

  const configureTrajectoryButton = (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        handleOpenTrajectoryConfig();
      }}
      onMouseEnter={() =>
        onHover(
          'Open trajectory detail panel to adjust prediction horizon, styling, dash intervals and colors.'
        )
      }
      onMouseLeave={onLeave}
      style={{
        fontSize: `${buttonFontSize}px`,
        paddingLeft: `${buttonPaddingX}px`,
        paddingRight: `${buttonPaddingX}px`,
        paddingTop: `${buttonPaddingY}px`,
        paddingBottom: `${buttonPaddingY}px`,
        borderRadius: `${Math.max(0, buttonRadius)}px`,
      }}
      className={`shrink-0 font-semibold border transition-all duration-150 cursor-pointer flex items-center justify-center gap-1.5 leading-tight active:scale-95 ${
        trajectoryRowLayout === 'stacked' ? 'w-full py-1.5' : ''
      } ${
        isLight
          ? 'bg-neutral-200/60 group-hover:bg-neutral-200/95 hover:!bg-neutral-300/90 border-neutral-300/80 text-neutral-800'
          : 'bg-white/[0.06] group-hover:bg-white/[0.11] hover:!bg-white/[0.16] border-white/[0.10] group-hover:border-white/[0.16] text-neutral-200'
      }`}
    >
      {trajectoryRowLayout === 'stacked' && <Sliders className="h-3.5 w-3.5 opacity-75" />}
      <span>
        {trajectoryRowLayout === 'stacked'
          ? 'Configure Trajectory Parameters'
          : 'Configure'}
      </span>
      {showButtonArrow && (
        <ArrowRight
          style={{
            width: `${Math.max(12, buttonFontSize + 1)}px`,
            height: `${Math.max(12, buttonFontSize + 1)}px`,
          }}
          className="opacity-75 transition-transform duration-150 group-hover:translate-x-0.5"
        />
      )}
    </button>
  );

  return (
    <div
      data-layout="gameplay-settings-list"
      className="flex flex-col w-full"
      style={{ gap: `${rowGap}px` }}
    >
      {/* 1. Top Item: Training Mode Configuration (Level 3 Menu Entry) */}
      <SettingActionRow
        icon={NotebookPen}
        title="Training Mode Configuration"
        description="Free Play boost mode, goal reset & Training goal barrier designer"
        hoverDescription="Configure Free Play boost mode (standard vs unlimited), goal reset rules, and the Training goal barrier designer."
        onAction={() => navigateRoute('training-config')}
        onHover={onHover}
        onLeave={onLeave}
        isLight={isLight}
      />

      {/* 2. Second Item: Camera Settings */}
      <SettingActionRow
        icon={Video}
        title="Camera Settings"
        description="Field of view, distance, height, angle & tracking stiffness"
        hoverDescription="Field of view, height, angle, distance & tracking stiffness."
        buttonHoverDescription="Open camera live preview panel to adjust FOV, height, angle and stiffness."
        onAction={() => navigateRoute('camera')}
        onHover={onHover}
        onLeave={onLeave}
        isLight={isLight}
      />

      {/* 3. Third Item: Key Bindings Settings */}
      <SettingActionRow
        icon={Keyboard}
        title="Key Bindings Settings"
        description="Keyboard, mouse & controller mapping configuration"
        hoverDescription="Customize keyboard keys and gamepad controller buttons."
        buttonHoverDescription="Open key bindings panel to reassign keyboard and gamepad actions."
        onAction={() => navigateRoute('keybindings')}
        onHover={onHover}
        onLeave={onLeave}
        isLight={isLight}
      />

      {/* 4. Fourth Item: Quick Toggle: Ball Cam Indicator (with Crosshair icon) */}
      <SettingToggleRow
        icon={Crosshair}
        title="Ball Cam Indicator"
        description="Display HUD indicator in bottom-left corner"
        hoverDescription="Toggles the on-screen ball camera HUD indicator displayed in the bottom-left corner."
        checked={ballCamIndicator}
        onChange={handleBallCamIndicatorChange}
        onHover={(desc) => desc && onHover(desc)}
        onLeave={onLeave}
        isLight={isLight}
      />

      {/* 5. Fifth Item: Ball Trajectory Predictor (Icon: 5F Stats Event C. Bounce  BounceSolidSvg; Configure navigates to L3 Trajectory menu) */}
      <SettingToggleRow
        icon={BounceSolidSvg}
        iconName="bounce-solid"
        title="Ball Trajectory Predictor"
        description="RocketSim WASM real-time 3D flight trajectory calculation"
        hoverDescription="Toggles real-time 3D physical flight path prediction for the ball, or click Configure to open the Layer 3 Trajectory Predictor menu."
        checked={storeTrajectoryEnabled}
        onChange={handleTrajectoryEnabledChange}
        extraRightSlot={trajectoryRowLayout !== 'stacked' ? configureTrajectoryButton : undefined}
        bottomSlot={trajectoryRowLayout === 'stacked' ? configureTrajectoryButton : undefined}
        onHover={(desc) => desc && onHover(desc)}
        onLeave={onLeave}
        isLight={isLight}
      />

      {/* 5b. Show POV Hitbox (directly below Ball Trajectory Predictor, above Experience Priority) */}
      <SettingToggleRow
        icon={Box}
        title="Show POV Hitbox"
        description="Render wireframe physics collision box on the active POV vehicle"
        hoverDescription="Toggles the 3D wireframe physics collision box on your active POV vehicle."
        checked={resolvedGameplayConfig.showCarHitbox ?? false}
        onChange={handleShowCarHitboxChange}
        onHover={(desc) => desc && onHover(desc)}
        onLeave={onLeave}
        isLight={isLight}
      />

      {/* 6. Sixth Item: Experience Priority (relocated from Advanced 'Pacing Trade-Off Priority', icon: face-slightly-smiling-plus / SmilePlus) */}
      <SettingSegmentedRow
        icon={SmilePlus}
        iconName="face-slightly-smiling-plus"
        title="Experience Priority"
        description={
          storeExperiencePriority === 'competitive'
            ? 'Competitive: Automatic pacing algorithm tuned for minimal forward prediction error on 50/50 challenges.'
            : storeExperiencePriority === 'motion'
            ? 'Motion: Automatic pacing algorithm with wide hysteresis & long dwell time for ultra-smooth visual motion.'
            : storeExperiencePriority === 'input_consistency'
            ? 'Input Consistency: Automatic pacing algorithm with deeper buffer & jitter boost on unstable links.'
            : storeExperiencePriority === 'custom'
            ? 'Custom: Manual parameter override. Selecting any of the 4 automatic presets resets Input Buffer to CSTS.'
            : 'Balanced: Automatic pacing algorithm balancing competitive responsiveness, motion fluidity, and input consistency.'
        }
        value={storeExperiencePriority}
        onChange={(val) => handleExperiencePriorityChange(val as ExperiencePriorityOption)}
        controlType={pacingPriorityControl === 'dropdown' ? 'dropdown' : 'segmented'}
        layout={pacingPriorityControl === 'segmented-stacked' ? 'stacked' : 'inline'}
        options={[
          {
            value: 'competitive',
            label: 'Competitive',
            description: 'Tight queue for minimal 50/50 prediction error',
          },
          {
            value: 'balanced',
            label: 'Balanced',
            description: 'Optimal equilibrium between responsiveness & smoothness',
          },
          {
            value: 'motion',
            label: 'Motion',
            description: 'Smooth frame & simulation pacing without rate shifts',
          },
          {
            value: 'input_consistency',
            label: 'Input Consistency',
            description: 'Consistent input buffer cadence against network jitter',
          },
          {
            value: 'custom',
            label: 'Custom',
            description: 'Manual input buffer & deadband override',
          },
        ]}
        hoverDescription="Experience Priority: Choose between 4 automatic pacing presets (Competitive, Balanced, Motion, Input Consistency) or Custom. Switching back to any preset resets Input Buffer to CSTS."
        onHover={(desc) => desc && onHover(desc)}
        onLeave={onLeave}
        isLight={isLight}
      />
    </div>
  );
};
