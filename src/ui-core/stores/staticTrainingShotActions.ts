import { type StaticTrainingPackMetadata, saveEditWorkspacePackFull, saveSingleEditWorkspaceShotItem } from './staticTrainingPackStorage';
import { MAX_SHOTS_PER_PACK, generateUUID, createDefaultShotItem, cloneShotItem } from '../config/staticTrainingPackTypes';
import { exportSingleShotItemToJson, parseSingleShotItemFromJsonFile } from '../config/staticTrainingPackCodec';
import { floatingStore } from './floatingStore';
import {
  createStaticTrainingPackCollectionActions,
  type StaticPackDownCounterOption,
  type StaticPackSessionMode,
  type ActiveStaticTrainingPackBundle,
  type StaticTrainingPackRuntimeHandlers,
  type StaticTrainingShotActionHelpers,
  type StaticTrainingShotStoreState,
} from './staticTrainingPackCollectionActions';

export type {
  StaticPackDownCounterOption,
  StaticPackSessionMode,
  ActiveStaticTrainingPackBundle,
  StaticTrainingPackRuntimeHandlers,
  StaticTrainingShotActionHelpers,
  StaticTrainingShotStoreState,
};

export function createStaticTrainingShotActions<
  TState extends StaticTrainingShotStoreState
>(
  set: (
    partial:
      | Partial<StaticTrainingShotStoreState>
      | ((state: TState) => Partial<StaticTrainingShotStoreState>)
  ) => void,
  get: () => TState,
  helpers: StaticTrainingShotActionHelpers
) {
  const {
    getActiveEditItemVariable,
    setActiveEditItemVariable,
    buildActivePackBundle,
  } = helpers;

  return {
    ...createStaticTrainingPackCollectionActions(set, get, helpers),

    setSessionMode: (mode: StaticPackSessionMode) => {
      set({ sessionMode: mode });
      get().runtimeHandlers.onSessionModeChanged?.(mode);
    },

    setEdgeInspectorExpanded: (expanded: boolean) => {
      const next = Boolean(expanded);
      if (next && !get().isEdgeInspectorExpanded) {
        floatingStore.triggerBatchMinimize();
      }
      set({ isEdgeInspectorExpanded: next });
    },

    toggleEdgeInspectorExpanded: () => {
      const next = !get().isEdgeInspectorExpanded;
      if (next) {
        floatingStore.triggerBatchMinimize();
      }
      set({ isEdgeInspectorExpanded: next });
    },

    setCurrentShotIndex: (index: number) => {
      const items = get().activePack?.items || get().activeItems || [];
      if (items.length === 0) return;
      const wrapped = ((index % items.length) + items.length) % items.length;
      set({
        currentShotIndex: wrapped,
        remainingTimeoutSec: items[wrapped]?.timeoutSeconds ?? 10,
        isShotMirrored: false,
      });
      get().runtimeHandlers.onShotChanged?.(wrapped);
    },

    nextShot: () => {
      const items = get().activePack?.items || get().activeItems || [];
      if (items.length === 0) return;
      const nextIdx = (get().currentShotIndex + 1) % items.length;
      get().setCurrentShotIndex(nextIdx);
    },

    prevShot: () => {
      const items = get().activePack?.items || get().activeItems || [];
      if (items.length === 0) return;
      const prevIdx = (get().currentShotIndex - 1 + items.length) % items.length;
      get().setCurrentShotIndex(prevIdx);
    },

    resetCurrentShot: () => {
      get().runtimeHandlers.onResetShotRequested?.();
    },

    addNewShot: async () => {
      const wasEditingItem = get().isEditingItem;
      if (wasEditingItem && get().isCurrentShotDirty()) {
        await get().saveCurrentShotToEditWorkspace();
      }
      const { activePack, activeItems, storageScope } = get();
      if (!activePack || activeItems.length >= MAX_SHOTS_PER_PACK) return;
      const newIndex = activeItems.length;
      const newShot = createDefaultShotItem(newIndex);
      const nextItems = [...activeItems, newShot];
      const updatedMeta: StaticTrainingPackMetadata = {
        ...activePack.metadata,
        itemCount: nextItems.length,
        updatedAt: Date.now(),
      };
      await saveEditWorkspacePackFull(updatedMeta, nextItems, storageScope);
      const bundle = buildActivePackBundle(updatedMeta, nextItems);
      if (wasEditingItem) {
        const draft = cloneShotItem(newShot, newIndex);
        setActiveEditItemVariable(cloneShotItem(draft, newIndex));
        set((state) => ({
          activePack: bundle,
          activeItems: nextItems,
          currentShotIndex: newIndex,
          activeEditItemDraft: draft,
          editVarVersion: state.editVarVersion + 1,
        }));
        const handlers = get().runtimeHandlers;
        handlers.onShotChanged?.(newIndex);
        handlers.onEditVariableMutated?.(draft);
      } else {
        set({
          activePack: bundle,
          activeItems: nextItems,
          currentShotIndex: newIndex,
        });
        get().runtimeHandlers.onShotChanged?.(newIndex);
      }
    },

    duplicateShot: async (index: number) => {
      if (get().isEditingItem && get().isCurrentShotDirty()) {
        await get().saveCurrentShotToEditWorkspace();
      }
      const { activePack, activeItems, storageScope } = get();
      if (
        !activePack ||
        index < 0 ||
        index >= activeItems.length ||
        activeItems.length >= MAX_SHOTS_PER_PACK
      ) {
        return;
      }
      const source = activeItems[index];
      const duplicated = cloneShotItem(source, index + 1);
      duplicated.id = generateUUID();
      duplicated.name = `${source.name || `Shot ${index + 1}`} (Copy)`;
      const nextItems = [
        ...activeItems.slice(0, index + 1),
        duplicated,
        ...activeItems.slice(index + 1),
      ].map((item, idx) => ({ ...item, index: idx }));

      const updatedMeta: StaticTrainingPackMetadata = {
        ...activePack.metadata,
        itemCount: nextItems.length,
        updatedAt: Date.now(),
      };
      await saveEditWorkspacePackFull(updatedMeta, nextItems, storageScope);
      const bundle = buildActivePackBundle(updatedMeta, nextItems);
      set({
        activePack: bundle,
        activeItems: nextItems,
        currentShotIndex: index + 1,
      });
      get().runtimeHandlers.onShotChanged?.(index + 1);
    },

    deleteShot: async (index: number) => {
      if (get().isEditingItem && get().isCurrentShotDirty()) {
        await get().saveCurrentShotToEditWorkspace();
      }
      const { activePack, activeItems, currentShotIndex, storageScope } = get();
      if (!activePack || activeItems.length <= 1) return;
      const nextItems = activeItems
        .filter((_, idx) => idx !== index)
        .map((item, idx) => ({ ...item, index: idx }));
      const nextIdx = Math.max(
        0,
        Math.min(
          nextItems.length - 1,
          currentShotIndex >= index ? currentShotIndex - 1 : currentShotIndex
        )
      );

      const updatedMeta: StaticTrainingPackMetadata = {
        ...activePack.metadata,
        itemCount: nextItems.length,
        updatedAt: Date.now(),
      };
      await saveEditWorkspacePackFull(updatedMeta, nextItems, storageScope);
      const bundle = buildActivePackBundle(updatedMeta, nextItems);
      setActiveEditItemVariable(null);
      set({
        activePack: bundle,
        activeItems: nextItems,
        currentShotIndex: nextIdx,
        isEditingItem: false,
        activeEditItemDraft: null,
      });
      get().runtimeHandlers.onShotChanged?.(nextIdx);
    },

    reorderShot: async (fromIndex: number, toIndex: number) => {
      if (get().isEditingItem && get().isCurrentShotDirty()) {
        await get().saveCurrentShotToEditWorkspace();
      }
      const { activePack, activeItems, storageScope } = get();
      if (
        !activePack ||
        fromIndex < 0 ||
        fromIndex >= activeItems.length ||
        toIndex < 0 ||
        toIndex >= activeItems.length ||
        fromIndex === toIndex
      ) {
        return;
      }
      const copy = [...activeItems];
      const [moved] = copy.splice(fromIndex, 1);
      copy.splice(toIndex, 0, moved);
      const nextItems = copy.map((item, idx) => ({ ...item, index: idx }));

      const updatedMeta: StaticTrainingPackMetadata = {
        ...activePack.metadata,
        itemCount: nextItems.length,
        updatedAt: Date.now(),
      };
      await saveEditWorkspacePackFull(updatedMeta, nextItems, storageScope);
      const bundle = buildActivePackBundle(updatedMeta, nextItems);
      set({
        activePack: bundle,
        activeItems: nextItems,
        currentShotIndex: toIndex,
      });
      get().runtimeHandlers.onShotChanged?.(toIndex);
    },

    enterItemEditMode: (index?: number) => {
      if (get().isEditingItem && get().isCurrentShotDirty()) {
        void get().saveCurrentShotToEditWorkspace();
      }
      const items = get().activePack?.items || get().activeItems || [];
      const targetIdx = typeof index === 'number' ? index : get().currentShotIndex;
      const targetItem = items[targetIdx];
      if (!targetItem) return;

      const draft = cloneShotItem(targetItem, targetIdx);
      setActiveEditItemVariable(cloneShotItem(draft, targetIdx));

      const nextSubMode =
        draft.car.speedFollowsHeading !== false && get().editSubMode === 'car-speed'
          ? 'car-heading'
          : get().editSubMode;

      set((state) => ({
        sessionMode: 'edit',
        currentShotIndex: targetIdx,
        isEditingItem: true,
        activeEditItemDraft: draft,
        editSubMode: nextSubMode,
        editVarVersion: state.editVarVersion + 1,
      }));

      const handlers = get().runtimeHandlers;
      handlers.onShotChanged?.(targetIdx);
      handlers.onEditVariableMutated?.(draft);
    },

    exportSingleShotJson: (index?: number) => {
      const { activePack, activeItems, currentShotIndex, isEditingItem } = get();
      const targetItem =
        isEditingItem && getActiveEditItemVariable() && index === undefined
          ? getActiveEditItemVariable()!
          : activeItems[typeof index === 'number' ? index : currentShotIndex];
      if (!targetItem) return null;
      return exportSingleShotItemToJson(targetItem, activePack?.title || 'StaticPack');
    },

    importSingleShotJson: async (file: File, index?: number) => {
      const { activePack, activeItems, currentShotIndex, isEditingItem, storageScope } = get();
      const targetIdx = typeof index === 'number' ? index : currentShotIndex;
      const parsedItem = await parseSingleShotItemFromJsonFile(file, targetIdx);

      if (isEditingItem && targetIdx === currentShotIndex) {
        setActiveEditItemVariable(cloneShotItem(parsedItem, targetIdx));
        set((state) => ({
          activeEditItemDraft: cloneShotItem(parsedItem, targetIdx),
          editVarVersion: state.editVarVersion + 1,
        }));
        get().runtimeHandlers.onEditVariableMutated?.(parsedItem);
        return;
      }

      if (!activePack) return;
      const nextItems = activeItems.map((item, idx) => (idx === targetIdx ? parsedItem : item));
      await saveSingleEditWorkspaceShotItem(
        activePack.uuid,
        targetIdx,
        parsedItem,
        activePack.metadata,
        storageScope
      );
      const bundle = buildActivePackBundle(activePack.metadata, nextItems);
      set({ activePack: bundle, activeItems: nextItems, currentShotIndex: targetIdx });
      get().runtimeHandlers.onShotChanged?.(targetIdx);
    },
  };
}
