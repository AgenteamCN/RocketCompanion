/**
 * NetworkSimulator.ts
 * Network conditions simulator: latency, jitter, packet loss, RTT measurements, and packet queuing.
 */

export interface NetworkSimulatorOptions {
  extraLatencyMs?: number;
  extraUplinkMs?: number;
  extraDownlinkMs?: number;
  jitterMs?: number;
  packetLossRate?: number;
  pingIntervalMs?: number;
  isLoopback?: boolean;
  burstDropEnabled?: boolean;
  burstPeriodMs?: number;
  burstDurationMs?: number;
}

export interface NetworkSimulatorStats {
  packetsSent: number;
  packetsReceived: number;
  packetsDropped: number;
  bytesSent: number;
  bytesReceived: number;
  pingsSent: number;
  pongsReceived: number;
}

export type SimulatedPayload =
  Uint8Array | ArrayBuffer | string | Record<string, unknown> | unknown;

export class NetworkSimulator {
  extraUplinkMs: number;
  extraDownlinkMs: number;
  jitterMs: number;
  packetLossRate: number;
  pingIntervalMs: number;
  isLoopback: boolean;
  inboundQueue: SimulatedPayload[] = [];
  outboundQueue: Array<{ payload: SimulatedPayload; deliverAt: number }> = [];
  baseMeasuredRttMs = 0;
  measuredRttMs = 0;
  measuredJitterMs = 0;
  lastPingSentTime = 0;
  dropNextPacket = false;
  packetsToDrop = 0;
  customJitterActive = false;
  blackoutUntilMs = 0;
  burstDropEnabled: boolean;
  burstPeriodMs: number;
  burstDurationMs: number;
  stats: NetworkSimulatorStats;

  constructor(options: NetworkSimulatorOptions = {}) {
    const initialSymmetric = options.extraLatencyMs ?? 0;
    this.extraUplinkMs = Math.max(0, Number(options.extraUplinkMs ?? initialSymmetric) || 0);
    this.extraDownlinkMs = Math.max(0, Number(options.extraDownlinkMs ?? initialSymmetric) || 0);
    this.jitterMs = options.jitterMs ?? 2;
    this.packetLossRate = options.packetLossRate ?? 0.0;
    this.pingIntervalMs = options.pingIntervalMs ?? 500;
    this.isLoopback = Boolean(options.isLoopback);

    this.burstDropEnabled = Boolean(options.burstDropEnabled ?? false);
    this.burstPeriodMs = Math.max(1, Math.floor(Number(options.burstPeriodMs) || 2000));
    this.burstDurationMs = Math.max(
      0,
      Math.min(this.burstPeriodMs - 1, Math.floor(Number(options.burstDurationMs) || 750))
    );

    this.stats = {
      packetsSent: 0,
      packetsReceived: 0,
      packetsDropped: 0,
      bytesSent: 0,
      bytesReceived: 0,
      pingsSent: 0,
      pongsReceived: 0,
    };
  }

  static clonePayload<T>(packet: T): T {
    if (packet instanceof Uint8Array) {
      return new Uint8Array(packet) as unknown as T;
    }
    if (packet instanceof ArrayBuffer) {
      return packet.slice(0) as unknown as T;
    }
    if (ArrayBuffer.isView(packet)) {
      return new Uint8Array(
        packet.buffer.slice(packet.byteOffset, packet.byteOffset + packet.byteLength)
      ) as unknown as T;
    }
    return packet;
  }

  clonePayload<T>(packet: T): T {
    return NetworkSimulator.clonePayload(packet);
  }

  getPayloadByteLength(packet: SimulatedPayload): number {
    if (!packet) return 0;
    if (typeof (packet as { byteLength?: number }).byteLength === 'number') {
      return (packet as { byteLength: number }).byteLength;
    }
    if (typeof packet === 'string') return packet.length;
    return 0;
  }

  get extraRttMs(): number {
    return this.extraUplinkMs + this.extraDownlinkMs;
  }

  get extraLatencyMs(): number {
    return Math.round((this.extraUplinkMs + this.extraDownlinkMs) * 0.5);
  }

  set extraLatencyMs(val: number) {
    this.setExtraLatency(val);
  }

