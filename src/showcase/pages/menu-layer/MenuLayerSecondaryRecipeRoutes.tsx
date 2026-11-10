import React from 'react';
import { normalizeMenuRoute } from './menuLayerRouteConfig';
import { Layer3AcousticsEqualizerRecipe } from '../../../ui-core/recipes/Layer3AcousticsEqualizerRecipe';
import { Layer3BallTrajectoryRecipe } from '../../../ui-core/recipes/Layer3BallTrajectoryRecipe';
import { Layer3CameraRecipe } from '../../../ui-core/recipes/Layer3CameraRecipe';
import { Layer3KeybindingsRecipe } from '../../../ui-core/recipes/Layer3KeybindingsRecipe';
import { Layer3ExpMultiBotsRecipe } from '../../../ui-core/recipes/Layer3ExpMultiBotsRecipe';
import { Layer3ExpBotPackRecipe } from '../../../ui-core/recipes/Layer3ExpBotPackRecipe';
import { Layer3DevSandboxesRecipe } from '../../../ui-core/recipes/Layer3DevSandboxesRecipe';
import { Layer3DevActiveTunersRecipe } from '../../../ui-core/recipes/Layer3DevActiveTunersRecipe';
import { Layer3DevCalibratedPresetsRecipe } from '../../../ui-core/recipes/Layer3DevCalibratedPresetsRecipe';
import { Layer3DevSelfTestRecipe } from '../../../ui-core/recipes/Layer3DevSelfTestRecipe';
import { Layer3DevUnderDevelopmentRecipe } from '../../../ui-core/recipes/Layer3DevUnderDevelopmentRecipe';
import { Layer3DevRemoteProfileRecipe } from '../../../ui-core/recipes/Layer3DevRemoteProfileRecipe';
import { Layer3DevQuickActionsRecipe } from '../../../ui-core/recipes/Layer3DevQuickActionsRecipe';
import { Layer4StaticTrainingPackBrowseRecipe } from '../../../ui-core/recipes/Layer4StaticTrainingPackBrowseRecipe';
import { Layer4AdvancedAudioRecipe } from '../../../ui-core/recipes/Layer4AdvancedAudioRecipe';
import { Layer4ControllerSettingsRecipe } from '../../../ui-core/recipes/Layer4ControllerSettingsRecipe';
import { Layer4EventTriggerRulesRecipe } from '../../../ui-core/recipes/Layer4EventTriggerRulesRecipe';
import { Layer4DevSignalingLabRecipe } from '../../../ui-core/recipes/Layer4DevSignalingLabRecipe';
import { useStaticTrainingPackStore } from '../../../ui-core/stores/staticTrainingPackStore';
import { StoreSnapshotScope } from '../../../ui-core/stores/storeSnapshotScope';
import { useMenuLayerSandbox } from './MenuLayerSandboxContext';

export interface MenuLayerSecondaryRecipeRoutesProps {
  isLight: boolean;
  onBack: () => void;
}

