/**
 * RLRCProductAndPlatformDecoder.ts
 * Version-aware platform UniqueId, PartyLeader, Reservation, HonorDuelChallenge,
 * and online/offline vehicle loadout product attribute decoders aligned with boxcars.
 */

import type { RLRCBitReader } from './RLRCBitReader.ts';
import { classifyRLRCOnlineProductAttribute } from './RLRCPropertyTypeCatalog.ts';

export interface RLRCVersionTriplet {
  readonly major: number;
  readonly minor: number;
  readonly net: number;
  readonly isLan: boolean;
  readonly isRl223: boolean;
  readonly extendedCamSettings: boolean;
}

export interface RLRCDecodedUniqueId {
  readonly systemId: number;
  readonly remoteId: string;
  readonly localId: number;
}

export interface RLRCDecodedProductAttribute {
  readonly unknown: boolean;
  readonly objectInd: number;
  readonly propertyName: string;
  readonly value: Record<string, unknown> | null;
}

export function isRLRCVersionAtLeast(
  v: RLRCVersionTriplet,
  major: number,
  minor: number,
  net: number
): boolean {
  if (v.major !== major) return v.major > major;
  if (v.minor !== minor) return v.minor > minor;
  return v.net >= net;
}

function readRemotePlatformId(
  br: RLRCBitReader,
  systemId: number,
  netVersion: number,
  switchLabel: string
): string {
  if (systemId === 0) return String(br.readBits(24));
  if (systemId === 1 || systemId === 4 || systemId === 5) return br.readU64String();
  if (systemId === 2) {
    br.readBytes(16);
    br.readBytes(netVersion >= 1 ? 16 : 8);
    br.readU64String();
    return 'PSN';
  }
  if (systemId === 6) {
    br.readU64String();
    br.readBytes(24);
    return switchLabel;
  }
  if (systemId === 7) {
    const onlineId = br.readU64String();
    if (netVersion < 10) {
      br.readBytes(24);
    }
    return `PsyNet:${onlineId}`;
  }
  if (systemId === 11) return br.readString();
  throw new RangeError(`Unrecognized UE3 UniqueId systemId: ${systemId}`);
}

export function readRLRCUniqueId(br: RLRCBitReader, netVersion: number): RLRCDecodedUniqueId {
  const systemId = br.readU8();
  const remoteId = readRemotePlatformId(br, systemId, netVersion, 'Switch');
  return { systemId, remoteId, localId: br.readU8() };
}

export function readRLRCPartyLeader(br: RLRCBitReader, netVersion: number): RLRCDecodedUniqueId {
  const systemId = br.readU8();
  if (systemId === 0) return { systemId: 0, remoteId: '0', localId: 0 };
  const remoteId = readRemotePlatformId(br, systemId, netVersion, 'PsyNet');
  return { systemId, remoteId, localId: br.readU8() };
}

export function readRLRCHonorDuelChallenge(
  br: RLRCBitReader,
  netVersion: number
): { challenger: RLRCDecodedUniqueId; defender: RLRCDecodedUniqueId } {
  return {
    challenger: readRLRCUniqueId(br, netVersion),
    defender: readRLRCUniqueId(br, netVersion),
  };
}

export function readRLRCReservation(
  br: RLRCBitReader,
  version: RLRCVersionTriplet
): Record<string, unknown> {
  const number = br.readBits(3);
  const uniqueId = readRLRCUniqueId(br, version.net);
  let name = '';
  if (uniqueId.systemId !== 0) {
    name = br.readString();
  } else if (uniqueId.remoteId !== '0') {
    name = br.readNullTerminatedString(255);
  }
  const unknown1 = br.readBool();
  const unknown2 = br.readBool();
  const unknown3 = isRLRCVersionAtLeast(version, 868, 12, 0) ? br.readBits(6) : null;
  return {
    number,
    uniqueId,
    name,
    unknown1,
    unknown2,
    unknown3,
  };
}

export function readRLRCSingleTeamLoadout(br: RLRCBitReader) {
  const version = br.readU8();
  const body = br.readU32();
  const decal = br.readU32();
  const wheels = br.readU32();
  const rocketTrail = br.readU32();
  const antenna = br.readU32();
  const topper = br.readU32();
  const unknown1 = br.readU32();
  const unknown2 = version > 10 ? br.readU32() : 0;
  const engineAudio = version >= 16 ? br.readU32() : 0;
  const trail = version >= 16 ? br.readU32() : 0;
  const goalExplosion = version >= 16 ? br.readU32() : 0;
  const banner = version >= 17 ? br.readU32() : 0;
  const productId = version >= 19 ? br.readU32() : 0;
  if (version >= 22) {
    br.readU32();
    br.readU32();
    br.readU32();
  }
  return Object.assign([body, decal, wheels, rocketTrail, antenna, topper, unknown1, unknown2], {
    version,
    body,
    decal,
    wheels,
    rocketTrail,
    antenna,
    topper,
    unknown1,
    unknown2,
    engineAudio,
    trail,
    goalExplosion,
    banner,
    productId,
  });
}

export function readRLRCOnlineLoadoutList(
  br: RLRCBitReader,
  objects: readonly string[],
  version: RLRCVersionTriplet
): RLRCDecodedProductAttribute[][] {
  const isNewColorVer = isRLRCVersionAtLeast(version, 868, 23, 8);
  const isNewPaintVer = isRLRCVersionAtLeast(version, 868, 18, 0);

  const readProductAttr = (): RLRCDecodedProductAttribute => {
    const unknown = br.readBool();
    const objectInd = br.readU32();
    const propertyName = objects[objectInd] || '';
    const kind = classifyRLRCOnlineProductAttribute(propertyName);
    let value: Record<string, unknown> | null = null;
    if (kind === 'NewPaint') {
      value = isNewPaintVer
        ? { NewPaint: br.readBits(31) }
        : { OldPaint: br.readBitsMax(14) };
    } else if (kind === 'NewColor') {
      value = isNewColorVer
        ? { NewColor: br.readU32() }
        : { OldColor: br.readBool() ? br.readBits(31) : null };
    } else if (kind === 'Title') {
      value = { Title: br.readString() };
    } else if (kind === 'TeamEdition') {
      value = isNewPaintVer
        ? { TeamEdition: br.readBits(31) }
        : { OldTeamEdition: br.readBitsMax(14) };
    } else if (kind === 'SpecialEdition') {
      value = { SpecialEdition: br.readBits(31) };
    } else if (kind === 'Certified') {
      value = { Certified: { stat: br.readBits(31), value: br.readU32() } };
    }
    return { unknown, objectInd, propertyName, value };
  };

  const count = br.readU8();
  const slots: RLRCDecodedProductAttribute[][] = [];
  for (let i = 0; i < count; i++) {
    const itemCount = br.readU8();
    const items: RLRCDecodedProductAttribute[] = [];
    for (let j = 0; j < itemCount; j++) items.push(readProductAttr());
    slots.push(items);
  }
  return slots;
}

export function readRLRCOnlineLoadouts(
  br: RLRCBitReader,
  objects: readonly string[],
  version: RLRCVersionTriplet
) {
  return {
    blue: readRLRCOnlineLoadoutList(br, objects, version),
    orange: readRLRCOnlineLoadoutList(br, objects, version),
    unknown1: br.readBool(),
    unknown2: br.readBool(),
  };
}
