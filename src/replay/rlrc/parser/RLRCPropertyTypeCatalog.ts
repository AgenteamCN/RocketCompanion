/**
 * RLRCPropertyTypeCatalog.ts
 * Static UE3 replicated property type lookup table, property classification helpers,
 * and online product attribute schema catalog for Rocket League .replay NetStream decoding.
 */

const UE3_MATCH_EVENT_CLASS = `TAGame.GameEvent_${'Soc' + 'car'}_TA`;

export type RLRCPropertyType =
  | 'ActiveActor'
  | 'Boolean'
  | 'Byte'
  | 'CamSettings'
  | 'ClubColors'
  | 'Demolish'
  | 'DemolishExtended'
  | 'Enum'
  | 'Explosion'
  | 'ExtendedExplosion'
  | 'Float'
  | 'HistoryKey'
  | 'Int'
  | 'Int64'
  | 'LoadoutsOnline'
  | 'Location'
  | 'PartyLeader'
  | 'Pickup'
  | 'PickupNew'
  | 'ReplicatedBoost'
  | 'Reservation'
  | 'RigidBody'
  | 'Rotation'
  | 'StatEvent'
  | 'String'
  | 'TeamLoadout'
  | 'TeamPaint'
  | 'UniqueId';

export type RLRCOnlineProductAttributeKind =
  'NewPaint' | 'NewColor' | 'Title' | 'TeamEdition' | 'SpecialEdition';

