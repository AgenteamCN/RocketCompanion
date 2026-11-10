/**
 * pacingTelemetryExporter.ts
 * Manages retention, unified .zip archive downloads (metadata.json + telemetry.csv),
 * trace imports (.zip / .json / .csv), and 1-second temporary QuickNotifications
 * (post-match podium, disconnect/eviction, and 20-minute capacity overflow)
 * for the Network Input Buffer & Clock Pacing Telemetry system.
 */

import {
  globalPacingTelemetryRecorder,
  type PacingTelemetryRecorder,
  type PacingTelemetrySerializableObject,
  type PacingTelemetrySummaryStats,
} from './pacingTelemetryRecorder';
import { buildCsvFromColumns } from './pacingTelemetryFormatPipeline';
import {
  decodeUtf8,
  encodeZipStoreArchive,
  extractZipArchiveTextEntries,
  parseCsvTelemetryColumns,
  type ZipArchiveEntry,
} from './zipArchiveBuilder';

export type { ZipArchiveEntry };

/**
 * Builds a standard PKZIP archive (Uint8Array) containing the given named entries.
 * Uses Store method (0) for zero-dependency synchronous packaging in browser and Node.
 */
export function buildZipArchiveBytes(entries: ZipArchiveEntry[]): Uint8Array {
  return encodeZipStoreArchive(entries);
}

export const NETWORK_TELEMETRY_NOTIFICATION_ID = 'network-pacing-telemetry-export';

export type TelemetryNotificationHandler = (notification: {
  id: string;
  type: 'temporary' | 'persistent';
  tone: 'info' | 'warning' | 'error' | 'success';
  icon?: string;
  duration?: number;
  content: string;
  buttons?: Array<{
    key: string;
    label: string;
    icon?: string;
    color?: string;
    dismissOnClick?: boolean;
    onClick: () => void;
  }>;
}) => void;

let _retainedTelemetryPayload: PacingTelemetrySerializableObject | null = null;
let _importedTelemetryPayload: PacingTelemetrySerializableObject | null = null;
const _traceListeners = new Set<() => void>();
let _telemetryNotificationHandler: TelemetryNotificationHandler | null = null;

export function setPacingTelemetryNotificationHandler(
  handler: TelemetryNotificationHandler | null
): void {
  _telemetryNotificationHandler = typeof handler === 'function' ? handler : null;
}

/**
 * Parses an imported telemetry file (.zip, .json, or .csv) into a normalized telemetry payload.
 */
export async function parseImportedTelemetryFile(
  file: File
): Promise<PacingTelemetrySerializableObject> {
  const name = (file?.name || '').toLowerCase();
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);

  const isZip =
    name.endsWith('.zip') ||
    (bytes.length >= 4 &&
      bytes[0] === 0x50 &&
      bytes[1] === 0x4b &&
      bytes[2] === 0x03 &&
      bytes[3] === 0x04);

  if (isZip) {
    const entries = await extractZipArchiveTextEntries(bytes);
    const entryNames = Object.keys(entries);
    const metaKey = entryNames.find((k) => k.endsWith('metadata.json') || k.endsWith('.json'));
    const csvKey = entryNames.find((k) => k.endsWith('.csv'));

    let metaObj: Partial<PacingTelemetrySerializableObject> = {};
    if (metaKey && entries[metaKey]) {
      metaObj = JSON.parse(entries[metaKey]) as Partial<PacingTelemetrySerializableObject>;
    }
    if (metaObj.columns && Array.isArray(metaObj.columns.timeMs)) {
      return metaObj as PacingTelemetrySerializableObject;
    }
    if (csvKey && entries[csvKey]) {
      const columns = parseCsvTelemetryColumns(entries[csvKey]);
      if (!columns) {
        throw new Error('ZIP archive CSV entry contains no valid telemetry rows.');
      }
      return {
        schemaVersion: metaObj.schemaVersion || 'rc-network-telemetry-v2',
        exportedAt: metaObj.exportedAt || new Date().toISOString(),
        metadata: metaObj.metadata || {
          clockPacingMode: 'csts',
          clockPacingPriority: 'balanced',
          recordedTicks: columns.timeMs.length,
        },
        summary:
          metaObj.summary ||
          ({
            recordedTicks: columns.timeMs.length,
            durationSeconds:
              Math.round((columns.timeMs[columns.timeMs.length - 1] - columns.timeMs[0]) / 100) / 10,
          } as PacingTelemetrySummaryStats),
        columns,
      };
    }
    throw new Error('ZIP archive does not contain telemetry.csv or telemetry JSON.');
  }

  const text = decodeUtf8(bytes);
  if (name.endsWith('.csv') || text.trimStart().startsWith('index,timeMs,')) {
    const columns = parseCsvTelemetryColumns(text);
    if (!columns) {
      throw new Error('Invalid telemetry CSV file.');
    }
    return {
      schemaVersion: 'rc-network-telemetry-csv',
      exportedAt: new Date().toISOString(),
      metadata: {
        clockPacingMode: 'csts',
        clockPacingPriority: 'balanced',
        recordedTicks: columns.timeMs.length,
      },
      summary: {
        recordedTicks: columns.timeMs.length,
        durationSeconds:
          Math.round((columns.timeMs[columns.timeMs.length - 1] - columns.timeMs[0]) / 100) / 10,
      } as PacingTelemetrySummaryStats,
      columns,
    };
  }

  const parsed = JSON.parse(text);
  const cols = parsed?.columns || parsed?.trace;
  if (!cols || !Array.isArray(cols.timeMs || cols.elapsedMs)) {
    throw new Error('Invalid trace JSON: missing columns.timeMs array');
  }
  return parsed.columns
    ? (parsed as PacingTelemetrySerializableObject)
    : ({
        ...parsed,
        columns: {
          timeMs: cols.elapsedMs,
          clientTick: cols.clientTick,
          serverTick: cols.serverTick,
          rawRttMs: cols.rttMs,
          smoothRttMs: cols.rttMs,
          jitterMs: cols.jitterMs,
          serverBuffer: cols.rawServerBuffer,
          effectiveBuffer: cols.compensatedBuffer,
          targetBuffer: cols.dynamicTarget,
          physicsRateHz: cols.effectiveHz,
          tierState: cols.tierState,
          eventFlags: cols.eventFlags,
        },
      } as PacingTelemetrySerializableObject);
}

