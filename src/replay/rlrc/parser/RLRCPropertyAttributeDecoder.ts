/**
 * RLRCPropertyAttributeDecoder.ts
 * Bit-level UE3 replicated property attribute decoder for Rocket League .replay files.
 */

import type { RLRCBitReader } from './RLRCBitReader.ts';
import {
  classifyRLRCOnlineProductAttribute,
  inferRLRCPropertyType,
  type RLRCPropertyType,
} from './RLRCPropertyTypeCatalog.ts';

function readRemotePlatformId(br: RLRCBitReader, systemId: number, switchLabel: string): string {
  if (systemId === 0) return String(br.readBits(24));
  if (systemId === 1 || systemId === 4) return br.readU64String();
  if (systemId === 2) {
    br.readBytes(40);
    return 'PSN';
  }
  if (systemId === 6 || systemId === 7) {
    br.readBytes(32);
    return systemId === 6 ? switchLabel : 'PsyNet';
  }
  if (systemId === 11) return br.readString();
  return br.readU64String();
}

function readUniqueId(br: RLRCBitReader): { systemId: number; remoteId: string; localId: number } {
  const systemId = br.readU8();
  const remoteId = readRemotePlatformId(br, systemId, 'Switch');
  return { systemId, remoteId, localId: br.readU8() };
}

function readPartyLeader(br: RLRCBitReader): {
  systemId: number;
  remoteId: string;
  localId: number;
} {
  const systemId = br.readU8();
  if (systemId === 0) return { systemId: 0, remoteId: '0', localId: 0 };
  const remoteId = readRemotePlatformId(br, systemId, 'PsyNet');
  return { systemId, remoteId, localId: br.readU8() };
}

function readActiveActor(br: RLRCBitReader): { active: boolean; actor: number } {
  return { active: br.readBool(), actor: br.readI32() };
}

export interface RLRCDecodedProductAttribute {
  readonly unknown: boolean;
  readonly objectInd: number;
  readonly propertyName: string;
  readonly value: Record<string, unknown> | null;
}

