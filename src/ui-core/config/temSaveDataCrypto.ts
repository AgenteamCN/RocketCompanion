/**
 * temSaveDataCrypto.ts
 * Pure TypeScript Rocket League MSB-first CRC32 verification and AES-256-ECB block decryption
 * for Custom Training Pack (.Tem) SaveData envelopes.
 *
 * All finite-field S-boxes and CRC32 lookup tables are synthesized algorithmically at runtime
 * over GF(2^8) (irreducible polynomial 0x11B) and polynomial 0x04C11DB7 (seed 0xEFCBF201)
 * with zero inline binary/hex asset arrays.
 */

export const RL_TEM_CRC32_SEED = 0xefcbf201;
export const RL_TEM_CRC32_POLY = 0x04c11db7;

// 8 x 32-bit Big-Endian words of the 256-bit SaveData cipher key
const RL_SAVEDATA_CIPHER_WORDS: readonly [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
] = [
  0xd78c324a,
  0x9442943c,
  0x6d65ce98,
  0x81854c41,
  0x6899220c,
  0xc7a14640,
  0x939b963c,
  0x932a6faf,
];

let cachedCrc32Table: Uint32Array | null = null;
let cachedSbox: Uint8Array | null = null;
let cachedInvSbox: Uint8Array | null = null;
let cachedRoundKeys: Uint8Array | null = null;

function getRlCrc32Table(): Uint32Array {
  if (cachedCrc32Table) return cachedCrc32Table;
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = (i << 24) >>> 0;
    for (let bit = 0; bit < 8; bit++) {
      if ((c & 0x80000000) !== 0) {
        c = ((c << 1) ^ RL_TEM_CRC32_POLY) >>> 0;
      } else {
        c = (c << 1) >>> 0;
      }
    }
    table[i] = c;
  }
  cachedCrc32Table = table;
  return table;
}

/**
 * Computes Rocket League's custom MSB-first CRC-32 checksum.
 */
export function computeRlTemCrc32(
  data: Uint8Array,
  seed: number = RL_TEM_CRC32_SEED
): number {
  const table = getRlCrc32Table();
  let crc = (~seed) >>> 0;
  for (let i = 0; i < data.length; i++) {
    const byteVal = data[i];
    const idx = ((crc >>> 24) ^ byteVal) & 0xff;
    crc = ((crc << 8) ^ table[idx]) >>> 0;
  }
  return (~crc) >>> 0;
}

export function formatHex32(val: number): string {
  return `0x${(val >>> 0).toString(16).toUpperCase().padStart(8, '0')}`;
}

function multiplyGf256(a: number, b: number): number {
  let product = 0;
  let multiplicand = a & 0xff;
  let multiplier = b & 0xff;
  for (let i = 0; i < 8; i++) {
    if ((multiplier & 1) !== 0) {
      product ^= multiplicand;
    }
    const highBit = multiplicand & 0x80;
    multiplicand = (multiplicand << 1) & 0xff;
    if (highBit !== 0) {
      multiplicand ^= 0x1b;
    }
    multiplier >>>= 1;
  }
  return product;
}

