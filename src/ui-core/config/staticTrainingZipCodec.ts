/**
 * staticTrainingZipCodec.ts
 * Pure TypeScript ZIP reader and writer (Store + Deflate-Raw via browser DecompressionStream/CompressionStream)
 * for batch importing and exporting Static Training Packs (.Tem, .RCSPack, .RCSPackE, .RLRCSPack).
 */

export interface ZipEntryFile {
  name: string;
  data: Uint8Array;
}

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

function computeCrc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = CRC32_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export function isZipBinaryPayload(bytes: Uint8Array, fileName = ''): boolean {
  if (bytes.length >= 4) {
    if (
      bytes[0] === 0x50 &&
      bytes[1] === 0x4b &&
      bytes[2] === 0x03 &&
      bytes[3] === 0x04
    ) {
      return true;
    }
  }
  return /\.zip$/i.test(fileName);
}

async function inflateRawBytes(compressed: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('DecompressionStream is not available in this environment for ZIP deflate.');
  }
  const ds = new DecompressionStream('deflate-raw');
  const writer = ds.writable.getWriter();
  writer.write(compressed as unknown as BufferSource);
  writer.close();
  const resp = new Response(ds.readable);
  const buf = await resp.arrayBuffer();
  return new Uint8Array(buf);
}

/**
 * Extracts all supported training pack files from a `.zip` archive buffer.
 * Automatically ignores macOS resource forks (`__MACOSX/`, `._*`) and directories.
 */
export async function extractFilesFromZipBytes(zipBytes: Uint8Array): Promise<ZipEntryFile[]> {
  const view = new DataView(zipBytes.buffer, zipBytes.byteOffset, zipBytes.byteLength);
  const decoder = new TextDecoder();

  // Locate End of Central Directory (EOCD) signature 0x06054b50
  let eocdOffset = -1;
  const minEocdSearch = Math.max(0, zipBytes.length - 65557);
  for (let i = zipBytes.length - 22; i >= minEocdSearch; i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }

  if (eocdOffset < 0) {
    throw new Error('Invalid ZIP archive: End of Central Directory not found.');
  }

  const totalEntries = view.getUint16(eocdOffset + 10, true);
  const centralDirOffset = view.getUint32(eocdOffset + 16, true);

  const extracted: ZipEntryFile[] = [];
  let ptr = centralDirOffset;

  for (let i = 0; i < totalEntries; i++) {
    if (ptr + 46 > zipBytes.length || view.getUint32(ptr, true) !== 0x02014b50) {
      break;
    }
    const compressionMethod = view.getUint16(ptr + 10, true);
    const compressedSize = view.getUint32(ptr + 20, true);
    const fileNameLen = view.getUint16(ptr + 28, true);
    const extraLen = view.getUint16(ptr + 30, true);
    const commentLen = view.getUint16(ptr + 32, true);
    const localHeaderOffset = view.getUint32(ptr + 42, true);

    const rawName = decoder.decode(zipBytes.subarray(ptr + 46, ptr + 46 + fileNameLen));
    ptr += 46 + fileNameLen + extraLen + commentLen;

    // Skip directories and macOS AppleDouble metadata files
    if (
      rawName.endsWith('/') ||
      rawName.includes('__MACOSX/') ||
      rawName.split('/').some((part) => part.startsWith('._'))
    ) {
      continue;
    }

    const baseName = rawName.split('/').pop() || rawName;
    if (!/\.(tem|rcspack|rcspacke|rlrcspack|json|gz)$/i.test(baseName)) {
      continue;
    }

    if (
      localHeaderOffset + 30 > zipBytes.length ||
      view.getUint32(localHeaderOffset, true) !== 0x04034b50
    ) {
      continue;
    }

    const localNameLen = view.getUint16(localHeaderOffset + 26, true);
    const localExtraLen = view.getUint16(localHeaderOffset + 28, true);
    const dataStart = localHeaderOffset + 30 + localNameLen + localExtraLen;
    const dataEnd = dataStart + compressedSize;
    if (dataEnd > zipBytes.length) continue;

    const rawSlice = zipBytes.subarray(dataStart, dataEnd);
    if (compressionMethod === 0) {
      extracted.push({ name: baseName, data: new Uint8Array(rawSlice) });
    } else if (compressionMethod === 8) {
      const inflated = await inflateRawBytes(rawSlice);
      extracted.push({ name: baseName, data: inflated });
    }
  }

  return extracted;
}

