import React from 'react';
import { RotateCcw, Maximize2 } from 'lucide-react';
import { SliderControl } from '../../../ui-core/primitives/SliderControl';
import { SegmentedSwitch } from '../../../ui-core/primitives/SegmentedSwitch';
import { Badge } from '../../../ui-core/primitives/Badge';
import { Button } from '../../../ui-core/primitives/Button';
import { useMenuLayoutStore } from '../../../ui-core/stores/menuLayoutStore';
import { DEFAULT_PANEL_SIZING, type MenuPanelId, type PanelSizingMode } from '../../../ui-core/tokens/menuLayoutTokens';
import { getDiscoveredRecipeSurfaces } from '../../../ui-core/manifest/surfaceRegistry';
import type { JumpDirectoryItem, JumpDirectoryCategory } from '../../PageJumpDirectory';

export const RECIPES_CATEGORIES: JumpDirectoryCategory[] = [
  { id: 'all', label: 'All Modules (All)' },
  { id: 'layer1-2', label: 'L1–L2 Root menu and core panel' },
  { id: 'tuners', label: 'Shell and Row/Label Optimization (Tuners)' },
  { id: 'layer3-user', label: 'L3 Online/Training/Settings Sub-page (User)' },
  { id: 'layer3-dev', label: 'L3 Developer Sandbox/Parameter Library (Dev)' },
  { id: 'layer4', label: 'L4 Level-4 deep page' },
];

