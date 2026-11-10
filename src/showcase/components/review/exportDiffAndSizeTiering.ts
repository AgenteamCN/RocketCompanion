import {
  SURFACE_CALIBRATION_OVERRIDES,
  subscribeSurfaceCalibration,
} from '../../../ui-core/manifest/surfaceCalibration';
import type {
  SurfaceCalibrationLedger,
  SurfaceCalibrationOverride,
} from '../../../ui-core/manifest/surfaceMetaTypes';
import { useAppStore } from '../../../ui-core/stores/appStore';
import { useBotsLoadoutStore } from '../../../ui-core/stores/botsLoadoutStore';
import { useGoalBarrierStore } from '../../../ui-core/stores/goalBarrierStore';
import { useHudStore } from '../../../ui-core/stores/hudStore';
import { useKickoffTrainingStore } from '../../../ui-core/stores/kickoffTrainingStore';
import { useMenuLayoutStore } from '../../../ui-core/stores/menuLayoutStore';
import {
  getNameTagConfig,
  subscribeNameTagConfig,
} from '../../../ui-core/stores/nameTagTunerStore';
import { useSpatialAudioStore } from '../../../ui-core/stores/spatialAudioStore';
import { useStaticTrainingBallCamTunerStore } from '../../../ui-core/stores/staticTrainingBallCamTunerStore';
import { crossClientSync } from '../../stores/crossClientSync';
import type {
  CalibrationOverrideDiffEntry,
  ExportSizeTierMetrics,
  StoreDiffEntry,
  TunerExportDiffSnapshot,
} from './reviewTypes';

export const EXPORT_COPY_MAX_LINES = 500;
export const EXPORT_COPY_MAX_BYTES = 3072;

const INITIAL_CALIBRATION_SNAPSHOT: SurfaceCalibrationLedger = JSON.parse(
  JSON.stringify(SURFACE_CALIBRATION_OVERRIDES ?? {})
);

interface DomainStoreDescriptor {
  id: string;
  keyPrefix: string;
  getState: () => Record<string, unknown>;
  subscribe: (listener: () => void) => () => void;
}

const TRACKED_DOMAIN_STORES: readonly DomainStoreDescriptor[] = [
  {
    id: 'appStore',
    keyPrefix: 'store:app',
    getState: () => extractAppStoreConfigSlice(useAppStore.getState()),
    subscribe: (l) => useAppStore.subscribe(l),
  },
  {
    id: 'menuLayoutStore',
    keyPrefix: 'store:menuLayout',
    getState: () => extractSerializableFields(useMenuLayoutStore.getState()),
    subscribe: (l) => useMenuLayoutStore.subscribe(l),
  },
  {
    id: 'nameTagConfig',
    keyPrefix: 'store:nameTagConfig',
    getState: () => extractSerializableFields(getNameTagConfig()),
    subscribe: (l) => subscribeNameTagConfig(l),
  },
  {
    id: 'spatialAudioStore',
    keyPrefix: 'store:spatialAudio',
    getState: () => extractSerializableFields(useSpatialAudioStore.getState()),
    subscribe: (l) => useSpatialAudioStore.subscribe(l),
  },
  {
    id: 'botsLoadoutStore',
    keyPrefix: 'store:botsLoadout',
    getState: () => extractSerializableFields(useBotsLoadoutStore.getState()),
    subscribe: (l) => useBotsLoadoutStore.subscribe(l),
  },
  {
    id: 'goalBarrierStore',
    keyPrefix: 'store:goalBarrier',
    getState: () => extractSerializableFields(useGoalBarrierStore.getState()),
    subscribe: (l) => useGoalBarrierStore.subscribe(l),
  },
  {
    id: 'kickoffTrainingStore',
    keyPrefix: 'store:kickoffTraining',
    getState: () => extractSerializableFields(useKickoffTrainingStore.getState()),
    subscribe: (l) => useKickoffTrainingStore.subscribe(l),
  },
  {
    id: 'staticTrainingBallCamStore',
    keyPrefix: 'store:staticTrainingBallCam',
    getState: () => extractSerializableFields(useStaticTrainingBallCamTunerStore.getState()),
    subscribe: (l) => useStaticTrainingBallCamTunerStore.subscribe(l),
  },
  {
    id: 'hudStore',
    keyPrefix: 'store:hud',
    getState: () => extractSerializableFields(useHudStore.getState()),
    subscribe: (l) => useHudStore.subscribe(l),
  },
];

