import { type StaticTrainingPackStorageScope, listStaticTrainingPacks, loadStaticTrainingPackByUuid, saveStaticTrainingPackFull, saveEditWorkspacePackFull, saveSingleEditWorkspaceShotItem, clearEditWorkspaceByUuid, ensureBuiltInDevPacksSeeded } from './staticTrainingPackStorage';
import { MAX_SHOTS_PER_PACK, cloneShotItem, areShotItemsEqual, areShotListsEqual, type StaticTrainingPackMetadata } from '../config/staticTrainingPackTypes';
import { floatingStore } from './floatingStore';
import { buildScopePackStatePatch, createStaticTrainingPackIoActions, type StaticPackDownCounterOption, type StaticPackSessionMode, type ActiveStaticTrainingPackBundle, type StaticTrainingPackRuntimeHandlers, type StaticTrainingShotActionHelpers, type StaticTrainingShotStoreState } from './staticTrainingPackIoActions';

export type {
  StaticPackDownCounterOption,
  StaticPackSessionMode,
  ActiveStaticTrainingPackBundle,
  StaticTrainingPackRuntimeHandlers,
  StaticTrainingShotActionHelpers,
  StaticTrainingShotStoreState,
};

export function createStaticTrainingPackCollectionActions<TState extends StaticTrainingShotStoreState>(
  updateStoreState: (
    partial:
      | Partial<StaticTrainingShotStoreState>
      | ((state: TState) => Partial<StaticTrainingShotStoreState>)
  ) => void,
  readStoreState: () => TState,
  helpers: StaticTrainingShotActionHelpers
) {
  const { getActiveEditItemVariable, setActiveEditItemVariable, buildActivePackBundle } = helpers;

  const initStore = async (
    scope: StaticTrainingPackStorageScope = readStoreState().storageScope
  ) => {
    updateStoreState({ isLoading: true });
    try {
      if (scope === 'dev') await ensureBuiltInDevPacksSeeded(false);
      const packs = await listStaticTrainingPacks(scope);
      const currentSelected =
        scope === 'dev'
          ? readStoreState().devSelectedPackUuid
          : readStoreState().normalSelectedPackUuid;
      const validSelected =
        currentSelected && packs.some((p) => p.uuid === currentSelected)
          ? currentSelected
          : packs[0]?.uuid ?? null;

      let activePack = readStoreState().activePack;
      let activeItems = readStoreState().activeItems;
      if (validSelected && (!activePack || activePack.uuid !== validSelected)) {
        const loaded = await loadStaticTrainingPackByUuid(validSelected, scope);
        activeItems = loaded.items;
        activePack = buildActivePackBundle(loaded.metadata, loaded.items);
      }

      updateStoreState({
        ...(scope === 'dev' ? { devInitialized: true } : { initialized: true }),
        isLoading: false,
        storageScope: scope,
        ...buildScopePackStatePatch(scope, packs, validSelected, true),
        activePack,
        activeItems,
        committedSessionItems: activeItems.map((it, idx) => cloneShotItem(it, idx)),
      });
    } catch (err) {
      console.error('[staticTrainingPackStore] Failed to init packs:', err);
      updateStoreState({
        isLoading: false,
        ...(scope === 'dev' ? { devInitialized: true } : { initialized: true }),
      });
    }
  };

  return {
    initStore,

    setStorageScope: async (scope: StaticTrainingPackStorageScope) => {
      const prevScope = readStoreState().storageScope;
      const isScopeInitialized =
        scope === 'dev' ? readStoreState().devInitialized : readStoreState().initialized;
      if (!isScopeInitialized) {
        await initStore(scope);
        return;
      }
      const packs = await listStaticTrainingPacks(scope);
      const savedSelected =
        scope === 'dev'
          ? readStoreState().devSelectedPackUuid
          : readStoreState().normalSelectedPackUuid;
      const validSelected =
        savedSelected && packs.some((p) => p.uuid === savedSelected)
          ? savedSelected
          : packs[0]?.uuid ?? null;

      let activePack = readStoreState().activePack;
      let activeItems = readStoreState().activeItems;
      if (
        prevScope !== scope ||
        (validSelected && (!activePack || activePack.uuid !== validSelected))
      ) {
        if (validSelected) {
          const loaded = await loadStaticTrainingPackByUuid(validSelected, scope);
          activeItems = loaded.items;
          activePack = buildActivePackBundle(loaded.metadata, loaded.items);
        } else {
          activeItems = [];
          activePack = null;
        }
      }

      updateStoreState({
        storageScope: scope,
        ...buildScopePackStatePatch(scope, packs, validSelected, true),
        activePack,
        activeItems,
        committedSessionItems: activeItems.map((it, idx) => cloneShotItem(it, idx)),
      });
    },

    selectPack: async (
      uuid: string,
      scope: StaticTrainingPackStorageScope = readStoreState().storageScope
    ) => {
      const loaded = await loadStaticTrainingPackByUuid(uuid, scope);
      const bundle = buildActivePackBundle(loaded.metadata, loaded.items);
      setActiveEditItemVariable(null);
      updateStoreState({
        storageScope: scope,
        selectedPackUuid: uuid,
        ...(scope === 'dev' ? { devSelectedPackUuid: uuid } : { normalSelectedPackUuid: uuid }),
        activePack: bundle,
        activeItems: loaded.items,
        committedSessionItems: loaded.items.map((it, idx) => cloneShotItem(it, idx)),
        currentShotIndex: 0,
        isEditingItem: false,
        activeEditItemDraft: null,
        isFreeCamTrajectoryTesting: false,
        isTestingSingleShot: false,
      });
    },

    beginEditSession: async (
      uuid: string,
      scope: StaticTrainingPackStorageScope = readStoreState().storageScope
    ) => {
      const loaded = await loadStaticTrainingPackByUuid(uuid, scope);
      if (!loaded.metadata) return;
      await saveEditWorkspacePackFull(loaded.metadata, loaded.items, scope);
      const bundle = buildActivePackBundle(loaded.metadata, loaded.items);
      setActiveEditItemVariable(null);
      updateStoreState({
        storageScope: scope,
        selectedPackUuid: uuid,
        ...(scope === 'dev' ? { devSelectedPackUuid: uuid } : { normalSelectedPackUuid: uuid }),
        sessionMode: 'edit',
        activePack: bundle,
        activeItems: loaded.items.map((it, idx) => cloneShotItem(it, idx)),
        committedSessionItems: loaded.items.map((it, idx) => cloneShotItem(it, idx)),
        currentShotIndex: 0,
        isEditingItem: false,
        isEdgeInspectorExpanded: true,
        activeEditItemDraft: null,
        isFreeCamTrajectoryTesting: false,
        isTestingSingleShot: false,
      });
      floatingStore.triggerBatchMinimize();
      readStoreState().runtimeHandlers.onSessionModeChanged?.('edit');
    },

    saveCurrentShotToEditWorkspace: async () => {
      const { activePack, activeItems, currentShotIndex, isEditingItem, storageScope } =
        readStoreState();
      const draft = getActiveEditItemVariable() || readStoreState().activeEditItemDraft;
      if (!isEditingItem || !activePack || !draft) return;

      const idx = Math.max(0, Math.min(activeItems.length - 1, currentShotIndex));
      const savedShot = cloneShotItem(draft, idx);
      setActiveEditItemVariable(cloneShotItem(savedShot, idx));
      const nextItems = activeItems.map((it, i) => (i === idx ? savedShot : it));
      const updatedMeta: StaticTrainingPackMetadata = {
        ...activePack.metadata,
        itemCount: nextItems.length,
        updatedAt: Date.now(),
      };

      await saveSingleEditWorkspaceShotItem(
        activePack.uuid,
        idx,
        savedShot,
        updatedMeta,
        storageScope
      );
      const bundle = buildActivePackBundle(updatedMeta, nextItems);

      updateStoreState((s) => ({
        activePack: bundle,
        activeItems: nextItems,
        activeEditItemDraft: cloneShotItem(savedShot, idx),
        editVarVersion: s.editVarVersion + 1,
      }));
    },

    deselectEditShot: async () => {
      if (readStoreState().isCurrentShotDirty()) {
        await readStoreState().saveCurrentShotToEditWorkspace();
      }
      setActiveEditItemVariable(null);
      updateStoreState((s) => ({
        isEditingItem: false,
        activeEditItemDraft: null,
        editVarVersion: s.editVarVersion + 1,
      }));
    },

    isCurrentShotDirty: () => {
      const { isEditingItem, activeEditItemDraft, activeItems, currentShotIndex } =
        readStoreState();
      const draft = getActiveEditItemVariable() || activeEditItemDraft;
      if (!isEditingItem || !draft) return false;
      const saved = activeItems[currentShotIndex];
      if (!saved) return true;
      return !areShotItemsEqual(draft, saved);
    },

    hasUnsavedEditSessionChanges: () => {
      const {
        activeItems,
        committedSessionItems,
        isEditingItem,
        activeEditItemDraft,
        currentShotIndex,
      } = readStoreState();
      const draft = getActiveEditItemVariable() || activeEditItemDraft;
      const effectiveItems =
        isEditingItem && draft
          ? activeItems.map((it, i) => (i === currentShotIndex ? cloneShotItem(draft, i) : it))
          : activeItems;
      return !areShotListsEqual(effectiveItems, committedSessionItems);
    },

    commitEditSessionToMainDb: async () => {
      const {
        activePack,
        activeItems,
        isEditingItem,
        activeEditItemDraft,
        currentShotIndex,
        storageScope,
      } = readStoreState();
      if (!activePack) return;
      const draft = getActiveEditItemVariable() || activeEditItemDraft;
      const finalItems = (
        isEditingItem && draft
          ? activeItems.map((it, i) => (i === currentShotIndex ? cloneShotItem(draft, i) : it))
          : activeItems
      )
        .slice(0, MAX_SHOTS_PER_PACK)
        .map((it, idx) => cloneShotItem(it, idx));

      const updatedMeta: StaticTrainingPackMetadata = {
        ...activePack.metadata,
        itemCount: finalItems.length,
        updatedAt: Date.now(),
      };

      await saveStaticTrainingPackFull(updatedMeta, finalItems, storageScope);
      await clearEditWorkspaceByUuid(activePack.uuid, storageScope);
      const packs = await listStaticTrainingPacks(storageScope);
      const bundle = buildActivePackBundle(updatedMeta, finalItems);

      setActiveEditItemVariable(null);
      updateStoreState((state) => ({
        ...buildScopePackStatePatch(storageScope, packs, activePack.uuid, true),
        sessionMode: 'play',
        activePack: bundle,
        activeItems: finalItems,
        committedSessionItems: finalItems.map((item, idx) => cloneShotItem(item, idx)),
        isEditingItem: false,
        activeEditItemDraft: null,
        isFreeCamTrajectoryTesting: false,
        isTestingSingleShot: false,
        editVarVersion: state.editVarVersion + 1,
      }));
      readStoreState().runtimeHandlers.onSessionModeChanged?.('play');
    },

    discardEditSessionChanges: async () => {
      const { activePack, storageScope } = readStoreState();
      if (!activePack) return;
      await clearEditWorkspaceByUuid(activePack.uuid, storageScope);
      const loaded = await loadStaticTrainingPackByUuid(activePack.uuid, storageScope);
      const bundle = buildActivePackBundle(loaded.metadata, loaded.items);
      setActiveEditItemVariable(null);
      updateStoreState((state) => ({
        sessionMode: 'play',
        activePack: bundle,
        activeItems: loaded.items,
        committedSessionItems: loaded.items.map((item, idx) => cloneShotItem(item, idx)),
        currentShotIndex: 0,
        isEditingItem: false,
        activeEditItemDraft: null,
        isFreeCamTrajectoryTesting: false,
        isTestingSingleShot: false,
        editVarVersion: state.editVarVersion + 1,
      }));
      readStoreState().runtimeHandlers.onSessionModeChanged?.('play');
    },

    ...createStaticTrainingPackIoActions(updateStoreState, readStoreState, helpers),
  };
}
