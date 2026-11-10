import React, { Suspense, lazy } from 'react';
import { readUrlParams, type UrlParamMap } from '../../stores/urlSync';
import { RECIPES_JUMP_ITEMS } from './LocalPanelSizingTuner';
import { DEEP_LAYER_RECIPE_SPECS, SingleDeepLayerRecipeCard } from './DeepLayerRecipesSection';
import { Layer1MainMenuSyncedStage } from './Layer1MainMenuSyncedStage';
import { renderLayer2RecipeStage } from './layer2RecipeRegistrySpecs';
import { renderLayer3CoreRecipeStage } from './layer3RecipeRegistrySpecs';
import type { JumpDirectoryItem } from '../../PageJumpDirectory';

const MainMenuStyleTuner = lazy(() =>
  import('./MainMenuStyleTuner').then((m) => ({
    default: m.MainMenuStyleTuner,
  }))
);
const PanelShellTuner = lazy(() =>
  import('../panels/PanelShellTuner').then((m) => ({
    default: m.PanelShellTuner,
  }))
);
const SettingActionRowTuner = lazy(() =>
  import('../tabs/SettingActionRowTuner').then((m) => ({
    default: m.SettingActionRowTuner,
  }))
);
const UnderlineTabsTuner = lazy(() =>
  import('../tabs/UnderlineTabsTuner').then((m) => ({
    default: m.UnderlineTabsTuner,
  }))
);
const CameraSettingsStyleTuner = lazy(() =>
  import('./CameraSettingsStyleTuner').then((m) => ({
    default: m.CameraSettingsStyleTuner,
  }))
);
export const SETTING_ROW_SUB_ANCHOR_TO_ITEM_ID: Record<string, string> = {
  'setting-preset-custom-tuner': 'setting-action-row-tuner',
  '6A.4S-E': 'setting-action-row-tuner',
  'setting-dev-status-tuner': 'setting-action-row-tuner',
  '6A.4S-F': 'setting-action-row-tuner',
  'setting-telemetry-summary-tuner': 'setting-telemetry-summary-tuner',
  '6A.4S-H': 'setting-telemetry-summary-tuner',
};

const ROUTE_PARAM_TO_RECIPE_ID: Record<string, string> = {
  'main-menu': 'recipe-6a-1-main',
  play: 'recipe-6a-2-play',
  garage: 'recipe-6a-3-garage',
  settings: 'recipe-6a-4-settings',
  'manage-room': 'recipe-6a-8-host-ctrl',
  'acoustics-equalizer': 'recipe-6a-7-audio',
  'audio-eq': 'recipe-6a-7-audio',
  trajectory: 'recipe-6a-12c-trajectory',
  'host-match': 'recipe-6a-6a-host',
  'host-training': 'recipe-6a-19-host-train',
  'custom-play': 'recipe-6a-26-custom-play',
  'join-room': 'recipe-6a-6b-join',
  exhibition: 'recipe-6a-9-bot-diff',
  'self-training': 'recipe-6a-10-self-train',
  'kickoff-training': 'recipe-6a-11-kickoff',
  'training-config': 'recipe-6a-18-training',
  camera: 'recipe-6a-12-camera',
  keybindings: 'recipe-6a-12b-keybindings',
  'exp-multi-bots': 'recipe-6a-13-multibots',
  'exp-botpack-9700488': 'recipe-6a-13b-botpack',
  'dev-sandboxes': 'recipe-6a-20-dev-isolation',
  'dev-active-tuners': 'recipe-6a-21-dev-tuners',
  'dev-calibrated-presets': 'recipe-6a-22-dev-presets',
  'dev-self-test': 'recipe-6a-24-dev-self-test',
  'dev-under-development': 'recipe-6a-23-dev-under-dev',
  'dev-remote-profile': 'recipe-6a-27-dev-remote-profile',
  'dev-quick-actions': 'recipe-6a-28-dev-quick-actions',
  'dev-tem-pack-converter': 'recipe-6a-14-rcspack',
  'static-training-pack': 'recipe-6a-14-rcspack',
  'shot-inspector': 'recipe-6a-14b-shot-inspector',
  'advanced-audio': 'recipe-6a-15-adv-audio',
  'controller-settings': 'recipe-6a-16-adv-ctrl',
  'event-trigger-rules': 'recipe-6a-17-triggers',
  'dev-signaling-lab': 'recipe-6a-25-dev-signaling-lab',
};

