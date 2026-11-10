/**
 * Bridges Gameplay/Match orchestration with:
 * - ArenaWorld (Three.js Visual Entity Hierarchy)
 * - RocketSimPhysicsEngine (Deterministic 120Hz WASM Physics)
 *
 * Architecture & Responsibilities:
 * 1. Decouples Controller possession (Player, AI Bot, Network Client) from Vehicle Pawns.
 * 2. Unified Pawn Lifecycle: spawnVehicle, despawnVehicle, replaceVehicle, hotSwapVehicle.
 * 3. Shared across Single Player (direct zero-latency physics) and Multiplayer (authoritative session).
 * 4. Enables zero-reload in-place vehicle hot-swapping without resetting match state.
 */

export interface EntityPhysicsPort {
  numCars: number;
  addCar(team: number, hitbox?: string): unknown;
  removeCar?(slot: number): void;
  setCarHitbox?(slot: number, hitbox: string): void;
}

export interface EntityVehicleRegistryPort {
  addCar(team: number, visual?: string, targetIndex?: number | null): unknown;
  removeCar(slot: number): boolean;
  swapCarVisual(slot: number, visual: string): boolean;
}

export interface EntityArenaPort {
  cars?: unknown[];
  vehicleRegistry?: EntityVehicleRegistryPort;
  addCar?(team: number, visual?: string): unknown;
  removeCar?(slot: number): void;
  swapCarVisual?(slot: number, visual: string): void;
}

export interface EntityManagerOptions {
  physics?: EntityPhysicsPort | null;
  arena?: EntityArenaPort | null;
}

export interface SpawnVehicleOptions {
  team?: number;
  visual?: string;
  hitbox?: string;
  isPlayer?: boolean;
  isBot?: boolean;
  controller?: unknown;
}

export interface HotSwapVehicleOptions {
  visual?: string;
  hitbox?: string;
}

export interface EntityDescriptor {
  slot: number;
  team: number;
  visual: string;
  hitbox: string;
  isPlayer: boolean;
  isBot: boolean;
  controller: unknown;
}

export class EntityManager {
  public arena: EntityArenaPort | null;
  public entities: Map<number, EntityDescriptor>;
  public physics: EntityPhysicsPort | null;

  constructor(options: EntityManagerOptions = {}) {
    this.physics = options.physics || null;
    this.arena = options.arena || null;
    this.entities = new Map();
  }

  setPhysics(physics: EntityPhysicsPort | null) {
    this.physics = physics;
  }

  setArena(arena: EntityArenaPort | null) {
    this.arena = arena;
  }

  /**
   * Spawn a new vehicle entity in both physics simulation and visual arena
   */
  spawnVehicle(slot: number, options: SpawnVehicleOptions = {}): EntityDescriptor {
    const {
      team = 0,
      visual = 'fennec',
      hitbox = visual,
      isPlayer = false,
      isBot = false,
      controller = null,
    } = options;

    // 1. Ensure physics entity exists
    const physicsPort = this.physics;
    if (physicsPort && physicsPort.numCars <= slot) {
      while (physicsPort.numCars <= slot) {
        const t = physicsPort.numCars === slot ? team : slot === 0 ? 0 : 1;
        physicsPort.addCar(t, hitbox);
      }
    }

    // 2. Ensure visual representation exists in ArenaWorld
    const arenaPort = this.arena;
    if (arenaPort && (!arenaPort.cars || !arenaPort.cars[slot])) {
      if (arenaPort.vehicleRegistry) {
        arenaPort.vehicleRegistry.addCar(team, visual, slot);
      } else if (arenaPort.addCar) {
        arenaPort.addCar(team, visual);
      }
    }

    const entity: EntityDescriptor = {
      slot,
      team,
      visual,
      hitbox,
      isPlayer,
      isBot,
      controller,
    };

    this.entities.set(slot, entity);
    return entity;
  }

  /**
   * Despawn a vehicle entity from both physics simulation and visual scene
   */
  despawnVehicle(slot: number): boolean {
    const entity = this.entities.get(slot);
    if (!entity) return false;

    // 1. Release controller
    entity.controller = null;

    // 2. Remove from visual scene
    const arenaPort = this.arena;
    if (arenaPort?.vehicleRegistry) {
      arenaPort.vehicleRegistry.removeCar(slot);
    } else if (arenaPort?.removeCar) {
      arenaPort.removeCar(slot);
    }

    // 3. Remove from physics simulation
    const physicsPort = this.physics;
    if (physicsPort?.removeCar) {
      physicsPort.removeCar(slot);
    }

    this.entities.delete(slot);
    return true;
  }

  /**
   * In-place Hot Swap: Update visual appearance and physical hitbox without restarting arena
   */
  hotSwapVehicle(slot: number, options: HotSwapVehicleOptions = {}): boolean {
    const entity = this.entities.get(slot);
    const newVisual = options.visual || entity?.visual || 'fennec';
    const newHitbox = options.hitbox || options.visual || entity?.hitbox || 'default';

    // 1. Visual hot-swap in ArenaWorld (in-place mesh and wheel updates)
    const arenaPort = this.arena;
    if (arenaPort?.vehicleRegistry) {
      arenaPort.vehicleRegistry.swapCarVisual(slot, newVisual);
    } else if (arenaPort?.swapCarVisual) {
      arenaPort.swapCarVisual(slot, newVisual);
    }

    // 2. Physics hitbox hot-swap in RocketSim WASM
    const physicsPort = this.physics;
    if (physicsPort?.setCarHitbox) {
      physicsPort.setCarHitbox(slot, newHitbox);
    }

    if (entity) {
      entity.visual = newVisual;
      entity.hitbox = newHitbox;
    } else {
      this.entities.set(slot, {
        slot,
        team: slot === 0 ? 0 : 1,
        visual: newVisual,
        hitbox: newHitbox,
        isPlayer: slot === 0,
        isBot: slot > 0,
        controller: null,
      });
    }

    return true;
  }

  /**
   * Possess a vehicle with a controller
   */
  possess(controller: unknown, slot: number): void {
    const entity = this.entities.get(slot);
    if (entity) {
      entity.controller = controller;
    }
  }

  /**
   * Unpossess a vehicle
   */
  unpossess(slot: number): void {
    const entity = this.entities.get(slot);
    if (entity) {
      entity.controller = null;
    }
  }

  getVehicle(slot: number): EntityDescriptor | undefined {
    return this.entities.get(slot);
  }

  hasVehicle(slot: number): boolean {
    return this.entities.has(slot);
  }

  get activeVehicleCount(): number {
    return this.entities.size;
  }

  dispose() {
    for (const slot of Array.from(this.entities.keys())) {
      this.despawnVehicle(slot);
    }
    this.entities.clear();
  }
}
