import React from 'react';
import { type ActiveMenuRoute } from '../../ui-core/config/uiConfig.ts';
import { type MenuPanelId } from '../../ui-core/tokens/menuLayoutTokens.ts';
import { Layer1MainMenuRecipe } from '../../ui-core/recipes/Layer1MainMenuRecipe.tsx';
import { Layer2PlayRecipe } from '../../ui-core/recipes/Layer2PlayRecipe.tsx';
import { Layer2GarageRecipe } from '../../ui-core/recipes/Layer2GarageRecipe.tsx';
import { Layer2SettingsRecipe } from '../../ui-core/recipes/Layer2SettingsRecipe.tsx';
import { Layer2ManageRoomRecipe } from '../../ui-core/recipes/Layer2ManageRoomRecipe.tsx';
import { Layer3AcousticsEqualizerRecipe } from '../../ui-core/recipes/Layer3AcousticsEqualizerRecipe.tsx';
import { Layer3BallTrajectoryRecipe } from '../../ui-core/recipes/Layer3BallTrajectoryRecipe.tsx';
import { Layer3ExhibitionRecipe } from '../../ui-core/recipes/Layer3ExhibitionRecipe.tsx';
import { Layer3CameraRecipe } from '../../ui-core/recipes/Layer3CameraRecipe.tsx';
import { Layer3KeybindingsRecipe } from '../../ui-core/recipes/Layer3KeybindingsRecipe.tsx';
import { Layer3TrainingConfigRecipe } from '../../ui-core/recipes/Layer3TrainingConfigRecipe.tsx';
import { Layer3HostMatchRecipe } from '../../ui-core/recipes/Layer3HostMatchRecipe.tsx';
import { Layer3JoinRoomRecipe } from '../../ui-core/recipes/Layer3JoinRoomRecipe.tsx';
import { Layer3HostTrainingRecipe } from '../../ui-core/recipes/Layer3HostTrainingRecipe.tsx';
import { Layer3CustomPlayRecipe } from '../../ui-core/recipes/Layer3CustomPlayRecipe.tsx';
import { Layer3KickoffTrainingRecipe } from '../../ui-core/recipes/Layer3KickoffTrainingRecipe.tsx';
import { Layer3SelfTrainingRecipe } from '../../ui-core/recipes/Layer3SelfTrainingRecipe.tsx';
import { Layer3ExpMultiBotsRecipe } from '../../ui-core/recipes/Layer3ExpMultiBotsRecipe.tsx';
import { Layer3ExpBotPackRecipe } from '../../ui-core/recipes/Layer3ExpBotPackRecipe.tsx';
import { Layer3DevSandboxesRecipe } from '../../ui-core/recipes/Layer3DevSandboxesRecipe.tsx';
import { Layer3DevActiveTunersRecipe } from '../../ui-core/recipes/Layer3DevActiveTunersRecipe.tsx';
import { Layer3DevCalibratedPresetsRecipe } from '../../ui-core/recipes/Layer3DevCalibratedPresetsRecipe.tsx';
import { Layer3DevQuickActionsRecipe } from '../../ui-core/recipes/Layer3DevQuickActionsRecipe.tsx';
import { Layer3DevSelfTestRecipe } from '../../ui-core/recipes/Layer3DevSelfTestRecipe.tsx';
import { Layer3DevUnderDevelopmentRecipe } from '../../ui-core/recipes/Layer3DevUnderDevelopmentRecipe.tsx';
import { Layer3DevRemoteProfileRecipe } from '../../ui-core/recipes/Layer3DevRemoteProfileRecipe.tsx';
import { Layer4ControllerSettingsRecipe } from '../../ui-core/recipes/Layer4ControllerSettingsRecipe.tsx';
import { Layer4AdvancedAudioRecipe } from '../../ui-core/recipes/Layer4AdvancedAudioRecipe.tsx';
import { Layer4EventTriggerRulesRecipe } from '../../ui-core/recipes/Layer4EventTriggerRulesRecipe.tsx';
import { Layer4StaticTrainingPackBrowseRecipe } from '../../ui-core/recipes/Layer4StaticTrainingPackBrowseRecipe.tsx';
import { Layer4DevSignalingLabRecipe } from '../../ui-core/recipes/Layer4DevSignalingLabRecipe.tsx';
import {
  dispatchMainMenuTabAction,
  dispatchPlayMenuTabAction,
  leaveOnlineRoomAndCloseMenu,
  type MenuRouteRenderContext,
} from './menuRouteNavigationPipeline.ts';

