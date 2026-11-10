export const GOLDEN_BOOST_ASSET_PATH = '/assets/boost/rush-mono';
export const PLUME_TEXTURE = `${GOLDEN_BOOST_ASSET_PATH}/plume.webp`;
export const TURBULENCE_TEXTURE = `${GOLDEN_BOOST_ASSET_PATH}/turbulence.webp`;
export const SPARKS_TEXTURE = `${GOLDEN_BOOST_ASSET_PATH}/sparks.webp`;

export const REALISTIC_TRAIL_COUNT = 160;
export const REALISTIC_DRIVE_COUNT = 32;
export const REALISTIC_TRAIL_LIFE = 1.0;
export const REALISTIC_DRIVE_LIFE = 0.5;
export const REALISTIC_TRAIL_INTERVAL = 32;
export const REALISTIC_DRIVE_RATE = 10;
export const REALISTIC_MAX_PARTICLES_PER_FRAME = 24;

export const ARCADE_TRAIL_COUNT = 72;
export const ARCADE_DRIVE_COUNT = 16;
export const ARCADE_TRAIL_LIFE = 0.36;
export const ARCADE_DRIVE_LIFE = 0.3;
export const ARCADE_TRAIL_DISTANCE = 28;
export const ARCADE_DRIVE_SPAWN_RATE = 8;
export const ARCADE_MAX_PARTICLES_PER_FRAME = 24;
export const ARCADE_BOOST_COLOR_HEX = 16750126;

export const CURVE_SCALE = new Float32Array([
  0.047923, 0.4878, 0.696485, 0.776236, 0.823334, 0.865453, 0.901153, 0.930914, 0.955217, 0.974545,
  0.989377, 1.000196, 1.007483, 1.011718, 1.013383, 1.012959, 1.010928, 1.00777, 1.003967, 1, 1,
]);
export const CURVE_OPACITY = new Float32Array([
  0, 0.052264, 0.18705, 0.371348, 0.572152, 0.75645, 0.891236, 0.9435, 0.933541, 0.905905, 0.863957,
  0.811057, 0.75057, 0.685858, 0.620283, 0.55721, 0.5, 0.391974, 0.223421, 0.068158, 0,
]);
export const CURVE_VELOCITY = new Float32Array([
  0.989099, 0.963349, 0.89434, 0.794431, 0.675982, 0.551353, 0.432905, 0.332996, 0.263987, 0.238237,
]);
export const CURVE_DRIVE_SIZE = new Float32Array([
  1, 1.02175, 1.084, 1.18225, 1.312, 1.46875, 1.648, 1.84525, 2.056, 2.27575, 2.5, 2.72425, 2.944,
  3.15475, 3.352, 3.53125, 3.688, 3.81775, 3.916, 3.97825, 4,
]);
export const CURVE_DRIVE_COLOR = new Float32Array([
  2, 1.9855, 1.944, 1.8785, 1.792, 1.6875, 1.568, 1.4365, 1.296, 1.1495, 1, 0.8505, 0.704, 0.5635,
  0.432, 0.3125, 0.208, 0.1215, 0.056, 0.0145, 0,
]);
export const CURVE_DRIVE_OPACITY = new Float32Array([
  0.25, 0.2481875, 0.243, 0.2348125, 0.224, 0.2109375, 0.196, 0.1795625, 0.162, 0.1436875, 0.125,
  0.1063125, 0.088, 0.0704375, 0.054, 0.0390625, 0.026, 0.0151875, 0.007, 0.0018125, 0,
]);
export const CURVE_DYNAMIC_X = new Float32Array([
  0, 0.147955, 0.548288, 1.135698, 1.844884, 2.610548, 3.367389, 4.050106, 4.593399, 4.931969,
  5.000516, 4.788702, 4.367, 3.7901, 3.112689, 2.389455, 1.675084, 1.024267, 0.491688, 0.132037, 0,
]);
export const CURVE_DYNAMIC_Y = new Float32Array([
  0, 0.104, 0.352, 0.648, 0.896, 1, 0.99363, 0.975704, 0.948, 0.912296, 0.87037, 0.824, 0.774963,
  0.725037, 0.676, 0.62963, 0.587704, 0.552, 0.524296, 0.50637, 0.5,
]);
export const CURVE_DYNAMIC_Z = new Float32Array([
  1, 0.9748, 0.9064, 0.8056, 0.6832, 0.55, 0.4168, 0.2944, 0.1936, 0.1252, 0.1,
]);
export const CURVE_DYNAMIC_W = new Float32Array([
  0.25, 0.271, 0.328, 0.412, 0.514, 0.625, 0.736, 0.838, 0.922, 0.979, 1,
]);

/**
 * Piecewise linear interpolation over a curve LUT.
 */
export function evalCurveLut(lut, normalizedTime) {
  const clamped = Math.max(0, Math.min(1, normalizedTime)) * (lut.length - 1);
  const idx = Math.min(lut.length - 2, Math.floor(clamped));
  const t = clamped - idx;
  return lut[idx] + (lut[idx + 1] - lut[idx]) * t;
}