const INITIAL_DOMAIN_BASELINES = new Map<string, Record<string, unknown>>();

function getOrCaptureDomainBaseline(desc: DomainStoreDescriptor): Record<string, unknown> {
  if (!INITIAL_DOMAIN_BASELINES.has(desc.id)) {
    INITIAL_DOMAIN_BASELINES.set(desc.id, cloneJsonSafe(desc.getState()));
  }
  return INITIAL_DOMAIN_BASELINES.get(desc.id)!;
}

function cloneJsonSafe<T>(val: T): T {
  if (val === null || val === undefined || typeof val !== 'object') return val;
  try {
    return JSON.parse(JSON.stringify(val)) as T;
  } catch {
    return val;
  }
}

export function isJsonEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== typeof b || a === null || b === null || typeof a !== 'object') return false;
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

function extractSerializableFields(rawState: unknown): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!rawState || typeof rawState !== 'object') return out;
  for (const [k, v] of Object.entries(rawState as Record<string, unknown>)) {
    if (typeof v === 'function' || v === undefined || k.startsWith('_')) continue;
    out[k] = v;
  }
  return out;
}

const APP_STORE_CONFIG_KEYS = [
  'theme',
  'developerMode',
  'activeCar',
  'colorPrefs',
  'materials',
  'camera',
  'trajectory',
  'graphics',
  'audio',
  'gameplay',
  'telemetry',
  'clockPacingMode',
  'clockPacingPriority',
  'inputBufferTarget',
  'inputBufferThreshold',
  'customClockPacingParams',
  'boostPadTuner',
  'driftwoodsTuner',
] as const;

function extractAppStoreConfigSlice(state: unknown): Record<string, unknown> {
  const s = (state ?? {}) as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of APP_STORE_CONFIG_KEYS) {
    if (s[key] !== undefined && typeof s[key] !== 'function') out[key] = s[key];
  }
  return out;
}

function diffNestedRecords(
  prefix: string,
  baseline: unknown,
  current: unknown,
  scope: StoreDiffEntry['scope'],
  acc: StoreDiffEntry[],
  depth = 0
): void {
  if (isJsonEqual(baseline, current)) return;

  const isPlainObj = (val: unknown): val is Record<string, unknown> =>
    typeof val === 'object' &&
    val !== null &&
    !Array.isArray(val) &&
    (Object.getPrototypeOf(val) === Object.prototype ||
      Object.getPrototypeOf(val) === null);

  if (depth < 3 && isPlainObj(baseline) && isPlainObj(current)) {
    const allKeys = new Set([
      ...Object.keys(baseline),
      ...Object.keys(current),
    ]);
    for (const k of Array.from(allKeys).sort()) {
      const childKey = prefix ? `${prefix}.${k}` : k;
      diffNestedRecords(childKey, baseline[k], current[k], scope, acc, depth + 1);
    }
    return;
  }

  acc.push({
    key: prefix,
    scope,
    before: cloneJsonSafe(baseline),
    after: cloneJsonSafe(current),
  });
}

function classifySyncKeyScope(key: string): StoreDiffEntry['scope'] {
  if (key.startsWith('store:')) return 'ui-store';
  if (key.startsWith('page:') || /^\d+[a-z]/i.test(key)) return 'page-sync';
  return 'domain-store';
}

const TRANSIENT_SYNC_KEYS = new Set<string>([
  'app:activeTab',
  'sync:activeTarget',
  'store:quickNotification',
  'store:nameTagTelemetry',
]);

const SIZING_KEYS = [
  'width',
  'height',
  'minWidth',
  'minHeight',
  'maxHeight',
  'mode',
] as const;