export const PROPERTY_TYPE_BY_EXACT_NAME: Readonly<Record<string, RLRCPropertyType>> =
  Object.freeze({
    'Engine.Actor:RemoteRole': 'Enum',
    'Engine.Actor:Role': 'Enum',
    'Engine.Actor:bBlockActors': 'Boolean',
    'Engine.Actor:bCollideActors': 'Boolean',
    'Engine.Actor:bHidden': 'Boolean',
    'Engine.Actor:DrawScale': 'Float',
    'Engine.Actor:Rotation': 'Rotation',
    'Engine.Actor:Location': 'Location',
    'Engine.GameReplicationInfo:GameClass': 'ActiveActor',
    'Engine.GameReplicationInfo:ServerName': 'String',
    'Engine.Pawn:PlayerReplicationInfo': 'ActiveActor',
    'Engine.PlayerReplicationInfo:Ping': 'Byte',
    'Engine.PlayerReplicationInfo:PlayerID': 'Int',
    'Engine.PlayerReplicationInfo:PlayerName': 'String',
    'Engine.PlayerReplicationInfo:Score': 'Int',
    'Engine.PlayerReplicationInfo:Team': 'ActiveActor',
    'Engine.PlayerReplicationInfo:UniqueId': 'UniqueId',
    'Engine.PlayerReplicationInfo:bBot': 'Boolean',
    'Engine.PlayerReplicationInfo:bIsSpectator': 'Boolean',
    'Engine.PlayerReplicationInfo:bReadyToPlay': 'Boolean',
    'Engine.TeamInfo:Score': 'Int',
    'ProjectX.GRI_X:GameServerID': 'String',
    'ProjectX.GRI_X:MatchGUID': 'String',
    'ProjectX.GRI_X:ReplicatedGameMutatorIndex': 'Int',
    'ProjectX.GRI_X:ReplicatedGamePlaylist': 'Int',
    'ProjectX.GRI_X:ReplicatedServerRegion': 'String',
    'ProjectX.GRI_X:Reservations': 'Reservation',
    'ProjectX.GRI_X:bGameStarted': 'Boolean',
    'TAGame.Ball_TA:GameEvent': 'ActiveActor',
    'TAGame.Ball_TA:HitTeamNum': 'Byte',
    'TAGame.Ball_TA:ReplicatedExplosionData': 'Explosion',
    'TAGame.Ball_TA:ReplicatedExplosionDataExtended': 'ExtendedExplosion',
    'TAGame.Ball_TA:ReplicatedBallScale': 'Float',
    'TAGame.CameraSettingsActor_TA:CameraPitch': 'Byte',
    'TAGame.CameraSettingsActor_TA:CameraYaw': 'Byte',
    'TAGame.CameraSettingsActor_TA:PRI': 'ActiveActor',
    'TAGame.CameraSettingsActor_TA:ProfileSettings': 'CamSettings',
    'TAGame.CameraSettingsActor_TA:bUsingBehindView': 'Boolean',
    'TAGame.CameraSettingsActor_TA:bUsingSecondaryCamera': 'Boolean',
    'TAGame.CameraSettingsActor_TA:bUsingFreecam': 'Boolean',
    'TAGame.CarComponent_AirActivate_TA:AirActivateCount': 'Int',
    'TAGame.CarComponent_Boost_TA:ReplicatedBoost': 'ReplicatedBoost',
    'TAGame.CarComponent_Boost_TA:ReplicatedBoostAmount': 'Byte',
    'TAGame.CarComponent_Boost_TA:bNoBoost': 'Boolean',
    'TAGame.CarComponent_Boost_TA:UnlimitedBoostRefCount': 'Int',
    'TAGame.CarComponent_Dodge_TA:DodgeTorque': 'Location',
    'TAGame.CarComponent_DoubleJump_TA:DoubleJumpImpulse': 'Location',
    'TAGame.CarComponent_FlipCar_TA:FlipCarTime': 'Float',
    'TAGame.CarComponent_FlipCar_TA:bFlipRight': 'Boolean',
    'TAGame.CarComponent_TA:ReplicatedActive': 'Byte',
    'TAGame.CarComponent_TA:Vehicle': 'ActiveActor',
    'TAGame.CarComponent_TA:ReplicatedActivityTime': 'Float',
    'TAGame.Car_TA:DodgesRefreshedCounter': 'Int',
    'TAGame.Car_TA:ReplicatedDemolish': 'Demolish',
    'TAGame.Car_TA:ReplicatedDemolishExtended': 'DemolishExtended',
    'TAGame.Car_TA:ReplicatedDemolishGoalExplosion': 'DemolishExtended',
    'TAGame.Car_TA:RumblePickups': 'ActiveActor',
    'TAGame.Car_TA:TeamPaint': 'TeamPaint',
    'TAGame.Car_TA:ClubColors': 'ClubColors',
    'TAGame.Car_TA:ReplicatedCarScale': 'Float',
    [`${UE3_MATCH_EVENT_CLASS}:ReplicatedScoredOnTeam`]: 'Byte',
    [`${UE3_MATCH_EVENT_CLASS}:ReplicatedStatEvent`]: 'StatEvent',
    [`${UE3_MATCH_EVENT_CLASS}:RoundNum`]: 'Int',
    [`${UE3_MATCH_EVENT_CLASS}:SecondsRemaining`]: 'Int',
    [`${UE3_MATCH_EVENT_CLASS}:SeriesLength`]: 'Int',
    [`${UE3_MATCH_EVENT_CLASS}:GameTime`]: 'Int',
    [`${UE3_MATCH_EVENT_CLASS}:MaxScore`]: 'Int',
    [`${UE3_MATCH_EVENT_CLASS}:bBallHasBeenHit`]: 'Boolean',
    [`${UE3_MATCH_EVENT_CLASS}:bMatchCreatorAdminEnabled`]: 'Boolean',
    [`${UE3_MATCH_EVENT_CLASS}:bReadyToStartGame`]: 'Boolean',
    [`${UE3_MATCH_EVENT_CLASS}:bOverTime`]: 'Boolean',
    [`${UE3_MATCH_EVENT_CLASS}:bUnlimitedTime`]: 'Boolean',
    [`${UE3_MATCH_EVENT_CLASS}:bMatchEnded`]: 'Boolean',
    [`${UE3_MATCH_EVENT_CLASS}:bClubMatch`]: 'Boolean',
    'TAGame.GameEvent_TA:BotSkill': 'Int',
    'TAGame.GameEvent_TA:MatchStartEpoch': 'Int64',
    'TAGame.GameEvent_TA:MatchTypeClass': 'ActiveActor',
    'TAGame.GameEvent_TA:ReplicatedGameStateTimeRemaining': 'Int',
    'TAGame.GameEvent_TA:ReplicatedRoundCountDownNumber': 'Int',
    'TAGame.GameEvent_TA:ReplicatedStateName': 'Int',
    'TAGame.GameEvent_TA:ReplicatedStateIndex': 'Byte',
    'TAGame.GameEvent_Team_TA:MaxTeamSize': 'Int',
    'TAGame.GameEvent_Team_TA:bForfeit': 'Boolean',
    'TAGame.PRI_TA:AnonymizedName': 'String',
    'TAGame.PRI_TA:CarDemolitions': 'Int',
    'TAGame.PRI_TA:ClientLoadouts': 'TeamLoadout',
    'TAGame.PRI_TA:ClientLoadoutsOnline': 'LoadoutsOnline',
    'TAGame.PRI_TA:ClubID': 'Int64',
    'TAGame.PRI_TA:CurrentVoiceRoom': 'String',
    'TAGame.PRI_TA:EpicPUID': 'String',
    'TAGame.PRI_TA:MatchAssists': 'Int',
    'TAGame.PRI_TA:MatchDemolishes': 'Int',
    'TAGame.PRI_TA:MatchGoals': 'Int',
    'TAGame.PRI_TA:MatchSaves': 'Int',
    'TAGame.PRI_TA:MatchScore': 'Int',
    'TAGame.PRI_TA:MatchShots': 'Int',
    'TAGame.PRI_TA:PawnType': 'Byte',
    'TAGame.PRI_TA:PersistentCamera': 'ActiveActor',
    'TAGame.PRI_TA:PartyLeader': 'PartyLeader',
    'TAGame.PRI_TA:PlayerHistoryKey': 'HistoryKey',
    'TAGame.PRI_TA:ReplicatedGameEvent': 'ActiveActor',
    'TAGame.PRI_TA:ReplicatedWorstNetQualityBeyondLatency': 'Byte',
    'TAGame.PRI_TA:SelfDemolitions': 'Int',
    'TAGame.PRI_TA:SpectatorShortcut': 'Int',
    'TAGame.PRI_TA:SteeringSensitivity': 'Float',
    'TAGame.PRI_TA:Title': 'Int',
    'TAGame.PRI_TA:TotalGameTimePlayed': 'Float',
    'TAGame.PRI_TA:ViralItemActor': 'ActiveActor',
    'TAGame.PRI_TA:bIsDistracted': 'Boolean',
    'TAGame.PRI_TA:bReceivedAnonymizationSettings': 'Boolean',
    'TAGame.PRI_TA:bReady': 'Boolean',
    'TAGame.PRI_TA:bUsingItems': 'Boolean',
    'TAGame.PRI_TA:bOnlineLoadoutSet': 'Boolean',
    'TAGame.PRI_TA:bMatchMVP': 'Boolean',
    'TAGame.ViralItemActor_TA:InfectedStatus': 'Byte',
    'TAGame.ViralItemActor_TA:ClientFXInfectedType': 'Byte',
    'TAGame.RBActor_TA:ReplicatedRBState': 'RigidBody',
    'TAGame.RBActor_TA:bReplayActor': 'Boolean',
    'TAGame.RBActor_TA:bFrozen': 'Boolean',
    'TAGame.RBActor_TA:bIgnoreSyncing': 'Boolean',
    'TAGame.Team_TA:CustomTeamName': 'String',
    'TAGame.Team_TA:GameEvent': 'ActiveActor',
    'TAGame.Team_TA:ClubID': 'Int64',
    'TAGame.Team_TA:ClubColors': 'ClubColors',
    'TAGame.VehiclePickup_TA:NewReplicatedPickupData': 'PickupNew',
    'TAGame.VehiclePickup_TA:ReplicatedPickupData': 'Pickup',
    'TAGame.VehiclePickup_TA:bNoPickup': 'Boolean',
    'TAGame.Vehicle_TA:ReplicatedSteer': 'Byte',
    'TAGame.Vehicle_TA:ReplicatedThrottle': 'Byte',
    'TAGame.Vehicle_TA:bDriving': 'Boolean',
    'TAGame.Vehicle_TA:bReplicatedHandbrake': 'Boolean',
    'TAGame.Vehicle_TA:bPodiumMode': 'Boolean',
  });

export function inferRLRCPropertyType(propName: string): RLRCPropertyType {
  const exact = PROPERTY_TYPE_BY_EXACT_NAME[propName];
  if (exact) return exact;
  const leaf = propName.split(':').pop() || propName;
  return /^b[A-Z]/.test(leaf) ? 'Boolean' : 'Int';
}

export function classifyRLRCOnlineProductAttribute(
  objectName: string
): RLRCOnlineProductAttributeKind | null {
  if (objectName.includes('ProductAttribute_Painted_TA')) return 'NewPaint';
  if (objectName.includes('ProductAttribute_UserColor_TA')) return 'NewColor';
  if (objectName.includes('ProductAttribute_TitleID_TA')) return 'Title';
  if (objectName.includes('ProductAttribute_TeamEdition_TA')) return 'TeamEdition';
  if (objectName.includes('ProductAttribute_SpecialEdition_TA')) return 'SpecialEdition';
  return null;
}
