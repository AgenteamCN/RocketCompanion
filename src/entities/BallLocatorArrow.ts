import * as THREE from 'three';
/**
 * BallLocatorArrow.ts
 * 3D directional arrow hovering above the vehicle pointing towards the ball when Ball Cam is off.
 * Includes distance-based scaling offset, smooth orientation tracking, and clarity halo backdrop.
 */

export const BALL_LOCATOR_MIN_DISTANCE = 100;
export const BALL_LOCATOR_MAX_DISTANCE = 10000;
export const BALL_LOCATOR_MIN_OFFSET = 75;
export const BALL_LOCATOR_MAX_OFFSET = 120;
export const BALL_LOCATOR_HEIGHT_OFFSET = 20;
export const BALL_LOCATOR_HALO_SCALE = 48;

export function createBallLocatorHaloTexture() {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  gradient.addColorStop(0, 'rgba(0, 0, 0, 0.38)');
  gradient.addColorStop(0.28, 'rgba(0, 0, 0, 0.31)');
  gradient.addColorStop(0.58, 'rgba(0, 0, 0, 0.16)');
  gradient.addColorStop(0.82, 'rgba(0, 0, 0, 0.045)');
  gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 128, 128);

  const { CanvasTexture, SRGBColorSpace, LinearFilter } = THREE;
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.minFilter = LinearFilter;
  texture.magFilter = LinearFilter;
  return texture;
}

export function createBallLocatorHaloSprite() {
  const { Sprite, SpriteMaterial } = THREE;
  const texture = createBallLocatorHaloTexture();
  const sprite = new Sprite(
    new SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    })
  );
  sprite.name = 'ball-locator-clarity-halo';
  if (sprite.scale?.setScalar) sprite.scale.setScalar(BALL_LOCATOR_HALO_SCALE);
  sprite.renderOrder = 9;
  return sprite;
}

export function createBallLocatorMaterial() {
  return new THREE.MeshStandardMaterial({
    color: 12764618,
    emissive: 4474699,
    emissiveIntensity: 0.5,
    metalness: 0.1,
    roughness: 0.52,
    transparent: true,
    opacity: 0.92,
    depthTest: false,
    depthWrite: false,
  });
}

export function createBallLocatorArrowMesh() {
  const { Shape, ExtrudeGeometry, Mesh } = THREE;
  const shape = new Shape();
  shape.moveTo(-7, -2.4);
  shape.lineTo(1.5, -2.4);
  shape.lineTo(1.5, -5.2);
  shape.lineTo(8, 0);
  shape.lineTo(1.5, 5.2);
  shape.lineTo(1.5, 2.4);
  shape.lineTo(-7, 2.4);
  shape.closePath();

  const geometry = new ExtrudeGeometry(shape, {
    depth: 4,
    bevelEnabled: true,
    bevelSegments: 2,
    bevelSize: 0.7,
    bevelThickness: 0.7,
    curveSegments: 2,
  });
  if (typeof geometry.translate === 'function') {
    geometry.translate(0, 0, -2);
  }

  const mesh = new Mesh(geometry, createBallLocatorMaterial());
  mesh.name = 'ball-locator-arrow';
  mesh.renderOrder = 10;
  return mesh;
}

export class BallLocatorArrow {
  public clarityHalo: any;
  public direction: any;
  public forwardVector: any;
  public object: any;
  public visual: any;

  constructor() {
    const { Group, Vector3 } = THREE;
    this.object = new Group();
    this.object.name = 'ball-locator';
    this.object.visible = false;

    this.clarityHalo = createBallLocatorHaloSprite();
    this.visual = createBallLocatorArrowMesh();
    this.direction = new Vector3();
    this.forwardVector = new Vector3(1, 0, 0);

    this.object.add(this.clarityHalo);
    this.object.add(this.visual);
  }

  update(car, ball, isBallCamActive) {
    if (isBallCamActive || !car || car.visible === false) {
      this.object.visible = false;
      return;
    }

    this.direction.subVectors(ball.position, car.position);
    const distance = this.direction.length();
    if (distance < 1e-4) {
      this.object.visible = false;
      return;
    }

    this.direction.multiplyScalar(1 / distance);
    const progress = THREE.MathUtils.clamp(
      (distance - BALL_LOCATOR_MIN_DISTANCE) /
        (BALL_LOCATOR_MAX_DISTANCE - BALL_LOCATOR_MIN_DISTANCE),
      0,
      1
    );
    const offset = THREE.MathUtils.lerp(BALL_LOCATOR_MIN_OFFSET, BALL_LOCATOR_MAX_OFFSET, progress);

    this.object.visible = true;
    if (this.object.position?.copy) {
      this.object.position.copy(car.position);
      if (this.object.position.addScaledVector) {
        this.object.position.addScaledVector(this.direction, offset);
      }
      this.object.position.y += BALL_LOCATOR_HEIGHT_OFFSET;
    }

    if (this.object.quaternion?.setFromUnitVectors) {
      this.object.quaternion.setFromUnitVectors(this.forwardVector, this.direction);
    }
  }

  dispose() {
    if (this.object?.parent) {
      this.object.parent.remove(this.object);
    }
    this.object?.traverse?.((child) => {
      if (child.geometry?.dispose) child.geometry.dispose();
      if (child.material) {
        if (Array.isArray(child.material))
          child.material.forEach((material) => material?.dispose?.());
        else child.material.dispose?.();
      }
    });
  }
}
