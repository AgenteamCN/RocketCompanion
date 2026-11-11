const UNDEFINED_SENTINEL = '__RC_UI_TUNER_SYNC_UNDEFINED__';

export function cloneSerializable<T>(val: T): T {
  if (val === null || val === undefined || typeof val !== 'object') {
    return val;
  }
  try {
    return JSON.parse(JSON.stringify(val)) as T;
  } catch {
    return val;
  }
}

export function isPlainObject(val: unknown): val is Record<string, unknown> {
  if (typeof val !== 'object' || val === null || Array.isArray(val)) return false;
  const proto = Object.getPrototypeOf(val);
  return proto === null || proto === Object.prototype;
}

/**
 * Validates and sanitizes an incoming or cached sync value against the hook's
 * canonical default value so that schema evolution, newly added fields, or stale
 * positional keys can never inject incompatible types (e.g. a number into an object)
 * or missing sub-properties into component state.
 */
export function sanitizeSyncedValue<T>(candidate: unknown, defaultValue: T): T {
  if (defaultValue === undefined || defaultValue === null) {
    return (candidate === undefined ? defaultValue : candidate) as T;
  }

  if (typeof defaultValue === 'boolean') {
    return (typeof candidate === 'boolean' ? candidate : defaultValue) as T;
  }

  if (typeof defaultValue === 'number') {
    if (candidate === null) return candidate as unknown as T;
    if (typeof candidate === 'number' && Number.isFinite(candidate)) {
      return candidate as T;
    }
    return defaultValue;
  }

  if (typeof defaultValue === 'string') {
    if (candidate === null) return candidate as unknown as T;
    if (typeof candidate === 'string') {
      return candidate as T;
    }
    return defaultValue;
  }

  if (Array.isArray(defaultValue)) {
    return (Array.isArray(candidate) ? candidate : cloneSerializable(defaultValue)) as T;
  }

  if (isPlainObject(defaultValue)) {
    if (!isPlainObject(candidate)) {
      return cloneSerializable(defaultValue);
    }
    const merged: Record<string, unknown> = { ...defaultValue, ...candidate };
    for (const key of Object.keys(defaultValue)) {
      merged[key] = sanitizeSyncedValue(candidate[key], defaultValue[key]);
    }
    return merged as T;
  }

  return (candidate ?? defaultValue) as T;
}

export function isSyncSerializable(val: unknown, depth = 0): boolean {
  if (depth > 8) return false;
  if (
    val === null ||
    val === undefined ||
    typeof val === 'string' ||
    typeof val === 'number' ||
    typeof val === 'boolean'
  ) {
    return true;
  }
  if (typeof val === 'function' || typeof val === 'symbol' || typeof val === 'bigint') {
    return false;
  }
  if (Array.isArray(val)) {
    for (let i = 0; i < val.length; i += 1) {
      if (!isSyncSerializable(val[i], depth + 1)) return false;
    }
    return true;
  }
  if (typeof val === 'object') {
    const obj = val as Record<string, unknown>;
    if (
      '$$typeof' in obj ||
      'nodeType' in obj ||
      (typeof Element !== 'undefined' && val instanceof Element) ||
      (typeof Event !== 'undefined' && val instanceof Event)
    ) {
      return false;
    }
    const proto = Object.getPrototypeOf(val);
    if (proto !== null && proto !== Object.prototype) {
      return false;
    }
    for (const k of Object.keys(obj)) {
      if (!isSyncSerializable(obj[k], depth + 1)) return false;
    }
    return true;
  }
  return false;
}

export function encodeEntriesForWire(entries: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(entries)) {
    out[k] = v === undefined ? UNDEFINED_SENTINEL : v;
  }
  return out;
}

export function decodeEntriesFromWire(entries: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(entries)) {
    out[k] = v === UNDEFINED_SENTINEL ? undefined : v;
  }
  return out;
}
