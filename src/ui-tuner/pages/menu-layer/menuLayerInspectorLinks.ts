import type { ShowcaseTab } from '../../sidebarNavConfig';
import type { ActiveMenuRoute } from './menuLayerRouteConfig';
import {
  DEEP_ROUTE_TO_6A_RECIPE_TARGET,
  type InspectorJumpTarget,
} from './menuLayerDeepInspectorTargets';

export type { InspectorJumpTarget };

export interface NodePathInspectorResolution {
  /** Primary standalone recipe tuner for the active menu route (in 6A RecipesPage) */
  pageRecipeTarget: InspectorJumpTarget;
  /** Underlying L1–L6 elements & primitives rendered inside the active menu route / subtab */
  elementTargets: InspectorJumpTarget[];
  /** Whether the active view renders SettingActionRow (e.g. Settings -> Gameplay / Audio) */
  usesSettingActionRow: boolean;
}

const makeJump = (
  code: string,
  componentName: string,
  label: string,
  tab: ShowcaseTab,
  targetId?: string
): InspectorJumpTarget => ({
  code,
  componentName,
  label,
  tab,
  ...(targetId ? { targetId } : {}),
});

const CORE_ROUTE_TO_6A_RECIPE_TARGET: Record<
  'layer-0' | 'main-menu' | 'play' | 'garage' | 'settings' | 'manage-room',
  InspectorJumpTarget
> = {
  'layer-0': makeJump(
    '5C / 6D',
    'MenuLayerStageCanvas',
    '6D Floating window arrangement and match stage',
    'floating-windows'
  ),
  'main-menu': makeJump(
    '6A.1',
    'Layer1MainMenuRecipe',
    '6A.1 Main menu size and button spacing tuning',
    'recipes',
    'recipe-6a-1-main'
  ),
  play: makeJump(
    '6A.2',
    'Layer2PlayRecipe',
    '6A.2 Play Mode selection panel tuning',
    'recipes',
    'recipe-6a-2-play'
  ),
  garage: makeJump(
    '6A.3',
    'Layer2GarageRecipe',
    '6A.3 Garage Garage Panel Tuning',
    'recipes',
    'recipe-6a-3-garage'
  ),
  settings: makeJump(
    '6A.4',
    'Layer2SettingsRecipe',
    '6A.4 Settings Panel and navigation row tuning',
    'recipes',
    'recipe-6a-4-settings'
  ),
  'manage-room': makeJump(
    '6A.8',
    'Layer2ManageRoomRecipe',
    '6A.8 Online room control console tuning',
    'recipes',
    'recipe-6a-8-host-ctrl'
  ),
};

const ROUTE_TO_6A_RECIPE_TARGET: Record<ActiveMenuRoute, InspectorJumpTarget> = {
  ...CORE_ROUTE_TO_6A_RECIPE_TARGET,
  ...(DEEP_ROUTE_TO_6A_RECIPE_TARGET as Record<
    Exclude<ActiveMenuRoute, keyof typeof CORE_ROUTE_TO_6A_RECIPE_TARGET>,
    InspectorJumpTarget
  >),
};

const PANEL_SHELL_TARGET = makeJump(
  '6A.2S',
  'PanelShellTuner',
  '6A.2S 3-Stage Panel Shell Tuning (top bar/Content/bottom bar Padding)',
  'recipes',
  'panel-shell-tuner'
);
const SETTING_ACTION_ROW_TARGET = makeJump(
  '6A.4S',
  'SettingActionRowTuner',
  '6A.4S SettingActionRow Tuner (border/Description/Padding/SVG Color)',
  'recipes',
  'setting-action-row-tuner'
);
const UNDERLINE_TABS_TARGET = makeJump(
  '6A.4T',
  'UnderlineTabsTuner',
  '6A.4T UnderlineTabs Top bar tab tuner',
  'recipes',
  'underline-tabs-tuner'
);
const SEGMENTED_SWITCH_TARGET = makeJump(
  'L1.2',
  'SegmentedSwitch',
  'SegmentedSwitch (Segmented Switcher)',
  'tabs',
  'l1-segmented-switch'
);
const SLIDER_CONTROL_TARGET = makeJump(
  'L1.3',
  'SliderControl',
  'SliderControl (Stepper Slider)',
  'tabs',
  'l1-slider-control'
);
const DUAL_GRABBER_TARGET = makeJump(
  'L1.4',
  'DualGrabberSlider',
  'DualGrabberSlider (Dual-cursor deadzone slider)',
  'tabs',
  'l1-dual-grabber-slider'
);
const TOGGLE_SWITCH_TARGET = makeJump(
  'L1.6',
  'ToggleSwitch',
  'ToggleSwitch (Toggle Switch)',
  'tabs',
  'l1-toggle-switch'
);

