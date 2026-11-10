/**
 * staticTrainingPackIoActions.ts
 * Pack CRUD, tag management, RCSPack / ZIP import & export, built-in dev seeding,
 * and converted TEM bundle ingestion for `staticTrainingPackStore`.
 */

import {
  type EditSubMode,
  type ExportRCSPackOptions,
  type StaticTrainingPackMetadata,
  type StaticTrainingPackStorageScope,
  type StaticTrainingShotItem,
  deleteStaticTrainingPackByUuid,
  ensureBuiltInDevPacksSeeded,
  importBatchStaticTrainingPacksFromFiles,
  importStaticTrainingPackFromFile,
  listStaticTrainingPacks,
  loadStaticTrainingPackByUuid,
  saveStaticTrainingPackFull,
} from './staticTrainingPackStorage';
import { MAX_SHOTS_PER_PACK, cloneShotItem, createDefaultShotItem, generateUUID } from '../config/staticTrainingPackTypes';
import { exportBatchStaticTrainingPacksZip, exportStaticTrainingPackRCSPack } from '../config/staticTrainingPackCodec';

export type StaticPackDownCounterOption = 1 | 2 | 3;
export type StaticPackSessionMode = 'browse' | 'play' | 'edit';

export interface ActiveStaticTrainingPackBundle {
  uuid: string;
  title: string;
  description: string;
  itemCount: number;
  metadata: StaticTrainingPackMetadata;
  items: StaticTrainingShotItem[];
}

export interface StaticTrainingPackRuntimeHandlers {
  onShotChanged?: (shotIndex: number) => void;
  onResetShotRequested?: () => void;
  onEditVariableMutated?: (draft: StaticTrainingShotItem) => void;
  onEditSubModeChanged?: (subMode: EditSubMode) => void;
  onSessionModeChanged?: (mode: StaticPackSessionMode) => void;
}

export interface StaticTrainingShotActionHelpers {
  getActiveEditItemVariable: () => StaticTrainingShotItem | null;
  setActiveEditItemVariable: (item: StaticTrainingShotItem | null) => void;
  buildActivePackBundle: (
    metadata: StaticTrainingPackMetadata | null,
    items: StaticTrainingShotItem[]
  ) => ActiveStaticTrainingPackBundle | null;
}

export interface StaticTrainingShotStoreState {
  initialized: boolean;
  devInitialized: boolean;
  isLoading: boolean;
  storageScope: StaticTrainingPackStorageScope;
  packs: StaticTrainingPackMetadata[];
  normalPacks: StaticTrainingPackMetadata[];
  devPacks: StaticTrainingPackMetadata[];
  selectedPackUuid: string | null;
  normalSelectedPackUuid: string | null;
  devSelectedPackUuid: string | null;
  sessionMode: StaticPackSessionMode;
  activePack: ActiveStaticTrainingPackBundle | null;
  activeItems: StaticTrainingShotItem[];
  committedSessionItems: StaticTrainingShotItem[];
  currentShotIndex: number;
  isEditingItem: boolean;
  isEdgeInspectorExpanded: boolean;
  activeEditItemDraft: StaticTrainingShotItem | null;
  editSubMode: EditSubMode;
  editVarVersion: number;
  remainingTimeoutSec: number;
  isFreeCamTrajectoryTesting: boolean;
  isTestingSingleShot: boolean;
  isShotMirrored?: boolean;
  runtimeHandlers: StaticTrainingPackRuntimeHandlers;
  setCurrentShotIndex: (index: number) => void;
  isCurrentShotDirty: () => boolean;
  saveCurrentShotToEditWorkspace: () => Promise<void>;
}

export function buildScopePackStatePatch(
  scope: StaticTrainingPackStorageScope,
  packs: StaticTrainingPackMetadata[],
  selectedUuid: string | null,
  isActiveScope: boolean
): Partial<StaticTrainingShotStoreState> {
  return {
    ...(scope === 'dev'
      ? { devPacks: packs, devSelectedPackUuid: selectedUuid }
      : { normalPacks: packs, normalSelectedPackUuid: selectedUuid }),
    ...(isActiveScope ? { packs, selectedPackUuid: selectedUuid } : {}),
  };
}

