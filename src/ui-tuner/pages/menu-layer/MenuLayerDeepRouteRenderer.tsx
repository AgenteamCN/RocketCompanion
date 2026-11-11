import React from 'react';
import {
  AlertCircle,
  ArrowUpRight,
} from 'lucide-react';
import { Badge } from '../../../ui-core/primitives/Badge';
import { useMenuLayoutStore } from '../../../ui-core/stores/menuLayoutStore';
import { DEFAULT_PANEL_SIZING, type MenuPanelId } from '../../../ui-core/tokens/menuLayoutTokens';
import { useCameraSettingsStyleStore, CAMERA_SETTINGS_STYLE_PRESETS, type CameraSettingsPresetId } from '../../../ui-core/stores/cameraSettingsStyleStore';
import { useQuickNotificationStore } from '../../../ui-core/stores/quickNotificationStore';
import { dispatchOnlineRoomErrorNotification } from '../../../ui-core/recipes/online/OnlineRoomCreationProgress';
import type { ActiveMenuRoute } from './menuLayerRouteConfig';
import { USER_LINEAR_PLAYLIST } from './menuLayerLinearPlaylists';
import { useMenuLayerSandbox } from './MenuLayerSandboxContext';

interface DeepRouteButtonItem {
  route: ActiveMenuRoute;
  label: string;
  panel: MenuPanelId;
}

const USER_L3_ROUTE_ITEMS: DeepRouteButtonItem[] = [
  { route: 'host-match', label: 'Host Match (Create Room)', panel: 'layer3-host-match' },
  { route: 'host-training', label: 'Host Training (Online Training)', panel: 'layer3-host-training' },
  { route: 'custom-play', label: 'Custom (In Development)', panel: 'layer3-custom-play' },
  { route: 'join-room', label: 'Join Room (Join Room)', panel: 'layer3-join-room' },
  { route: 'exhibition', label: 'Exhibition Setup (Offline AI)', panel: 'layer3-exhibition' },
  { route: 'self-training', label: 'Self-Training Hub (Solo Training)', panel: 'layer3-self-training' },
  { route: 'kickoff-training', label: 'Kickoff Training (Rhythm Kickoff)', panel: 'layer3-kickoff-training' },
  { route: 'training-config', label: 'Training Config (Training & Replay)', panel: 'layer3-training-config' },
  { route: 'camera', label: 'Camera Settings (Camera Geometry)', panel: 'layer3-camera' },
  { route: 'keybindings', label: 'Key Bindings (Key and controller mapping)', panel: 'layer3-keybindings' },
  { route: 'trajectory', label: 'Ball Trajectory (Live Preview)', panel: 'layer3-ball-trajectory' },
];

const DEV_L3_ROUTE_ITEMS: DeepRouteButtonItem[] = [
  { route: 'dev-sandboxes', label: 'Sandboxes & Isolation (6-Tab Isolation Chamber)', panel: 'layer3-dev-sandboxes' },
  { route: 'exp-multi-bots', label: 'Multi-Bots (3v3 orchestration)', panel: 'layer3-exp-multi-bots' },
  { route: 'exp-botpack-9700488', label: 'BotPack #9700488 (8 Native Models)', panel: 'layer3-exp-botpack' },
  { route: 'dev-active-tuners', label: 'Active Tuners (Phase matrix and audio)', panel: 'layer3-dev-active-tuners' },
  { route: 'dev-calibrated-presets', label: 'Calibrated Presets (Calibrated Tuner)', panel: 'layer3-dev-calibrated-presets' },
  { route: 'dev-self-test', label: 'Self Test (Self-Test Suites)', panel: 'layer3-dev-self-test' },
  { route: 'dev-remote-profile', label: 'Remote Profile (Cloud Account Sync)', panel: 'layer3-dev-remote-profile' },
  { route: 'dev-under-development', label: 'Under Development (Feature in Development)', panel: 'layer3-dev-under-development' },
  { route: 'dev-quick-actions', label: 'Quick Actions (Dev Quick Actions)', panel: 'layer3-dev-quick-actions' },
  { route: 'acoustics-equalizer', label: 'Acoustics & EQ (Acoustic Equalization)', panel: 'layer3-acoustics-equalizer' },
];

const USER_L4_ROUTE_ITEMS: DeepRouteButtonItem[] = [
  { route: 'static-training-pack', label: '.RCSPack Browser (Training Pack Browser)', panel: 'layer4-static-training-pack' },
  { route: 'controller-settings', label: 'Controller Settings (Advanced Stick Curve)', panel: 'layer4-controller-settings' },
];

