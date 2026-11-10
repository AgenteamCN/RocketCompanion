import type { MenuPanelId } from '../../../ui-core/tokens/menuLayoutTokens';
import type { TabItem } from '../../../ui-core/primitives/UnderlineTabs';
import type { JumpDirectoryItem } from '../../PageJumpDirectory';
import type { Layer1MenuContextMode } from '../../../ui-core/recipes/layer1MenuContextSpecs';

export type MenuVisibilityTier = 'user' | 'developer';

export type ActiveMenuRoute =
  | 'layer-0'
  | 'main-menu'
  | 'play'
  | 'garage'
  | 'settings'
  | 'manage-room'
  | 'acoustics-equalizer'
  | 'audio-eq'
  | 'trajectory'
  | 'host-match'
  | 'host-training'
  | 'custom-play'
  | 'join-room'
  | 'exhibition'
  | 'self-training'
  | 'kickoff-training'
  | 'training-config'
  | 'camera'
  | 'keybindings'
  | 'exp-multi-bots'
  | 'exp-botpack-9700488'
  | 'dev-sandboxes'
  | 'dev-active-tuners'
  | 'dev-calibrated-presets'
  | 'dev-self-test'
  | 'dev-under-development'
  | 'dev-remote-profile'
  | 'dev-quick-actions'
  | 'dev-tem-pack-converter'
  | 'static-training-pack'
  | 'advanced-audio'
  | 'controller-settings'
  | 'event-trigger-rules'
  | 'dev-signaling-lab';

export const ROUTE_TO_PANEL_ID: Record<Exclude<ActiveMenuRoute, 'layer-0'>, MenuPanelId> = {
  'main-menu': 'layer1-main',
  'play': 'layer2-play',
  'garage': 'layer2-garage',
  'settings': 'layer2-settings',
  'manage-room': 'layer2-manage-room',
  'acoustics-equalizer': 'layer3-acoustics-equalizer',
  'audio-eq': 'layer3-acoustics-equalizer',
  'trajectory': 'layer3-ball-trajectory',
  'host-match': 'layer3-host-match',
  'host-training': 'layer3-host-training',
  'custom-play': 'layer3-custom-play',
  'join-room': 'layer3-join-room',
  'exhibition': 'layer3-exhibition',
  'self-training': 'layer3-self-training',
  'kickoff-training': 'layer3-kickoff-training',
  'training-config': 'layer3-training-config',
  'camera': 'layer3-camera',
  'keybindings': 'layer3-keybindings',
  'exp-multi-bots': 'layer3-exp-multi-bots',
  'exp-botpack-9700488': 'layer3-exp-botpack',
  'dev-sandboxes': 'layer3-dev-sandboxes',
  'dev-active-tuners': 'layer3-dev-active-tuners',
  'dev-calibrated-presets': 'layer3-dev-calibrated-presets',
  'dev-self-test': 'layer3-dev-self-test',
  'dev-under-development': 'layer3-dev-under-development',
  'dev-remote-profile': 'layer3-dev-remote-profile',
  'dev-quick-actions': 'layer3-dev-quick-actions',
  'dev-tem-pack-converter': 'layer4-static-training-pack',
  'static-training-pack': 'layer4-static-training-pack',
  'advanced-audio': 'layer4-advanced-audio',
  'controller-settings': 'layer4-controller-settings',
  'event-trigger-rules': 'layer4-event-trigger-rules',
  'dev-signaling-lab': 'layer4-dev-signaling-lab',
};

export interface SandboxJumpEntry extends JumpDirectoryItem {
  route: ActiveMenuRoute;
  tier: MenuVisibilityTier;
}

const STAGE_TARGET_ID = 'rc-ui-tuner-preview-stage';

const makeJumpItem = (
  code: string,
  componentName: string,
  label: string,
  tag: string,
  route: ActiveMenuRoute,
  tier: MenuVisibilityTier
): SandboxJumpEntry => ({
  code,
  componentName,
  label,
  targetId: STAGE_TARGET_ID,
  tag,
  route,
  tier,
});

