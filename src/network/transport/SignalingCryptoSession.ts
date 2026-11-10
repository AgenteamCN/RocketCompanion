/**
 * SignalingCryptoSession.ts
 * Ephemeral ECDH (P-256) key exchange, deterministic SHA-256 topic derivation,
 * HKDF-SHA256 session key & 4-digit SAS pairing code derivation, and AES-256-GCM envelope encryption.
 */

import { getSignalingRoomPrefix, getSignalingTopicNamespace } from './signalingRelayConfig.ts';
import { parseRoomCode } from '../../ui-core/config/roomCodeConnectivityCodec.ts';

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export interface DeterministicRoomContext {
  cleanRoomId: string;
  cleanPassword: string;
  topicHash: string;
  mqttTopic: string;
  mqttBridgeTopic: string;
  supabaseChannelTopic: string;
  supabaseBridgeTopic: string;
  workerRoomKey: string;
  roomSaltBytes: Uint8Array;
  hmacKey: CryptoKey;
}

export interface PeerCryptoSessionRecord {
  remotePeerId: string;
  remotePublicKeyBase64Url: string;
  remoteNonce: string;
  aesKey: CryptoKey;
  pairingCode: string;
  establishedAt: number;
}

export interface EncryptedSignalingEnvelope {
  iv: string;
  ct: string;
}