export interface ResolvedRecipeTarget {
  itemId: string;
  subAnchorId?: string;
}

export function matchRecipeToken(rawToken?: string | null): ResolvedRecipeTarget | null {
  if (!rawToken) return null;
  const clean = rawToken.startsWith('#') ? rawToken.slice(1).trim() : rawToken.trim();
  if (!clean) return null;
  const upper = clean.toUpperCase();
  const direct = RECIPES_JUMP_ITEMS.find(
    (it) => (it.id || it.targetId) === clean || it.code.toUpperCase() === upper
  );
  if (direct) {
    const id = direct.id || direct.targetId || 'recipe-6a-1-main';
    return {
      itemId: id,
      subAnchorId:
        id === 'setting-telemetry-summary-tuner' ? 'setting-telemetry-summary-tuner' : undefined,
    };
  }
  const mappedSub =
    SETTING_ROW_SUB_ANCHOR_TO_ITEM_ID[clean] || SETTING_ROW_SUB_ANCHOR_TO_ITEM_ID[upper];
  if (mappedSub) {
    const subDomId =
      upper === '6A.4S-E'
        ? 'setting-preset-custom-tuner'
        : upper === '6A.4S-F'
        ? 'setting-dev-status-tuner'
        : upper === '6A.4S-H'
        ? 'setting-telemetry-summary-tuner'
        : clean;
    return {
      itemId: mappedSub,
      subAnchorId: subDomId,
    };
  }
  return null;
}

export function resolveActiveRecipeFromUrl(
  params: UrlParamMap = readUrlParams(),
  hash: string = typeof window !== 'undefined' ? window.location.hash : ''
): ResolvedRecipeTarget {
  const fromHash = matchRecipeToken(hash);
  if (fromHash) return fromHash;
  const fromRecipeParam = matchRecipeToken(params.recipe);
  if (fromRecipeParam) return fromRecipeParam;
  if (params.route && ROUTE_PARAM_TO_RECIPE_ID[params.route]) {
    return { itemId: ROUTE_PARAM_TO_RECIPE_ID[params.route] };
  }
  return { itemId: 'recipe-6a-1-main' };
}

export function getRelatedRecipeItems(activeItemId: string): JumpDirectoryItem[] {
  const pick = (ids: string[]) =>
    ids
      .filter((id) => id !== activeItemId)
      .map((id) => RECIPES_JUMP_ITEMS.find((it) => (it.id || it.targetId) === id))
      .filter((it): it is JumpDirectoryItem => Boolean(it));
  if (activeItemId === 'recipe-6a-1-main' || activeItemId === 'main-menu-style-tuner') {
    return pick(['recipe-6a-1-main', 'main-menu-style-tuner', 'panel-shell-tuner']);
  }
  if (activeItemId === 'recipe-6a-12-camera' || activeItemId === 'camera-settings-style-tuner') {
    return pick(['recipe-6a-12-camera', 'camera-settings-style-tuner', 'panel-shell-tuner']);
  }
  if (
    activeItemId === 'recipe-6a-4-settings' ||
    activeItemId === 'underline-tabs-tuner' ||
    activeItemId === 'setting-action-row-tuner' ||
    activeItemId === 'setting-telemetry-summary-tuner' ||
    activeItemId === 'recipe-6a-5-settings-preview'
  ) {
    return pick([
      'recipe-6a-4-settings',
      'underline-tabs-tuner',
      'setting-action-row-tuner',
      'setting-telemetry-summary-tuner',
      'recipe-6a-5-settings-preview',
      'panel-shell-tuner',
    ]);
  }
  if (
    activeItemId === 'recipe-6a-6a-host' ||
    activeItemId === 'recipe-6a-6b-join' ||
    activeItemId === 'recipe-6a-8-host-ctrl'
  ) {
    return pick([
      'recipe-6a-6a-host',
      'recipe-6a-6b-join',
      'recipe-6a-8-host-ctrl',
      'panel-shell-tuner',
    ]);
  }
  if (
    activeItemId.startsWith('recipe-6a-20') ||
    activeItemId.startsWith('recipe-6a-21') ||
    activeItemId.startsWith('recipe-6a-22') ||
    activeItemId.startsWith('recipe-6a-23')
  ) {
    return pick([
      'recipe-6a-20-dev-isolation',
      'recipe-6a-21-dev-tuners',
      'recipe-6a-22-dev-presets',
      'recipe-6a-23-dev-under-dev',
      'panel-shell-tuner',
    ]);
  }
  return pick(['panel-shell-tuner', 'setting-action-row-tuner']);
}

