import * as THREE from 'three';
import { getThemeMaterial, isMultiThemeMaterial } from '../effects/ThemeMaterialPipeline.ts';
import {
  ballVisualRuntimeConfig,
  registerBallVisualApplier,
  type BallVisualConfig,
} from '../ui-core/config/ballVisualConfig.ts';
import {
  CLASSIC_BALL_RADIUS,
  attachBallGoalShader,
  syncBallGoalEffectEnabledUniform,
} from './arena/BallGoalRimShader.ts';

export function createGeodesicBallGeometry(patternColor: THREE.ColorRepresentation | null = null) {
  const { BufferGeometry, BufferAttribute, IcosahedronGeometry, Vector3, Color } = THREE;

  const baseIco = new IcosahedronGeometry(1, 0);
  const posAttr = baseIco.getAttribute('position');
  const uniqueVertices: THREE.Vector3[] = [];
  const vertexLookup = new Map<string, number>();
  const faces: number[][] = [];

  if (posAttr) {
    for (let i = 0; i < posAttr.count; i += 3) {
      const face: number[] = [];
      for (let cornerIdx = 0; cornerIdx < 3; cornerIdx++) {
        const v = new Vector3().fromBufferAttribute(posAttr, i + cornerIdx);
        const key = v
          .toArray()
          .map((val) => Number(val).toFixed(6))
          .join(',');
        if (!vertexLookup.has(key)) {
          vertexLookup.set(key, uniqueVertices.length);
          uniqueVertices.push(v);
        }
        face.push(vertexLookup.get(key)!);
      }
      faces.push(face);
    }
  }
  baseIco.dispose();

  const lerpNorm = (aIdx: number, bIdx: number) =>
    uniqueVertices[aIdx]
      .clone()
      .lerp(uniqueVertices[bIdx], 1 / 3)
      .normalize();
  const adjacent = uniqueVertices.map(() => new Set<number>());
  const panels: Array<{ corners: THREE.Vector3[]; black: boolean }> = [];

  for (const [a, b, c] of faces) {
    adjacent[a].add(b).add(c);
    adjacent[b].add(a).add(c);
    adjacent[c].add(a).add(b);
    panels.push({
      corners: [
        lerpNorm(a, b),
        lerpNorm(b, a),
        lerpNorm(b, c),
        lerpNorm(c, b),
        lerpNorm(c, a),
        lerpNorm(a, c),
      ],
      black: false,
    });
  }

  for (let i = 0; i < uniqueVertices.length; i++) {
    const v = uniqueVertices[i].clone().normalize();
    const up = (Math.abs(v.y) < 0.9 ? new Vector3(0, 1, 0) : new Vector3(1, 0, 0))
      .cross(v)
      .normalize();
    const right = v.clone().cross(up);
    const sorted = [...adjacent[i]].map((adj) => lerpNorm(i, adj));
    sorted.sort(
      (p1, p2) => Math.atan2(p1.dot(right), p1.dot(up)) - Math.atan2(p2.dot(right), p2.dot(up))
    );
    panels.push({
      corners: sorted,
      black: true,
    });
  }

  const positions: number[] = [];
  const normals: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];

  const whiteColor = new Color(16052713);
  const darkColor = patternColor != null ? new Color(patternColor) : new Color(1054498);
  const seamColor = new Color(3423560);

  const addVertex = (vNorm: THREE.Vector3, radius: number, col: THREE.Color) => {
    const idx = positions.length / 3;
    positions.push(vNorm.x * radius, vNorm.y * radius, vNorm.z * radius);
    normals.push(vNorm.x, vNorm.y, vNorm.z);
    colors.push(col.r, col.g, col.b);
    return idx;
  };

  for (const { corners, black } of panels) {
    const center = corners.reduce((acc, cur) => acc.add(cur), new Vector3()).normalize();
    const panelColor = black ? darkColor : whiteColor;
    const centerIdx = addVertex(center, CLASSIC_BALL_RADIUS, panelColor);
    const interpolated: THREE.Vector3[] = [];

    for (let i = 0; i < corners.length; i++) {
      for (let step = 0; step < 3; step++) {
        interpolated.push(
          corners[i]
            .clone()
            .lerp(corners[(i + 1) % corners.length], step / 3)
            .normalize()
        );
      }
    }

    let previousRing: number[] | null = null;
    for (const radiusFraction of [0.3, 0.6, 0.85, 0.975, 1.0]) {
      const isRim = radiusFraction === 1.0;
      const currentRing = interpolated.map((pt) =>
        addVertex(
          center.clone().lerp(pt, radiusFraction).normalize(),
          CLASSIC_BALL_RADIUS - (isRim ? 0.7 : 0),
          isRim ? seamColor : panelColor
        )
      );

      for (let i = 0; i < currentRing.length; i++) {
        const next = (i + 1) % currentRing.length;
        if (previousRing) {
          indices.push(
            previousRing[i],
            currentRing[i],
            currentRing[next],
            previousRing[i],
            currentRing[next],
            previousRing[next]
          );
        } else {
          indices.push(centerIdx, currentRing[i], currentRing[next]);
        }
      }
      previousRing = currentRing;
    }
  }

  const geometry = new BufferGeometry();
  geometry.name = 'Classic ball / rounded panels';
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute('normal', new BufferAttribute(new Float32Array(normals), 3));
  geometry.setAttribute('color', new BufferAttribute(new Float32Array(colors), 3));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  geometry.computeBoundingBox();
  geometry.userData.panels = {
    pentagons: panels.filter((panel) => panel.corners.length === 5).length,
    hexagons: panels.filter((panel) => panel.corners.length === 6).length,
  };

  return geometry;
}

