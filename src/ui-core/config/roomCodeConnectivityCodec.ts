/**
 * roomCodeConnectivityCodec.ts
 * Pure-function room code encoder/decoder and 4-bit relay connectivity bitmask pipeline.
 *
 * Fixed 4-relay slot bitmask definition (mask in [0, 15]):
 *   Bit 3 (0b1000 = 8): emqx_cn      (EMQX Hangzhou)
 *   Bit 2 (0b0100 = 4): emqx_gb      (EMQX Global Asia-SE1)
 *   Bit 1 (0b0010 = 2): supabase_jp  (Supabase Tokyo RTJP)
 *   Bit 0 (0b0001 = 1): supabase_sg  (Supabase Singapore RTSG)
 *
 * Room Code Checksum & Identity Separation:
 * - Random 4-digit codes restrict `seed` to [0, 199] (`MAX_RANDOM_SEED = 199`) and `mask` to [1, 15].
 *   This produces 200 * 15 = 3,000 valid 4-digit codes and rejects 70% of random 4-digit typos
 *   (`mask === 0` or `seed > 199`) in 0ms locally before any network connection is opened.
 * - `identityKey` decouples the immutable room identity (`seed:<n>` or `custom:<prefix>`) from
 *   the mutable 4-bit `hostMask`, ensuring the encrypted channel `topicHash` never changes
 *   even if a Host re-probes and updates the room code's embedded connectivity mask.
 */

export type CanonicalRelayId = 'emqx_cn' | 'emqx_gb' | 'supabase_jp' | 'supabase_sg';
export type CanonicalEdgeNodeId = 'supabase_jp' | 'supabase_sg';
export type RelaySlotKey = CanonicalRelayId;

export const RELAY_SLOT_BITS: Readonly<Record<CanonicalRelayId, number>> = Object.freeze({
  emqx_cn: 0b1000, // 8
  emqx_gb: 0b0100, // 4
  supabase_jp: 0b0010, // 2
  supabase_sg: 0b0001, // 1
});

export const CANONICAL_RELAY_ORDER: readonly CanonicalRelayId[] = Object.freeze([
  'emqx_cn',
  'emqx_gb',
  'supabase_jp',
  'supabase_sg',
]);

export const RELAY_SLOT_ORDER: readonly CanonicalRelayId[] = CANONICAL_RELAY_ORDER;

/**
 * Normalizes a raw relay identifier to one of the 4 canonical IDs:
 *   'emqx_cn' | 'emqx_gb' | 'supabase_jp' | 'supabase_sg'
 * Returns null for unrecognized or legacy identifiers.
 */
export function normalizeCanonicalRelayId(raw: string | null | undefined): CanonicalRelayId | null {
  const clean = String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
  if (
    clean === 'emqx_cn' ||
    clean === 'emqx_gb' ||
    clean === 'supabase_jp' ||
    clean === 'supabase_sg'
  ) {
    return clean;
  }
  return null;
}

export function getSlotBitForRelayId(rawId: string | null | undefined): number {
  const canonical = normalizeCanonicalRelayId(rawId);
  return canonical ? RELAY_SLOT_BITS[canonical] : 0;
}

export function computeConnectivityMaskFromRelayIds(relayIds: Iterable<string>): number {
  let mask = 0;
  for (const id of relayIds) {
    mask |= getSlotBitForRelayId(id);
  }
  return mask & 0x0f;
}

export interface DecodedRandomRoomCode {
  mask: number;
  seed: number;
  valid: boolean;
}

export interface ParsedRoomCodeResult {
  mode: 'random' | 'custom';
  canonicalRoomCode: string;
  identityKey: string;
  customPrefix: string;
  hostMask: number;
  seed: number | null;
}

export interface SignalingRouteDecision {
  routeType: 'direct-shared' | 'edge-function-bridge' | 'unroutable';
  hostMask: number;
  clientMask: number;
  sharedMask: number;
  candidateSlots: CanonicalRelayId[];
}

const AFFINE_MUL = 3333;
const AFFINE_ADD = 4821;
const AFFINE_INV = 9997;
const AFFINE_MOD = 10000;
export const MAX_RANDOM_SEED = 199;

export function clampConnectivityMask(mask: number): number {
  if (!Number.isFinite(mask)) return 0;
  return Math.floor(mask) & 0x0f;
}

/**
 * Scheme A: Bijective affine obfuscation for 4-digit numeric room codes ("0000".."9999").
 * Embeds a 4-bit connectivity mask (1..15) and a random seed (0..199).
 */
