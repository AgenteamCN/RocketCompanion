import { PLUME_TEXTURE, TURBULENCE_TEXTURE, SPARKS_TEXTURE } from './boostCurves.ts';
import type { RealisticBoostParticleTextureSet } from './RealisticBoostParticleMesh.ts';
import * as THREE from 'three';

export interface GoldenBoostTextureSet {
  textures: RealisticBoostParticleTextureSet;
  water: THREE.Texture;
  particleSheet: THREE.Texture;
  ready: Promise<void>;
}

let cachedGoldenBoostTextures: GoldenBoostTextureSet | null = null;

export function setupBoostTexture(tex: THREE.Texture, repeatWrap: boolean): THREE.Texture {
  const { SRGBColorSpace, RepeatWrapping } = THREE;
  tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = 4;
  if (repeatWrap) {
    tex.wrapS = RepeatWrapping;
    tex.wrapT = RepeatWrapping;
  }
  return tex;
}

export function loadGoldenBoostTextures(): GoldenBoostTextureSet {
  if (cachedGoldenBoostTextures) return cachedGoldenBoostTextures;

  const { TextureLoader } = THREE;
  const loader = new TextureLoader();
  const promises: Array<Promise<void>> = [];

  const loadTex = (url: string, repeat: boolean): THREE.Texture => {
    let loadedTex!: THREE.Texture;
    promises.push(
      new Promise<void>((resolve, reject) => {
        loadedTex = setupBoostTexture(
          loader.load(url, () => resolve(), undefined, reject),
          repeat
        );
      })
    );
    return loadedTex;
  };

  const plume = loadTex(PLUME_TEXTURE, false);
  const turb = loadTex(TURBULENCE_TEXTURE, true);
  const sparks = loadTex(SPARKS_TEXTURE, true);

  const readyPromise = Promise.all(promises)
    .then(() => {})
    .catch((err) => {
      console.warn('[VehicleBoostEmitter] Boost textures failed to preload:', err);
    });

  cachedGoldenBoostTextures = {
    textures: { cloud: plume, dust: turb, grain: turb, smoke: turb },
    water: turb,
    particleSheet: sparks,
    ready: readyPromise,
  };

  return cachedGoldenBoostTextures;
}

/**
 * Procedural cone geometry for realistic boost exhaust.
 */
export function createRealisticBoostConeGeometry(
  radius: number,
  length: number,
  radialSegs = 28,
  heightSegs = 18
): THREE.BufferGeometry {
  const { BufferGeometry, BufferAttribute } = THREE;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let heightStep = 0; heightStep <= heightSegs; heightStep++) {
    const fraction = heightStep / heightSegs;
    const profile = Math.max(
      0.012,
      (0.12 + 0.88 * (1 - Math.exp(-fraction * 13))) * Math.pow(1 - fraction, 0.62)
    );
    const currentRadius = radius * profile;
    const posX = -length * fraction;

    for (let radialStep = 0; radialStep <= radialSegs; radialStep++) {
      const uCoord = radialStep / radialSegs;
      const angle = uCoord * Math.PI * 2;
      positions.push(posX, Math.cos(angle) * currentRadius, Math.sin(angle) * currentRadius);
      uvs.push(uCoord, 1 - fraction);
    }
  }

  const stride = radialSegs + 1;
  for (let heightStep = 0; heightStep < heightSegs; heightStep++) {
    for (let radialStep = 0; radialStep < radialSegs; radialStep++) {
      const quadA = heightStep * stride + radialStep;
      const quadB = quadA + stride;
      indices.push(quadA, quadB, quadA + 1, quadB, quadB + 1, quadA + 1);
    }
  }

  const geom = new BufferGeometry();
  geom.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  geom.setAttribute('uv', new BufferAttribute(new Float32Array(uvs), 2));
  geom.setIndex(indices);
  geom.computeVertexNormals();
  geom.computeBoundingSphere();
  return geom;
}

/**
 * Procedural shader material for realistic boost exhaust cone.
 */
