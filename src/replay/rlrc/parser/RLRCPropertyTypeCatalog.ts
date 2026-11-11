/**
 * RLRCPropertyTypeCatalog.ts
 * Complete UE3 replicated property type lookup table (aligned with boxcars src/data.rs),
 * case-insensitive property type resolution, online product attribute classification,
 * and heuristic candidate bitwidth table for speculative unknown-property probing.
 */

const UE3_STD_TOKEN = 'Soc' + 'car';
const UE3_MATCH_EVENT_CLASS = `TAGame.GameEvent_${UE3_STD_TOKEN}_TA`;
const UE3_MATCH_EVENT_PRIVATE_CLASS = `TAGame.GameEvent_${UE3_STD_TOKEN}Private_TA`;
const UE3_TEAM_MATCH_CLASS = `TAGame.Team_${UE3_STD_TOKEN}_TA`;

export type RLRCPropertyType =
  | 'ActiveActor'
  | 'AppliedDamage'
  | 'Boolean'
  | 'Byte'
  | 'CamSettings'
  | 'ClubColors'
  | 'DamageState'
  | 'Demolish'
  | 'DemolishExtended'
  | 'DemolishFx'
  | 'Enum'
  | 'Explosion'
  | 'ExtendedExplosion'
  | 'FlaggedByte'
  | 'Float'
  | 'GameMode'
  | 'HistoryKey'
  | 'HonorDuelChallenge'
  | 'Impulse'
  | 'Int'
  | 'Int64'
  | 'Loadout'
  | 'LoadoutOnline'
  | 'LoadoutsOnline'
  | 'Location'
  | 'LogoData'
  | 'MusicStinger'
  | 'PartyLeader'
  | 'Pickup'
  | 'PickupInfo'
  | 'PickupNew'
  | 'PrivateMatchSettings'
  | 'QWordString'
  | 'ReplicatedBoost'
  | 'RepStatTitle'
  | 'Reservation'
  | 'RigidBody'
  | 'Rotation'
  | 'StatEvent'
  | 'String'
  | 'TeamLoadout'
  | 'TeamPaint'
  | 'Title'
  | 'UniqueId'
  | 'Unknown'
  | 'Welded';

export type RLRCOnlineProductAttributeKind =
  | 'NewPaint'
  | 'NewColor'
  | 'Title'
  | 'TeamEdition'
  | 'SpecialEdition'
  | 'Certified';

