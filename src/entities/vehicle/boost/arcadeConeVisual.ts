import * as THREE from 'three';

export interface BoostNozzlePositionLike {
  x?: number;
  y?: number;
  z?: number;
  toArray?: () => number[];
}

function applyPointPosition(
  points: THREE.Points,
  pos: BoostNozzlePositionLike | null | undefined
): void {
  if (!pos) return;
  if (typeof pos.toArray === 'function') {
    const [px = 0, py = 0, pz = 0] = pos.toArray();
    points.position.set(px, py, pz);
  } else {
    points.position.set(pos.x ?? 0, pos.y ?? 0, pos.z ?? 0);
  }
}

/**
 * Arcade Boost flame cone geometry
 */
export function createArcadeBoostFlameConeGeometry(radius: number): THREE.BufferGeometry {
  const { BufferGeometry, BufferAttribute } = THREE;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  const HEIGHT_SEGS = 12;
  const RADIAL_SEGS = 12;
  const stride = RADIAL_SEGS + 1;

  for (let heightStep = 0; heightStep <= HEIGHT_SEGS; heightStep++) {
    const fraction = heightStep / HEIGHT_SEGS;
    const currentRadius =
      radius * (0.22 + 0.78 * Math.sin(Math.PI * Math.pow(fraction, 0.68))) * (1 - fraction);
    for (let radialStep = 0; radialStep <= RADIAL_SEGS; radialStep++) {
      const uCoord = radialStep / RADIAL_SEGS;
      const angle = uCoord * Math.PI * 2;
      positions.push(
        -50 * fraction,
        Math.cos(angle) * currentRadius,
        Math.sin(angle) * currentRadius
      );
      uvs.push(uCoord, 1 - fraction);
    }
  }

  for (let heightStep = 0; heightStep < HEIGHT_SEGS; heightStep++) {
    for (let radialIndex = 0; radialIndex < RADIAL_SEGS; radialIndex++) {
      const quadA = heightStep * stride + radialIndex;
      const quadB = quadA + stride;
      indices.push(quadA, quadB, quadA + 1, quadB, quadB + 1, quadA + 1);
    }
  }

  const geom = new BufferGeometry();
  geom.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  geom.setAttribute('uv', new BufferAttribute(new Float32Array(uvs), 2));
  geom.setIndex(indices);
  geom.computeVertexNormals();
  return geom;
}

/**
 * Arcade Boost flame cone material
 */
export function createArcadeBoostFlameConeMaterial(): THREE.ShaderMaterial {
  const { ShaderMaterial, DoubleSide } = THREE;
  return new ShaderMaterial({
    name: 'Arcade / painted flame',
    uniforms: {
      time: { value: 0 },
      opacity: { value: 0 },
    },
    vertexShader: `
      uniform float time;
      varying vec2 vUv;
      varying vec3 vNormal;
      varying vec3 vView;
      void main() {
        vUv = uv;
        float tail = 1.0 - uv.y;
        vec3 p = position;
        p.x *= 1.0 + 0.09 * sin(time * 24.0);
        p.y += sin(time * 19.0 - tail * 7.0) * 2.0 * tail * tail;
        p.z += sin(time * 15.0 - tail * 5.0) * 1.3 * tail * tail;
        vec4 viewPosition = modelViewMatrix * vec4(p, 1.0);
        vNormal = normalize(normalMatrix * normal);
        vView = normalize(-viewPosition.xyz);
        gl_Position = projectionMatrix * viewPosition;
      }
    `,
    fragmentShader: `
      uniform float opacity;
      varying vec2 vUv;
      varying vec3 vNormal;
      varying vec3 vView;
      void main() {
        float facing = abs(dot(normalize(vNormal), normalize(vView)));
        float aa = max(fwidth(facing), 0.015);
        float body = smoothstep(0.32 - aa, 0.32 + aa, facing);
        float core = smoothstep(0.83 - aa, 0.83 + aa, facing);
        core *= smoothstep(0.28, 0.32, vUv.y);
        vec3 color = mix(vec3(0.95, 0.16, 0.012), vec3(1.2, 0.46, 0.055), body);
        color = mix(color, vec3(1.3, 1.0, 0.45), core);
        gl_FragColor = vec4(color, opacity);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    toneMapped: true,
  });
}

/**
 * Arcade nozzle flash point light / billboard
 */
export function createNozzleFlash(
  pos?: BoostNozzlePositionLike | null
): THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial> {
  const { BufferGeometry, BufferAttribute, ShaderMaterial, Points } = THREE;
  const geom = new BufferGeometry();
  geom.setAttribute('position', new BufferAttribute(new Float32Array([0, 0, 0]), 3));

  const mat = new ShaderMaterial({
    name: 'Arcade / nozzle glint',
    uniforms: {
      intensity: { value: 0 },
    },
    vertexShader: `
      void main() {
        vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * viewPosition;
        gl_PointSize = 15.0 * (500.0 / max(1.0, -viewPosition.z));
      }
    `,
    fragmentShader: `
      uniform float intensity;
      void main() {
        vec2 p = abs(gl_PointCoord * 2.0 - 1.0);
        float shape = sqrt(p.x) + sqrt(p.y);
        float aa = max(fwidth(shape), 0.015);
        float alpha = (1.0 - smoothstep(1.0 - aa, 1.0 + aa, shape)) * intensity;
        if (alpha < 0.003) discard;
        gl_FragColor = vec4(vec3(1.9, 1.48, 0.82), alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
    transparent: true,
    depthWrite: false,
    toneMapped: true,
  });

  const points = new Points(geom, mat);
  applyPointPosition(points, pos);
  points.frustumCulled = false;
  points.renderOrder = 7;
  return points;
}

/**
 * Lens Flare billboard for realistic boost
 */
export function createBoostFlare(
  pos?: BoostNozzlePositionLike | null
): THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial> {
  const { BufferGeometry, BufferAttribute, ShaderMaterial, Points, AdditiveBlending } = THREE;
  const geom = new BufferGeometry();
  geom.setAttribute('position', new BufferAttribute(new Float32Array([0, 0, 0]), 3));

  const mat = new ShaderMaterial({
    uniforms: {
      intensity: { value: 0 },
    },
    vertexShader: `
      uniform float intensity;
      varying float vIntensity;
      void main() {
        vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * viewPosition;
        gl_PointSize = 45.0 * (500.0 / max(1.0, -viewPosition.z));
        vIntensity = intensity;
      }
    `,
    fragmentShader: `
      varying float vIntensity;
      void main() {
        vec2 p = gl_PointCoord - 0.5;
        float r = length(p) * 2.0;
        float core = exp(-r * r * 18.0);
        float halo = exp(-r * r * 4.2) * 0.32;
        float alpha = (core + halo) * vIntensity;
        if (alpha < 0.003) discard;
        gl_FragColor = vec4(vec3(4.5, 0.9375, 0.15) * (core + halo), alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
    transparent: true,
    blending: AdditiveBlending,
    depthWrite: false,
    toneMapped: true,
  });

  const points = new Points(geom, mat);
  applyPointPosition(points, pos);
  points.frustumCulled = false;
  points.renderOrder = 7;
  return points;
}