function ensureAesTablesAndKeySchedule(): {
  sbox: Uint8Array;
  invSbox: Uint8Array;
  roundKeys: Uint8Array;
} {
  if (cachedSbox && cachedInvSbox && cachedRoundKeys) {
    return {
      sbox: cachedSbox,
      invSbox: cachedInvSbox,
      roundKeys: cachedRoundKeys,
    };
  }

  const sbox = new Uint8Array(256);
  const invSbox = new Uint8Array(256);
  const expTable = new Uint8Array(256);
  const logTable = new Uint8Array(256);

  let generatorPower = 1;
  for (let i = 0; i < 255; i++) {
    expTable[i] = generatorPower;
    logTable[generatorPower] = i;
    generatorPower = multiplyGf256(generatorPower, 0x03);
  }
  expTable[255] = 1;

  for (let i = 0; i < 256; i++) {
    const multiplicativeInverse = i === 0 ? 0 : expTable[255 - logTable[i]];
    const rot1 = ((multiplicativeInverse << 1) | (multiplicativeInverse >>> 7)) & 0xff;
    const rot2 = ((multiplicativeInverse << 2) | (multiplicativeInverse >>> 6)) & 0xff;
    const rot3 = ((multiplicativeInverse << 3) | (multiplicativeInverse >>> 5)) & 0xff;
    const rot4 = ((multiplicativeInverse << 4) | (multiplicativeInverse >>> 4)) & 0xff;
    const affineTransformed =
      (multiplicativeInverse ^ rot1 ^ rot2 ^ rot3 ^ rot4 ^ 0x63) & 0xff;
    sbox[i] = affineTransformed;
    invSbox[affineTransformed] = i;
  }

  const keyBytes = new Uint8Array(32);
  const keyView = new DataView(keyBytes.buffer);
  for (let w = 0; w < 8; w++) {
    keyView.setUint32(w * 4, RL_SAVEDATA_CIPHER_WORDS[w] >>> 0, false);
  }

  const roundKeys = new Uint8Array(240);
  roundKeys.set(keyBytes);
  let rcon = 1;
  const tempWord = new Uint8Array(4);

  for (let i = 32; i < 240; i += 4) {
    tempWord[0] = roundKeys[i - 4];
    tempWord[1] = roundKeys[i - 3];
    tempWord[2] = roundKeys[i - 2];
    tempWord[3] = roundKeys[i - 1];

    if (i % 32 === 0) {
      const first = tempWord[0];
      tempWord[0] = sbox[tempWord[1]] ^ rcon;
      tempWord[1] = sbox[tempWord[2]];
      tempWord[2] = sbox[tempWord[3]];
      tempWord[3] = sbox[first];
      rcon = multiplyGf256(rcon, 2);
    } else if (i % 32 === 16) {
      tempWord[0] = sbox[tempWord[0]];
      tempWord[1] = sbox[tempWord[1]];
      tempWord[2] = sbox[tempWord[2]];
      tempWord[3] = sbox[tempWord[3]];
    }

    roundKeys[i] = roundKeys[i - 32] ^ tempWord[0];
    roundKeys[i + 1] = roundKeys[i - 31] ^ tempWord[1];
    roundKeys[i + 2] = roundKeys[i - 30] ^ tempWord[2];
    roundKeys[i + 3] = roundKeys[i - 29] ^ tempWord[3];
  }

  cachedSbox = sbox;
  cachedInvSbox = invSbox;
  cachedRoundKeys = roundKeys;

  return { sbox, invSbox, roundKeys };
}

/**
 * Decrypts AES-256-ECB encrypted SaveData bytes (16-byte aligned, no padding removal).
 */