function bytesToHex(bytes: Uint8Array): string {
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return hex;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlToBytes(base64Url: string): Uint8Array {
  const padded = String(base64Url || '')
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .padEnd(Math.ceil(String(base64Url || '').length / 4) * 4, '=');
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function generateRandomNonceHex(byteLength = 12): string {
  const bytes = new Uint8Array(byteLength);
  if (globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < byteLength; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  return bytesToHex(bytes);
}

async function sha256Bytes(inputString: string): Promise<Uint8Array> {
  const data = textEncoder.encode(inputString);
  const digestBuffer = await globalThis.crypto.subtle.digest('SHA-256', data as BufferSource);
  return new Uint8Array(digestBuffer);
}

export async function deriveDeterministicRoomContext(
  roomId: string,
  password = ''
): Promise<DeterministicRoomContext> {
  const roomPrefix = getSignalingRoomPrefix();
  const topicNamespace = getSignalingTopicNamespace();
  const rawRoomId = String(roomId || '')
    .trim()
    .toLowerCase();
  const prefixLower = roomPrefix.toLowerCase();
  const cleanRoomId =
    prefixLower && rawRoomId.startsWith(prefixLower)
      ? rawRoomId.slice(roomPrefix.length)
      : rawRoomId;
  const parsedRoom = parseRoomCode(cleanRoomId);
  const canonicalIdentity = parsedRoom ? parsedRoom.identityKey : cleanRoomId;
  const cleanPassword = String(password || '').trim();

  const topicSeed = `RC_TOPIC_V2:${roomPrefix}${canonicalIdentity}:PW:${cleanPassword}`;
  const saltSeed = `RC_SALT_V2:${roomPrefix}${canonicalIdentity}:PW:${cleanPassword}`;

  const [topicDigest, roomSaltBytes] = await Promise.all([
    sha256Bytes(topicSeed),
    sha256Bytes(saltSeed),
  ]);

  const fullTopicHex = bytesToHex(topicDigest);
  const topicHash = fullTopicHex.slice(0, 32);
  const cleanNamespace = String(topicNamespace || 'rc/sig').replace(/^\/+|\/+$/g, '');
  const mqttTopic = `${cleanNamespace}/dir/${topicHash}`;
  const mqttBridgeTopic = `${cleanNamespace}/brg/${topicHash}`;
  const supabaseChannelTopic = `realtime:${cleanNamespace}:dir:${topicHash}`;
  const supabaseBridgeTopic = `realtime:${cleanNamespace}:brg:${topicHash}`;
  const workerRoomKey = `${roomPrefix}${topicHash.slice(0, 24)}`;

  const hmacKey = await globalThis.crypto.subtle.importKey(
    'raw',
    roomSaltBytes as BufferSource,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );

  return {
    cleanRoomId,
    cleanPassword,
    topicHash,
    mqttTopic,
    mqttBridgeTopic,
    supabaseChannelTopic,
    supabaseBridgeTopic,
    workerRoomKey,
    roomSaltBytes,
    hmacKey,
  };
}

export async function signRoomHandshakeFrame(
  roomContext: DeterministicRoomContext,
  fieldsArray: Array<string | number | null | undefined>
): Promise<string> {
  const canonical = fieldsArray.map((item) => String(item ?? '')).join('|');
  const signatureBuffer = await globalThis.crypto.subtle.sign(
    'HMAC',
    roomContext.hmacKey,
    textEncoder.encode(canonical) as BufferSource
  );
  return bytesToBase64Url(new Uint8Array(signatureBuffer));
}

export async function verifyRoomHandshakeFrame(
  roomContext: DeterministicRoomContext | null | undefined,
  fieldsArray: Array<string | number | null | undefined>,
  signatureBase64Url: string | null | undefined
): Promise<boolean> {
  if (!signatureBase64Url || !roomContext?.hmacKey) return false;
  try {
    const canonical = fieldsArray.map((item) => String(item ?? '')).join('|');
    const sigBytes = base64UrlToBytes(signatureBase64Url);
    return await globalThis.crypto.subtle.verify(
      'HMAC',
      roomContext.hmacKey,
      sigBytes as BufferSource,
      textEncoder.encode(canonical) as BufferSource
    );
  } catch (_) {
    return false;
  }
}

export class SignalingCryptoSession {
  roomContext: DeterministicRoomContext;
  localPeerId: string;
  localNonce: string;
  keyPair: CryptoKeyPair | null = null;
  localPublicKeyBase64Url = '';
  peerSessions = new Map<string, PeerCryptoSessionRecord>();

  constructor(roomContext: DeterministicRoomContext, localPeerId: string) {
    this.roomContext = roomContext;
    this.localPeerId = localPeerId;
    this.localNonce = generateRandomNonceHex(12);
  }

  async initializeLocalIdentity(): Promise<string> {
    if (this.keyPair && this.localPublicKeyBase64Url) {
      return this.localPublicKeyBase64Url;
    }
    this.keyPair = await globalThis.crypto.subtle.generateKey(
      { name: 'ECDH', namedCurve: 'P-256' },
      false,
      ['deriveBits']
    );
    const rawPub = await globalThis.crypto.subtle.exportKey('raw', this.keyPair.publicKey);
    this.localPublicKeyBase64Url = bytesToBase64Url(new Uint8Array(rawPub));
    return this.localPublicKeyBase64Url;
  }

  async establishPeerSession(
    remotePeerId: string,
    remotePublicKeyBase64Url: string,
    remoteNonce: string,
    isLocalHost: boolean
  ): Promise<PeerCryptoSessionRecord> {
    await this.initializeLocalIdentity();
    const remotePubBytes = base64UrlToBytes(remotePublicKeyBase64Url);
    const remotePublicKey = await globalThis.crypto.subtle.importKey(
      'raw',
      remotePubBytes as BufferSource,
      { name: 'ECDH', namedCurve: 'P-256' },
      false,
      []
    );

    const sharedSecretBuffer = await globalThis.crypto.subtle.deriveBits(
      { name: 'ECDH', public: remotePublicKey },
      this.keyPair!.privateKey,
      256
    );

    const hostPeerId = isLocalHost ? this.localPeerId : remotePeerId;
    const clientPeerId = isLocalHost ? remotePeerId : this.localPeerId;
    const hostPub = isLocalHost ? this.localPublicKeyBase64Url : remotePublicKeyBase64Url;
    const clientPub = isLocalHost ? remotePublicKeyBase64Url : this.localPublicKeyBase64Url;
    const hostNonce = isLocalHost ? this.localNonce : remoteNonce;
    const clientNonce = isLocalHost ? remoteNonce : this.localNonce;

    const transcriptString = [
      'RC_E2EE_TRANSCRIPT_V2',
      this.roomContext.topicHash,
      hostPeerId,
      clientPeerId,
      hostPub,
      clientPub,
      hostNonce,
      clientNonce,
    ].join('|');

    const hkdfBaseKey = await globalThis.crypto.subtle.importKey(
      'raw',
      sharedSecretBuffer,
      'HKDF',
      false,
      ['deriveBits']
    );

    const derivedMaterialBuffer = await globalThis.crypto.subtle.deriveBits(
      {
        name: 'HKDF',
        hash: 'SHA-256',
        salt: this.roomContext.roomSaltBytes as BufferSource,
        info: textEncoder.encode(transcriptString) as BufferSource,
      },
      hkdfBaseKey,
      320
    );

    const derivedBytes = new Uint8Array(derivedMaterialBuffer);
    const aesKeyBytes = derivedBytes.slice(0, 32);
    const sasBytes = derivedBytes.slice(32, 40);

    const aesKey = await globalThis.crypto.subtle.importKey(
      'raw',
      aesKeyBytes as BufferSource,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );

    const sasValue =
      ((sasBytes[0] << 24) >>> 0) ^
      ((sasBytes[1] << 16) >>> 0) ^
      ((sasBytes[2] << 8) >>> 0) ^
      (sasBytes[3] >>> 0);
    const pairingCode = String((sasValue >>> 0) % 10000).padStart(4, '0');

    const sessionRecord: PeerCryptoSessionRecord = {
      remotePeerId,
      remotePublicKeyBase64Url,
      remoteNonce,
      aesKey,
      pairingCode,
      establishedAt: Date.now(),
    };

    this.peerSessions.set(remotePeerId, sessionRecord);
    return sessionRecord;
  }

  getPeerSession(remotePeerId: string): PeerCryptoSessionRecord | null {
    return this.peerSessions.get(remotePeerId) || null;
  }

  getPairingCode(remotePeerId: string): string | null {
    return this.peerSessions.get(remotePeerId)?.pairingCode || null;
  }

  async encryptForPeer(
    remotePeerId: string,
    payloadObject: Record<string, any>
  ): Promise<EncryptedSignalingEnvelope> {
    const session = this.peerSessions.get(remotePeerId);
    if (!session?.aesKey) {
      throw new Error(
        `[SignalingCryptoSession] Missing established E2EE session for peer ${remotePeerId}`
      );
    }
    const iv = new Uint8Array(12);
    globalThis.crypto.getRandomValues(iv);
    const plaintextBytes = textEncoder.encode(JSON.stringify(payloadObject));
    const additionalData = textEncoder.encode(
      `${this.roomContext.topicHash}|${this.localPeerId}|${remotePeerId}`
    );

    const ciphertextBuffer = await globalThis.crypto.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv: iv as BufferSource,
        additionalData: additionalData as BufferSource,
      },
      session.aesKey,
      plaintextBytes as BufferSource
    );

    return {
      iv: bytesToBase64Url(iv),
      ct: bytesToBase64Url(new Uint8Array(ciphertextBuffer)),
    };
  }

  async decryptFromPeer(
    remotePeerId: string,
    envelope: EncryptedSignalingEnvelope | null | undefined
  ): Promise<any> {
    const session = this.peerSessions.get(remotePeerId);
    if (!session?.aesKey || !envelope?.iv || !envelope?.ct) {
      throw new Error(`[SignalingCryptoSession] Cannot decrypt envelope from peer ${remotePeerId}`);
    }
    const iv = base64UrlToBytes(envelope.iv);
    const ciphertextBytes = base64UrlToBytes(envelope.ct);
    const additionalData = textEncoder.encode(
      `${this.roomContext.topicHash}|${remotePeerId}|${this.localPeerId}`
    );

    const plaintextBuffer = await globalThis.crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: iv as BufferSource,
        additionalData: additionalData as BufferSource,
      },
      session.aesKey,
      ciphertextBytes as BufferSource
    );

    const jsonStr = textDecoder.decode(plaintextBuffer);
    return JSON.parse(jsonStr);
  }

  destroy(): void {
    this.peerSessions.clear();
    this.keyPair = null;
  }
}
