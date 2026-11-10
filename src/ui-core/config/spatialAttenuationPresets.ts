/**
 * spatialAttenuationPresets.ts
 * Acoustic Attenuation Category Schema & Default Profile Presets (inspired by Rocket League / Wwise pipeline).
 */

export type AudioAttenuationCategory =
  | 'demolish'
  | 'goal_explosion'
  | 'goalpost_ping_large'
  | 'car_ball_hit'
  | 'car_bump'
  | 'goalpost_ping_small'
  | 'boost_other'
  | 'jump_dodge_other'
  | 'supersonic_other'
  | 'flip_reset_other'
  | 'engine_other'
  | 'world_surface'
  | 'boost_pickup'
  | 'wheel_landing'
  | 'ball_rolling'
  | 'ball_flying';

export type AttenuationArchetypeId =
  | 'tactical_global'
  | 'primary_gameplay'
  | 'opponent_action'
  | 'opponent_engine'
  | 'world_surface_pads'
  | 'ball_continuous';

export type AttenuationCurveType =
  | 'linear'
  | 'smoothstep'
  | 'power'
  | 'exponential'
  | 'custom-bezier'
  | 'bezier'
  | 'inverse';

export interface AttenuationBezierPoints {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface SpatialAttenuationProfile {
  /** Unique category identifier */
  id: AudioAttenuationCategory;
  /** Human-readable display label for tuner UI & 3D gizmos */
  label: string;
  /** High-level acoustic archetype grouping */
  archetype: AttenuationArchetypeId;
  /** Inner full-volume sphere radius in Unreal Units (R_min: Gain = 1.0 inside) */
  minDistanceUU: number;
  /** Outer cutoff sphere radius in Unreal Units (R_max: Gain = minGainFloor outside) */
  maxDistanceUU: number;
  /** Far-field floor gain [0.0 .. 1.0]. Must be 0.0 for local/opponent noise! */
  minGainFloor: number;
  /** Mathematical rolloff curve model */
  curveType: AttenuationCurveType;
  /** Exponent p for 'power' curve ((1 - t)^p). p < 1 = convex slow rolloff; p > 1 = concave fast rolloff */
  curveExponent: number;
  /** Control points for 'custom-bezier' / 'bezier' rolloff curve */
  bezierPoints: AttenuationBezierPoints;
  /** Whether to hard-cull (return 0 gain / skip voice) strictly beyond maxDistanceUU when minGainFloor === 0 */
  cullBeyondMax: boolean;
  /** Optional stereo spread factor inside inner radius [0.0 .. 1.0] */
  innerSpread: number;
}

export type SpatialAttenuationProfileMap = Record<
  AudioAttenuationCategory,
  SpatialAttenuationProfile
>;

export const AUDIO_ATTENUATION_CATEGORIES: readonly AudioAttenuationCategory[] = Object.freeze([
  'demolish',
  'goal_explosion',
  'goalpost_ping_large',
  'car_ball_hit',
  'car_bump',
  'goalpost_ping_small',
  'boost_other',
  'jump_dodge_other',
  'supersonic_other',
  'flip_reset_other',
  'engine_other',
  'world_surface',
  'boost_pickup',
  'wheel_landing',
  'ball_rolling',
  'ball_flying',
]);

export const ALLOWED_CURVE_TYPES: readonly AttenuationCurveType[] = Object.freeze([
  'linear',
  'smoothstep',
  'power',
  'exponential',
  'custom-bezier',
  'bezier',
  'inverse',
]);

export const DEFAULT_BEZIER_POINTS: AttenuationBezierPoints = Object.freeze({
  x1: 0.25,
  y1: 0.1,
  x2: 0.25,
  y2: 1.0,
});

export const DEFAULT_SPATIAL_ATTENUATION_PROFILES: Readonly<
  Record<AudioAttenuationCategory, SpatialAttenuationProfile>
> = Object.freeze({
  // 1. Tactical Global (High-priority global impacts: R_min 800 UU, R_max 12000-12500 UU, convex slow rolloff)
  demolish: Object.freeze({
    id: 'demolish',
    label: 'Demolish Explosion',
    archetype: 'tactical_global',
    minDistanceUU: 800,
    maxDistanceUU: 12000,
    minGainFloor: 0.4,
    curveType: 'power',
    curveExponent: 0.65,
    bezierPoints: { ...DEFAULT_BEZIER_POINTS },
    cullBeyondMax: false,
    innerSpread: 0.5,
  }),
  goal_explosion: Object.freeze({
    id: 'goal_explosion',
    label: 'Goal Explosion',
    archetype: 'tactical_global',
    minDistanceUU: 800,
    maxDistanceUU: 12500,
    minGainFloor: 0.25,
    curveType: 'power',
    curveExponent: 0.65,
    bezierPoints: { ...DEFAULT_BEZIER_POINTS },
    cullBeyondMax: false,
    innerSpread: 0.6,
  }),
  goalpost_ping_large: Object.freeze({
    id: 'goalpost_ping_large',
    label: 'Crossbar / Post Large Ping',
    archetype: 'tactical_global',
    minDistanceUU: 800,
    maxDistanceUU: 12000,
    minGainFloor: 0.6,
    curveType: 'power',
    curveExponent: 0.4,
    bezierPoints: { ...DEFAULT_BEZIER_POINTS },
    cullBeyondMax: false,
    innerSpread: 0.35,
  }),

  // 2. Primary Gameplay (Core match interactions: R_min 500 UU, R_max 7000-12000 UU, smoothstep)
  car_ball_hit: Object.freeze({
    id: 'car_ball_hit',
    label: 'Car-Ball Hit',
    archetype: 'primary_gameplay',
    minDistanceUU: 500,
    maxDistanceUU: 10000,
    minGainFloor: 0.4,
    curveType: 'smoothstep',
    curveExponent: 1.0,
    bezierPoints: { ...DEFAULT_BEZIER_POINTS },
    cullBeyondMax: false,
    innerSpread: 0.3,
  }),
  car_bump: Object.freeze({
    id: 'car_bump',
    label: 'Car-Car Bump',
    archetype: 'primary_gameplay',
    minDistanceUU: 500,
    maxDistanceUU: 7000,
    minGainFloor: 0.0,
    curveType: 'smoothstep',
    curveExponent: 1.0,
    bezierPoints: { ...DEFAULT_BEZIER_POINTS },
    cullBeyondMax: false,
    innerSpread: 0.3,
  }),
  goalpost_ping_small: Object.freeze({
    id: 'goalpost_ping_small',
    label: 'Crossbar / Post Small Ping',
    archetype: 'primary_gameplay',
    minDistanceUU: 500,
    maxDistanceUU: 12000,
    minGainFloor: 0.6,
    curveType: 'smoothstep',
    curveExponent: 1.0,
    bezierPoints: { ...DEFAULT_BEZIER_POINTS },
    cullBeyondMax: false,
    innerSpread: 0.25,
  }),

  // 3. Opponent Boost & Action (Tactical awareness across arena)
  boost_other: Object.freeze({
    id: 'boost_other',
    label: 'Opponent Boost (Start/Loop/Stop)',
    archetype: 'opponent_action',
    minDistanceUU: 0,
    maxDistanceUU: 7000,
    minGainFloor: 0.0,
    curveType: 'power',
    curveExponent: 2.3,
    bezierPoints: { ...DEFAULT_BEZIER_POINTS },
    cullBeyondMax: true,
    innerSpread: 0.2,
  }),
  jump_dodge_other: Object.freeze({
    id: 'jump_dodge_other',
    label: 'Opponent Jump / Double Jump / Dodge',
    archetype: 'opponent_action',
    minDistanceUU: 300,
    maxDistanceUU: 10000,
    minGainFloor: 0.0,
    curveType: 'power',
    curveExponent: 2.0,
    bezierPoints: { ...DEFAULT_BEZIER_POINTS },
    cullBeyondMax: false,
    innerSpread: 0.2,
  }),
  supersonic_other: Object.freeze({
    id: 'supersonic_other',
    label: 'Opponent Supersonic (Enter/Loop)',
    archetype: 'opponent_action',
    minDistanceUU: 300,
    maxDistanceUU: 4500,
    minGainFloor: 0.0,
    curveType: 'power',
    curveExponent: 1.8,
    bezierPoints: { ...DEFAULT_BEZIER_POINTS },
    cullBeyondMax: true,
    innerSpread: 0.2,
  }),
  flip_reset_other: Object.freeze({
    id: 'flip_reset_other',
    label: 'Opponent Flip Reset',
    archetype: 'opponent_action',
    minDistanceUU: 350,
    maxDistanceUU: 9000,
    minGainFloor: 0.1,
    curveType: 'power',
    curveExponent: 1.0,
    bezierPoints: { ...DEFAULT_BEZIER_POINTS },
    cullBeyondMax: true,
    innerSpread: 0.3,
  }),

  // 4. Opponent Engine (Close proximity challenge awareness, hard-culled beyond 3200 UU)
  engine_other: Object.freeze({
    id: 'engine_other',
    label: 'Opponent Engine Synth',
    archetype: 'opponent_engine',
    minDistanceUU: 250,
    maxDistanceUU: 3200,
    minGainFloor: 0.0,
    curveType: 'power',
    curveExponent: 2.0,
    bezierPoints: { ...DEFAULT_BEZIER_POINTS },
    cullBeyondMax: true,
    innerSpread: 0.15,
  }),

  // 5. World Surface & Pads (Local arena surface & pad interactions)
  world_surface: Object.freeze({
    id: 'world_surface',
    label: 'Ball Floor / Wall / Ramp Hit',
    archetype: 'world_surface_pads',
    minDistanceUU: 250,
    maxDistanceUU: 10000,
    minGainFloor: 0.0,
    curveType: 'power',
    curveExponent: 1.5,
    bezierPoints: { ...DEFAULT_BEZIER_POINTS },
    cullBeyondMax: true,
    innerSpread: 0.15,
  }),
  boost_pickup: Object.freeze({
    id: 'boost_pickup',
    label: 'Boost Pad Pickup',
    archetype: 'world_surface_pads',
    minDistanceUU: 250,
    maxDistanceUU: 4000,
    minGainFloor: 0.0,
    curveType: 'power',
    curveExponent: 1.5,
    bezierPoints: { ...DEFAULT_BEZIER_POINTS },
    cullBeyondMax: true,
    innerSpread: 0.15,
  }),
  wheel_landing: Object.freeze({
    id: 'wheel_landing',
    label: 'Vehicle Wheel Landing',
    archetype: 'world_surface_pads',
    minDistanceUU: 250,
    maxDistanceUU: 3600,
    minGainFloor: 0.0,
    curveType: 'power',
    curveExponent: 1.6,
    bezierPoints: { ...DEFAULT_BEZIER_POINTS },
    cullBeyondMax: true,
    innerSpread: 0.15,
  }),

  // 6. Ball Continuous Loops (Close-field spatial presence, hard-culled beyond 2800 UU)
  ball_rolling: Object.freeze({
    id: 'ball_rolling',
    label: 'Ball Rolling Loop',
    archetype: 'ball_continuous',
    minDistanceUU: 200,
    maxDistanceUU: 2800,
    minGainFloor: 0.0,
    curveType: 'power',
    curveExponent: 2.0,
    bezierPoints: { ...DEFAULT_BEZIER_POINTS },
    cullBeyondMax: true,
    innerSpread: 0.15,
  }),
  ball_flying: Object.freeze({
    id: 'ball_flying',
    label: 'Ball Flying / Falling Loop',
    archetype: 'ball_continuous',
    minDistanceUU: 200,
    maxDistanceUU: 2800,
    minGainFloor: 0.0,
    curveType: 'power',
    curveExponent: 2.0,
    bezierPoints: { ...DEFAULT_BEZIER_POINTS },
    cullBeyondMax: true,
    innerSpread: 0.15,
  }),
});

export const DEFAULT_SPATIAL_ATTENUATION_CONFIG: Readonly<
  Record<AudioAttenuationCategory, SpatialAttenuationProfile>
> = DEFAULT_SPATIAL_ATTENUATION_PROFILES;
