/**
 * credentialBundleCryptoPipeline.ts
 * Pure WebCrypto (PBKDF2-SHA256 + AES-256-GCM) encryption/decryption pipeline for
 * time-bound 6-digit PIN / TOTP `.rctbnspib` (Rocket Companion Time Based Not Secret Private Information Bundle) files.
 */

import {
  DEFAULT_RCTBNSPIB_WINDOW_MINUTES,
  RCTBNSPIB_FILE_EXTENSION,
  RCTBNSPIB_FORMAT_MAGIC,
  type RctbnspibEncryptedEnvelope,
  type RctbnspibExportResult,
  type SignalingProfilePayload,
} from './credentialBundleTypes.ts';

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();
const PBKDF2_ITERATIONS = 100_000;

function bytesToHex(bytes: Uint8Array): string {
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return hex;
}

function hexToBytes(hex: string): Uint8Array {
  const clean = String(hex || '').trim();
  if (clean.length % 2 !== 0) {
    throw new Error('Invalid hex string length');
  }
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(String(base64 || '').trim());
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

export function normalizeSixDigitPin(rawPin: string): string {
  const digitsOnly = String(rawPin || '').replace(/\D+/g, '');
  if (digitsOnly.length !== 6) {
    throw new Error('A 6-digit numeric unlock code is required.');
  }
  return digitsOnly;
}

export function generateRandomSixDigitPin(): string {
  const buf = new Uint32Array(1);
  if (globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(buf);
  } else {
    buf[0] = Math.floor(Math.random() * 1_000_000);
  }
  return String(buf[0] % 1_000_000).padStart(6, '0');
}

export function computeTimeWindowSlot(
  nowMs = Date.now(),
  windowMinutes = DEFAULT_RCTBNSPIB_WINDOW_MINUTES
): number {
  const clampedMinutes = Math.max(1, Math.min(120, Math.floor(windowMinutes)));
  const windowMs = clampedMinutes * 60_000;
  return Math.floor(nowMs / windowMs);
}

async function deriveTimeBoundAesKey(
  pinCode: string,
  saltBytes: Uint8Array,
  windowMinutes: number,
  timeSlot: number
): Promise<CryptoKey> {
  const keyMaterialInput = textEncoder.encode(
    `${RCTBNSPIB_FORMAT_MAGIC}|PIN:${pinCode}|WIN:${windowMinutes}|SLOT:${timeSlot}`
  );
  const baseKey = await globalThis.crypto.subtle.importKey(
    'raw',
    keyMaterialInput as BufferSource,
    'PBKDF2',
    false,
    ['deriveKey']
  );

  return globalThis.crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: saltBytes as BufferSource,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function computeProfileCanonicalHash(
  profile: SignalingProfilePayload | null | undefined
): Promise<string> {
  if (!profile || typeof profile !== 'object') return '';
  const canonicalize = (val: any): any => {
    if (Array.isArray(val)) return val.map(canonicalize);
    if (val && typeof val === 'object') {
      const sorted: Record<string, any> = {};
      for (const k of Object.keys(val).sort()) {
        if (k === 'profileHash' || k === 'profileSource') continue;
        sorted[k] = canonicalize(val[k]);
      }
      return sorted;
    }
    return val;
  };
  const json = JSON.stringify(canonicalize(profile));
  const digest = await globalThis.crypto.subtle.digest(
    'SHA-256',
    textEncoder.encode(json) as BufferSource
  );
  return bytesToHex(new Uint8Array(digest)).slice(0, 16);
}

/**
 * Deterministic synchronous FNV-1a 64-bit / 32-bit hex fingerprint for lightweight UI config comparison.
 */
export function computeShortConfigHashSync(input: unknown): string {
  const canonical = JSON.stringify(input ?? '');
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < canonical.length; i++) {
    const ch = canonical.charCodeAt(i);
    h1 ^= ch;
    h1 = Math.imul(h1, 0x01000193) >>> 0;
    h2 ^= ch + (i & 0xff);
    h2 = Math.imul(h2, 0x85ebca6b) >>> 0;
  }
  return `${h1.toString(16).padStart(8, '0')}${h2.toString(16).padStart(8, '0')}`;
}

export async function encryptRctbnspibBundle(
  profile: SignalingProfilePayload,
  options: {
    pinCode?: string;
    windowMinutes?: number;
    nowMs?: number;
  } = {}
): Promise<RctbnspibExportResult> {
  const windowMinutes = Math.max(
    1,
    Math.min(120, Math.floor(options.windowMinutes ?? DEFAULT_RCTBNSPIB_WINDOW_MINUTES))
  );
  const nowMs = options.nowMs ?? Date.now();
  const pinCode = options.pinCode
    ? normalizeSixDigitPin(options.pinCode)
    : generateRandomSixDigitPin();
  const timeSlot = computeTimeWindowSlot(nowMs, windowMinutes);

  const saltBytes = new Uint8Array(16);
  const ivBytes = new Uint8Array(12);
  globalThis.crypto.getRandomValues(saltBytes);
  globalThis.crypto.getRandomValues(ivBytes);

  const aesKey = await deriveTimeBoundAesKey(pinCode, saltBytes, windowMinutes, timeSlot);
  const aadBytes = textEncoder.encode(`${RCTBNSPIB_FORMAT_MAGIC}|v1|w:${windowMinutes}`);
  const plaintextBytes = textEncoder.encode(
    JSON.stringify({
      ...profile,
      profileSource: 'imported-bundle',
    })
  );

  const ciphertextBuffer = await globalThis.crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: ivBytes as BufferSource,
      additionalData: aadBytes as BufferSource,
    },
    aesKey,
    plaintextBytes as BufferSource
  );

  const envelope: RctbnspibEncryptedEnvelope = {
    magic: RCTBNSPIB_FORMAT_MAGIC,
    version: 1,
    windowMinutes,
    saltHex: bytesToHex(saltBytes),
    ivHex: bytesToHex(ivBytes),
    ciphertextBase64: bytesToBase64(new Uint8Array(ciphertextBuffer)),
  };

  const serializedJson = `${JSON.stringify(envelope, null, 2)}\n`;
  const hashSuffix = (profile.profileHash || (await computeProfileCanonicalHash(profile))).slice(
    0,
    8
  );

  return {
    envelope,
    serializedJson,
    suggestedFileName: `rc-profile-${hashSuffix || 'bundle'}${RCTBNSPIB_FILE_EXTENSION}`,
    pinCode,
    windowMinutes,
    expiresInSeconds: windowMinutes * 60,
  };
}