export type { MenuRouteRenderContext };

export const ROUTE_TO_PANEL_ID: Record<ActiveMenuRoute, MenuPanelId> = {
  'main-menu': 'layer1-main',
  play: 'layer2-play',
  exhibition: 'layer3-exhibition',
  'self-training': 'layer3-self-training',
  'kickoff-training': 'layer3-kickoff-training',
  'static-training-pack': 'layer4-static-training-pack',
  'host-match': 'layer3-host-match',
  'join-room': 'layer3-join-room',
  'host-training': 'layer3-host-training',
  'custom-play': 'layer3-custom-play',
  'manage-room': 'layer2-manage-room',
  garage: 'layer2-garage',
  settings: 'layer2-settings',
  'acoustics-equalizer': 'layer3-acoustics-equalizer',
  trajectory: 'layer3-ball-trajectory',
  camera: 'layer3-camera',
  'training-config': 'layer3-training-config',
  keybindings: 'layer3-keybindings',
  'controller-settings': 'layer4-controller-settings',
  'advanced-audio': 'layer4-advanced-audio',
  'event-trigger-rules': 'layer4-event-trigger-rules',
  'exp-multi-bots': 'layer3-exp-multi-bots',
  'exp-botpack-9700488': 'layer3-exp-botpack',
  'dev-sandboxes': 'layer3-dev-sandboxes',
  'dev-active-tuners': 'layer3-dev-active-tuners',
  'dev-calibrated-presets': 'layer3-dev-calibrated-presets',
  'dev-quick-actions': 'layer3-dev-quick-actions',
  'dev-self-test': 'layer3-dev-self-test',
  'dev-under-development': 'layer3-dev-under-development',
  'dev-remote-profile': 'layer3-dev-remote-profile',
  'dev-signaling-lab': 'layer4-dev-signaling-lab',
  'dev-tem-pack-converter': 'layer4-static-training-pack',
};

function createBackRouteRenderer(
  RecipeComponent: React.ComponentType<{ isLight: boolean; onBack: () => void }>
): (ctx: MenuRouteRenderContext) => React.ReactNode {
  return ({ isLight, goBack }) => <RecipeComponent isLight={isLight} onBack={goBack} />;
}

function createLivePreviewRouteRenderer(
  RecipeComponent: React.ComponentType<{ isLight: boolean; onBack: () => void }>
): (ctx: MenuRouteRenderContext) => React.ReactNode {
  return ({ isLight, resetLivePreviewToExpanded, goBack }) => (
    <RecipeComponent
      isLight={isLight}
      onBack={() => {
        resetLivePreviewToExpanded();
        goBack();
      }}
    />
  );
}

function createExpConfigRouteRenderer(
  RecipeComponent: React.ComponentType<{ isLight: boolean; onBack: () => void }>
): (ctx: MenuRouteRenderContext) => React.ReactNode {
  return ({ isLight, navigate, expConfigParentRef }) => (
    <RecipeComponent
      isLight={isLight}
      onBack={() => navigate(expConfigParentRef.current || 'dev-sandboxes')}
    />
  );
}

export const MENU_ROUTE_RENDERERS: Record<
  ActiveMenuRoute,
  (ctx: MenuRouteRenderContext) => React.ReactNode
