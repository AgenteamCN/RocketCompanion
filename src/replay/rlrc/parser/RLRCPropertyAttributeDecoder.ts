/**
 * RLRCPropertyAttributeDecoder.ts
 * Bit-level UE3 replicated property attribute decoder for Rocket League .replay files
 * supporting all 45 boxcars AttributeTag types and VersionTriplet evolution branches.
 */

import type { RLRCBitReader } from './RLRCBitReader.ts';
import {
  isRLRCVersionAtLeast,
  readRLRCHonorDuelChallenge,
  readRLRCOnlineLoadoutList,
  readRLRCOnlineLoadouts,
  readRLRCPartyLeader,
  readRLRCReservation,
  readRLRCSingleTeamLoadout,
  readRLRCUniqueId,
  type RLRCDecodedProductAttribute,
  type RLRCVersionTriplet,
} from './RLRCProductAndPlatformDecoder.ts';
import { inferRLRCPropertyType, type RLRCPropertyType } from './RLRCPropertyTypeCatalog.ts';

export type { RLRCDecodedProductAttribute, RLRCVersionTriplet };

const DEFAULT_VERSION_TRIPLET: RLRCVersionTriplet = Object.freeze({
  major: 868,
  minor: 32,
  net: 10,
  isLan: false,
  isRl223: true,
  extendedCamSettings: false,
});

function readActiveActor(br: RLRCBitReader): { active: boolean; actor: number } {
  return { active: br.readBool(), actor: br.readI32() };
}

