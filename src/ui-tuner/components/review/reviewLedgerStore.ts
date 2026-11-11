import { create } from 'zustand';
import { UI_APPROVAL_LEDGER } from '../../../ui-core/manifest/surfaceCalibration';
import type { SurfaceApprovalStatus } from '../../../ui-core/manifest/surfaceMetaTypes';
import type { UnifiedPlaylistScope } from '../../pages/menu-layer/menuLayerLinearPlaylists';
import { buildApprovalMessageWithDiffs } from './exportDiffAndSizeTiering';
import {
  buildAllReviewUnits,
  buildUnitKey,
  extractAlphaMotherDeps,
  findUnitIndexByKeyOrSurface,
} from './reviewLedgerAdapter';
import type {
  ReviewStaleReason,
  ReviewTriageBucketId,
  RuntimeReviewDecision,
  SurfaceVariantReviewUnit,
} from './reviewTypes';

const STORAGE_KEY = 'rc_ui_tuner_review_ledger_v1';

interface PersistedReviewState {
  decisionsMap: Record<string, RuntimeReviewDecision>;
  activeBucketFilter: 'all' | ReviewTriageBucketId;
  simulateTemplateStale: boolean;
}

function loadPersistedState(): PersistedReviewState {
  if (typeof window === 'undefined') {
    return {
      decisionsMap: {},
      activeBucketFilter: 'all',
      simulateTemplateStale: false,
    };
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return {
        decisionsMap: {},
        activeBucketFilter: 'all',
        simulateTemplateStale: false,
      };
    }
    const parsed = JSON.parse(raw) as Partial<PersistedReviewState>;
    return {
      decisionsMap:
        parsed.decisionsMap && typeof parsed.decisionsMap === 'object'
          ? parsed.decisionsMap
          : {},
      activeBucketFilter: parsed.activeBucketFilter || 'all',
      simulateTemplateStale: Boolean(parsed.simulateTemplateStale),
    };
  } catch {
    return {
      decisionsMap: {},
      activeBucketFilter: 'all',
      simulateTemplateStale: false,
    };
  }
}

function savePersistedState(state: PersistedReviewState): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore storage quota errors
  }
}

export interface RegisterReviewUnitMetadata {
  surfaceId: string;
  variantId?: string;
  label: string;
  referenceCode: string;
  componentName: string;
  sourceFile: string;
  subViewFile?: string;
}

export interface ReviewLedgerStoreState {
  decisionsMap: Record<string, RuntimeReviewDecision>;
  registeredUnitsMap: Record<
    string,
    Omit<
      SurfaceVariantReviewUnit,
      'status' | 'bucket' | 'staleReason' | 'note' | 'updatedAt'
    >
  >;
  activeUnitKey: string;
  playlistScope: UnifiedPlaylistScope;
  navigationSeq: number;
  activeBucketFilter: 'all' | ReviewTriageBucketId;
  simulateTemplateStale: boolean;
  isExporterModalOpen: boolean;

  setActiveUnit: (meta: RegisterReviewUnitMetadata) => void;
  setPlaylistScope: (scope: UnifiedPlaylistScope) => void;
  selectUnitByKey: (unitKey: string) => void;
  setBucketFilter: (bucket: 'all' | ReviewTriageBucketId) => void;
  setDecision: (params: {
    unitKey?: string;
    status: SurfaceApprovalStatus;
    note?: string;
    simulatedStaleReason?: ReviewStaleReason;
    advanceToNext?: boolean;
  }) => SurfaceVariantReviewUnit | null;
  updateNote: (unitKey: string, note: string) => void;
  stepQueue: (delta: 1 | -1) => SurfaceVariantReviewUnit | null;
  batchApproveTemplateStale: () => number;
  setSimulateTemplateStale: (enabled: boolean) => void;
  setExporterModalOpen: (open: boolean) => void;
  resetRuntimeDecisions: () => void;
}

const initialPersisted = loadPersistedState();

