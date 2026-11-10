/**
 * RocketSimCarMutatorController.ts
 * Domain base layer managing per-car roster specs, three-wheel mode, boost & flip mutators,
 * arena mutator config, and demo respawn timers directly over WASM state views.
 */

import { getHitboxIndex } from './RocketSimMeshLoader.ts';
import { setCarTeamInWasm } from './RocketSimEntityStateMutator.ts';
import {
  readWasmMutatorConfig,
  writeWasmMutatorConfig,
  type ArenaMutatorConfig,
} from './mutatorConfigPipeline.ts';
import { RocketSimWasmStateAndReplayBase } from './RocketSimWasmStateAndReplayBase.ts';

export class RocketSimCarMutatorController extends RocketSimWasmStateAndReplayBase {
  readonly carMutators = this;

  private _recordAddedCar(idx: number, team: number, hitboxIdx: number): number {
    if (idx >= 0) {
      const isThreeWheels = hitboxIdx === 6;
      this.carSpecs[idx] = {
        team: team ? 1 : 0,
        hitboxIndex: hitboxIdx,
        threeWheels: isThreeWheels,
      };
      if (isThreeWheels) {
        this.setCarThreeWheels(idx, true);
      }
    }
    return idx;
  }

  public addCar(team: number, hitboxType: string | number = 'octane'): number {
    const mod = this.module;
    if (!mod) return -1;
    const hitboxIdx = getHitboxIndex(hitboxType);
    return this._recordAddedCar(mod._physics_addCar(team, hitboxIdx), team, hitboxIdx);
  }

  public addCarAtSlot(
    carIndex: number,
    team: number,
    hitboxType: string | number = 'octane'
  ): number {
    const slot = Number(carIndex) | 0;
    if (slot < 0 || slot >= 8) return -1;
    const hitboxIdx = getHitboxIndex(hitboxType);
    if (this.isCarSlotActive(slot)) {
      const prevSpec = this.carSpecs[slot];
      const nextTeam = team ? 1 : 0;
      if (!prevSpec || prevSpec.team !== nextTeam) this.setCarTeam(slot, nextTeam);
      if (!prevSpec || prevSpec.hitboxIndex !== hitboxIdx) this.setCarHitbox(slot, hitboxType);
      this.carSpecs[slot] = {
        team: nextTeam,
        hitboxIndex: hitboxIdx,
        threeWheels: hitboxIdx === 6 || (prevSpec?.threeWheels ?? false),
      };
      return slot;
    }
    const mod = this.module;
    if (mod && typeof mod._physics_addCarAtSlot === 'function') {
      return this._recordAddedCar(
        mod._physics_addCarAtSlot(slot, team, hitboxIdx),
        team,
        hitboxIdx
      );
    }
    return this.addCar(team, hitboxType);
  }

  public removeCar(carIndex: number): boolean {
    const mod = this.module;
    if (!mod) return false;
    const slot = Number(carIndex) | 0;
    const ok = mod._physics_removeCar(slot) === 1;
    if (ok && slot >= 0 && slot < 8) {
      this.carSpecs[slot] = null;
    }
    return ok;
  }

  public getActiveCarMask(): number {
    const mod = this.module;
    if (mod && typeof mod._physics_getActiveCarMask === 'function') {
      return mod._physics_getActiveCarMask() & 0xff;
    }
    let mask = 0;
    const n = Math.min(8, this.numCars || 0);
    for (let i = 0; i < n; i++) {
      if (this.carSpecs[i] !== null) mask |= 1 << i;
    }
    return mask;
  }

  public isCarSlotActive(carIndex: number): boolean {
    const slot = Number(carIndex) | 0;
    if (slot < 0 || slot >= 8) return false;
    const mod = this.module;
    if (mod && typeof mod._physics_isCarSlotActive === 'function') {
      return mod._physics_isCarSlotActive(slot) === 1;
    }
    return (this.getActiveCarMask() & (1 << slot)) !== 0;
  }