export function decodeRLRCPropertyAttributeByType(
  br: RLRCBitReader,
  type: RLRCPropertyType,
  objects: readonly string[],
  vectorMaxBits: number,
  version: RLRCVersionTriplet = DEFAULT_VERSION_TRIPLET
): unknown {
  const readVec = () => br.readCompressedVector(vectorMaxBits, 100.0);
  const readLinVel = () => br.readCompressedVector(vectorMaxBits, 100.0);
  const readAngVel = () => br.readCompressedVector(vectorMaxBits, 10000.0);
  const readDemolishTail = () => ({
    attacker: readActiveActor(br),
    victim: readActiveActor(br),
    attackerVelocity: readLinVel(),
    victimVelocity: readLinVel(),
  });

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
    case 'QWordString':
      return version.isRl223 ? br.readString() : br.readU64String();
    case 'String':
      return br.readString();
    case 'ActiveActor':
      return readActiveActor(br);
    case 'Enum':
      return br.readBits(11);
    case 'FlaggedByte':
      return { flag: br.readBool(), byte: br.readU8() };
    case 'GameMode':
      return isRLRCVersionAtLeast(version, 868, 12, 0) ? br.readBits(8) : br.readBits(2);
    case 'Location':
      return readVec();
    case 'Rotation':
      return br.readRotationShort();
    case 'RigidBody': {
      const sleeping = br.readBool();
      const location = readVec();
      const rotation =
        version.net >= 7 ? br.readCompressedQuat() : br.readFixedCompressedQuat();
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
      return readRLRCUniqueId(br, version.net);
    case 'PartyLeader':
      return readRLRCPartyLeader(br, version.net);
    case 'HonorDuelChallenge':
      return readRLRCHonorDuelChallenge(br, version.net);
    case 'Reservation':
      return readRLRCReservation(br, version);
    case 'HistoryKey':
      return br.readBits(14);
    case 'CamSettings': {
      const fov = br.readF32();
      const height = br.readF32();
      const angle = br.readF32();
      const distance = br.readF32();
      const stiffness = br.readF32();
      const swivel = br.readF32();
      const transition = isRLRCVersionAtLeast(version, 868, 20, 0) ? br.readF32() : 1.0;
      if (version.extendedCamSettings || isRLRCVersionAtLeast(version, 868, 34, 12)) {
        br.readF32();
        br.readF32();
        br.readF32();
        br.readBool();
        br.readBool();
      }
      return { fov, height, angle, distance, stiffness, swivel, transition };
    }
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
    case 'Loadout':
      return { loadout: readRLRCSingleTeamLoadout(br) };
    case 'TeamLoadout':
      return { blue: readRLRCSingleTeamLoadout(br), orange: readRLRCSingleTeamLoadout(br) };
    case 'LoadoutOnline':
      return readRLRCOnlineLoadoutList(br, objects, version);
    case 'LoadoutsOnline':
      return readRLRCOnlineLoadouts(br, objects, version);
    case 'PickupNew':
    case 'Pickup': {
      const instigator = br.readBool() ? br.readI32() : null;
      const pickedUp = type === 'PickupNew' ? br.readU8() : br.readBool() ? 1 : 0;
      return { instigator, pickedUp, picked_up: pickedUp };
    }
    case 'PickupInfo':
      return {
        availablePickups: [readActiveActor(br), readActiveActor(br), readActiveActor(br)],
        itemsArePreview: br.readBool(),
      };
    case 'StatEvent':
      return { unknown1: br.readBool(), objectId: br.readI32() };
    case 'MusicStinger':
      return { flag: br.readBool(), cue: br.readU32(), trigger: br.readU8() };
    case 'AppliedDamage':
      return {
        id: br.readU8(),
        position: readVec(),
        damageIndex: br.readI32(),
        totalDamage: br.readI32(),
      };
    case 'DamageState':
      return {
        tileState: br.readU8(),
        damaged: br.readBool(),
        offender: br.readI32(),
        ballPosition: readVec(),
        directHit: br.readBool(),
        unknown1: br.readBool(),
      };
    case 'Welded':
      return {
        active: br.readBool(),
        actor: br.readI32(),
        offset: readVec(),
        mass: br.readF32(),
        rotation: br.readRotationShort(),
      };
    case 'Title':
      return {
        u1: br.readBool(),
        u2: br.readBool(),
        u3: br.readU32(),
        u4: br.readU32(),
        u5: br.readU32(),
        u6: br.readU32(),
        u7: br.readU32(),
        u8: br.readBool(),
      };
    case 'RepStatTitle':
      return {
        unknown: br.readBool(),
        name: br.readString(),
        unknown2: br.readBool(),
        index: br.readU32(),
        value: br.readU32(),
      };
    case 'Impulse':
      return { compressedRotation: br.readI32(), speed: br.readF32() };
    case 'LogoData':
      return { logoId: br.readU32(), swapColors: br.readBool() };
    case 'PrivateMatchSettings':
      return {
        mutators: br.readString(),
        joinableBy: br.readU32(),
        maxPlayers: br.readU32(),
        gameName: br.readString(),
        password: br.readString(),
        flag: br.readBool(),
      };
    case 'Explosion':
    case 'ExtendedExplosion': {
      const flag = br.readBool();
      const actor = br.readI32();
      const base = { flag, actor, location: readVec() };
      return type === 'ExtendedExplosion'
        ? { ...base, unknown1: br.readBool(), secondaryActor: br.readI32() }
        : base;
    }
    case 'Demolish':
      return readDemolishTail();
    case 'DemolishFx':
      return {
        customDemoFlag: br.readBool(),
        customDemoId: br.readI32(),
        ...readDemolishTail(),
      };
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
      throw new Error(`Unsupported RLRC property type "${type}"`);
  }
}

export function decodeRLRCPropertyAttribute(
  br: RLRCBitReader,
  propName: string,
  objects: readonly string[],
  vectorMaxBits: number,
  version: RLRCVersionTriplet = DEFAULT_VERSION_TRIPLET
): { type: RLRCPropertyType; value: unknown } {
  const type = inferRLRCPropertyType(propName);
  return {
    type,
    value: decodeRLRCPropertyAttributeByType(br, type, objects, vectorMaxBits, version),
  };
}
