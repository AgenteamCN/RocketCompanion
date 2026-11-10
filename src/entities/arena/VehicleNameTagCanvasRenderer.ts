/**
 * VehicleNameTagCanvasRenderer.ts
 * Canvas 2D pill rendering, sprite creation, and high-DPI 2D screen overlay rendering
 * with 4 boost progress indicator modes and analytical 2D ball entity occlusion.
 */

import * as THREE from 'three';
import {
  DEFAULT_NAME_TAG_CONFIG,
  resolveNameTagCornerRadiusPx,
  resolveNameTagFontFamilyCss,
  resolveNameTagVariantParams,
  type NameTagCardVariantParams,
  type NameTagConfig,
} from '../../ui-core/config/nameTagConfig.ts';
import type { NameTagOffscreenIndicatorCard2D } from '../../ui-core/config/nameTagOffscreenRenderer.ts';
import {
  drawNameTagPillCard2D,
  renderNameTagOverlayPass2D,
  type NameTagBallOcclusionProjection2D,
  type NameTagPillRenderCard2D,
} from '../../ui-core/config/nameTagPillRenderer.ts';

export type { NameTagOffscreenIndicatorCard2D };
export type VisibleNameTagCard2D = NameTagPillRenderCard2D;

export function projectBallOcclusion2D(
  ball: THREE.Object3D | null | undefined,
  ballRadiusUu: number,
  cam: THREE.PerspectiveCamera | null | undefined,
  camFwd: THREE.Vector3,
  proj: THREE.Vector3,
  vw: number,
  vh: number,
  tanHalfFov: number,
  config: NameTagConfig
): NameTagBallOcclusionProjection2D | null {
  if (!config.ballOcclusionEnabled || !ball?.visible || !cam?.position) return null;
  const opacity = Math.max(0, Math.min(1, Number(config.ballOcclusionOpacity) ?? 1.0));
  if (opacity <= 0.001) return null;
  const dx = ball.position.x - cam.position.x;
  const dy = ball.position.y - cam.position.y;
  const dz = ball.position.z - cam.position.z;
  const viewZDepthUu = dx * camFwd.x + dy * camFwd.y + dz * camFwd.z;
  if (viewZDepthUu <= 10 || !cam.projectionMatrix) return null;
  proj.set(ball.position.x, ball.position.y, ball.position.z).project(cam);
  if (proj.z < -1 || proj.z > 1) return null;
  const screenRadiusPx =
    (Math.max(10, Number(ballRadiusUu) || 95) / viewZDepthUu) *
    ((vh * 0.5) / Math.max(1e-4, tanHalfFov));
  return screenRadiusPx > 1
    ? {
        visible: true,
        screenX: (proj.x * 0.5 + 0.5) * vw,
        screenY: (-proj.y * 0.5 + 0.5) * vh,
        screenRadiusPx,
        viewZDepthUu,
        opacity,
      }
    : null;
}

export const CANVAS_WIDTH = 512;
export const CANVAS_HEIGHT = 160;
export const SPRITE_SUPERSAMPLE = 2;

export interface NameTagSpriteUserData {
  canvas: HTMLCanvasElement | null;
  texture: THREE.CanvasTexture | null;
  material: THREE.SpriteMaterial;
  cacheKey: string;
  cameraDistanceSq: number;
}

export type NameTagSprite = THREE.Sprite & {
  userData: NameTagSpriteUserData;
};

export interface NameTagOverlayCanvasState {
  overlayCanvas: HTMLCanvasElement | null;
  overlayCtx: CanvasRenderingContext2D | null;
}

export interface RenderPillSpriteOptions {
  sprite: NameTagSprite;
  displayText: string;
  team: 0 | 1;
  config: NameTagConfig;
  variant?: NameTagCardVariantParams;
  carPillWidthPx: number;
  effectiveCornerRadiusPx: number;
  boostBorderVisible: boolean;
  boostFraction: number;
  boostBorderColor: string;
  aerialClimbGlowVisible?: boolean;
}

export function roundMetric(value: number, decimals = 2): number {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  const factor = Math.pow(10, decimals);
  return Math.round(num * factor) / factor;
}

