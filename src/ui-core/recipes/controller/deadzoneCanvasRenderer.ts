export type DeadzoneAntiAliasing = 'off' | '4x' | '9x' | '16x';
export type StickAxisOption = 'left-x' | 'left-y' | 'right-x' | 'right-y';

export const AXIS_INDEX_MAP: Record<StickAxisOption, number> = {
  'left-x': 0,
  'left-y': 1,
  'right-x': 2,
  'right-y': 3,
};

export const AA_SUPERSAMPLE_MAP: Record<DeadzoneAntiAliasing, number> = {
  off: 1,
  '4x': 2,
  '9x': 3,
  '16x': 4,
};

export function applyAxisDeadzone(raw: number, dz: number): number {
  const clampedDz = Math.max(0, Math.min(0.99, dz));
  if (Math.abs(raw) <= clampedDz) return 0;
  return raw > 0
    ? (raw - clampedDz) / (1 - clampedDz)
    : (raw + clampedDz) / (1 - clampedDz);
}

export function computeTurningAngle(vec: { x: number; y: number }): number | null {
  if (vec.x === 0 && vec.y === 0) return null;
  const toDeg = (rad: number) => (rad * 180) / Math.PI;
  if (vec.x >= 0 && vec.y <= 0) {
    return 90 + toDeg(Math.atan(-vec.y / vec.x));
  } else if (vec.x < 0 && vec.y < 0) {
    return 180 + toDeg(Math.atan(-vec.x / -vec.y));
  } else if (vec.x < 0) {
    return 270 + toDeg(Math.atan(vec.y / -vec.x));
  }
  return toDeg(Math.atan(vec.x / vec.y));
}

export function computeDodgeAngle(
  vec: { x: number; y: number },
  dodgeThreshold: number
): number | null {
  if (Math.abs(vec.x) + Math.abs(vec.y) < dodgeThreshold) return null;
  if (vec.x === 0 && vec.y === 0) return null;
  const toDeg = (rad: number) => (rad * 180) / Math.PI;
  if (vec.x >= 0 && vec.y <= 0) {
    if (Math.abs(vec.y / vec.x) <= 0.1) return 90;
    if (Math.abs(vec.x / vec.y) <= 0.1) return 180;
    return 90 + toDeg(Math.atan(-vec.y / vec.x));
  } else if (vec.x < 0 && vec.y < 0) {
    if (Math.abs(-vec.x / vec.y) <= 0.1) return 180;
    if (Math.abs(vec.y / vec.x) <= 0.1) return 270;
    return 180 + toDeg(Math.atan(-vec.x / -vec.y));
  } else if (vec.x < 0) {
    if (Math.abs(vec.y / -vec.x) <= 0.1) return 270;
    if (Math.abs(vec.x / vec.y) <= 0.1) return 0;
    return 270 + toDeg(Math.atan(vec.y / -vec.x));
  } else {
    if (Math.abs(vec.x / vec.y) <= 0.1) return 0;
    if (Math.abs(vec.y / vec.x) <= 0.1) return 90;
    return toDeg(Math.atan(vec.x / vec.y));
  }
}

export function drawLineWithArrowhead(
  p0: { x: number; y: number },
  p1: { x: number; y: number },
  headLength: number,
  lineWidth: number,
  ctx: CanvasRenderingContext2D,
  strength: number,
  coloured: boolean
) {
  const rad225 = (225 * Math.PI) / 180;
  const rad135 = (135 * Math.PI) / 180;
  const dx = p1.x - p0.x;
  const dy = p1.y - p0.y;
  const angle = Math.atan2(dy, dx);

  const x225 = p1.x + headLength * Math.cos(angle + rad225);
  const y225 = p1.y + headLength * Math.sin(angle + rad225);
  const x135 = p1.x + headLength * Math.cos(angle + rad135);
  const y135 = p1.y + headLength * Math.sin(angle + rad135);

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(p0.x, p0.y);
  ctx.lineTo(p1.x, p1.y);
  ctx.moveTo(p1.x - Math.cos(angle + rad225), p1.y - Math.sin(angle + rad225));
  ctx.lineTo(x225, y225);
  ctx.moveTo(p1.x + Math.cos(angle + rad225), p1.y + Math.sin(angle + rad225));
  ctx.lineTo(x135, y135);

  if (coloured) {
    const clamped = Math.max(0, Math.min(1, strength));
    const strNum = Math.floor(clamped * 255);
    const invNum = 187 - Math.floor((11 / 15) * strNum);
    const strHex = strNum.toString(16).padStart(2, '0');
    const invHex = invNum.toString(16).padStart(2, '0');
    ctx.strokeStyle = `#00${invHex}${strHex}`;
  } else {
    ctx.strokeStyle = '#000000';
  }

  ctx.lineWidth = lineWidth;
  ctx.lineCap = 'butt';
  ctx.stroke();
  ctx.restore();
}

