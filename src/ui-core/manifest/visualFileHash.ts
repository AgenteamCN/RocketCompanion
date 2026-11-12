/**
 * Deterministic 64-bit (16-hex-char) content hash for UI surface source files.
 * Shared between browser runtime (`liveSubtreeHashScanner.ts`) and Node scripts
 * so `uiApprovalLedger.json` `fileVisualHashes` and `visualAstHash` stay 1:1 identical.
 */

export function computeVisualFileHash(rawContent: string): string {
  const normalized = rawContent.replace(/\r\n/g, '\n').trim();
  let h1 = 0xdeadbeef ^ normalized.length;
  let h2 = 0x41c6ce57 ^ normalized.length;

  for (let i = 0; i < normalized.length; i++) {
    const ch = normalized.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }

  h1 =
    Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^
    Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 =
    Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^
    Math.imul(h1 ^ (h1 >>> 13), 3266489909);

  const hex1 = (h1 >>> 0).toString(16).padStart(8, '0');
  const hex2 = (h2 >>> 0).toString(16).padStart(8, '0');
  return `${hex1}${hex2}`;
}

export function computeCombinedVisualAstHash(
  fileVisualHashes: Record<string, string>
): string {
  const sortedEntries = Object.entries(fileVisualHashes)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([file, hash]) => `${file}:${hash}`)
    .join('|');
  return computeVisualFileHash(sortedEntries);
}