export const MENU_SANDBOX_JUMP_ITEMS: SandboxJumpEntry[] = [
  // --- User Tier ---
  makeJumpItem('STAGE.L0', 'MenuLayerStageCanvas', 'Level 0 menu-less game state (0px)', 'Layer 0 · User', 'layer-0', 'user'),
  makeJumpItem('STAGE.EDGE', 'StaticTrainingShotInspectorDrawer', 'Static Training Shot Inspector Drawer (Edge Inspector)', 'Layer 0 · Edge Inspector', 'layer-0', 'user'),
  makeJumpItem('STAGE.L1', 'Layer1MainMenuRecipe', 'Main pause root menu (11 User Contexts)', 'Layer 1 · User', 'main-menu', 'user'),
  makeJumpItem('STAGE.PLAY', 'Layer2PlayRecipe', 'Mode Selection 2x3 Grid (Play)', 'Layer 2 · User', 'play', 'user'),
  makeJumpItem('STAGE.GARAGE', 'Layer2GarageRecipe', 'Garage Preset (5 Tabs includes Loadout)', 'Layer 2 · User', 'garage', 'user'),
  makeJumpItem('STAGE.SETTINGS', 'Layer2SettingsRecipe', '5-Tab icon+Text Settings (User 4 Tabs)', 'Layer 2 · User', 'settings', 'user'),
  makeJumpItem('STAGE.ROOM', 'Layer2ManageRoomRecipe', 'Online room control console (6 Contexts)', 'Layer 2 · User', 'manage-room', 'user'),
  makeJumpItem('STAGE.HOST', 'Layer3HostMatchRecipe', 'Create online room page (Host Match)', 'Layer 3 · User', 'host-match', 'user'),
  makeJumpItem('STAGE.HOST-TRN', 'Layer3HostTrainingRecipe', 'Create online training room (Host Training)', 'Layer 3 · User', 'host-training', 'user'),
  makeJumpItem('STAGE.CUSTOM', 'Layer3CustomPlayRecipe', 'Custom mode under development (Custom · In Development)', 'Layer 3 · User', 'custom-play', 'user'),
  makeJumpItem('STAGE.JOIN', 'Layer3JoinRoomRecipe', 'Join online room page (Join Room)', 'Layer 3 · User', 'join-room', 'user'),
  makeJumpItem('STAGE.EXHIBITION', 'Layer3ExhibitionRecipe', 'Exhibition Offline Race Config', 'Layer 3 · User', 'exhibition', 'user'),
  makeJumpItem('STAGE.SELF-TRN', 'Layer3SelfTrainingRecipe', 'Single-player training vertical five-item entry (Self-Training)', 'Layer 3 · User', 'self-training', 'user'),
  makeJumpItem('STAGE.KICKOFF', 'Layer3KickoffTrainingRecipe', 'Kickoff rhythm training config (Kickoff)', 'Layer 3 · User', 'kickoff-training', 'user'),
  makeJumpItem('STAGE.TRAINING', 'Layer3TrainingConfigRecipe', 'Training Assist & Rewinder config (Training)', 'Layer 3 · User', 'training-config', 'user'),
  makeJumpItem('STAGE.CAMERA', 'Layer3CameraRecipe', 'Camera Geometry Settings (Camera)', 'Layer 3 · User', 'camera', 'user'),
  makeJumpItem('STAGE.KEYS', 'Layer3KeybindingsRecipe', 'Key binding and advanced controller entry (Keybindings)', 'Layer 3 · User', 'keybindings', 'user'),
  makeJumpItem('STAGE.TRAJECTORY', 'Layer3BallTrajectoryRecipe', 'Side-docked trajectory prediction (Live Preview)', 'Layer 3 · User', 'trajectory', 'user'),
  makeJumpItem('STAGE.RCSPACK', 'Layer4StaticTrainingPackBrowseRecipe', '.RCSPack Static training pack browser', 'Layer 4 · User', 'static-training-pack', 'user'),
  makeJumpItem('STAGE.CTRL', 'Layer4ControllerSettingsRecipe', 'Advanced controller curves and deadzones (Controller)', 'Layer 4 · User', 'controller-settings', 'user'),

  // --- Developer Tier ---
  makeJumpItem('DEV.MAIN', 'Layer1MainMenuRecipe', 'Root Menu (Dev Test Lab / Multi-Bots Context)', 'Layer 1 · Dev', 'main-menu', 'developer'),
  makeJumpItem('DEV.SETTINGS', 'Layer2SettingsRecipe', 'Settings -> Developer Tab Developer Center', 'Layer 2 · Dev', 'settings', 'developer'),
  makeJumpItem('DEV.SANDBOXES', 'Layer3DevSandboxesRecipe', '6-Tab Subsystem Isolation Lab & Sandboxes', 'Layer 3 · Dev', 'dev-sandboxes', 'developer'),
  makeJumpItem('DEV.MULTIBOTS', 'Layer3ExpMultiBotsRecipe', 'Experimental Multi-Bots (3v3 ONNX)', 'Layer 3 · Dev', 'exp-multi-bots', 'developer'),
  makeJumpItem('DEV.BOTPACK', 'Layer3ExpBotPackRecipe', 'BotPack_9700488 Showcase (6 Bots)', 'Layer 3 · Dev', 'exp-botpack-9700488', 'developer'),
  makeJumpItem('DEV.TUNERS', 'Layer3DevActiveTunersRecipe', 'Active Tuners & Phase Matrix', 'Layer 3 · Dev', 'dev-active-tuners', 'developer'),
  makeJumpItem('DEV.PRESETS', 'Layer3DevCalibratedPresetsRecipe', 'Calibrated Presets & Tuners', 'Layer 3 · Dev', 'dev-calibrated-presets', 'developer'),
  makeJumpItem('DEV.SELFTEST', 'Layer3DevSelfTestRecipe', 'Self Test Suites & Harnesses', 'Layer 3 · Dev', 'dev-self-test', 'developer'),
  makeJumpItem('DEV.STAGING', 'Layer3DevUnderDevelopmentRecipe', 'Under Development (Staging)', 'Layer 3 · Dev', 'dev-under-development', 'developer'),
  makeJumpItem('DEV.PROFILE', 'Layer3DevRemoteProfileRecipe', 'Remote Profile & Account Management', 'Layer 3 · Dev', 'dev-remote-profile', 'developer'),
  makeJumpItem('DEV.QUICK', 'Layer3DevQuickActionsRecipe', 'Quick Actions & Match Toggles', 'Layer 3 · Dev', 'dev-quick-actions', 'developer'),
  makeJumpItem('DEV.EQ', 'Layer3AcousticsEqualizerRecipe', 'Acoustics & EQ Detail', 'Layer 3 · Dev', 'acoustics-equalizer', 'developer'),
  makeJumpItem('DEV.AUDIO', 'Layer4AdvancedAudioRecipe', 'Advanced Audio Synthesis Pool', 'Layer 4 · Dev', 'advanced-audio', 'developer'),
  makeJumpItem('DEV.TRIGGERS', 'Layer4EventTriggerRulesRecipe', 'Event & Trigger Rules Engine', 'Layer 4 · Dev', 'event-trigger-rules', 'developer'),
  makeJumpItem('DEV.SIGNALING', 'Layer4DevSignalingLabRecipe', '4-Server Signaling & Dual Bridge Lab', 'Layer 4 · Dev', 'dev-signaling-lab', 'developer'),
  makeJumpItem('DEV.CONVERTER', 'Layer4StaticTrainingPackBrowseRecipe', 'Dev .tem -> .RCSPack Pack Converter', 'Layer 4 · Dev', 'dev-tem-pack-converter', 'developer'),
];

