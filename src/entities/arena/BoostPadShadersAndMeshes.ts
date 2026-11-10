import * as THREE from 'three';
import { computeAllPadRotations } from '../../ui-core/config/boostPadGeometry.ts';

export const BOOST_PAD_BIG_HEIGHT = 30;
export const BOOST_PAD_SMALL_HEIGHT = 15;
export const BOOST_PAD_BIG_RADIUS = 80;
export const BOOST_PAD_SMALL_RADIUS = 40;
export const BOOST_PAD_BASE_HEIGHT = 4;

export const DEFAULT_BOOST_PAD_TUNER = {
  // Upward glow shader
  bottomOpacity: 0.08,
  topOpacity: 0,
  midpoint: 0.35,
  topCutoff: 0.35,
  power: 1,
  glowIntensity: 5,
  glowColor: '#d97e00',
  coreColor: '#ffe750',
  glowHeightOffsetBig: -0.01,
  glowHeightOffsetSmall: -0.05,

  // Big Pad static floating orb
  orbRadius: 15,
  orbHeightOffset: 70,
  orbEmissiveIntensity: 5,
  orbColor: '#ffaa00',

  // Materials coloring & PBR
  topColor: '#d2bb18',
  topInactiveColor: '#1c2026',
  sideColor: '#000000',
  sideFollowsBase: true,
  baseColor: '#888888',
  baseRoughness: 1,
  baseMetalness: 1,
  sideRoughness: 1,
  sideMetalness: 1,
  topRoughness: 1,
  topMetalness: 0,
  padHeightOffset: 7.5,

  // Big Pad Black Silhouette Out Glow
  shadowEnabled: true,
  shadowRadius: 10,
  shadowIntensity: 1,
  shadowDistanceScale: 0.012,

  // Refilling
  refillEnabled: true,
  bigRefillThreshold: 3,
  smallRefillThreshold: 1,

  // Upward Glow Collect Animation
  collectDuration: 300,
  bezierP1X: 0,
  bezierP1Y: -3,
  bezierP2X: 0,
  bezierP2Y: 1,

  // Big Pad Orb Collect Animation
  orbCollectDuration: 200,
  orbDropDistance: 175,
  orbBezierP1X: 0,
  orbBezierP1Y: -1.15,
  orbBezierP2X: 0,
  orbBezierP2Y: 1,

  // 11 Symmetric Rotations (Degrees)
  rotBigMid: -30,
  rotBigCorner: 15,
  rotSmallAxisY0: 0,
  rotSmallAxisY1: 0,
  rotSmallAxisY2: 60,
  rotSmallAxisX0: 30,
  rotSmallQuadA: 30,
  rotSmallQuadB: 30,
  rotSmallQuadC: -30,
  rotSmallQuadD: 30,
  rotSmallQuadE: 30,
};

export function prepareGlowGeometry(mesh) {
  if (!mesh?.geometry?.attributes?.position) return;
  const geo = mesh.geometry;
  geo.computeBoundingBox();
  const minY = geo.boundingBox.min.y;
  const maxY = geo.boundingBox.max.y;
  const range = Math.max(maxY - minY, 0.0001);
  const pos = geo.attributes.position;
  const heights = new Float32Array(pos.count);
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    heights[i] = (y - minY) / range;
  }
  geo.setAttribute('aNormHeight', new THREE.BufferAttribute(heights, 1));

  const maxXZ = Math.max(
    Math.abs(geo.boundingBox.max.x),
    Math.abs(geo.boundingBox.min.x),
    Math.abs(geo.boundingBox.max.z),
    Math.abs(geo.boundingBox.min.z)
  );
  if (mesh.material?.uniforms?.uRefillMaxRadius) {
    mesh.material.uniforms.uRefillMaxRadius.value = maxXZ * 1.05;
  }
}

/**
 * Creates custom upward normalized gradient opacity shader with polar refilling mask support.
 */
