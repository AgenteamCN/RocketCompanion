/**
 * StaticTrainingPackCodec.ts
 * GZIP archive compression/decompression, .RCSPack / .RCSPackE / .RLRCSPack export/import,
 * batch .zip import/export, and single-shot .json codec.
 */

import { type StaticTrainingPackMetadata, type StaticTrainingShotItem, type StaticTrainingPackFormatType, type RCSPackArchive, generateUUID, createDefaultShotItem, cloneShotItem } from './staticTrainingPackTypes';
import { cloneVariationConfig } from './staticTrainingVariationTypes';
import { isTemBinaryPayload, parseTemBinaryBytes } from './temPropertyDeserializer';
import { convertParsedTemToRCSPackBundle, type ParsedTemTrainingPack, type TemToRCSPackConversionResult } from './temTrainingPackParser';
import { derivePackTagsAndMetadata } from './temMetadataAndTagClassifier';
import { resolveRecommendedVariationForPack } from './staticTrainingVariationTypes';
import {
  isZipBinaryPayload,
  extractFilesFromZipBytes,
  createZipArchiveBytes,
  type ZipEntryFile,
} from './staticTrainingZipCodec';

export type { ParsedTemTrainingPack, TemToRCSPackConversionResult, ZipEntryFile };

export interface ExportRCSPackOptions {
  /**
   * When true, exports as `.RCSPackE` (Editable pack) preserving `editorFreeCam` on each shot.
   * When false (default), exports as `.RCSPack` and strips `editorFreeCam` to reduce payload size.
   */
  editable?: boolean;
  /**
   * Optional explicit format override (`RLRCSPack` | `RCSPackE` | `RCSPack`).
   */
  formatOverride?: StaticTrainingPackFormatType;
}

export async function compressGzipBytes(rawBytes: Uint8Array): Promise<Uint8Array> {
  if (typeof CompressionStream !== 'undefined') {
    try {
      const cs = new CompressionStream('gzip');
      const writer = cs.writable.getWriter();
      writer.write(rawBytes as unknown as BufferSource);
      writer.close();
      const resp = new Response(cs.readable);
      const buf = await resp.arrayBuffer();
      return new Uint8Array(buf);
    } catch (err) {
      console.warn('[StaticTrainingPackCodec] GZIP compression fallback to raw UTF-8:', err);
    }
  } else {
    console.warn('[StaticTrainingPackCodec] CompressionStream is undefined; falling back to uncompressed UTF-8 bytes.');
  }
  return rawBytes;
}

export async function decompressGzipOrText(bytes: Uint8Array): Promise<string> {
  const isGzip = bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;
  if (isGzip) {
    if (typeof DecompressionStream !== 'undefined') {
      const ds = new DecompressionStream('gzip');
      const writer = ds.writable.getWriter();
      writer.write(bytes as unknown as BufferSource);
      writer.close();
      const resp = new Response(ds.readable);
      return await resp.text();
    }
    console.warn('[StaticTrainingPackCodec] GZIP magic header detected (0x1f8b) but DecompressionStream is undefined; falling back to TextDecoder.');
  }
  return new TextDecoder().decode(bytes);
}

export function sanitizeFileSegment(text: string): string {
  return (
    (text || 'TrainingPack')
      .trim()
      .replace(/[^a-zA-Z0-9_\-\u4e00-\u9fa5]+/g, '_')
      .replace(/^_+|_+$/g, '') || 'TrainingPack'
  );
}

export function triggerBrowserDownload(blob: Blob, filename: string): void {
  if (typeof document === 'undefined') return;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 200);
}

export interface DecodeRCSPackOptions {
  /**
   * When false (Normal User Mode), `.RLRCSPack` and `.Tem` files are rejected.
   * Default: true.
   */
  allowDevFormats?: boolean;
}

/**
 * Serializes a Static Training Pack into a GZIP-compressed binary payload + filename.
 *
 * Format rules:
 * - `RLRCSPack`: Developer format imported from `.Tem`. Preserves `originalDescription` and per-shot `editorFreeCam`.
 * - `RCSPackE`: Editable native format. Preserves per-shot `editorFreeCam`, strips `originalDescription`.
 * - `RCSPack`: Compact read-only native format. Strips both `originalDescription` and per-shot `editorFreeCam`.
 */