export function generateRandomRoomCode(mask = 0x0f, explicitSeed?: number): string {
  const cleanMask = clampConnectivityMask(mask) || 0x0f;
  const seed =
    typeof explicitSeed === 'number' && Number.isFinite(explicitSeed)
      ? Math.max(0, Math.min(MAX_RANDOM_SEED, Math.floor(explicitSeed)))
      : Math.floor(Math.random() * (MAX_RANDOM_SEED + 1));

  const x = seed * 16 + cleanMask;
  const code = (x * AFFINE_MUL + AFFINE_ADD) % AFFINE_MOD;
  return String(code).padStart(4, '0');
}

export function decodeRandomRoomCode(code4: string): DecodedRandomRoomCode | null {
  const trimmed = String(code4 || '').trim();
  if (!/^\d{4}$/.test(trimmed)) {
    return null;
  }
  const numeric = Number(trimmed);
  const shifted = (((numeric - AFFINE_ADD) % AFFINE_MOD) + AFFINE_MOD) % AFFINE_MOD;
  const x = (shifted * AFFINE_INV) % AFFINE_MOD;
  const mask = x & 0x0f;
  const seed = x >> 4;
  return {
    mask,
    seed,
    valid: mask > 0 && seed >= 0 && seed <= MAX_RANDOM_SEED,
  };
}

/**
 * Sanitizes user input for Custom room codes:
 * strips spaces, hyphens, and non-alphanumeric characters.
 */
export function sanitizeCustomRoomPrefix(rawInput: string): string {
  return String(rawInput || '').replace(/[^a-zA-Z0-9]/g, '');
}

/**
 * Scheme B: Formats a custom alphanumeric room prefix with a `-${hex}` 4-bit mask suffix.
 * Always normalizes to lowercase for case-insensitive room derivation.
 */
export function formatCustomRoomCode(customInput: string, mask: number): string {
  const cleanPrefix = sanitizeCustomRoomPrefix(customInput).toLowerCase();
  if (!cleanPrefix) return '';
  const hexMask = (clampConnectivityMask(mask) || 0x0f).toString(16);
  return `${cleanPrefix}-${hexMask}`;
}

/**
 * Strips an existing `-[0-9a-f]` suffix if present and re-applies the updated mask.
 * If the input is a 4-digit random code, preserves the random seed and updates the embedded mask.
 */
export function applyConnectivityMaskToRoomCode(rawRoomCode: string, mask: number): string {
  const trimmed = String(rawRoomCode || '').trim();
  const cleanMask = clampConnectivityMask(mask) || 0x0f;

  const decodedRandom = decodeRandomRoomCode(trimmed);
  if (decodedRandom && decodedRandom.seed <= MAX_RANDOM_SEED) {
    return generateRandomRoomCode(cleanMask, decodedRandom.seed);
  }

  const customMatch = /^([a-zA-Z0-9]+)(?:-[0-9a-fA-F])?$/.exec(trimmed);
  if (customMatch && !/^\d+$/.test(customMatch[1])) {
    return formatCustomRoomCode(customMatch[1], cleanMask);
  }

  const sanitized = sanitizeCustomRoomPrefix(trimmed);
  if (sanitized && !/^\d+$/.test(sanitized)) {
    return formatCustomRoomCode(sanitized, cleanMask);
  }

  return generateRandomRoomCode(cleanMask);
}

export function sanitizeHostRoomCodeDraft(rawInput: string): string {
  const trimmed = String(rawInput || '');
  const withSingleSuffix = /^([a-zA-Z0-9]+)-([0-9a-fA-F]?)$/.exec(trimmed);
  if (withSingleSuffix) {
    return `${withSingleSuffix[1].toLowerCase()}-${withSingleSuffix[2].toLowerCase()}`;
  }
  return sanitizeCustomRoomPrefix(trimmed);
}

export function sanitizeJoinRoomCodeDraft(rawInput: string): string {
  return String(rawInput || '')
    .replace(/[^a-zA-Z0-9-]/g, '')
    .toLowerCase();
}