export function createNameTagSprite(): NameTagSprite {
  const canvas = typeof document !== 'undefined' ? document.createElement('canvas') : null;
  if (canvas) {
    canvas.width = CANVAS_WIDTH * SPRITE_SUPERSAMPLE;
    canvas.height = CANVAS_HEIGHT * SPRITE_SUPERSAMPLE;
  }
  const texture = canvas ? new THREE.CanvasTexture(canvas) : null;
  if (texture) {
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    if (THREE.SRGBColorSpace) {
      texture.colorSpace = THREE.SRGBColorSpace;
    }
  }
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    opacity: DEFAULT_NAME_TAG_CONFIG.opacity,
    alphaTest: 0.0002,
    depthTest: false,
    depthWrite: false,
    stencilWrite: true,
    stencilRef: 1,
    stencilFuncMask: 0x01,
    stencilWriteMask: 0x01,
    stencilFunc: THREE.NotEqualStencilFunc,
    stencilFail: THREE.KeepStencilOp,
    stencilZFail: THREE.KeepStencilOp,
    stencilZPass: THREE.ReplaceStencilOp,
    toneMapped: false,
  });
  const sprite = new THREE.Sprite(material) as NameTagSprite;
  sprite.renderOrder = 950;
  sprite.frustumCulled = false;
  sprite.visible = false;
  sprite.userData = {
    canvas,
    texture,
    material,
    cacheKey: '',
    cameraDistanceSq: 0,
  };
  return sprite;
}

export function renderPillCardToSprite(options: RenderPillSpriteOptions): void {
  const {
    sprite,
    displayText,
    team,
    config,
    variant = resolveNameTagVariantParams(config, config.cardDisplayMode === 'single-char'),
    carPillWidthPx,
    effectiveCornerRadiusPx,
    boostBorderVisible,
    boostFraction,
    boostBorderColor,
    aerialClimbGlowVisible = false,
  } = options;

  if (!sprite?.userData?.canvas) return;
  const isOrangeTeam = team === 1;
  const backgroundColor = isOrangeTeam ? config.orangeBgColor : config.blueBgColor;
  const borderColor = isOrangeTeam ? config.orangeBorderColor : config.blueBorderColor;
  const textColor = isOrangeTeam ? config.orangeTextColor : config.blueTextColor;
  const fontFamily = variant.fontFamily || DEFAULT_NAME_TAG_CONFIG.fontFamily;
  const fontWeight = variant.fontWeight || DEFAULT_NAME_TAG_CONFIG.fontWeight;
  const quantizedBoost = boostBorderVisible
    ? Math.max(0, Math.min(200, Math.round(boostFraction * 200)))
    : -1;

  const cacheKey = [
    displayText,
    team,
    carPillWidthPx,
    variant.pillHeight,
    effectiveCornerRadiusPx,
    variant.borderWidth,
    variant.fontSize,
    fontFamily,
    fontWeight,
    variant.bgOpacity,
    config.boostIndicatorMode,
    config.boostFillOpacity,
    config.boostUnfilledBgOpacity,
    config.boostShowHorizonLine,
    backgroundColor,
    borderColor,
    textColor,
    quantizedBoost,
    boostBorderVisible ? boostBorderColor : 'off',
    aerialClimbGlowVisible
      ? `${config.aerialClimbGlowColor}:${config.aerialClimbGlowRadiusPx}:${config.aerialClimbGlowOpacity}`
      : 'noglow',
  ].join('|');

  if (sprite.userData.cacheKey === cacheKey) return;
  sprite.userData.cacheKey = cacheKey;

  const canvas = sprite.userData.canvas;
  const context = canvas.getContext('2d');
  if (!context) return;

  context.setTransform(1, 0, 0, 1, 0, 0);
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.setTransform(SPRITE_SUPERSAMPLE, 0, 0, SPRITE_SUPERSAMPLE, 0, 0);

  const pillWidth = Math.max(
    40,
    Math.min(CANVAS_WIDTH - 24, Number(carPillWidthPx) || DEFAULT_NAME_TAG_CONFIG.pillMaxWidth)
  );
  const pillHeight = Math.max(
    28,
    Math.min(CANVAS_HEIGHT - 24, Number(variant.pillHeight) || DEFAULT_NAME_TAG_CONFIG.pillHeight)
  );
  const pillX = (CANVAS_WIDTH - pillWidth) * 0.5;
  const pillY = (CANVAS_HEIGHT - pillHeight) * 0.5;
  const cornerRadius = resolveNameTagCornerRadiusPx(pillWidth, pillHeight, effectiveCornerRadiusPx);
  const borderWidth = Math.max(
    0,
    Math.min(12, Number(variant.borderWidth) ?? DEFAULT_NAME_TAG_CONFIG.borderWidth)
  );
  const halfBorder = borderWidth * 0.5;
  const fontSize = Math.max(
    12,
    Math.min(48, Number(variant.fontSize) || DEFAULT_NAME_TAG_CONFIG.fontSize)
  );
  const fontFamilyCss = resolveNameTagFontFamilyCss(fontFamily);
  const effectiveBgOpacity = Math.max(
    0.005,
    Number(variant.bgOpacity) ?? DEFAULT_NAME_TAG_CONFIG.bgOpacity
  );

  const spriteCard: NameTagPillRenderCard2D = {
    carIndex: 0,
    cameraDistanceSq: 0,
    viewZDepthUu: 0,
    displayText,
    centerX: CANVAS_WIDTH * 0.5,
    centerY: CANVAS_HEIGHT * 0.5,
    left: pillX,
    top: pillY,
    width: pillWidth,
    height: pillHeight,
    radius: cornerRadius,
    borderW: borderWidth,
    screenUnitScale: 1,
    outerLeft: pillX - halfBorder,
    outerTop: pillY - halfBorder,
    outerRight: pillX + pillWidth + halfBorder,
    outerBottom: pillY + pillHeight + halfBorder,
    outerWidth: pillWidth + borderWidth,
    outerHeight: pillHeight + borderWidth,
    outerRadius: cornerRadius + halfBorder,
    fontPx: fontSize,
    fontWeight,
    fontFamilyCss,
    opacity: 1,
    bgOpacity: effectiveBgOpacity,
    bgColor: backgroundColor,
    borderColor,
    textColor,
    boostBorderVisible,
    boostFraction: Math.max(0, Math.min(1, boostFraction)),
    boostBorderColor,
    aerialClimbGlowVisible,
  };

  context.save();
  drawNameTagPillCard2D(context, spriteCard, config);
  context.restore();

  if (sprite.userData.texture) {
    sprite.userData.texture.needsUpdate = true;
  }
}

