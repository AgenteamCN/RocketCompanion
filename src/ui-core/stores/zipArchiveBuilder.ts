export interface ZipArchiveEntry {
  name: string;
  data: Uint8Array | string;
}

// Precomputed IEEE 802.3 CRC-32 lookup table for ZIP archive headers
const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

import type { PacingTelemetryColumns } from './pacingTelemetryFormatPipeline';

export function computeZipCrc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = CRC32_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export function encodeUtf8(str: string): Uint8Array {
  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(str);
  }
  const out = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) out[i] = str.charCodeAt(i) & 0xff;
  return out;
}

export function decodeUtf8(bytes: Uint8Array): string {
  if (typeof TextDecoder !== 'undefined') {
    return new TextDecoder('utf-8').decode(bytes);
  }
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return s;
}

export function parseCsvTelemetryColumns(csvText: string): PacingTelemetryColumns | null {
  const lines = String(csvText || '')
    .trim()
    .split(/\r?\n/);
  if (lines.length < 2) return null;
  const headers = lines[0].split(',').map((h) => h.trim());
  const idxMap: Record<string, number> = {};
  headers.forEach((h, idx) => {
    idxMap[h] = idx;
  });

  const columns: PacingTelemetryColumns = {
    timeMs: [],
    clientTick: [],
    serverTick: [],
    rawRttMs: [],
    smoothRttMs: [],
    jitterMs: [],
    serverBuffer: [],
    effectiveBuffer: [],
    targetBuffer: [],
    physicsRateHz: [],
    leadTicks: [],
    posErrorUu: [],
    localPosErrorUu: [],
    ballPosErrorUu: [],
    remotePosErrorUu: [],
    probePosErrorUu: [],
    reconcileTier: [],
    tierState: [],
    eventFlags: [],
  };

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const parts = line.split(',');
    if (parts.length < 8) continue;
    const posErr = Number(parts[idxMap.posErrorUu ?? 12]) || 0;
    columns.timeMs.push(Number(parts[idxMap.timeMs ?? 1]) || 0);
    columns.clientTick.push(Number(parts[idxMap.clientTick ?? 2]) || 0);
    columns.serverTick.push(Number(parts[idxMap.serverTick ?? 3]) || 0);
    columns.rawRttMs.push(Number(parts[idxMap.rawRttMs ?? 4]) || 0);
    columns.smoothRttMs.push(Number(parts[idxMap.smoothRttMs ?? 5]) || 0);
    columns.jitterMs.push(Number(parts[idxMap.jitterMs ?? 6]) || 0);
    columns.serverBuffer.push(Number(parts[idxMap.serverBuffer ?? 7]) || 0);
    columns.effectiveBuffer.push(Number(parts[idxMap.effectiveBuffer ?? 8]) || 0);
    columns.targetBuffer.push(Number(parts[idxMap.targetBuffer ?? 9]) || 0);
    columns.physicsRateHz.push(Number(parts[idxMap.physicsRateHz ?? 10]) || 120);
    columns.leadTicks.push(Number(parts[idxMap.leadTicks ?? 11]) || 0);
    columns.posErrorUu.push(posErr);
    columns.localPosErrorUu.push(
      idxMap.localPosErrorUu !== undefined ? Number(parts[idxMap.localPosErrorUu]) || 0 : posErr
    );
    columns.ballPosErrorUu.push(
      idxMap.ballPosErrorUu !== undefined ? Number(parts[idxMap.ballPosErrorUu]) || 0 : 0
    );
    columns.remotePosErrorUu.push(
      idxMap.remotePosErrorUu !== undefined ? Number(parts[idxMap.remotePosErrorUu]) || 0 : 0
    );
    columns.probePosErrorUu.push(
      idxMap.probePosErrorUu !== undefined ? Number(parts[idxMap.probePosErrorUu]) || 0 : 0
    );
    columns.reconcileTier.push(
      idxMap.reconcileTier !== undefined
        ? Number(parts[idxMap.reconcileTier]) || 1
        : posErr >= 120
        ? 3
        : posErr > 1.5
        ? 2
        : 1
    );
    columns.tierState.push(Number(parts[idxMap.tierState ?? 17]) || 0);
    columns.eventFlags.push(Number(parts[idxMap.eventFlags ?? 18]) || 0);
  }
  return columns.timeMs.length > 0 ? columns : null;
}

async function inflateRawBytes(compressedBytes: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream !== 'undefined') {
    const ds = new DecompressionStream('deflate-raw');
    const writer = ds.writable.getWriter();
    writer.write(compressedBytes as BufferSource);
    writer.close();
    const resp = new Response(ds.readable);
    const buf = await resp.arrayBuffer();
    return new Uint8Array(buf);
  }
  throw new Error('DecompressionStream unavailable for deflate-compressed ZIP entry');
}

/**
 * Extracts text files from a PKZIP archive buffer (supports Store method 0 and Deflate method 8).
 */
