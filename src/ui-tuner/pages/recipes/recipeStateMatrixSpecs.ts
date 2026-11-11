import {
  LAYER1_CONTEXT_VARIATIONS,
  type Layer1MenuContextMode,
} from '../../../ui-core/recipes/layer1MenuContextSpecs';
import type {
  OnlineRoomControlStateOverride,
  OnlineSessionContextId,
} from '../../../ui-core/recipes/Layer2ManageRoomRecipe';
import type { CreationProgressStatus } from '../../../ui-core/recipes/online/OnlineRoomCreationProgress';
import type { HostMatchConfig } from '../../../ui-core/recipes/online/OnlineRoomConfigSummaryCard';
import type { JoinRoomConfig } from '../../../ui-core/recipes/Layer3JoinRoomRecipe';
import type { HostTrainingGhostMode } from '../../../ui-core/recipes/Layer3HostTrainingRecipe';
import type { GarageTabId } from '../../../ui-core/recipes/Layer2GarageRecipe';
import type { SettingsTabId } from '../../../ui-core/recipes/Layer2SettingsRecipe';
import {
  HOST_MATCH_PROGRESS_STEPS,
  HOST_TRAINING_PROGRESS_STEPS,
  JOIN_ROOM_PROGRESS_STEPS,
  ROOM_CONTROL_CONTEXT_STEPS,
  resolveManageRoomRosterOverride,
} from '../menu-layer/menuLayerOnlineRoomSteps';

export interface RecipeStateSnapshotSpec<TProps> {
  id: string;
  label: string;
  description: string;
  componentName?: string;
  sourceFile?: string;
  subViewFile?: string;
  props: TProps;
}

export const LAYER1_MAIN_MENU_STATES: RecipeStateSnapshotSpec<{
  activeTab: Layer1MenuContextMode;
}>[] = LAYER1_CONTEXT_VARIATIONS.map((meta) => ({
  id: meta.id,
  label: meta.label,
  description: meta.description ?? meta.label,
  componentName: 'Layer1MainMenuRecipe',
  sourceFile: 'recipes/Layer1MainMenuRecipe.tsx',
  subViewFile: 'recipes/layer1MenuContextSpecs.ts',
  props: { activeTab: meta.id },
}));

export const LAYER2_GARAGE_STATES: RecipeStateSnapshotSpec<{
  activeTab: GarageTabId;
}>[] = [
  {
    id: 'garage-car',
    label: '1. Car Body Selection',
    description: '8 vehicle chassis presets with Octane / Dominus / Plank / Hybrid hitbox archetype badges.',
    componentName: 'Layer2GarageRecipe',
    sourceFile: 'recipes/Layer2GarageRecipe.tsx',
    subViewFile: 'recipes/garage/GarageCarTab.tsx',
    props: { activeTab: 'car' },
  },
  {
    id: 'garage-paint',
    label: '2. Paint & Team Priority',
    description: 'Primary team preview, Matte/Metallic paint finish, and 6-slot Blue/Orange color preference order.',
    componentName: 'Layer2GarageRecipe',
    sourceFile: 'recipes/Layer2GarageRecipe.tsx',
    subViewFile: 'recipes/garage/GaragePaintTab.tsx',
    props: { activeTab: 'paint' },
  },
  {
    id: 'garage-loadout',
    label: '3. Loadout & Visual FX',
    description: 'Ball visual style, demolition FX, boost trail visual, 4 boost audio variations, and luminance.',
    componentName: 'Layer2GarageRecipe',
    sourceFile: 'recipes/Layer2GarageRecipe.tsx',
    subViewFile: 'recipes/garage/GarageLoadoutTab.tsx',
    props: { activeTab: 'loadout' },
  },
  {
    id: 'garage-anthem',
    label: '4. Player Anthem',
    description: 'Goal celebration anthem selector and under-construction placeholder fallback.',
    componentName: 'Layer2GarageRecipe',
    sourceFile: 'recipes/Layer2GarageRecipe.tsx',
    subViewFile: 'recipes/garage/GarageAnthemTab.tsx',
    props: { activeTab: 'anthem' },
  },
  {
    id: 'garage-sync',
    label: '5. Cloud Profile Sync',
    description: 'Cross-device loadout and profile synchronization status tab.',
    componentName: 'Layer2GarageRecipe',
    sourceFile: 'recipes/Layer2GarageRecipe.tsx',
    props: { activeTab: 'sync' },
  },
];

