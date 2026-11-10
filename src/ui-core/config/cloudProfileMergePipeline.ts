/**
 * cloudProfileMergePipeline.ts
 * Pure Git-style 3-Way Merge (devBase vs local/user vs dev) and flat key-value normalization
 * for Cloud Profile Sync.
 *
 * Merge Rules per field key K:
 *   1. If dev[K] === devBase[K]: Developer did not modify K in their push -> keep local[K].
 *   2. If local[K] === devBase[K]: User did not modify K since base -> auto-apply dev[K].
 *   3. If local[K] === dev[K]: Both modified K to the exact same value -> keep local[K] (no conflict).
 *   4. Otherwise (local[K] !== devBase[K] && dev[K] !== devBase[K] && local[K] !== dev[K]):
 *      True 3-Way Conflict! Surface in `conflicts` so the user can choose My Value vs Developer Value.
 */

import {
  formatSyncFieldLabel,
  type ProfileFlatSnapshot,
  type ProfileMergeConflictItem,
  type ProfileThreeWayMergeResult,
} from './cloudProfileSyncTypes.ts';

export function isDeepEqualJsonValue(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null || typeof a !== 'object') return false;
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

export function flattenNestedConfigObject(
  prefix: string,
  obj: object | null | undefined,
  target: ProfileFlatSnapshot = {}
): ProfileFlatSnapshot {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    return target;
  }
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || typeof v === 'function') continue;
    const fullKey = prefix ? `${prefix}.${k}` : k;
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      flattenNestedConfigObject(fullKey, v, target);
    } else {
      target[fullKey] = v;
    }
  }
  return target;
}

export function unflattenConfigPrefix<T extends object>(
  snapshot: ProfileFlatSnapshot,
  prefix: string,
  baseDefaults: T
): T {
  const clone: Record<string, unknown> = JSON.parse(JSON.stringify(baseDefaults));
  const dotPrefix = `${prefix}.`;

  for (const [fullKey, val] of Object.entries(snapshot)) {
    if (!fullKey.startsWith(dotPrefix) || val === undefined) continue;
    const pathParts = fullKey.slice(dotPrefix.length).split('.');
    let cursor: Record<string, unknown> = clone;
    for (let i = 0; i < pathParts.length - 1; i++) {
      const part = pathParts[i];
      if (!cursor[part] || typeof cursor[part] !== 'object' || Array.isArray(cursor[part])) {
        cursor[part] = {};
      }
      cursor = cursor[part] as Record<string, unknown>;
    }
    cursor[pathParts[pathParts.length - 1]] = val;
  }

  return clone as T;
}

export function computeProfileThreeWayMerge(
  baseSnapshot: ProfileFlatSnapshot | null | undefined,
  localSnapshot: ProfileFlatSnapshot,
  remoteDevSnapshot: ProfileFlatSnapshot | null | undefined
): ProfileThreeWayMergeResult {
  if (!remoteDevSnapshot || Object.keys(remoteDevSnapshot).length === 0) {
    return {
      mergedSnapshot: { ...localSnapshot },
      autoAppliedDevKeys: [],
      keptLocalKeys: Object.keys(localSnapshot),
      conflicts: [],
    };
  }

  const effectiveBase = baseSnapshot && Object.keys(baseSnapshot).length > 0
    ? baseSnapshot
    : localSnapshot;

  const allKeys = new Set<string>([
    ...Object.keys(effectiveBase),
    ...Object.keys(localSnapshot),
    ...Object.keys(remoteDevSnapshot),
  ]);

  const mergedSnapshot: ProfileFlatSnapshot = {};
  const autoAppliedDevKeys: string[] = [];
  const keptLocalKeys: string[] = [];
  const conflicts: ProfileMergeConflictItem[] = [];

  for (const key of Array.from(allKeys).sort()) {
    const baseVal = effectiveBase[key];
    const localVal = localSnapshot[key];
    const devVal = remoteDevSnapshot[key];

    const devChanged = !isDeepEqualJsonValue(devVal, baseVal);
    const localChanged = !isDeepEqualJsonValue(localVal, baseVal);

    if (!devChanged) {
      if (localVal !== undefined) {
        mergedSnapshot[key] = localVal;
        keptLocalKeys.push(key);
      }
      continue;
    }

    if (!localChanged || isDeepEqualJsonValue(localVal, devVal)) {
      if (devVal !== undefined) {
        mergedSnapshot[key] = devVal;
      }
      autoAppliedDevKeys.push(key);
      continue;
    }

    // Both local and developer changed this key to different values -> conflict!
    mergedSnapshot[key] = localVal;
    conflicts.push({
      key,
      label: formatSyncFieldLabel(key),
      baseValue: baseVal,
      localValue: localVal,
      devValue: devVal,
      selectedSource: 'dev',
    });
  }

  return {
    mergedSnapshot,
    autoAppliedDevKeys,
    keptLocalKeys,
    conflicts,
  };
}