  public setCarHitbox(carIndex: number, hitboxType: string | number): boolean {
    const mod = this.module;
    if (!mod) return false;
    const hitboxIdx = getHitboxIndex(hitboxType);
    const isThreeWheels = hitboxIdx === 6;
    const ok = mod._physics_setCarHitbox(carIndex, hitboxIdx) === 1;
    if (ok && this.carSpecs[carIndex]) {
      this.carSpecs[carIndex]!.hitboxIndex = hitboxIdx;
      this.carSpecs[carIndex]!.threeWheels = isThreeWheels;
    }
    this.setCarThreeWheels(carIndex, isThreeWheels);
    return ok;
  }

  public setCarTeam(carIndex: number, team: number): boolean {
    if (!this.module) return false;
    const slot = Number(carIndex) | 0;
    const normalizedTeam = team ? 1 : 0;
    const spec = this.carSpecs[slot];
    if (spec && spec.team === normalizedTeam) return true;
    const hitboxIdx = spec?.hitboxIndex ?? 0;
    const ok = setCarTeamInWasm(this.module, slot, normalizedTeam, hitboxIdx, this);
    if (ok && slot >= 0 && slot < 8) {
      this.carSpecs[slot] = {
        team: normalizedTeam,
        hitboxIndex: hitboxIdx,
        threeWheels: spec?.threeWheels ?? false,
      };
    }
    return ok;
  }

  public demolishCar(carIndex: number, respawnDelay = 3.0): boolean {
    const mod = this.module;
    if (!mod) return false;
    return mod._physics_demolishCar(carIndex, respawnDelay) === 1;
  }

  public setCarLinearFactorAndGravity(
    carIndex: number,
    fx = 1.0,
    fy = 1.0,
    fz = 1.0,
    gravityScale = 1.0
  ): boolean {
    const mod = this.module;
    if (!mod) return false;
    return mod._physics_setCarLinearFactorAndGravity(carIndex, fx, fy, fz, gravityScale) === 1;
  }

  public setCarCollisionMask(carIndex: number, ball = true, cars = true): boolean {
    const mod = this.module;
    if (!mod) return false;
    return mod._physics_setCarCollisionMask(carIndex, ball ? 1 : 0, cars ? 1 : 0) === 1;
  }

  public setCarThreeWheels(carIndex = 0, enabled = true): boolean {
    const mod = this.module;
    if (!mod) return false;
    const ok = mod._physics_setCarThreeWheels(carIndex, enabled ? 1 : 0) === 1;
    if (ok && this.carSpecs[carIndex]) {
      this.carSpecs[carIndex]!.threeWheels = Boolean(enabled);
    }
    return ok;
  }

  public getCarThreeWheels(carIndex = 0): boolean {
    const mod = this.module;
    if (!mod) return false;
    return mod._physics_getCarThreeWheels(carIndex) === 1;
  }

  public setUnlimitedBoost(unlimited: boolean): void {
    const flag = Boolean(unlimited);
    this.isUnlimitedBoost = flag;
    const mod = this.module;
    if (mod) {
      mod._physics_setUnlimitedBoost(flag ? 1 : 0);
    }
  }

  public getUnlimitedBoost(): boolean {
    const mod = this.module;
    if (mod && typeof mod._physics_getUnlimitedBoost === 'function') {
      return mod._physics_getUnlimitedBoost() === 1;
    }
    return Boolean(this.isUnlimitedBoost);
  }

  public setCarUnlimitedBoost(carIndex: number, enabled: boolean): void {
    const flag = Boolean(enabled);
    const mod = this.module;
    if (mod) {
      mod._physics_setCarUnlimitedBoost(carIndex, flag ? 1 : 0);
    }
    if (carIndex === 0) {
      this.isUnlimitedBoost = flag;
    }
  }

  public getCarUnlimitedBoost(carIndex = 0): boolean {
    const mod = this.module;
    if (mod && typeof mod._physics_getCarUnlimitedBoost === 'function') {
      return mod._physics_getCarUnlimitedBoost(carIndex) === 1;
    }
    return Boolean(this.isUnlimitedBoost);
  }

