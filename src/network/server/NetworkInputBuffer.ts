/**
 * src/network/server/NetworkInputBuffer.ts
 * Network-layer input buffering subsystem decoupled from PhysicsEngineManager.
 */

export const MAX_INPUT_BUFFER_TICKS = 128;

export interface CarControls {
  throttle: number;
  steer: number;
  pitch: number;
  yaw: number;
  roll: number;
  jump: boolean | number;
  boost: boolean | number;
  handbrake: boolean | number;
}

export const NEUTRAL_CONTROLS: Readonly<CarControls> = Object.freeze({
  throttle: 0,
  steer: 0,
  pitch: 0,
  yaw: 0,
  roll: 0,
  jump: false,
  boost: false,
  handbrake: false,
});

export class NetworkInputBuffer {
  maxBufferTicks: number;
  carInputBuffers = new Map<number, Map<number, Partial<CarControls>>>();
  maxReceivedTickByCar = new Map<number, number>();
  starvationCounts = new Map<number, number>();
  consecutiveStarvationCounts = new Map<number, number>();
  staleCars = new Set<number>();
  isPaused = false;
  lobbyMode = false;
  private lobbyLoggedCars = new Set<number>();

  constructor(maxBufferTicks = MAX_INPUT_BUFFER_TICKS) {
    this.maxBufferTicks = maxBufferTicks;
  }

  setLobbyMode(enabled: boolean): void {
    this.lobbyMode = Boolean(enabled);
    if (!this.lobbyMode) {
      this.lobbyLoggedCars.clear();
      this.starvationCounts.clear();
      this.consecutiveStarvationCounts.clear();
    }
  }

  registerCar(carIndex: number): void {
    if (!this.carInputBuffers.has(carIndex)) {
      this.carInputBuffers.set(carIndex, new Map());
    }
    this.staleCars.delete(carIndex);
    this.starvationCounts.delete(carIndex);
    this.consecutiveStarvationCounts.delete(carIndex);
  }

  unregisterCar(carIndex: number): void {
    this.carInputBuffers.delete(carIndex);
    this.maxReceivedTickByCar.delete(carIndex);
    this.starvationCounts.delete(carIndex);
    this.consecutiveStarvationCounts.delete(carIndex);
    this.staleCars.delete(carIndex);
  }

  setCarInputStale(carIndex: number, isStale: boolean): void {
    if (isStale) {
      this.staleCars.add(carIndex);
    } else {
      this.staleCars.delete(carIndex);
      this.starvationCounts.delete(carIndex);
      this.consecutiveStarvationCounts.delete(carIndex);
    }
  }

  isCarInputStale(carIndex: number): boolean {
    return this.staleCars.has(carIndex);
  }

  pushInput(
    carIndex: number,
    currentTick: number,
    targetTick: number,
    controls: Partial<CarControls>
  ): boolean {
    if (typeof targetTick !== 'number' || !Number.isFinite(targetTick)) return false;
    this.staleCars.delete(carIndex);
    this.starvationCounts.delete(carIndex);
    this.consecutiveStarvationCounts.delete(carIndex);

    const prevMax = this.maxReceivedTickByCar.get(carIndex);
    if (prevMax === undefined || targetTick > prevMax) {
      this.maxReceivedTickByCar.set(carIndex, targetTick);
    }
    if (targetTick < currentTick) {
      return false;
    }
    if (targetTick - currentTick > this.maxBufferTicks) return false;

    let buf = this.carInputBuffers.get(carIndex);
    if (!buf) {
      buf = new Map();
      this.carInputBuffers.set(carIndex, buf);
    }
    if (buf.has(targetTick)) {
      return false;
    }

    buf.set(targetTick, { ...controls });
    return true;
  }

  pushRedundantInputs(
    carIndex: number,
    currentTick: number,
    inputList: Array<{
      tick?: number;
      targetTick?: number;
      controls?: Partial<CarControls>;
    }>
  ): number {
    if (!Array.isArray(inputList) || inputList.length === 0) return 0;
    this.staleCars.delete(carIndex);
    this.starvationCounts.delete(carIndex);
    this.consecutiveStarvationCounts.delete(carIndex);
    let accepted = 0;
    for (let i = 0; i < inputList.length; i++) {
      const item = inputList[i];
      const tick = item?.tick ?? item?.targetTick;
      if (item && typeof tick === 'number' && item.controls) {
        if (this.pushInput(carIndex, currentTick, tick, item.controls)) {
          accepted++;
        }
      }
    }
    return accepted;
  }

