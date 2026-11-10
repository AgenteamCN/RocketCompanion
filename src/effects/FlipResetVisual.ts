import * as THREE from 'three';
/**
 * FlipResetVisual.ts
 * Flip reset visual indicator attached to vehicle chassis.
 * Displays an arcade starburst ring or realistic shockwave pulse along with spark particles.
 */

export const RESET_INDICATOR_HEIGHT = -12;
export const RESET_PULSE_DURATION = 0.24;
export const RESET_SPARKS_DELAY = 0.05;
export const RESET_SPARKS_DURATION = 0.18;
export const RESET_SPARKS_COUNT = 8;
export const RESET_ARCADE_COLOR_HEX = 16773836; // 0xFFF12C

export function createStarShapeGeometry(): THREE.ShapeGeometry {
  const shape = new THREE.Shape();
  for (let e = 0; e < 8; e++) {
    const angle = Math.PI / 2 + (e * Math.PI) / 4;
    const radius = e % 2 === 0 ? 1 : 0.25;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    if (e === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  shape.closePath();
  return new THREE.ShapeGeometry(shape);
}

export function createSparksMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    name: 'Arcade / reset sparkles',
    uniforms: {
      opacity: { value: 0 },
      size: { value: 20 },
      viewportHeight: { value: 1 },
    },
    vertexShader: `
      #include <common>
      uniform float size;
      uniform float viewportHeight;
      void main() {
        vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * viewPosition;
        gl_PointSize = size * projectionMatrix[1][1] * viewportHeight * 0.5;
        if (isPerspectiveMatrix(projectionMatrix)) gl_PointSize /= max(1.0, -viewPosition.z);
      }
    `,
    fragmentShader: `
      uniform float opacity;
      void main() {
        vec2 p = abs(gl_PointCoord * 2.0 - 1.0);
        float d = sqrt(p.x) + sqrt(p.y);
        float aa = max(fwidth(d), 0.02);
        float alpha = (1.0 - smoothstep(1.0 - aa, 1.0 + aa, d)) * opacity;
        float inside = 1.0 - smoothstep(0.74 - aa, 0.74 + aa, d);
        vec3 color = mix(vec3(0.02, 0.15, 0.38), vec3(1.8, 1.6, 1.0), inside);
        if (alpha < 0.003) discard;
        gl_FragColor = vec4(color, alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
    transparent: true,
    depthWrite: false,
    toneMapped: true,
  });
}

export function enableLayerOne(object: THREE.Object3D | null | undefined): void {
  if (object) {
    object.traverse((child) => child.layers.enable(1));
  }
}

export function seedFlipResetSparks(
  origins: Float32Array,
  velocities: Float32Array,
  positions: Float32Array
): void {
  for (let e = 0; e < RESET_SPARKS_COUNT; e += 1) {
    const idx = e * 3;
    const angle = ((e + Math.random() * 0.25) / RESET_SPARKS_COUNT) * Math.PI * 2;
    const radius = 42 + Math.random() * 8;
    const speed = 100 + Math.random() * 60;
    const height = -4 + Math.random() * 8;

    origins[idx] = Math.cos(angle) * radius;
    origins[idx + 1] = height;
    origins[idx + 2] = Math.sin(angle) * radius;

    velocities[idx] = Math.cos(angle) * speed;
    velocities[idx + 1] = 25 + Math.random() * 45;
    velocities[idx + 2] = Math.sin(angle) * speed;

    positions[idx] = origins[idx];
    positions[idx + 1] = origins[idx + 1];
    positions[idx + 2] = origins[idx + 2];
  }
}

export function stepFlipResetSparks(
  origins: Float32Array,
  velocities: Float32Array,
  positions: Float32Array,
  sparkElapsed: number
): void {
  const gravity = -280 * sparkElapsed * sparkElapsed;
  for (let i = 0; i < RESET_SPARKS_COUNT; i += 1) {
    const idx = i * 3;
    positions[idx] = origins[idx] + velocities[idx] * sparkElapsed;
    positions[idx + 1] = origins[idx + 1] + velocities[idx + 1] * sparkElapsed + gravity;
    positions[idx + 2] = origins[idx + 2] + velocities[idx + 2] * sparkElapsed;
  }
}

export class FlipResetVisual {
  _lastTriggerMs: number | undefined;
  core: THREE.Mesh<THREE.ShapeGeometry, THREE.MeshBasicMaterial>;
  elapsed = Infinity;
  outlineMaterial: THREE.MeshBasicMaterial;
  ring: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  root = new THREE.Group();
  sparkOrigins = new Float32Array(RESET_SPARKS_COUNT * 3);
  sparkPositions = new Float32Array(RESET_SPARKS_COUNT * 3);
  sparkVelocities = new Float32Array(RESET_SPARKS_COUNT * 3);
  sparks: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>;
  sparksGeometry = new THREE.BufferGeometry();
  sparksMaterial = createSparksMaterial();
  viewportRect = new THREE.Vector4();

  constructor(parentObject?: THREE.Object3D | null) {
    this.root.name = 'flip-reset-indicator';
    this.root.position.y = RESET_INDICATOR_HEIGHT;
    this.root.visible = false;
    if (parentObject) {
      parentObject.add(this.root);
    }

    const baseMaterial = new THREE.MeshBasicMaterial({
      name: 'Arcade / reset ring',
      color: new THREE.Color(RESET_ARCADE_COLOR_HEX),
      transparent: true,
      opacity: 0,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: true,
    });

    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.83, 1, 48), baseMaterial);
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.renderOrder = 9;
    this.root.add(this.ring);

    this.core = new THREE.Mesh(createStarShapeGeometry(), baseMaterial.clone());
    this.core.material.color.setRGB(1.6, 1.4, 0.9);
    this.core.rotation.x = -Math.PI / 2;
    this.core.position.y = 0.5;
    this.core.renderOrder = 10;
    this.root.add(this.core);

    this.outlineMaterial = baseMaterial.clone();
    this.outlineMaterial.color.set(1460613);

    const outlineMesh = new THREE.Mesh(
      new THREE.RingGeometry(0.78, 1.05, 48),
      this.outlineMaterial
    );
    outlineMesh.renderOrder = 8;
    this.ring.add(outlineMesh);

    const positionAttribute = new THREE.BufferAttribute(this.sparkPositions, 3);
    const sparksGeometry = this.sparksGeometry;
    const sparksMaterial = this.sparksMaterial;
    sparksGeometry.setAttribute('position', positionAttribute);
    this.sparks = new THREE.Points(sparksGeometry, sparksMaterial);
    this.sparks.onBeforeRender = (renderer) => {
      renderer.getCurrentViewport(this.viewportRect);
      this.sparksMaterial.uniforms.viewportHeight.value = this.viewportRect.w;
    };
    this.sparks.frustumCulled = false;
    this.sparks.renderOrder = 10;
    this.root.add(this.sparks);

    enableLayerOne(this.root);
  }

  preloadAudio(): Promise<void> {
    return Promise.resolve();
  }

  get bloomActive(): boolean {
    return this.root.visible;
  }

  update(dt: number, isAlive = true): void {
    if (Number.isFinite(this.elapsed)) {
      this.elapsed += dt;
      if (this.elapsed >= RESET_PULSE_DURATION || !isAlive) {
        this.stopVisual();
        return;
      }
      this.updateVisual();
    }
  }

  play(): void {
    const nowMs = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (this._lastTriggerMs !== undefined && nowMs - this._lastTriggerMs < 500) {
      return;
    }
    this._lastTriggerMs = nowMs;
    this.elapsed = 0;
    this.root.visible = true;
    this.seedSparks();
    this.updateVisual();
  }

  seedSparks(): void {
    seedFlipResetSparks(this.sparkOrigins, this.sparkVelocities, this.sparkPositions);
    this.sparksGeometry.attributes.position.needsUpdate = true;
  }

  updateVisual(): void {
    this.ring.visible = true;
    this.core.visible = true;

    const progress = THREE.MathUtils.clamp(this.elapsed / RESET_PULSE_DURATION, 0, 1);
    const alphaFade = Math.pow(1 - progress, 1.65);
    const scaleFactor = 1 - Math.pow(1 - progress, 3);

    this.ring.scale.setScalar(48 + scaleFactor * 58);
    this.ring.material.opacity = 0.62 * alphaFade;
    this.outlineMaterial.opacity = 0.8 * alphaFade;

    this.core.scale.setScalar(28 + scaleFactor * 26);
    this.core.rotation.z = scaleFactor * 0.3;
    this.core.material.opacity = 0.72 * Math.pow(1 - progress, 2.5);

    const sparkElapsed = this.elapsed - RESET_SPARKS_DELAY;
    const sparkAlpha = THREE.MathUtils.clamp(sparkElapsed / RESET_SPARKS_DURATION, 0, 1);
    const sparksActive = sparkElapsed >= 0 && sparkElapsed < RESET_SPARKS_DURATION;
    this.sparks.visible = sparksActive;

    if (sparksActive) {
      stepFlipResetSparks(
        this.sparkOrigins,
        this.sparkVelocities,
        this.sparkPositions,
        sparkElapsed
      );
      this.sparksMaterial.uniforms.opacity.value = 1 - sparkAlpha * sparkAlpha;
      this.sparksMaterial.uniforms.size.value = 20 * (1 - sparkAlpha * 0.65);
      this.sparksGeometry.attributes.position.needsUpdate = true;
    }
  }

  stopVisual(): void {
    this.elapsed = Infinity;
    this.root.visible = false;
    this.sparks.visible = false;
    this.ring.material.opacity = 0;
    this.core.material.opacity = 0;
    this.outlineMaterial.opacity = 0;
    this.sparksMaterial.uniforms.opacity.value = 0;
  }

  dispose(): void {
    this.stopVisual();
    this.ring.geometry.dispose();
    this.ring.material.dispose();
    this.core.geometry.dispose();
    this.core.material.dispose();
    this.outlineMaterial.dispose();
    this.sparksGeometry.dispose();
    this.sparksMaterial.dispose();
    if (this.root.parent) {
      this.root.parent.remove(this.root);
    }
  }
}