  public setCarBoostCollectable(carIndex: number, collectable: boolean): void {
    const mod = this.module;
    if (!mod) return;
    mod._physics_setCarBoostCollectable(carIndex, collectable ? 1 : 0);
  }

  public getCarBoostCollectable(carIndex = 0): boolean {
    const mod = this.module;
    if (mod && typeof mod._physics_getCarBoostCollectable === 'function') {
      return mod._physics_getCarBoostCollectable(carIndex) === 1;
    }
    return true;
  }

  public setCarBoostRecharge(carIndex: number, enabled: boolean, rate = 10.0, delay = 0.25): void {
    const mod = this.module;
    if (!mod) return;
    mod._physics_setCarBoostRecharge(carIndex, enabled ? 1 : 0, Number(rate), Number(delay));
  }

  public getCarBoostRechargeEnabled(carIndex = 0): boolean {
    const mod = this.module;
    if (!mod) return false;
    return mod._physics_getCarBoostRechargeEnabled(carIndex) === 1;
  }

  public getCarBoostRechargePerSecond(carIndex = 0): number {
    const mod = this.module;
    if (!mod) return 10.0;
    return mod._physics_getCarBoostRechargePerSecond(carIndex);
  }

  public getCarBoostRechargeDelay(carIndex = 0): number {
    const mod = this.module;
    if (!mod) return 0.25;
    return mod._physics_getCarBoostRechargeDelay(carIndex);
  }

  public getCarMaxFlipCount(carIndex = 0): number {
    const mod = this.module;
    if (!mod) return 1;
    return mod._physics_getCarMaxFlipCount(carIndex);
  }

  public setArenaMutators({
    gravityZ = -650.0,
    boostAccelGround = -1.0,
    boostAccelAir = -1.0,
    ballMaxSpeed = -1.0,
    ballBounciness = -1.0,
  } = {}): boolean {
    const mod = this.module;
    if (!mod) return false;
    return (
      mod._physics_setArenaMutators(
        gravityZ,
        boostAccelGround,
        boostAccelAir,
        ballMaxSpeed,
        ballBounciness
      ) === 1
    );
  }

  public getMutatorConfig(): ArenaMutatorConfig {
    return readWasmMutatorConfig(this.module);
  }

  public setMutatorConfig(config: Partial<ArenaMutatorConfig> | Float32Array): boolean {
    if (!this.module) return false;
    return writeWasmMutatorConfig(this.module, config);
  }

  public resetMutatorConfig(): boolean {
    const mod = this.module;
    if (!mod) return false;
    return mod._physics_resetMutatorConfig() === 1;
  }

  public respawnCar(carIndex: number, seed = -1, boostAmount = 33.33): boolean {
    const mod = this.module;
    if (!mod) return false;
    const effectiveSeed =
      typeof seed === 'number' && seed >= 0
        ? seed | 0
        : ((this.getCurrentTick() + ((carIndex | 0) + 1) * 17) & 0x7fffffff) | 0;
    return mod._physics_respawnCar(carIndex, effectiveSeed, boostAmount) === 1;
  }

  public setCarDemoSpawnSelection(carIndex = 0, slotIndex = -1): boolean {
    const mod = this.module;
    if (!mod) return false;
    return mod._physics_setCarDemoSpawnSelection(carIndex, Math.trunc(slotIndex)) === 1;
  }

  public getCarDemoSpawnSelection(carIndex = 0): number {
    const mod = this.module;
    if (mod && typeof mod._physics_getCarDemoSpawnSelection === 'function') {
      return mod._physics_getCarDemoSpawnSelection(carIndex);
    }
    return this.module ? this.getCarStateView(carIndex).demoSpawnSelection : -1;
  }

  public getCarDemoRespawnTimer(carIndex = 0): number {
    const mod = this.module;
    if (mod && typeof mod._physics_getCarDemoRespawnTimer === 'function') {
      return mod._physics_getCarDemoRespawnTimer(carIndex);
    }
    return this.module ? this.getCarStateView(carIndex).demoRespawnTimer : 0;
  }
}