export const MenuLayerSecondaryRecipeRoutes = React.memo<MenuLayerSecondaryRecipeRoutesProps>(
  ({ isLight, onBack }) => {
    const {
      visibilityTier,
      displayedRoute,
      handleSelectRoute,
      setLastParentRoute,
      setLiveAnimPhase,
      handleTriggerCollapse,
      setLayer1ContextMode,
    } = useMenuLayerSandbox();

    const handleLivePreviewBack = () => {
      setLiveAnimPhase('expanded');
      onBack();
    };

    return (
      <>
        {(displayedRoute === 'acoustics-equalizer' || displayedRoute === 'audio-eq') && (
          <StoreSnapshotScope
            overrides={{ appStore: { developerMode: visibilityTier === 'developer' } }}
          >
            <Layer3AcousticsEqualizerRecipe isLight={isLight} onBack={onBack} />
          </StoreSnapshotScope>
        )}

        {displayedRoute === 'dev-quick-actions' && (
          <Layer3DevQuickActionsRecipe isLight={isLight} onBack={onBack} />
        )}

        {displayedRoute === 'camera' && (
          <StoreSnapshotScope
            overrides={{
              appStore: {
                developerMode: visibilityTier === 'developer',
                setLivePreviewCollapsed: handleTriggerCollapse,
              },
            }}
          >
            <Layer3CameraRecipe isLight={isLight} onBack={handleLivePreviewBack} />
          </StoreSnapshotScope>
        )}

        {displayedRoute === 'keybindings' && (
          <StoreSnapshotScope
            overrides={{
              appStore: {
                navigate: (route: string) => {
                  if (route === 'controller-settings') {
                    setLastParentRoute('keybindings');
                    handleSelectRoute('controller-settings');
                  }
                },
              },
            }}
          >
            <Layer3KeybindingsRecipe isLight={isLight} onBack={onBack} />
          </StoreSnapshotScope>
        )}

        {displayedRoute === 'exp-multi-bots' && (
          <Layer3ExpMultiBotsRecipe isLight={isLight} onBack={onBack} />
        )}

        {displayedRoute === 'exp-botpack-9700488' && (
          <Layer3ExpBotPackRecipe isLight={isLight} onBack={onBack} />
        )}

        {displayedRoute === 'dev-sandboxes' && (
          <StoreSnapshotScope
            overrides={{
              appStore: {
                navigate: (route: string) => {
                  const target = normalizeMenuRoute(route);
                  if (target) {
                    setLastParentRoute('dev-sandboxes');
                    handleSelectRoute(target);
                  }
                },
              },
            }}
          >
            <Layer3DevSandboxesRecipe isLight={isLight} onBack={onBack} />
          </StoreSnapshotScope>
        )}

        {displayedRoute === 'dev-active-tuners' && (
          <StoreSnapshotScope
            overrides={{
              appStore: {
                navigate: (route: string) => {
                  const target = normalizeMenuRoute(route);
                  if (target) {
                    setLastParentRoute('dev-active-tuners');
                    handleSelectRoute(target);
                  }
                },
              },
            }}
          >
            <Layer3DevActiveTunersRecipe isLight={isLight} onBack={onBack} />
          </StoreSnapshotScope>
        )}

        {displayedRoute === 'dev-calibrated-presets' && (
          <Layer3DevCalibratedPresetsRecipe isLight={isLight} onBack={onBack} />
        )}

        {displayedRoute === 'dev-self-test' && (
          <StoreSnapshotScope
            overrides={{
              appStore: {
                navigate: (route: string) => {
                  const target = normalizeMenuRoute(route);
                  if (target) {
                    setLastParentRoute('dev-self-test');
                    handleSelectRoute(target);
                  }
                },
              },
            }}
          >
            <Layer3DevSelfTestRecipe isLight={isLight} onBack={onBack} />
          </StoreSnapshotScope>
        )}

        {displayedRoute === 'dev-under-development' && (
          <Layer3DevUnderDevelopmentRecipe isLight={isLight} onBack={onBack} />
        )}

        {displayedRoute === 'dev-remote-profile' && (
          <Layer3DevRemoteProfileRecipe isLight={isLight} onBack={onBack} />
        )}

        {displayedRoute === 'static-training-pack' && (
          <StoreSnapshotScope
            overrides={{
              appStore: {
                closeMenu: () => handleSelectRoute('layer-0'),
                setMatchMode: (mode: string) => {
                  if (mode === 'static-training-pack') {
                    const sessionMode = useStaticTrainingPackStore.getState().sessionMode;
                    setLayer1ContextMode?.(
                      sessionMode === 'edit' ? 'static-training-edit' : 'static-training-play'
                    );
                  }
                },
              },
              staticTrainingPackStore: {
                onEditPack: () => {
                  useStaticTrainingPackStore.getState().setSessionMode('edit');
                  useStaticTrainingPackStore.getState().setEdgeInspectorExpanded(true);
                  setLayer1ContextMode?.('static-training-edit');
                  handleSelectRoute('layer-0');
                },
                onPlayPack: () => {
                  useStaticTrainingPackStore.getState().setSessionMode('play');
                  setLayer1ContextMode?.('static-training-play');
                  handleSelectRoute('layer-0');
                },
              },
            }}
          >
            <Layer4StaticTrainingPackBrowseRecipe isLight={isLight} onBack={onBack} />
          </StoreSnapshotScope>
        )}

        {displayedRoute === 'dev-tem-pack-converter' && (
          <StoreSnapshotScope
            overrides={{
              appStore: {
                closeMenu: () => handleSelectRoute('layer-0'),
                setMatchMode: (mode: string) => {
                  if (mode === 'static-training-pack') {
                    const sessionMode = useStaticTrainingPackStore.getState().sessionMode;
                    setLayer1ContextMode?.(
                      sessionMode === 'edit' ? 'static-training-edit' : 'static-training-play'
                    );
                  }
                },
              },
              staticTrainingPackStore: {
                onEditPack: () => {
                  useStaticTrainingPackStore.getState().setSessionMode('edit');
                  useStaticTrainingPackStore.getState().setEdgeInspectorExpanded(true);
                  setLayer1ContextMode?.('static-training-edit');
                  handleSelectRoute('layer-0');
                },
                onPlayPack: () => {
                  useStaticTrainingPackStore.getState().setSessionMode('play');
                  setLayer1ContextMode?.('static-training-play');
                  handleSelectRoute('layer-0');
                },
              },
            }}
          >
            <Layer4StaticTrainingPackBrowseRecipe
              isLight={isLight}
              isDevMode={true}
              onBack={onBack}
            />
          </StoreSnapshotScope>
        )}

        {displayedRoute === 'advanced-audio' && (
          <Layer4AdvancedAudioRecipe isLight={isLight} onBack={onBack} />
        )}

        {displayedRoute === 'controller-settings' && (
          <Layer4ControllerSettingsRecipe
            isLight={isLight}
            developerMode={visibilityTier === 'developer'}
            onBack={onBack}
          />
        )}

        {displayedRoute === 'event-trigger-rules' && (
          <Layer4EventTriggerRulesRecipe isLight={isLight} onBack={onBack} />
        )}

        {displayedRoute === 'dev-signaling-lab' && (
          <Layer4DevSignalingLabRecipe isLight={isLight} onBack={onBack} />
        )}

        {displayedRoute === 'trajectory' && (
          <StoreSnapshotScope
            overrides={{
              appStore: {
                developerMode: visibilityTier === 'developer',
                setLivePreviewCollapsed: handleTriggerCollapse,
              },
            }}
          >
            <Layer3BallTrajectoryRecipe isLight={isLight} onBack={handleLivePreviewBack} />
          </StoreSnapshotScope>
        )}
      </>
    );
  }
);

MenuLayerSecondaryRecipeRoutes.displayName = 'MenuLayerSecondaryRecipeRoutes';