export function drawCircularOverlayMask(
  ctx: CanvasRenderingContext2D,
  size: number,
  maxDiagonal: number
) {
  const half = size * 0.5;
  const radius = Math.SQRT2 * Math.max(0, maxDiagonal) * half;
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, size, size);
  ctx.arc(half, half, radius, 0, Math.PI * 2, true);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.784)';
  ctx.fill('evenodd');
  ctx.restore();
}

export function drawRawCursorCircle(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  size: number
) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(px, py, size / 25, 0, Math.PI * 2, false);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
  ctx.fill();
  ctx.restore();
}

export function renderTurningDeadzoneCanvas(params: {
  canvas: HTMLCanvasElement;
  deadzone: number;
  showCircularOverlay: boolean;
  maxDiagonal: number;
  altArrow: boolean;
  antiAliasing: DeadzoneAntiAliasing;
  turningStick: { x: number; y: number } | null;
  gameCoords: { x: number; y: number };
}) {
  const {
    canvas,
    deadzone,
    showCircularOverlay,
    maxDiagonal,
    altArrow,
    antiAliasing,
    turningStick,
    gameCoords,
  } = params;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const baseSize = 260;
  const ss = AA_SUPERSAMPLE_MAP[antiAliasing] ?? 2;
  const size = baseSize * ss;
  if (canvas.width !== size || canvas.height !== size) {
    canvas.width = size;
    canvas.height = size;
  }

  ctx.imageSmoothingEnabled = antiAliasing !== 'off';
  const half = size * 0.5;
  const dz = Math.max(0, Math.min(0.99, deadzone));
  const dzPx = dz * half;

  ctx.fillStyle = '#00ff00';
  ctx.fillRect(0, 0, size, size);

  ctx.fillStyle = '#ffff00';
  ctx.fillRect(half - dzPx, 0, dzPx * 2, size);
  ctx.fillRect(0, half - dzPx, size, dzPx * 2);

  ctx.fillStyle = '#ff0000';
  ctx.fillRect(half - dzPx, half - dzPx, dzPx * 2, dzPx * 2);

  if (showCircularOverlay) {
    drawCircularOverlayMask(ctx, size, maxDiagonal);
  }

  if (turningStick) {
    const px = (turningStick.x + 1) * half;
    const py = (1 - turningStick.y) * half;
    drawRawCursorCircle(ctx, px, py, size);

    if (gameCoords.x !== 0 || gameCoords.y !== 0) {
      const scale = (1 - dz) * half;
      const p0 = !altArrow
        ? { x: half, y: half }
        : {
            x: px - gameCoords.x * scale,
            y: py + gameCoords.y * scale,
          };
      const p1 = !altArrow
        ? {
            x: half + gameCoords.x * half,
            y: half - gameCoords.y * half,
          }
        : { x: px, y: py };
      const strength = Math.hypot(gameCoords.x, gameCoords.y) / Math.SQRT2;
      drawLineWithArrowhead(
        p0,
        p1,
        size * (20 / 400),
        size * (5 / 400),
        ctx,
        strength,
        true
      );
    }
  }
}

