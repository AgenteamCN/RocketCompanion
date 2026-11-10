export interface OklchColor {
  l: number;
  c: number;
  h: number;
}

export interface OklabColor {
  L: number;
  a: number;
  b: number;
}

export interface LinearRgbColor {
  r: number;
  g: number;
  b: number;
}


function srgbToLinearChannel(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

export function linearToSrgbChannel(c: number): number {
  const clamped = Math.max(0, Math.min(1, c));
  return clamped <= 0.0031308
    ? 12.92 * clamped
    : 1.055 * Math.pow(clamped, 1 / 2.4) - 0.055;
}

export function hexToLinearRgb(hex: string): LinearRgbColor {
  const clean = (hex || '#000000').replace('#', '').trim();
  const full =
    clean.length === 3
      ? clean[0] + clean[0] + clean[1] + clean[1] + clean[2] + clean[2]
      : clean.padEnd(6, '0').slice(0, 6);
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return {
    r: srgbToLinearChannel((Number.isFinite(r) ? r : 0) / 255),
    g: srgbToLinearChannel((Number.isFinite(g) ? g : 0) / 255),
    b: srgbToLinearChannel((Number.isFinite(b) ? b : 0) / 255),
  };
}

export function linearRgbToHex(rgb: LinearRgbColor): string {
  const sr = Math.max(0, Math.min(255, Math.round(linearToSrgbChannel(rgb.r) * 255)));
  const sg = Math.max(0, Math.min(255, Math.round(linearToSrgbChannel(rgb.g) * 255)));
  const sb = Math.max(0, Math.min(255, Math.round(linearToSrgbChannel(rgb.b) * 255)));
  return (
    '#' +
    sr.toString(16).padStart(2, '0') +
    sg.toString(16).padStart(2, '0') +
    sb.toString(16).padStart(2, '0')
  );
}

export function hexToOklab(hex: string): OklabColor {
  const { r, g, b } = hexToLinearRgb(hex);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return {
    L: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  };
}

export function oklabToLinearRgb(L: number, a: number, b: number): LinearRgbColor {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;
  const lCube = l_ * l_ * l_;
  const mCube = m_ * m_ * m_;
  const sCube = s_ * s_ * s_;
  return {
    r: +4.0767416621 * lCube - 3.3077115913 * mCube + 0.2309699292 * sCube,
    g: -1.2684380046 * lCube + 2.6097574011 * mCube - 0.3413193965 * sCube,
    b: -0.0041960863 * lCube - 0.7034186147 * mCube + 1.707614701 * sCube,
  };
}

function isLinearRgbInGamut(rgb: LinearRgbColor): boolean {
  return (
    rgb.r >= -0.0005 &&
    rgb.r <= 1.0005 &&
    rgb.g >= -0.0005 &&
    rgb.g <= 1.0005 &&
    rgb.b >= -0.0005 &&
    rgb.b <= 1.0005
  );
}

export function oklchToLinearRgb(l: number, c: number, hDeg: number): LinearRgbColor {
  const clampedL = Math.max(0, Math.min(1, Number.isFinite(l) ? l : 0));
  const targetC = Math.max(0, Number.isFinite(c) ? c : 0);
  const hRad = ((Number.isFinite(hDeg) ? hDeg : 0) * Math.PI) / 180;
  const cosH = Math.cos(hRad);
  const sinH = Math.sin(hRad);

  let rgb = oklabToLinearRgb(clampedL, targetC * cosH, targetC * sinH);
  if (!isLinearRgbInGamut(rgb)) {
    let low = 0;
    let high = targetC;
    for (let i = 0; i < 12; i++) {
      const mid = (low + high) * 0.5;
      const candidate = oklabToLinearRgb(clampedL, mid * cosH, mid * sinH);
      if (isLinearRgbInGamut(candidate)) {
        low = mid;
      } else {
        high = mid;
      }
    }
    rgb = oklabToLinearRgb(clampedL, low * cosH, low * sinH);
  }
  return {
    r: Math.max(0, Math.min(1, rgb.r)),
    g: Math.max(0, Math.min(1, rgb.g)),
    b: Math.max(0, Math.min(1, rgb.b)),
  };
}

export function hexToOklch(hex: string): OklchColor {
  const { L, a, b } = hexToOklab(hex);
  const C = Math.sqrt(a * a + b * b);
  let H = (Math.atan2(b, a) * 180) / Math.PI;
  if (H < 0) H += 360;
  return {
    l: Number(Math.max(0, Math.min(1, L)).toFixed(4)),
    c: Number(Math.max(0, C).toFixed(4)),
    h: Number((C < 0.0002 ? 0 : H).toFixed(1)),
  };
}


