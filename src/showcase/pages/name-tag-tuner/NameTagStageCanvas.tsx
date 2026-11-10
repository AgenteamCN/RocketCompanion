import React, { useEffect, useRef, useState } from 'react';
import {
  NAME_TAG_FAR_CALIBRATION_DEPTH_UU,
  NAME_TAG_NEAR_CALIBRATION_DEPTH_UU,
  NAME_TAG_REFERENCE_DEPTH_UU,
  resolveNameTagBoostBorderVisible,
  type NameTagBoostBorderOverride,
  type NameTagCarTelemetry,
  type NameTagConfig,
} from '../../../ui-core/config/nameTagConfig';
import {
  renderNameTagOverlayPass2D,
  type NameTagBallOcclusionProjection2D,
  type NameTagPillRenderCard2D,
} from '../../../ui-core/config/nameTagPillRenderer';
import {
  setNameTagTelemetrySnapshot,
} from '../../../ui-core/stores/nameTagTunerStore';
import { ArenaBackdrop, type ArenaLightingPreset } from '../../ArenaBackdrop';
import { buildSinglePillCard2D, CLASSIC_BALL_RADIUS, projectWorldPoint, resolveNameTagCameraBasis, type KickoffCarSpawn, type KickoffSlotPair, type Vec3 } from './nameTagArenaProjectionMath';
import { renderNameTag3DScenePass } from './nameTagArenaScenePainter';

export type { KickoffCarSpawn, KickoffSlotPair };

export interface NameTagStageCanvasProps {
  config: NameTagConfig;
  cars: KickoffCarSpawn[];
  focusedCarIndex: number | null;
  boostBorderOverride?: NameTagBoostBorderOverride;
  cameraFovDeg: number;
  ballHeightOffset: number;
  animateBoostWave: boolean;
  customNameOverride: string;
  arenaPreset: ArenaLightingPreset;
  stageHeight: number;
}