  _recomputeMeasuredRtt(): void {
    if (this.isLoopback) {
      this.measuredRttMs = this.extraRttMs;
    } else {
      this.measuredRttMs = (this.baseMeasuredRttMs || 0) + this.extraRttMs;
    }
  }

  setExtraUplinkLatency(uplinkMs: number): void {
    const val = Number(uplinkMs);
    if (!Number.isFinite(val)) {
      throw new Error(
        `[P2PWebRTCChannel] setExtraUplinkLatency called with non-finite value: ${uplinkMs}`
      );
    }
    this.extraUplinkMs = Math.max(0, val);
    this._recomputeMeasuredRtt();
  }

  setExtraDownlinkLatency(downlinkMs: number): void {
    const val = Number(downlinkMs);
    if (!Number.isFinite(val)) {
      throw new Error(
        `[P2PWebRTCChannel] setExtraDownlinkLatency called with non-finite value: ${downlinkMs}`
      );
    }
    this.extraDownlinkMs = Math.max(0, val);
    this._recomputeMeasuredRtt();
  }

  setAsymmetricLatency(uplinkMs: number, downlinkMs: number): void {
    const upVal = Number(uplinkMs);
    const downVal = Number(downlinkMs);
    if (!Number.isFinite(upVal) || !Number.isFinite(downVal)) {
      throw new Error(
        `[P2PWebRTCChannel] setAsymmetricLatency called with non-finite value: ${uplinkMs}, ${downlinkMs}`
      );
    }
    this.extraUplinkMs = Math.max(0, upVal);
    this.extraDownlinkMs = Math.max(0, downVal);
    this._recomputeMeasuredRtt();
  }

  setExtraLatency(extraLatencyMs: number): void {
    const val = Number(extraLatencyMs);
    if (!Number.isFinite(val)) {
      throw new Error(
        `[P2PWebRTCChannel] setExtraLatency called with non-finite value: ${extraLatencyMs}`
      );
    }
    const clamped = Math.max(0, val);
    this.extraUplinkMs = clamped;
    this.extraDownlinkMs = clamped;
    this._recomputeMeasuredRtt();
  }

  setLatency(latencyMs: number): void {
    this.setExtraLatency(latencyMs);
  }

  get latencyMs(): number {
    return Math.round(this.rttMs * 0.5);
  }

  setRtt(rttMs: number): void {
    const val = Number(rttMs);
    if (!Number.isFinite(val)) {
      throw new Error(`[P2PWebRTCChannel] setRtt called with non-finite value: ${rttMs}`);
    }
    this.setExtraLatency(Math.round(val * 0.5));
  }

  get rttMs(): number {
    if (this.isLoopback) {
      return Math.round(this.extraRttMs);
    }
    if (this.measuredRttMs > 0) {
      if (!Number.isFinite(this.measuredRttMs)) {
        throw new Error(
          `[P2PWebRTCChannel] measuredRttMs corrupted to non-finite: ${this.measuredRttMs}`
        );
      }
      return Math.round(this.measuredRttMs);
    }
    const derived = this.extraRttMs;
    if (!Number.isFinite(derived)) {
      throw new Error(`[P2PWebRTCChannel] extraRttMs corrupted to non-finite: ${this.extraRttMs}`);
    }
    return Math.round(derived);
  }

  set rttMs(val: number) {
    const num = Number(val);
    if (!Number.isFinite(num)) {
      throw new Error(`[P2PWebRTCChannel] set rttMs called with non-finite value: ${val}`);
    }
    this.measuredRttMs = Math.max(0, num);
    this.baseMeasuredRttMs = this.isLoopback
      ? 0
      : Math.max(0, this.measuredRttMs - this.extraRttMs);
  }

  setPacketLossRate(rate: number): void {
    this.packetLossRate = Math.min(1.0, Math.max(0.0, Number(rate) || 0));
  }

  setBurstDrop(
    periodMs = this.burstPeriodMs,
    durationMs = this.burstDurationMs,
    enabled = this.burstDropEnabled
  ): void {
    const safePeriod = Math.max(1, Math.floor(Number(periodMs) || 2000));
    const safeDuration = Math.max(0, Math.min(safePeriod - 1, Math.floor(Number(durationMs) || 0)));
    this.burstPeriodMs = safePeriod;
    this.burstDurationMs = safeDuration;
    if (enabled !== undefined) {
      this.burstDropEnabled = Boolean(enabled);
    }
  }

