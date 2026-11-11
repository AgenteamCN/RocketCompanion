import {
  computeCombinedVisualAstHash,
  computeVisualFileHash,
} from '../../../ui-core/manifest/visualFileHash';

type ImportMetaGlobRawFn = (
  pattern: string,
  options: { query: string; import: string; eager: boolean }
) => Record<string, string>;

const importMetaGlob = (
  import.meta as unknown as { glob?: ImportMetaGlobRawFn }
).glob;

const rawUiCoreSources: Record<string, string> =
  typeof importMetaGlob === 'function'
    ? importMetaGlob('../../../ui-core/**/*.{ts,tsx}', {
        query: '?raw',
        import: 'default',
        eager: true,
      })
    : {};

const liveFileHashMap = new Map<string, string>();

for (const [globKey, sourceText] of Object.entries(rawUiCoreSources)) {
  if (typeof sourceText !== 'string') continue;
  const normalizedRel = globKey.replace(/^(\.\.\/)+/, 'src/');
  liveFileHashMap.set(normalizedRel, computeVisualFileHash(sourceText));
}

export function getLiveFileVisualHash(fileRel: string): string | undefined {
  const cleanRel = fileRel.startsWith('src/') ? fileRel : `src/ui-core/${fileRel}`;
  return liveFileHashMap.get(cleanRel);
}

/**
 * Compares recorded `fileVisualHashes` in `uiApprovalLedger.json` against the
 * current on-disk source files loaded via Vite `?raw` glob.
 */
export function detectChangedSubtreeFiles(
  recordedHashes?: Record<string, string>
): string[] {
  if (!recordedHashes || liveFileHashMap.size === 0) return [];
  const changed: string[] = [];
  for (const [fileRel, recordedHash] of Object.entries(recordedHashes)) {
    const liveHash = liveFileHashMap.get(fileRel);
    if (liveHash && liveHash !== recordedHash) {
      changed.push(fileRel);
    }
  }
  return changed.sort();
}

/**
 * Computes a combined fingerprint of all live files in a surface/variant's subtree
 * so runtime decisions stored in `localStorage` automatically invalidate if any
 * file in the surface's subtree is edited on disk.
 */
export function computeLiveSubtreeCombinedHash(
  recordedHashes?: Record<string, string>,
  fallbackEntryFile?: string
): string {
  const liveMap: Record<string, string> = {};
  if (recordedHashes) {
    for (const [fileRel, recordedHash] of Object.entries(recordedHashes)) {
      liveMap[fileRel] = liveFileHashMap.get(fileRel) ?? recordedHash;
    }
  }
  if (fallbackEntryFile) {
    const cleanRel = fallbackEntryFile.startsWith('src/')
      ? fallbackEntryFile
      : `src/ui-core/${fallbackEntryFile}`;
    const liveEntry = liveFileHashMap.get(cleanRel);
    if (liveEntry) {
      liveMap[cleanRel] = liveEntry;
    }
  }
  return computeCombinedVisualAstHash(liveMap);
}