export const NameTagStageCanvas: React.FC<NameTagStageCanvasProps> = ({
  config,
  cars,
  focusedCarIndex,
  boostBorderOverride = null,
  cameraFovDeg,
  ballHeightOffset,
  animateBoostWave,
  customNameOverride,
  arenaPreset,
  stageHeight,
}) => {
  const stageRootRef = useRef<HTMLDivElement | null>(null);
  const sceneCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const lastTelemetryEmitMsRef = useRef<number>(0);
  const [resizeTick, setResizeTick] = useState(0);

  useEffect(() => {
    const el = stageRootRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => {
      setResizeTick((t) => t + 1);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let rafId = 0;
    let cancelled = false;

    const renderFrame = (emitBroadcastTelemetry: boolean) => {
      if (cancelled) return;
      const sceneCanvas = sceneCanvasRef.current;
      const overlayCanvas = overlayCanvasRef.current;
      if (!sceneCanvas || !overlayCanvas) return;

      const rect = sceneCanvas.getBoundingClientRect();
      const width = Math.max(1, Math.round(rect.width));
      const height = Math.max(1, Math.round(rect.height));
      const dpr = Math.min(window.devicePixelRatio || 1, 2);

      if (
        sceneCanvas.width !== Math.round(width * dpr) ||
        sceneCanvas.height !== Math.round(height * dpr)
      ) {
        sceneCanvas.width = Math.round(width * dpr);
        sceneCanvas.height = Math.round(height * dpr);
      }
      if (
        overlayCanvas.width !== Math.round(width * dpr) ||
        overlayCanvas.height !== Math.round(height * dpr)
      ) {
        overlayCanvas.width = Math.round(width * dpr);
        overlayCanvas.height = Math.round(height * dpr);
      }

      const sceneCtx = sceneCanvas.getContext('2d');
      const overlayCtx = overlayCanvas.getContext('2d');
      if (!sceneCtx || !overlayCtx) return;

      sceneCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
      sceneCtx.clearRect(0, 0, width, height);

      overlayCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
      overlayCtx.clearRect(0, 0, width, height);

      const ballWorld: Vec3 = {
        x: 0,
        y: CLASSIC_BALL_RADIUS + ballHeightOffset,
        z: 0,
      };

      const povCar =
        focusedCarIndex !== null
          ? cars.find((c) => c.carIndex === focusedCarIndex) ?? null
          : null;

      const camBasis = resolveNameTagCameraBasis(povCar, ballWorld, cameraFovDeg);
      const { ballProj, ballRadiusPx, halfTan, focalPx } = renderNameTag3DScenePass(
        sceneCtx,
        width,
        height,
        camBasis,
        cars,
        povCar,
        ballWorld,
        config
      );

      // Phase-locked wall-clock wave so multi-screen tabs stay synchronized and slider drags never jump
      const wavePhaseSec = Date.now() * 0.001;
      const visibleCards2D: NameTagPillRenderCard2D[] = [];
      const telemetryCars: NameTagCarTelemetry[] = [];

      for (const car of cars) {
        const override = config.carOverrides[car.carIndex];
        const effWorldOffsetUu = override?.enabled
          ? override.worldOffsetUu
          : config.verticalOffsetUu;
        const effScreenOffsetPx = override?.enabled
          ? override.screenOffsetPx
          : config.screenVerticalOffsetPx;
        const effScaleMult = override?.enabled ? override.scaleMultiplier : 1.0;

        const anchorWorld: Vec3 = {
          x: car.x,
          y: car.y + effWorldOffsetUu,
          z: car.z,
        };
        const proj = projectWorldPoint(anchorWorld, camBasis, width, height);
        const activeDepthUu = Math.max(
          80,
          config.depthMetric === 'euclidean' ? proj.euclidean : proj.viewZ
        );

        const depthWindowT = Math.max(
          0,
          Math.min(
            1,
            (activeDepthUu - NAME_TAG_NEAR_CALIBRATION_DEPTH_UU) /
              (NAME_TAG_FAR_CALIBRATION_DEPTH_UU - NAME_TAG_NEAR_CALIBRATION_DEPTH_UU)
          )
        );
        const nearFarMult =
          config.nearScaleMultiplier +
          (config.farScaleMultiplier - config.nearScaleMultiplier) * depthWindowT;

        const worldScaleFactor =
          config.cameraScaleFactor *
          Math.pow(activeDepthUu / NAME_TAG_REFERENCE_DEPTH_UU, config.distanceScaleExponent) *
          nearFarMult *
          effScaleMult;

        const screenUnitScale = Math.max(
          0.22,
          Math.min(2.2, (worldScaleFactor * focalPx * 22) / Math.max(200, activeDepthUu))
        );

        const baseBoost = config.previewBoostAmounts[car.carIndex] ?? 66;
        const dynamicBoost = animateBoostWave
          ? Math.round(50 + 50 * Math.sin(wavePhaseSec * 1.45 + car.carIndex * 1.05))
          : baseBoost;

        const baseName = config.previewNames[car.carIndex] || car.slotCode;
        const rawName =
          customNameOverride.trim().length > 0
            ? `${car.slotCode} · ${customNameOverride.trim()}`
            : baseName;

        const isOwnPov = povCar?.carIndex === car.carIndex;
        const visible = config.enabled && proj.visible && (!isOwnPov || config.showOnLocalCar);

        const boostBorderVisible = resolveNameTagBoostBorderVisible(
          config,
          boostBorderOverride,
          car.team,
          povCar ? povCar.team : null
        );

        const centerX = proj.x;
        const centerY = proj.y - effScreenOffsetPx * (height / 1080);

        const card2D = buildSinglePillCard2D(
          car.carIndex,
          rawName,
          car.team,
          dynamicBoost,
          centerX,
          centerY,
          screenUnitScale,
          proj.viewZ,
          proj.euclidean * proj.euclidean,
          config,
          boostBorderVisible
        );

        if (visible) {
          visibleCards2D.push(card2D);
        }

        const uuPerScreenPx = (2 * activeDepthUu * halfTan) / Math.max(1, height);
        telemetryCars.push({
          carIndex: car.carIndex,
          slotCode: car.slotCode,
          name: card2D.displayText,
          team: car.team,
          visible,
          boostAmount: dynamicBoost,
          boostBorderVisible,
          carWorldPos: [car.x, car.y, car.z],
          anchorWorldPos: [anchorWorld.x, anchorWorld.y, anchorWorld.z],
          spriteWorldPos: [anchorWorld.x, anchorWorld.y, anchorWorld.z],
          euclideanDistanceUu: proj.euclidean,
          viewZDepthUu: proj.viewZ,
          activeDepthUu,
          offAxisAngleDeg: proj.offAxisDeg,
          worldScaleWidthUu: card2D.width * uuPerScreenPx,
          worldScaleHeightUu: card2D.height * uuPerScreenPx,
          screenPillWidthPx: card2D.width,
          screenPillHeightPx: card2D.height,
          effectiveScaleMultiplier: effScaleMult,
          effectiveWorldOffsetUu: effWorldOffsetUu,
          effectiveScreenOffsetPx: effScreenOffsetPx,
          totalWorldVerticalOffsetUu: effWorldOffsetUu + effScreenOffsetPx * uuPerScreenPx,
        });
      }

      const ballOcclusion: NameTagBallOcclusionProjection2D = {
        visible: ballProj.visible && ballRadiusPx > 1.5,
        screenX: ballProj.x,
        screenY: ballProj.y,
        screenRadiusPx: ballRadiusPx,
        viewZDepthUu: ballProj.viewZ,
        opacity: config.ballOcclusionOpacity,
      };

      renderNameTagOverlayPass2D(
        overlayCtx,
        visibleCards2D,
        width,
        height,
        config,
        ballOcclusion
      );

      const nowMs = performance.now();
      if (emitBroadcastTelemetry || nowMs - lastTelemetryEmitMsRef.current > 140) {
        lastTelemetryEmitMsRef.current = nowMs;
        setNameTagTelemetrySnapshot(
          {
            updatedAtMs: Date.now(),
            viewportWidthPx: width,
            viewportHeightPx: height,
            aspectRatio: width / Math.max(1, height),
            devicePixelRatio: dpr,
            cameraMode: povCar ? 'pov' : 'free',
            focusedCarIndex: povCar ? povCar.carIndex : 0,
            cameraFovDeg,
            cameraPosition: [camBasis.pos.x, camBasis.pos.y, camBasis.pos.z],
            cameraForward: [camBasis.forward.x, camBasis.forward.y, camBasis.forward.z],
            cameraUp: [camBasis.up.x, camBasis.up.y, camBasis.up.z],
            cars: telemetryCars,
          },
          emitBroadcastTelemetry
        );
      }
    };

    // Immediate synchronous render on any parameter or resize update
    renderFrame(true);

    if (animateBoostWave) {
      const tickWave = () => {
        if (cancelled) return;
        renderFrame(false);
        rafId = requestAnimationFrame(tickWave);
      };
      rafId = requestAnimationFrame(tickWave);
    }

    return () => {
      cancelled = true;
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [
    config,
    cars,
    focusedCarIndex,
    boostBorderOverride,
    cameraFovDeg,
    ballHeightOffset,
    animateBoostWave,
    customNameOverride,
    stageHeight,
    resizeTick,
  ]);

  const activePovCar =
    focusedCarIndex !== null ? cars.find((c) => c.carIndex === focusedCarIndex) ?? null : null;

  return (
    <div
      ref={stageRootRef}
      className="rounded-2xl border border-white/10 shadow-2xl"
      style={{
        position: 'relative',
        width: '100%',
        height: stageHeight,
        overflow: 'hidden',
        userSelect: 'none',
      }}
    >
      <ArenaBackdrop preset={arenaPreset} brightness={45} showPitchMarkings={false} />

      <canvas
        ref={sceneCanvasRef}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
          zIndex: 2,
        }}
      />

      <canvas
        ref={overlayCanvasRef}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
          zIndex: 3,
        }}
      />

      {/* Top-Left Live HUD Badge */}
      <div
        style={{
          position: 'absolute',
          top: 12,
          left: 14,
          zIndex: 4,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          flexWrap: 'wrap',
          pointerEvents: 'none',
        }}
      >
        <span
          style={{
            padding: '4px 10px',
            borderRadius: 6,
            fontSize: 10,
            fontWeight: 800,
            fontFamily: 'var(--font-mono)',
            letterSpacing: '0.06em',
            background: 'rgba(8, 12, 22, 0.78)',
            border: '1px solid rgba(94, 234, 212, 0.35)',
            color: '#5eead4',
            backdropFilter: 'blur(8px)',
          }}
        >
          {activePovCar
            ? `POV [${activePovCar.carIndex + 1}] · ${activePovCar.slotCode} (${activePovCar.slotName})`
            : 'FREECAM [0] · 6-CAR KICKOFF OVERVIEW'}
        </span>

        <span
          style={{
            padding: '4px 9px',
            borderRadius: 6,
            fontSize: 10,
            fontWeight: 700,
            fontFamily: 'var(--font-mono)',
            background: 'rgba(8, 12, 22, 0.72)',
            border: '1px solid rgba(255, 255, 255, 0.14)',
            color: '#e2e8f0',
          }}
        >
          MODE: {config.boostIndicatorMode.toUpperCase()}
        </span>

        <span
          style={{
            padding: '4px 9px',
            borderRadius: 6,
            fontSize: 10,
            fontWeight: 700,
            fontFamily: 'var(--font-mono)',
            background: config.ballOcclusionEnabled
              ? 'rgba(20, 83, 45, 0.78)'
              : 'rgba(8, 12, 22, 0.72)',
            border: config.ballOcclusionEnabled
              ? '1px solid rgba(74, 222, 128, 0.45)'
              : '1px solid rgba(255, 255, 255, 0.14)',
            color: config.ballOcclusionEnabled ? '#86efac' : '#94a3b8',
          }}
        >
          BALL OCCLUSION:{' '}
          {config.ballOcclusionEnabled
            ? `ON (${Math.round(config.ballOcclusionOpacity * 100)}%)`
            : 'OFF (DEFAULT)'}
        </span>
      </div>
    </div>
  );
};
