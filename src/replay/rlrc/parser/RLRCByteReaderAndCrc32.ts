/**
 * RLRCByteReaderAndCrc32.ts
 * Little-endian binary reader for Unreal Engine 3 .replay streams
 * and Rocket League polynomial (0x04c11db7, seed 0xefcbf201) CRC32 calculator.
 */

const RL_CRC_POLY = 0x04c11db7;
const RL_CRC_SEED = 0xefcbf201;
const UTF8 = new TextDecoder('utf-8');
const UTF16 = new TextDecoder('utf-16le');
let sCrcTable: Uint32Array | null = null;

function getRLCrcTable(): Uint32Array {
  if (sCrcTable) return sCrcTable;
  const tbl = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = (i << 24) >>> 0;
    for (let b = 0; b < 8; b++) {
      c = (c & 0x80000000) !== 0 ? (((c << 1) >>> 0) ^ RL_CRC_POLY) >>> 0 : (c << 1) >>> 0;
    }
    tbl[i] = c >>> 0;
  }
  sCrcTable = tbl;
  return tbl;
}

export function computeRLReplayCrc32(bytes: Uint8Array, seed: number = RL_CRC_SEED): number {
  const tbl = getRLCrcTable();
  let crc = ~seed >>> 0;
  for (let i = 0; i < bytes.length; i++) {
    crc = (((crc << 8) >>> 0) ^ tbl[((crc >>> 24) ^ bytes[i]) & 0xff]) >>> 0;
  }
  return ~crc >>> 0;
}

export class RLRCByteReader {
  readonly bytes: Uint8Array;
  readonly view: DataView;
  pos = 0;

  constructor(bytes: Uint8Array) {
    this.bytes = bytes;
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }

  get remaining(): number {
    return Math.max(0, this.bytes.byteLength - this.pos);
  }

  readU8(): number {
    return this.view.getUint8(this.pos++);
  }

  readI32(): number {
    const v = this.view.getInt32(this.pos, true);
    this.pos += 4;
    return v;
  }

  readU32(): number {
    const v = this.view.getUint32(this.pos, true);
    this.pos += 4;
    return v;
  }

  readU64String(): string {
    const lo = BigInt(this.readU32());
    const hi = BigInt(this.readU32());
    return ((hi << 32n) | lo).toString();
  }

  readF32(): number {
    const v = this.view.getFloat32(this.pos, true);
    this.pos += 4;
    return v;
  }

  readBytes(len: number): Uint8Array {
    const n = Math.max(0, Math.min(len, this.remaining));
    const slice = this.bytes.subarray(this.pos, this.pos + n);
    this.pos += n;
    return slice;
  }

  readUEString(): string {
    const len = this.readI32();
    if (len === 0) return '';
    const raw = len < 0 ? this.readBytes(-len * 2) : this.readBytes(len);
    return (len < 0 ? UTF16 : UTF8).decode(raw).replace(/\0+$/, '');
  }
}

export function readUE3Table<T>(r: RLRCByteReader, fn: (reader: RLRCByteReader) => T): T[] {
  const n = r.readI32();
  const out: T[] = [];
  for (let i = 0; i < n; i++) out.push(fn(r));
  return out;
}

export function readUE3PropertyTree(r: RLRCByteReader): Record<string, unknown> {
  const props: Record<string, unknown> = {};
  while (r.remaining > 0) {
    const name = r.readUEString();
    if (!name || name === 'None') break;
    const kind = r.readUEString();
    const byteLen = r.readI32();
    const arrIdx = r.readI32();
    let val: unknown;

    if (kind === 'IntProperty') val = r.readI32();
    else if (kind === 'FloatProperty') val = r.readF32();
    else if (kind === 'StrProperty' || kind === 'NameProperty') val = r.readUEString();
    else if (kind === 'BoolProperty') val = r.readU8() !== 0;
    else if (kind === 'QWordProperty') val = r.readU64String();
    else if (kind === 'ByteProperty') {
      const enumName = r.readUEString();
      val = { enumName, value: enumName === 'None' ? r.readU8() : r.readUEString() };
    } else if (kind === 'StructProperty') {
      val = { structName: r.readUEString(), fields: readUE3PropertyTree(r) };
    } else if (kind === 'ArrayProperty') {
      val = readUE3Table(r, readUE3PropertyTree);
    } else {
      val = Array.from(r.readBytes(Math.max(0, byteLen)));
    }

    if (arrIdx > 0 && name in props) {
      const prev = props[name];
      if (Array.isArray(prev)) prev.push(val);
      else props[name] = [prev, val];
    } else {
      props[name] = val;
    }
  }
  return props;
}
