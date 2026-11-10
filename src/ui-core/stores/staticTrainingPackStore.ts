import { createStaticTrainingShotActions } from './staticTrainingShotActions';
import { create } from 'zustand';
import { type StaticTrainingPackMetadata, type StaticTrainingShotItem, type EditSubMode, type ExportRCSPackOptions, type StaticTrainingPackStorageScope } from './staticTrainingPackStorage';
import { EDIT_SUB_MODES_ORDER, cloneShotItem } from '../config/staticTrainingPackTypes';
import { type StaticTrainingVariationConfig, type StaticTrainingQuickVariationToggles, type KevpertPresetKey, DEFAULT_QUICK_VARIATION_TOGGLES, cloneVariationConfig } from '../config/staticTrainingVariationTypes';
import { KEVPERT_LATEST_PRESETS } from '../config/kevpertVariationPresets';

export type { StaticTrainingPackMetadata, StaticTrainingShotItem, EditSubMode, ExportRCSPackOptions, StaticTrainingPackStorageScope, StaticTrainingVariationConfig, StaticTrainingQuickVariationToggles, KevpertPresetKey };
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

/**
 * Fast in-memory variable holding the active shot item during Item Edit Mode.
 * Mutated directly at 60-120Hz during keyboard/mouse manipulation.
 */
let activeEditItemVariable: StaticTrainingShotItem | null = null;

export function getActiveEditItemVariable(): StaticTrainingShotItem | null {
  return activeEditItemVariable;
}

export function setActiveEditItemVariable(item: StaticTrainingShotItem | null): void {
  activeEditItemVariable = item;
}

export function mutateActiveEditItemVariable(
  updater: (draft: StaticTrainingShotItem) => void
): StaticTrainingShotItem | null {
  const store = useStaticTrainingPackStore.getState();
  if (!activeEditItemVariable) {
    const items = store.activePack?.items || store.activeItems || [];
    const fallback = items[store.currentShotIndex] || items[0];
    if (!fallback) return null;
    activeEditItemVariable = cloneShotItem(fallback, store.currentShotIndex);
  }
  updater(activeEditItemVariable);
  const clonedDraft = cloneShotItem(activeEditItemVariable, store.currentShotIndex);
  activeEditItemVariable = clonedDraft;
  useStaticTrainingPackStore.setState((state) => ({
    editVarVersion: state.editVarVersion + 1,
    activeEditItemDraft: clonedDraft,
  }));
  const handlers = store.runtimeHandlers;
  handlers.onEditVariableMutated?.(clonedDraft);
  return clonedDraft;
}

function createGuardedRuntimeHandlers<T extends object>(storeTag: string, rawHandlers: T): T {
  return new Proxy(rawHandlers, {
    get(target, prop, receiver) {
      const val = Reflect.get(target, prop, receiver);
      if (typeof val === 'function') {
        return val;
      }
      if (typeof prop === 'string' && prop.startsWith('on')) {
        return (..._args: unknown[]) => {
          console.warn(
            `[${storeTag}] Runtime handler "${prop}" was invoked before StaticTrainingPackMode registered its handlers.`
          );
        };
      }
      return val;
    },
  });
}

export function buildActivePackBundle(
  metadata: StaticTrainingPackMetadata | null,
  items: StaticTrainingShotItem[]
): ActiveStaticTrainingPackBundle | null {
  if (!metadata) return null;
  return {
    uuid: metadata.uuid,
    title: metadata.title,
    description: metadata.description,
    itemCount: items.length,
    metadata: { ...metadata, itemCount: items.length },
    items,
  };
}

export interface StaticTrainingPackRuntimeHandlers {
  onShotChanged?: (shotIndex: number) => void;
  onResetShotRequested?: () => void;
  onEditVariableMutated?: (draft: StaticTrainingShotItem) => void;
  onEditSubModeChanged?: (subMode: EditSubMode) => void;
  onSessionModeChanged?: (mode: StaticPackSessionMode) => void;
}

export interface StaticTrainingPackStoreState {
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

  downCounterEnabled: boolean;
  downCounterValue: StaticPackDownCounterOption;

  /** Training Variations (Experimental Dev Feature) */
  variationToggles: StaticTrainingQuickVariationToggles;
  customVariation: StaticTrainingVariationConfig;

  remainingTimeoutSec: number;
  activeCountdownSec: number;
  isShotLaunched: boolean;
  isOvertimeWaitGround: boolean;
  isReplayActive: boolean;
  replayType: 'goal' | 'expire' | null;
  isFreeCamTrajectoryTesting: boolean;
  isTestingSingleShot: boolean;
  isShotMirrored: boolean;

  runtimeHandlers: StaticTrainingPackRuntimeHandlers;