const CURATED_RECIPES_JUMP_ITEMS: JumpDirectoryItem[] = [
  { id: 'recipe-6a-1-main', code: '6A.1', name: 'Layer1MainMenuRecipe', label: 'Main pause root menu', badge: 'Layer 1', category: 'layer1-2' },
  { id: 'main-menu-style-tuner', code: '6A.1M', name: 'MainMenuStyleTuner', label: 'Layer 1 MENU Minimalist large-text menu tuning workbench', badge: 'L2 ⇄ L6', category: 'tuners' },
  { id: 'panel-shell-tuner', code: '6A.2S', name: 'PanelShellTuner', label: 'Layer 2+ Three-part panel shell tuner', badge: 'L2 ⇄ L6', category: 'tuners' },

  { id: 'recipe-6a-2-play', code: '6A.2', name: 'Layer2PlayRecipe', label: 'Mode Selection Grid', badge: 'Layer 2', category: 'layer1-2' },
  { id: 'recipe-6a-3-garage', code: '6A.3', name: 'Layer2GarageRecipe', label: 'Garage Appearance Settings', badge: 'Layer 2', category: 'layer1-2' },
  { id: 'recipe-6a-4-settings', code: '6A.4', name: 'Layer2SettingsRecipe', label: 'Settings Panel Size Optimization', badge: 'Layer 2', category: 'layer1-2' },
  { id: 'underline-tabs-tuner', code: '6A.4T', name: 'UnderlineTabsTuner', label: 'Settings Top bar sliding underline label tuning', badge: 'L1.1 ⇄ L6', category: 'tuners' },
  { id: 'setting-action-row-tuner', code: '6A.4S', name: 'SettingActionRowTuner', label: 'Set navigation row and unified row prototype tuning', badge: 'L1.0 ⇄ L6', category: 'tuners' },
  { id: 'setting-telemetry-summary-tuner', code: '6A.4S-H', name: 'TelemetryConfigCard', label: 'Show Telemetry Summary Collapse and inline tuning', badge: 'L3.8 ⇄ L6', category: 'tuners' },
  { id: 'recipe-6a-5-settings-preview', code: '6A.5', name: 'Layer2SettingsRecipe (Preview)', label: '9+1 Tabs Integrated settings real-time preview', badge: 'Layer 2', category: 'layer1-2' },
  { id: 'recipe-6a-6a-host', code: '6A.6A', name: 'Layer3HostMatchRecipe', label: 'Host Room Page (Host)', badge: 'Layer 3', category: 'layer3-user' },
  { id: 'recipe-6a-6b-join', code: '6A.6B', name: 'Layer3JoinRoomRecipe', label: 'Join Room Page (Join)', badge: 'Layer 3', category: 'layer3-user' },
  { id: 'recipe-6a-7-audio', code: '6A.7', name: 'Layer3AcousticsEqualizerRecipe', label: 'Audio advanced equalizer', badge: 'Layer 3', category: 'layer3-user' },
  { id: 'recipe-6a-8-host-ctrl', code: '6A.8', name: 'Layer2ManageRoomRecipe', label: 'Online room control console', badge: 'Layer 2', category: 'layer1-2' },
  { id: 'recipe-6a-9-bot-diff', code: '6A.9', name: 'Layer3ExhibitionRecipe', label: 'Exhibition Offline Match', badge: 'Layer 3', category: 'layer3-user' },
  { id: 'recipe-6a-10-self-train', code: '6A.10', name: 'Layer3SelfTrainingRecipe', label: 'Single-player training grid', badge: 'Layer 3', category: 'layer3-user' },
  { id: 'recipe-6a-11-kickoff', code: '6A.11', name: 'Layer3KickoffTrainingRecipe', label: 'Kick-off Rhythm Training', badge: 'Layer 3', category: 'layer3-user' },
  { id: 'recipe-6a-12-camera', code: '6A.12', name: 'Layer3CameraRecipe', label: 'Camera Geometry Settings (Center-aligned new design)', badge: 'Layer 3', category: 'layer3-user' },
  { id: 'camera-settings-style-tuner', code: '6A.12M', name: 'CameraSettingsStyleTuner', label: 'Camera Center Progress Bar · Checkbox · Red large button tuning console', badge: 'L1.7 ⇄ L6', category: 'tuners' },
  { id: 'recipe-6a-12b-keybindings', code: '6A.12B', name: 'Layer3KeybindingsRecipe', label: 'Key binding and advanced controller entry', badge: 'Layer 3 · User', category: 'layer3-user' },
  { id: 'recipe-6a-12c-trajectory', code: '6A.12C', name: 'Layer3BallTrajectoryRecipe', label: 'Side-docked trajectory prediction (Live Preview)', badge: 'Layer 3 · User', category: 'layer3-user' },
  { id: 'recipe-6a-13-multibots', code: '6A.13', name: 'Layer3ExpMultiBotsRecipe', label: '3v3 multi Bot orchestration', badge: 'Layer 3', category: 'layer3-user' },
  { id: 'recipe-6a-13b-botpack', code: '6A.13B', name: 'Layer3ExpBotPackRecipe', label: 'RLBot Pack #9700488 (8 Native Models)', badge: 'Layer 3 · Dev', category: 'layer3-dev' },
  { id: 'recipe-6a-14-rcspack', code: '6A.14', name: 'Layer4StaticTrainingPackBrowseRecipe', label: '.RCSPack Browser', badge: 'Layer 4', category: 'layer4' },
  { id: 'recipe-6a-14b-shot-inspector', code: '6A.14B', name: 'StaticTrainingShotInspectorDrawer', label: 'Static Training Shot Inspector Drawer', badge: 'Layer 4', category: 'layer4' },
  { id: 'recipe-6a-15-adv-audio', code: '6A.15', name: 'Layer4AdvancedAudioRecipe', label: 'Advanced audio synthesis pool', badge: 'Layer 4', category: 'layer4' },
  { id: 'recipe-6a-16-adv-ctrl', code: '6A.16', name: 'Layer4ControllerSettingsRecipe', label: 'Advanced Stick Curve', badge: 'Layer 4', category: 'layer4' },
  { id: 'recipe-6a-17-triggers', code: '6A.17', name: 'Layer4EventTriggerRulesRecipe', label: 'Trigger rule engine', badge: 'Layer 4', category: 'layer4' },
  { id: 'recipe-6a-18-training', code: '6A.18', name: 'Layer3TrainingConfigRecipe', label: 'Training Assist & Rewinder', badge: 'Layer 3 · User', category: 'layer3-user' },
  { id: 'recipe-6a-19-host-train', code: '6A.19', name: 'Layer3HostTrainingRecipe', label: 'Host Shared Training Room (4-State Matrix)', badge: 'Layer 3 · User', category: 'layer3-user' },
  { id: 'recipe-6a-20-dev-isolation', code: '6A.20', name: 'Layer3DevSandboxesRecipe', label: '6-Tab Sandboxes and subsystem isolation', badge: 'Layer 3 · Dev', category: 'layer3-dev' },
  { id: 'recipe-6a-21-dev-tuners', code: '6A.21', name: 'Layer3DevActiveTunersRecipe', label: 'Active tuner and phase matrix', badge: 'Layer 3 · Dev', category: 'layer3-dev' },
  { id: 'recipe-6a-22-dev-presets', code: '6A.22', name: 'Layer3DevCalibratedPresetsRecipe', label: 'Tuner library calibrated', badge: 'Layer 3 · Dev', category: 'layer3-dev' },
  { id: 'recipe-6a-23-dev-under-dev', code: '6A.23', name: 'Layer3DevUnderDevelopmentRecipe', label: 'Feature in Development (Camera Shake)', badge: 'Layer 3 · Dev', category: 'layer3-dev' },
  { id: 'recipe-6a-24-dev-self-test', code: '6A.24', name: 'Layer3DevSelfTestRecipe', label: 'Developer Self Test Suites', badge: 'Layer 3 · Dev', category: 'layer3-dev' },
  { id: 'recipe-6a-25-dev-signaling-lab', code: '6A.25', name: 'Layer4DevSignalingLabRecipe', label: '4-Server Signaling & Dual Bridge Lab', badge: 'Layer 4 · Dev', category: 'layer4' },
  { id: 'recipe-6a-26-custom-play', code: '6A.26', name: 'Layer3CustomPlayRecipe', label: 'Custom Play (In Development)', badge: 'Layer 3 · User', category: 'layer3-user' },
  { id: 'recipe-6a-27-dev-remote-profile', code: '6A.27', name: 'Layer3DevRemoteProfileRecipe', label: 'Remote Profile Management (2-Tab Cloud Sync)', badge: 'Layer 3 · Dev', category: 'layer3-dev' },
  { id: 'recipe-6a-28-dev-quick-actions', code: '6A.28', name: 'Layer3DevQuickActionsRecipe', label: 'Developer Quick Actions', badge: 'Layer 3 · Dev', category: 'layer3-dev' },
];

