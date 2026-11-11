/**
 * RLRCClassHierarchyCatalog.ts
 * Deterministic UE3 class inheritance hierarchy, object name normalization,
 * and initial spawn trajectory catalog aligned with boxcars (PARENT_CLASSES + SPAWN_STATS).
 */

const S = 'Soc' + 'car';
const MATCH_EVENT_TA = `TAGame.GameEvent_${S}_TA`;
const MATCH_EVENT_PRIVATE_TA = `TAGame.GameEvent_${S}Private_TA`;
const MATCH_EVENT_SPLITSCREEN_TA = `TAGame.GameEvent_${S}Splitscreen_TA`;
const TEAM_MATCH_TA = `TAGame.Team_${S}_TA`;

export type RLRCSpawnTrajectory = 'None' | 'Location' | 'LocationAndRotation';

export const UE3_SPAWN_TRAJECTORY_BY_CLASS: Readonly<Record<string, RLRCSpawnTrajectory>> =
  Object.freeze({
    'Engine.Actor': 'Location',
    'Engine.ZoneInfo': 'None',
    'TAGame.BreakOutActor_Platform_TA': 'None',
    'TAGame.CrowdActor_TA': 'None',
    'TAGame.CrowdManager_TA': 'None',
    'TAGame.HauntedBallTrapTrigger_TA': 'None',
    'TAGame.InMapScoreboard_TA': 'None',
    'TAGame.PlayerStart_Platform_TA': 'None',
    'TAGame.RBActor_TA': 'LocationAndRotation',
    'TAGame.VehiclePickup_Boost_TA': 'None',
    'TAGame.KeepUpIndicator_TA': 'LocationAndRotation',
  });

const LEVEL_ACTOR_CLASSES: readonly string[] = [
  'BreakOutActor_Platform_TA',
  'CrowdActor_TA',
  'CrowdManager_TA',
  'InMapScoreboard_TA',
  'PlayerStart_Platform_TA',
  'VehiclePickup_Boost_TA',
  'HauntedBallTrapTrigger_TA',
];

