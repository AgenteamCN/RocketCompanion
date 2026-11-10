import crypto from 'node:crypto';
import { computeProfileContentHash } from './profileRepositoryResolver.mjs';

const RCTBNSPIB_FORMAT_MAGIC = 'RCTBNSPIB_V1';
const RCTBNSPIB_FILE_EXTENSION = '.rctbnspib';
const DEFAULT_RCTBNSPIB_WINDOW_MINUTES = 15;
const PBKDF2_ITERATIONS = 100_000;

export function normalizeSixDigitPin(rawPin) {
  const digitsOnly = String(rawPin || '').replace(/\D+/g, '');
  if (digitsOnly.length !== 6) {
    throw new Error('A 6-digit numeric unlock code is required.');
  }
  return digitsOnly;
}

export function generateRandomSixDigitPin() {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
}

export function computeTimeWindowSlot(
  nowMs = Date.now(),
  windowMinutes = DEFAULT_RCTBNSPIB_WINDOW_MINUTES
) {
  const clampedMinutes = Math.max(1, Math.min(120, Math.floor(windowMinutes)));
  const windowMs = clampedMinutes * 60_000;
  return Math.floor(nowMs / windowMs);
}

function deriveTimeBoundAesKeySync(pinCode, saltBytes, windowMinutes, timeSlot) {
  const keyMaterial = `${RCTBNSPIB_FORMAT_MAGIC}|PIN:${pinCode}|WIN:${windowMinutes}|SLOT:${timeSlot}`;
  return crypto.pbkdf2Sync(keyMaterial, saltBytes, PBKDF2_ITERATIONS, 32, 'sha256');
}

export function minimizeProfileForBundleExport(profile, credentialOverrides = {}) {
  const relays = Array.isArray(profile?.signaling?.relays)
    ? profile.signaling.relays.slice(0, 4)
    : [];
  const minimizedRelays = relays.map((relay) => {
    const id = String(relay.id || '')
      .trim()
      .toLowerCase();
    if (relay.protocol === 'mqtt') {
      const username =
        id === 'emqx_cn' && credentialOverrides.emqxCnUsername?.trim()
          ? credentialOverrides.emqxCnUsername.trim()
          : id === 'emqx_gb' && credentialOverrides.emqxGbUsername?.trim()
            ? credentialOverrides.emqxGbUsername.trim()
            : relay.username || '';
      const password =
        id === 'emqx_cn' && credentialOverrides.emqxCnPassword
          ? credentialOverrides.emqxCnPassword
          : id === 'emqx_gb' && credentialOverrides.emqxGbPassword
            ? credentialOverrides.emqxGbPassword
            : relay.password || '';
      return {
        id: relay.id,
        label: relay.label,
        protocol: 'mqtt',
        url: relay.url,
        username,
        password,
        staggerDelayMs: relay.staggerDelayMs ?? 0,
        connectTimeoutMs: relay.connectTimeoutMs ?? 4500,
        keepAliveSeconds: relay.keepAliveSeconds ?? 30,
      };
    }
    return {
      id: relay.id,
      label: relay.label,
      protocol: relay.protocol,
      url: relay.url,
      username: '',
      password: '',
      authToken: relay.authToken || relay.password || undefined,
      staggerDelayMs: relay.staggerDelayMs ?? 0,
      connectTimeoutMs: relay.connectTimeoutMs ?? 4500,
      keepAliveSeconds: relay.keepAliveSeconds ?? 25,
    };
  });

  const sanitized = {
    profileSource: 'imported-bundle',
    signaling: {
      defaultSignalingUrl: minimizedRelays[0]?.url || '',
      roomPrefix: profile?.signaling?.roomPrefix || '',
      topicNamespace: profile?.signaling?.topicNamespace || 'rc/sig',
      relays: minimizedRelays,
    },
    ...(profile?.turn?.iceServers?.length ? { turn: { iceServers: profile.turn.iceServers } } : {}),
    ...(profile?.configSync?.brokerUrl && profile?.configSync?.clientUsername
      ? {
          configSync: {
            brokerUrl: profile.configSync.brokerUrl,
            topicNamespace: profile.configSync.topicNamespace || '',
            clientUsername: profile.configSync.clientUsername,
            clientPassword: profile.configSync.clientPassword || '',
          },
        }
      : {}),
  };

  return {
    ...sanitized,
    profileHash: computeProfileContentHash(sanitized),
  };
}