const CURATED_RECIPE_NAMES = new Set(CURATED_RECIPES_JUMP_ITEMS.map((it) => it.name));

const AUTO_DISCOVERED_RECIPE_JUMP_ITEMS: JumpDirectoryItem[] = getDiscoveredRecipeSurfaces()
  .filter((entry) => {
    const fileStem = entry.modulePath.split('/').pop()?.replace(/\.tsx$/, '') ?? entry.meta.id;
    return !CURATED_RECIPE_NAMES.has(fileStem) && !CURATED_RECIPE_NAMES.has(entry.meta.id);
  })
  .map((entry, idx) => {
    const fileStem = entry.modulePath.split('/').pop()?.replace(/\.tsx$/, '') ?? entry.meta.id;
    const isL4 = entry.meta.layer === 'layer4' || entry.meta.layer === 'layer5';
    const isL12 = entry.meta.layer === 'layer1' || entry.meta.layer === 'layer2';
    return {
      id: `recipe-auto-${entry.meta.id}`,
      code: `6A.A${idx + 1}`,
      name: fileStem,
      label: entry.meta.subtitle || entry.meta.title,
      badge: entry.meta.layer.toUpperCase(),
      category: isL4 ? 'layer4' : isL12 ? 'layer1-2' : 'layer3-dev',
    };
  });

export const RECIPES_JUMP_ITEMS: JumpDirectoryItem[] = [
  ...CURATED_RECIPES_JUMP_ITEMS,
  ...AUTO_DISCOVERED_RECIPE_JUMP_ITEMS,
];

export interface LocalPanelSizingTunerProps {
  panelId: MenuPanelId;
  code?: string;
  label: string;
  recommendation: string;
  isLight: boolean;
  extraControls?: React.ReactNode;
}

/**
 * Proximity-placed single-panel dimension contract tuning bar (Co-located Per-Panel Sizing Inspector)
 * Support independent switching above each specific panel 'auto' (Auto-fit Content + min/max Clamp) and 'fixed' (Fixed target height + Small Screen Fallback). 
 */
