import React, { useState } from 'react';
import { Zap, Shield, History, CircleSlash2, FlipHorizontal2, Download, Info, Keyboard, Compass } from 'lucide-react';
import type { StandardSurfaceProps, SurfaceMeta } from '../manifest/surfaceMetaTypes';
import {
  resolveCalibratedDefaultConfig,
  resolveCalibratedSurfaceSizing,
} from '../manifest/surfaceCalibration';
import { PanelContainer, PanelHeader, PanelContent } from '../layout/Panel';
import { PanelFooter } from '../layout/PanelFooter';
import { SettingActionRow } from '../compounds/SettingActionRow';
import { SettingSegmentedRow } from '../compounds/SettingSegmentedRow';
import { SettingToggleRow } from '../compounds/SettingToggleRow';
import { FloatingWindowCard } from './settings/components/FloatingWindowCard';
import { useAppStore } from '../stores/appStore';
import { useStaticTrainingPackStore } from '../stores/staticTrainingPackStore';
import { useKeyboardInputOverlayStore } from '../stores/keyboardInputOverlayStore';
import { useMenuLayoutStore } from '../stores/menuLayoutStore';
import { DEFAULT_PANEL_SIZING } from '../tokens/menuLayoutTokens';
import { useSettingActionRowStore } from '../stores/settingRowStore';
import { useScopedStore } from '../stores/storeSnapshotScope';
import {
  GOAL_BARRIER_CONFIGURATOR_PRESET,
  KEYBOARD_INPUT_OVERLAY_PRESET,
  REWINDER_CONFIGURATOR_PRESET,
} from '../stores/floatingPresets';

export interface TrainingGameplayConfig {
  unlimitedBoost?: boolean;
  showCarHitbox?: boolean | string;
  goalRestart?: boolean;
  enableFToMirror?: boolean;
}

export const DEFAULT_TRAINING_GAMEPLAY_CONFIG: Required<
  Pick<TrainingGameplayConfig, 'unlimitedBoost' | 'goalRestart' | 'enableFToMirror'>
> = {
  unlimitedBoost: true,
  goalRestart: true,
  enableFToMirror: true,
};

export const SURFACE_META: SurfaceMeta = {
  id: 'recipe:Layer3TrainingConfigRecipe',
  title: 'Training Configuration',
  subtitle: 'Free Play Boost, Goal Reset, Rewinder & Training Scope Controls',
  description:
    'Configure Free Play rules (boost, goal reset, rewinder) and Training goal barrier. Automatically bypassed in Exhibition & Multiplayer.',
  icon: 'History',
  layer: 'layer3',
  menuGroup: 'menu-layer',
  defaultSizing: {
    width: 480,
    height: 500,
    minHeight: 200,
    maxHeight: 960,
    mode: 'adaptive',
  },
  variants: [
    {
      variantId: 'training-config:default',
      label: 'Default (Unlimited Boost · Goal Reset ON)',
      storeOverrides: {
        appStore: {
          gameplay: {
            unlimitedBoost: true,
            goalRestart: true,
            enableFToMirror: true,
          },
        },
      },
    },
    {
      variantId: 'training-config:standard-no-reset',
      label: 'Standard Boost · Goal Reset Disabled',
      storeOverrides: {
        appStore: {
          gameplay: {
            unlimitedBoost: false,
            goalRestart: false,
            enableFToMirror: false,
          },
        },
      },
    },
  ],
};

export interface Layer3TrainingConfigRecipeProps extends StandardSurfaceProps {}

