/**
 * src/network/protocol/InputPacketCodec.ts
 * Ultra-compact Bit-Packing Binary Codec for Redundant UDP Input Packets,
 * Downstream Signal ACKs (0x80..0xBF), and Upstream Client Reliable Commands (0xC0..0xFF).
 */

export const MAGIC_BYTE = 0x52; // 'R'
export const HEADER_SIZE = 7;
export const BYTES_PER_TICK = 3;

export interface CarControlsInput {
  throttle?: number;
  steer?: number;
  pitch?: number;
  yaw?: number;
  roll?: number;
  jump?: boolean | number;
  boost?: boolean | number;
  handbrake?: boolean | number;
}

export interface UnpackedCarControls {
  throttle: number;
  steer: number;
  pitch: number;
  yaw: number;
  roll: number;
  jump: boolean;
  boost: boolean;
  handbrake: boolean;
}

export interface InputHistoryEntry {
  tick: number;
  carIndex?: number;
  controls: CarControlsInput;
}

export interface SignalAckWireItem {
  signalId?: number;
  signalType?: number;
}

export type PiggybackedSignalAck = SignalAckWireItem;
export type SignalAckEntry = SignalAckWireItem;

export interface ClientCommandWireItem {
  commandId?: number;
  commandType?: number;
  param1?: number;
  param2?: number;
}

export type PiggybackedClientCommand = ClientCommandWireItem;
export type ClientCommandEntry = ClientCommandWireItem;

export interface DecodedInputPacket {
  carIndex: number;
  targetTick: number;
  history: Array<{
    tick: number;
    carIndex: number;
    controls: UnpackedCarControls;
  }>;
  inputs?: Array<{
    tick: number;
    carIndex?: number;
    controls: UnpackedCarControls;
  }>;
  clientTimestamp: number | null;
  acks: Array<{ signalId: number; signalType: number }>;
  commands: Array<{
    commandId: number;
    commandType: number;
    param1: number;
    param2: number;
  }>;
}

export class InputPacketCodec {
  static packTickControls(ctrl: CarControlsInput = {}): [number, number, number] {
    const thr = Math.max(-31, Math.min(31, Math.round((ctrl.throttle || 0) * 31))) + 31;
    const str = Math.max(-31, Math.min(31, Math.round((ctrl.steer || 0) * 31))) + 31;
    const pit = Math.max(-3, Math.min(3, Math.round((ctrl.pitch || 0) * 3))) + 3;
    const yaw = Math.max(-3, Math.min(3, Math.round((ctrl.yaw || 0) * 3))) + 3;
    const rol = Math.max(-3, Math.min(3, Math.round((ctrl.roll || 0) * 3))) + 3;
    const jmp = ctrl.jump ? 1 : 0;
    const bst = ctrl.boost ? 1 : 0;
    const hnd = ctrl.handbrake ? 1 : 0;

    const b0 = (thr & 0x3f) | ((str & 0x30) << 2);
    const b1 = (str & 0x0f) | ((pit & 0x07) << 4) | ((yaw & 0x04) << 5);
    const b2 = (yaw & 0x03) | ((rol & 0x07) << 2) | (jmp << 5) | (bst << 6) | (hnd << 7);

    return [b0, b1, b2];
  }

  static unpackTickControls(b0: number, b1: number, b2: number): UnpackedCarControls {
    const thr = (b0 & 0x3f) - 31;
    const str = (((b0 >> 2) & 0x30) | (b1 & 0x0f)) - 31;
    const pit = ((b1 >> 4) & 0x07) - 3;
    const yaw = (((b1 >> 5) & 0x04) | (b2 & 0x03)) - 3;
    const rol = ((b2 >> 2) & 0x07) - 3;
    const jump = Boolean(b2 & (1 << 5));
    const boost = Boolean(b2 & (1 << 6));
    const handbrake = Boolean(b2 & (1 << 7));

    return {
      throttle: thr / 31.0,
      steer: str / 31.0,
      pitch: pit / 3.0,
      yaw: yaw / 3.0,
      roll: rol / 3.0,
      jump,
      boost,
      handbrake,
    };
  }

  static encode(
    carIndex: number,
    targetTick: number,
    history: InputHistoryEntry[],
    clientTimestamp: number | null = null,
    acks: SignalAckWireItem[] = [],
    commands: ClientCommandWireItem[] = []
  ): Uint8Array {
    const count = Math.min(255, history.length);
    const hasTimestamp =
      clientTimestamp !== null &&
      typeof clientTimestamp === 'number' &&
      Number.isFinite(clientTimestamp);
    const ackCount = acks && Array.isArray(acks) ? Math.min(255, acks.length) : 0;
    const cmdCount = commands && Array.isArray(commands) ? Math.min(255, commands.length) : 0;
    const hasAcksOrCommands = ackCount > 0 || cmdCount > 0;
    const acksSize = hasAcksOrCommands ? 1 + ackCount * 3 : 0;
    const cmdsSize = cmdCount > 0 ? 1 + cmdCount * 7 : 0;
    const totalSize =
      HEADER_SIZE + count * BYTES_PER_TICK + (hasTimestamp ? 8 : 0) + acksSize + cmdsSize;
    const buffer = new Uint8Array(totalSize);
    const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);

