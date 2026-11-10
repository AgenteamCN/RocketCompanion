import React, { useState, useRef } from 'react';
import { Info } from 'lucide-react';
import { PanelContainer, PanelHeader, PanelContent } from '../layout/Panel';
import { PanelFooter } from '../layout/PanelFooter';
import { CollapsibleNumberedRailList } from '../compounds/CollapsibleNumberedRailList';
import { dialogue } from '../compounds/dialogue/dialogueStore';
import {
  INITIAL_TRAINING_SHOTS,
  MAX_SHOTS_PER_PACK,
  createDefaultShotItem,
  formatShotSubtitle,
  type EditSubMode,
  type StaticTrainingShotItem,
} from './static-training/staticTrainingTypes';
import {
  StaticTrainingCollapseDrawerBtn,
  cloneShotWithUpdate,
  duplicateShotInArray,
  openStaticTrainingEditorHelpDialogue,
} from './static-training/staticTrainingEditorDialogues';
import { StaticTrainingShotInspectorView } from './static-training/StaticTrainingShotInspectorView';
import {
  useStaticTrainingPackStore,
  getActiveEditItemVariable,
  mutateActiveEditItemVariable,
} from '../stores/staticTrainingPackStore';
import { useStoreSnapshotOverride } from '../stores/storeSnapshotScope';
import type { SurfaceMeta, StandardSurfaceProps } from '../manifest/surfaceMetaTypes';

export function openStaticTrainingExitConfirmDialogue(
  onConfirm?: (action: 'save' | 'ignore') => void | Promise<void>
): void {
  dialogue.show({
    id: 'static-training-exit-edit-confirm',
    title: 'EXIT EDIT MODE',
    tone: 'warning',
    icon: 'triangle-alert',
    maxWidth: 500,
    content: 'Do you want to save your previous edits before exiting Edit Mode?',
    buttons: [
      { label: 'Save', variant: 'primary', onClick: async () => { await onConfirm?.('save'); } },
      { label: 'Ignore', variant: 'danger', onClick: async () => { await onConfirm?.('ignore'); } },
      { label: 'Cancel', variant: 'outline' },
    ],
  });
}

export const SURFACE_META: SurfaceMeta = {
  id: 'recipe:StaticTrainingShotInspectorDrawer',
  title: 'Static Training Shot Inspector',
  layer: 'layer4',
  menuGroup: 'menu-layer',
  defaultSizing: { mode: 'fixed', width: 520, height: 680, minHeight: 320, maxHeight: 1080 },
};

export interface StaticTrainingShotInspectorStateOverride {
  packTitle?: string;
  shots?: StaticTrainingShotItem[];
  onShotsChange?: (shots: StaticTrainingShotItem[]) => void;
  selectedShotIndex?: number;
  onSelectedShotIndexChange?: (idx: number) => void;
  isInspectingShot?: boolean;
  onInspectingShotChange?: (inspecting: boolean) => void;
  editSubMode?: EditSubMode;
  onEditSubModeChange?: (mode: EditSubMode) => void;
  currentShotOverride?: StaticTrainingShotItem | null;
  isDirty?: boolean;
  onMutateCurrentShot?: (updater: (draft: StaticTrainingShotItem) => void) => void;
  onSaveCurrentShot?: () => void | Promise<void>;
  onAddNewShot?: () => void | Promise<void>;
  onDuplicateShot?: (idx: number) => void | Promise<void>;
  onReorderShot?: (fromIdx: number, toIdx: number) => void | Promise<void>;
  onDeleteShot?: (idx: number) => void | Promise<void>;
  onExportSingleShot?: (idx: number) => void;
  onImportSingleShot?: (file: File) => void | Promise<void>;
  onExitSession?: (action: 'save' | 'ignore') => void | Promise<void>;
}

export interface StaticTrainingShotInspectorDrawerProps extends StandardSurfaceProps {
  transparent?: boolean;
  packTitle?: string;
  /** Callback when user clicks Collapse [TAB] in header */
  onCollapseDrawer?: () => void;
  stateOverride?: StaticTrainingShotInspectorStateOverride;
}

