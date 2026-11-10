/**
 * SpatialAudioDebugGeometries.ts
 * Pure Three.js wireframe geometry builders, scene rig assembly, and 2D Canvas billboard renderer
 * for SpatialAudioDebugVisualizer.
 */

import * as THREE from 'three';
import type { SpatialAttenuationProfile } from '../../ui-core/config/spatialAttenuationProfiles.ts';
import type { SpatialAudioVisualizerConfig } from '../../ui-core/config/spatialAudioVisualizerConfig.ts';

export const INNER_COLOR_HEX = 0x10b981; // Emerald 500 (100% Core)
export const ISO75_COLOR_HEX = 0x34d399; // Emerald 400 (75% Contour)
export const ISO50_COLOR_HEX = 0x38bdf8; // Sky 400 (50% / -6dB Iso-Ring)
export const ISO25_COLOR_HEX = 0xfbbf24; // Amber 400 (25% Contour)
export const OUTER_FLOOR_HEX = 0xf59e0b; // Amber 500 (Soft Floor > 0)
export const OUTER_CULL_HEX = 0xf43f5e; // Rose 500 (Hard Cull = 0)

export interface SpatialAudioBillboardResources {
  sprite: THREE.Sprite;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D | null;
  texture: THREE.CanvasTexture;
  lastSignature: string;
}

export interface SpatialAudioDebugRig {
  innerSphereGroup: THREE.Group;
  innerSphereWire: THREE.LineSegments;
  innerSphereShell: THREE.Mesh;
  innerGroundRing: THREE.LineSegments;
  outerSphereGroup: THREE.Group;
  outerSphereWire: THREE.LineSegments;
  outerSphereShell: THREE.Mesh;
  outerGroundRing: THREE.LineSegments;
  iso50GroundRing: THREE.LineSegments;
  iso50EquatorRing: THREE.LineSegments;
  iso75GroundRing: THREE.LineSegments;
  iso25GroundRing: THREE.LineSegments;
  rulerGroup: THREE.Group;
  rulerLine3D: THREE.Line;
  rulerGroundLine: THREE.Line;
  emitterBeacon: THREE.Mesh;
  listenerBeacon: THREE.Mesh;
  billboard: SpatialAudioBillboardResources | null;
}

export function createUnitSphereWireframeGeometry(segments = 64): THREE.BufferGeometry {
  const positions: number[] = [];
  const addRing = (axis: 'xy' | 'xz' | 'yz', radius = 1.0, yOffset = 0.0) => {
    for (let i = 0; i < segments; i++) {
      const a0 = (i / segments) * Math.PI * 2;
      const a1 = ((i + 1) / segments) * Math.PI * 2;
      const c0 = Math.cos(a0) * radius;
      const s0 = Math.sin(a0) * radius;
      const c1 = Math.cos(a1) * radius;
      const s1 = Math.sin(a1) * radius;
      if (axis === 'xz') {
        positions.push(c0, yOffset, s0, c1, yOffset, s1);
      } else if (axis === 'xy') {
        positions.push(c0, s0, 0, c1, s1, 0);
      } else {
        positions.push(0, s0, c0, 0, s1, c1);
      }
    }
  };

  addRing('xz', 1.0, 0.0);
  addRing('xz', Math.cos(Math.PI / 6), Math.sin(Math.PI / 6));
  addRing('xz', Math.cos(Math.PI / 6), -Math.sin(Math.PI / 6));
  addRing('xy', 1.0, 0.0);
  addRing('yz', 1.0, 0.0);

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  return geom;
}

export function createUnitCircleLineGeometry(segments = 96, dashed = false): THREE.BufferGeometry {
  const positions: number[] = [];
  const step = dashed ? 2 : 1;
  for (let i = 0; i < segments; i += step) {
    const a0 = (i / segments) * Math.PI * 2;
    const a1 = ((i + 1) / segments) * Math.PI * 2;
    positions.push(Math.cos(a0), 0, Math.sin(a0), Math.cos(a1), 0, Math.sin(a1));
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  return geom;
}

export function createSpatialAudioBillboard(): SpatialAudioBillboardResources | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 144;
  const ctx = canvas.getContext('2d');
  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  const spriteMat = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });
  const sprite = new THREE.Sprite(spriteMat);
  sprite.renderOrder = 1002;
  return {
    sprite,
    canvas,
    ctx,
    texture,
    lastSignature: '',
  };
}