  initStore: (scope?: StaticTrainingPackStorageScope) => Promise<void>;
  setStorageScope: (scope: StaticTrainingPackStorageScope) => Promise<void>;
  selectPack: (uuid: string, scope?: StaticTrainingPackStorageScope) => Promise<void>;
  createPack: (
    title: string,
    description: string,
    scope?: StaticTrainingPackStorageScope
  ) => Promise<StaticTrainingPackMetadata>;
  updatePackInfo: (
    uuid: string,
    title: string,
    description: string,
    scope?: StaticTrainingPackStorageScope
  ) => Promise<void>;
  updatePackTags: (
    uuid: string,
    tags: string[],
    scope?: StaticTrainingPackStorageScope
  ) => Promise<void>;
  deletePack: (uuid: string, scope?: StaticTrainingPackStorageScope) => Promise<void>;
  exportPackRCS: (
    uuid?: string,
    options?: ExportRCSPackOptions,
    scope?: StaticTrainingPackStorageScope
  ) => Promise<string | null>;
  exportBatchPacksZip: (
    uuids: string[],
    bundleName?: string,
    options?: ExportRCSPackOptions,
    scope?: StaticTrainingPackStorageScope
  ) => Promise<string | null>;
  importPackRCS: (
    file: File,
    scope?: StaticTrainingPackStorageScope
  ) => Promise<StaticTrainingPackMetadata>;
  importBatchPacks: (
    files: File[] | FileList,
    scope?: StaticTrainingPackStorageScope
  ) => Promise<StaticTrainingPackMetadata[]>;
  seedDevBuiltInPacks: (forceReseed?: boolean) => Promise<number>;
  importConvertedTemBundle: (
    metadata: StaticTrainingPackMetadata,
    items: StaticTrainingShotItem[]
  ) => Promise<StaticTrainingPackMetadata>;

  setVariationToggles: (patch: Partial<StaticTrainingQuickVariationToggles>) => void;
  setCustomVariation: (patch: Partial<StaticTrainingVariationConfig>) => void;
  applyKevpertVariationPreset: (key: KevpertPresetKey) => void;

  setSessionMode: (mode: StaticPackSessionMode) => void;
  setEdgeInspectorExpanded: (expanded: boolean) => void;
  toggleEdgeInspectorExpanded: () => void;
  beginEditSession: (uuid: string, scope?: StaticTrainingPackStorageScope) => Promise<void>;
  saveCurrentShotToEditWorkspace: () => Promise<void>;
  deselectEditShot: () => Promise<void>;
  isCurrentShotDirty: () => boolean;
  hasUnsavedEditSessionChanges: () => boolean;
  commitEditSessionToMainDb: () => Promise<void>;
  discardEditSessionChanges: () => Promise<void>;

  setCurrentShotIndex: (index: number) => void;
  nextShot: () => void;
  prevShot: () => void;
  resetCurrentShot: () => void;

  addNewShot: () => Promise<void>;
  duplicateShot: (index: number) => Promise<void>;
  deleteShot: (index: number) => Promise<void>;
  reorderShot: (fromIndex: number, toIndex: number) => Promise<void>;

  enterItemEditMode: (index?: number) => void;
  exportSingleShotJson: (index?: number) => string | null;
  importSingleShotJson: (file: File, index?: number) => Promise<void>;

  setEditSubMode: (subMode: EditSubMode) => void;
  cycleEditSubMode: (delta: 1 | -1) => EditSubMode;

  setDownCounterEnabled: (enabled: boolean) => void;
  setDownCounterValue: (val: StaticPackDownCounterOption) => void;
  setFreeCamTrajectoryTesting: (active: boolean) => void;
  setTestingSingleShot: (active: boolean) => void;
  setShotMirrored: (mirrored: boolean) => void;
  toggleShotMirror: () => void;
  updateLiveTelemetry: (
    patch: Partial<{
      remainingTimeoutSec: number;
      activeCountdownSec: number;
      isShotLaunched: boolean;
      isOvertimeWaitGround: boolean;
      isReplayActive: boolean;
      replayType: 'goal' | 'expire' | null;
      isFreeCamTrajectoryTesting: boolean;
      isTestingSingleShot: boolean;
    }>
  ) => void;
  setRuntimeHandlers: (handlers: Partial<StaticTrainingPackRuntimeHandlers>) => void;
}