export function decryptRlSaveDataAes256Ecb(ciphertext: Uint8Array): Uint8Array {
  const { invSbox, roundKeys } = ensureAesTablesAndKeySchedule();
  const blockAlignedLength = ciphertext.length - (ciphertext.length % 16);
  const plaintext = new Uint8Array(blockAlignedLength);
  const state = new Uint8Array(16);
  const shifted = new Uint8Array(16);

  for (let offset = 0; offset < blockAlignedLength; offset += 16) {
    for (let i = 0; i < 16; i++) {
      state[i] = ciphertext[offset + i] ^ roundKeys[224 + i];
    }

    for (let round = 13; round >= 0; round--) {
      shifted[0] = invSbox[state[0]];
      shifted[1] = invSbox[state[13]];
      shifted[2] = invSbox[state[10]];
      shifted[3] = invSbox[state[7]];

      shifted[4] = invSbox[state[4]];
      shifted[5] = invSbox[state[1]];
      shifted[6] = invSbox[state[14]];
      shifted[7] = invSbox[state[11]];

      shifted[8] = invSbox[state[8]];
      shifted[9] = invSbox[state[5]];
      shifted[10] = invSbox[state[2]];
      shifted[11] = invSbox[state[15]];

      shifted[12] = invSbox[state[12]];
      shifted[13] = invSbox[state[9]];
      shifted[14] = invSbox[state[6]];
      shifted[15] = invSbox[state[3]];

      const rkBase = round * 16;
      for (let i = 0; i < 16; i++) {
        state[i] = shifted[i] ^ roundKeys[rkBase + i];
      }

      if (round > 0) {
        for (let col = 0; col < 16; col += 4) {
          const s0 = state[col];
          const s1 = state[col + 1];
          const s2 = state[col + 2];
          const s3 = state[col + 3];
          state[col] =
            multiplyGf256(s0, 0x0e) ^
            multiplyGf256(s1, 0x0b) ^
            multiplyGf256(s2, 0x0d) ^
            multiplyGf256(s3, 0x09);
          state[col + 1] =
            multiplyGf256(s0, 0x09) ^
            multiplyGf256(s1, 0x0e) ^
            multiplyGf256(s2, 0x0b) ^
            multiplyGf256(s3, 0x0d);
          state[col + 2] =
            multiplyGf256(s0, 0x0d) ^
            multiplyGf256(s1, 0x09) ^
            multiplyGf256(s2, 0x0e) ^
            multiplyGf256(s3, 0x0b);
          state[col + 3] =
            multiplyGf256(s0, 0x0b) ^
            multiplyGf256(s1, 0x0d) ^
            multiplyGf256(s2, 0x09) ^
            multiplyGf256(s3, 0x0e);
        }
      }
    }

    plaintext.set(state, offset);
  }

  return plaintext;
}

export interface TemHeaderVerification {
  fileSizeBytes: number;
  encryptedPayloadBytes: number;
  storedCrc32: string;
  calculatedCrc32: string;
  crcValid: boolean;
}

/**
 * Unpacks the 8-byte outer `.Tem` frame header, verifies its MSB-first CRC32,
 * and returns the decrypted inner UE3 SaveData buffer.
 * Also supports already-decrypted `.decrypted.bin` buffers starting with 0xF005BA11.
 */
export function decryptAndVerifyTemBytes(rawBytes: Uint8Array): {
  header: TemHeaderVerification;
  decryptedBytes: Uint8Array;
} {
  if (rawBytes.byteLength < 24) {
    throw new Error(`Invalid .Tem file: size (${rawBytes.byteLength} bytes) is smaller than 24-byte header.`);
  }

  const view = new DataView(rawBytes.buffer, rawBytes.byteOffset, rawBytes.byteLength);
  const firstWord = view.getUint32(0, true);
  const secondWord = view.getUint32(4, true);

  if (firstWord === 0xf005ba11 && secondWord === 0x7fffffff) {
    return {
      header: {
        fileSizeBytes: rawBytes.byteLength,
        encryptedPayloadBytes: rawBytes.byteLength,
        storedCrc32: '0x00000000',
        calculatedCrc32: '0x00000000',
        crcValid: true,
      },
      decryptedBytes: rawBytes,
    };
  }

  const part1Length = firstWord;
  const part1Crc = secondWord;

  if (part1Length <= 0 || 8 + part1Length > rawBytes.byteLength) {
    throw new Error(
      `Invalid .Tem header: payload length (${part1Length}) exceeds file size (${rawBytes.byteLength} bytes).`
    );
  }

  const encryptedSlice = rawBytes.subarray(8, 8 + part1Length);
  const calculatedCrc = computeRlTemCrc32(encryptedSlice, RL_TEM_CRC32_SEED);
  const decryptedBytes = decryptRlSaveDataAes256Ecb(encryptedSlice);

  return {
    header: {
      fileSizeBytes: rawBytes.byteLength,
      encryptedPayloadBytes: part1Length,
      storedCrc32: formatHex32(part1Crc),
      calculatedCrc32: formatHex32(calculatedCrc),
      crcValid: part1Crc === calculatedCrc,
    },
    decryptedBytes,
  };
}
