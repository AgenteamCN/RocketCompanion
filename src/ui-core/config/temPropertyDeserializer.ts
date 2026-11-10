/**
 * temPropertyDeserializer.ts
 * Pure TypeScript UE3 SaveData_GameEditor_Training_TA binary stream reader and property tree deserializer
 * for Rocket League Custom Training Pack (.Tem) files (both LicenseeVersion 34 local authoring and
 * LicenseeVersion 32 online published packs).
 */

import {
  type TemHeaderVerification,
  decryptAndVerifyTemBytes,
  formatHex32,
} from './temSaveDataCrypto';

const URU_TO_DEG = 360.0 / 65536.0;
const URU_TO_RAD = (2.0 * Math.PI) / 65536.0;

export interface TemSaveDataEnvelope {
  foosballMagic: string;
  headerMagic: string;
  engineVersion: number;
  licenseeVersion: number;
  typeVersion: number;
  savedataByteLength: number;
  trailingZeroPaddingBytes: number;
}

export interface TemObjectTypeEntry {
  type: string;
  filePosition: number;
  objectIndex: number;
}

export interface TemObjectRecord {
  objectIndex: number;
  type: string;
  filePosition: number;
  objHeaderMagic: string;
  properties: Record<string, unknown>;
}

export interface TemEnrichedArchetype {
  role?: 'Ball' | 'PlayerCarSpawn' | 'EditorFreeCam' | string;
  ObjectArchetype?: string;
  IsPC?: boolean;
  StartLocationX?: number;
  StartLocationY?: number;
  StartLocationZ?: number;
  VelocityStartRotationP?: number;
  VelocityStartRotationY?: number;
  VelocityStartRotationR?: number;
  VelocityStartSpeed?: number;
  LocationX?: number;
  LocationY?: number;
  LocationZ?: number;
  RotationP?: number;
  RotationY?: number;
  RotationR?: number;
  computed?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface TemRoundRecord {
  round_index: number;
  TimeLimit?: number;
  SerializedArchetypes?: Array<TemEnrichedArchetype | string>;
  [key: string]: unknown;
}

export interface ParsedTemTrainingPack {
  fileName: string;
  variant: 'local-authoring' | 'online-published';
  temVariant: 'local-authoring' | 'online-published';
  header: TemHeaderVerification;
  savedataEnvelope: TemSaveDataEnvelope;
  rootProperties: Record<string, unknown>;
  properties: Record<string, unknown>;
  objectTypes: TemObjectTypeEntry[];
  objects: TemObjectRecord[];
}

export type ParsedTemDocument = ParsedTemTrainingPack;

class UeBinaryStreamReader {
  private readonly bytes: Uint8Array;
  private readonly view: DataView;
  public offset = 0;

  constructor(bytes: Uint8Array) {
    this.bytes = bytes;
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }

  get remaining(): number {
    return Math.max(0, this.bytes.byteLength - this.offset);
  }

  seek(position: number): void {
    this.offset = Math.max(0, Math.min(this.bytes.byteLength, position));
  }

  readU8(): number {
    if (this.remaining < 1) return 0;
    const val = this.view.getUint8(this.offset);
    this.offset += 1;
    return val;
  }

  readI32(): number {
    if (this.remaining < 4) return 0;
    const val = this.view.getInt32(this.offset, true);
    this.offset += 4;
    return val;
  }

  readU32(): number {
    if (this.remaining < 4) return 0;
    const val = this.view.getUint32(this.offset, true);
    this.offset += 4;
    return val;
  }

  readU64BigInt(): bigint {
    const low = BigInt(this.readU32());
    const high = BigInt(this.readU32());
    return (high << 32n) | low;
  }

  readF32(): number {
    if (this.remaining < 4) return 0;
    const val = this.view.getFloat32(this.offset, true);
    this.offset += 4;
    return Number(val.toFixed(6));
  }

  readBytes(byteCount: number): Uint8Array {
    const clampedCount = Math.max(0, Math.min(this.remaining, byteCount));
    const slice = this.bytes.subarray(this.offset, this.offset + clampedCount);
    this.offset += clampedCount;
    return slice;
  }

