import * as THREE from 'three';

/**
 * Procedural MeshBasicMaterial helper with custom emissive intensity
 */
export function createRoomEnvironmentMaterial(emissiveIntensity: number) {
  const { MeshLambertMaterial, MeshBasicMaterial } = THREE;
  if (MeshLambertMaterial) {
    return new MeshLambertMaterial({
      color: 0x000000,
      emissive: 0xffffff,
      emissiveIntensity,
    });
  }
  return new MeshBasicMaterial({
    color: 0xffffff,
    emissiveIntensity,
  });
}

/**
 * RoomEnvironment
 * Generates an enclosed box room with 6 lighting panels and subtle diffuse ground bounce
 * used by PMREMGenerator to bake environment cube maps for car models.
 */
export interface RoomEnvironmentChildLike {
  isMesh?: boolean;
  geometry?: { dispose?: () => void } | null;
  material?: { dispose?: () => void } | Array<{ dispose?: () => void }> | null;
}

export class RoomEnvironment extends THREE.Scene {
  declare name: string;
  declare position: {
    x: number;
    y: number;
    z: number;
    set: (x: number, y: number, z: number) => void;
  };
  declare add: (...objects: unknown[]) => this;
  declare traverse: (callback: (child: RoomEnvironmentChildLike) => void) => void;

  constructor() {
    super();
    this.name = 'RoomEnvironment';
    this.position.y = -3.5;

    const {
      BoxGeometry,
      MeshStandardMaterial,
      BackSide: SideBack,
      PointLight,
      Mesh,
      InstancedMesh,
      Object3D,
    } = THREE;

    const boxGeom = new BoxGeometry();
    if (boxGeom.deleteAttribute) {
      boxGeom.deleteAttribute('uv');
    }

    const backMaterial = new MeshStandardMaterial({ side: SideBack });
    const standardMaterial = new MeshStandardMaterial();

    const mainPointLight = new PointLight(0xffffff, 900, 28, 2);
    mainPointLight.position.set(0.418, 16.199, 0.3);
    this.add(mainPointLight);

    const backMesh = new Mesh(boxGeom, backMaterial);
    backMesh.position.set(-0.757, 13.219, 0.717);
    backMesh.scale.set(31.713, 28.305, 28.591);
    this.add(backMesh);

    const instancedMesh = new InstancedMesh(boxGeom, standardMaterial, 6);
    const dummy = new Object3D();

    dummy.position.set(-10.906, 2.009, 1.846);
    dummy.rotation.set(0, -0.195, 0);
    dummy.scale.set(2.328, 7.905, 4.651);
    dummy.updateMatrix();
    instancedMesh.setMatrixAt(0, dummy.matrix);

    dummy.position.set(-5.607, -0.754, -0.758);
    dummy.rotation.set(0, 0.994, 0);
    dummy.scale.set(1.97, 1.534, 3.955);
    dummy.updateMatrix();
    instancedMesh.setMatrixAt(1, dummy.matrix);

    dummy.position.set(6.167, 0.857, 7.803);
    dummy.rotation.set(0, 0.561, 0);
    dummy.scale.set(3.927, 6.285, 3.687);
    dummy.updateMatrix();
    instancedMesh.setMatrixAt(2, dummy.matrix);

    dummy.position.set(-2.017, 0.018, 6.124);
    dummy.rotation.set(0, 0.333, 0);
    dummy.scale.set(2.002, 4.566, 2.064);
    dummy.updateMatrix();
    instancedMesh.setMatrixAt(3, dummy.matrix);

    dummy.position.set(2.291, -0.756, -2.621);
    dummy.rotation.set(0, -0.286, 0);
    dummy.scale.set(1.546, 1.552, 1.496);
    dummy.updateMatrix();
    instancedMesh.setMatrixAt(4, dummy.matrix);

    dummy.position.set(-2.193, -0.369, -5.547);
    dummy.rotation.set(0, 0.516, 0);
    dummy.scale.set(3.875, 3.487, 2.986);
    dummy.updateMatrix();
    instancedMesh.setMatrixAt(5, dummy.matrix);
    this.add(instancedMesh);

    const lightMesh1 = new Mesh(boxGeom, createRoomEnvironmentMaterial(50));
    lightMesh1.position.set(-16.116, 14.37, 8.208);
    lightMesh1.scale.set(0.1, 2.428, 2.739);
    this.add(lightMesh1);

    const lightMesh2 = new Mesh(boxGeom, createRoomEnvironmentMaterial(50));
    lightMesh2.position.set(-16.109, 18.021, -8.207);
    lightMesh2.scale.set(0.1, 2.425, 2.751);
    this.add(lightMesh2);

    const lightMesh3 = new Mesh(boxGeom, createRoomEnvironmentMaterial(17));
    lightMesh3.position.set(14.904, 12.198, -1.832);
    lightMesh3.scale.set(0.15, 4.265, 6.331);
    this.add(lightMesh3);

    const lightMesh4 = new Mesh(boxGeom, createRoomEnvironmentMaterial(43));
    lightMesh4.position.set(-0.462, 8.89, 14.52);
    lightMesh4.scale.set(4.38, 5.441, 0.088);
    this.add(lightMesh4);

    const lightMesh5 = new Mesh(boxGeom, createRoomEnvironmentMaterial(20));
    lightMesh5.position.set(3.235, 11.486, -12.541);
    lightMesh5.scale.set(2.5, 2, 0.1);
    this.add(lightMesh5);

    const lightMesh6 = new Mesh(boxGeom, createRoomEnvironmentMaterial(100));
    lightMesh6.position.set(0, 20, 0);
    lightMesh6.scale.set(1, 0.1, 1);
    this.add(lightMesh6);
  }

  dispose(): void {
    const resources = new Set<{ dispose?: () => void }>();
    this.traverse((meshChild) => {
      if (meshChild && meshChild.isMesh) {
        if (meshChild.geometry) resources.add(meshChild.geometry);
        if (Array.isArray(meshChild.material)) {
          for (const mat of meshChild.material) {
            if (mat) resources.add(mat);
          }
        } else if (meshChild.material) {
          resources.add(meshChild.material);
        }
      }
    });
    for (const res of resources) {
      if (typeof res.dispose === 'function') {
        res.dispose();
      }
    }
  }
}