export interface LayerRouteConfig {
  id: ActiveMenuRoute;
  label: string;
  layer: 0 | 1 | 2 | 3 | 4;
  width: number;
  tier: MenuVisibilityTier | 'both';
  parentRoute?: ActiveMenuRoute;
}

const makeRouteCfg = (
  id: ActiveMenuRoute,
  label: string,
  layer: 0 | 1 | 2 | 3 | 4,
  width: number,
  tier: MenuVisibilityTier | 'both',
  parentRoute?: ActiveMenuRoute
): LayerRouteConfig => ({ id, label, layer, width, tier, parentRoute });

export const MENU_ROUTE_CONFIG: Record<ActiveMenuRoute, LayerRouteConfig> = {
  'layer-0': makeRouteCfg('layer-0', 'Active Match (Layer 0)', 0, 0, 'both'),
  'main-menu': makeRouteCfg('main-menu', 'Main Menu', 1, 420, 'both'),
  'play': makeRouteCfg('play', 'Play Modes', 2, 600, 'user', 'main-menu'),
  'garage': makeRouteCfg('garage', 'Garage Loadout', 2, 640, 'user', 'main-menu'),
  'settings': makeRouteCfg('settings', 'Game Settings', 2, 680, 'both', 'main-menu'),
  'manage-room': makeRouteCfg('manage-room', 'Online Room Control', 2, 720, 'user', 'play'),
  'acoustics-equalizer': makeRouteCfg('acoustics-equalizer', 'Acoustics & EQ', 3, 480, 'developer', 'settings'),
  'audio-eq': makeRouteCfg('audio-eq', 'Acoustics & EQ', 3, 480, 'developer', 'settings'),
  'trajectory': makeRouteCfg('trajectory', 'Ball Trajectory Predictor', 3, 560, 'both', 'settings'),
  'host-match': makeRouteCfg('host-match', 'Host Match Room', 3, 520, 'user', 'play'),
  'host-training': makeRouteCfg('host-training', 'Host Training Room', 3, 500, 'user', 'play'),
  'custom-play': makeRouteCfg('custom-play', 'Custom Mode (In Development)', 3, 500, 'user', 'play'),
  'join-room': makeRouteCfg('join-room', 'Join Online Room', 3, 500, 'user', 'play'),
  'exhibition': makeRouteCfg('exhibition', 'Exhibition Match Setup', 3, 480, 'user', 'play'),
  'self-training': makeRouteCfg('self-training', 'Self-Training Hub', 3, 560, 'user', 'play'),
  'kickoff-training': makeRouteCfg('kickoff-training', 'Kickoff Training Setup', 3, 500, 'user', 'self-training'),
  'training-config': makeRouteCfg('training-config', 'Training Configuration', 3, 600, 'user', 'self-training'),
  'camera': makeRouteCfg('camera', 'Camera Settings', 3, 560, 'user', 'settings'),
  'keybindings': makeRouteCfg('keybindings', 'Key Bindings & Controls', 3, 560, 'user', 'settings'),
  'exp-multi-bots': makeRouteCfg('exp-multi-bots', 'Experimental Multi-Bots (3v3)', 3, 720, 'developer', 'settings'),
  'exp-botpack-9700488': makeRouteCfg('exp-botpack-9700488', 'BotPack_9700488 Showcase (6 Bots)', 3, 580, 'developer', 'dev-sandboxes'),
  'dev-sandboxes': makeRouteCfg('dev-sandboxes', 'Sandboxes', 3, 560, 'developer', 'settings'),
  'dev-active-tuners': makeRouteCfg('dev-active-tuners', 'Active Tuners', 3, 600, 'developer', 'settings'),
  'dev-calibrated-presets': makeRouteCfg('dev-calibrated-presets', 'Calibrated Presets', 3, 560, 'developer', 'settings'),
  'dev-self-test': makeRouteCfg('dev-self-test', 'Self Test', 3, 560, 'developer', 'settings'),
  'dev-under-development': makeRouteCfg('dev-under-development', 'Under Development', 3, 600, 'developer', 'settings'),
  'dev-remote-profile': makeRouteCfg('dev-remote-profile', 'Remote Profile & Account Management', 3, 620, 'developer', 'settings'),
  'dev-quick-actions': makeRouteCfg('dev-quick-actions', 'Quick Actions & Match Toggles', 3, 560, 'developer', 'main-menu'),
  'dev-tem-pack-converter': makeRouteCfg('dev-tem-pack-converter', 'Dev .tem Pack Converter', 4, 680, 'developer', 'dev-sandboxes'),
  'static-training-pack': makeRouteCfg('static-training-pack', 'Static Training Pack (.RCSPack)', 4, 700, 'user', 'self-training'),
  'advanced-audio': makeRouteCfg('advanced-audio', 'Advanced Audio Synthesis Pool', 4, 720, 'developer', 'dev-active-tuners'),
  'controller-settings': makeRouteCfg('controller-settings', 'Controller Settings', 4, 640, 'user', 'keybindings'),
  'event-trigger-rules': makeRouteCfg('event-trigger-rules', 'Event & Trigger Rules Engine', 4, 640, 'developer', 'dev-active-tuners'),
  'dev-signaling-lab': makeRouteCfg('dev-signaling-lab', '4-Server Signaling & Bridge Lab', 4, 760, 'developer', 'dev-self-test'),
};