  readHex(byteCount: number): string {
    const slice = this.readBytes(byteCount);
    let hex = '';
    for (let i = 0; i < slice.length; i++) {
      hex += slice[i].toString(16).padStart(2, '0');
    }
    return hex;
  }

  readUeString(): string | null {
    if (this.remaining < 4) return null;
    const length = this.readI32();
    if (length > 0) {
      const raw = this.readBytes(length);
      const trimmed = raw.subarray(0, Math.max(0, raw.length - 1));
      return new TextDecoder('windows-1252').decode(trimmed);
    }
    if (length < 0) {
      const byteLength = length * -2;
      const raw = this.readBytes(byteLength);
      const trimmed = raw.subarray(0, Math.max(0, raw.length - 2));
      return new TextDecoder('utf-16le').decode(trimmed);
    }
    return null;
  }
}

export function uruToDegrees(uru: number): number {
  return Number(((Number(uru) || 0) * URU_TO_DEG).toFixed(4));
}

export function uruToRadians(uru: number): number {
  return Number(((Number(uru) || 0) * URU_TO_RAD).toFixed(6));
}

export function enrichTemArchetype(rawArch: Record<string, unknown>): TemEnrichedArchetype {
  const result: TemEnrichedArchetype = { ...rawArch };
  const archetypeName =
    typeof rawArch.ObjectArchetype === 'string' ? rawArch.ObjectArchetype : '';

  if (archetypeName.includes('Ball')) {
    result.role = 'Ball';
    const pitchDeg = uruToDegrees(Number(rawArch.VelocityStartRotationP ?? 0));
    const yawDeg = uruToDegrees(Number(rawArch.VelocityStartRotationY ?? 0));
    const rollDeg = uruToDegrees(Number(rawArch.VelocityStartRotationR ?? 0));
    const speed = Number(rawArch.VelocityStartSpeed ?? 0);
    const pitchRad = (pitchDeg * Math.PI) / 180.0;
    const yawRad = (yawDeg * Math.PI) / 180.0;
    const vx = Number((speed * Math.cos(pitchRad) * Math.cos(yawRad)).toFixed(4));
    const vy = Number((speed * Math.cos(pitchRad) * Math.sin(yawRad)).toFixed(4));
    const vz = Number((speed * Math.sin(pitchRad)).toFixed(4));
    result.computed = {
      velocity_rotation_deg: { pitch: pitchDeg, yaw: yawDeg, roll: rollDeg },
      initial_velocity_vector_uu_s: { vx, vy, vz },
      initial_speed_kph: Number((speed * 0.036).toFixed(2)),
    };
  } else if (archetypeName.includes('DynamicSpawnPointMesh')) {
    result.role = 'PlayerCarSpawn';
    result.computed = {
      rotation_deg: {
        pitch: uruToDegrees(Number(rawArch.RotationP ?? 0)),
        yaw: uruToDegrees(Number(rawArch.RotationY ?? 0)),
        roll: uruToDegrees(Number(rawArch.RotationR ?? 0)),
      },
    };
  } else if (rawArch.IsPC === true) {
    result.role = 'EditorFreeCam';
    result.computed = {
      rotation_deg: {
        pitch: uruToDegrees(Number(rawArch.RotationP ?? 0)),
        yaw: uruToDegrees(Number(rawArch.RotationY ?? 0)),
        roll: uruToDegrees(Number(rawArch.RotationR ?? 0)),
      },
    };
  }

  return result;
}

function readUePropertiesTree(stream: UeBinaryStreamReader): Record<string, unknown> {
  const props: Record<string, unknown> = {};
  while (stream.remaining >= 4) {
    const startOffset = stream.offset;
    const propName = stream.readUeString();
    if (propName === 'None' || propName === null) {
      break;
    }
    const propType = stream.readUeString();
    if (!propType || stream.remaining < 8) {
      stream.seek(startOffset);
      break;
    }
    const valueByteLength = stream.readI32();
    const _arrayIndex = stream.readI32();
    const val = readUePropertyValue(stream, propType, valueByteLength, propName);

    if (Object.prototype.hasOwnProperty.call(props, propName)) {
      const existing = props[propName];
      if (Array.isArray(existing)) {
        existing.push(val);
      } else {
        props[propName] = [existing, val];
      }
    } else {
      props[propName] = val;
    }
  }
  return props;
}

function readUePropertyValue(
  stream: UeBinaryStreamReader,
  propType: string,
  valueByteLength: number,
  propName: string
): unknown {
  if (propType === 'BoolProperty') {
    return stream.readU8() !== 0;
  }
  if (propType === 'IntProperty') {
    return stream.readI32();
  }
  if (propType === 'QWordProperty') {
    const rawBigInt = stream.readU64BigInt();
    const numValue = Number(rawBigInt);
    if ((propName === 'CreatedAt' || propName === 'UpdatedAt') && numValue > 1_000_000_000) {
      return {
        epoch: numValue,
        iso_utc: new Date(numValue * 1000).toISOString(),
      };
    }
    return rawBigInt <= BigInt(Number.MAX_SAFE_INTEGER)
      ? numValue
      : rawBigInt.toString();
  }
  if (propType === 'FloatProperty') {
    return stream.readF32();
  }
  if (propType === 'StrProperty' || propType === 'NameProperty') {
    return stream.readUeString();
  }
  if (propType === 'ByteProperty') {
    const enumName = stream.readUeString();
    if (enumName === 'None' || enumName === null) {
      return stream.readU8();
    }
    const enumValue = stream.readUeString();
    return { [enumName]: enumValue };
  }
  if (propType === 'ObjectProperty') {
    return stream.readI32();
  }
  if (propType === 'StructProperty') {
    const structName = stream.readUeString() || 'Struct';
    if (structName === 'Guid') {
      const a = stream.readU32().toString(16).toUpperCase().padStart(8, '0');
      const b = stream.readU32().toString(16).toUpperCase().padStart(8, '0');
      const c = stream.readU32().toString(16).toUpperCase().padStart(8, '0');
      const d = stream.readU32().toString(16).toUpperCase().padStart(8, '0');
      return `${a}-${b}-${c}-${d}`;
    }
    if (structName === 'Vector' || structName === 'Rotator') {
      const x = stream.readF32();
      const y = stream.readF32();
      const z = stream.readF32();
      return { _struct: structName, x, y, z };
    }
    const structProps = readUePropertiesTree(stream);
    return { _struct: structName, ...structProps };
  }
  if (propType === 'ArrayProperty') {
    const count = stream.readI32();
    if (propName === 'Rounds') {
      const rounds: TemRoundRecord[] = [];
      for (let idx = 0; idx < count; idx++) {
        const roundProps = readUePropertiesTree(stream);
        rounds.push({
          ...roundProps,
          round_index: idx + 1,
        });
      }
      return rounds;
    }
    if (propName === 'SerializedArchetypes') {
      const archetypes: Array<TemEnrichedArchetype | string> = [];
      for (let i = 0; i < count; i++) {
        const jsonText = stream.readUeString();
        if (!jsonText) continue;
        try {
          const parsedObj = JSON.parse(jsonText) as Record<string, unknown>;
          archetypes.push(enrichTemArchetype(parsedObj));
        } catch {
          archetypes.push(jsonText);
        }
      }
      return archetypes;
    }
    if (propName === 'Tags') {
      const tags: number[] = [];
      for (let i = 0; i < count; i++) {
        tags.push(stream.readI32());
      }
      return tags;
    }
    return stream.readHex(Math.max(0, valueByteLength - 4));
  }
  return stream.readHex(Math.max(0, valueByteLength));
}

/**
 * Checks whether a binary buffer or filename represents a Rocket League `.Tem`
 * or `.decrypted.bin` SaveData training pack payload.
 */
export function isTemBinaryPayload(rawBytes: Uint8Array, fileName = ''): boolean {
  if (/\.tem$/i.test(fileName) || /\.decrypted\.bin$/i.test(fileName)) {
    return true;
  }
  if (rawBytes.byteLength < 24) {
    return false;
  }
  if (rawBytes[0] === 0x1f && rawBytes[1] === 0x8b) {
    return false;
  }
  if (rawBytes[0] === 0x7b) {
    return false;
  }
  const view = new DataView(rawBytes.buffer, rawBytes.byteOffset, rawBytes.byteLength);
  const firstWord = view.getUint32(0, true);
  const secondWord = view.getUint32(4, true);
  if (firstWord === 0xf005ba11 && secondWord === 0x7fffffff) {
    return true;
  }
  if (firstWord > 0 && firstWord % 16 === 0 && 8 + firstWord <= rawBytes.byteLength) {
    return true;
  }
  return false;
}

/**
 * Parses a raw `.Tem` binary buffer (or `.decrypted.bin` SaveData buffer) into a structured
 * `ParsedTemTrainingPack` matching RLDump's complete UE3 property tree schema.
 */
export function parseTemBinaryBytes(
  rawBytes: Uint8Array,
  fileName = 'TrainingPack.Tem'
): ParsedTemTrainingPack {
  const { header, decryptedBytes } = decryptAndVerifyTemBytes(rawBytes);
  const envelopeReader = new UeBinaryStreamReader(decryptedBytes);

  const foosballMagic = envelopeReader.readU32();
  const headerMagic = envelopeReader.readU32();
  if (foosballMagic !== 0xf005ba11) {
    throw new Error(
      `Decrypted .Tem SaveData failed FOOSBALL magic check (expected 0xF005BA11, got ${formatHex32(foosballMagic)}).`
    );
  }

  const engineVersion = envelopeReader.readI32();
  const licenseeVersion = envelopeReader.readI32();
  const typeVersion = envelopeReader.readI32();
  const savedataByteLength = envelopeReader.readI32();

  const savedataBytes = envelopeReader.readBytes(Math.max(0, savedataByteLength - 4));
  const numObjectTypes = envelopeReader.readI32();
  const objectTypes: TemObjectTypeEntry[] = [];

  for (let i = 0; i < numObjectTypes; i++) {
    const objType = envelopeReader.readUeString() || 'Unknown';
    const filePosition = envelopeReader.readU32();
    const objectIndex = envelopeReader.readU32();
    objectTypes.push({
      type: objType,
      filePosition,
      objectIndex,
    });
  }

  const trailingPaddingBytes = envelopeReader.remaining;

  const sdReader = new UeBinaryStreamReader(savedataBytes);
  const _rootObjHeader = sdReader.readU32();
  const rootProperties = readUePropertiesTree(sdReader);

  const objects: TemObjectRecord[] = [];
  for (const ot of objectTypes) {
    sdReader.seek(Math.max(0, ot.filePosition - 4));
    const objHeader = sdReader.readU32();
    const objProps = readUePropertiesTree(sdReader);
    objects.push({
      objectIndex: ot.objectIndex,
      type: ot.type,
      filePosition: ot.filePosition,
      objHeaderMagic: formatHex32(objHeader),
      properties: objProps,
    });
  }

  const primaryProps = objects[0]?.properties || {};
  const isOnlinePublished =
    Boolean(rootProperties.bUnowned) ||
    typeof primaryProps.Code === 'string' ||
    typeof primaryProps.CreatorName === 'string';
  const variant = isOnlinePublished ? 'online-published' : 'local-authoring';

  return {
    fileName,
    variant,
    temVariant: variant,
    header,
    savedataEnvelope: {
      foosballMagic: formatHex32(foosballMagic),
      headerMagic: formatHex32(headerMagic),
      engineVersion,
      licenseeVersion,
      typeVersion,
      savedataByteLength,
      trailingZeroPaddingBytes: trailingPaddingBytes,
    },
    rootProperties,
    properties: primaryProps,
    objectTypes,
    objects,
  };
}