export function createUpwardGlowMaterial(tunerConfig = DEFAULT_BOOST_PAD_TUNER) {
  const config = { ...DEFAULT_BOOST_PAD_TUNER, ...tunerConfig };
  const uColor = new THREE.Color(config.glowColor);
  const uCoreColor = new THREE.Color(config.coreColor);

  return new THREE.ShaderMaterial({
    uniforms: {
      uBottomOpacity: { value: config.bottomOpacity },
      uTopOpacity: { value: config.topOpacity },
      uMidpoint: { value: config.midpoint },
      uTopCutoff: { value: config.topCutoff !== undefined ? config.topCutoff : 1.0 },
      uPower: { value: config.power },
      uIntensity: { value: config.glowIntensity },
      uColor: { value: uColor },
      uCoreColor: { value: uCoreColor },
      // Polar Shrinking Refill Glow Uniforms
      uRefillActive: { value: 0.0 },
      uRefillProgress: { value: 0.0 },
      uRefillMaxRadius: { value: 0.8 },
    },
    vertexShader: `
      attribute float aNormHeight;
      varying float vNormHeight;
      varying vec3 vNormal;
      varying vec2 vUv;
      varying vec2 vLocalXZ;

      void main() {
        vNormHeight = aNormHeight;
        vNormal = normalize(normalMatrix * normal);
        vUv = uv;
        vLocalXZ = position.xz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uBottomOpacity;
      uniform float uTopOpacity;
      uniform float uMidpoint;
      uniform float uTopCutoff;
      uniform float uPower;
      uniform float uIntensity;
      uniform vec3 uColor;
      uniform vec3 uCoreColor;

      uniform float uRefillActive;
      uniform float uRefillProgress;
      uniform float uRefillMaxRadius;

      varying float vNormHeight;
      varying vec3 vNormal;
      varying vec2 vUv;
      varying vec2 vLocalXZ;

      void main() {
        float topLimit = max(uTopCutoff, 0.001);
        float t = clamp(vNormHeight / topLimit, 0.0, 1.0);
        float mid = clamp(uMidpoint, 0.001, 0.999);
        float curve;
        if (t < mid) {
          curve = 0.5 * pow(t / mid, max(uPower, 0.01));
        } else {
          curve = 1.0 - 0.5 * pow((1.0 - t) / (1.0 - mid), max(uPower, 0.01));
        }

        float alpha = mix(uBottomOpacity, uTopOpacity, curve);
        float coreBlend = pow(1.0 - t, 2.0);
        vec3 rgb = mix(uColor, uCoreColor, coreBlend * 0.6) * uIntensity;

        // Polar countdown shrinking mask with 0 saturation:
        // starts as a thin donut at outer edge, thickens inward, and ends as a solid disk
        if (uRefillActive > 0.01) {
          // 1. Remove saturation: adjust glow tint and core hot saturation to 0
          float gray = dot(rgb, vec3(0.299, 0.587, 0.114));
          rgb = vec3(gray);

          // 2. Inward circular mask sweeping outside-to-inside
          float r = length(vLocalXZ);
          float innerRadius = uRefillMaxRadius * (1.0 - uRefillProgress);

          // Only area r >= innerRadius is visible
          float inwardMask = smoothstep(innerRadius - 0.02, innerRadius + 0.02, r);
          alpha *= inwardMask;
        }

        gl_FragColor = vec4(rgb, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}

/**
 * Creates camera-facing soft black out-glow billboard behind Big Pad orb.
 */
export function createBigOrbShadowMesh(tunerConfig) {
  const geo = new THREE.PlaneGeometry(1, 1);
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uIntensity: {
        value: tunerConfig.shadowIntensity !== undefined ? tunerConfig.shadowIntensity : 1.0,
      },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        // View-space spherical billboard with local model scale preserved
        float scaleX = length(vec3(modelMatrix[0].xyz));
        float scaleY = length(vec3(modelMatrix[1].xyz));
        vec4 mvPosition = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        mvPosition.xy += position.xy * vec2(scaleX, scaleY);
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      varying vec2 vUv;
      uniform float uIntensity;
      void main() {
        vec2 centered = vUv - vec2(0.5);
        float dist = length(centered) * 2.0; // 0 at center, 1 at edge
        if (dist > 1.0) discard;
        // Radial soft exponential dropoff
        float alpha = (1.0 - smoothstep(0.05, 1.0, dist)) * uIntensity;
        gl_FragColor = vec4(0.0, 0.0, 0.0, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    side: THREE.DoubleSide,
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'BoostOrbShadowBillboard';
  mesh.renderOrder = 1; // Render before glowing orb
  return mesh;
}

export function createFallbackPadMeshes(isBig) {
  const { Mesh, CylinderGeometry, MeshStandardMaterial } = THREE;
  const radius = isBig ? BOOST_PAD_BIG_RADIUS : BOOST_PAD_SMALL_RADIUS;
  const height = isBig ? BOOST_PAD_BIG_HEIGHT : BOOST_PAD_SMALL_HEIGHT;

  const fullMat = new MeshStandardMaterial({
    color: 16750126,
    emissive: 5579776,
    roughness: 0.55,
    metalness: 0.25,
  });

  const fullMesh = new Mesh(new CylinderGeometry(radius, radius, height, 12), fullMat);
  fullMesh.position.y = height / 2;

  const baseMat = new MeshStandardMaterial({
    color: 2111056,
    roughness: 0.5,
    metalness: 0.5,
  });

  const baseMesh = new Mesh(
    new CylinderGeometry(radius, radius, BOOST_PAD_BASE_HEIGHT, 12),
    baseMat
  );
  baseMesh.position.y = 2;

  return { full: fullMesh, base: baseMesh };
}

export function cloneModelWithMaterials(src) {
  if (!src) return null;
  const cloned = src.clone(true);
  cloned.traverse((child) => {
    if (child.isMesh && child.material) {
      if (Array.isArray(child.material)) {
        child.material = child.material.map((m) => (m ? m.clone() : m));
      } else {
        child.material = child.material.clone();
      }
    }
  });
  return cloned;
}

export function applyBoostPadVisualTuning(system) {
  const c = system.tunerConfig;

  // 1. Update Discrete Materials Coloring (Top Active/Inactive, Side, Base) & PBR
  const topActiveColor = new THREE.Color(c.topColor || '#000000');
  const topInactiveColor = new THREE.Color(c.topInactiveColor || '#1c2026');
  const baseColor = new THREE.Color(c.baseColor || '#4f4f4f');
  const sideColor = c.sideFollowsBase ? baseColor : new THREE.Color(c.sideColor || '#2b313a');

  for (const pad of system.pads) {
    const applyMatProps = (model, isFull) => {
      model?.traverse?.((child) => {
        if (
          child.isMesh &&
          child.name !== 'BoostFloatingOrb' &&
          !child.name.includes('Glow') &&
          !child.name.includes('Billboard')
        ) {
          const mats = Array.isArray(child.material) ? child.material : [child.material];
          for (const m of mats) {
            if (!m) continue;
            const name = (m.name || '').toLowerCase();
            if (name.includes('top')) {
              if (m.color) m.color.copy(isFull ? topActiveColor : topInactiveColor);
              if (c.topRoughness !== undefined && 'roughness' in m) m.roughness = c.topRoughness;
              if (c.topMetalness !== undefined && 'metalness' in m) m.metalness = c.topMetalness;
            } else if (name.includes('side')) {
              if (m.color) m.color.copy(sideColor);
              if (c.sideRoughness !== undefined && 'roughness' in m) m.roughness = c.sideRoughness;
              if (c.sideMetalness !== undefined && 'metalness' in m) m.metalness = c.sideMetalness;
            } else {
              if (m.color) m.color.copy(baseColor);
              if (c.baseRoughness !== undefined && 'roughness' in m) m.roughness = c.baseRoughness;
              if (c.baseMetalness !== undefined && 'metalness' in m) m.metalness = c.baseMetalness;
            }
            m.needsUpdate = true;
          }
        }
      });
    };
    applyMatProps(pad.full, true);
    applyMatProps(pad.base, false);
  }

  // 2. Update Glow Shader Uniforms & Vertical Alignment across all pads
  for (const pad of system.pads) {
    const mat = pad.glowMaterial;
    if (mat?.uniforms) {
      if (c.bottomOpacity !== undefined) mat.uniforms.uBottomOpacity.value = c.bottomOpacity;
      if (c.topOpacity !== undefined) mat.uniforms.uTopOpacity.value = c.topOpacity;
      if (c.midpoint !== undefined) mat.uniforms.uMidpoint.value = c.midpoint;
      if (c.topCutoff !== undefined) mat.uniforms.uTopCutoff.value = c.topCutoff;
      if (c.power !== undefined) mat.uniforms.uPower.value = c.power;
      if (c.glowIntensity !== undefined) mat.uniforms.uIntensity.value = c.glowIntensity;
      if (c.glowColor) mat.uniforms.uColor.value.set(c.glowColor);
      if (c.coreColor) mat.uniforms.uCoreColor.value.set(c.coreColor);
    }
    if (pad.glowMesh) {
      const glowOffset = pad.isBig
        ? c.glowHeightOffsetBig !== undefined
          ? c.glowHeightOffsetBig
          : c.glowOffsetBig !== undefined
            ? c.glowOffsetBig
            : 0.0
        : c.glowHeightOffsetSmall !== undefined
          ? c.glowHeightOffsetSmall
          : c.glowOffsetSmall !== undefined
            ? c.glowOffsetSmall
            : 0.0;
      pad.glowMesh.position.y = glowOffset;
    }
  }

  // 3. Update Shared Orb Material
  if (system.sharedOrbMaterial) {
    if (c.orbColor) {
      system.sharedOrbMaterial.color.set(c.orbColor);
      system.sharedOrbMaterial.emissive.set(c.orbColor);
    }
    if (c.orbEmissiveIntensity !== undefined) {
      system.sharedOrbMaterial.emissiveIntensity = c.orbEmissiveIntensity;
    }
  }

  // 4. Update Big Pad Orb transforms
  const targetRadius = c.orbRadius !== undefined ? c.orbRadius : DEFAULT_BOOST_PAD_TUNER.orbRadius;
  const targetY =
    system.padPeakY +
    (c.orbHeightOffset !== undefined ? c.orbHeightOffset : DEFAULT_BOOST_PAD_TUNER.orbHeightOffset);

  for (const orb of system.bigOrbs) {
    orb.position.y = targetY;
    orb.scale.set(targetRadius, targetRadius, targetRadius);
    orb.visible = targetRadius > 0.001;
  }

  // 5. Update Big Pad Black Out-Glow Shadow Billboards
  for (const shadow of system.bigShadows) {
    shadow.visible = c.shadowEnabled !== false;
    shadow.position.y = targetY;
    if (shadow.material?.uniforms?.uIntensity) {
      shadow.material.uniforms.uIntensity.value =
        c.shadowIntensity !== undefined ? c.shadowIntensity : 1.0;
    }
    const shadowScale = c.shadowRadius || 100.0;
    shadow.scale.set(shadowScale, shadowScale, 1.0);
  }

  // 6. Update Orientations & Pad Height Offset across all pads
  const angles = computeAllPadRotations(c);
  const padHeight = c.padHeightOffset !== undefined ? c.padHeightOffset : 7.5;
  for (let i = 0; i < system.pads.length; i++) {
    if (system.pads[i]?.group) {
      const deg = angles[i] !== undefined ? angles[i] : system.pads[i].angleDeg || 0;
      system.pads[i].angleDeg = deg;
      system.pads[i].group.rotation.y = deg * (Math.PI / 180);
      system.pads[i].group.position.y = padHeight;
    }
  }
}