export function collectCalibrationOverrideDiffs(): {
  calibrationOverrides: SurfaceCalibrationLedger;
  calibrationDiffs: CalibrationOverrideDiffEntry[];
} {
  const calibrationOverrides: SurfaceCalibrationLedger = {};
  const calibrationDiffs: CalibrationOverrideDiffEntry[] = [];
  const allSurfaceIds = new Set<string>([
    ...Object.keys(INITIAL_CALIBRATION_SNAPSHOT),
    ...Object.keys(SURFACE_CALIBRATION_OVERRIDES ?? {}),
  ]);

  for (const surfaceId of Array.from(allSurfaceIds).sort()) {
    const initialOv = INITIAL_CALIBRATION_SNAPSHOT[surfaceId];
    const currentOv = SURFACE_CALIBRATION_OVERRIDES[surfaceId];
    if (currentOv) calibrationOverrides[surfaceId] = cloneJsonSafe(currentOv);
    if (isJsonEqual(initialOv, currentOv)) continue;

    const changedFields: string[] = [];
    const sizingDiff: Partial<SurfaceCalibrationOverride> = {};
    const configDiff: Record<string, { before: unknown; after: unknown }> = {};

    for (const sKey of SIZING_KEYS) {
      const bVal = initialOv?.[sKey];
      const aVal = currentOv?.[sKey];
      if (!isJsonEqual(bVal, aVal)) {
        changedFields.push(sKey);
        if (aVal !== undefined) (sizingDiff as Record<string, unknown>)[sKey] = aVal;
      }
    }

    const baseCfg = initialOv?.defaultConfigOverrides ?? {};
    const currCfg = currentOv?.defaultConfigOverrides ?? {};
    const cfgKeys = new Set([...Object.keys(baseCfg), ...Object.keys(currCfg)]);
    for (const cKey of Array.from(cfgKeys).sort()) {
      if (!isJsonEqual(baseCfg[cKey], currCfg[cKey])) {
        changedFields.push(`defaultConfigOverrides.${cKey}`);
        configDiff[cKey] = {
          before: cloneJsonSafe(baseCfg[cKey]),
          after: cloneJsonSafe(currCfg[cKey]),
        };
      }
    }

    if (changedFields.length > 0 && currentOv) {
      calibrationDiffs.push({
        surfaceId,
        override: cloneJsonSafe(currentOv),
        changedFields,
        sizingDiff,
        configDiff,
      });
    }
  }

  return { calibrationOverrides, calibrationDiffs };
}

export function collectTunerStoreDiffs(): {
  storeDiffs: StoreDiffEntry[];
  storeDiffMap: Record<string, { before: unknown; after: unknown }>;
} {
  const rawDiffs: StoreDiffEntry[] = [];
  const seenKeys = new Set<string>();

  for (const item of crossClientSync.getDiffEntries?.() ?? []) {
    if (TRANSIENT_SYNC_KEYS.has(item.key) || item.key.startsWith('store:floating:')) continue;
    const beforeCount = rawDiffs.length;
    diffNestedRecords(
      item.key,
      item.defaultValue,
      item.currentValue,
      classifySyncKeyScope(item.key),
      rawDiffs
    );
    if (rawDiffs.length > beforeCount) seenKeys.add(item.key);
  }

  for (const desc of TRACKED_DOMAIN_STORES) {
    if (seenKeys.has(desc.keyPrefix)) continue;
    diffNestedRecords(
      desc.keyPrefix,
      getOrCaptureDomainBaseline(desc),
      desc.getState(),
      'domain-store',
      rawDiffs
    );
  }

  const storeDiffs = rawDiffs.sort((a, b) => a.key.localeCompare(b.key));
  const storeDiffMap: Record<string, { before: unknown; after: unknown }> = {};
  for (const d of storeDiffs) storeDiffMap[d.key] = { before: d.before, after: d.after };
  return { storeDiffs, storeDiffMap };
}

export function collectTunerExportDiffSnapshot(): TunerExportDiffSnapshot {
  const { calibrationOverrides, calibrationDiffs } = collectCalibrationOverrideDiffs();
  const { storeDiffs, storeDiffMap } = collectTunerStoreDiffs();
  const totalCalibrationSurfaceCount = Object.keys(calibrationOverrides).length;
  return {
    calibrationOverrides,
    calibrationDiffs,
    storeDiffs,
    storeDiffMap,
    totalCalibrationSurfaceCount,
    totalStoreDiffCount: storeDiffs.length,
    hasAnyDiff: totalCalibrationSurfaceCount > 0 || storeDiffs.length > 0,
  };
}

export function resetAllCollectedTunerDiffs(): void {
  for (const desc of TRACKED_DOMAIN_STORES) getOrCaptureDomainBaseline(desc);
}

export function subscribeTunerDiffChanges(listener: () => void): () => void {
  for (const desc of TRACKED_DOMAIN_STORES) getOrCaptureDomainBaseline(desc);
  const unsubs: Array<() => void> = [
    subscribeSurfaceCalibration(listener),
    crossClientSync.subscribeStatus(listener),
    ...TRACKED_DOMAIN_STORES.map((d) => d.subscribe(listener)),
  ];
  return () => unsubs.forEach((u) => u());
}