export async function encodeStaticTrainingPackBytes(
  metadata: StaticTrainingPackMetadata,
  items: StaticTrainingShotItem[],
  options?: ExportRCSPackOptions
): Promise<{ filename: string; bytes: Uint8Array; format: StaticTrainingPackFormatType }> {
  const editable = Boolean(options?.editable);
  const format: StaticTrainingPackFormatType =
    options?.formatOverride ?? (editable ? 'RCSPackE' : 'RCSPack');
  const preserveCam = format === 'RCSPackE' || format === 'RLRCSPack';
  const preserveOriginalDesc = format === 'RLRCSPack';

  const normalizedItems = items.map((it, idx) => {
    const cloned = cloneShotItem(it, idx);
    if (!preserveCam && cloned.editorFreeCam) {
      delete cloned.editorFreeCam;
    }
    return cloned;
  });

  const cleanMeta: StaticTrainingPackMetadata = {
    ...metadata,
    itemCount: normalizedItems.length,
    sourcePackType: format,
  };
  if (!preserveOriginalDesc) {
    delete cleanMeta.originalDescription;
    delete cleanMeta.isBuiltInDevPack;
  }

  const archive: RCSPackArchive = {
    format,
    version: 2,
    category: 'static-training-pack',
    metadata: cleanMeta,
    items: normalizedItems,
  };

  const jsonStr = JSON.stringify(archive);
  const rawBytes = new TextEncoder().encode(jsonStr);
  const compressedBytes = await compressGzipBytes(rawBytes);

  const safeTitle = sanitizeFileSegment(metadata.title);
  const ext = format === 'RCSPackE' ? 'RCSPackE' : format === 'RLRCSPack' ? 'RLRCSPack' : 'RCSPack';
  const filename = `${safeTitle}_${metadata.uuid}.${ext}`;
  return { filename, bytes: compressedBytes, format };
}

/**
 * Exports a Static Training Pack as a compressed `<Title>_<UUID>.RCSPack`, `.RCSPackE`, or `.RLRCSPack` file
 * containing embedded metadata and ordered items.
 */
export async function exportStaticTrainingPackRCSPack(
  metadata: StaticTrainingPackMetadata,
  items: StaticTrainingShotItem[],
  options?: ExportRCSPackOptions
): Promise<string> {
  const { filename, bytes } = await encodeStaticTrainingPackBytes(metadata, items, options);
  const blob = new Blob([bytes as unknown as BlobPart], {
    type: 'application/octet-stream',
  });
  triggerBrowserDownload(blob, filename);
  return filename;
}

/**
 * Exports a batch of Static Training Packs as a single `<Folder>_<Count>_<Format>.zip` archive.
 */
export async function exportBatchStaticTrainingPacksZip(
  packs: Array<{ metadata: StaticTrainingPackMetadata; items: StaticTrainingShotItem[] }>,
  bundleName = 'TrainingPacks',
  options?: ExportRCSPackOptions
): Promise<string> {
  const zipEntries: ZipEntryFile[] = [];
  for (const pack of packs) {
    const { filename, bytes } = await encodeStaticTrainingPackBytes(
      pack.metadata,
      pack.items,
      options
    );
    zipEntries.push({ name: filename, data: bytes });
  }
  const zipBytes = createZipArchiveBytes(zipEntries);
  const safeName = sanitizeFileSegment(bundleName);
  const extSuffix =
    options?.formatOverride ?? (options?.editable ? 'RCSPackE' : 'RCSPack');
  const zipFilename = `${safeName}_${packs.length}_${extSuffix}.zip`;
  const blob = new Blob([zipBytes as unknown as BlobPart], {
    type: 'application/zip',
  });
  triggerBrowserDownload(blob, zipFilename);
  return zipFilename;
}

/**
 * Decodes raw bytes of a single `.RCSPack`, `.RCSPackE`, `.RLRCSPack`, or `.Tem` file.
 */