export function ensureOverlayCanvas(state: NameTagOverlayCanvasState): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;
  if (state.overlayCanvas && state.overlayCanvas.isConnected && state.overlayCtx) {
    return state.overlayCanvas;
  }
  let existing = document.getElementById(
    'vehicle-name-tag-overlay-canvas'
  ) as HTMLCanvasElement | null;
  if (!existing) {
    existing = document.createElement('canvas');
    existing.id = 'vehicle-name-tag-overlay-canvas';
    existing.className = 'name-tag-overlay-canvas';
    existing.style.position = 'fixed';
    existing.style.inset = '0';
    existing.style.width = '100%';
    existing.style.height = '100%';
    existing.style.pointerEvents = 'none';
    existing.style.userSelect = 'none';
    existing.style.zIndex = '10';
    existing.style.display = 'none';
    const host = document.getElementById('app') || document.body;
    host.appendChild(existing);
  }
  state.overlayCanvas = existing;
  state.overlayCtx = existing.getContext('2d');
  return state.overlayCanvas;
}

export function hideOverlayCanvas(state: NameTagOverlayCanvasState): void {
  if (state.overlayCanvas) {
    if (state.overlayCtx) {
      state.overlayCtx.setTransform(1, 0, 0, 1, 0, 0);
      state.overlayCtx.clearRect(0, 0, state.overlayCanvas.width, state.overlayCanvas.height);
    }
    state.overlayCanvas.style.display = 'none';
  }
}

export function renderHighDpiOverlay(
  state: NameTagOverlayCanvasState,
  visibleCards2D: VisibleNameTagCard2D[],
  viewportWidthPx: number,
  viewportHeightPx: number,
  devicePixelRatio: number,
  config: NameTagConfig,
  ballOcclusion?: NameTagBallOcclusionProjection2D | null,
  offscreenIndicators2D: NameTagOffscreenIndicatorCard2D[] = []
): void {
  const canvas = state.overlayCanvas;
  const ctx = state.overlayCtx;
  if (!canvas || !ctx) return;

  if (visibleCards2D.length === 0 && offscreenIndicators2D.length === 0) {
    hideOverlayCanvas(state);
    return;
  }

  if (canvas.style.display !== 'block') {
    canvas.style.display = 'block';
  }

  const activeVariant = resolveNameTagVariantParams(
    config,
    config.cardDisplayMode === 'single-char'
  );
  const cardRenderScalePct = Math.max(
    25,
    Math.min(
      200,
      Number.isFinite(Number(activeVariant.cardRenderScale))
        ? Number(activeVariant.cardRenderScale)
        : DEFAULT_NAME_TAG_CONFIG.cardRenderScale
    )
  );
  const effectiveCardPixelRatio = Math.max(0.5, devicePixelRatio * (cardRenderScalePct / 100));
  const targetBackingWidth = Math.max(1, Math.round(viewportWidthPx * effectiveCardPixelRatio));
  const targetBackingHeight = Math.max(1, Math.round(viewportHeightPx * effectiveCardPixelRatio));

  if (canvas.width !== targetBackingWidth || canvas.height !== targetBackingHeight) {
    canvas.width = targetBackingWidth;
    canvas.height = targetBackingHeight;
  }

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const scaleX = canvas.width / Math.max(1, viewportWidthPx);
  const scaleY = canvas.height / Math.max(1, viewportHeightPx);
  ctx.setTransform(scaleX, 0, 0, scaleY, 0, 0);

  renderNameTagOverlayPass2D(
    ctx,
    visibleCards2D,
    viewportWidthPx,
    viewportHeightPx,
    config,
    ballOcclusion,
    offscreenIndicators2D
  );
}
