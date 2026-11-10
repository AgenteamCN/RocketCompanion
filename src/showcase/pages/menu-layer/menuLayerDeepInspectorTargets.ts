import type { ShowcaseTab } from '../../sidebarNavConfig';
import type { ActiveMenuRoute } from './menuLayerRouteConfig';

export interface InspectorJumpTarget {
  code: string;
  componentName: string;
  label: string;
  tab: ShowcaseTab;
  targetId?: string;
}

const make6ARecipeTarget = (
  code: string,
  componentName: string,
  label: string,
  targetId: string
): InspectorJumpTarget => ({
  code,
  componentName,
  label,
  tab: 'recipes',
  targetId,
});

export const DEEP_ROUTE_TO_6A_RECIPE_TARGET: Partial<Record<ActiveMenuRoute, InspectorJumpTarget>> = {
  'acoustics-equalizer': make6ARecipeTarget(
    '6A.7',
    'Layer3AcousticsEqualizerRecipe',
    '6A.7 Audio equalizer panel tuning',
    'recipe-6a-7-audio'
  ),
  'audio-eq': make6ARecipeTarget(
    '6A.7',
    'Layer3AcousticsEqualizerRecipe',
    '6A.7 Audio equalizer panel tuning',
    'recipe-6a-7-audio'
  ),
  trajectory: make6ARecipeTarget(
    '6A.12C',
    'Layer3BallTrajectoryRecipe',
    '6A.12C Trajectory prediction panel tuning',
    'recipe-6a-12c-trajectory'
  ),
  'host-match': make6ARecipeTarget(
    '6A.6A',
    'Layer3HostMatchRecipe',
    '6A.6A Host Match Room Creation Page Tuning',
    'recipe-6a-6a-host'
  ),
  'host-training': make6ARecipeTarget(
    '6A.19',
    'Layer3HostTrainingRecipe',
    '6A.19 Host Training Online training lobby tuning',
    'recipe-6a-19-host-train'
  ),
  'custom-play': make6ARecipeTarget(
    '6A.26',
    'Layer3CustomPlayRecipe',
    '6A.26 Custom Play Mode Hub Tuning',
    'recipe-6a-26-custom-play'
  ),
  'join-room': make6ARecipeTarget(
    '6A.6B',
    'Layer3JoinRoomRecipe',
    '6A.6B Join Room Room Entry Page Tuning',
    'recipe-6a-6b-join'
  ),
  exhibition: make6ARecipeTarget(
    '6A.9',
    'Layer3ExhibitionRecipe',
    '6A.9 Exhibition Offline race panel tuning',
    'recipe-6a-9-bot-diff'
  ),
  'self-training': make6ARecipeTarget(
    '6A.10',
    'Layer3SelfTrainingRecipe',
    '6A.10 Self-Training Four-Grid Tuning',
    'recipe-6a-10-self-train'
  ),
  'kickoff-training': make6ARecipeTarget(
    '6A.11',
    'Layer3KickoffTrainingRecipe',
    '6A.11 Kickoff Kickoff training panel tuning',
    'recipe-6a-11-kickoff'
  ),
  'training-config': make6ARecipeTarget(
    '6A.18',
    'Layer3TrainingConfigRecipe',
    '6A.18 Training Training configuration panel tuning',
    'recipe-6a-18-training'
  ),
  camera: make6ARecipeTarget(
    '6A.12',
    'Layer3CameraRecipe',
    '6A.12 Camera Camera settings panel tuning',
    'recipe-6a-12-camera'
  ),
  keybindings: make6ARecipeTarget(
    '6A.12B',
    'Layer3KeybindingsRecipe',
    '6A.12B Key Bindings Key Mapping Tuning',
    'recipe-6a-12b-keybindings'
  ),
  'exp-multi-bots': make6ARecipeTarget(
    '6A.13',
    'Layer3ExpMultiBotsRecipe',
    '6A.13 3v3 multi Bot Orchestration Panel Tuning',
    'recipe-6a-13-multibots'
  ),
  'dev-sandboxes': make6ARecipeTarget(
    '6A.20',
    'Layer3DevSandboxesRecipe',
    '6A.20 Sandboxes and isolation chamber panel tuning',
    'recipe-6a-20-dev-isolation'
  ),
  'dev-active-tuners': make6ARecipeTarget(
    '6A.21',
    'Layer3DevActiveTunersRecipe',
    '6A.21 Active tuner panel tuning',
    'recipe-6a-21-dev-tuners'
  ),
  'dev-calibrated-presets': make6ARecipeTarget(
    '6A.22',
    'Layer3DevCalibratedPresetsRecipe',
    '6A.22 Tuner library calibrated',
    'recipe-6a-22-dev-presets'
  ),
  'dev-self-test': make6ARecipeTarget(
    '6A.24',
    'Layer3DevSelfTestRecipe',
    '6A.24 Developer self-test suites',
    'recipe-6a-24-dev-self-test'
  ),
  'dev-under-development': make6ARecipeTarget(
    '6A.23',
    'Layer3DevUnderDevelopmentRecipe',
    '6A.23 Dev feature panel tuning',
    'recipe-6a-23-dev-under-dev'
  ),
  'static-training-pack': make6ARecipeTarget(
    '6A.14',
    'Layer4StaticTrainingPackBrowseRecipe',
    '6A.14 .RCSPack Browser panel tuning',
    'recipe-6a-14-rcspack'
  ),
  'advanced-audio': make6ARecipeTarget(
    '6A.15',
    'Layer4AdvancedAudioRecipe',
    '6A.15 Advanced audio synthesis pool panel tuning',
    'recipe-6a-15-adv-audio'
  ),
  'controller-settings': make6ARecipeTarget(
    '6A.16',
    'Layer4ControllerSettingsRecipe',
    '6A.16 Advanced controller curve panel tuning',
    'recipe-6a-16-adv-ctrl'
  ),
  'event-trigger-rules': make6ARecipeTarget(
    '6A.17',
    'Layer4EventTriggerRulesRecipe',
    '6A.17 Trigger rule engine panel tuning',
    'recipe-6a-17-triggers'
  ),
  'dev-signaling-lab': make6ARecipeTarget(
    '6A.25',
    'Layer4DevSignalingLabRecipe',
    '6A.25 4-Server Signaling & Dual Bridge Lab',
    'recipe-6a-25-dev-signaling-lab'
  ),
  'exp-botpack-9700488': make6ARecipeTarget(
    '6A.13B',
    'Layer3ExpBotPackRecipe',
    '6A.13B BotPack_9700488 Showcase (6 Bots)',
    'recipe-6a-13b-botpack'
  ),
  'dev-remote-profile': make6ARecipeTarget(
    '6A.27',
    'Layer3DevRemoteProfileRecipe',
    '6A.27 Remote Profile & Account Management',
    'recipe-6a-27-dev-remote-profile'
  ),
  'dev-quick-actions': make6ARecipeTarget(
    '6A.28',
    'Layer3DevQuickActionsRecipe',
    '6A.28 Quick Actions & Match Toggles',
    'recipe-6a-28-dev-quick-actions'
  ),
  'dev-tem-pack-converter': make6ARecipeTarget(
    '6A.14D',
    'Layer4StaticTrainingPackBrowseRecipe',
    '6A.14D Dev .tem -> .RCSPack Pack Converter',
    'recipe-6a-14-rcspack'
  ),
};