/**
 * [Recipe] Layer 3 Training Configuration Panel (User Tier)
 * Organized into two explicit mode-scope sections so competitive modes (Exhibition & Multiplayer) remain isolated:
 * - Free Play Scope (Free Play Only):
 *   1. Boost: Inline SegmentedSwitch (Unlimited | Standard)
 *   2. Disable Goal Reset: ToggleSwitch
 *   3. Rewinder Configurator: FloatingWindowCard spawner
 *   4. Export Recent Replay (60s): Manual .rcreplay.gz highlight export (or hotkey F8)
 * - Training Scope (Free Play, Static Training Pack & Kickoff Training):
 *   5. Enable F to Mirror: ToggleSwitch (default ON)
 *   6. Goal Barrier Configurator: FloatingWindowCard spawner
 *   7. Keyboard Input Overlay: FloatingWindowCard spawner
 *   8. Car Nose Direction Arrows: ToggleSwitch (default OFF, synced with Keyboard Input Overlay Tuner)
 *
 * Store-First contract (`StandardSurfaceProps` <= 4 props), reading directly from
 * `useAppStore`, `useStaticTrainingPackStore`, and `useKeyboardInputOverlayStore` via `useScopedStore`.
 */
export const Layer3TrainingConfigRecipe: React.FC<Layer3TrainingConfigRecipeProps> = React.memo(({
  isLight = false,
  onBack: propOnBack,
}) => {
  const goBack = useScopedStore('appStore', useAppStore, (s) => s.goBack);
  const storeGameplay = useScopedStore('appStore', useAppStore, (s) => s.gameplay);
  const storeUpdateGameplay = useScopedStore('appStore', useAppStore, (s) => s.updateGameplay);
  const bridge = useScopedStore('appStore', useAppStore, (s) => s.bridge);
  const packEnableFToMirror = useScopedStore(
    'staticTrainingPackStore',
    useStaticTrainingPackStore,
    (s) => s.variationToggles.enableFToMirror
  );
  const setPackVariationToggles = useScopedStore(
    'staticTrainingPackStore',
    useStaticTrainingPackStore,
    (s) => s.setVariationToggles
  );
  const enableNoseArrowRendering = useScopedStore(
    'keyboardInputOverlayStore',
    useKeyboardInputOverlayStore,
    (s) => s.enableNoseArrowRendering
  );
  const updateKeyboardOverlayConfig = useScopedStore(
    'keyboardInputOverlayStore',
    useKeyboardInputOverlayStore,
    (s) => s.updateConfig
  );

  const onBack = propOnBack ?? goBack;
  const calibratedDefaults = resolveCalibratedDefaultConfig(
    SURFACE_META.id,
    DEFAULT_TRAINING_GAMEPLAY_CONFIG
  );

  const storeSizing = useScopedStore(
    'menuLayoutStore',
    useMenuLayoutStore,
    (s) => s.panels?.['layer3-training-config']
  );
  const calibratedSizing = resolveCalibratedSurfaceSizing(
    SURFACE_META.id,
    SURFACE_META.defaultSizing
  );
  const sizing = storeSizing ?? {
    ...DEFAULT_PANEL_SIZING['layer3-training-config'],
    mode: calibratedSizing.mode === 'fixed' ? 'fixed' : 'auto',
    width: calibratedSizing.width,
    targetHeight: typeof calibratedSizing.height === 'number' ? calibratedSizing.height : 460,
    minHeight: calibratedSizing.minHeight ?? 200,
    maxHeight: calibratedSizing.maxHeight ?? 960,
  };

  const { rowGap } = useScopedStore('settingRowStore', useSettingActionRowStore);
  const [hoveredDesc, setHoveredDesc] = useState<string | null>(null);
  const [exportStatusLabel, setExportStatusLabel] = useState<string | null>(null);

  const unlimitedBoost =
    storeGameplay?.unlimitedBoost ?? calibratedDefaults.unlimitedBoost;
  const goalRestart =
    storeGameplay?.goalRestart ?? calibratedDefaults.goalRestart;
  const enableFToMirror =
    storeGameplay?.enableFToMirror ??
    packEnableFToMirror ??
    calibratedDefaults.enableFToMirror;

  const handleSetUnlimitedBoost = (next: boolean) => {
    storeUpdateGameplay({ unlimitedBoost: next });
  };

  const handleSetGoalRestart = (next: boolean) => {
    storeUpdateGameplay({ goalRestart: next });
  };

  const handleSetEnableFToMirror = (next: boolean) => {
    storeUpdateGameplay({ enableFToMirror: next });
    setPackVariationToggles({ enableFToMirror: next });
  };

  const handleExportRecentReplay = () => {
    const res = bridge?.onExportRecentTrainingReplay?.(60);
    if (res && typeof (res as Promise<boolean>).then === 'function') {
      void (res as Promise<boolean>).then((ok) => {
        setExportStatusLabel(ok ? 'Exported' : 'Buffer Empty');
        setTimeout(() => setExportStatusLabel(null), 2200);
      });
    } else {
      setExportStatusLabel(res ? 'Exported' : 'Buffer Empty');
      setTimeout(() => setExportStatusLabel(null), 2200);
    }
  };

  const boostValue = unlimitedBoost ? 'unlimited' : 'standard';
  const sectionLabelClass = isLight
    ? 'text-neutral-500 border-neutral-200/80'
    : 'text-neutral-400 border-white/[0.08]';

  return (
    <PanelContainer isLight={isLight} sizing={sizing} className="w-full select-none">
      <PanelHeader title="TRAINING CONFIGURATION" onBack={onBack} isLight={isLight} />

      <PanelContent scrollable>
        <div
          data-layout="training-config-list"
          className="flex flex-col w-full"
          style={{ gap: `${rowGap}px` }}
        >
          {/* Scope Group 1: Free Play Only */}
          <div
            className={`flex items-center justify-between px-3 pt-1 pb-1.5 border-b ${sectionLabelClass}`}
          >
            <span className="text-[10px] font-bold uppercase tracking-wider">
              Free Play Scope
            </span>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded border uppercase tracking-wider font-semibold bg-amber-500/15 border-amber-500/30 text-amber-400">
              Free Play Only
            </span>
          </div>

          {/* 1. Boost: Unlimited | Standard (Inline Segmented Control) */}
          <SettingSegmentedRow
            icon={Zap}
            iconName="zap"
            iconColor="text-amber-500"
            title="Boost"
            value={boostValue}
            onChange={(val) => handleSetUnlimitedBoost(val === 'unlimited')}
            layout="inline"
            bordered={false}
            showDescription={false}
            options={[
              { value: 'unlimited', label: 'Unlimited' },
              { value: 'standard', label: 'Standard' },
            ]}
            hoverDescription="Free Play Only: Choose between continuous unlimited boost refill or standard 100% capacity limitation in Free Play."
            onHover={(desc) => desc && setHoveredDesc(desc)}
            onLeave={() => setHoveredDesc(null)}
            isLight={isLight}
          />

          {/* 2. Disable Goal Reset: ToggleSwitch with CircleSlash2 ('circle-slash-2') icon */}
          <SettingToggleRow
            icon={CircleSlash2}
            iconName="circle-slash-2"
            iconColor="text-rose-400"
            title="Disable Goal Reset"
            checked={!goalRestart}
            onChange={(disableReset) => handleSetGoalRestart(!disableReset)}
            bordered={false}
            showDescription={false}
            hoverDescription="Free Play Only: When enabled, scoring a goal in Free Play will not trigger goal replay or reset the ball to kickoff."
            onHover={(desc) => desc && setHoveredDesc(desc)}
            onLeave={() => setHoveredDesc(null)}
            isLight={isLight}
          />

          {/* 3. Rewinder Configurator: Floating Window Spawner */}
          <FloatingWindowCard
            preset={REWINDER_CONFIGURATOR_PRESET}
            icon={History}
            iconColor="text-amber-500"
            bordered={false}
            showDescription={false}
            hoverTooltip="Free Play Only: Spawn the Rewinder Configurator floating window to record, scrub, rewind, and resume Free Play state history with hotkeys (O / P / [ / ] / G)."
            onHover={setHoveredDesc}
            onLeave={() => setHoveredDesc(null)}
            isLight={isLight}
          />

          {/* 4. Manual Highlight Replay Export (Recent 60s FIFO Ring Buffer) */}
          <SettingActionRow
            icon={Download}
            iconName="download"
            iconColor="text-emerald-400"
            title="Export Recent Replay (60s)"
            actionLabel={exportStatusLabel ?? 'Export (F8)'}
            showButtonArrow={false}
            bordered={false}
            showDescription={false}
            onAction={handleExportRecentReplay}
            hoverDescription="Free Play Only: Export the last 60 seconds of Free Play FIFO ring buffer frames to a compressed .rcreplay.gz file (Hotkey: F8)."
            onHover={setHoveredDesc}
            onLeave={() => setHoveredDesc(null)}
            isLight={isLight}
          />

          {/* Scope Group 2: All Training Modes */}
          <div
            className={`flex items-center justify-between px-3 pt-2.5 pb-1.5 border-b ${sectionLabelClass}`}
          >
            <span className="text-[10px] font-bold uppercase tracking-wider">
              Training Scope
            </span>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded border uppercase tracking-wider font-semibold bg-sky-500/15 border-sky-500/30 text-sky-400">
              Free Play · Packs · Kickoff
            </span>
          </div>

          {/* 5. Enable F to Mirror: ToggleSwitch (Default ON) */}
          <SettingToggleRow
            icon={FlipHorizontal2}
            iconName="flip-horizontal-2"
            iconColor="text-cyan-400"
            title="Enable F to Mirror"
            checked={enableFToMirror !== false}
            onChange={handleSetEnableFToMirror}
            bordered={false}
            showDescription={false}
            hoverDescription="Static Training Packs: When enabled (default ON), pressing [F] horizontally mirrors the active shot across the field center axis."
            onHover={(desc) => desc && setHoveredDesc(desc)}
            onLeave={() => setHoveredDesc(null)}
            isLight={isLight}
          />

          {/* 6. Goal Barrier Configurator: Floating Window Spawner */}
          <FloatingWindowCard
            preset={GOAL_BARRIER_CONFIGURATOR_PRESET}
            icon={Shield}
            iconColor="text-sky-500"
            bordered={false}
            showDescription={false}
            hoverTooltip="Training Scope: Spawn the Goal Barrier Configurator floating window to draw custom barrier regions in Free Play, Static Training Pack, and Kickoff Training (automatically bypassed in Exhibition & Multiplayer)."
            onHover={setHoveredDesc}
            onLeave={() => setHoveredDesc(null)}
            isLight={isLight}
          />

          {/* 7. Keyboard Input Overlay: Floating Window Spawner */}
          <FloatingWindowCard
            preset={KEYBOARD_INPUT_OVERLAY_PRESET}
            icon={Keyboard}
            iconColor="text-emerald-400"
            bordered={false}
            showDescription={false}
            hoverTooltip="Training Scope: Spawn the resizable 3x3 Keyboard Input Overlay floating window (Q/W/E, A/S/D, Slide/Boost/Jump) with 3D camera-relative WASD attitude arrows."
            onHover={setHoveredDesc}
            onLeave={() => setHoveredDesc(null)}
            isLight={isLight}
          />

          {/* 8. Car Nose Direction Arrows: ToggleSwitch (Default OFF, synced with Developer Tuner) */}
          <SettingToggleRow
            icon={Compass}
            iconName="compass"
            iconColor="text-emerald-400"
            title="Car Nose Direction Arrows"
            checked={Boolean(enableNoseArrowRendering)}
            onChange={(next) =>
              updateKeyboardOverlayConfig({ enableNoseArrowRendering: next })
            }
            bordered={false}
            showDescription={false}
            hoverDescription="Training Scope: Render 4-way 3D WASD direction arrows on the front nose of your car (default OFF)."
            onHover={(desc) => desc && setHoveredDesc(desc)}
            onLeave={() => setHoveredDesc(null)}
            isLight={isLight}
          />
        </div>
      </PanelContent>

      <PanelFooter
        isLight={isLight}
        defaultDescription="Configure Free Play rules (boost, goal reset, rewinder) and Training goal barrier. Automatically bypassed in Exhibition & Multiplayer."
        hoveredDescription={hoveredDesc}
        icon={<Info className="h-3.5 w-3.5 text-neutral-400 shrink-0" />}
      />
    </PanelContainer>
  );
});

Layer3TrainingConfigRecipe.displayName = 'Layer3TrainingConfigRecipe';
export default Layer3TrainingConfigRecipe;
