/**
 * mqttPacketCodec.ts
 * Pure binary MQTT v3.1.1 packet builders and stream frame decoder
 * for MqttWebSocketClient.
 */

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export const MQTT_PINGREQ_PACKET = new Uint8Array([0xc0, 0x00]);
export const MQTT_DISCONNECT_PACKET = new Uint8Array([0xe0, 0x00]);

export interface ParsedMqttFrame {
  packetType: number;
  flags: number;
  body: Uint8Array;
}

export interface MqttStreamPopResult {
  frames: ParsedMqttFrame[];
  remainder: Uint8Array;
  malformed: boolean;
}

export interface DecodedMqttJsonPayload {
  type?: string;
  probeId?: string;
  fromPeerId?: string;
  [key: string]: unknown;
}

export interface DecodedMqttPublishPayload {
  topic: string;
  qos: number;
  retain: boolean;
  packetId: number;
  rawText: string;
  parsedJson: DecodedMqttJsonPayload | null;
}

export function encodeRemainingLength(lengthValue: number): number[] {
  const bytes: number[] = [];
  let rem = lengthValue;
  do {
    let encodedByte = rem % 128;
    rem = Math.floor(rem / 128);
    if (rem > 0) {
      encodedByte |= 128;
    }
    bytes.push(encodedByte);
  } while (rem > 0);
  return bytes;
}

export function encodeMqttUtf8String(value: string): Uint8Array<ArrayBuffer> {
  const utf8 = textEncoder.encode(String(value || ''));
  const output = new Uint8Array(2 + utf8.length);
  output[0] = (utf8.length >> 8) & 0xff;
  output[1] = utf8.length & 0xff;
  output.set(utf8, 2);
  return output;
}

export function buildMqttConnectPacket(
  clientId: string,
  username: string,
  password: string,
  keepAliveSeconds = 30
): Uint8Array<ArrayBuffer> {
  const protocolHeader = new Uint8Array([0x00, 0x04, 0x4d, 0x51, 0x54, 0x54, 0x04]);
  let connectFlags = 0x02;
  const payloadParts = [encodeMqttUtf8String(clientId)];

  if (username) {
    connectFlags |= 0x80;
    payloadParts.push(encodeMqttUtf8String(username));
    if (password) {
      connectFlags |= 0x40;
      payloadParts.push(encodeMqttUtf8String(password));
    }
  }

  const variableTail = new Uint8Array([
    connectFlags,
    (keepAliveSeconds >> 8) & 0xff,
    keepAliveSeconds & 0xff,
  ]);

  let bodyLength = protocolHeader.length + variableTail.length;
  for (const part of payloadParts) {
    bodyLength += part.length;
  }

  const remBytes = encodeRemainingLength(bodyLength);
  const packet = new Uint8Array(1 + remBytes.length + bodyLength);
  let offset = 0;
  packet[offset++] = 0x10;
  for (const b of remBytes) {
    packet[offset++] = b;
  }
  packet.set(protocolHeader, offset);
  offset += protocolHeader.length;
  packet.set(variableTail, offset);
  offset += variableTail.length;
  for (const part of payloadParts) {
    packet.set(part, offset);
    offset += part.length;
  }
  return packet;
}

export function buildMqttSubscribePacket(
  packetId: number,
  topic: string,
  qos = 1
): Uint8Array<ArrayBuffer> {
  const topicBytes = encodeMqttUtf8String(topic);
  const bodyLength = 2 + topicBytes.length + 1;
  const remBytes = encodeRemainingLength(bodyLength);
  const packet = new Uint8Array(1 + remBytes.length + bodyLength);
  let offset = 0;
  packet[offset++] = 0x82;
  for (const b of remBytes) {
    packet[offset++] = b;
  }
  packet[offset++] = (packetId >> 8) & 0xff;
  packet[offset++] = packetId & 0xff;
  packet.set(topicBytes, offset);
  offset += topicBytes.length;
  packet[offset++] = qos & 0x03;
  return packet;
}

export function buildMqttUnsubscribePacket(
  packetId: number,
  topic: string
): Uint8Array<ArrayBuffer> {
  const topicBytes = encodeMqttUtf8String(topic);
  const bodyLength = 2 + topicBytes.length;
  const remBytes = encodeRemainingLength(bodyLength);
  const packet = new Uint8Array(1 + remBytes.length + bodyLength);
  let offset = 0;
  packet[offset++] = 0xa2;
  for (const b of remBytes) {
    packet[offset++] = b;
  }
  packet[offset++] = (packetId >> 8) & 0xff;
  packet[offset++] = packetId & 0xff;
  packet.set(topicBytes, offset);
  return packet;
}