export function createClassicBall(patternColor: THREE.ColorRepresentation | null = null) {
  const { Mesh, Group, MeshStandardMaterial } = THREE;
  const geometry = createGeodesicBallGeometry(patternColor);
  const material = new MeshStandardMaterial({
    name: 'Classic ball / matte leather',
    vertexColors: true,
  });
  const mesh = new Mesh(geometry, material);
  mesh.name = 'Classic ball';
  mesh.castShadow = true;
  mesh.receiveShadow = true;

  const group = new Group();
  group.name = 'ball';
  group.add(mesh);
  return group;
}

const activeBallCompositeGroups = new Set<WeakRef<THREE.Group>>();

function resolveEffectiveBallOpacity(config: Partial<BallVisualConfig> | null | undefined): number {
  if (
    typeof config?.temporaryOpacityOverride === 'number' &&
    Number.isFinite(config.temporaryOpacityOverride)
  ) {
    return Math.max(0, Math.min(1, config.temporaryOpacityOverride));
  }
  return Math.max(0, Math.min(1, Number(config?.opacity) ?? 1.0));
}

type ConfigurableBallMaterial = THREE.Material & {
  wireframe?: boolean;
};

function applyConfigToSingleMaterial(
  mat: ConfigurableBallMaterial | null | undefined,
  config: Partial<BallVisualConfig>
): void {
  if (!mat) return;
  attachBallGoalShader(mat);
  const opacity = resolveEffectiveBallOpacity(config);
  const isTransparent = opacity < 0.999;
  const targetDepthWrite = isTransparent ? Boolean(config.depthWriteWhenTransparent) : true;
  const targetSide =
    isTransparent && config.doubleSideWhenTransparent ? THREE.DoubleSide : THREE.FrontSide;
  const targetWireframe = Boolean(config.wireframe);

  const needsShaderRecompile = mat.transparent !== isTransparent || mat.side !== targetSide;

  mat.transparent = isTransparent;
  mat.opacity = opacity;
  mat.depthWrite = targetDepthWrite;
  mat.side = targetSide;
  mat.wireframe = targetWireframe;
  if (needsShaderRecompile) {
    mat.needsUpdate = true;
  }
}

export interface BallIndicatorRingLike {
  visible?: boolean;
  material?: { opacity?: number; transparent?: boolean } | null;
}

export function applyBallVisualConfigToObject(
  ballRoot: THREE.Object3D | null | undefined,
  config: Partial<BallVisualConfig> = ballVisualRuntimeConfig,
  indicatorRings: Array<BallIndicatorRingLike | unknown> = []
): void {
  syncBallGoalEffectEnabledUniform(config);
  if (ballRoot) {
    const effOpacity = resolveEffectiveBallOpacity(config);
    ballRoot.visible = config.visible !== false && effOpacity > 0.001;
    ballRoot.traverse?.(
      (
        node: THREE.Object3D & { isMesh?: boolean; material?: THREE.Material | THREE.Material[] }
      ) => {
        if (!node.isMesh || !node.material) return;
        const mats = Array.isArray(node.material) ? node.material : [node.material];
        for (const m of mats) {
          applyConfigToSingleMaterial(m, config);
          if (isMultiThemeMaterial(m)) {
            applyConfigToSingleMaterial(
              getThemeMaterial(m, 'arcade') as ConfigurableBallMaterial | null,
              config
            );
            applyConfigToSingleMaterial(
              getThemeMaterial(m, 'realistic') as ConfigurableBallMaterial | null,
              config
            );
          }
        }
      }
    );
  }

  if (Array.isArray(indicatorRings)) {
    const ringAlpha = Math.max(0, Math.min(1, Number(config.indicatorRingOpacity) ?? 0.2));
    for (const rawRing of indicatorRings) {
      const ring = rawRing as BallIndicatorRingLike | null | undefined;
      if (!ring) continue;
      ring.visible = ringAlpha > 0.001;
      if (ring.material) {
        ring.material.opacity = ringAlpha;
        ring.material.transparent = true;
      }
    }
  }
}

registerBallVisualApplier((config, ballRoot, indicatorRings) => {
  if (ballRoot) {
    applyBallVisualConfigToObject(ballRoot, config, indicatorRings);
  }
  for (const weakRef of activeBallCompositeGroups) {
    const group = weakRef.deref();
    if (group) {
      applyBallVisualConfigToObject(group, config);
    } else {
      activeBallCompositeGroups.delete(weakRef);
    }
  }
});

export async function loadBallAsset() {
  const compositeGroup = createClassicBall();

  const weakGroup = new WeakRef(compositeGroup);
  activeBallCompositeGroups.add(weakGroup);
  applyBallVisualConfigToObject(compositeGroup, ballVisualRuntimeConfig);

  return compositeGroup;
}