export async function extractZipArchiveTextEntries(
  zipBuffer: ArrayBuffer | Uint8Array
): Promise<Record<string, string>> {
  const bytes = zipBuffer instanceof Uint8Array ? zipBuffer : new Uint8Array(zipBuffer);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const files: Record<string, string> = {};

  // Locate End of Central Directory (0x06054b50)
  let eocdOffset = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }

  if (eocdOffset >= 0) {
    const totalEntries = view.getUint16(eocdOffset + 10, true);
    let cdOffset = view.getUint32(eocdOffset + 16, true);
    for (let e = 0; e < totalEntries && cdOffset + 46 <= bytes.length; e++) {
      if (view.getUint32(cdOffset, true) !== 0x02014b50) break;
      const method = view.getUint16(cdOffset + 10, true);
      const compSize = view.getUint32(cdOffset + 20, true);
      const nameLen = view.getUint16(cdOffset + 28, true);
      const extraLen = view.getUint16(cdOffset + 30, true);
      const commentLen = view.getUint16(cdOffset + 32, true);
      const localHeaderOffset = view.getUint32(cdOffset + 42, true);
      const name = decodeUtf8(bytes.subarray(cdOffset + 46, cdOffset + 46 + nameLen));

      const localNameLen = view.getUint16(localHeaderOffset + 26, true);
      const localExtraLen = view.getUint16(localHeaderOffset + 28, true);
      const dataStart = localHeaderOffset + 30 + localNameLen + localExtraLen;
      const rawSlice = bytes.subarray(dataStart, dataStart + compSize);

      if (method === 0) {
        files[name] = decodeUtf8(rawSlice);
      } else if (method === 8) {
        const inflated = await inflateRawBytes(rawSlice);
        files[name] = decodeUtf8(inflated);
      }
      cdOffset += 46 + nameLen + extraLen + commentLen;
    }
  }
  return files;
}

export function encodeZipStoreArchive(entries: ZipArchiveEntry[]): Uint8Array {
  const prepared = entries.map((e) => {
    const nameBytes = encodeUtf8(e.name);
    const dataBytes = typeof e.data === 'string' ? encodeUtf8(e.data) : e.data;
    const crc = computeZipCrc32(dataBytes);
    return { nameBytes, dataBytes, crc };
  });

  let localTotal = 0;
  let centralTotal = 0;
  for (const item of prepared) {
    localTotal += 30 + item.nameBytes.length + item.dataBytes.length;
    centralTotal += 46 + item.nameBytes.length;
  }

  const out = new Uint8Array(localTotal + centralTotal + 22);
  const view = new DataView(out.buffer);
  let localOffset = 0;
  let centralOffset = localTotal;

  for (const item of prepared) {
    const { nameBytes, dataBytes, crc } = item;
    const len = dataBytes.length;
    const itemLocalStart = localOffset;

    view.setUint32(localOffset, 0x04034b50, true);
    view.setUint16(localOffset + 4, 20, true);
    view.setUint16(localOffset + 6, 0x0800, true);
    view.setUint16(localOffset + 8, 0, true);
    view.setUint16(localOffset + 10, 0, true);
    view.setUint16(localOffset + 12, 0, true);
    view.setUint32(localOffset + 14, crc, true);
    view.setUint32(localOffset + 18, len, true);
    view.setUint32(localOffset + 22, len, true);
    view.setUint16(localOffset + 26, nameBytes.length, true);
    view.setUint16(localOffset + 28, 0, true);
    out.set(nameBytes, localOffset + 30);
    out.set(dataBytes, localOffset + 30 + nameBytes.length);
    localOffset += 30 + nameBytes.length + len;

    view.setUint32(centralOffset, 0x02014b50, true);
    view.setUint16(centralOffset + 4, 20, true);
    view.setUint16(centralOffset + 6, 20, true);
    view.setUint16(centralOffset + 8, 0x0800, true);
    view.setUint16(centralOffset + 10, 0, true);
    view.setUint16(centralOffset + 12, 0, true);
    view.setUint16(centralOffset + 14, 0, true);
    view.setUint32(centralOffset + 16, crc, true);
    view.setUint32(centralOffset + 20, len, true);
    view.setUint32(centralOffset + 24, len, true);
    view.setUint16(centralOffset + 28, nameBytes.length, true);
    view.setUint16(centralOffset + 30, 0, true);
    view.setUint16(centralOffset + 32, 0, true);
    view.setUint16(centralOffset + 34, 0, true);
    view.setUint16(centralOffset + 36, 0, true);
    view.setUint32(centralOffset + 38, 0, true);
    view.setUint32(centralOffset + 42, itemLocalStart, true);
    out.set(nameBytes, centralOffset + 46);
    centralOffset += 46 + nameBytes.length;
  }

  view.setUint32(centralOffset, 0x06054b50, true);
  view.setUint16(centralOffset + 4, 0, true);
  view.setUint16(centralOffset + 6, 0, true);
  view.setUint16(centralOffset + 8, prepared.length, true);
  view.setUint16(centralOffset + 10, prepared.length, true);
  view.setUint32(centralOffset + 12, centralTotal, true);
  view.setUint32(centralOffset + 16, localTotal, true);
  view.setUint16(centralOffset + 20, 0, true);

  return out;
}