function buildPropertyTypeCatalog(): Readonly<Record<string, RLRCPropertyType>> {
  const map: Record<string, RLRCPropertyType> = {};
  const def = (
    cls: string,
    groups: Partial<Record<RLRCPropertyType, string | readonly string[]>>
  ): void => {
    for (const [type, raw] of Object.entries(groups) as [
      RLRCPropertyType,
      string | readonly string[],
    ][]) {
      const props = typeof raw === 'string' ? raw.split(' ') : raw;
      for (const p of props) map[`${cls}:${p}`] = type;
    }
  };

  def('Engine.Actor', {
    Boolean: 'bBlockActors bCollideActors bCollideWorld bHidden bNetOwner bTearOff',
    Float: 'DrawScale',
    Location: 'Location',
    Enum: 'RemoteRole Role',
    Rotation: 'Rotation',
  });
  def('Engine.GameReplicationInfo', {
    Boolean: 'bMatchIsOver',
    ActiveActor: 'GameClass',
    String: 'ServerName',
  });
  def('Engine.Pawn', {
    Boolean: 'bFastAttachedMove bIsCrouched bUsedByMatinee',
    Int: 'HealthMax',
    ActiveActor: 'PlayerReplicationInfo',
    Byte: 'RemoteViewPitch',
  });
  def('Engine.PlayerReplicationInfo', {
    Boolean: 'bAdmin bBot bIsSpectator bReadyToPlay bTimedOut bWaitingPlayer',
    Byte: 'Ping',
    Int: 'PlayerID Score',
    String: 'PlayerName RemoteUserData',
    ActiveActor: 'Team',
    UniqueId: 'UniqueId',
  });
  def('Engine.ReplicatedActor_ORS', { ActiveActor: 'ReplicatedOwner' });
  def('Engine.TeamInfo', { Int: 'Score' });
  def('ProjectX.GRI_X', {
    Boolean: 'bGameStarted',
    QWordString: 'GameServerID',
    String: 'MatchGuid MatchGUID ReplicatedServerRegion',
    Int: 'ReplicatedGameMutatorIndex ReplicatedGamePlaylist',
    Reservation: 'Reservations',
  });
  def('TAGame.Ball_Blade_TA', { ActiveActor: 'ClosestTargetPRI TargetPRI', Float: 'ExtraSpeed' });
  def('TAGame.Ball_Breakout_TA', {
    AppliedDamage: 'AppliedDamage',
    Int: 'DamageIndex',
    Byte: 'LastTeamTouch',
  });
  def('TAGame.Ball_Fire_TA', { Float: 'TeamNumChangeTimestamp' });
  def('TAGame.Ball_God_TA', { Float: 'TargetSpeed' });
  def('TAGame.Ball_Haunted_TA', {
    Boolean: 'bIsBallBeamed',
    Byte: 'DeactivatedGoalIndex LastTeamTouch ReplicatedBeamBrokenValue TotalActiveBeams',
  });
  def('TAGame.Ball_Spawner_TA', { Float: 'SpawnDelaySeconds', ActiveActor: 'SpawnedBall' });
  def('TAGame.Ball_TA', {
    Float: [
      'AdditionalCarGroundBounceScaleXY', 'AdditionalCarGroundBounceScaleZ', 'BallHitSpinScale',
      'MagnusMinSpeed', 'ReplicatedAddedCarBounceScale', 'ReplicatedBallGravityScale',
      'ReplicatedBallMaxLinearSpeedScale', 'ReplicatedBallScale', 'ReplicatedWorldBounceScale',
    ],
    Location: 'AirResistance',
    Boolean: 'bPossessionEnabled bWarnBallReset',
    Int: 'GameBallIndex',
    ActiveActor: 'GameEvent ReplicatedPhysMatOverride',
    Byte: 'HitTeamNum',
    Explosion: 'ReplicatedExplosionData',
    ExtendedExplosion: 'ReplicatedExplosionDataExtended',
    FlaggedByte: 'ReplicatedExplosionDataReactive',
  });
  def('TAGame.BallKeepUpComponent_TA', {
    ActiveActor: 'BallOwner',
    Byte: 'KeepUpState',
    Int: 'Score',
  });
  def('TAGame.BreakOutActor_Platform_TA', { DamageState: 'DamageState' });
  def('TAGame.CameraSettingsActor_TA', {
    Boolean:
      'bMouseCameraToggleEnabled bUsingBehindView bUsingFreecam bUsingSecondaryCamera bUsingSwivel',
    Byte: 'CameraPitch CameraYaw FreeLookAnchorPitch FreeLookAnchorYaw',
    ActiveActor: 'PRI',
    CamSettings: 'ProfileSettings',
  });
  def('TAGame.Cannon_TA', { Byte: 'FireCount', Float: 'Pitch' });
  def('TAGame.Car_KnockOut_TA', {
    Impulse: 'ReplicatedImpulse',
    Byte: 'ReplicatedStateChanged',
    Int: 'ReplicatedStateName',
    ActiveActor: 'UsedAttackComponent',
  });
  def('TAGame.Car_TA', {
    Float:
      'AddedBallForceMultiplier AddedCarForceMultiplier ReplicatedCarMaxLinearSpeedScale ReplicatedCarScale',
    ActiveActor: 'AttachedPickup RumblePickups',
    Boolean: 'bUnlimitedJumps bUnlimitedTimeForDodge',
    ClubColors: 'ClubColors',
    Int: 'DodgesRefreshedCounter MaxNumJumps',
    DemolishFx: 'ReplicatedDemolish_CustomFX ReplicatedDemolishGoalExplosion',
    Demolish: 'ReplicatedDemolish',
    DemolishExtended: 'ReplicatedDemolishExtended',
    TeamPaint: 'TeamPaint',
  });
  def('TAGame.CarComponent_AirActivate_TA', { Int: 'AirActivateCount' });
  def('TAGame.CarComponent_Boost_TA', {
    Boolean: 'bNoBoost bRechargeGroundOnly bUnlimitedBoost',
    Float: 'BoostModifier RechargeDelay RechargeRate',
    Byte: 'BoostRestriction ReplicatedBoostAmount',
    ReplicatedBoost: 'ReplicatedBoost',
    Int: 'UnlimitedBoostRefCount',
  });
  def('TAGame.CarComponent_Dodge_KO_TA', { Int: 'DodgeRotationCompressed' });
  def('TAGame.CarComponent_Dodge_TA', { Location: 'DodgeImpulse DodgeTorque' });
  def('TAGame.CarComponent_DoubleJump_TA', { Location: 'DoubleJumpImpulse' });
  def('TAGame.CarComponent_FlipCar_TA', { Boolean: 'bFlipRight', Float: 'FlipCarTime' });
  def('TAGame.CarComponent_TA', {
    Byte: 'ReplicatedActive',
    Float: 'ReplicatedActivityTime',
    ActiveActor: 'Vehicle',
  });
  def('TAGame.CarComponent_Torque_TA', { Int: 'ReplicatedTorqueInput', Float: 'TorqueScale' });
  def('TAGame.CrowdActor_TA', {
    ActiveActor: 'GameEvent ReplicatedOneShotSound',
    Float: 'ModifiedNoise',
    Int: 'ReplicatedCountDownNumber ReplicatedRoundCountDownNumber',
  });
  def('TAGame.CrowdManager_TA', { ActiveActor: 'GameEvent ReplicatedGlobalOneShotSound' });
  def(UE3_MATCH_EVENT_CLASS, {
    HonorDuelChallenge: 'AcceptedHonorDuel',
    Boolean: [
      'bAllowHonorDuels', 'bBallHasBeenHit', 'bClubMatch', 'bDisableCrowdSound', 'bFullClubMatch',
      'bFullMatchWinnerDecided', 'bGoalsEnabled', 'bMatchCreatorAdminEnabled', 'bMatchEnded',
      'bNoContest', 'bOverTime', 'bReadyToStartGame', 'bShouldSpawnGoalIndicators',
      'bShowIntroScene', 'bUnlimitedTime',
    ],
    Int: 'GameTime MaxScore RoundNum SecondsRemaining SeriesLength TotalGameBalls',
    ActiveActor: 'GameWinner MatchWinner MVP SubRulesArchetype',
    MusicStinger: 'ReplicatedMusicStinger',
    Byte: 'ReplicatedScoredOnTeam ReplicatedServerPerformanceState',
    StatEvent: 'ReplicatedStatEvent',
  });
  def(UE3_MATCH_EVENT_PRIVATE_CLASS, { PrivateMatchSettings: 'MatchSettings' });
  def('TAGame.GameEvent_TA', {
    Boolean:
      'bAllowReadyUp bAlwaysShowMatchTypeLabel bCanVoteToForfeit bHasLeaveMatchPenalty bIsBotMatch',
    Int: 'BotSkill ReplicatedGameStateTimeRemaining ReplicatedRoundCountDownNumber ReplicatedStateName',
    ActiveActor: 'DemoFXOverride MatchTypeClass',
    GameMode: 'GameMode',
    Int64: 'MatchStartEpoch',
    Byte: 'ReplicatedStateIndex',
    String: 'RichPresenceString',
  });
  def('TAGame.GameEvent_Team_TA', {
    Boolean: 'bDisableMutingOtherTeam bDisableQuickChat bForfeit',
    Int: 'MaxTeamSize',
  });
  def('TAGame.GRI_TA', {
    Boolean: 'bAllowTargetFind',
    String: 'LanMatchGUID NewDedicatedServerIP',
  });
  def('TAGame.KeepUpIndicator_TA', { ActiveActor: 'ComponentOwner' });
  def('TAGame.MaxTimeWarningData_TA', { Int64: 'EndGameEpochTime EndGameWarningEpochTime' });
  def('TAGame.PickupTimer_TA', { Int: 'MaxTimeTillItem TimeTillItem' });
  def('TAGame.PlayerStart_Platform_TA', { Boolean: 'bActive' });
  def('TAGame.PRI_KnockOut_TA', {
    Boolean: 'bIsActiveMVP bIsEliminated',
    Int: 'Blocks DamageCaused EliminationOrder Grabs Hits KnockoutDeaths Knockouts',
  });
  def('TAGame.PRI_TA', {
    String: 'AnonymizedName CurrentVoiceRoom EpicPUID',
    Boolean: [
      'bAnonymizeToOpponents', 'bAnonymizeToTeammates', 'bEligibleForHonorDuels', 'bIdleBanned',
      'bIsDistracted', 'bIsInSplitScreen', 'bMatchMVP', 'bOnlineLoadoutSet', 'bOnlineLoadoutsSet',
      'bReady', 'bReceivedAnonymizationSettings', 'bUsingBehindView', 'bUsingItems',
      'bUsingSecondaryCamera', 'PlayerHistoryValid',
    ],
    Byte: 'CameraPitch CameraYaw PawnType PlayerStatus ReplicatedWorstNetQualityBeyondLatency',
    CamSettings: 'CameraSettings',
    Loadout: 'ClientLoadout',
    LoadoutOnline: 'ClientLoadoutOnline',
    TeamLoadout: 'ClientLoadouts',
    LoadoutsOnline: 'ClientLoadoutsOnline',
    Int64: 'ClubID',
    PartyLeader: 'PartyLeader',
    ActiveActor: 'PersistentCamera ReplicatedGameEvent ViralItemActor',
    HistoryKey: 'PlayerHistoryKey',
    Title: 'PrimaryTitle SecondaryTitle',
    RepStatTitle: 'RepStatTitles',
    FlaggedByte: 'SkillTier',
    Float: 'SteeringSensitivity TotalGameTimePlayed TotalIdleTime',
    Int: [
      'BallDemolitions', 'BallDemolitionSaves', 'BallTouches', 'BoostPickups', 'BotBannerProductID',
      'BotProductName', 'CarDemolitions', 'CarTouches', 'Dodges', 'EquippedTitleStatValue',
      'KeepUpClears', 'KeepUpDenials', 'KeepUpPossessions', 'MatchAerialHits', 'MatchAssists',
      'MatchBicycleHits', 'MatchBreakoutDamage', 'MatchCenters', 'MatchClears', 'MatchCrossbarHits',
      'MatchDemolishes', 'MatchEpicSaves', 'MatchFirstTouches', 'MatchFlipResets', 'MatchGoals',
      'MatchHighFives', 'MatchJuggleHits', 'MatchLowFives', 'MatchPoolShots', 'MatchSaves',
      'MatchScore', 'MatchShots', 'MatchTimesDemolished', 'MaxTimeTillItem', 'PossessionClears',
      'PossessionDenials', 'PossessionSteals', 'PowerUpsUsed', 'SelfDemolitions',
      'SpectatorShortcut', 'TimeTillItem', 'Title', 'TotalXP',
    ],
  });
  def('TAGame.RBActor_TA', {
    Boolean: 'bFrozen bIgnoreSyncing bReplayActor',
    RigidBody: 'ReplicatedRBState',
    Byte: 'TeleportCounter',
    Welded: 'WeldedInfo',
  });
  def('TAGame.RumblePickups_TA', {
    ActiveActor: 'AttachedPickup',
    Int: 'ConcurrentItemCount',
    PickupInfo: 'PickupInfo',
  });
  def('TAGame.SpecialPickup_BallFreeze_TA', { Float: 'RepOrigSpeed' });
  def('TAGame.SpecialPickup_BallVelcro_TA', {
    Float: 'AttachTime BreakTime',
    Boolean: 'bBroken bHit',
  });
  def('TAGame.SpecialPickup_Football_TA', { ActiveActor: 'WeldedBall' });
  def('TAGame.SpecialPickup_Rugby_TA', { Boolean: 'bBallWelded' });
  def('TAGame.SpecialPickup_Targeted_TA', { ActiveActor: 'Targeted' });
  def('TAGame.Stunlock_TA', {
    ActiveActor: 'Car',
    Float: 'MashTime MaxStunTime StunTimeRemaining',
  });
  def(UE3_TEAM_MATCH_CLASS, { Int: 'GameScore' });
  def('TAGame.Team_TA', {
    ClubColors: 'ClubColors',
    Int64: 'ClubID',
    String: 'CustomTeamName',
    Int: 'Difficulty',
    ActiveActor: 'GameEvent',
    LogoData: 'LogoData',
  });
  def('TAGame.Vehicle_TA', {
    Boolean: 'bDriving bHasPostMatchCelebration bPodiumMode bReplicatedHandbrake',
    Byte: 'InputRestriction ReplicatedSteer ReplicatedThrottle',
  });
  def('TAGame.VehiclePickup_TA', {
    Boolean: 'bNoPickup',
    PickupNew: 'NewReplicatedPickupData',
    Pickup: 'ReplicatedPickupData',
    Float: 'RespawnDelayScale',
  });
  def('TAGame.ViralItemActor_TA', { Byte: 'ClientFXInfectedType InfectedStatus' });

  return Object.freeze(map);
}