function notifyTraceListeners(): void {
  for (const cb of _traceListeners) {
    try {
      cb();
    } catch (err) {
      console.warn('[PacingTelemetryExporter] Error in trace listener:', err);
    }
  }
}

export function subscribeTelemetryTraceUpdates(listener: () => void): () => boolean {
  _traceListeners.add(listener);
  return () => _traceListeners.delete(listener);
}

export function getRetainedTelemetryPayload(): PacingTelemetrySerializableObject | null {
  return _retainedTelemetryPayload;
}

export function getImportedTelemetryPayload(): PacingTelemetrySerializableObject | null {
  return _importedTelemetryPayload;
}

export function setImportedTelemetryPayload(payload: PacingTelemetrySerializableObject | null): void {
  _importedTelemetryPayload = payload;
  notifyTraceListeners();
}

export function clearImportedTelemetryPayload(): void {
  _importedTelemetryPayload = null;
  notifyTraceListeners();
}

export function snapshotCurrentTelemetryPayload(
  recorder: PacingTelemetryRecorder = globalPacingTelemetryRecorder
): PacingTelemetrySerializableObject | null {
  if (!recorder || recorder.count <= 0) {
    return _retainedTelemetryPayload;
  }
  _retainedTelemetryPayload = recorder.toSerializableObject();
  notifyTraceListeners();
  return _retainedTelemetryPayload;
}

