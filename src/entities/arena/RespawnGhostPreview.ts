/**
 * RespawnGhostPreview.ts
 * Renders a client-only translucent holographic vehicle preview at the local player's
 * selected respawn slot while demolished (demoSpawnSelection in 0..3).
 * Hidden when demoSpawnSelection === -1 or when the local player is alive.
 * Remote players' respawn selections are never rendered on the local client.
 */

import * as THREE from 'three';
import { buildVehicleModel, buildVehicleWheels, type VehicleAssetStore } from './VehicleFactory.ts';
import {
  getWheelSpecsForVisual,
  updateCarSuspensionAndSteering,
} from '../VehicleSuspensionSystem.ts';
import { getDesiredRespawnPose } from '../../physics/RocketSimConstants.ts';
import { hasVehicleDescriptor } from '../../ui-core/config/vehicleTunerConfig.ts';
import { normalizeVisualId } from '../../ui-core/config/vehicleConstants.ts';

const BLUE_GHOST_HEX = 0x38bdf8;
const BLUE_EMISSIVE_HEX = 0x0284c7;
const BLUE_WIRE_HEX = 0x7dd3fc;

const ORANGE_GHOST_HEX = 0xfb923c;
const ORANGE_EMISSIVE_HEX = 0xea580c;
const ORANGE_WIRE_HEX = 0xfdba74;

export function applyRespawnPoseToObject3D(
  targetObj,
  pose,
  basisFwd,
  basisRight,
  basisUp,
  basisMatrix
) {
  if (!targetObj || !pose) return;
  targetObj.position.set(pose.x, pose.z, pose.y);
  const cy = Math.cos(pose.yaw);
  const sy = Math.sin(pose.yaw);
  basisFwd.set(cy, 0, sy);
  basisRight.set(-sy, 0, cy);
  basisUp.set(0, 1, 0);
  basisMatrix.makeBasis(basisFwd, basisUp, basisRight);
  targetObj.quaternion.setFromRotationMatrix(basisMatrix);
}

export interface DummyGroundCarView {
  isOnGround: boolean;
  forwardSpeed: number;
  steer: number;
  getWheelContact: () => boolean;
  getWheelSusLength: () => number;
  getWheelSteerAngle: () => number;
  getWheelSteerYaw: () => number;
}

export interface RespawnGhostWheelGroupList extends Array<{
  steer: THREE.Group;
  spin: THREE.Group;
}> {
  threeWheels?: boolean;
}

export interface RespawnGhostArenaPort {
  scene?: THREE.Scene | null;
  vehicleRegistry?: {
    _ensureAsyncCustomAsset?: (visual: string, carIndex: number) => void;
    assets?: VehicleAssetStore;
    carLoaders?: {
      wheelSpecs?: { game?: number[][] };
      [key: string]: unknown;
    };
    customVehicleAssets?: Map<string, unknown>;
    carWheels?: Array<{ threeWheels?: boolean } | null>;
    carHitboxesVisible?: boolean;
  } | null;
  playerCarIndex?: number;
  carHitboxesVisible?: boolean;
  markRenderTreeChanged?: () => void;
  isGoalReplayActive?: boolean;
  _headerView: { attach: (state: Float32Array) => { numCars: number } };
  _currCarView: {
    attachCar: (
      state: Float32Array,
      index: number
    ) => { demoSpawnSelection: number; isDemoed: boolean };
  };
  vehiclePresets?: Array<string | null>;
  carVisual?: string;
  vehiclePreset?: string;
  carTeams?: number[];
}

export class RespawnGhostPreview {
  public wheelSpecs: number[][];
  public _basisFwd: THREE.Vector3;
  public _basisMatrix: THREE.Matrix4;
  public _basisRight: THREE.Vector3;
  public _basisUp: THREE.Vector3;
  public _dummyGroundView: DummyGroundCarView;
  public activeTeam: number;
  public arena: RespawnGhostArenaPort | null;
  public builtHasCustomAsset: boolean;
  public builtVisual: string | null;
  public lineMaterials: THREE.LineBasicMaterial[];
  public materials: THREE.MeshStandardMaterial[];
  public root: THREE.Group | null;
  public scene: THREE.Scene | null;
  public suspension: number[];
  public wheelSpin: number[];
  public wheels: RespawnGhostWheelGroupList;

