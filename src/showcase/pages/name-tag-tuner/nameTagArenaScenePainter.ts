import type { NameTagConfig } from '../../../ui-core/config/nameTagCalibrationMath';
import {
  CLASSIC_BALL_RADIUS,
  projectWorldPoint,
  type CameraBasis,
  type KickoffCarSpawn,
  type Vec3,
} from './nameTagArenaProjectionMath';

export function renderNameTag3DScenePass(
  sceneCtx: CanvasRenderingContext2D,
  width: number,
  height: number,
  camBasis: CameraBasis,
  cars: KickoffCarSpawn[],
  povCar: KickoffCarSpawn | null,
  ballWorld: Vec3,
  config: NameTagConfig,
): {
  ballProj: ReturnType<typeof projectWorldPoint>;
  ballRadiusPx: number;
  halfTan: number;
  focalPx: number;
} {
  sceneCtx.save();
  const drawWorldSegment = (a: Vec3, b: Vec3, stroke: string, lineWidth = 1.25) => {
    const pa = projectWorldPoint(a, camBasis, width, height);
    const pb = projectWorldPoint(b, camBasis, width, height);
    if (!pa.visible || !pb.visible) return;
    sceneCtx.strokeStyle = stroke;
    sceneCtx.lineWidth = lineWidth;
    sceneCtx.beginPath();
    sceneCtx.moveTo(pa.x, pa.y);
    sceneCtx.lineTo(pb.x, pb.y);
    sceneCtx.stroke();
  };

  drawWorldSegment({ x: -4096, y: 2, z: 0 }, { x: 4096, y: 2, z: 0 }, 'rgba(255,255,255,0.22)', 1.6);
  drawWorldSegment({ x: 0, y: 2, z: -5120 }, { x: 0, y: 2, z: 5120 }, 'rgba(255,255,255,0.10)', 1);

  sceneCtx.beginPath();
  let startedCircle = false;
  for (let seg = 0; seg <= 48; seg++) {
    const ang = (seg / 48) * Math.PI * 2;
    const pt = projectWorldPoint(
      { x: Math.cos(ang) * 1024, y: 2, z: Math.sin(ang) * 1024 },
      camBasis,
      width,
      height,
    );
    if (pt.visible) {
      if (!startedCircle) {
        sceneCtx.moveTo(pt.x, pt.y);
        startedCircle = true;
      } else {
        sceneCtx.lineTo(pt.x, pt.y);
      }
    }
  }
  if (startedCircle) {
    sceneCtx.strokeStyle = 'rgba(255,255,255,0.22)';
    sceneCtx.lineWidth = 1.5;
    sceneCtx.stroke();
  }
  sceneCtx.restore();

  const ballProj = projectWorldPoint(ballWorld, camBasis, width, height);
  const halfTan = Math.tan(((camBasis.fovDeg * Math.PI) / 180) * 0.5);
  const focalPx = (height * 0.5) / Math.max(1e-4, halfTan);
  const ballRadiusPx = ballProj.viewZ > 10 ? (CLASSIC_BALL_RADIUS / ballProj.viewZ) * focalPx : 0;

  interface SceneDrawable {
    depth: number;
    draw: () => void;
  }
  const drawables: SceneDrawable[] = [];

  for (const car of cars) {
    const carCenter = projectWorldPoint({ x: car.x, y: car.y + 18, z: car.z }, camBasis, width, height);
    if (!carCenter.visible) continue;
    const isCurrentPov = povCar?.carIndex === car.carIndex;
    drawables.push({
      depth: carCenter.viewZ,
      draw: () => {
        const carHalfW = Math.max(8, (72 / carCenter.viewZ) * focalPx);
        const carHalfH = Math.max(5, (34 / carCenter.viewZ) * focalPx);

        sceneCtx.save();
        sceneCtx.fillStyle = 'rgba(0, 0, 0, 0.45)';
        sceneCtx.beginPath();
        sceneCtx.ellipse(
          carCenter.x,
          carCenter.y + carHalfH * 0.85,
          carHalfW * 1.15,
          carHalfH * 0.55,
          0,
          0,
          Math.PI * 2,
        );
        sceneCtx.fill();

        const bodyGrad = sceneCtx.createLinearGradient(
          carCenter.x,
          carCenter.y - carHalfH,
          carCenter.x,
          carCenter.y + carHalfH,
        );
        if (car.team === 0) {
          bodyGrad.addColorStop(0, '#60a5fa');
          bodyGrad.addColorStop(1, '#1d4ed8');
        } else {
          bodyGrad.addColorStop(0, '#fb923c');
          bodyGrad.addColorStop(1, '#c2410c');
        }
        sceneCtx.fillStyle = bodyGrad;
        sceneCtx.strokeStyle = isCurrentPov ? '#5eead4' : 'rgba(255,255,255,0.65)';
        sceneCtx.lineWidth = isCurrentPov ? 2 : 1.1;
        sceneCtx.beginPath();
        sceneCtx.roundRect(
          carCenter.x - carHalfW,
          carCenter.y - carHalfH,
          carHalfW * 2,
          carHalfH * 1.65,
          Math.max(3, carHalfH * 0.45),
        );
        sceneCtx.fill();
        sceneCtx.stroke();

        sceneCtx.fillStyle = 'rgba(10, 14, 24, 0.72)';
        sceneCtx.beginPath();
        sceneCtx.roundRect(
          carCenter.x - carHalfW * 0.55,
          carCenter.y - carHalfH * 0.65,
          carHalfW * 1.1,
          carHalfH * 0.75,
          Math.max(2, carHalfH * 0.25),
        );
        sceneCtx.fill();
        sceneCtx.restore();
      },
    });
  }

  if (ballProj.visible && ballRadiusPx > 1.5) {
    const groundBallProj = projectWorldPoint({ x: 0, y: 2, z: 0 }, camBasis, width, height);
    drawables.push({
      depth: ballProj.viewZ,
      draw: () => {
        sceneCtx.save();
        if (groundBallProj.visible) {
          sceneCtx.fillStyle = 'rgba(0, 0, 0, 0.42)';
          sceneCtx.beginPath();
          sceneCtx.ellipse(
            groundBallProj.x,
            groundBallProj.y,
            ballRadiusPx * 0.95,
            ballRadiusPx * 0.36,
            0,
            0,
            Math.PI * 2,
          );
          sceneCtx.fill();
        }

        sceneCtx.globalAlpha = Math.max(0.08, Math.min(1, config.ballOcclusionOpacity));
        const ballGrad = sceneCtx.createRadialGradient(
          ballProj.x - ballRadiusPx * 0.32,
          ballProj.y - ballRadiusPx * 0.32,
          ballRadiusPx * 0.12,
          ballProj.x,
          ballProj.y,
          ballRadiusPx,
        );
        ballGrad.addColorStop(0, '#f8fafc');
        ballGrad.addColorStop(0.55, '#cbd5e1');
        ballGrad.addColorStop(0.88, '#475569');
        ballGrad.addColorStop(1, '#1e293b');

        sceneCtx.fillStyle = ballGrad;
        sceneCtx.beginPath();
        sceneCtx.arc(ballProj.x, ballProj.y, ballRadiusPx, 0, Math.PI * 2);
        sceneCtx.fill();

        sceneCtx.strokeStyle = 'rgba(15, 23, 42, 0.58)';
        sceneCtx.lineWidth = Math.max(1, ballRadiusPx * 0.055);
        sceneCtx.beginPath();
        sceneCtx.arc(ballProj.x, ballProj.y, ballRadiusPx * 0.42, 0, Math.PI * 2);
        sceneCtx.stroke();

        for (let seam = 0; seam < 5; seam++) {
          const ang = (seam / 5) * Math.PI * 2 - Math.PI / 2;
          sceneCtx.beginPath();
          sceneCtx.moveTo(
            ballProj.x + Math.cos(ang) * ballRadiusPx * 0.42,
            ballProj.y + Math.sin(ang) * ballRadiusPx * 0.42,
          );
          sceneCtx.lineTo(
            ballProj.x + Math.cos(ang) * ballRadiusPx * 0.96,
            ballProj.y + Math.sin(ang) * ballRadiusPx * 0.96,
          );
          sceneCtx.stroke();
        }

        sceneCtx.strokeStyle = config.ballOcclusionEnabled
          ? 'rgba(94, 234, 212, 0.72)'
          : 'rgba(255, 255, 255, 0.38)';
        sceneCtx.lineWidth = 1.4;
        sceneCtx.beginPath();
        sceneCtx.arc(ballProj.x, ballProj.y, ballRadiusPx, 0, Math.PI * 2);
        sceneCtx.stroke();
        sceneCtx.restore();
      },
    });
  }

  drawables.sort((a, b) => b.depth - a.depth);
  for (const item of drawables) {
    item.draw();
  }

  return { ballProj, ballRadiusPx, halfTan, focalPx };
}

export const renderNamePlate3DScenePass = renderNameTag3DScenePass;
