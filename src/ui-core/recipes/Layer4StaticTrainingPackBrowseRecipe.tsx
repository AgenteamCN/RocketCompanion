import React, { useEffect, useState } from 'react';
import { Settings } from 'lucide-react';
import { PanelContainer, PanelHeader, PanelContent } from '../layout/Panel';
import { PanelFooter } from '../layout/PanelFooter';
import type { StandardSurfaceProps, SurfaceMeta } from '../manifest/surfaceMetaTypes';
import { resolveCalibratedSurfaceSizing } from '../manifest/surfaceCalibration';
import { useAppStore } from '../stores/appStore';
import { useMenuLayoutStore } from '../stores/menuLayoutStore';
import { useStaticTrainingPackStore } from '../stores/staticTrainingPackStore';
import { useStoreSnapshotOverride } from '../stores/storeSnapshotScope';
import {
  StaticTrainingPackFolderList,
  type StaticTrainingPackSummary,
} from './static-training/StaticTrainingPackFolderList';
import { StaticTrainingVariationsModal } from './static-training/StaticTrainingVariationsModal';
import { DEFAULT_QUICK_VARIATION_TOGGLES } from '../config/staticTrainingVariationTypes';
import { KEVPERT_LATEST_PRESETS } from '../config/kevpertVariationPresets';
import {
  DEFAULT_STATIC_TRAINING_PACKS,
  normalizePackSummary,
} from './static-training/staticTrainingPackFilterLogic';
import {
  TrainingPackBrowseFilterHeader,
  type Layer4StaticTrainingPackBrowseStateOverride,
} from './layer-sections/TrainingPackBrowseFilterHeader';

export type { Layer4StaticTrainingPackBrowseStateOverride } from './layer-sections/TrainingPackBrowseFilterHeader';

export const SURFACE_META: SurfaceMeta = {
  id: 'recipe:Layer4StaticTrainingPackBrowseRecipe',
  title: 'Static Training Packs Browser',
  subtitle: '.RCSPack / .RCSPackE / .Tem 2-column pack manager, metadata editor, and Kevpert variations',
  icon: 'folder-open',
  layer: 'layer4',
  menuGroup: 'menu-layer',
  defaultSizing: {
    mode: 'fixed',
    width: 920,
    height: 740,
    minHeight: 320,
    maxHeight: 1120,
  },
  variants: [
    {
      variantId: 'user',
      label: 'Standard Pack Browser',
      description: '2-column Static Training Pack browser (.RCSPack / .RCSPackE)',
    },
    {
      variantId: 'dev',
      label: 'Dev Mode (.Tem Converter & Variations)',
      description: 'Includes .Tem original description inspector and Kevpert F3–F12 variations modal',
    },
  ],
};

export interface Layer4StaticTrainingPackBrowseRecipeProps extends StandardSurfaceProps {
  isDevMode?: boolean;
  stateOverride?: Layer4StaticTrainingPackBrowseStateOverride;
  className?: string;
}

export const Layer4StaticTrainingPackBrowseRecipe: React.FC<
  Layer4StaticTrainingPackBrowseRecipeProps