export function renderDodgingDeadzoneCanvas(params: {
  canvas: HTMLCanvasElement;
  deadzone: number;
  dodgeDeadzone: number;
  showCircularOverlay: boolean;
  maxDiagonal: number;
  antiAliasing: DeadzoneAntiAliasing;
  dodgingStick: { x: number; y: number } | null;
  gameCoords: { x: number; y: number };
}) {
  const {
    canvas,
    deadzone,
    dodgeDeadzone,
    showCircularOverlay,
    maxDiagonal,
    antiAliasing,
    dodgingStick,
    gameCoords,
  } = params;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const baseSize = 260;
  const ss = AA_SUPERSAMPLE_MAP[antiAliasing] ?? 2;
  const size = baseSize * ss;
  if (canvas.width !== size || canvas.height !== size) {
    canvas.width = size;
    canvas.height = size;
  }

  ctx.imageSmoothingEnabled = antiAliasing !== 'off';
  const half = size * 0.5;
  const dz = Math.max(0, Math.min(0.99, deadzone));
  const span = 1 - dz;
  const toPxX = (nx: number) => (nx + 1) * half;
  const toPxY = (ny: number) => (1 - ny) * half;

  ctx.fillStyle = '#00ff00';
  ctx.fillRect(0, 0, size, size);

  const flareOuter = dz + 0.1 * span;
  ctx.fillStyle = '#0000ff';

  ctx.beginPath();
  ctx.moveTo(toPxX(-flareOuter), toPxY(1));
  ctx.lineTo(toPxX(flareOuter), toPxY(1));
  ctx.lineTo(toPxX(dz), toPxY(dz));
  ctx.lineTo(toPxX(dz), toPxY(-dz));
  ctx.lineTo(toPxX(flareOuter), toPxY(-1));
  ctx.lineTo(toPxX(-flareOuter), toPxY(-1));
  ctx.lineTo(toPxX(-dz), toPxY(-dz));
  ctx.lineTo(toPxX(-dz), toPxY(dz));
  ctx.closePath();
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(toPxX(1), toPxY(flareOuter));
  ctx.lineTo(toPxX(1), toPxY(-flareOuter));
  ctx.lineTo(toPxX(dz), toPxY(-dz));
  ctx.lineTo(toPxX(-dz), toPxY(-dz));
  ctx.lineTo(toPxX(-1), toPxY(-flareOuter));
  ctx.lineTo(toPxX(-1), toPxY(flareOuter));
  ctx.lineTo(toPxX(-dz), toPxY(dz));
  ctx.lineTo(toPxX(dz), toPxY(dz));
  ctx.closePath();
  ctx.fill();

  const t = Math.max(0, Math.min(1, dodgeDeadzone)) * span;
  const reach = dz + t;
  ctx.fillStyle = '#ff0000';
  ctx.beginPath();
  ctx.moveTo(toPxX(0), toPxY(reach));
  ctx.lineTo(toPxX(dz), toPxY(reach));
  ctx.lineTo(toPxX(reach), toPxY(dz));
  ctx.lineTo(toPxX(reach), toPxY(0));
  ctx.lineTo(toPxX(reach), toPxY(-dz));
  ctx.lineTo(toPxX(dz), toPxY(-reach));
  ctx.lineTo(toPxX(0), toPxY(-reach));
  ctx.lineTo(toPxX(-dz), toPxY(-reach));
  ctx.lineTo(toPxX(-reach), toPxY(-dz));
  ctx.lineTo(toPxX(-reach), toPxY(0));
  ctx.lineTo(toPxX(-reach), toPxY(dz));
  ctx.lineTo(toPxX(-dz), toPxY(reach));
  ctx.closePath();
  ctx.fill();

  if (showCircularOverlay) {
    drawCircularOverlayMask(ctx, size, maxDiagonal);
  }

  if (dodgingStick) {
    const px = toPxX(dodgingStick.x);
    const py = toPxY(dodgingStick.y);
    drawRawCursorCircle(ctx, px, py, size);

    const dodgeAngle = computeDodgeAngle(gameCoords, dodgeDeadzone);
    if (dodgeAngle !== null) {
      const rad = (dodgeAngle * Math.PI) / 180;
      const p0 = { x: half, y: half };
      const p1 = {
        x: half + Math.sin(rad) * half,
        y: half - Math.cos(rad) * half,
      };
      drawLineWithArrowhead(
        p0,
        p1,
        size * (20 / 400),
        size * (5 / 400),
        ctx,
        0,
        false
      );
    }
  }
}