export function encryptRctbnspibBundleNode(profile, options = {}) {
  const windowMinutes = Math.max(
    1,
    Math.min(120, Math.floor(options.windowMinutes ?? DEFAULT_RCTBNSPIB_WINDOW_MINUTES))
  );
  const nowMs = options.nowMs ?? Date.now();
  const pinCode = options.pinCode
    ? normalizeSixDigitPin(options.pinCode)
    : generateRandomSixDigitPin();
  const timeSlot = computeTimeWindowSlot(nowMs, windowMinutes);

  const saltBytes = crypto.randomBytes(16);
  const ivBytes = crypto.randomBytes(12);
  const key = deriveTimeBoundAesKeySync(pinCode, saltBytes, windowMinutes, timeSlot);
  const aadBytes = Buffer.from(`${RCTBNSPIB_FORMAT_MAGIC}|v1|w:${windowMinutes}`, 'utf8');

  const sanitizedProfile = minimizeProfileForBundleExport(profile, options.credentialOverrides);
  const plaintext = Buffer.from(JSON.stringify(sanitizedProfile), 'utf8');

  const cipher = crypto.createCipheriv('aes-256-gcm', key, ivBytes);
  cipher.setAAD(aadBytes);
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();
  const ciphertextWithTag = Buffer.concat([encrypted, authTag]);

  const envelope = {
    magic: RCTBNSPIB_FORMAT_MAGIC,
    version: 1,
    windowMinutes,
    saltHex: saltBytes.toString('hex'),
    ivHex: ivBytes.toString('hex'),
    ciphertextBase64: ciphertextWithTag.toString('base64'),
  };

  const hashSuffix = (sanitizedProfile.profileHash || 'bundle').slice(0, 8);
  return {
    envelope,
    serializedJson: `${JSON.stringify(envelope, null, 2)}\n`,
    suggestedFileName: `rc-profile-${hashSuffix}${RCTBNSPIB_FILE_EXTENSION}`,
    pinCode,
    windowMinutes,
    expiresInSeconds: windowMinutes * 60,
  };
}

export function decryptRctbnspibBundleNode(rawBundleTextOrObject, rawPinCode, nowMs = Date.now()) {
  const pinCode = normalizeSixDigitPin(rawPinCode);
  const envelope =
    typeof rawBundleTextOrObject === 'string'
      ? JSON.parse(rawBundleTextOrObject.trim())
      : rawBundleTextOrObject;

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
  const saltBytes = Buffer.from(envelope.saltHex, 'hex');
  const ivBytes = Buffer.from(envelope.ivHex, 'hex');
  const rawCiphertext = Buffer.from(envelope.ciphertextBase64, 'base64');
  if (rawCiphertext.length < 16) {
    throw new Error('Invalid .rctbnspib ciphertext length.');
  }
  const encryptedBody = rawCiphertext.subarray(0, rawCiphertext.length - 16);
  const authTag = rawCiphertext.subarray(rawCiphertext.length - 16);
  const aadBytes = Buffer.from(`${RCTBNSPIB_FORMAT_MAGIC}|v1|w:${windowMinutes}`, 'utf8');

  for (const slot of [currentSlot, currentSlot - 1, currentSlot + 1]) {
    try {
      const key = deriveTimeBoundAesKeySync(pinCode, saltBytes, windowMinutes, slot);
      const decipher = crypto.createDecipheriv('aes-256-gcm', key, ivBytes);
      decipher.setAAD(aadBytes);
      decipher.setAuthTag(authTag);
      const decrypted = Buffer.concat([decipher.update(encryptedBody), decipher.final()]);
      const parsed = JSON.parse(decrypted.toString('utf8'));
      return {
        ...parsed,
        profileSource: 'imported-bundle',
        profileHash: computeProfileContentHash(parsed),
      };
    } catch {
      // Try next slot
    }
  }

  throw new Error(
    'Decryption failed: Invalid 6-digit code or the time-bound bundle window has expired.'
  );
}