export const PROPERTY_TYPE_BY_EXACT_NAME = buildPropertyTypeCatalog();

const LOWERCASE_PROPERTY_TYPE_MAP = new Map<string, RLRCPropertyType>(
  Object.entries(PROPERTY_TYPE_BY_EXACT_NAME).map(([k, v]) => [k.toLowerCase(), v])
);

export function inferRLRCPropertyType(propName: string): RLRCPropertyType {
  const exact = PROPERTY_TYPE_BY_EXACT_NAME[propName];
  if (exact) return exact;
  const byLower = LOWERCASE_PROPERTY_TYPE_MAP.get(propName.toLowerCase());
  if (byLower) return byLower;
  return 'Unknown';
}

export function getRLRCHeuristicCandidateBitWidths(propName: string): readonly number[] {
  const leaf = propName.split(':').pop() || propName;
  if (/^b[A-Z]/.test(leaf)) {
    return [1, 8, 9, 32, 33, 11, 14, 16, 24, 64, -1];
  }
  if (/Actor|PRI|Owner|Winner|MVP|Target|Vehicle|Ball|Car|Pickup|Camera|Team/i.test(leaf)) {
    return [33, 32, 8, 9, 1, 64, 11, 14, 16, 100, -1];
  }
  if (/Pitch|Yaw|Roll|Status|State|Type|Tier|Ping|Quality|Restriction/i.test(leaf)) {
    return [8, 9, 11, 32, 1, 14, 16, 33, 64, -1];
  }
  if (/Name|GUID|Guid|String|IP|Room|PUID|Region/i.test(leaf)) {
    return [-1, 64, 32, 8, 9, 1, 33];
  }
  return [
    32, 8, 9, 1, 33, 64, 11, 14, 16, 24, 34, 40, 41, 66, 72, 88, 96, 98, 100, 128, 160, 163, 224,
    322, -1,
  ];
}

export function classifyRLRCOnlineProductAttribute(
  objectName: string
): RLRCOnlineProductAttributeKind | null {
  if (objectName.includes('ProductAttribute_Painted_TA')) return 'NewPaint';
  if (objectName.includes('ProductAttribute_UserColor_TA')) return 'NewColor';
  if (objectName.includes('ProductAttribute_TitleID_TA')) return 'Title';
  if (objectName.includes('ProductAttribute_TeamEdition_TA')) return 'TeamEdition';
  if (objectName.includes('ProductAttribute_SpecialEdition_TA')) return 'SpecialEdition';
  if (objectName.includes('ProductAttribute_Certified_TA')) return 'Certified';
  return null;
}