export function buildSpatialAudioDebugRig(rootGroup: THREE.Group): SpatialAudioDebugRig {
  const unitSphereWireGeo = createUnitSphereWireframeGeometry(64);
  const unitSphereShellGeo = new THREE.SphereGeometry(1, 28, 18);
  const solidCircleGeo = createUnitCircleLineGeometry(96, false);
  const dashedCircleGeo = createUnitCircleLineGeometry(96, true);

  const innerSphereGroup = new THREE.Group();
  const innerSphereWire = new THREE.LineSegments(
    unitSphereWireGeo,
    new THREE.LineBasicMaterial({
      color: INNER_COLOR_HEX,
      transparent: true,
      opacity: 0.65,
      depthWrite: false,
    })
  );
  const innerSphereShell = new THREE.Mesh(
    unitSphereShellGeo,
    new THREE.MeshBasicMaterial({
      color: INNER_COLOR_HEX,
      transparent: true,
      opacity: 0.05,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
  );
  innerSphereGroup.add(innerSphereWire, innerSphereShell);
  innerSphereGroup.renderOrder = 990;

  const innerGroundRing = new THREE.LineSegments(
    solidCircleGeo,
    new THREE.LineBasicMaterial({
      color: INNER_COLOR_HEX,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
    })
  );
  innerGroundRing.renderOrder = 992;

  const outerSphereGroup = new THREE.Group();
  const outerSphereWire = new THREE.LineSegments(
    unitSphereWireGeo,
    new THREE.LineBasicMaterial({
      color: OUTER_CULL_HEX,
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
    })
  );
  const outerSphereShell = new THREE.Mesh(
    unitSphereShellGeo,
    new THREE.MeshBasicMaterial({
      color: OUTER_CULL_HEX,
      transparent: true,
      opacity: 0.025,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
  );
  outerSphereGroup.add(outerSphereWire, outerSphereShell);
  outerSphereGroup.renderOrder = 988;

  const outerGroundRing = new THREE.LineSegments(
    solidCircleGeo,
    new THREE.LineBasicMaterial({
      color: OUTER_CULL_HEX,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
    })
  );
  outerGroundRing.renderOrder = 991;

  const iso50GroundRing = new THREE.LineSegments(
    dashedCircleGeo,
    new THREE.LineBasicMaterial({
      color: ISO50_COLOR_HEX,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
    })
  );
  iso50GroundRing.renderOrder = 993;

  const iso50EquatorRing = new THREE.LineSegments(
    dashedCircleGeo,
    new THREE.LineBasicMaterial({
      color: ISO50_COLOR_HEX,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
    })
  );
  iso50EquatorRing.renderOrder = 991;

  const iso75GroundRing = new THREE.LineSegments(
    dashedCircleGeo,
    new THREE.LineBasicMaterial({
      color: ISO75_COLOR_HEX,
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
    })
  );
  iso75GroundRing.renderOrder = 991;

  const iso25GroundRing = new THREE.LineSegments(
    dashedCircleGeo,
    new THREE.LineBasicMaterial({
      color: ISO25_COLOR_HEX,
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
    })
  );
  iso25GroundRing.renderOrder = 991;

  const rulerGroup = new THREE.Group();
  const rulerGeo3D = new THREE.BufferGeometry();
  rulerGeo3D.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
  const rulerLine3D = new THREE.Line(
    rulerGeo3D,
    new THREE.LineBasicMaterial({
      color: ISO50_COLOR_HEX,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
    })
  );
  rulerLine3D.frustumCulled = false;
  rulerLine3D.renderOrder = 996;

  const rulerGeoGround = new THREE.BufferGeometry();
  rulerGeoGround.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
  const rulerGroundLine = new THREE.Line(
    rulerGeoGround,
    new THREE.LineBasicMaterial({
      color: 0x94a3b8,
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
    })
  );
  rulerGroundLine.frustumCulled = false;
  rulerGroundLine.renderOrder = 994;

  const beaconGeo = new THREE.SphereGeometry(28, 14, 10);
  const emitterBeacon = new THREE.Mesh(
    beaconGeo,
    new THREE.MeshBasicMaterial({
      color: 0xf59e0b,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
    })
  );
  emitterBeacon.renderOrder = 998;

  const listenerBeacon = new THREE.Mesh(
    beaconGeo,
    new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
    })
  );
  listenerBeacon.renderOrder = 998;

  const billboard = createSpatialAudioBillboard();
  if (billboard) {
    rulerGroup.add(billboard.sprite);
  }
  rulerGroup.add(rulerLine3D, rulerGroundLine, emitterBeacon, listenerBeacon);

  rootGroup.add(
    innerSphereGroup,
    innerGroundRing,
    outerSphereGroup,
    outerGroundRing,
    iso50GroundRing,
    iso50EquatorRing,
    iso75GroundRing,
    iso25GroundRing,
    rulerGroup
  );

  return {
    innerSphereGroup,
    innerSphereWire,
    innerSphereShell,
    innerGroundRing,
    outerSphereGroup,
    outerSphereWire,
    outerSphereShell,
    outerGroundRing,
    iso50GroundRing,
    iso50EquatorRing,
    iso75GroundRing,
    iso25GroundRing,
    rulerGroup,
    rulerLine3D,
    rulerGroundLine,
    emitterBeacon,
    listenerBeacon,
    billboard,
  };
}

export function renderSpatialAudioBillboardLabel(
  billboard: SpatialAudioBillboardResources,
  profile: SpatialAttenuationProfile,
  cfg: SpatialAudioVisualizerConfig,
  distUU: number,
  gain: number,
  isCulled: boolean,
  r50: number,
  rMin: number = profile.minDistanceUU,
  rMax: number = profile.maxDistanceUU
): void {
  const { ctx, canvas, texture } = billboard;
  if (!ctx) return;
  const distRound = Math.round(distUU);
  const gainPct = (gain * 100).toFixed(1);
  const rMinRound = Math.round(rMin);
  const r50Round = Math.round(r50);
  const rMaxRound = Math.round(rMax);
  const sig = `${profile.id}|${cfg.anchorMode}|${distRound}|${gainPct}|${isCulled}|${rMinRound}|${r50Round}|${rMaxRound}`;
  if (sig === billboard.lastSignature) return;
  billboard.lastSignature = sig;

  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  ctx.fillStyle = 'rgba(10, 14, 23, 0.88)';
  ctx.strokeStyle = isCulled
    ? 'rgba(244, 63, 94, 0.85)'
    : gain >= 0.999
      ? 'rgba(16, 185, 129, 0.9)'
      : 'rgba(56, 189, 248, 0.85)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.roundRect(6, 6, w - 12, h - 12, 18);
  ctx.fill();
  ctx.stroke();

  ctx.font = 'bold 20px ui-monospace, SFMono-Regular, Menlo, monospace';
  ctx.fillStyle = '#f8fafc';
  const modeTag = cfg.anchorMode === 'listener' ? 'LISTENER RADAR' : 'EMITTER SPHERE';
  ctx.fillText(`${profile.label} [${modeTag}]`, 22, 38);

  const dbStr = gain <= 1e-4 ? '-∞ dB' : `${(20 * Math.log10(gain)).toFixed(1)} dB`;
  const statusText = isCulled
    ? 'CULLED (0%)'
    : gain >= 0.999
      ? 'CORE (100%)'
      : distUU >= rMax
        ? 'FLOOR'
        : 'ROLLOFF';
  ctx.font = 'bold 24px ui-monospace, SFMono-Regular, Menlo, monospace';
  ctx.fillStyle = isCulled ? '#fb7185' : gain >= 0.999 ? '#34d399' : '#38bdf8';
  ctx.fillText(`Dist: ${distRound} UU  ·  Gain: ${gainPct}% (${dbStr})`, 22, 78);

  ctx.font = '18px ui-monospace, SFMono-Regular, Menlo, monospace';
  ctx.fillStyle = '#94a3b8';
  ctx.fillText(
    `R_min: ${rMinRound} · R_50%: ${r50Round} · R_max: ${rMaxRound} UU [${statusText}]`,
    22,
    114
  );

  texture.needsUpdate = true;
}