export function createStaticTrainingPackIoActions<TState extends StaticTrainingShotStoreState>(
  updateStoreState: (
    partial:
      | Partial<StaticTrainingShotStoreState>
      | ((state: TState) => Partial<StaticTrainingShotStoreState>)
  ) => void,
  readStoreState: () => TState,
  helpers: StaticTrainingShotActionHelpers
) {
  const { setActiveEditItemVariable, buildActivePackBundle } = helpers;

  return {
    createPack: async (
      title: string,
      description: string,
      scope: StaticTrainingPackStorageScope = readStoreState().storageScope
    ) => {
      const now = Date.now();
      const uuid = generateUUID();
      const initialShot = createDefaultShotItem(0);
      const meta: StaticTrainingPackMetadata = {
        uuid,
        title: (title || 'New Static Pack').trim() || 'New Static Pack',
        description: (description || '').trim(),
        tags: ['Native'],
        sourcePackType: 'RCSPackE',
        createdAt: now,
        updatedAt: now,
        itemCount: 1,
      };
      await saveStaticTrainingPackFull(meta, [initialShot], scope);
      const packs = await listStaticTrainingPacks(scope);
      const bundle = buildActivePackBundle(meta, [initialShot]);
      setActiveEditItemVariable(null);
      updateStoreState({
        ...buildScopePackStatePatch(scope, packs, uuid, readStoreState().storageScope === scope),
        activePack: bundle,
        activeItems: [initialShot],
        committedSessionItems: [cloneShotItem(initialShot, 0)],
        currentShotIndex: 0,
        isEditingItem: false,
        activeEditItemDraft: null,
      });
      return meta;
    },

    updatePackInfo: async (
      uuid: string,
      title: string,
      description: string,
      scope: StaticTrainingPackStorageScope = readStoreState().storageScope
    ) => {
      const loaded = await loadStaticTrainingPackByUuid(uuid, scope);
      if (!loaded.metadata) return;
      const updatedMeta: StaticTrainingPackMetadata = {
        ...loaded.metadata,
        title,
        description,
        updatedAt: Date.now(),
      };
      await saveStaticTrainingPackFull(updatedMeta, loaded.items, scope);
      const packs = await listStaticTrainingPacks(scope);
      const selectedUuid =
        scope === 'dev'
          ? readStoreState().devSelectedPackUuid
          : readStoreState().normalSelectedPackUuid;
      updateStoreState((state) => ({
        ...buildScopePackStatePatch(scope, packs, selectedUuid, state.storageScope === scope),
        activePack:
          state.activePack?.uuid === uuid
            ? buildActivePackBundle(updatedMeta, state.activeItems)
            : state.activePack,
      }));
    },

    updatePackTags: async (
      uuid: string,
      tags: string[],
      scope: StaticTrainingPackStorageScope = readStoreState().storageScope
    ) => {
      const loaded = await loadStaticTrainingPackByUuid(uuid, scope);
      if (!loaded.metadata) return;
      const cleanTags = Array.from(new Set(tags.map((t) => t.trim()).filter(Boolean)));
      const rankSet = new Set([
        'progression',
        'ssl',
        'gc',
        'champion',
        'diamond',
        'platinum',
        'gold',
        'silver',
        'bronze',
      ]);
      const matchedRankTag = cleanTags.find((t) => rankSet.has(t.toLowerCase()));
      const updatedMeta: StaticTrainingPackMetadata = {
        ...loaded.metadata,
        tags: cleanTags,
        rankTier: matchedRankTag,
        updatedAt: Date.now(),
      };
      if (!matchedRankTag) delete updatedMeta.rankTier;
      await saveStaticTrainingPackFull(updatedMeta, loaded.items, scope);
      const packs = await listStaticTrainingPacks(scope);
      const selectedUuid =
        scope === 'dev'
          ? readStoreState().devSelectedPackUuid
          : readStoreState().normalSelectedPackUuid;
      updateStoreState((state) => ({
        ...buildScopePackStatePatch(scope, packs, selectedUuid, state.storageScope === scope),
        activePack:
          state.activePack?.uuid === uuid
            ? buildActivePackBundle(updatedMeta, state.activeItems)
            : state.activePack,
      }));
    },

    deletePack: async (
      uuid: string,
      scope: StaticTrainingPackStorageScope = readStoreState().storageScope
    ) => {
      if (readStoreState().isEditingItem && readStoreState().activePack?.uuid === uuid) {
        setActiveEditItemVariable(null);
        updateStoreState({ isEditingItem: false, activeEditItemDraft: null });
      }
      await deleteStaticTrainingPackByUuid(uuid, scope);
      const packs = await listStaticTrainingPacks(scope);
      const nextUuid = packs[0]?.uuid ?? null;
      let nextActivePack: ActiveStaticTrainingPackBundle | null = null;
      let nextActiveItems: StaticTrainingShotItem[] = [];
      if (nextUuid) {
        const loaded = await loadStaticTrainingPackByUuid(nextUuid, scope);
        nextActiveItems = loaded.items;
        nextActivePack = buildActivePackBundle(loaded.metadata, loaded.items);
      }
      updateStoreState({
        ...buildScopePackStatePatch(scope, packs, nextUuid, readStoreState().storageScope === scope),
        activePack: nextActivePack,
        activeItems: nextActiveItems,
        committedSessionItems: nextActiveItems.map((item, idx) => cloneShotItem(item, idx)),
        currentShotIndex: 0,
      });
    },

    exportPackRCS: async (
      uuid?: string,
      options?: ExportRCSPackOptions,
      scope: StaticTrainingPackStorageScope = readStoreState().storageScope
    ) => {
      const targetUuid =
        uuid || readStoreState().activePack?.uuid || readStoreState().selectedPackUuid;
      if (!targetUuid) return null;
      const loaded = await loadStaticTrainingPackByUuid(targetUuid, scope);
      if (!loaded.metadata) return null;
      return await exportStaticTrainingPackRCSPack(loaded.metadata, loaded.items, options);
    },

    exportBatchPacksZip: async (
      uuids: string[],
      bundleName = 'TrainingPacks',
      options?: ExportRCSPackOptions,
      scope: StaticTrainingPackStorageScope = readStoreState().storageScope
    ) => {
      const loadedList: Array<{
        metadata: StaticTrainingPackMetadata;
        items: StaticTrainingShotItem[];
      }> = [];
      for (const uuid of uuids) {
        const loaded = await loadStaticTrainingPackByUuid(uuid, scope);
        if (loaded.metadata) loadedList.push({ metadata: loaded.metadata, items: loaded.items });
      }
      if (loadedList.length === 0) return null;
      return await exportBatchStaticTrainingPacksZip(loadedList, bundleName, options);
    },

    importPackRCS: async (
      file: File,
      scope: StaticTrainingPackStorageScope = readStoreState().storageScope
    ) => {
      const metas = await importBatchStaticTrainingPacksFromFiles([file], scope);
      if (metas.length === 0) {
        const single = await importStaticTrainingPackFromFile(file, scope);
        metas.push(single.metadata);
      }
      const targetMeta = metas[0];
      const loaded = await loadStaticTrainingPackByUuid(targetMeta.uuid, scope);
      const packs = await listStaticTrainingPacks(scope);
      setActiveEditItemVariable(null);
      updateStoreState({
        ...buildScopePackStatePatch(
          scope,
          packs,
          targetMeta.uuid,
          readStoreState().storageScope === scope
        ),
        activePack: buildActivePackBundle(loaded.metadata || targetMeta, loaded.items),
        activeItems: loaded.items,
        committedSessionItems: loaded.items.map((item, idx) => cloneShotItem(item, idx)),
        currentShotIndex: 0,
        isEditingItem: false,
        activeEditItemDraft: null,
      });
      return targetMeta;
    },

    importBatchPacks: async (
      files: File[] | FileList,
      scope: StaticTrainingPackStorageScope = readStoreState().storageScope
    ) => {
      const metas = await importBatchStaticTrainingPacksFromFiles(files, scope);
      if (metas.length === 0) return [];
      const targetMeta = metas[0];
      const loaded = await loadStaticTrainingPackByUuid(targetMeta.uuid, scope);
      const packs = await listStaticTrainingPacks(scope);
      setActiveEditItemVariable(null);
      updateStoreState({
        ...buildScopePackStatePatch(
          scope,
          packs,
          targetMeta.uuid,
          readStoreState().storageScope === scope
        ),
        activePack: buildActivePackBundle(loaded.metadata || targetMeta, loaded.items),
        activeItems: loaded.items,
        committedSessionItems: loaded.items.map((item, idx) => cloneShotItem(item, idx)),
        currentShotIndex: 0,
        isEditingItem: false,
        activeEditItemDraft: null,
      });
      return metas;
    },

    seedDevBuiltInPacks: async (forceReseed = false) => {
      const seededCount = await ensureBuiltInDevPacksSeeded(forceReseed);
      if (seededCount > 0 || forceReseed || !readStoreState().devInitialized) {
        const packs = await listStaticTrainingPacks('dev');
        const currentSelected = readStoreState().devSelectedPackUuid;
        const validSelected =
          currentSelected && packs.some((p) => p.uuid === currentSelected)
            ? currentSelected
            : packs[0]?.uuid ?? null;
        const isDevActive = readStoreState().storageScope === 'dev';
        let activePack = readStoreState().activePack;
        let activeItems = readStoreState().activeItems;
        if (isDevActive && validSelected && (!activePack || activePack.uuid !== validSelected)) {
          const loaded = await loadStaticTrainingPackByUuid(validSelected, 'dev');
          activeItems = loaded.items;
          activePack = buildActivePackBundle(loaded.metadata, loaded.items);
        }
        updateStoreState({
          devInitialized: true,
          ...buildScopePackStatePatch('dev', packs, validSelected, isDevActive),
          ...(isDevActive
            ? {
                activePack,
                activeItems,
                committedSessionItems: activeItems.map((it, idx) => cloneShotItem(it, idx)),
              }
            : {}),
        });
      }
      return seededCount;
    },

    importConvertedTemBundle: async (
      metadata: StaticTrainingPackMetadata,
      items: StaticTrainingShotItem[],
      scope: StaticTrainingPackStorageScope = 'dev'
    ) => {
      const normalizedItems = (items.length > 0 ? items : [createDefaultShotItem(0)])
        .slice(0, MAX_SHOTS_PER_PACK)
        .map((it, idx) => cloneShotItem(it, idx));
      const finalMeta: StaticTrainingPackMetadata = {
        ...metadata,
        itemCount: normalizedItems.length,
        updatedAt: Date.now(),
      };
      await saveStaticTrainingPackFull(finalMeta, normalizedItems, scope);
      const packs = await listStaticTrainingPacks(scope);
      setActiveEditItemVariable(null);
      updateStoreState({
        ...buildScopePackStatePatch(
          scope,
          packs,
          finalMeta.uuid,
          readStoreState().storageScope === scope
        ),
        activePack: buildActivePackBundle(finalMeta, normalizedItems),
        activeItems: normalizedItems,
        committedSessionItems: normalizedItems.map((item, idx) => cloneShotItem(item, idx)),
        currentShotIndex: 0,
        isEditingItem: false,
        activeEditItemDraft: null,
      });
      return finalMeta;
    },
  };
}