export function createRealisticBoostConeMaterial(
  waterMap: THREE.Texture | null,
  particleSheetMap: THREE.Texture | null,
  layer: number
): THREE.ShaderMaterial {
  const { ShaderMaterial, NormalBlending, DoubleSide } = THREE;
  return new ShaderMaterial({
    uniforms: {
      waterMap: { value: waterMap },
      particleSheetMap: { value: particleSheetMap },
      time: { value: 0 },
      opacity: { value: 0 },
      luminanceMode: { value: 0 },
    },
    vertexShader: `
      varying vec2 vUv;
      varying float vLayer;
      varying vec3 vNormal;
      varying vec3 vView;
      void main() {
        vUv = uv;
        vLayer = ${layer.toFixed(1)};
        vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
        vNormal = normalize(normalMatrix * normal);
        vView = normalize(-viewPosition.xyz);
        gl_Position = projectionMatrix * viewPosition;
      }
    `,
    fragmentShader: `
      uniform sampler2D waterMap;
      uniform sampler2D particleSheetMap;
      uniform float time;
      uniform float opacity;
      uniform int luminanceMode;
      varying vec2 vUv;
      varying float vLayer;
      varying vec3 vNormal;
      varying vec3 vView;
      void main() {
        float layer = clamp((vLayer - 0.5) * 100.0, 0.0, 1.0);
        float flow = time * mix(1.5, 1.0, layer);
        vec2 waterA = texture2D(waterMap, vec2(
          vUv.x - flow * 0.05,
          vUv.y * 0.25 + flow
        )).rg;
        vec2 waterB = texture2D(waterMap, vec2(
          vUv.x + flow * 0.02,
          vUv.y * 0.5 + flow
        )).rg;
        vec2 waterSum = waterA + waterB;

        vec2 sheetUvA = vec2(vUv.x * 2.0 + waterSum.r * 0.1,
          vUv.y * 0.4 + flow * 2.0 + waterSum.g * 0.1);
        vec2 sheetUvB = vec2(vUv.x * 2.0 + waterSum.r * 0.1,
          vUv.y * 0.4 + flow + waterSum.g * 0.1);
        float sheetSignal = texture2D(particleSheetMap, sheetUvA).r
          * texture2D(particleSheetMap, sheetUvB).r;

        float distortedV = vUv.y + waterSum.g * 0.5;
        float axial = min(1.0, 6.0 * pow(abs(vUv.y), 3.0));
        float fresnelPower = mix(12.0, 3.0, axial);

        float dotFacing = clamp(dot(normalize(vNormal), normalize(vView)), 0.0, 1.0);
        float facing = dotFacing;
        float colorScale = 1.0;

        if (luminanceMode == 0) {
          // Balanced (1.0x): steady uniform flame emission without perspective flash
          facing = 0.45;
          colorScale = 1.0;
        } else {
          // Dynamic: original perspective-linked emission (intense directly from rear)
          facing = dotFacing;
          colorScale = mix(0.5, 1.5, dotFacing);
        }

        float fresnel = pow(max(facing, 0.000001), fresnelPower);
        float gradient = clamp(12.0 * pow(max(abs(distortedV), 0.000001), 3.0), 0.0, 1.0);
        float baseAlpha = fresnel * gradient;
        float tip = clamp(1.0 - distortedV, 0.0, 1.0);
        float tipMask = min(1.0, 64.0 * tip * tip * tip * tip) * facing;
        float sparks = 0.08 * sheetSignal * tipMask;
        float distalNoise = (waterSum.r + waterSum.g - 1.0) * 0.16;
        float distalFade = smoothstep(0.02, 0.42, vUv.y + distalNoise);
        float alpha = opacity * 2.0 * (baseAlpha + sparks) * distalFade;
        if (alpha < 0.002) discard;

        vec3 outer = vec3(1.5, 0.8, 0.2) * (2.0 * colorScale);
        vec3 inner = vec3(1.5, 0.8, 0.2) * (4.0 * colorScale);
        vec3 color = mix(outer, inner, layer);
        gl_FragColor = vec4(color, alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
    transparent: true,
    blending: NormalBlending,
    depthWrite: false,
    side: DoubleSide,
    toneMapped: true,
  });
}