export const useReviewLedgerStore = create<ReviewLedgerStoreState>((set, get) => ({
  decisionsMap: initialPersisted.decisionsMap,
  registeredUnitsMap: {},
  activeUnitKey: 'recipe:StaticTrainingShotInspectorDrawer::user-l0',
  playlistScope: 'all',
  navigationSeq: 0,
  activeBucketFilter: initialPersisted.activeBucketFilter,
  simulateTemplateStale: initialPersisted.simulateTemplateStale,
  isExporterModalOpen: false,

  setActiveUnit: (meta) => {
    const variantId = meta.variantId?.trim() || 'default';
    const unitKey = buildUnitKey(meta.surfaceId, variantId);
    const ledgerRecord = UI_APPROVAL_LEDGER.surfaces[meta.surfaceId];

    set((state) => {
      const existing = state.registeredUnitsMap[unitKey];
      const isSame =
        existing &&
        existing.label === meta.label &&
        existing.referenceCode === meta.referenceCode &&
        existing.sourceFile === meta.sourceFile &&
        existing.subViewFile === meta.subViewFile &&
        state.activeUnitKey === unitKey;

      if (isSame) return state;

      return {
        activeUnitKey: unitKey,
        registeredUnitsMap: {
          ...state.registeredUnitsMap,
          [unitKey]: {
            unitKey,
            surfaceId: meta.surfaceId,
            variantId,
            label: meta.label,
            referenceCode: meta.referenceCode,
            componentName: meta.componentName,
            sourceFile: meta.sourceFile,
            subViewFile: meta.subViewFile,
            changedSubtreeFiles: [],
            alphaMotherDeps: extractAlphaMotherDeps(ledgerRecord),
            ledgerRecord,
          },
        },
      };
    });
  },

  setPlaylistScope: (scope) => {
    set((state) => (state.playlistScope === scope ? state : { playlistScope: scope }));
  },

  selectUnitByKey: (unitKey) => {
    set((state) => ({
      activeUnitKey: unitKey,
      navigationSeq: state.navigationSeq + 1,
    }));
  },

  setBucketFilter: (bucket) => {
    set((state) => {
      const next = {
        decisionsMap: state.decisionsMap,
        activeBucketFilter: bucket,
        simulateTemplateStale: state.simulateTemplateStale,
      };
      savePersistedState(next);
      return { activeBucketFilter: bucket };
    });
  },

  setDecision: ({
    unitKey,
    status,
    note,
    simulatedStaleReason,
    advanceToNext = false,
  }) => {
    const state = get();
    const targetKey = unitKey || state.activeUnitKey;
    const [surfaceId, variantId = 'default'] = targetKey.split('::');
    const reg = state.registeredUnitsMap[targetKey];
    const prev = state.decisionsMap[targetKey];
    const nowIso = new Date().toISOString();

    const resolvedNote = note !== undefined ? note : prev?.note ?? '';
    const approvalMessage = buildApprovalMessageWithDiffs({
      baseNote: resolvedNote,
      surfaceId,
      unitKey: targetKey,
      status,
    });

    const nextDecision: RuntimeReviewDecision = {
      unitKey: targetKey,
      surfaceId,
      variantId,
      label: reg?.label ?? prev?.label,
      referenceCode: reg?.referenceCode ?? prev?.referenceCode,
      componentName: reg?.componentName ?? prev?.componentName,
      sourceFile: reg?.sourceFile ?? prev?.sourceFile,
      subViewFile: reg?.subViewFile ?? prev?.subViewFile,
      status,
      note: resolvedNote,
      approvalMessage,
      simulatedStaleReason:
        simulatedStaleReason !== undefined
          ? simulatedStaleReason
          : status === 'approved'
          ? undefined
          : prev?.simulatedStaleReason,
      updatedAt: nowIso,
    };

    const nextDecisionsMap = {
      ...state.decisionsMap,
      [targetKey]: nextDecision,
    };

    savePersistedState({
      decisionsMap: nextDecisionsMap,
      activeBucketFilter: state.activeBucketFilter,
      simulateTemplateStale: state.simulateTemplateStale,
    });

    const allUnits = buildAllReviewUnits({
      decisionsMap: nextDecisionsMap,
      registeredUnitsMap: state.registeredUnitsMap,
      globalTemplateStaleOverride: state.simulateTemplateStale,
      activeUnitKey: targetKey,
      playlistScope: state.playlistScope,
    });

    let nextActiveKey = targetKey;
    const matchIdx = findUnitIndexByKeyOrSurface(allUnits, targetKey);
    let nextUnit: SurfaceVariantReviewUnit | null =
      matchIdx >= 0 ? allUnits[matchIdx] : null;

    if (advanceToNext) {
      const filtered =
        state.activeBucketFilter === 'all'
          ? allUnits
          : allUnits.filter((u) => u.bucket === state.activeBucketFilter);
      const list = filtered.length > 0 ? filtered : allUnits;
      const idx = findUnitIndexByKeyOrSurface(list, targetKey);
      const nextIdx = idx >= 0 ? (idx + 1) % list.length : 0;
      if (list[nextIdx]) {
        nextActiveKey = list[nextIdx].unitKey;
        nextUnit = list[nextIdx];
      }
    }

    set((s) => ({
      decisionsMap: nextDecisionsMap,
      activeUnitKey: nextActiveKey,
      navigationSeq: advanceToNext ? s.navigationSeq + 1 : s.navigationSeq,
    }));

    return nextUnit;
  },

  updateNote: (unitKey, note) => {
    const state = get();
    const [surfaceId, variantId = 'default'] = unitKey.split('::');
    const reg = state.registeredUnitsMap[unitKey];
    const prev = state.decisionsMap[unitKey];
    const ledgerRecord = UI_APPROVAL_LEDGER.surfaces[surfaceId];
    const resolvedStatus = prev?.status ?? ledgerRecord?.status ?? 'approved';
    const approvalMessage = buildApprovalMessageWithDiffs({
      baseNote: note,
      surfaceId,
      unitKey,
      status: resolvedStatus,
    });

    const nextDecision: RuntimeReviewDecision = {
      unitKey,
      surfaceId,
      variantId,
      label: reg?.label ?? prev?.label,
      referenceCode: reg?.referenceCode ?? prev?.referenceCode,
      componentName: reg?.componentName ?? prev?.componentName,
      sourceFile: reg?.sourceFile ?? prev?.sourceFile,
      subViewFile: reg?.subViewFile ?? prev?.subViewFile,
      status: resolvedStatus,
      note,
      approvalMessage,
      simulatedStaleReason: prev?.simulatedStaleReason,
      updatedAt: new Date().toISOString(),
    };

    const nextDecisionsMap = {
      ...state.decisionsMap,
      [unitKey]: nextDecision,
    };

    savePersistedState({
      decisionsMap: nextDecisionsMap,
      activeBucketFilter: state.activeBucketFilter,
      simulateTemplateStale: state.simulateTemplateStale,
    });

    set({ decisionsMap: nextDecisionsMap });
  },

  stepQueue: (delta) => {
    const state = get();
    const allUnits = buildAllReviewUnits({
      decisionsMap: state.decisionsMap,
      registeredUnitsMap: state.registeredUnitsMap,
      globalTemplateStaleOverride: state.simulateTemplateStale,
      activeUnitKey: state.activeUnitKey,
      playlistScope: state.playlistScope,
    });
    const filtered =
      state.activeBucketFilter === 'all'
        ? allUnits
        : allUnits.filter((u) => u.bucket === state.activeBucketFilter);
    const list = filtered.length > 0 ? filtered : allUnits;
    if (list.length === 0) return null;

    const currIdx = findUnitIndexByKeyOrSurface(list, state.activeUnitKey);
    const nextIdx =
      currIdx >= 0
        ? (currIdx + delta + list.length) % list.length
        : 0;
    const nextUnit = list[nextIdx];
    set((s) => ({
      activeUnitKey: nextUnit.unitKey,
      navigationSeq: s.navigationSeq + 1,
    }));
    return nextUnit;
  },

  batchApproveTemplateStale: () => {
    const state = get();
    const allUnits = buildAllReviewUnits({
      decisionsMap: state.decisionsMap,
      registeredUnitsMap: state.registeredUnitsMap,
      globalTemplateStaleOverride: state.simulateTemplateStale,
      activeUnitKey: state.activeUnitKey,
      playlistScope: state.playlistScope,
    });
    const templateStaleUnits = allUnits.filter(
      (u) => u.bucket === 'bucket-3-template'
    );
    if (templateStaleUnits.length === 0) return 0;

    const nowIso = new Date().toISOString();
    const nextDecisionsMap = { ...state.decisionsMap };

    for (const unit of templateStaleUnits) {
      nextDecisionsMap[unit.unitKey] = {
        unitKey: unit.unitKey,
        surfaceId: unit.surfaceId,
        variantId: unit.variantId,
        label: unit.label,
        referenceCode: unit.referenceCode,
        componentName: unit.componentName,
        sourceFile: unit.sourceFile,
        subViewFile: unit.subViewFile,
        status: 'approved',
        note: unit.note,
        simulatedStaleReason: undefined,
        updatedAt: nowIso,
      };
    }

    savePersistedState({
      decisionsMap: nextDecisionsMap,
      activeBucketFilter: 'all',
      simulateTemplateStale: false,
    });

    set({
      decisionsMap: nextDecisionsMap,
      simulateTemplateStale: false,
      activeBucketFilter: 'all',
    });

    return templateStaleUnits.length;
  },

  setSimulateTemplateStale: (enabled) => {
    set((state) => {
      const next = {
        decisionsMap: state.decisionsMap,
        activeBucketFilter: enabled ? ('bucket-3-template' as const) : state.activeBucketFilter,
        simulateTemplateStale: enabled,
      };
      savePersistedState(next);
      return {
        simulateTemplateStale: enabled,
        activeBucketFilter: enabled ? 'bucket-3-template' : state.activeBucketFilter,
      };
    });
  },

  setExporterModalOpen: (open) => {
    set({ isExporterModalOpen: open });
  },

  resetRuntimeDecisions: () => {
    savePersistedState({
      decisionsMap: {},
      activeBucketFilter: 'all',
      simulateTemplateStale: false,
    });
    set({
      decisionsMap: {},
      activeBucketFilter: 'all',
      simulateTemplateStale: false,
    });
  },
}));