function buildParentClassMap(): Readonly<Record<string, string>> {
  const map: Record<string, string> = {};
  const bind = (parent: string, children: readonly string[], prefix = ''): void => {
    for (const c of children) map[`${prefix}${c}`] = parent;
  };

  bind('Core.Object', [
    'Engine.Actor', 'TAGame.ProductAttribute_TA', 'TAGame.Replay_TA',
    'TAGame.SaveData_GameEditor_Training_TA', 'TAGame.TrainingEditorData_TA',
  ]);
  bind('Engine.Actor', [
    'Engine.Info', 'Engine.NavigationPoint', 'Engine.Pawn', 'Engine.ReplicatedActor_ORS',
  ]);
  bind('Engine.Actor', [
    'Ball_Spawner_TA', 'BreakOutActor_Platform_TA', 'Cannon_TA', 'DynamicMeshActor_TA',
    'FreeplayCommands_TA', 'InMapScoreboard_TA', 'KeepUpIndicator_TA', 'PlayerStart_Platform_TA',
    'RumblePickups_TA', 'Stunlock_TA', 'ViralItemActor_TA',
  ], 'TAGame.');
  bind('Engine.Info', ['Engine.ReplicationInfo', 'Engine.TeamInfo', 'Engine.ZoneInfo']);
  bind('Engine.ReplicationInfo', [
    'Engine.GameReplicationInfo', 'Engine.PlayerReplicationInfo', 'ProjectX.NetModeReplicator_X',
  ]);
  bind('Engine.ReplicationInfo', [
    'CameraSettingsActor_TA', 'CarComponent_TA', 'CrowdActor_TA', 'CrowdManager_TA',
    'GameEvent_TA', 'VehiclePickup_TA',
  ], 'TAGame.');
  bind('Engine.ReplicatedActor_ORS', ['BallKeepUpComponent_TA', 'MaxTimeWarningData_TA'], 'TAGame.');
  bind('TAGame.DynamicMeshActor_TA', [
    'HauntedBallTrapTrigger_TA', 'TrackerWallDynamicMeshActor_TA',
  ], 'TAGame.');
  bind('TAGame.Ball_TA', [
    'Ball_Breakout_TA', 'Ball_God_TA', 'Ball_Haunted_TA', 'Ball_Trajectory_TA', 'Ball_Tutorial_TA',
  ], 'TAGame.');
  bind('TAGame.Car_TA', ['Car_Freeplay_TA', 'Car_KnockOut_TA', 'Car_Season_TA'], 'TAGame.');
  bind('TAGame.Car_Freeplay_TA', [
    'Archetypes.Car.Car_PostGameLobby',
    'Mutators.Mutators.Mutators.FreePlay:CarArchetype',
    'Mutators.Mutators.Mutators.OnlineFreeplay:CarArchetype',
  ]);
  bind('TAGame.CarComponent_TA', [
    'CarComponent_AirActivate_TA', 'CarComponent_FlipCar_TA', 'CarComponent_Jump_TA',
    'CarComponent_TerritoryDemolish_TA', 'CarComponent_Torque_TA', 'PickupTimer_TA',
    'SpecialPickup_TA',
  ], 'TAGame.');
  bind('TAGame.CarComponent_AirActivate_TA', [
    'CarComponent_Boost_TA', 'CarComponent_Dodge_TA', 'CarComponent_DoubleJump_TA',
  ], 'TAGame.');
  bind('TAGame.CarComponent_DoubleJump_TA', [
    'TAGame.CarComponent_DoubleJump_KO_TA', 'TAGame.CarComponent_DoubleJump_Robin_TA',
    'Archetypes.CarComponents.CarComponent_DoubleJump',
  ]);
  bind('TAGame.SpecialPickup_TA', [
    'SpecialPickup_BallGravity_TA', 'SpecialPickup_BallVelcro_TA', 'SpecialPickup_Football_TA',
    'SpecialPickup_HitForce_TA', 'SpecialPickup_Rugby_TA', 'SpecialPickup_Targeted_TA',
    'SpecialPickup_Tornado_TA',
  ], 'TAGame.');
  bind('TAGame.SpecialPickup_Targeted_TA', [
    'SpecialPickup_BallFreeze_TA', 'SpecialPickup_BoostOverride_TA',
    'SpecialPickup_GrapplingHook_TA', 'SpecialPickup_Spring_TA', 'SpecialPickup_Swapper_TA',
  ], 'TAGame.');
  bind('TAGame.SpecialPickup_Spring_TA', [
    'SpecialPickup_BallCarSpring_TA', 'SpecialPickup_BallLasso_TA',
  ], 'TAGame.');
  bind('TAGame.PRI_TA', ['PRI_Breakout_TA', 'PRI_KnockOut_TA', 'PRI_Possession_TA'], 'TAGame.');
  bind('TAGame.GameEvent_Tutorial_TA', [
    'GameEvent_Training_TA', 'GameEvent_Tutorial_Basic_TA', 'GameEvent_Tutorial_FreePlay_TA',
  ], 'TAGame.');
  bind('TAGame.GameEvent_Training_TA', [
    'GameEvent_Training_Aerial_TA', 'GameEvent_Training_Goalie_TA', 'GameEvent_Training_Striker_TA',
  ], 'TAGame.');
  bind(MATCH_EVENT_TA, [
    'GameEvent_Breakout_TA', 'GameEvent_Football_TA', 'GameEvent_FTE_TA', 'GameEvent_GodBall_TA',
    'GameEvent_KnockOut_TA', 'GameEvent_Season_TA', 'GameEvent_Territory_TA',
    'GameEvent_Tutorial_TA',
  ], 'TAGame.');
  bind(MATCH_EVENT_PRIVATE_TA, [
    MATCH_EVENT_SPLITSCREEN_TA, 'Archetypes.GameEvent.GameEvent_BasketballPrivate',
    'Archetypes.GameEvent.GameEvent_HockeyPrivate', `Archetypes.GameEvent.GameEvent_${S}Private`,
  ]);
  bind(MATCH_EVENT_SPLITSCREEN_TA, [
    'Archetypes.GameEvent.GameEvent_BasketballSplitscreen',
    'Archetypes.GameEvent.GameEvent_HockeySplitscreen',
    `Archetypes.GameEvent.GameEvent_${S}Splitscreen`,
  ]);
  bind(TEAM_MATCH_TA, [
    'TAGame.Team_Freeplay_TA', 'Archetypes.Teams.Team0', 'Archetypes.Teams.Team1',
  ]);
  bind('TAGame.Team_Freeplay_TA', ['Archetypes.Teams.TeamWhite0', 'Archetypes.Teams.TeamWhite1']);

  const bindPairs = (pairs: readonly (readonly [string, string])[], cPre = '', pPre = ''): void => {
    for (const [c, p] of pairs) map[`${cPre}${c}`] = `${pPre}${p}`;
  };

  bindPairs([
    ['Engine.PlayerStart', 'Engine.NavigationPoint'],
    ['Engine.WorldInfo', 'Engine.ZoneInfo'],
    ['ProjectX.GRI_X', 'Engine.GameReplicationInfo'],
    ['ProjectX.Pawn_X', 'Engine.Pawn'],
    ['ProjectX.PRI_X', 'Engine.PlayerReplicationInfo'],
    [MATCH_EVENT_PRIVATE_TA, MATCH_EVENT_TA],
    ['TAGame.GRI_TA', 'ProjectX.GRI_X'],
    ['TAGame.PRI_TA', 'ProjectX.PRI_X'],
    ['TAGame.RBActor_TA', 'ProjectX.Pawn_X'],
    ['TAGame.Team_TA', 'Engine.TeamInfo'],
    ['Archetypes.Car.Car_Default', 'TAGame.Car_TA'],
    ['Archetypes.Misc.KeepUpIndicator', 'TAGame.KeepUpIndicator_TA'],
    ['Archetypes.Tutorial.Cannon', 'TAGame.Cannon_TA'],
    ['GameInfo_FootBall.GameInfo.GameInfo_FootBall:Archetype', 'TAGame.GameEvent_Football_TA'],
    ['gameinfo_godball.GameInfo.gameinfo_godball:Archetype', 'TAGame.GameEvent_GodBall_TA'],
    ['GameInfo_GodBall.GameInfo.GameInfo_GodBall:Archetype', 'TAGame.GameEvent_GodBall_TA'],
    ['GameInfo_SnowDayTerritory.GameInfo.GameInfo_SnowDayTerritory:Archetype', 'TAGame.GameEvent_Territory_TA'],
    ['GameInfo_Territory.GameInfo.GameInfo_Territory:Archetype', 'TAGame.GameEvent_Territory_TA'],
  ]);

  bindPairs([
    ['Ball_Blade_TA', 'Ball_Fire_TA'],
    ['Ball_Fire_TA', 'Ball_God_TA'],
    ['Ball_TA', 'RBActor_TA'],
    ['Car_TA', 'Vehicle_TA'],
    ['CarComponent_Boost_KO_TA', 'CarComponent_Boost_TA'],
    ['CarComponent_Dodge_KO_TA', 'CarComponent_Dodge_TA'],
    ['CarComponent_Jump_Robin_TA', 'CarComponent_Jump_TA'],
    [`GameEvent_${S}_TA`, 'GameEvent_Team_TA'],
    ['GameEvent_Team_TA', 'GameEvent_TA'],
    ['GameEvent_Tutorial_Advanced_TA', 'GameEvent_Tutorial_Basic_TA'],
    [`Replay_${S}_TA`, 'Replay_TA'],
    ['SpecialPickup_Batarang_TA', 'SpecialPickup_BallLasso_TA'],
    ['SpecialPickup_HauntedBallBeam_TA', 'SpecialPickup_BallGravity_TA'],
    [`Team_${S}_TA`, 'Team_TA'],
    ['Vehicle_TA', 'RBActor_TA'],
    ['VehiclePickup_Boost_TA', 'VehiclePickup_TA'],
  ], 'TAGame.', 'TAGame.');

  bindPairs([
    ['Ball_Blade', 'Ball_Blade_TA'],
    ['Ball_Breakout', 'Ball_Breakout_TA'],
    ['Ball_Fire_Obstacle', 'Ball_Fire_TA'],
    ['Ball_Fire', 'Ball_Fire_TA'],
    ['Ball_God', 'Ball_God_TA'],
    ['Ball_Haunted', 'Ball_Haunted_TA'],
    ['Ball_RingSpawner', 'Ball_Spawner_TA'],
    ['Ball_Score', 'Ball_Breakout_TA'],
    ['Ball_Training', 'Ball_Tutorial_TA'],
    ['Ball_Trajectory', 'Ball_Trajectory_TA'],
    ['Ball_Tutorial', 'Ball_Tutorial_TA'],
    ['BallComponent_KeepUp', 'BallKeepUpComponent_TA'],
    ['BallSpawner_Blade', 'Ball_Spawner_TA'],
  ], 'Archetypes.Ball.', 'TAGame.');

  bindPairs([
    ['CarComponent_Boost', 'CarComponent_Boost_TA'],
    ['CarComponent_Dodge', 'CarComponent_Dodge_TA'],
    ['CarComponent_FlipCar', 'CarComponent_FlipCar_TA'],
    ['CarComponent_Jump', 'CarComponent_Jump_TA'],
    ['CarComponent_TerritoryDemolish', 'CarComponent_TerritoryDemolish_TA'],
  ], 'Archetypes.CarComponents.', 'TAGame.');

  bindPairs([
    ['GameEvent_Breakout', 'GameEvent_Breakout_TA'],
    ['GameEvent_FTE_Part1_Prime', 'GameEvent_FTE_TA'],
    ['GameEvent_Season:CarArchetype', 'Car_Season_TA'],
    ['GameEvent_Season', 'GameEvent_Season_TA'],
    ['GameEvent_Tutorial_Advanced', 'GameEvent_Tutorial_Advanced_TA'],
    ['GameEvent_Tutorial_Basic', 'GameEvent_Tutorial_Basic_TA'],
    ['GameEvent_Tutorial_FreePlay', 'GameEvent_Tutorial_FreePlay_TA'],
  ], 'Archetypes.GameEvent.', 'TAGame.');

  bindPairs([
    ['AutoFlip', 'CarComponent_FlipCar_TA'],
    ['DoubleJump', 'CarComponent_DoubleJump_Robin_TA'],
    ['Jump', 'CarComponent_Jump_Robin_TA'],
  ], 'Archetypes.Mutators.Mutator_Robin:', 'TAGame.');

  bindPairs([
    ['Aerial', 'Aerial_TA'],
    ['Goalie', 'Goalie_TA'],
    ['Striker', 'Striker_TA'],
  ], 'GameInfo_Tutorial.GameEvent.GameEvent_Tutorial_', 'TAGame.GameEvent_Training_');

  for (const [k, v] of [
    ['BallFreeze_BM', 'BallFreeze_TA'], ['BallFreeze', 'BallFreeze_TA'],
    ['BallGrapplingHook', 'GrapplingHook_TA'], ['BallLasso', 'BallLasso_TA'],
    ['BallSpring', 'BallCarSpring_TA'], ['BallVelcro', 'BallVelcro_TA'],
    ['Batarang', 'Batarang_TA'], ['BoostOverride', 'BoostOverride_TA'],
    ['CarSpring', 'BallCarSpring_TA'], ['Football', 'Football_TA'],
    ['GravityWell', 'BallGravity_TA'], ['HauntedBallBeam', 'HauntedBallBeam_TA'],
    ['Rugby', 'Rugby_TA'], ['RugbyLightDark', 'Rugby_TA'], ['StrongHit', 'HitForce_TA'],
    ['Swapper', 'Swapper_TA'], ['Tornado', 'Tornado_TA'],
  ] as const) {
    const pre = k.endsWith('_BM') ? 'Archetypes.SpecialPickups.BM.' : 'Archetypes.SpecialPickups.';
    map[`${pre}SpecialPickup_${k}`] = `TAGame.SpecialPickup_${v}`;
  }

  for (const prefix of [
    'Archetypes.KnockOut.GameEvent_Knockout',
    'GameInfo_BladeBall.GameInfo.GameInfo_BladeBall:Archetype',
  ]) {
    const sep = prefix.includes(':Archetype') ? '.CarArchetype' : ':CarArchetype';
    map[prefix] = 'TAGame.GameEvent_KnockOut_TA';
    map[`${prefix}${sep}`] = 'TAGame.Car_KnockOut_TA';
    bindPairs([
      ['.Boost', 'CarComponent_Boost_KO_TA'],
      ['.Dodge', 'CarComponent_Dodge_KO_TA'],
      ['.DoubleJump', 'CarComponent_DoubleJump_TA'],
      ['.Flip', 'CarComponent_FlipCar_TA'],
      ['.Jump', 'CarComponent_Jump_TA'],
      ['.StunlockArchetype', 'Stunlock_TA'],
      ['.Torque', 'CarComponent_Torque_TA'],
    ], `${prefix}${sep}`, 'TAGame.');
  }

  for (const lvlActor of LEVEL_ACTOR_CLASSES) {
    map[`TheWorld:PersistentLevel.${lvlActor}`] = `TAGame.${lvlActor}`;
  }

  return Object.freeze(map);
}