    buffer[0] = MAGIC_BYTE;
    buffer[1] = carIndex & 0xff;
    view.setUint32(2, targetTick >>> 0, false);
    buffer[6] = count & 0xff;

    for (let i = 0; i < count; i++) {
      const item = history[i];
      const [b0, b1, b2] = this.packTickControls(item.controls);
      const offset = HEADER_SIZE + i * BYTES_PER_TICK;
      buffer[offset] = b0;
      buffer[offset + 1] = b1;
      buffer[offset + 2] = b2;
    }

    let offset = HEADER_SIZE + count * BYTES_PER_TICK;
    if (hasTimestamp) {
      view.setFloat64(offset, clientTimestamp as number, false);
      offset += 8;
    }

    if (hasAcksOrCommands) {
      buffer[offset] = ackCount & 0xff;
      offset += 1;
      for (let i = 0; i < ackCount; i++) {
        const item = acks[i] || {};
        view.setUint16(offset, (item.signalId || 0) & 0xffff, false);
        buffer[offset + 2] = (item.signalType || 0) & 0xff;
        offset += 3;
      }
    }

    if (cmdCount > 0) {
      buffer[offset] = cmdCount & 0xff;
      offset += 1;
      for (let i = 0; i < cmdCount; i++) {
        const cmd = commands[i] || {};
        view.setUint16(offset, (cmd.commandId || 0) & 0xffff, false);
        buffer[offset + 2] = (cmd.commandType || 0) & 0xff;
        view.setUint16(offset + 3, (cmd.param1 || 0) & 0xffff, false);
        view.setUint16(offset + 5, (cmd.param2 || 0) & 0xffff, false);
        offset += 7;
      }
    }

    return buffer;
  }

  static decode(data: any): DecodedInputPacket | null {
    if (!data) return null;

    if (
      typeof data === 'object' &&
      !(data instanceof Uint8Array) &&
      !(data instanceof ArrayBuffer)
    ) {
      if (data.history) {
        return {
          ...data,
          clientTimestamp: data.clientTimestamp ?? data.timestamp ?? null,
          acks: data.acks ?? [],
          commands: data.commands ?? [],
        };
      }
      if (data.tick !== undefined && data.controls) {
        return {
          carIndex: data.carIndex ?? 0,
          targetTick: data.tick,
          history: [
            {
              tick: data.tick,
              carIndex: data.carIndex ?? 0,
              controls: data.controls,
            },
          ],
          clientTimestamp: data.clientTimestamp ?? data.timestamp ?? null,
          acks: [],
          commands: [],
        };
      }
      return data;
    }

    const u8: Uint8Array = data instanceof ArrayBuffer ? new Uint8Array(data) : data;
    if (u8.length < HEADER_SIZE) return null;
    if (u8[0] !== MAGIC_BYTE) return null;

    const view = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    const carIndex = u8[1];
    const targetTick = view.getUint32(2, false);
    const count = u8[6];

    const expectedSize = HEADER_SIZE + count * BYTES_PER_TICK;
    if (u8.length < expectedSize) return null;

    const history: DecodedInputPacket['history'] = [];
    const startTick = targetTick - count + 1;

    for (let i = 0; i < count; i++) {
      const offset = HEADER_SIZE + i * BYTES_PER_TICK;
      const b0 = u8[offset];
      const b1 = u8[offset + 1];
      const b2 = u8[offset + 2];
      const controls = this.unpackTickControls(b0, b1, b2);
      history.push({
        tick: startTick + i,
        carIndex,
        controls,
      });
    }

    let clientTimestamp: number | null = null;
    let offset = expectedSize;
    if (u8.length >= offset + 8) {
      clientTimestamp = view.getFloat64(offset, false);
      offset += 8;
    }

    const acks: Array<{ signalId: number; signalType: number }> = [];
    if (u8.length > offset) {
      const ackCount = u8[offset];
      offset += 1;
      for (let i = 0; i < ackCount; i++) {
        if (u8.length < offset + 3) break;
        const signalId = view.getUint16(offset, false);
        const signalType = u8[offset + 2];
        acks.push({ signalId, signalType });
        offset += 3;
      }
    }

    const commands: DecodedInputPacket['commands'] = [];
    if (u8.length > offset) {
      const cmdCount = u8[offset];
      offset += 1;
      for (let i = 0; i < cmdCount; i++) {
        if (u8.length < offset + 7) break;
        const commandId = view.getUint16(offset, false);
        const commandType = u8[offset + 2];
        const param1 = view.getUint16(offset + 3, false);
        const param2 = view.getUint16(offset + 5, false);
        commands.push({ commandId, commandType, param1, param2 });
        offset += 7;
      }
    }

    return {
      carIndex,
      targetTick,
      history,
      clientTimestamp,
      acks,
      commands,
    };
  }
}

export default InputPacketCodec;