export function buildMqttPublishPacket(
  topic: string,
  messageString: string,
  qos = 0,
  packetId = 1,
  retain = false
): Uint8Array<ArrayBuffer> {
  const topicBytes = encodeMqttUtf8String(topic);
  const payloadBytes = textEncoder.encode(messageString);
  const packetIdLength = qos > 0 ? 2 : 0;
  const bodyLength = topicBytes.length + packetIdLength + payloadBytes.length;
  const remBytes = encodeRemainingLength(bodyLength);

  const headerByte = 0x30 | ((qos & 0x03) << 1) | (retain ? 0x01 : 0x00);
  const packet = new Uint8Array(1 + remBytes.length + bodyLength);
  let offset = 0;
  packet[offset++] = headerByte;
  for (const b of remBytes) {
    packet[offset++] = b;
  }
  packet.set(topicBytes, offset);
  offset += topicBytes.length;
  if (qos > 0) {
    packet[offset++] = (packetId >> 8) & 0xff;
    packet[offset++] = packetId & 0xff;
  }
  packet.set(payloadBytes, offset);
  return packet;
}

export function buildMqttPubAckPacket(packetId: number): Uint8Array<ArrayBuffer> {
  return new Uint8Array([0x40, 0x02, (packetId >> 8) & 0xff, packetId & 0xff]);
}

export function appendMqttRxChunk(existing: Uint8Array, chunk: Uint8Array): Uint8Array {
  if (existing.length === 0) return chunk;
  const merged = new Uint8Array(existing.length + chunk.length);
  merged.set(existing, 0);
  merged.set(chunk, existing.length);
  return merged;
}

export function popMqttFramesFromBuffer(rxBuffer: Uint8Array): MqttStreamPopResult {
  const frames: ParsedMqttFrame[] = [];
  let cursorBuf = rxBuffer;

  while (cursorBuf.length >= 2) {
    const headerByte = cursorBuf[0];
    const packetType = (headerByte & 0xf0) >> 4;

    let multiplier = 1;
    let remainingLength = 0;
    let lengthByteCount = 0;
    let offset = 1;
    let malformed = false;

    while (true) {
      if (offset >= cursorBuf.length) {
        return { frames, remainder: cursorBuf, malformed: false };
      }
      const encodedByte = cursorBuf[offset++];
      lengthByteCount++;
      remainingLength += (encodedByte & 127) * multiplier;
      if ((encodedByte & 128) === 0) {
        break;
      }
      multiplier *= 128;
      if (lengthByteCount > 4) {
        malformed = true;
        break;
      }
    }

    if (malformed) {
      return { frames, remainder: new Uint8Array(0), malformed: true };
    }

    const totalPacketLength = 1 + lengthByteCount + remainingLength;
    if (cursorBuf.length < totalPacketLength) {
      return { frames, remainder: cursorBuf, malformed: false };
    }

    const body = cursorBuf.slice(1 + lengthByteCount, totalPacketLength);
    cursorBuf = cursorBuf.slice(totalPacketLength);
    frames.push({
      packetType,
      flags: headerByte & 0x0f,
      body,
    });
  }

  return { frames, remainder: cursorBuf, malformed: false };
}

export function decodeMqttPublishBody(
  flags: number,
  body: Uint8Array
): DecodedMqttPublishPayload | null {
  const qos = (flags >> 1) & 0x03;
  const retain = (flags & 0x01) !== 0;
  if (body.length < 2) return null;
  const topicLength = (body[0] << 8) | body[1];
  if (body.length < 2 + topicLength) return null;
  const topic = textDecoder.decode(body.subarray(2, 2 + topicLength));
  let cursor = 2 + topicLength;
  let packetId = 0;
  if (qos > 0) {
    if (body.length < cursor + 2) return null;
    packetId = (body[cursor] << 8) | body[cursor + 1];
    cursor += 2;
  }
  if (cursor > body.length) return null;
  const payloadBytes = body.subarray(cursor);
  let text = '';
  try {
    text = textDecoder.decode(payloadBytes);
    return {
      topic,
      qos,
      retain,
      packetId,
      rawText: text,
      parsedJson: text ? JSON.parse(text) : null,
    };
  } catch (_) {
    return {
      topic,
      qos,
      retain,
      packetId,
      rawText: text,
      parsedJson: null,
    };
  }
}