export const USER_SETTINGS_QUICK_TABS: TabItem[] = [
  { id: 'gameplay', label: 'Gameplay' },
  { id: 'audio', label: 'Audio' },
  { id: 'display', label: 'Display' },
  { id: 'advanced', label: 'Advanced' },
];

export const DEV_SETTINGS_QUICK_TABS: TabItem[] = [
  { id: 'developer', label: 'Developer' },
];

export const SETTINGS_QUICK_TABS: TabItem[] = [
  ...USER_SETTINGS_QUICK_TABS,
  ...DEV_SETTINGS_QUICK_TABS,
];

export const GARAGE_QUICK_TABS: TabItem[] = [
  { id: 'car', label: 'Car' },
  { id: 'paint', label: 'Paint' },
  { id: 'loadout', label: 'Loadout' },
  { id: 'anthem', label: 'Anthem' },
  { id: 'sync', label: 'Sync' },
];

export type Layer3StepProgressStatus = 'idle' | 'running' | 'error' | 'completed';

export interface LinearPlaylistStep {
  id: string;
  tier: MenuVisibilityTier;
  route: ActiveMenuRoute;
  subtab?: string;
  contextMode?: Layer1MenuContextMode;
  progressStatus?: Layer3StepProgressStatus;
  currentStep?: number;
  defaultEditingConfig?: boolean;
  memberSlots?: 1 | 3;
  layer: 0 | 1 | 2 | 3 | 4;
  label: string;
  breadcrumb: string;
}

export const isLayer3RouteAvailable = (
  panelRoute: ActiveMenuRoute,
  currentRoute: ActiveMenuRoute
): boolean => {
  const cfg = MENU_ROUTE_CONFIG[panelRoute];
  if (!cfg || (cfg.layer !== 3 && cfg.layer !== 4)) return false;
  if (panelRoute === 'trajectory') {
    return (
      currentRoute === 'settings' ||
      currentRoute === 'training-config' ||
      currentRoute === 'trajectory'
    );
  }
  return true;
};

export function normalizeMenuRoute(route?: string | null): ActiveMenuRoute | null {
  if (!route) return null;
  if (route === 'audio-eq' || route === 'acoustics-equalizer') {
    return 'acoustics-equalizer';
  }
  return route in MENU_ROUTE_CONFIG ? (route as ActiveMenuRoute) : null;
}

export type LivePreviewAnimPhase =
  | 'expanded'
  | 'collapsing_content'
  | 'collapsing_resize'
  | 'collapsed'
  | 'expanding_content'
  | 'expanding_resize';