function triggerBrowserFileDownload(
  contentOrBytes: Uint8Array | string,
  filename: string,
  mimeType: string
): boolean {
  if (typeof document === 'undefined' || typeof Blob === 'undefined') return false;
  const part: BlobPart =
    typeof contentOrBytes === 'string'
      ? contentOrBytes
      : (contentOrBytes.buffer.slice(
          contentOrBytes.byteOffset,
          contentOrBytes.byteOffset + contentOrBytes.byteLength
        ) as ArrayBuffer);
  const blob = new Blob([part], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  return true;
}

export type PacingTelemetryExportSource =
  | PacingTelemetryRecorder
  | PacingTelemetrySerializableObject
  | null
  | undefined;

function isTelemetryRecorder(
  src: PacingTelemetryExportSource
): src is PacingTelemetryRecorder {
  return (
    Boolean(src) &&
    typeof (src as PacingTelemetryRecorder).toCsvString === 'function' &&
    ((src as PacingTelemetryRecorder).count ?? 0) > 0
  );
}

/**
 * Packages metadata.json + telemetry.csv into a single unified .zip archive and triggers browser download.
 */
export function downloadNetworkTelemetryZip(
  payloadOrRecorder: PacingTelemetryExportSource = null,
  reasonTag: string = 'session'
): boolean {
  let metadataObj: {
    schemaVersion: string;
    exportedAt: string;
    metadata?: PacingTelemetrySerializableObject['metadata'];
    summary?: PacingTelemetrySerializableObject['summary'];
  } | null = null;
  let csvText = '';

  if (isTelemetryRecorder(payloadOrRecorder)) {
    metadataObj =
      typeof payloadOrRecorder.toMetadataObject === 'function'
        ? payloadOrRecorder.toMetadataObject()
        : {
            schemaVersion: 'rc-network-telemetry-v2',
            exportedAt: new Date().toISOString(),
            metadata: {
              clockPacingMode: payloadOrRecorder.activeMode,
              clockPacingPriority: payloadOrRecorder.activePriority,
              clockPacingParams: payloadOrRecorder.activeParams,
              recordedTicks: payloadOrRecorder.count,
            },
            summary: payloadOrRecorder.getSummaryStats(),
          };
    csvText = payloadOrRecorder.toCsvString();
  } else {
    const payload =
      payloadOrRecorder && 'columns' in payloadOrRecorder && payloadOrRecorder.columns
        ? payloadOrRecorder
        : globalPacingTelemetryRecorder.count > 0
        ? globalPacingTelemetryRecorder.toSerializableObject()
        : _retainedTelemetryPayload;

    if (!payload || !payload.columns || !payload.columns.timeMs?.length) {
      console.warn('[PacingTelemetryExporter] No recorded network telemetry data available to export.');
      return false;
    }

    metadataObj = {
      schemaVersion: 'rc-network-telemetry-v2',
      exportedAt: payload.exportedAt || new Date().toISOString(),
      metadata: payload.metadata,
      summary: payload.summary,
    };
    csvText = buildCsvFromColumns(payload.columns);
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const mode = metadataObj?.metadata?.clockPacingMode || 'csts';
  const filename = `rc-net-telemetry-${mode}-${reasonTag}-${stamp}.zip`;
  const zipBytes = buildZipArchiveBytes([
    { name: 'metadata.json', data: JSON.stringify(metadataObj, null, 2) },
    { name: 'telemetry.csv', data: csvText },
  ]);

  return triggerBrowserFileDownload(zipBytes, filename, 'application/zip');
}

export function downloadNetworkTelemetryJson(
  payloadOrRecorder: PacingTelemetryExportSource = null,
  reasonTag: string = 'session'
): boolean {
  return downloadNetworkTelemetryZip(payloadOrRecorder, reasonTag);
}

export function downloadNetworkTelemetryCsv(
  recorder: PacingTelemetryExportSource = globalPacingTelemetryRecorder,
  reasonTag: string = 'session'
): boolean {
  return downloadNetworkTelemetryZip(recorder, reasonTag);
}

/**
 * Retains the current recorded network telemetry trace and triggers a 1-second (1000ms)
 * temporary QuickNotification with a single unified .zip download action.
 */
export function notifyNetworkTelemetryExportAvailable(
  reason: 'match-complete' | 'disconnected' | 'overflow' = 'match-complete',
  recorder: PacingTelemetryRecorder = globalPacingTelemetryRecorder
): PacingTelemetrySerializableObject | null {
  const retained = snapshotCurrentTelemetryPayload(recorder);
  if (!retained || !retained.summary || retained.summary.recordedTicks <= 0) {
    return null;
  }

  const durSec = retained.summary.durationSeconds ?? 0;
  const starveCnt = retained.summary.starvationCount ?? 0;
  const recMode = (retained.summary.recommendedMode || 'sts').toUpperCase();

  let labelPrefix = 'Match Network Log Ready';
  let tone: 'info' | 'warning' = 'info';
  if (reason === 'disconnected') {
    labelPrefix = 'Connection Lost - Network Diagnostic Log Saved';
    tone = 'warning';
  } else if (reason === 'overflow') {
    labelPrefix = '20m Telemetry Buffer Full - Log Frozen for Export';
    tone = 'warning';
  }

  try {
    _telemetryNotificationHandler?.({
      id: `${NETWORK_TELEMETRY_NOTIFICATION_ID}-${reason}-${Date.now()}`,
      type: 'temporary',
      tone,
      icon: 'download',
      duration: 1000,
      content: `${labelPrefix} (${durSec}s, ${starveCnt} starvations, Rec: ${recMode}) - Download telemetry package?`,
      buttons: [
        {
          key: 'export-net-zip',
          label: 'Download .zip',
          icon: 'download',
          color: 'sky',
          dismissOnClick: false,
          onClick: () => {
            downloadNetworkTelemetryZip(retained, reason);
          },
        },
      ],
    });
  } catch (err) {
    console.warn('[PacingTelemetryExporter] Failed to push temporary telemetry notification:', err);
  }

  return retained;
}

// Wire automatic 20-minute capacity overflow notification
globalPacingTelemetryRecorder.onCapacityOverflow = (rec) => {
  notifyNetworkTelemetryExportAvailable('overflow', rec);
};