  constructor(arena: RespawnGhostArenaPort | null) {
    this.arena = arena;
    this.scene = arena?.scene || null;
    this.root = null;
    this.builtVisual = null;
    this.builtHasCustomAsset = false;
    this.activeTeam = -1;
    this.materials = [];
    this.lineMaterials = [];
    this.wheels = [];
    this.wheelSpecs = [];
    this.suspension = [0, 0, 0, 0];
    this.wheelSpin = [0, 0, 0, 0];

    this._basisFwd = new THREE.Vector3();
    this._basisRight = new THREE.Vector3();
    this._basisUp = new THREE.Vector3(0, 1, 0);
    this._basisMatrix = new THREE.Matrix4();
    this._dummyGroundView = {
      isOnGround: true,
      forwardSpeed: 0,
      steer: 0,
      getWheelContact: () => true,
      // Return 0 so updateCarSuspensionAndSteering uses restHeight + 6.0 (mountY = -6.0 UU on ground)
      // instead of 5.5 * 3.9 - 6.2 = +15.255 UU (which mounted wheels on the car roof).
      getWheelSusLength: () => 0,
      getWheelSteerAngle: () => 0,
      getWheelSteerYaw: () => 0,
    };
  }

  _buildForVisual(rawVisual = 'fennec') {
    if (!this.arena?.scene) return;
    this.scene = this.arena.scene;
    if (this.root) {
      this._disposeRoot();
    }

    const visual = normalizeVisualId(rawVisual);
    const reg = this.arena.vehicleRegistry;
    reg?._ensureAsyncCustomAsset?.(visual, this.arena.playerCarIndex ?? 0);

    this.root = new THREE.Group();
    this.root.name = 'respawn-ghost-preview';
    this.root.visible = false;

    const { carModel, carHitbox } = buildVehicleModel(
      visual,
      BLUE_GHOST_HEX,
      true,
      reg?.assets || {},
      reg?.carLoaders || {},
      true
    );
    this.root.add(carModel);
    if (carHitbox) {
      carHitbox.visible = Boolean(reg?.carHitboxesVisible ?? this.arena.carHitboxesVisible);
      this.root.add(carHitbox);
    }

    let wheelSpecs = getWheelSpecsForVisual(visual);
    if (
      !visual.startsWith('hitbox-') &&
      !hasVehicleDescriptor(visual) &&
      reg?.carLoaders?.wheelSpecs?.game
    ) {
      wheelSpecs = reg.carLoaders.wheelSpecs.game;
    }
    this.wheelSpecs = wheelSpecs;
    this.wheels = buildVehicleWheels(
      this.root,
      visual,
      BLUE_GHOST_HEX,
      wheelSpecs,
      reg?.assets || {},
      reg?.carLoaders || {}
    );
    this.suspension = [0, 0, 0, 0];
    this.wheelSpin = [0, 0, 0, 0];

    this.materials = [];
    this.lineMaterials = [];
    this.root.traverse((obj) => {
      if (obj.isMesh) {
        obj.castShadow = false;
        obj.receiveShadow = false;
        obj.renderOrder = 11;
        const mat = new THREE.MeshStandardMaterial({
          color: BLUE_GHOST_HEX,
          emissive: BLUE_EMISSIVE_HEX,
          emissiveIntensity: 0.55,
          roughness: 0.25,
          metalness: 0.2,
          transparent: true,
          opacity: 0.42,
          depthWrite: false,
        });
        obj.material = mat;
        this.materials.push(mat);
      } else if (obj.isLineSegments || obj.isLine) {
        obj.renderOrder = 12;
        const lmat = new THREE.LineBasicMaterial({
          color: BLUE_WIRE_HEX,
          transparent: true,
          opacity: 0.65,
          depthWrite: false,
        });
        obj.material = lmat;
        this.lineMaterials.push(lmat);
      }
    });

    this.builtVisual = visual;
    this.builtHasCustomAsset = Boolean(reg?.customVehicleAssets?.has?.(visual));
    this.activeTeam = -1;
    this.scene.add(this.root);
    this.arena.markRenderTreeChanged?.();
  }