export function buildEffectiveDevMergeBase(
  sessionBaseSnapshot: ProfileFlatSnapshot | null | undefined,
  previousAppliedDevSnapshot: ProfileFlatSnapshot | null | undefined,
  currentLocalSnapshot: ProfileFlatSnapshot
): ProfileFlatSnapshot {
  const sessionBase = sessionBaseSnapshot ?? {};
  const prevDev = previousAppliedDevSnapshot ?? {};
  if (Object.keys(prevDev).length === 0) {
    return { ...sessionBase };
  }

  const allKeys = new Set<string>([
    ...Object.keys(sessionBase),
    ...Object.keys(prevDev),
    ...Object.keys(currentLocalSnapshot),
  ]);

  const effectiveBase: ProfileFlatSnapshot = {};
  for (const key of allKeys) {
    const localVal = currentLocalSnapshot[key];
    const prevDevVal = prevDev[key];
    const sessionVal = sessionBase[key];

    if (isDeepEqualJsonValue(localVal, prevDevVal)) {
      if (prevDevVal !== undefined) {
        effectiveBase[key] = prevDevVal;
      }
    } else if (sessionVal !== undefined) {
      effectiveBase[key] = sessionVal;
    }
  }
  return effectiveBase;
}

export function normalizeCloudUsername(raw: string): string {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '');
}

export function generateCloudUserId(seedHint?: string): string {
  const cleanHint = seedHint ? normalizeCloudUsername(seedHint) : '';
  if (cleanHint) {
    let h1 = 0x811c9dc5;
    let h2 = 0x9e3779b9;
    const saltStr = `rc_uid_v2:${cleanHint}`;
    for (let i = 0; i < saltStr.length; i++) {
      const ch = saltStr.charCodeAt(i);
      h1 ^= ch;
      h1 = Math.imul(h1, 0x01000193);
      h2 ^= ch + 0x9e3779b9 + (h2 << 6) + (h2 >>> 2);
      h2 = Math.imul(h2, 0x85ebca6b);
    }
    const p1 = ((h1 >>> 0) & 0xffff).toString(16).padStart(4, '0');
    const p2 = ((h2 >>> 0) & 0xffff).toString(16).padStart(4, '0');
    return `u_${p1}${p2}`;
  }

  const bytes = new Uint8Array(4);
  if (typeof globalThis.crypto !== 'undefined' && typeof globalThis.crypto.getRandomValues === 'function') {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    const now = Date.now() ^ Math.floor(Math.random() * 0xffffffff);
    bytes[0] = (now >>> 24) & 0xff;
    bytes[1] = (now >>> 16) & 0xff;
    bytes[2] = (now >>> 8) & 0xff;
    bytes[3] = now & 0xff;
  }
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return `u_${hex}`;
}

/**
 * Computes a deterministic 7-character Git-style short commit hash (`[0-9a-f]{7}`)
 * from a profile snapshot and revision metadata.
 */
export function computeCommitHashSync(
  snapshot: ProfileFlatSnapshot | null | undefined,
  rev: number = 1,
  salt: string = ''
): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x9e3779b9;
  const feed = (str: string) => {
    for (let i = 0; i < str.length; i++) {
      const ch = str.charCodeAt(i);
      h1 ^= ch;
      h1 = Math.imul(h1, 0x01000193);
      h2 ^= ch + 0x9e3779b9 + (h2 << 6) + (h2 >>> 2);
      h2 = Math.imul(h2, 0x85ebca6b);
    }
  };

  feed(`rev:${rev}|salt:${salt}|`);
  if (snapshot && typeof snapshot === 'object') {
    const keys = Object.keys(snapshot).sort();
    for (const k of keys) {
      let serialized = '';
      try {
        serialized = JSON.stringify(snapshot[k]);
      } catch {
        serialized = String(snapshot[k]);
      }
      feed(`${k}=${serialized};`);
    }
  }

  const hex1 = (h1 >>> 0).toString(16).padStart(8, '0');
  const hex2 = (h2 >>> 0).toString(16).padStart(8, '0');
  return `${hex1}${hex2}`.slice(0, 7);
}

export function formatCloudCommitHash(
  revHash?: string | null,
  rev?: number | null
): string {
  const clean = typeof revHash === 'string' ? revHash.trim().toLowerCase() : '';
  if (/^[0-9a-f]{6,12}$/.test(clean)) {
    return clean.slice(0, 7);
  }
  const numRev = Number(rev) || 0;
  if (numRev <= 0) {
    return 'none';
  }
  return computeCommitHashSync(null, numRev, `legacy-rev-${numRev}`);
}