  setBurstDropEnabled(enabled: boolean): boolean {
    this.burstDropEnabled = Boolean(enabled);
    return this.burstDropEnabled;
  }

  toggleBurstDrop(forceEnabled?: boolean): boolean {
    this.burstDropEnabled =
      forceEnabled !== undefined ? Boolean(forceEnabled) : !this.burstDropEnabled;
    if (this.burstDropEnabled && this.burstDurationMs <= 0) {
      this.burstDurationMs = Math.min(
        this.burstPeriodMs - 1,
        Math.max(1, Math.floor(this.burstPeriodMs * 0.375))
      );
    }
    return this.burstDropEnabled;
  }

  isInPeriodicBurstDropWindow(nowMs = performance.now()): boolean {
    if (this.burstDropEnabled && this.burstPeriodMs > 0 && this.burstDurationMs > 0) {
      const clampedDuration = Math.min(this.burstDurationMs, this.burstPeriodMs - 1);
      const phase = ((nowMs % this.burstPeriodMs) + this.burstPeriodMs) % this.burstPeriodMs;
      return phase < clampedDuration;
    }
    return false;
  }

  setJitter(jitterMs: number): void {
    const val = Number(jitterMs);
    if (!Number.isFinite(val)) {
      throw new Error(`[P2PWebRTCChannel] setJitter called with non-finite value: ${jitterMs}`);
    }
    this.jitterMs = Math.max(0, Math.min(200, val));
    this.customJitterActive = this.jitterMs > 0;
  }

  triggerBlackout(durationMs: number, nowMs = performance.now()): void {
    const dur = Math.max(0, Number(durationMs) || 0);
    this.blackoutUntilMs = dur > 0 ? nowMs + dur : 0;
  }

  clearBlackout(): void {
    this.blackoutUntilMs = 0;
  }

  forceDropNextInput(count = 5): void {
    this.packetsToDrop = count;
    this.dropNextPacket = true;
  }

  dropSinglePacket(): void {
    this.forceDropNextInput(1);
  }

  shouldDropOnSend(nowMs = performance.now()): boolean {
    if (this.blackoutUntilMs > nowMs || this.isInPeriodicBurstDropWindow(nowMs)) {
      this.stats.packetsDropped++;
      return true;
    }
    if (this.dropNextPacket || this.packetsToDrop > 0) {
      if (this.packetsToDrop > 0) this.packetsToDrop--;
      this.dropNextPacket = false;
      this.stats.packetsDropped++;
      return true;
    }
    if (this.packetLossRate > 0 && Math.random() < this.packetLossRate) {
      this.stats.packetsDropped++;
      return true;
    }
    return false;
  }

  shouldDropOnReceive(nowMs = performance.now()): boolean {
    if (
      this.blackoutUntilMs > nowMs ||
      this.isInPeriodicBurstDropWindow(nowMs) ||
      (this.packetLossRate > 0 && Math.random() < this.packetLossRate)
    ) {
      this.stats.packetsDropped++;
      return true;
    }
    return false;
  }

  calculateUplinkDelay(): number {
    return this.extraUplinkMs > 0 || this.customJitterActive
      ? Math.max(0, this.extraUplinkMs + (Math.random() * 2 - 1) * this.jitterMs)
      : 0;
  }

  calculateDownlinkDelay(): number {
    return this.extraDownlinkMs > 0 || this.customJitterActive
      ? Math.max(0, this.extraDownlinkMs + (Math.random() * 2 - 1) * this.jitterMs)
      : 0;
  }

  calculateDelay(): number {
    return this.calculateUplinkDelay();
  }