export interface SingleRecipeRenderContext {
  isLight: boolean;
  simulateLayer3Error: boolean;
  onToggleLayer3Error: (enabled: boolean) => void;
  onSelectRecipeId: (itemId: string) => void;
}

export const OnDemandRecipeStage: React.FC<
  SingleRecipeRenderContext & { itemId: string }
> = React.memo(({ itemId, isLight, onSelectRecipeId }) => {
  const previewWrapClass = `flex justify-center p-6 rounded-2xl border transition-colors ${
    isLight
      ? 'bg-neutral-50/70 border-neutral-200/80 shadow-2xs'
      : 'border-neutral-800 bg-neutral-950/60'
  }`;
  const suspenseFallback = (
    <div className="py-12 text-xs font-mono text-neutral-400 text-center">
      Loading on Demand 6A Module...
    </div>
  );
  const deepSpec = DEEP_LAYER_RECIPE_SPECS.find((s) => s.id === itemId);
  if (deepSpec) {
    return <SingleDeepLayerRecipeCard spec={deepSpec} isLight={isLight} />;
  }
  const l2Node = renderLayer2RecipeStage(itemId, isLight, previewWrapClass, suspenseFallback);
  if (l2Node) return <>{l2Node}</>;
  const l3Node = renderLayer3CoreRecipeStage(itemId, isLight, previewWrapClass, suspenseFallback);
  if (l3Node) return <>{l3Node}</>;

  switch (itemId) {
    case 'recipe-6a-1-main':
      return (
        <Layer1MainMenuSyncedStage
          isLight={isLight}
          previewWrapClass={previewWrapClass}
          suspenseFallback={suspenseFallback}
          onSelectRecipeId={onSelectRecipeId}
        />
      );
    case 'main-menu-style-tuner':
      return (
        <Suspense fallback={suspenseFallback}>
          <MainMenuStyleTuner isLight={isLight} codeBadge="6A.1M" />
        </Suspense>
      );
    case 'camera-settings-style-tuner':
      return (
        <Suspense fallback={suspenseFallback}>
          <CameraSettingsStyleTuner isLight={isLight} codeBadge="6A.12M" />
        </Suspense>
      );
    case 'panel-shell-tuner':
      return (
        <Suspense fallback={suspenseFallback}>
          <PanelShellTuner
            isLight={isLight}
            codeBadge="6A.2S"
            title="Layer 2+ Universal three-segment panel shell tuner (Header font size/Back Button/padding · Content padding · Footer padding)"
          />
        </Suspense>
      );
    case 'underline-tabs-tuner':
      return (
        <Suspense fallback={suspenseFallback}>
          <UnderlineTabsTuner
            isLight={isLight}
            codeBadge="6A.4T"
            showStandalonePreview={true}
            title="Layer 2 Settings · UnderlineTabs Top bar tab tuner (font size · Icon Size · spacing · Font Weight)"
          />
        </Suspense>
      );
    case 'setting-action-row-tuner':
    case 'setting-telemetry-summary-tuner':
      return (
        <Suspense fallback={suspenseFallback}>
          <SettingActionRowTuner
            isLight={isLight}
            codeBadge={itemId === 'setting-telemetry-summary-tuner' ? '6A.4S-H' : '6A.4S'}
            showStandalonePreview={true}
            title="Layer 2 Settings · SettingActionRow Internal navigation row tuner (border · Description Visibility · Padding · SVG Icon color · Telemetry Collapse)"
          />
        </Suspense>
      );
    default:
      return null;
  }
});
OnDemandRecipeStage.displayName = 'OnDemandRecipeStage';