export const StaticTrainingShotInspectorDrawer: React.FC<StaticTrainingShotInspectorDrawerProps> = ({
  isLight = false,
  transparent = true,
  packTitle: propPackTitle,
  onCollapseDrawer,
  stateOverride,
}) => {
  const scopeOverride =
    useStoreSnapshotOverride<StaticTrainingShotInspectorStateOverride>('staticTrainingShotInspector');
  const ov = { ...scopeOverride, ...stateOverride };

  const packStore = useStaticTrainingPackStore();
  const {
    activePack,
    currentShotIndex: storeShotIndex,
    isEditingItem: storeIsEditingItem,
    editSubMode: storeEditSubMode,
    editVarVersion,
    enterItemEditMode,
    deselectEditShot,
    setEditSubMode: setStoreEditSubMode,
    addNewShot,
    duplicateShot,
    deleteShot,
    reorderShot,
    exportSingleShotJson,
    importSingleShotJson,
    isCurrentShotDirty,
    saveCurrentShotToEditWorkspace,
  } = packStore;
  void editVarVersion;

  const packTitle = propPackTitle ?? ov.packTitle ?? activePack?.metadata.title ?? 'Aerial Striker Pack';
  const controlledShots =
    ov.shots ?? (activePack?.items && activePack.items.length > 0 ? activePack.items : undefined);
  const onShotsChange = ov.onShotsChange;
  const controlledInspecting = ov.isInspectingShot ?? storeIsEditingItem;
  const currentShotOverride =
    ov.currentShotOverride !== undefined
      ? ov.currentShotOverride
      : controlledInspecting && !ov.shots
      ? getActiveEditItemVariable()
      : null;
  const controlledIndex = ov.selectedShotIndex ?? storeShotIndex;
  const onSelectedShotIndexChange = (idx: number) => {
    ov.onSelectedShotIndexChange?.(idx);
    if (!ov.shots && activePack) enterItemEditMode(idx);
  };
  const onInspectingShotChange = (inspecting: boolean) => {
    ov.onInspectingShotChange?.(inspecting);
    if (!inspecting && !ov.shots && activePack) void deselectEditShot();
  };
  const controlledSubMode = ov.editSubMode ?? storeEditSubMode;
  const onEditSubModeChange = ov.onEditSubModeChange ?? setStoreEditSubMode;
  const controlledIsDirty = ov.isDirty ?? (activePack ? isCurrentShotDirty() : undefined);

  const onMutateCurrentShot =
    ov.onMutateCurrentShot ??
    (activePack && !ov.shots
      ? (updater: (draft: StaticTrainingShotItem) => void) => mutateActiveEditItemVariable(updater)
      : undefined);
  const onSaveCurrentShot =
    ov.onSaveCurrentShot ?? (activePack ? saveCurrentShotToEditWorkspace : undefined);
  const onAddNewShot = ov.onAddNewShot ?? (activePack ? addNewShot : undefined);
  const onDuplicateShot = ov.onDuplicateShot ?? (activePack ? duplicateShot : undefined);
  const onReorderShot = ov.onReorderShot ?? (activePack ? reorderShot : undefined);
  const onDeleteShot = ov.onDeleteShot ?? (activePack ? deleteShot : undefined);
  const onExportSingleShot = ov.onExportSingleShot ?? (activePack ? exportSingleShotJson : undefined);
  const onImportSingleShot = ov.onImportSingleShot ?? (activePack ? importSingleShotJson : undefined);

  const [internalShots, setInternalShots] = useState<StaticTrainingShotItem[]>(INITIAL_TRAINING_SHOTS);
  const [internalIndex, setInternalIndex] = useState<number>(0);
  const [internalInspecting, setInternalInspecting] = useState<boolean>(false);
  const [internalSubMode, setInternalSubMode] = useState<EditSubMode>('car-heading');
  const [internalIsDirty, setInternalIsDirty] = useState<boolean>(false);
  const [hoveredDesc, setHoveredDesc] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const items = controlledShots ?? internalShots;
  const setItems = (next: StaticTrainingShotItem[]) => {
    if (onShotsChange) onShotsChange(next);
    else setInternalShots(next);
  };

  const selectedIndex = controlledIndex ?? internalIndex;
  const setSelectedIndex = (idx: number) => {
    if (onSelectedShotIndexChange) onSelectedShotIndexChange(idx);
    else setInternalIndex(idx);
  };

  const isInspecting = controlledInspecting ?? internalInspecting;
  const setIsInspecting = (val: boolean) => {
    if (onInspectingShotChange) onInspectingShotChange(val);
    else setInternalInspecting(val);
  };

  const editSubMode = controlledSubMode ?? internalSubMode;
  const setEditSubMode = (mode: EditSubMode) => {
    if (onEditSubModeChange) onEditSubModeChange(mode);
    else setInternalSubMode(mode);
  };

  const isDirty = controlledIsDirty ?? internalIsDirty;

  const safeIndex = Math.max(0, Math.min(Math.max(0, items.length - 1), selectedIndex));
  const currentShot = currentShotOverride || items[safeIndex] || items[0] || null;

  const fmtNum = (n: number) => `#${String(n + 1).padStart(2, '0')}`;

  const handleSelectShot = (idx: number) => {
    if (isInspecting && idx === safeIndex) {
      setIsInspecting(false);
      setHoveredDesc('Returned to full Shot List view.');
      return;
    }
    setSelectedIndex(idx);
    setIsInspecting(true);
  };

  const handleMutateCurrentShot = (updater: (draft: StaticTrainingShotItem) => void) => {
    if (onMutateCurrentShot) {
      onMutateCurrentShot(updater);
      return;
    }
    if (!currentShot) return;
    const cloned = cloneShotWithUpdate(currentShot, updater);
    setItems(items.map((it, idx) => (idx === safeIndex ? cloned : it)));
    setInternalIsDirty(true);
  };

  const handleAddNewShot = async () => {
    if (items.length >= MAX_SHOTS_PER_PACK) return;
    const newIdx = items.length;
    if (onAddNewShot) {
      await onAddNewShot();
      setHoveredDesc(`Created ${fmtNum(newIdx)} (Shot ${newIdx + 1}).`);
      return;
    }
    const newShot = createDefaultShotItem(newIdx);
    setItems([...items, newShot]);
    setSelectedIndex(newIdx);
    setInternalIsDirty(true);
    setHoveredDesc(`Created ${fmtNum(newIdx)} (${newShot.name}).`);
  };

  const handleDuplicateShot = async (idx: number) => {
    if (items.length >= MAX_SHOTS_PER_PACK) return;
    if (onDuplicateShot) {
      await onDuplicateShot(idx);
      setHoveredDesc(`Duplicated ${fmtNum(idx)} -> ${fmtNum(idx + 1)}.`);
      return;
    }
    const next = duplicateShotInArray(items, idx, currentShot);
    if (!next) return;
    setItems(next);
    setSelectedIndex(idx + 1);
    setInternalIsDirty(true);
    setHoveredDesc(`Duplicated ${fmtNum(idx)} -> ${fmtNum(idx + 1)}.`);
  };

  const handleReorderShot = async (fromIdx: number, toIdx: number) => {
    if (toIdx < 0 || toIdx >= items.length || fromIdx === toIdx) return;
    if (onReorderShot) {
      await onReorderShot(fromIdx, toIdx);
      return;
    }
    const copy = [...items];
    const [moved] = copy.splice(fromIdx, 1);
    copy.splice(toIdx, 0, moved);
    setItems(copy.map((it, i) => ({ ...it, index: i })));
    setSelectedIndex(toIdx);
    setInternalIsDirty(true);
  };

  const handleDeleteShot = async (idx: number) => {
    if (items.length <= 1) return;
    if (onDeleteShot) {
      await onDeleteShot(idx);
      setHoveredDesc(`Deleted shot ${fmtNum(idx)}.`);
      return;
    }
    const next = items.filter((_, i) => i !== idx).map((it, i) => ({ ...it, index: i }));
    const nextIdx = Math.max(0, Math.min(next.length - 1, safeIndex >= idx ? safeIndex - 1 : safeIndex));
    setItems(next);
    setSelectedIndex(nextIdx);
    setInternalIsDirty(true);
    setHoveredDesc(`Deleted shot ${fmtNum(idx)}.`);
  };

  const handleExportSingleShot = (idx: number) => {
    const target = items[idx];
    if (!target) return;
    onExportSingleShot?.(idx);
    setHoveredDesc(`Exported ${fmtNum(idx)} (${target.name}).json`);
  };

  const handleImportSingleShot = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      if (onImportSingleShot) {
        await onImportSingleShot(file);
      }
      setHoveredDesc(`Imported shot configuration from ${file.name}.`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Invalid JSON';
      setHoveredDesc(`Failed to import shot JSON: ${msg}`);
    } finally {
      e.target.value = '';
    }
  };

  const railItems = items.map((shot, idx) => {
    const effectiveShot = idx === safeIndex && currentShot ? currentShot : shot;
    return {
      id: effectiveShot.id || String(idx),
      index: idx,
      title: effectiveShot.name,
      subtitle: formatShotSubtitle(effectiveShot),
    };
  });

  return (
    <PanelContainer isLight={isLight} transparent={transparent} className="w-full h-full">
      <PanelHeader
        title={
          isInspecting
            ? `EDIT SHOT ${fmtNum(safeIndex)} · ${currentShot?.name || packTitle}`
            : `EDIT: ${packTitle}`
        }
        isLight={isLight}
        className="!pl-3 !pr-2 !py-2"
        titleClassName="!text-xs !font-bold tracking-wider"
        rightElement={
          onCollapseDrawer ? (
            <StaticTrainingCollapseDrawerBtn
              isLight={isLight}
              onCollapseDrawer={onCollapseDrawer}
              onHoverDesc={setHoveredDesc}
            />
          ) : undefined
        }
      />

      <PanelContent
        scrollable={false}
        className="!p-3 flex flex-col gap-2.5 h-full min-h-0 overflow-hidden"
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          onChange={handleImportSingleShot}
          className="hidden"
        />

        <CollapsibleNumberedRailList
          isCollapsedToRail={isInspecting}
          items={railItems}
          selectedIndex={safeIndex}
          maxItems={MAX_SHOTS_PER_PACK}
          collapsedRailWidth={60}
          isLight={isLight}
          onSelectItem={handleSelectShot}
          onAddNew={() => void handleAddNewShot()}
          onImport={() => fileInputRef.current?.click()}
          onShowHelp={() => openStaticTrainingEditorHelpDialogue()}
          onDuplicate={(idx) => void handleDuplicateShot(idx)}
          onReorder={(fromIdx, toIdx) => void handleReorderShot(fromIdx, toIdx)}
          onExportItem={handleExportSingleShot}
          onDeleteItem={(idx) => void handleDeleteShot(idx)}
          onHoverDescription={setHoveredDesc}
          detailContent={
            currentShot ? (
              <StaticTrainingShotInspectorView
                isLight={isLight}
                currentShot={currentShot}
                editSubMode={editSubMode}
                isDirty={isDirty}
                onChangeSubMode={setEditSubMode}
                onMutateShot={handleMutateCurrentShot}
                onSaveShot={() => {
                  if (onSaveCurrentShot) {
                    void onSaveCurrentShot();
                  } else {
                    setInternalIsDirty(false);
                  }
                }}
                onHoverDesc={setHoveredDesc}
              />
            ) : null
          }
        />
      </PanelContent>

      <PanelFooter isLight={isLight} className="!px-3 !py-2">
        <div className="flex items-center gap-2 w-full text-xs truncate">
          <Info className="h-3.5 w-3.5 text-amber-500 shrink-0" />
          <span
            className={`truncate transition-colors duration-150 ${
              hoveredDesc
                ? isLight
                  ? 'text-neutral-900 font-medium'
                  : 'text-neutral-100 font-medium'
                : isLight
                ? 'text-neutral-500'
                : 'text-neutral-400'
            }`}
          >
            {hoveredDesc ||
              'Click active #number to toggle List/Detail · [TAB] Collapse Drawer · [ESC] Main Menu.'}
          </span>
        </div>
      </PanelFooter>
    </PanelContainer>
  );
};