export async function decryptRctbnspibBundle(
  rawBundleTextOrObject: string | RctbnspibEncryptedEnvelope,
  rawPinCode: string,
  nowMs = Date.now()
): Promise<SignalingProfilePayload> {
  const pinCode = normalizeSixDigitPin(rawPinCode);

  let envelope: RctbnspibEncryptedEnvelope;
  if (typeof rawBundleTextOrObject === 'string') {
    try {
      envelope = JSON.parse(rawBundleTextOrObject.trim()) as RctbnspibEncryptedEnvelope;
    } catch {
      throw new Error('Invalid .rctbnspib file format (unable to parse JSON envelope).');
    }
  } else {
    envelope = rawBundleTextOrObject;
  }

  if (
    !envelope ||
    envelope.magic !== RCTBNSPIB_FORMAT_MAGIC ||
    envelope.version !== 1 ||
    !envelope.saltHex ||
    !envelope.ivHex ||
    !envelope.ciphertextBase64
  ) {
    throw new Error('Unrecognized or corrupted .rctbnspib bundle header.');
  }

  const windowMinutes = Math.max(1, Math.min(120, Math.floor(envelope.windowMinutes || 15)));
  const currentSlot = computeTimeWindowSlot(nowMs, windowMinutes);
  const saltBytes = hexToBytes(envelope.saltHex);
  const ivBytes = hexToBytes(envelope.ivHex);
  const ciphertextBytes = base64ToBytes(envelope.ciphertextBase64);
  const aadBytes = textEncoder.encode(`${RCTBNSPIB_FORMAT_MAGIC}|v1|w:${windowMinutes}`);

  // Check current time slot and adjacent [-1, +1] slots to tolerate clock skew or boundary crossing
  const candidateSlots = [currentSlot, currentSlot - 1, currentSlot + 1];

  for (const slot of candidateSlots) {
    try {
      const aesKey = await deriveTimeBoundAesKey(pinCode, saltBytes, windowMinutes, slot);
      const decryptedBuffer = await globalThis.crypto.subtle.decrypt(
        {
          name: 'AES-GCM',
          iv: ivBytes as BufferSource,
          additionalData: aadBytes as BufferSource,
        },
        aesKey,
        ciphertextBytes as BufferSource
      );
      const parsed = JSON.parse(textDecoder.decode(decryptedBuffer)) as SignalingProfilePayload;
      if (!parsed || !Array.isArray(parsed.signaling?.relays)) {
        throw new Error('Decrypted payload is missing signaling relays.');
      }
      const profileHash = await computeProfileCanonicalHash(parsed);
      return {
        ...parsed,
        profileSource: 'imported-bundle',
        profileHash,
      };
    } catch {
      // Try next candidate slot
    }
  }

  throw new Error(
    'Decryption failed: Invalid 6-digit code or the time-bound bundle window has expired.'
  );
}