export const LocalPanelSizingTuner = React.memo<LocalPanelSizingTunerProps>(({
  panelId,
  code,
  label,
  recommendation,
  isLight,
  extraControls,
}) => {
  const { panels, setPanelSizing, resetPanelSizing } = useMenuLayoutStore();
  const cfg = panels?.[panelId] ?? DEFAULT_PANEL_SIZING[panelId];

  return (
    <div
      className={`p-4 rounded-xl border flex flex-col gap-3.5 transition-colors ${
        isLight
          ? 'bg-white border-neutral-200/90 shadow-2xs'
          : 'bg-neutral-900/70 border-neutral-800'
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-neutral-200/70 dark:border-neutral-800">
        <div className="flex items-center gap-2 flex-wrap">
          {code && (
            <span className="px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-500 font-mono font-bold text-xs shrink-0">
              {code}
            </span>
          )}
          <Maximize2 className="h-3.5 w-3.5 text-amber-500 shrink-0" />
          <span className="text-xs font-bold">{label} · Independent panel size control</span>
          <Badge
            variant={cfg.mode === 'auto' ? 'success' : 'primary'}
            size="sm"
            isLight={isLight}
          >
            {cfg.mode === 'auto'
              ? `Auto-Fit (${cfg.width}px × [${cfg.minHeight}~${cfg.maxHeight}px])`
              : `Fixed (${cfg.width}×${cfg.targetHeight}px)`}
          </Badge>
          <span
            className={`text-[11px] font-mono ${
              isLight ? 'text-neutral-500' : 'text-neutral-400'
            }`}
          >
            {recommendation}
          </span>
        </div>

        <Button
          size="sm"
          variant="ghost"
          isLight={isLight}
          icon={<RotateCcw className="h-3 w-3" />}
          onClick={() => resetPanelSizing(panelId)}
        >
          Reset Panel
        </Button>
      </div>

      <div
        className={`grid grid-cols-1 gap-4 items-center ${
          cfg.mode === 'fixed' ? 'md:grid-cols-3' : 'sm:grid-cols-2 lg:grid-cols-4'
        }`}
      >
        {/* Mode Switcher */}
        <div className="flex flex-col gap-1">
          <span
            className={`text-[11px] font-semibold ${
              isLight ? 'text-neutral-600' : 'text-neutral-400'
            }`}
          >
            Height Mode (Sizing Mode)
          </span>
          <SegmentedSwitch
            value={cfg.mode}
            onValueChange={(v) => setPanelSizing(panelId, { mode: v as PanelSizingMode })}
            isLight={isLight}
            options={[
              { value: 'auto', label: 'Auto-Fit (Fit Content)' },
              { value: 'fixed', label: 'Fixed (Lock Height)' },
            ]}
          />
        </div>

        {/* Width Slider */}
        <div>
          <SliderControl
            label="Panel Width (width)"
            value={cfg.width}
            min={240}
            max={960}
            step={10}
            unit="px"
            editable={true}
            allowOutOfBoundsInput={true}
            colorScheme="amber"
            onChange={(v) => setPanelSizing(panelId, { width: v })}
            isLight={isLight}
          />
        </div>

        {/* Height Sliders depending on mode */}
        {cfg.mode === 'fixed' ? (
          <div>
            <SliderControl
              label="Lock Height (targetHeight)"
              value={cfg.targetHeight}
              min={200}
              max={840}
              step={10}
              unit="px"
              editable={true}
              allowOutOfBoundsInput={true}
              colorScheme="emerald"
              onChange={(v) => setPanelSizing(panelId, { targetHeight: v })}
              isLight={isLight}
            />
          </div>
        ) : (
          <>
            <SliderControl
              label="Min Height (minH)"
              value={cfg.minHeight}
              min={120}
              max={600}
              step={10}
              unit="px"
              editable={true}
              allowOutOfBoundsInput={true}
              colorScheme="emerald"
              onChange={(v) =>
                setPanelSizing(panelId, {
                  minHeight: v,
                })
              }
              isLight={isLight}
            />
            <SliderControl
              label="Max Height (maxH)"
              value={cfg.maxHeight}
              min={240}
              max={900}
              step={10}
              unit="px"
              editable={true}
              allowOutOfBoundsInput={true}
              colorScheme="sky"
              onChange={(v) =>
                setPanelSizing(panelId, {
                  maxHeight: v,
                })
              }
              isLight={isLight}
            />
          </>
        )}
      </div>

      {extraControls && (
        <div className="pt-2.5 border-t border-neutral-200/60 dark:border-neutral-800/80">
          {extraControls}
        </div>
      )}
    </div>
  );
});

LocalPanelSizingTuner.displayName = 'LocalPanelSizingTuner';