  _applyTeamTint(team) {
    if (this.activeTeam === team) return;
    this.activeTeam = team;
    const isOrange = team === 1;
    const mainHex = isOrange ? ORANGE_GHOST_HEX : BLUE_GHOST_HEX;
    const emissiveHex = isOrange ? ORANGE_EMISSIVE_HEX : BLUE_EMISSIVE_HEX;
    const wireHex = isOrange ? ORANGE_WIRE_HEX : BLUE_WIRE_HEX;

    for (const mat of this.materials) {
      mat.color.setHex(mainHex);
      mat.emissive.setHex(emissiveHex);
    }
    for (const lmat of this.lineMaterials) {
      lmat.color.setHex(wireHex);
    }
  }

  update(currState, dt = 0) {
    if (!this.arena || !currState) return;
    if (this.arena.isGoalReplayActive) {
      if (this.root) this.root.visible = false;
      return;
    }
    const header = this.arena._headerView.attach(currState);
    const localCarIndex = this.arena.playerCarIndex ?? 0;
    if (localCarIndex < 0 || localCarIndex >= (header.numCars || 0)) {
      if (this.root) this.root.visible = false;
      return;
    }

    const localCarView = this.arena._currCarView.attachCar(currState, localCarIndex);
    const selectedSlot = localCarView.demoSpawnSelection;
    if (!localCarView.isDemoed || selectedSlot < 0 || selectedSlot > 3) {
      if (this.root) this.root.visible = false;
      return;
    }

    const reg = this.arena.vehicleRegistry;
    const rawVisual =
      this.arena.vehiclePresets?.[localCarIndex] ||
      this.arena.carVisual ||
      this.arena.vehiclePreset ||
      'fennec';
    const desiredVisual = normalizeVisualId(rawVisual);
    const hasCustomAsset = Boolean(reg?.customVehicleAssets?.has?.(desiredVisual));

    if (
      !this.root ||
      this.builtVisual !== desiredVisual ||
      this.builtHasCustomAsset !== hasCustomAsset
    ) {
      this._buildForVisual(desiredVisual);
    }
    if (!this.root) return;

    const team = this.arena.carTeams?.[localCarIndex] ?? localCarIndex % 2;
    this._applyTeamTint(team);

    const pose = getDesiredRespawnPose(team, selectedSlot);
    if (!pose) {
      this.root.visible = false;
      return;
    }

    applyRespawnPoseToObject3D(
      this.root,
      pose,
      this._basisFwd,
      this._basisRight,
      this._basisUp,
      this._basisMatrix
    );
    this.root.visible = true;

    if (this.wheels) {
      this.wheels.threeWheels = Boolean(
        reg?.carWheels?.[localCarIndex]?.threeWheels || desiredVisual === 'hitbox-psyclops'
      );
    }

    updateCarSuspensionAndSteering(
      this.wheels,
      this.wheelSpecs,
      this.suspension,
      this.wheelSpin,
      this._dummyGroundView,
      desiredVisual,
      dt,
      0
    );
  }

  _disposeRoot() {
    if (!this.root) return;
    if (this.scene) {
      this.scene.remove(this.root);
    }
    for (const mat of this.materials) {
      mat?.dispose?.();
    }
    for (const lmat of this.lineMaterials) {
      lmat?.dispose?.();
    }
    this.materials = [];
    this.lineMaterials = [];
    this.wheels = [];
    this.root = null;
    this.builtVisual = null;
    this.builtHasCustomAsset = false;
    this.activeTeam = -1;
  }

  dispose() {
    this._disposeRoot();
  }
}