  scheduleSend<T>(
    packet: T,
    transmitFn: (cloned: T) => boolean | void,
    nowMs = performance.now()
  ): boolean {
    this.stats.packetsSent++;
    if (this.shouldDropOnSend(nowMs)) return false;

    const cloned = this.clonePayload(packet);
    const byteLen = this.getPayloadByteLength(cloned);

    const doTransmit = (): boolean => {
      const dispatched = transmitFn(cloned);
      if (dispatched !== false && byteLen > 0) {
        this.stats.bytesSent += byteLen;
      }
      return dispatched !== false;
    };

    const delay = this.calculateUplinkDelay();
    if (delay > 0) {
      const deliverAt = nowMs + delay;
      const entry = { payload: cloned, deliverAt };
      this.outboundQueue.push(entry);
      setTimeout(() => {
        const idx = this.outboundQueue.indexOf(entry);
        if (idx !== -1) this.outboundQueue.splice(idx, 1);
        doTransmit();
      }, delay);
      return true;
    }

    return doTransmit();
  }

  receivePayload<T>(
    payload: T,
    onDeliver?: ((delivered: T) => void) | null,
    nowMs = performance.now()
  ): boolean {
    if (!payload) return false;
    const cloned = this.clonePayload(payload);
    if (cloned instanceof ArrayBuffer || cloned instanceof Uint8Array) {
      this.stats.bytesReceived += cloned.byteLength;
    }

    if (this.shouldDropOnReceive(nowMs)) return false;

    const delay = this.calculateDownlinkDelay();
    const deliverAt = delay > 0 ? nowMs + delay : 0;

    if (deliverAt === 0) {
      this.inboundQueue.push(cloned);
      onDeliver?.(cloned);
    } else {
      this.inboundQueue.push({ payload: cloned, deliverAt });
      setTimeout(() => {
        onDeliver?.(cloned);
      }, delay);
    }
    return true;
  }

  handlePong(sendTime: number, now = performance.now()): void {
    if (typeof sendTime !== 'number' || !Number.isFinite(sendTime)) {
      throw new Error(
        `[P2PWebRTCChannel] Received invalid pong sendTime: ${sendTime}. Expected finite number.`
      );
    }
    const sample = Math.max(0, now - sendTime);
    const simulatedRtt = this.extraRttMs;
    const baseSample = this.isLoopback ? 0 : Math.max(0, sample - simulatedRtt);
    this.stats.pongsReceived++;
    if (this.stats.pongsReceived === 1 && this.measuredRttMs === 0) {
      this.baseMeasuredRttMs = baseSample;
      this.measuredRttMs = this.baseMeasuredRttMs + simulatedRtt;
    } else {
      const prevRtt = this.baseMeasuredRttMs + simulatedRtt;
      const diff = Math.abs(sample - prevRtt);
      this.baseMeasuredRttMs = this.isLoopback
        ? 0
        : this.baseMeasuredRttMs * 0.85 + baseSample * 0.15;
      this.measuredRttMs = this.baseMeasuredRttMs + simulatedRtt;
      this.measuredJitterMs = this.measuredJitterMs * 0.85 + diff * 0.15;
    }
  }

  drainInboundQueue(nowMs = performance.now()): SimulatedPayload[] {
    const delivered: SimulatedPayload[] = [];
    const remaining: SimulatedPayload[] = [];

    for (let i = 0; i < this.inboundQueue.length; i++) {
      const item = this.inboundQueue[i] as { deliverAt?: number; payload?: SimulatedPayload };
      if (item && item.deliverAt !== undefined) {
        if (item.deliverAt <= nowMs) {
          delivered.push(item.payload);
        } else {
          remaining.push(item);
        }
      } else {
        delivered.push(item);
      }
    }

    this.inboundQueue.length = 0;
    if (remaining.length > 0) {
      this.inboundQueue.push(...remaining);
    }
    return delivered;
  }

  reset(): void {
    this.inboundQueue.length = 0;
    this.outboundQueue.length = 0;
    this.baseMeasuredRttMs = 0;
    this.measuredRttMs = 0;
    this.measuredJitterMs = 0;
    this.lastPingSentTime = 0;
    this.dropNextPacket = false;
    this.packetsToDrop = 0;
    this.customJitterActive = false;
    this.blackoutUntilMs = 0;
    this.stats = {
      packetsSent: 0,
      packetsReceived: 0,
      packetsDropped: 0,
      bytesSent: 0,
      bytesReceived: 0,
      pingsSent: 0,
      pongsReceived: 0,
    };
  }
}