export const LAYER2_SETTINGS_STATES: RecipeStateSnapshotSpec<{
  activeTab: SettingsTabId;
}>[] = [
  {
    id: 'settings-gameplay',
    label: '1. Gameplay Settings',
    description: 'Camera, Keybindings, Ball Cam Indicator, Trajectory Predictor, Show POV Hitbox, Training Config, and Experience Priority.',
    componentName: 'Layer2SettingsRecipe',
    sourceFile: 'recipes/Layer2SettingsRecipe.tsx',
    subViewFile: 'recipes/settings/tabs/GameplayTab.tsx',
    props: { activeTab: 'gameplay' },
  },
  {
    id: 'settings-audio',
    label: '2. Audio Settings',
    description: 'Master, Engine, and Boost volume sliders, Acoustics & EQ entry, and background mute toggle.',
    componentName: 'Layer2SettingsRecipe',
    sourceFile: 'recipes/Layer2SettingsRecipe.tsx',
    subViewFile: 'recipes/settings/tabs/AudioTab.tsx',
    props: { activeTab: 'audio' },
  },
  {
    id: 'settings-display',
    label: '3. Display & Graphics',
    description: 'Theme toggle, UI Scale, Safe Area Margin, FPS limiter, Render Scale, and Menu Power Save mode.',
    componentName: 'Layer2SettingsRecipe',
    sourceFile: 'recipes/Layer2SettingsRecipe.tsx',
    subViewFile: 'recipes/settings/tabs/DisplayTab.tsx',
    props: { activeTab: 'display' },
  },
  {
    id: 'settings-advanced',
    label: '4. Advanced & Telemetry',
    description: 'Input buffer target/thresholds, HUD telemetry overlay configuration, user floating monitors, and Developer Mode unlock.',
    componentName: 'Layer2SettingsRecipe',
    sourceFile: 'recipes/Layer2SettingsRecipe.tsx',
    subViewFile: 'recipes/settings/tabs/AdvancedTab.tsx',
    props: { activeTab: 'advanced' },
  },
  {
    id: 'settings-developer',
    label: '5. Developer Hub',
    description: 'Subsystem Isolation Lab, Active Tuners, Calibrated Presets, Self Test, Under Development, and Safe Area boundary observer.',
    componentName: 'Layer2SettingsRecipe',
    sourceFile: 'recipes/Layer2SettingsRecipe.tsx',
    subViewFile: 'recipes/settings/tabs/DeveloperTab.tsx',
    props: { activeTab: 'developer' },
  },
];

export const LAYER2_MANAGE_ROOM_STATES: RecipeStateSnapshotSpec<
  OnlineRoomControlStateOverride & {
    sessionContext: OnlineSessionContextId;
    memberSlots: 1 | 3;
  }
>[] = ROOM_CONTROL_CONTEXT_STEPS.map((rc) => ({
  id: rc.id,
  label: rc.label,
  description: rc.description,
  componentName: 'Layer2ManageRoomRecipe',
  sourceFile: 'recipes/Layer2ManageRoomRecipe.tsx',
  subViewFile: rc.ctx.startsWith('match-lobby-')
    ? 'recipes/online/MatchLobbyRoomRecipe.tsx'
    : rc.ctx.startsWith('online-match-')
    ? 'recipes/online/DuringMatchRoomRecipe.tsx'
    : 'recipes/online/OnlineWarmupRoomRecipe.tsx',
  props: {
    ...resolveManageRoomRosterOverride(rc.ctx, rc.memberSlots),
    sessionContext: rc.ctx,
    memberSlots: rc.memberSlots,
  },
}));

export const LAYER3_JOIN_ROOM_STATES: RecipeStateSnapshotSpec<{
  config?: Partial<JoinRoomConfig>;
  progressStatus: CreationProgressStatus;
  currentStep: number;
}>[] = JOIN_ROOM_PROGRESS_STEPS.map((jr) => ({
  id: jr.suffix,
  label: jr.label,
  description: jr.description,
  componentName: 'Layer3JoinRoomRecipe',
  sourceFile: 'recipes/Layer3JoinRoomRecipe.tsx',
  subViewFile:
    jr.status === 'idle'
      ? undefined
      : 'recipes/online/OnlineRoomCreationProgress.tsx',
  props: {
    progressStatus: jr.status,
    currentStep: jr.step,
  },
}));

export const LAYER3_HOST_MATCH_STATES: RecipeStateSnapshotSpec<{
  config?: Partial<HostMatchConfig>;
  defaultEditingConfig?: boolean;
  progressStatus: CreationProgressStatus;
  currentStep: number;
}>[] = HOST_MATCH_PROGRESS_STEPS.map((hm) => ({
  id: hm.suffix,
  label: hm.label,
  description: hm.description,
  componentName: 'Layer3HostMatchRecipe',
  sourceFile: 'recipes/Layer3HostMatchRecipe.tsx',
  subViewFile:
    hm.status === 'idle'
      ? 'recipes/online/OnlineRoomConfigSummaryCard.tsx'
      : 'recipes/online/OnlineRoomCreationProgress.tsx',
  props: {
    defaultEditingConfig: Boolean(hm.editing),
    progressStatus: hm.status,
    currentStep: hm.step,
  },
}));

export const LAYER3_HOST_TRAINING_STATES: RecipeStateSnapshotSpec<{
  defaultGhostMode?: HostTrainingGhostMode;
  progressStatus: CreationProgressStatus;
  currentStep: number;
}>[] = HOST_TRAINING_PROGRESS_STEPS.map((ht) => ({
  id: ht.suffix,
  label: ht.label,
  description: ht.description,
  componentName: 'Layer3HostTrainingRecipe',
  sourceFile: 'recipes/Layer3HostTrainingRecipe.tsx',
  subViewFile:
    ht.status === 'idle'
      ? undefined
      : 'recipes/online/OnlineRoomCreationProgress.tsx',
  props: {
    defaultGhostMode: ht.status === 'completed' ? 'manual' : 'automatically-enable',
    progressStatus: ht.status,
    currentStep: ht.step,
  },
}));
