import React from 'react';
import { ROUTE_TO_PANEL_ID } from './menuLayerRouteConfig';
import { resolveNodePathInspectorLinks } from './menuLayerInspectorLinks';
import { LocalPanelSizingTuner } from '../recipes/LocalPanelSizingTuner';
import { MainMenuStyleTuner } from '../recipes/MainMenuStyleTuner';
import { SettingActionRowTuner } from '../tabs/SettingActionRowTuner';
import { UnderlineTabsTuner } from '../tabs/UnderlineTabsTuner';
import { CameraSettingsStyleTuner } from '../recipes/CameraSettingsStyleTuner';
import { useMenuLayerSandbox } from './MenuLayerSandboxContext';

export interface MenuLayerInlineNodeTunerDrawerProps {
  isLight: boolean;
}

export const MenuLayerInlineNodeTunerDrawer: React.FC<MenuLayerInlineNodeTunerDrawerProps> = ({
  isLight,
}) => {
  const {
    currentRoute,
    settingsTab,
    garageTab,
    layer1ContextMode,
    setLayer1ContextMode,
    showInlineTuner,
    setShowInlineTuner,
    onNavigateShowcase,
  } = useMenuLayerSandbox();

  if (!showInlineTuner) return null;

  const inspectorInfo = resolveNodePathInspectorLinks(currentRoute, settingsTab, garageTab);
  const activePanelId = currentRoute !== 'layer-0' ? ROUTE_TO_PANEL_ID[currentRoute] : undefined;

  return (
    <div
      className={`rounded-2xl border p-4 space-y-4 transition-colors ${
        isLight
          ? 'bg-amber-50/40 border-amber-200/80 shadow-2xs'
          : 'bg-neutral-900/80 border-amber-500/30 shadow-inner'
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs font-mono">
          <span className="font-bold text-amber-600 dark:text-amber-400">
            Inline Quick Node Tuning:
          </span>
          <span
            className={
              isLight ? 'text-neutral-700 font-semibold' : 'text-neutral-200 font-semibold'
            }
          >
            {inspectorInfo.pageRecipeTarget.componentName} ({inspectorInfo.pageRecipeTarget.label.replace(/^[0-9A-Z.-]+\s+/, '')})
          </span>
        </div>
        <div className="flex items-center gap-2">
          {onNavigateShowcase && (
            <button
              type="button"
              onClick={() =>
                onNavigateShowcase(
                  inspectorInfo.pageRecipeTarget.tab,
                  inspectorInfo.pageRecipeTarget.targetId
                )
              }
              className={`px-2.5 py-1 rounded-lg text-[11px] font-mono border cursor-pointer transition-colors ${
                isLight
                  ? 'bg-white border-neutral-200 text-neutral-700 hover:border-amber-400'
                  : 'bg-neutral-950 border-neutral-800 text-neutral-300 hover:border-amber-500/50'
              }`}
            >
              Open in Surface Workbench ({inspectorInfo.pageRecipeTarget.componentName}) -&gt;
            </button>
          )}
          <button
            type="button"
            onClick={() => setShowInlineTuner(false)}
            className="px-2 py-1 rounded-lg text-[11px] font-mono text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 cursor-pointer"
          >
            collapse ^
          </button>
        </div>
      </div>

      {activePanelId && (
        <LocalPanelSizingTuner
          panelId={activePanelId}
          label={`${inspectorInfo.pageRecipeTarget.componentName} Container size contract`}
          recommendation="Real-time link between Unified Approval Stage and Surface Workbench"
          isLight={isLight}
        />
      )}

      {currentRoute === 'main-menu' && (
        <MainMenuStyleTuner
          isLight={isLight}
          compact
          contextMode={layer1ContextMode}
          onChangeContextMode={setLayer1ContextMode}
        />
      )}

      {(currentRoute === 'settings' || currentRoute === 'garage') && (
        <UnderlineTabsTuner isLight={isLight} showStandalonePreview={false} />
      )}

      {currentRoute === 'camera' && (
        <CameraSettingsStyleTuner isLight={isLight} showStandalonePreview={false} compact />
      )}

      {inspectorInfo.usesSettingActionRow && currentRoute !== 'camera' && (
        <SettingActionRowTuner isLight={isLight} showStandalonePreview={false} />
      )}
    </div>
  );
};