> = React.memo(({ isLight = false, isDevMode = false, onBack, stateOverride, className = '' }) => {
  const store = useStaticTrainingPackStore();
  const goBack = useAppStore((s) => s.goBack);
  const scopeOverride =
    useStoreSnapshotOverride<Layer4StaticTrainingPackBrowseStateOverride>(
      'staticTrainingPackStore'
    );
  const ov = { ...scopeOverride, ...stateOverride };

  const targetScope = isDevMode ? 'dev' : 'normal';
  const scopeInit = isDevMode ? store.devInitialized : store.initialized;
  const scopedPacks = isDevMode ? store.devPacks : store.normalPacks;
  const scopedSelectedUuid = isDevMode ? store.devSelectedPackUuid : store.normalSelectedPackUuid;

  useEffect(() => {
    void store.setStorageScope(targetScope);
    if (!scopeInit && !store.isLoading && !ov.packs) void store.initStore(targetScope);
  }, [targetScope, scopeInit, store.isLoading, ov.packs]);

  useEffect(() => {
    if (isDevMode && store.devInitialized && !ov.packs) {
      void store.seedDevBuiltInPacks(false);
    }
  }, [isDevMode, store.devInitialized, ov.packs]);

  const storeSizing = useMenuLayoutStore((s) => s.panels?.['layer4-static-training-pack']);
  const calibratedSizing = resolveCalibratedSurfaceSizing(SURFACE_META.id, SURFACE_META.defaultSizing);
  const sizing = storeSizing ?? {
    mode: calibratedSizing.mode === 'fixed' ? ('fixed' as const) : ('auto' as const),
    width: calibratedSizing.width,
    targetHeight: typeof calibratedSizing.height === 'number' ? calibratedSizing.height : 740,
    minHeight: calibratedSizing.minHeight ?? 320,
    maxHeight: calibratedSizing.maxHeight ?? 1120,
  };

  const controlledPacks = ov.packs ?? (scopedPacks.length > 0 ? scopedPacks : undefined);
  const [internalPacks, setInternalPacks] = useState<StaticTrainingPackSummary[]>(() =>
    (controlledPacks ?? DEFAULT_STATIC_TRAINING_PACKS).map((p, i) => normalizePackSummary(p, i))
  );

  useEffect(() => {
    if (controlledPacks) setInternalPacks(controlledPacks.map((p, i) => normalizePackSummary(p, i)));
  }, [controlledPacks]);

  const packs = React.useMemo(
    () => (controlledPacks ?? internalPacks).map((p, i) => normalizePackSummary(p, i)),
    [controlledPacks, internalPacks]
  );

  const defaultSelectedId = ov.defaultSelectedId ?? 'starter-aerial-striker-pack';
  const [internalSelectedUuid, setInternalSelectedUuid] = useState<string | null>(() => {
    const initial = (controlledPacks ?? DEFAULT_STATIC_TRAINING_PACKS).map((p, i) => normalizePackSummary(p, i));
    const found = initial.find((p) => p.uuid === defaultSelectedId || p.id === defaultSelectedId);
    return found?.uuid ?? initial[0]?.uuid ?? null;
  });

  const selectedPackUuid = ov.selectedPackUuid !== undefined ? ov.selectedPackUuid : scopedSelectedUuid ?? internalSelectedUuid;
  const downCounterEnabled = ov.downCounterEnabled ?? store.downCounterEnabled;
  const downCounterValue = ov.downCounterValue ?? store.downCounterValue;
  const setDownCounterEnabled = ov.onDownCounterEnabledChange ?? store.setDownCounterEnabled;
  const setDownCounterValue = ov.onDownCounterValueChange ?? store.setDownCounterValue;
  const variationToggles = ov.variationToggles ?? store.variationToggles ?? DEFAULT_QUICK_VARIATION_TOGGLES;
  const onUpdateVariationToggles = ov.onUpdateVariationToggles ?? store.setVariationToggles;
  const customVariation = ov.customVariation ?? store.customVariation ?? KEVPERT_LATEST_PRESETS.F7;
  const onUpdateCustomVariation = ov.onUpdateCustomVariation ?? store.setCustomVariation;
  const onSelectKevpertPreset = ov.onSelectKevpertPreset ?? store.applyKevpertVariationPreset;

  const [hoveredDesc, setHoveredDesc] = useState<string | null>(null);
  const [isVariationsModalOpen, setIsVariationsModalOpen] = useState(false);

  const selectedMeta =
    packs.find((p) => p.uuid === selectedPackUuid) ?? packs[0] ?? null;

  const handleSelectPack = (uuid: string) => {
    if (ov.onSelectPack) {
      ov.onSelectPack(uuid);
    } else if (scopedPacks.length > 0) {
      void store.selectPack(uuid, targetScope);
    } else {
      setInternalSelectedUuid(uuid);
    }
  };

  const handleBatchExportFiltered = async (
    filteredPacks: StaticTrainingPackSummary[],
    folderLabel: string,
    editable: boolean,
    formatOverride?: 'RCSPack' | 'RCSPackE' | 'RLRCSPack'
  ) => {
    const uuids = filteredPacks.map((p) => p.uuid);
    if (uuids.length === 0) return;
    if (ov.onExportBatchPacksZip) {
      const zipName = await ov.onExportBatchPacksZip(
        uuids,
        folderLabel,
        editable,
        formatOverride
      );
      setHoveredDesc(
        `Exported ${uuids.length} packs from "${folderLabel}" as ${zipName || '.zip'}`
      );
      return;
    }
    const zipName = await store.exportBatchPacksZip(
      uuids,
      folderLabel,
      { editable, formatOverride },
      targetScope
    );
    setHoveredDesc(
      `Exported ${uuids.length} packs from "${folderLabel}" as ${zipName || '.zip'}`
    );
  };

  return (
    <PanelContainer
      isLight={isLight}
      sizing={sizing}
      className={`w-full select-none ${className}`}
    >
      <PanelHeader
        title={isDevMode ? 'STATIC TRAINING PACKS (DEV MODE)' : 'STATIC TRAINING PACKS'}
        onBack={onBack ?? goBack}
        isLight={isLight}
        showRightAction={isDevMode}
        onRightAction={isDevMode ? () => setIsVariationsModalOpen(true) : undefined}
        rightActionIcon={<Settings className="h-4 w-4" />}
        rightActionLabel="Training Variations"
        onRightActionHoverChange={(hovered) => {
          if (hovered) {
            setHoveredDesc(
              'Open Training Variations (Experimental): Configure BakkesMod / Kevpert F3–F12 presets, Ball/Car variance, and Quick Toggles.'
            );
          } else {
            setHoveredDesc(null);
          }
        }}
      />

      <PanelContent scrollable={false} className="flex flex-col gap-3 h-full overflow-hidden">
        <div className="grid grid-cols-12 gap-3.5 grow min-h-0 overflow-hidden">
          <StaticTrainingPackFolderList
            isLight={isLight}
            isDevMode={isDevMode}
            applyNewKevpertBind={Boolean(variationToggles.applyNewKevpertBind)}
            packs={packs}
            selectedUuid={selectedMeta?.uuid}
            onSelectPack={handleSelectPack}
            onHoverDesc={setHoveredDesc}
            onBatchExportFiltered={(filtered, folderLabel, editable, formatOverride) =>
              void handleBatchExportFiltered(filtered, folderLabel, editable, formatOverride)
            }
          />

          <TrainingPackBrowseFilterHeader
            isLight={isLight}
            isDevMode={isDevMode}
            targetScope={targetScope}
            hasScopedPacks={scopedPacks.length > 0}
            selectedMeta={selectedMeta}
            downCounter={{
              downCounterEnabled,
              setDownCounterEnabled,
              downCounterValue,
              setDownCounterValue,
            }}
            kevpertBind={{
              applyNewKevpertBind: Boolean(variationToggles.applyNewKevpertBind),
              onToggleApplyNewKevpertBind: (val) =>
                onUpdateVariationToggles({ applyNewKevpertBind: val }),
            }}
            ov={ov}
            internalState={{
              setInternalPacks,
              setInternalSelectedUuid,
            }}
            onHoverDesc={setHoveredDesc}
          />
        </div>
      </PanelContent>

      {isDevMode && (
        <StaticTrainingVariationsModal
          isLight={isLight}
          isOpen={isVariationsModalOpen}
          onClose={() => setIsVariationsModalOpen(false)}
          toggles={variationToggles}
          onUpdateToggles={onUpdateVariationToggles}
          customVariation={customVariation}
          onUpdateCustomVariation={onUpdateCustomVariation}
          onSelectKevpertPreset={onSelectKevpertPreset}
          packRecommendedVariation={selectedMeta?.recommendedVariation}
          packTitle={selectedMeta?.title}
        />
      )}

      <PanelFooter
        isLight={isLight}
        defaultDescription={
          isDevMode
            ? 'Dev Mode: Batch import/export .Tem / .RCSPack / .RCSPackE / .zip • Click the top-right Gear icon for Training Variations (F3–F12 / Custom).'
            : 'Select a Static Training Pack on the left to Play, Edit, Export (.RCSPack / .RCSPackE), or Delete.'
        }
        hoveredDescription={hoveredDesc}
      />
    </PanelContainer>
  );
});

Layer4StaticTrainingPackBrowseRecipe.displayName = 'Layer4StaticTrainingPackBrowseRecipe';
export default Layer4StaticTrainingPackBrowseRecipe;
