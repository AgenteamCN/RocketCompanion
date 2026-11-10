export const DEFAULT_TEAM_COLORS: [number, number] = [3111891, 13857839];

export interface HitboxPresetDimensions {
  length: number;
  width: number;
  height: number;
  forward: number;
  up: number;
}

export const OCTANE_BOOST_OUTLETS: Array<[number, number, number]> = [
  [-57, 10.25, 20.4278],
  [-57, 10.25, -20.4278],
];

export const OCTANE_HITBOX_PRESET: HitboxPresetDimensions = {
  length: 120.507,
  width: 86.6994,
  height: 38.6591,
  forward: 13.8757,
  up: 20.755,
};

export const BOT_CAR_INDEX = 1;