/**
 * Builds a standard uncompressed (`STORE` method 0) `.zip` archive from a list of files.
 * Since each `.RCSPack` / `.RCSPackE` / `.RLRCSPack` entry is already GZIP-compressed,
 * `STORE` avoids redundant double-compression and executes instantaneously.
 */
export function createZipArchiveBytes(files: ZipEntryFile[]): Uint8Array {
  const encoder = new TextEncoder();
  const encodedNames = files.map((f) => encoder.encode(f.name));

  let totalLocalSize = 0;
  let totalCentralSize = 0;
  for (let i = 0; i < files.length; i++) {
    totalLocalSize += 30 + encodedNames[i].length + files[i].data.length;
    totalCentralSize += 46 + encodedNames[i].length;
  }

  const out = new Uint8Array(totalLocalSize + totalCentralSize + 22);
  const view = new DataView(out.buffer);

  let localOffset = 0;
  let centralOffset = totalLocalSize;

  for (let i = 0; i < files.length; i++) {
    const nameBytes = encodedNames[i];
    const data = files[i].data;
    const crc = computeCrc32(data);
    const size = data.length;
    const thisLocalOffset = localOffset;

    // Local file header (0x04034b50)
    view.setUint32(localOffset, 0x04034b50, true);
    view.setUint16(localOffset + 4, 20, true); // version needed
    view.setUint16(localOffset + 6, 0x0800, true); // UTF-8 flag
    view.setUint16(localOffset + 8, 0, true); // STORE method
    view.setUint16(localOffset + 10, 0, true); // mod time
    view.setUint16(localOffset + 12, 0, true); // mod date
    view.setUint32(localOffset + 14, crc, true);
    view.setUint32(localOffset + 18, size, true);
    view.setUint32(localOffset + 22, size, true);
    view.setUint16(localOffset + 26, nameBytes.length, true);
    view.setUint16(localOffset + 28, 0, true);
    out.set(nameBytes, localOffset + 30);
    out.set(data, localOffset + 30 + nameBytes.length);
    localOffset += 30 + nameBytes.length + size;

    // Central directory header (0x02014b50)
    view.setUint32(centralOffset, 0x02014b50, true);
    view.setUint16(centralOffset + 4, 20, true); // version made by
    view.setUint16(centralOffset + 6, 20, true); // version needed
    view.setUint16(centralOffset + 8, 0x0800, true); // UTF-8 flag
    view.setUint16(centralOffset + 10, 0, true); // STORE
    view.setUint16(centralOffset + 12, 0, true);
    view.setUint16(centralOffset + 14, 0, true);
    view.setUint32(centralOffset + 16, crc, true);
    view.setUint32(centralOffset + 20, size, true);
    view.setUint32(centralOffset + 24, size, true);
    view.setUint16(centralOffset + 28, nameBytes.length, true);
    view.setUint16(centralOffset + 30, 0, true);
    view.setUint16(centralOffset + 32, 0, true);
    view.setUint16(centralOffset + 34, 0, true);
    view.setUint16(centralOffset + 36, 0, true);
    view.setUint32(centralOffset + 38, 0, true);
    view.setUint32(centralOffset + 42, thisLocalOffset, true);
    out.set(nameBytes, centralOffset + 46);
    centralOffset += 46 + nameBytes.length;
  }

  // End of Central Directory (0x06054b50)
  view.setUint32(centralOffset, 0x06054b50, true);
  view.setUint16(centralOffset + 4, 0, true);
  view.setUint16(centralOffset + 6, 0, true);
  view.setUint16(centralOffset + 8, files.length, true);
  view.setUint16(centralOffset + 10, files.length, true);
  view.setUint32(centralOffset + 12, totalCentralSize, true);
  view.setUint32(centralOffset + 16, totalLocalSize, true);
  view.setUint16(centralOffset + 20, 0, true);

  return out;
}