export const useStaticTrainingPackStore = create<StaticTrainingPackStoreState>((set, get) => ({
  initialized: false,
  devInitialized: false,
  isLoading: false,
  storageScope: 'normal',
  packs: [],
  normalPacks: [],
  devPacks: [],
  selectedPackUuid: null,
  normalSelectedPackUuid: null,
  devSelectedPackUuid: null,

  sessionMode: 'play',
  activePack: null,
  activeItems: [],
  committedSessionItems: [],
  currentShotIndex: 0,

  isEditingItem: false,
  isEdgeInspectorExpanded: true,
  activeEditItemDraft: null,
  editSubMode: 'car-heading',
  editVarVersion: 0,

  downCounterEnabled: false,
  downCounterValue: 1,

  variationToggles: { ...DEFAULT_QUICK_VARIATION_TOGGLES },
  customVariation: cloneVariationConfig(KEVPERT_LATEST_PRESETS.F7),

  remainingTimeoutSec: 10,
  activeCountdownSec: 0,
  isShotLaunched: false,
  isOvertimeWaitGround: false,
  isReplayActive: false,
  replayType: null,
  isFreeCamTrajectoryTesting: false,
  isTestingSingleShot: false,
  isShotMirrored: false,

  runtimeHandlers: createGuardedRuntimeHandlers<StaticTrainingPackRuntimeHandlers>(
    'staticTrainingPackStore',
    {}
  ),

  ...createStaticTrainingShotActions(set, get, {
    getActiveEditItemVariable,
    setActiveEditItemVariable,
    buildActivePackBundle,
  }),

  setEditSubMode: (subMode: EditSubMode) => {
    set({ editSubMode: subMode });
    get().runtimeHandlers.onEditSubModeChanged?.(subMode);
  },

  cycleEditSubMode: (delta: 1 | -1) => {
    const currentSubMode = get().editSubMode;
    const currentItem =
      activeEditItemVariable ||
      get().activeEditItemDraft ||
      get().activePack?.items?.[get().currentShotIndex] ||
      get().activeItems?.[get().currentShotIndex];
    const alignsSpeedWithNose = currentItem?.car?.speedFollowsHeading !== false;
    const order: EditSubMode[] = alignsSpeedWithNose
      ? ['car-heading', 'ball-speed', 'free-cam']
      : EDIT_SUB_MODES_ORDER;
    const currentIndex = order.indexOf(currentSubMode);
    const baseIdx = currentIndex >= 0 ? currentIndex : 0;
    const nextIdx = ((baseIdx + delta) % order.length + order.length) % order.length;
    const nextMode = order[nextIdx];
    set({ editSubMode: nextMode });
    get().runtimeHandlers.onEditSubModeChanged?.(nextMode);
    return nextMode;
  },

  setDownCounterEnabled: (enabled: boolean) => {
    set({ downCounterEnabled: Boolean(enabled) });
    if (get().sessionMode === 'play') {
      get().resetCurrentShot();
    }
  },

  setDownCounterValue: (val: StaticPackDownCounterOption) => {
    const clamped = (val === 1 || val === 2 || val === 3 ? val : 1) as StaticPackDownCounterOption;
    set({ downCounterValue: clamped });
    if (get().sessionMode === 'play' && get().downCounterEnabled) {
      get().resetCurrentShot();
    }
  },

  setVariationToggles: (patch) => {
    set((state) => ({
      variationToggles: {
        ...state.variationToggles,
        ...patch,
      },
      ...(patch.enableFToMirror === false ? { isShotMirrored: false } : {}),
    }));
    if (get().sessionMode === 'play') {
      get().resetCurrentShot();
    }
  },

  setCustomVariation: (patch) => {
    set((state) => ({
      customVariation: cloneVariationConfig({
        ...state.customVariation,
        ...patch,
        presetKey: patch.presetKey ?? 'CUSTOM',
      }),
    }));
    if (get().sessionMode === 'play' && get().variationToggles.enableCustomVariationOverride) {
      get().resetCurrentShot();
    }
  },

  applyKevpertVariationPreset: (key: KevpertPresetKey) => {
    const preset = KEVPERT_LATEST_PRESETS[key];
    if (!preset) return;
    set((state) => ({
      variationToggles: {
        ...state.variationToggles,
        enableCustomVariationOverride: true,
      },
      customVariation: cloneVariationConfig(preset),
    }));
    if (get().sessionMode === 'play') {
      get().resetCurrentShot();
    }
  },

  setFreeCamTrajectoryTesting: (active: boolean) => {
    set({ isFreeCamTrajectoryTesting: Boolean(active) });
  },

  setTestingSingleShot: (active: boolean) => {
    set({ isTestingSingleShot: Boolean(active) });
  },

  setShotMirrored: (mirrored: boolean) => {
    set({ isShotMirrored: Boolean(mirrored) });
  },

  toggleShotMirror: () => {
    if (get().variationToggles.enableFToMirror === false) return;
    set((state) => ({ isShotMirrored: !state.isShotMirrored }));
    get().resetCurrentShot();
  },

  updateLiveTelemetry: (patch) => {
    set((state) => ({ ...state, ...patch }));
  },

  setRuntimeHandlers: (handlers) => {
    set((s) => ({
      runtimeHandlers: createGuardedRuntimeHandlers<StaticTrainingPackRuntimeHandlers>(
        'staticTrainingPackStore',
        { ...s.runtimeHandlers, ...handlers }
      ),
    }));
  },
}));