/**
 * Pure decoupled resolver that inspects the active 7A node path
 * (`currentRoute` + `settingsTab` + `garageTab`) and returns direct jump links
 * to both the current page's 6A Recipe Tuner and its internal L1–L6 elements.
 */
export function resolveNodePathInspectorLinks(
  currentRoute: ActiveMenuRoute,
  settingsTab: string = 'gameplay',
  garageTab: string = 'car'
): NodePathInspectorResolution {
  const pageRecipeTarget =
    ROUTE_TO_6A_RECIPE_TARGET[currentRoute] ?? ROUTE_TO_6A_RECIPE_TARGET['main-menu'];

  if (currentRoute === 'layer-0') {
    return {
      pageRecipeTarget,
      elementTargets: [
        makeJump('6D', 'FloatingWindowManager', 'Floating Window Floating Window and Stack Tray', 'floating-windows'),
        makeJump('5C', 'SafeAreaHud', 'Viewport & Safe Area Viewport Safe Area', 'viewport-safe-area'),
      ],
      usesSettingActionRow: false,
    };
  }

  if (currentRoute === 'main-menu') {
    return {
      pageRecipeTarget,
      elementTargets: [
        makeJump('6A.1M', 'MainMenuStyleTuner', '6A.1M MENU Minimalist large-text and font-outline tuning workbench', 'recipes', 'main-menu-style-tuner'),
        makeJump('L4.Nav', 'MenuContainer', 'MenuContainer Stack menu container', 'navigation'),
        makeJump('L4.Nav', 'MainMenuRow', 'MainMenuRow List items and shortcut badges', 'navigation'),
        makeJump('L1.Badge', 'KeycapBadge', 'KeycapBadge Keycap Primitive', 'badges'),
      ],
      usesSettingActionRow: false,
    };
  }

  if (currentRoute === 'settings') {
    if (settingsTab === 'gameplay') {
      return {
        pageRecipeTarget,
        elementTargets: [
          SETTING_ACTION_ROW_TARGET,
          SEGMENTED_SWITCH_TARGET,
          PANEL_SHELL_TARGET,
          UNDERLINE_TABS_TARGET,
          TOGGLE_SWITCH_TARGET,
        ],
        usesSettingActionRow: true,
      };
    }
    if (settingsTab === 'audio') {
      return {
        pageRecipeTarget,
        elementTargets: [
          SETTING_ACTION_ROW_TARGET,
          SLIDER_CONTROL_TARGET,
          TOGGLE_SWITCH_TARGET,
          PANEL_SHELL_TARGET,
        ],
        usesSettingActionRow: true,
      };
    }
    if (settingsTab === 'display') {
      return {
        pageRecipeTarget,
        elementTargets: [
          SETTING_ACTION_ROW_TARGET,
          {
            code: '6A.4S-E',
            componentName: 'SettingPresetCustomRow',
            label: '6A.4S-E SettingPresetCustomRow (UI Scaling & Render Scale Slide Merge)',
            tab: 'recipes',
            targetId: 'setting-preset-custom-tuner',
          },
          SEGMENTED_SWITCH_TARGET,
          SLIDER_CONTROL_TARGET,
          PANEL_SHELL_TARGET,
          {
            code: '5C',
            componentName: 'GameViewport',
            label: '5C Viewport scaling and safe area',
            tab: 'viewport-safe-area',
          },
        ],
        usesSettingActionRow: true,
      };
    }
    if (settingsTab === 'advanced') {
      return {
        pageRecipeTarget,
        elementTargets: [
          {
            code: '6A.4S-H',
            componentName: 'TelemetryConfigCard',
            label:
              '6A.4S-H Show Telemetry Summary (Show ▾ Collapsed and embedded telemetry configuration tuning)',
            tab: 'recipes',
            targetId: 'setting-telemetry-summary-tuner',
          },
          {
            code: 'L3.8',
            componentName: 'TelemetryConfigCard',
            label: 'L3.8 TelemetryConfigCard (Level 1 Nested telemetry matrix page)',
            tab: 'composable-nesting',
            targetId: 'l3-telemetry-matrix',
          },
          {
            code: '6A.4S-F',
            componentName: 'SettingDeveloperStatusRow',
            label: '6A.4S-F SettingDeveloperStatusRow (Developer Disabled/Active Badge)',
            tab: 'recipes',
            targetId: 'setting-dev-status-tuner',
          },
          SETTING_ACTION_ROW_TARGET,
          {
            code: '6A.5',
            componentName: 'AudioDebugSection',
            label: '6A.5 AudioDebugSection (Settings Full Preview · Audio pipeline diagnostic suite)',
            tab: 'recipes',
            targetId: 'recipe-6a-5-settings-preview',
          },
          DUAL_GRABBER_TARGET,
          SEGMENTED_SWITCH_TARGET,
          {
            code: '6D',
            componentName: 'FloatingWindowCard',
            label: 'Floating Window Floating Launcher',
            tab: 'floating-windows',
          },
          PANEL_SHELL_TARGET,
        ],
        usesSettingActionRow: true,
      };
    }
    return {
      pageRecipeTarget,
      elementTargets: [
        SETTING_ACTION_ROW_TARGET,
        SEGMENTED_SWITCH_TARGET,
        TOGGLE_SWITCH_TARGET,
        PANEL_SHELL_TARGET,
        {
          code: '6D',
          componentName: 'FloatingWindowManager',
          label: '6D Developer parameter overlay',
          tab: 'floating-windows',
        },
      ],
      usesSettingActionRow: true,
    };
  }

  if (currentRoute === 'garage') {
    const garageElements: InspectorJumpTarget[] = [PANEL_SHELL_TARGET, UNDERLINE_TABS_TARGET];
    if (garageTab === 'car') {
      garageElements.unshift({
        code: 'L2.Card',
        componentName: 'SelectableCard',
        label: 'SelectableCard (Vehicle preset selection card)',
        tab: 'cards',
      });
    } else if (garageTab === 'paint') {
      garageElements.unshift({
        code: 'L3.5',
        componentName: 'PriorityQueueList',
        label: 'PriorityQueueList (Livery priority queue)',
        tab: 'composable-nesting',
        targetId: 'l3-5-priority-event-matrix',
      });
    } else if (garageTab === 'loadout') {
      garageElements.unshift(
        {
          code: 'L3.3',
          componentName: 'UVTransformControl',
          label: 'UVTransformControl UV Offset / Scale / Rotation',
          tab: 'composable-nesting',
          targetId: 'l3-3-uv-color-tuner',
        },
        {
          code: 'L3.3',
          componentName: 'ColorSwatchInput',
          label: 'ColorSwatchInput Swatch & Hex Input',
          tab: 'composable-nesting',
          targetId: 'l3-3-uv-color-tuner',
        }
      );
    }
    return { pageRecipeTarget, elementTargets: garageElements, usesSettingActionRow: false };
  }

  if (currentRoute === 'play' || currentRoute === 'self-training') {
    return {
      pageRecipeTarget,
      elementTargets: [
        ...(currentRoute === 'play'
          ? [
              {
                code: 'L2.2B',
                componentName: 'PlayModeCard',
                label: 'PlayModeCard (Tri-Style/watermark/Icon Color Page)',
                tab: 'play-cards' as ShowcaseTab,
              },
            ]
          : []),
        { code: 'L2.Card', componentName: 'Card', label: 'Card Grid mode card container', tab: 'cards' },
        {
          code: 'L2.Card',
          componentName: 'SelectableCard',
          label: 'SelectableCard Interactive selection card',
          tab: 'cards',
        },
        PANEL_SHELL_TARGET,
      ],
      usesSettingActionRow: false,
    };
  }

  if (currentRoute === 'trajectory' || currentRoute === 'camera') {
    return {
      pageRecipeTarget,
      elementTargets: [
        ...(currentRoute === 'camera'
          ? [
              {
                code: '6A.12M',
                componentName: 'CameraSettingsStyleTuner',
                label: '6A.12M Camera Settings Center Aligned · Checkbox · Red large button tuning console',
                tab: 'recipes' as ShowcaseTab,
                targetId: 'camera-settings-style-tuner',
              },
              {
                code: 'L1.7',
                componentName: 'Checkbox',
                label: 'L1.7 Checkbox Checkbox atomic primitive',
                tab: 'tabs' as ShowcaseTab,
                targetId: 'l1-checkbox',
              },
              {
                code: 'L3.2',
                componentName: 'Dialogue',
                label: 'L3.2 Dialogue Red secondary confirmation popup',
                tab: 'dialogue' as ShowcaseTab,
              },
            ]
          : []),
        {
          code: '6C',
          componentName: 'LivePreviewDock',
          label: '6C Live Preview Side pill storage unit',
          tab: 'live-preview',
        },
        SLIDER_CONTROL_TARGET,
        PANEL_SHELL_TARGET,
      ],
      usesSettingActionRow: false,
    };
  }

  if (
    currentRoute === 'training-config' ||
    currentRoute === 'dev-sandboxes' ||
    currentRoute === 'dev-active-tuners' ||
    currentRoute === 'dev-calibrated-presets' ||
    currentRoute === 'dev-self-test' ||
    currentRoute === 'dev-quick-actions' ||
    currentRoute === 'dev-remote-profile'
  ) {
    return {
      pageRecipeTarget,
      elementTargets: [
        SETTING_ACTION_ROW_TARGET,
        PANEL_SHELL_TARGET,
        SLIDER_CONTROL_TARGET,
        SEGMENTED_SWITCH_TARGET,
      ],
      usesSettingActionRow: true,
    };
  }

  if (currentRoute === 'keybindings') {
    return {
      pageRecipeTarget,
      elementTargets: [
        {
          code: 'L1.Keycap',
          componentName: 'KeycapBadge',
          label: 'KeycapBadge Keycap shortcut badge',
          tab: 'badges',
        },
        {
          code: 'L1.Btn',
          componentName: 'Button',
          label: 'Button Interactive button primitive',
          tab: 'badges',
        },
        PANEL_SHELL_TARGET,
      ],
      usesSettingActionRow: false,
    };
  }

  if (currentRoute === 'controller-settings') {
    return {
      pageRecipeTarget,
      elementTargets: [
        {
          code: '5B',
          componentName: 'CubicBezierCurveEditor',
          label: '5B Bezier joystick transfer curve editor',
          tab: 'charts-curves',
        },
        {
          code: 'L3.11',
          componentName: 'CameraSwivelSimulatorCard',
          label: 'L3.11 View rotation simulator',
          tab: 'composable-nesting',
          targetId: 'l3-11-swivel-kickoff-duel',
        },
        PANEL_SHELL_TARGET,
      ],
      usesSettingActionRow: false,
    };
  }

  return {
    pageRecipeTarget,
    elementTargets: [PANEL_SHELL_TARGET, SLIDER_CONTROL_TARGET, SEGMENTED_SWITCH_TARGET],
    usesSettingActionRow: false,
  };
}