export async function decodeSinglePackBytes(
  bytes: Uint8Array,
  fileName = 'ImportedPack.RCSPack',
  options?: DecodeRCSPackOptions
): Promise<{ metadata: StaticTrainingPackMetadata; items: StaticTrainingShotItem[] }> {
  const allowDevFormats = options?.allowDevFormats ?? true;

  if (isTemBinaryPayload(bytes, fileName)) {
    if (!allowDevFormats) {
      throw new Error('.Tem training packs can only be imported in Developer Mode.');
    }
    const parsedTem = parseTemBinaryBytes(bytes, fileName);
    const converted = convertParsedTemToRCSPackBundle(parsedTem);
    return { metadata: converted.metadata, items: converted.items };
  }

  if (!allowDevFormats && /\.rlrcspack$/i.test(fileName)) {
    throw new Error('.RLRCSPack training packs can only be imported in Developer Mode.');
  }

  const text = await decompressGzipOrText(bytes);
  const parsed = JSON.parse(text);

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Invalid .RCSPack archive payload');
  }

  const rawMeta = parsed.metadata || {};

  // Extension takes precedence so renaming .RCSPack <-> .RCSPackE controls editability
  const sourcePackType: StaticTrainingPackFormatType = /\.rlrcspack$/i.test(fileName)
    ? 'RLRCSPack'
    : /\.rcspacke$/i.test(fileName)
    ? 'RCSPackE'
    : /\.rcspack$/i.test(fileName)
    ? 'RCSPack'
    : parsed.format === 'RLRCSPack' || rawMeta.sourcePackType === 'RLRCSPack'
    ? 'RLRCSPack'
    : parsed.format === 'RCSPackE' || rawMeta.sourcePackType === 'RCSPackE'
    ? 'RCSPackE'
    : 'RCSPack';

  if (!allowDevFormats && sourcePackType === 'RLRCSPack') {
    throw new Error('.RLRCSPack training packs can only be imported in Developer Mode.');
  }

  const isReadOnlyRCSPack = sourcePackType === 'RCSPack';
  const rawItems = Array.isArray(parsed.items) ? parsed.items : [];
  const now = Date.now();
  const uuid =
    typeof rawMeta.uuid === 'string' && rawMeta.uuid.trim().length > 0
      ? rawMeta.uuid.trim()
      : generateUUID();

  const items: StaticTrainingShotItem[] = rawItems.map((it: unknown, idx: number) => {
    const cloned = cloneShotItem(it as Partial<StaticTrainingShotItem>, idx);
    if (isReadOnlyRCSPack && cloned.editorFreeCam) {
      delete cloned.editorFreeCam;
    }
    return cloned;
  });
  if (items.length === 0) {
    items.push(createDefaultShotItem(0));
  }

  const title =
    typeof rawMeta.title === 'string' && rawMeta.title.trim()
      ? rawMeta.title.trim()
      : fileName.replace(/\.(rcspacke?|rlrcspack|tem|gz|json)$/i, '') || 'Imported Pack';

  const code = typeof rawMeta.code === 'string' && rawMeta.code.trim() ? rawMeta.code.trim() : undefined;
  const creator =
    typeof rawMeta.creator === 'string' && rawMeta.creator.trim()
      ? rawMeta.creator.trim()
      : undefined;

  const derived = derivePackTagsAndMetadata({ title, creator, code });
  const rawTagsList = Array.isArray(rawMeta.tags)
    ? (rawMeta.tags as unknown[])
        .filter((t): t is string => typeof t === 'string' && Boolean(t.trim()))
        .map((t) => (t === 'Local' || t === 'Community' ? 'Others' : t.trim()))
    : null;
  const mergedTags = Array.from(new Set(rawTagsList !== null ? rawTagsList : derived.tags));

  const recommendedVariation = rawMeta.recommendedVariation
    ? cloneVariationConfig(rawMeta.recommendedVariation)
    : resolveRecommendedVariationForPack(code, title, creator);

  const hasPsyonixTag = mergedTags.some((t) => t.toLowerCase() === 'psyonix');
  const effectiveRankTier = hasPsyonixTag
    ? (typeof rawMeta.rankTier === 'string' && rawMeta.rankTier) || derived.rankTier
    : undefined;

  const metadata: StaticTrainingPackMetadata = {
    uuid,
    title,
    description: typeof rawMeta.description === 'string' ? rawMeta.description : '',
    ...(sourcePackType === 'RLRCSPack' &&
    typeof rawMeta.originalDescription === 'string' &&
    rawMeta.originalDescription
      ? { originalDescription: rawMeta.originalDescription }
      : {}),
    ...(code ? { code } : {}),
    ...(creator || derived.normalizedCreator
      ? { creator: creator || derived.normalizedCreator }
      : {}),
    ...(mergedTags.length > 0 ? { tags: mergedTags } : {}),
    ...(rawMeta.releaseYearMonth || derived.releaseYearMonth
      ? { releaseYearMonth: rawMeta.releaseYearMonth || derived.releaseYearMonth }
      : {}),
    ...(effectiveRankTier ? { rankTier: effectiveRankTier } : {}),
    sourcePackType,
    ...(recommendedVariation ? { recommendedVariation } : {}),
    createdAt: Number(rawMeta.createdAt) || now,
    updatedAt: Number(rawMeta.updatedAt) || now,
    itemCount: items.length,
  };

  return { metadata, items };
}