export function finalizeHostRoomCode(rawInput: string, mask: number): string {
  const trimmed = String(rawInput || '').trim();
  const cleanMask = clampConnectivityMask(mask) || 0x0f;
  if (!trimmed) {
    return generateRandomRoomCode(cleanMask);
  }
  if (/^\d{4}$/.test(trimmed)) {
    const decoded = decodeRandomRoomCode(trimmed);
    if (decoded && decoded.valid) {
      return trimmed;
    }
    return generateRandomRoomCode(cleanMask, Number(trimmed) % (MAX_RANDOM_SEED + 1));
  }
  const matchSuffix = /^([a-zA-Z0-9]+)(?:-[0-9a-fA-F])?$/.exec(trimmed);
  if (matchSuffix) {
    const prefix = matchSuffix[1];
    if (/^\d+$/.test(prefix)) {
      return generateRandomRoomCode(cleanMask, Number(prefix) % (MAX_RANDOM_SEED + 1));
    }
    return formatCustomRoomCode(prefix, cleanMask);
  }
  const cleanPrefix = sanitizeCustomRoomPrefix(trimmed);
  if (!cleanPrefix) {
    return generateRandomRoomCode(cleanMask);
  }
  return formatCustomRoomCode(cleanPrefix, cleanMask);
}

/**
 * Unified parser & 0ms local checksum validator for both 4-digit random codes
 * and `<custom>-<hex>` room codes. Returns `null` if the code fails checksum validation
 * (e.g., `mask === 0` or `seed > 199` for 4-digit codes).
 */
export function parseRoomCode(rawInput: string): ParsedRoomCodeResult | null {
  const clean = String(rawInput || '')
    .trim()
    .toLowerCase();
  if (!clean) return null;

  if (/^\d{4}$/.test(clean)) {
    const decoded = decodeRandomRoomCode(clean);
    if (!decoded || !decoded.valid) return null;
    return {
      mode: 'random',
      canonicalRoomCode: clean,
      identityKey: `seed:${decoded.seed}`,
      customPrefix: '',
      hostMask: decoded.mask,
      seed: decoded.seed,
    };
  }

  const customWithSuffix = /^([a-z0-9]+)-([0-9a-f])$/.exec(clean);
  if (customWithSuffix) {
    const prefix = customWithSuffix[1];
    if (/^\d+$/.test(prefix)) return null;
    const hostMask = parseInt(customWithSuffix[2], 16) & 0x0f;
    if (hostMask === 0) return null;
    return {
      mode: 'custom',
      canonicalRoomCode: `${prefix}-${hostMask.toString(16)}`,
      identityKey: `custom:${prefix}`,
      customPrefix: prefix,
      hostMask,
      seed: null,
    };
  }

  const bareAlphanumeric = sanitizeCustomRoomPrefix(clean);
  if (bareAlphanumeric && !/^\d+$/.test(bareAlphanumeric)) {
    return {
      mode: 'custom',
      canonicalRoomCode: `${bareAlphanumeric}-f`,
      identityKey: `custom:${bareAlphanumeric}`,
      customPrefix: bareAlphanumeric,
      hostMask: 0x0f,
      seed: null,
    };
  }

  return null;
}

export function isValidRoomCode(rawInput: string): boolean {
  return parseRoomCode(rawInput) !== null;
}

export function extractSlotsFromMask(mask: number): CanonicalRelayId[] {
  const clean = clampConnectivityMask(mask);
  return CANONICAL_RELAY_ORDER.filter((slot) => (clean & RELAY_SLOT_BITS[slot]) !== 0);
}

/**
 * Instant routing decision between Host's 4-bit mask and Client's 4-bit mask:
 * - `sharedMask !== 0`: Direct connection on shared relay(s).
 * - `sharedMask === 0 && hostMask !== 0 && clientMask !== 0`: Isolated network islands -> Dual Edge Function Bridge.
 */
export function resolveSignalingRouteDecision(
  hostMask: number,
  clientMask: number
): SignalingRouteDecision {
  const h = clampConnectivityMask(hostMask);
  const c = clampConnectivityMask(clientMask);
  const shared = h & c;

  if (shared !== 0) {
    return {
      routeType: 'direct-shared',
      hostMask: h,
      clientMask: c,
      sharedMask: shared,
      candidateSlots: extractSlotsFromMask(shared),
    };
  }

  if (h !== 0 && c !== 0) {
    return {
      routeType: 'edge-function-bridge',
      hostMask: h,
      clientMask: c,
      sharedMask: 0,
      candidateSlots: [],
    };
  }

  return {
    routeType: 'unroutable',
    hostMask: h,
    clientMask: c,
    sharedMask: 0,
    candidateSlots: [],
  };
}