> = {
  'main-menu': (ctx) => (
    <Layer1MainMenuRecipe
      isLight={ctx.isLight}
      onBack={ctx.closeMenu}
      onTabChange={(target) => dispatchMainMenuTabAction(target, ctx)}
    />
  ),
  play: (ctx) => (
    <Layer2PlayRecipe
      isLight={ctx.isLight}
      onBack={ctx.goBack}
      onTabChange={(modeId) => dispatchPlayMenuTabAction(modeId, ctx)}
    />
  ),
  'self-training': createBackRouteRenderer(Layer3SelfTrainingRecipe),
  'static-training-pack': ({ isLight, goBack }) => (
    <Layer4StaticTrainingPackBrowseRecipe isLight={isLight} isDevMode={false} onBack={goBack} />
  ),
  'kickoff-training': createBackRouteRenderer(Layer3KickoffTrainingRecipe),
  'host-match': ({ isLight, goBack }) => (
    <Layer3HostMatchRecipe isLight={isLight} roomType="match" onBack={goBack} />
  ),
  'join-room': createBackRouteRenderer(Layer3JoinRoomRecipe),
  'host-training': createBackRouteRenderer(Layer3HostTrainingRecipe),
  'custom-play': createBackRouteRenderer(Layer3CustomPlayRecipe),
  'manage-room': (ctx) => (
    <Layer2ManageRoomRecipe
      isLight={ctx.isLight}
      onBack={ctx.goBack}
      onCloseRoom={() => leaveOnlineRoomAndCloseMenu(ctx)}
    />
  ),
  exhibition: ({ isLight, navigate, exhibitionParentRef }) => (
    <Layer3ExhibitionRecipe
      isLight={isLight}
      onBack={() => navigate(exhibitionParentRef.current)}
    />
  ),
  garage: createBackRouteRenderer(Layer2GarageRecipe),
  settings: ({ isLight, settingsTargetTab, setSettingsTargetTab, goBack }) => (
    <Layer2SettingsRecipe
      isLight={isLight}
      activeTab={settingsTargetTab}
      onTabChange={setSettingsTargetTab}
      onBack={goBack}
    />
  ),
  'dev-sandboxes': createBackRouteRenderer(Layer3DevSandboxesRecipe),
  'dev-tem-pack-converter': ({ isLight, goBack }) => (
    <Layer4StaticTrainingPackBrowseRecipe isLight={isLight} isDevMode={true} onBack={goBack} />
  ),
  'dev-active-tuners': createBackRouteRenderer(Layer3DevActiveTunersRecipe),
  'dev-calibrated-presets': createBackRouteRenderer(Layer3DevCalibratedPresetsRecipe),
  'dev-quick-actions': createBackRouteRenderer(Layer3DevQuickActionsRecipe),
  'dev-self-test': createBackRouteRenderer(Layer3DevSelfTestRecipe),
  'dev-under-development': createBackRouteRenderer(Layer3DevUnderDevelopmentRecipe),
  'dev-remote-profile': createBackRouteRenderer(Layer3DevRemoteProfileRecipe),
  'dev-signaling-lab': createBackRouteRenderer(Layer4DevSignalingLabRecipe),
  'exp-multi-bots': createExpConfigRouteRenderer(Layer3ExpMultiBotsRecipe),
  'exp-botpack-9700488': createExpConfigRouteRenderer(Layer3ExpBotPackRecipe),
  'training-config': createBackRouteRenderer(Layer3TrainingConfigRecipe),
  trajectory: createLivePreviewRouteRenderer(Layer3BallTrajectoryRecipe),
  camera: createLivePreviewRouteRenderer(Layer3CameraRecipe),
  'acoustics-equalizer': createBackRouteRenderer(Layer3AcousticsEqualizerRecipe),
  keybindings: createBackRouteRenderer(Layer3KeybindingsRecipe),
  'controller-settings': createBackRouteRenderer(Layer4ControllerSettingsRecipe),
  'advanced-audio': createBackRouteRenderer(Layer4AdvancedAudioRecipe),
  'event-trigger-rules': createBackRouteRenderer(Layer4EventTriggerRulesRecipe),
};

export function renderActiveMenuRoute(ctx: MenuRouteRenderContext): React.ReactNode {
  const renderer = MENU_ROUTE_RENDERERS[ctx.activeRoute];
  return renderer ? renderer(ctx) : null;
}