/**
 * Decodes a `.RCSPack`, `.RCSPackE`, `.RLRCSPack`, or `.Tem` file payload into normalized metadata and shot items.
 */
export async function decodeRCSPackFilePayload(
  file: File,
  options?: DecodeRCSPackOptions
): Promise<{ metadata: StaticTrainingPackMetadata; items: StaticTrainingShotItem[] }> {
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  return decodeSinglePackBytes(bytes, file.name, options);
}

/**
 * Decodes a single File or a `.zip` archive containing multiple `.Tem` / `.RCSPack` / `.RCSPackE` / `.RLRCSPack` files.
 * Deduplicates by `metadata.uuid`.
 */
export async function decodeMultiOrZipPackFiles(
  files: File[] | FileList,
  options?: DecodeRCSPackOptions
): Promise<Array<{ metadata: StaticTrainingPackMetadata; items: StaticTrainingShotItem[] }>> {
  const fileArray = Array.from(files);
  const resultsMap = new Map<
    string,
    { metadata: StaticTrainingPackMetadata; items: StaticTrainingShotItem[] }
  >();

  for (const file of fileArray) {
    const buf = await file.arrayBuffer();
    const bytes = new Uint8Array(buf);

    if (isZipBinaryPayload(bytes, file.name)) {
      const entries = await extractFilesFromZipBytes(bytes);
      for (const entry of entries) {
        try {
          const decoded = await decodeSinglePackBytes(entry.data, entry.name, options);
          resultsMap.set(decoded.metadata.uuid, decoded);
        } catch (err) {
          console.warn(`[StaticTrainingPackCodec] Skipping zip entry "${entry.name}":`, err);
        }
      }
    } else {
      const decoded = await decodeSinglePackBytes(bytes, file.name, options);
      resultsMap.set(decoded.metadata.uuid, decoded);
    }
  }

  return Array.from(resultsMap.values());
}

/**
 * Exports a single shot item as a standalone `.json` file.
 */
export function exportSingleShotItemToJson(
  item: StaticTrainingShotItem,
  packTitle = 'Pack'
): string {
  const payload = {
    format: 'RCStaticShotItem',
    version: 2,
    exportedAt: Date.now(),
    shot: cloneShotItem(item, item.index),
  };
  const jsonStr = JSON.stringify(payload, null, 2);
  const safePack = sanitizeFileSegment(packTitle);
  const filename = `${safePack}_shot_${(item.index ?? 0) + 1}.json`;
  const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8' });
  triggerBrowserDownload(blob, filename);
  return filename;
}

/**
 * Parses a single shot item from a `.json` file.
 */
export async function parseSingleShotItemFromJsonFile(
  file: File,
  targetIndex = 0
): Promise<StaticTrainingShotItem> {
  const text = await file.text();
  const parsed = JSON.parse(text);
  const rawShot = parsed?.shot || parsed;
  if (!rawShot || typeof rawShot !== 'object' || (!rawShot.car && !rawShot.ball)) {
    throw new Error('Invalid shot item JSON format');
  }
  return cloneShotItem(rawShot, targetIndex);
}
