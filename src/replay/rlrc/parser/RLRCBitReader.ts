/**
 * RLRCBitReader.ts
 * Self-contained LSB-first bit-packed stream reader for Rocket League UE3 .replay NetStream frames.
 */

export interface RLRCBitVector3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface RLRCBitQuaternion {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly w: number;
}

export interface RLRCBitRotationShort {
  readonly yaw: number | null;
  readonly pitch: number | null;
  readonly roll: number | null;
}

const UTF8 = new TextDecoder('utf-8');
const UTF16 = new TextDecoder('utf-16le');

export class RLRCBitReader {
  public readonly data: Uint8Array;
  public bitPos = 0;
  public readonly totalBits: number;
  private readonly scratchBytes: Uint8Array;
  private readonly scratchView: DataView;

  public constructor(data: Uint8Array) {
    this.data = data;
    this.totalBits = data.byteLength * 8;
    const scratch = new Uint8Array(8);
    this.scratchBytes = scratch;
    this.scratchView = new DataView(scratch.buffer);
  }

  public get bitsRemaining(): number {
    return this.totalBits - this.bitPos;
  }

  public readBit(): number {
    const byteIdx = this.bitPos >>> 3;
    const bitIdx = this.bitPos & 7;
    this.bitPos += 1;
    if (byteIdx >= this.data.length) {
      throw new RangeError('RLRCBitReader out of bounds');
    }
    return (this.data[byteIdx] >>> bitIdx) & 1;
  }

  public readBool(): boolean {
    return this.readBit() === 1;
  }

  public readBits(count: number): number {
    let value = 0;
    for (let i = 0; i < count; i++) {
      value |= this.readBit() << i;
    }
    return value >>> 0;
  }

  public readBitsMax(maxVal: number): number {
    if (maxVal <= 1) return 0;
    const maxBits = 32 - Math.clz32(maxVal - 1);
    let val = this.readBits(maxBits - 1);
    const highBit = (1 << (maxBits - 1)) >>> 0;
    if ((val | highBit) >>> 0 < maxVal >>> 0) {
      if (this.readBit() === 1) {
        val = (val | highBit) >>> 0;
      }
    }
    return val >>> 0;
  }

  public readU8(): number {
    return this.readBits(8);
  }

  public readI8(): number {
    const u = this.readBits(8);
    return u >= 128 ? u - 256 : u;
  }

  public readI32(): number {
    for (let i = 0; i < 4; i++) this.scratchBytes[i] = this.readBits(8);
    return this.scratchView.getInt32(0, true);
  }

  public readU32(): number {
    for (let i = 0; i < 4; i++) this.scratchBytes[i] = this.readBits(8);
    return this.scratchView.getUint32(0, true);
  }

  public readU64String(): string {
    const lo = BigInt(this.readU32());
    const hi = BigInt(this.readU32());
    return ((hi << 32n) | lo).toString();
  }

  public readF32(): number {
    for (let i = 0; i < 4; i++) this.scratchBytes[i] = this.readBits(8);
    return this.scratchView.getFloat32(0, true);
  }

  public readBytes(count: number): Uint8Array {
    const out = new Uint8Array(count);
    for (let i = 0; i < count; i++) out[i] = this.readBits(8);
    return out;
  }

  public readString(): string {
    const length = this.readI32();
    if (length === 0) return '';
    if (length < 0) {
      const charCount = -length;
      if (charCount > 4096) throw new RangeError(`Invalid UTF-16 string length: ${length}`);
      return UTF16.decode(this.readBytes(charCount * 2)).replace(/\0+$/, '');
    }
    if (length > 8192) throw new RangeError(`Invalid UTF-8 string length: ${length}`);
    return UTF8.decode(this.readBytes(length)).replace(/\0+$/, '');
  }

  public readCompressedVector(maxBits = 22, scale = 1.0): RLRCBitVector3 {
    const numBits = this.readBitsMax(maxBits);
    const bias = 1 << (numBits + 1);
    const bitLen = numBits + 2;
    const dx = this.readBits(bitLen) - bias;
    const dy = this.readBits(bitLen) - bias;
    const dz = this.readBits(bitLen) - bias;
    if (scale === 1.0) return { x: dx, y: dy, z: dz };
    const inv = 1.0 / scale;
    return { x: dx * inv, y: dy * inv, z: dz * inv };
  }

  public readRotationShort(): RLRCBitRotationShort {
    const yaw = this.readBool() ? this.readI8() : null;
    const pitch = this.readBool() ? this.readI8() : null;
    const roll = this.readBool() ? this.readI8() : null;
    return { yaw, pitch, roll };
  }

  public readCompressedQuat(): RLRCBitQuaternion {
    const maxInd = this.readBits(2);
    const invScale = 2.0 / ((1 << 18) - 1);
    const invSqrt2 = 0.7071067811865475;
    const a = (this.readBits(18) * invScale - 1.0) * invSqrt2;
    const b = (this.readBits(18) * invScale - 1.0) * invSqrt2;
    const c = (this.readBits(18) * invScale - 1.0) * invSqrt2;
    const missing = Math.sqrt(Math.max(0.0, 1.0 - a * a - b * b - c * c));
    if (maxInd === 0) return { x: missing, y: a, z: b, w: c };
    if (maxInd === 1) return { x: a, y: missing, z: b, w: c };
    if (maxInd === 2) return { x: a, y: b, z: missing, w: c };
    return { x: a, y: b, z: c, w: missing };
  }
}