export function computeExportSizeTierMetrics(text: string): ExportSizeTierMetrics {
  const safeText = text || '';
  const lineCount = safeText.length === 0 ? 0 : safeText.split(/\r?\n/).length;
  const byteCount =
    typeof TextEncoder !== 'undefined'
      ? new TextEncoder().encode(safeText).length
      : safeText.length;

  const isCompact =
    lineCount <= EXPORT_COPY_MAX_LINES && byteCount <= EXPORT_COPY_MAX_BYTES;
  const recommendedAction = isCompact ? 'copy-clipboard' : 'download-json';
  const formattedBadge = `${lineCount}L · ${byteCount.toLocaleString()}B (${(byteCount / 1024).toFixed(2)} KB)`;
  const reason = isCompact
    ? `Within compact clipboard tier (${lineCount}/${EXPORT_COPY_MAX_LINES}L, ${byteCount}/${EXPORT_COPY_MAX_BYTES}B <= 3KB) — Recommended: 1-Click Copy.`
    : `Exceeds compact clipboard tier (${lineCount}/${EXPORT_COPY_MAX_LINES}L, ${byteCount}/${EXPORT_COPY_MAX_BYTES}B > 3KB) — Recommended: 1-Click Download .json.`;

  return {
    lineCount,
    byteCount,
    maxCopyLines: EXPORT_COPY_MAX_LINES,
    maxCopyBytes: EXPORT_COPY_MAX_BYTES,
    recommendedAction,
    tierLabel: isCompact
      ? 'TIER-1 COMPACT (<= 500L & <= 3KB -> COPY)'
      : 'TIER-2 LARGE (> 500L OR > 3KB -> DOWNLOAD .JSON)',
    formattedBadge,
    reason,
  };
}

export function triggerExportJsonDownload(content: string, filename?: string): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const resolvedName = filename || `rc-ui-tuner-export-${stamp}.json`;
  if (typeof document !== 'undefined' && typeof Blob !== 'undefined') {
    const blob = new Blob([content], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = resolvedName;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return resolvedName;
}

export function buildApprovalMessageWithDiffs(params: {
  baseNote?: string;
  surfaceId?: string;
  unitKey?: string;
  status?: string;
  diffSnapshot?: TunerExportDiffSnapshot;
}): string {
  const {
    baseNote = '',
    surfaceId,
    diffSnapshot = collectTunerExportDiffSnapshot(),
  } = params;

  const segments: string[] = [];
  if (baseNote.trim()) segments.push(baseNote.trim());

  const surfaceCalDiff = surfaceId
    ? diffSnapshot.calibrationDiffs.find((d) => d.surfaceId === surfaceId)
    : undefined;
  const targetOv =
    surfaceCalDiff?.override ??
    (surfaceId ? diffSnapshot.calibrationOverrides[surfaceId] : undefined);

  if (surfaceId && targetOv) {
    const compactOv: Record<string, unknown> = {};
    for (const k of SIZING_KEYS) {
      if (targetOv[k] !== undefined) compactOv[k] = targetOv[k];
    }
    if (
      targetOv.defaultConfigOverrides &&
      Object.keys(targetOv.defaultConfigOverrides).length > 0
    ) {
      compactOv.defaultConfigOverrides = targetOv.defaultConfigOverrides;
    }
    segments.push(`[CalibrationOverride ${surfaceId}: ${JSON.stringify(compactOv)}]`);
  } else if (diffSnapshot.calibrationDiffs.length > 0) {
    const summaryMap: Record<string, unknown> = {};
    for (const entry of diffSnapshot.calibrationDiffs.slice(0, 4)) {
      summaryMap[entry.surfaceId] = entry.sizingDiff;
    }
    segments.push(
      `[CalibrationOverrides(${diffSnapshot.calibrationDiffs.length}): ${JSON.stringify(summaryMap)}]`
    );
  }

  if (diffSnapshot.storeDiffs.length > 0) {
    const compactStorePatch: Record<string, unknown> = {};
    for (const diff of diffSnapshot.storeDiffs.slice(0, 8)) {
      compactStorePatch[diff.key] = diff.after;
    }
    const suffix =
      diffSnapshot.storeDiffs.length > 8
        ? ` (+${diffSnapshot.storeDiffs.length - 8} more)`
        : '';
    segments.push(
      `[StoreDiff(${diffSnapshot.storeDiffs.length})${suffix}: ${JSON.stringify(compactStorePatch)}]`
    );
  }

  return segments.join(' | ');
}