const DEV_L4_ROUTE_ITEMS: DeepRouteButtonItem[] = [
  { route: 'advanced-audio', label: 'Advanced Audio Pool (Audio Stage Pool)', panel: 'layer4-advanced-audio' },
  { route: 'event-trigger-rules', label: 'Event & Trigger Rules (Trigger rule engine)', panel: 'layer4-event-trigger-rules' },
  { route: 'dev-signaling-lab', label: '4-Server Signaling Lab (Full-Mesh & Dual Bridge)', panel: 'layer4-dev-signaling-lab' },
  { route: 'dev-tem-pack-converter', label: 'Dev .tem Pack Converter (.tem -> .RCSPack)', panel: 'layer4-static-training-pack' },
];

export interface MenuLayerDeepRouteRendererProps {
  isLight: boolean;
}

export const MenuLayerDeepRouteRenderer: React.FC<MenuLayerDeepRouteRendererProps> = ({
  isLight,
}) => {
  const {
    visibilityTier,
    currentRoute,
    handleSelectRoute,
    showToast,
    showInlineTuner,
    setShowInlineTuner,
    onNavigateShowcase,
    layer3StepOverride,
    setLayer3StepOverride: onChangeLayer3StepOverride,
  } = useMenuLayerSandbox();
  const { panels, simulateLayer3Error, setToken } = useMenuLayoutStore();
  const getPanelWidth = (panelId: MenuPanelId) =>
    (panels?.[panelId] ?? DEFAULT_PANEL_SIZING[panelId])?.width ?? 480;
  const setSimulateLayer3Error = (enabled: boolean) =>
    setToken('simulateLayer3Error', enabled);
  const onToggleInlineTuner = () => setShowInlineTuner((prev) => !prev);

  const cameraStyle = useCameraSettingsStyleStore();
  const routeProgressSteps = React.useMemo(
    () =>
      USER_LINEAR_PLAYLIST.filter(
        (s) => s.route === currentRoute && s.progressStatus !== undefined
      ),
    [currentRoute]
  );

  const l3Items = visibilityTier === 'user' ? USER_L3_ROUTE_ITEMS : DEV_L3_ROUTE_ITEMS;
  const l4Items = visibilityTier === 'user' ? USER_L4_ROUTE_ITEMS : DEV_L4_ROUTE_ITEMS;
  const inactiveRouteBtnCls = isLight
    ? 'bg-neutral-50 hover:bg-neutral-100 border-neutral-200 text-neutral-800 shadow-2xs'
    : 'bg-neutral-800 hover:bg-neutral-700 border-neutral-700 text-neutral-200 shadow-2xs';
  const inactiveSubChipCls = isLight
    ? 'bg-neutral-50 hover:bg-neutral-100 border-neutral-200 text-neutral-700'
    : 'bg-neutral-800 hover:bg-neutral-700 border-neutral-700 text-neutral-300';
  const routeBtnBaseCls =
    'flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-medium transition-all cursor-pointer';

  const renderRouteButtons = (items: DeepRouteButtonItem[]) =>
    items.map((item) => {
      const isActive = currentRoute === item.route || (item.route === 'acoustics-equalizer' && currentRoute === 'audio-eq');
      return (
        <button
          key={item.route}
          type="button"
          onClick={() => handleSelectRoute(item.route)}
          className={`${routeBtnBaseCls} ${
            isActive
              ? 'bg-amber-500 text-white border-amber-500 font-semibold shadow-2xs'
              : inactiveRouteBtnCls
          }`}
        >
          <span>{item.label}</span>
          <span className="font-mono text-[10px] opacity-75">{getPanelWidth(item.panel)}px</span>
        </button>
      );
    });

  return (
    <>
      {/* Layer 3: Tertiary Sub-Menus (Strictly filtered by User vs Developer) */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 text-xs pt-2.5 border-t border-neutral-100 dark:border-neutral-800/80">
        <div className="flex items-center gap-1.5 min-w-[130px] shrink-0 font-semibold text-neutral-500 dark:text-neutral-400">
          <Badge variant="success" size="sm" isLight={isLight}>
            Layer 3
          </Badge>
          <span>Three-level independent submenu</span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {renderRouteButtons(l3Items)}

          {visibilityTier === 'user' && (
            <button
              type="button"
              onClick={() => {
                const next = !simulateLayer3Error;
                setSimulateLayer3Error(next);
                if (next) {
                  dispatchOnlineRoomErrorNotification();
                  const st = useQuickNotificationStore.getState();
                  if (st.activeNotification) {
                    st.collapseActive();
                  }
                  st.setStackOpen(false);
                  showToast(
                    'Triggered Layer 3 inline error (click "View Notification" to expand top-right drawer)'
                  );
                } else {
                  showToast('Cleared Layer 3 inline error');
                }
              }}
              className={`${routeBtnBaseCls} ${
                simulateLayer3Error
                  ? 'bg-rose-500 text-white border-rose-500 font-semibold shadow-2xs'
                  : isLight
                  ? 'bg-rose-50 hover:bg-rose-100 border-rose-200 text-rose-700'
                  : 'bg-rose-950/40 hover:bg-rose-900/50 border-rose-800/70 text-rose-300'
              }`}
            >
              <AlertCircle className="h-3.5 w-3.5" />
              <span>
                {simulateLayer3Error ? 'Inline Error: Active' : 'Simulate Layer 3 Inline Error'}
              </span>
            </button>
          )}
        </div>
      </div>

      {/* Sub-bar when Host Match / Host Training / Join Room is active: Exhaustive Progress State Switcher */}
      {routeProgressSteps.length > 0 && (
        <div className="w-full pt-2 flex flex-col gap-1.5 border-t border-neutral-100 dark:border-neutral-800/60">
          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-neutral-500 dark:text-neutral-400 font-mono">
            <span>
              Exhaustive 5-Step Progress &amp; Error State Enumeration (also navigable via ArrowLeft / ArrowRight):
            </span>
            <span className="text-amber-500 font-semibold">
              status={(layer3StepOverride?.progressStatus ?? 'idle').toUpperCase()} · step={layer3StepOverride?.currentStep ?? 1}/5
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {routeProgressSteps.map((step) => {
              const active =
                (layer3StepOverride?.progressStatus ?? 'idle') === step.progressStatus &&
                (layer3StepOverride?.currentStep ?? 1) === (step.currentStep ?? 1) &&
                Boolean(layer3StepOverride?.defaultEditingConfig) === Boolean(step.defaultEditingConfig);
              return (
                <button
                  key={step.id}
                  type="button"
                  onClick={() => {
                    onChangeLayer3StepOverride({
                      progressStatus: step.progressStatus,
                      currentStep: step.currentStep ?? 1,
                      defaultEditingConfig: Boolean(step.defaultEditingConfig),
                    });
                    showToast(`Switched to state: ${step.label}`);
                  }}
                  className={`px-2.5 py-1 rounded-lg text-xs font-mono border cursor-pointer transition-all ${
                    active
                      ? step.progressStatus === 'error'
                        ? 'bg-rose-500 text-white border-rose-500 font-bold shadow-2xs'
                        : 'bg-amber-500 text-white border-amber-500 font-bold shadow-2xs'
                      : inactiveSubChipCls
                  }`}
                >
                  {step.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Sub-bar when Camera Settings is active: 5 Spine & Checkbox Presets + Inline Tuner Toggle */}
      {currentRoute === 'camera' && (
        <div className="w-full pt-2 flex flex-col gap-1.5 border-t border-neutral-100 dark:border-neutral-800/60">
          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-neutral-500 dark:text-neutral-400 font-mono">
            <span>
              7A.12 Camera Settings Layout Presets (Center-Aligned Slider · Right-Aligned Action Text · Left-Aligned Numeric Box · Checkbox · Destructive Reset Confirm):
            </span>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={onToggleInlineTuner}
                className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 hover:underline font-bold cursor-pointer"
              >
                <span>
                  {showInlineTuner
                    ? 'Collapse 7A Inline Tuner Drawer ^'
                    : 'Expand 7A Inline Tuner Drawer (Spine / Spacing / Checkbox) v'}
                </span>
              </button>
              {onNavigateShowcase && (
                <button
                  type="button"
                  onClick={() =>
                    onNavigateShowcase('recipes', 'camera-settings-style-tuner')
                  }
                  className="inline-flex items-center gap-1 text-amber-500 hover:text-amber-400 font-bold cursor-pointer"
                >
                  <span>Open 6A.12M Dedicated Tuning Workbench</span>
                  <ArrowUpRight className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {(Object.keys(CAMERA_SETTINGS_STYLE_PRESETS) as CameraSettingsPresetId[]).map(
              (presetKey) => {
                const p = CAMERA_SETTINGS_STYLE_PRESETS[presetKey];
                const active = cameraStyle.preset === presetKey;
                return (
                  <button
                    key={presetKey}
                    type="button"
                    onClick={() => {
                      cameraStyle.applyPreset(presetKey);
                      showToast(`Toggled Camera Settings Layout: ${p.shortLabel}`);
                    }}
                    className={`px-2.5 py-1 rounded-lg text-xs font-mono border cursor-pointer transition-all ${
                      active
                        ? 'bg-emerald-500 text-white border-emerald-500 font-bold shadow-2xs'
                        : inactiveSubChipCls
                    }`}
                  >
                    {p.shortLabel}
                  </button>
                );
              }
            )}
          </div>
        </div>
      )}

      {/* Layer 4: Deep Sub-Menus (Strictly filtered by User vs Developer) */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 text-xs pt-2.5 border-t border-neutral-100 dark:border-neutral-800/80">
        <div className="flex items-center gap-1.5 min-w-[130px] shrink-0 font-semibold text-neutral-500 dark:text-neutral-400">
          <Badge variant="primary" size="sm" isLight={isLight}>
            Layer 4
          </Badge>
          <span>Level-4 depth page</span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {renderRouteButtons(l4Items)}
        </div>
      </div>
    </>
  );
};