  resetStarvationState(): void {
    this.starvationCounts.clear();
    this.consecutiveStarvationCounts.clear();
    this.staleCars.clear();
  }

  peekControlsForTick(carIndex: number, tick: number): Partial<CarControls> | null {
    const buf = this.carInputBuffers.get(carIndex);
    return buf && buf.has(tick) ? buf.get(tick)! : null;
  }

  getControlsForTick(
    carIndex: number,
    tick: number,
    fallbackControls: Partial<CarControls> | null = null
  ): Partial<CarControls> {
    let buf = this.carInputBuffers.get(carIndex);
    if (buf && buf.has(tick)) {
      this.starvationCounts.delete(carIndex);
      this.consecutiveStarvationCounts.delete(carIndex);
      return buf.get(tick)!;
    }

    const isStale = this.staleCars.has(carIndex);
    const resolved: Partial<CarControls> =
      !isStale && fallbackControls ? { ...fallbackControls } : { ...NEUTRAL_CONTROLS };
    if (this.isPaused || isStale) {
      return resolved;
    }
    if (this.lobbyMode) {
      if (!this.lobbyLoggedCars.has(carIndex)) {
        this.lobbyLoggedCars.add(carIndex);
        console.info(
          `[NetworkInputBuffer] Car #${carIndex} — User input is none as expected during lobby.`
        );
      }
      return resolved;
    }
    if (!this.maxReceivedTickByCar.has(carIndex)) {
      return resolved;
    }
    if (!buf) {
      buf = new Map();
      this.carInputBuffers.set(carIndex, buf);
    }
    buf.set(tick, resolved);
    const consecutive = (this.consecutiveStarvationCounts.get(carIndex) || 0) + 1;
    this.consecutiveStarvationCounts.set(carIndex, consecutive);
    if (consecutive >= 24) {
      this.staleCars.add(carIndex);
      return resolved;
    }
    const count = (this.starvationCounts.get(carIndex) || 0) + 1;
    this.starvationCounts.set(carIndex, count);
    if (consecutive > 8 && (count <= 3 || count % 60 === 0)) {
      console.warn(
        `[NetworkInputBuffer] Input starvation for car #${carIndex} at tick #${tick} (total starvations: ${count}), falling back to ${
          !isStale && fallbackControls ? 'last acknowledged controls' : 'neutral controls'
        }`
      );
    }
    return resolved;
  }

  pruneOlderThan(tick: number): void {
    for (const buf of this.carInputBuffers.values()) {
      for (const oldTick of buf.keys()) {
        if (oldTick <= tick) {
          buf.delete(oldTick);
        }
      }
    }
  }

  getInputBufferSize(carIndex: number, currentTick: number): number {
    const buf = this.carInputBuffers.get(carIndex);
    let futureCount = 0;
    if (buf && buf.size > 0) {
      for (const tick of buf.keys()) {
        if (tick >= currentTick) futureCount++;
      }
    }
    if (futureCount > 0) {
      return Math.min(63, futureCount);
    }
    const maxReceived = this.maxReceivedTickByCar.get(carIndex);
    if (typeof maxReceived === 'number' && Number.isFinite(maxReceived) && currentTick > 0) {
      const deficit = maxReceived - (currentTick - 1);
      if (deficit < 0) {
        return Math.max(-64, Math.round(deficit));
      }
    }
    return 0;
  }

  getStarvationCount(carIndex: number): number {
    return this.starvationCounts.get(carIndex) || 0;
  }

  clear(): void {
    this.carInputBuffers.clear();
    this.maxReceivedTickByCar.clear();
    this.starvationCounts.clear();
    this.consecutiveStarvationCounts.clear();
    this.staleCars.clear();
  }
}

export default NetworkInputBuffer;