export const UE3_CLASS_PARENT_BY_NAME = buildParentClassMap();

const LOWERCASE_PARENT_BY_NAME = new Map<string, string>(
  Object.entries(UE3_CLASS_PARENT_BY_NAME).map(([k, v]) => [k.toLowerCase(), v])
);

export function normalizeRLRCObjectName(name: string): string {
  const marker = 'TheWorld:PersistentLevel.';
  const idx = name.indexOf(marker);
  if (idx >= 0) {
    const rest = name.slice(idx + marker.length);
    for (const prefix of LEVEL_ACTOR_CLASSES) {
      if (rest.startsWith(prefix)) return `${marker}${prefix}`;
    }
  }
  return name;
}

export function resolveRLRCParentClassName(rawName: string): string | undefined {
  const norm = normalizeRLRCObjectName(rawName);
  const direct = UE3_CLASS_PARENT_BY_NAME[norm] ?? LOWERCASE_PARENT_BY_NAME.get(norm.toLowerCase());
  if (direct) return direct;
  if (norm.includes('.Default__')) return norm.replace('.Default__', '.');
  if (norm.endsWith(':GameReplicationInfoArchetype')) return 'TAGame.GRI_TA';
  if (norm.startsWith('TAGame.ProductAttribute_') && norm !== 'TAGame.ProductAttribute_TA') {
    return 'TAGame.ProductAttribute_TA';
  }
  if (norm.startsWith('Archetypes.Mutators.SubRules.ItemsMode_RPS:')) {
    return norm.endsWith('_2')
      ? 'TAGame.SpecialPickup_BallFreeze_TA'
      : 'TAGame.SpecialPickup_BallCarSpring_TA';
  }
  if (norm.startsWith('Archetypes.Ball.')) return 'TAGame.Ball_TA';
  if (norm.startsWith('Archetypes.Car.')) return 'TAGame.Car_TA';
  if (norm.startsWith('Archetypes.GameEvent.') || norm.endsWith(':Archetype')) {
    return MATCH_EVENT_TA;
  }
  if (norm.includes('TheWorld:PersistentLevel.')) return 'Engine.Actor';
  return undefined;
}