function readSingleTeamLoadout(br: RLRCBitReader) {
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

function readOnlineLoadouts(br: RLRCBitReader, objects: readonly string[]) {
  const readProductAttr = (): RLRCDecodedProductAttribute => {
    const unknown = br.readBool();
    const objectInd = br.readU32();
    const propertyName = objects[objectInd] || '';
    const kind = classifyRLRCOnlineProductAttribute(propertyName);
    let value: Record<string, unknown> | null = null;
    if (kind === 'NewPaint') value = { NewPaint: br.readBits(31) };
    else if (kind === 'NewColor') value = { NewColor: br.readU32() };
    else if (kind === 'Title') value = { Title: br.readString() };
    else if (kind === 'TeamEdition') value = { TeamEdition: br.readBits(31) };
    else if (kind === 'SpecialEdition') value = { SpecialEdition: br.readBits(31) };
    return { unknown, objectInd, propertyName, value };
  };
  const readList = (): RLRCDecodedProductAttribute[][] => {
    const count = br.readU8();
    const slots: RLRCDecodedProductAttribute[][] = [];
    for (let i = 0; i < count; i++) {
      const itemCount = br.readU8();
      const items: RLRCDecodedProductAttribute[] = [];
      for (let j = 0; j < itemCount; j++) items.push(readProductAttr());
      slots.push(items);
    }
    return slots;
  };
  return {
    blue: readList(),
    orange: readList(),
    unknown1: br.readBool(),
    unknown2: br.readBool(),
  };
}

export function decodeRLRCPropertyAttribute(
  br: RLRCBitReader,
  propName: string,
  objects: readonly string[],
  vectorMaxBits: number
): { type: RLRCPropertyType; value: unknown } {
  const type = inferRLRCPropertyType(propName);
  const readVec = () => br.readCompressedVector(vectorMaxBits, 100.0);
  const readLinVel = () => br.readCompressedVector(vectorMaxBits, 100.0);
  const readAngVel = () => br.readCompressedVector(vectorMaxBits, 10000.0);
  const readDemolishTail = () => ({
    attacker: readActiveActor(br),
    victim: readActiveActor(br),
    attackerVelocity: readLinVel(),
    victimVelocity: readLinVel(),
  });

  const decodeByType = (): unknown => {
    switch (type) {
      case 'Boolean':
        return br.readBool();
      case 'Byte':
        return br.readU8();
      case 'Int':
        return br.readI32();
      case 'Float':
        return br.readF32();
      case 'Int64':
        return br.readU64String();
      case 'String':
        return br.readString();
      case 'ActiveActor':
        return readActiveActor(br);
      case 'Enum':
        return br.readBits(11);
      case 'Location':
        return readVec();
      case 'Rotation':
        return br.readRotationShort();
      case 'RigidBody': {
        const sleeping = br.readBool();
        const location = readVec();
        const rotation = br.readCompressedQuat();
        const linearVelocity = sleeping ? { x: 0, y: 0, z: 0 } : readLinVel();
        const angularVelocity = sleeping ? { x: 0, y: 0, z: 0 } : readAngVel();
        return {
          sleeping,
          location,
          rotation,
          linear_velocity: linearVelocity,
          angular_velocity: angularVelocity,
          linearVelocity,
          angularVelocity,
        };
      }
      case 'UniqueId':
        return readUniqueId(br);
      case 'PartyLeader':
        return readPartyLeader(br);
      case 'HistoryKey':
        return br.readBits(14);
      case 'CamSettings':
        return {
          fov: br.readF32(),
          height: br.readF32(),
          angle: br.readF32(),
          distance: br.readF32(),
          stiffness: br.readF32(),
          swivel: br.readF32(),
          transition: br.readF32(),
        };
      case 'TeamPaint':
        return {
          team: br.readU8(),
          primaryColor: br.readU8(),
          accentColor: br.readU8(),
          primaryFinish: br.readU32(),
          accentFinish: br.readU32(),
        };
      case 'ClubColors':
        return {
          blueFlag: br.readBool(),
          blueColor: br.readU8(),
          orangeFlag: br.readBool(),
          orangeColor: br.readU8(),
        };
      case 'ReplicatedBoost': {
        const grantCount = br.readU8();
        const boostAmount = br.readU8();
        const unused1 = br.readU8();
        const unused2 = br.readU8();
        return {
          grant_count: grantCount,
          boost_amount: boostAmount,
          grantCount,
          boostAmount,
          unused1,
          unused2,
        };
      }
      case 'TeamLoadout':
        return { blue: readSingleTeamLoadout(br), orange: readSingleTeamLoadout(br) };
      case 'LoadoutsOnline':
        return readOnlineLoadouts(br, objects);
      case 'Reservation': {
        const number = br.readBits(3);
        const uniqueId = readUniqueId(br);
        const name = uniqueId.systemId !== 0 ? br.readString() : '';
        return {
          number,
          uniqueId,
          name,
          unknown1: br.readBool(),
          unknown2: br.readBool(),
          unknown3: br.readBits(6),
        };
      }
      case 'PickupNew':
      case 'Pickup': {
        const instigator = br.readBool() ? br.readI32() : null;
        const pickedUp = type === 'PickupNew' ? br.readU8() : br.readBool() ? 1 : 0;
        return { instigator, pickedUp, picked_up: pickedUp };
      }
      case 'StatEvent':
        return { unknown1: br.readBool(), objectId: br.readI32() };
      case 'Explosion':
      case 'ExtendedExplosion': {
        const flag = br.readBool();
        const actor = flag ? -1 : br.readI32();
        const base = { flag, actor, location: readVec() };
        return type === 'ExtendedExplosion'
          ? { ...base, unknown1: br.readBool(), secondaryActor: br.readI32() }
          : base;
      }
      case 'Demolish':
        return readDemolishTail();
      case 'DemolishExtended': {
        const attackerPri = readActiveActor(br);
        const selfDemo = readActiveActor(br);
        const selfDemolish = br.readBool();
        const goalExplosionOwner = readActiveActor(br);
        return {
          attacker_pri: attackerPri,
          attackerPri,
          selfDemo,
          selfDemolish,
          goalExplosionOwner,
          ...readDemolishTail(),
        };
      }
      default:
        return br.readI32();
    }
  };

  return { type, value: decodeByType() };
}
