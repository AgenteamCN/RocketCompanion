export const INPUT_STALE_NEUTRAL_THRESHOLD_MS = 1000;
export const SESSION_DISCONNECT_THRESHOLD_MS = 30000;

export const CONNECTION_HEALTH_STATES = Object.freeze({
  HEALTHY: "HEALTHY",
  STALE_NEUTRAL: "STALE_NEUTRAL",
  DISCONNECTED: "DISCONNECTED",
});

export type ConnectionHealthState =
  (typeof CONNECTION_HEALTH_STATES)[keyof typeof CONNECTION_HEALTH_STATES];

export const DIAGNOSTIC_VEHICLE_PROFILES = Object.freeze({
  BOOST_PULSE: "boost_pulse",
  QE_ROLL: "qe_roll",
  SINE_STEER: "sine_steer",
});

export const DEFAULT_DIAGNOSTIC_FLEET = Object.freeze([
  Object.freeze({
    carIndex: 6,
    team: 0,
    profile: DIAGNOSTIC_VEHICLE_PROFILES.BOOST_PULSE,
    label: "Car 6: Gravity Boost Loop (Z0=500 -> Z1=600)",
    baseAltitudeZ: 500,
    peakAltitudeZ: 600,
    spawnPos: Object.freeze({ x: -2500, y: -400, z: 500 }),
  }),
  Object.freeze({
    carIndex: 7,
    team: 1,
    profile: DIAGNOSTIC_VEHICLE_PROFILES.QE_ROLL,
    label: "Car 7: 0G Locked QE Roll (2s Periodic Roll Switch)",
    spawnPos: Object.freeze({ x: -2500, y: 400, z: 550 }),
  }),
]);

export interface NetworkStressPresetSpec {
  id: string;
  label: string;
  extraUplinkMs: number;
  extraDownlinkMs: number;
  jitterMs: number;
  packetLossPct: number;
  blackoutMs: number;
}

const makePreset = (
  id: string,
  label: string,
  extraUplinkMs: number,
  extraDownlinkMs: number,
  jitterMs: number,
  packetLossPct: number,
  blackoutMs = 0
): Readonly<NetworkStressPresetSpec> =>
  Object.freeze({ id, label, extraUplinkMs, extraDownlinkMs, jitterMs, packetLossPct, blackoutMs });

export const NETWORK_STRESS_PRESETS: Readonly<Record<string, Readonly<NetworkStressPresetSpec>>> = Object.freeze({
  IDEAL_LAN: makePreset("ideal_lan", "Ideal LAN (0ms / 0%)", 0, 0, 0, 0),
  WIFI_JITTER: makePreset("wifi_jitter", "Wi-Fi Jitter (↑15/15↓ / 18ms / 1%)", 15, 15, 18, 1),
  ASYMMETRIC_LINK: makePreset("asymmetric_link", "Asymmetric (↑10/40↓ / 6ms / 0.5%)", 10, 40, 6, 0.5),
  CROSS_REGION: makePreset("cross_region", "Cross-Region (↑40/40↓ / 8ms / 0.5%)", 40, 40, 8, 0.5),
  CELLULAR_4G: makePreset("cellular_4g", "4G Cellular (↑65/45↓ / 35ms / 5%)", 65, 45, 35, 5),
  SEVERE_SPIKE: makePreset("severe_spike", "Congestion Spike (↑90/90↓ / 60ms / 12%)", 90, 90, 60, 12),
  STALE_1S_PROBE: makePreset("stale_1s_probe", "1.2s Blackout (1s Neutral Fallback Probe)", 18, 18, 5, 0, 1200),
  DISCONNECT_30S_PROBE: makePreset("disconnect_30s_probe", "30s Timeout Sim (Disconnect Evict Probe)", 18, 18, 5, 0, 30500),
});

export const NETWORK_STRESS_PRESET_LIST: readonly Readonly<NetworkStressPresetSpec>[] = Object.freeze(
  Object.values(NETWORK_STRESS_PRESETS)
);

export interface ConnectionMetricsInput {
  rttMs?: number;
  jitterMs?: number;
  packetLossPct?: number;
  lastErrorUu?: number;
  packetAgeMs?: number;
}

export interface ConnectionQualityEvaluation {
  score: number;
  grade: "A" | "B" | "C" | "D" | "F";
  healthState: ConnectionHealthState;
  neutralFallbackActive: boolean;
  disconnectEvicted: boolean;
}

export function evaluateConnectionQuality(
  metrics: ConnectionMetricsInput = {}
): ConnectionQualityEvaluation {
  const rttMs = Math.max(0, Number(metrics.rttMs) || 0);
  const jitterMs = Math.max(0, Number(metrics.jitterMs) || 0);
  const packetLossPct = Math.max(0, Number(metrics.packetLossPct) || 0);
  const lastErrorUu = Math.max(0, Number(metrics.lastErrorUu) || 0);
  const packetAgeMs = Math.max(0, Number(metrics.packetAgeMs) || 0);

  let healthState: ConnectionHealthState = CONNECTION_HEALTH_STATES.HEALTHY;
  if (packetAgeMs >= SESSION_DISCONNECT_THRESHOLD_MS) {
    healthState = CONNECTION_HEALTH_STATES.DISCONNECTED;
  } else if (packetAgeMs >= INPUT_STALE_NEUTRAL_THRESHOLD_MS) {
    healthState = CONNECTION_HEALTH_STATES.STALE_NEUTRAL;
  }

  if (healthState === CONNECTION_HEALTH_STATES.DISCONNECTED) {
    return {
      score: 0,
      grade: "F",
      healthState,
      neutralFallbackActive: true,
      disconnectEvicted: true,
    };
  }

  const rttPenalty = Math.min(40, (rttMs / 250) * 40);
  const jitterPenalty = Math.min(25, (jitterMs / 50) * 25);
  const lossPenalty = Math.min(30, packetLossPct * 2.5);
  const errorPenalty = Math.min(15, (lastErrorUu / 120) * 15);
  const stalePenalty =
    healthState === CONNECTION_HEALTH_STATES.STALE_NEUTRAL
      ? Math.min(50, 25 + ((packetAgeMs - INPUT_STALE_NEUTRAL_THRESHOLD_MS) / 5000) * 25)
      : 0;

  const rawScore = 100 - rttPenalty - jitterPenalty - lossPenalty - errorPenalty - stalePenalty;
  const score = Math.max(0, Math.min(100, Math.round(rawScore)));

  let grade: "A" | "B" | "C" | "D" | "F" = "A";
  if (score < 40) grade = "F";
  else if (score < 58) grade = "D";
  else if (score < 74) grade = "C";
  else if (score < 88) grade = "B";

  return {
    score,
    grade,
    healthState,
    neutralFallbackActive: healthState !== CONNECTION_HEALTH_STATES.HEALTHY,
    disconnectEvicted: false,
  };
}

export interface NetworkStressSimulatorOptions {
  presetId?: string;
  extraLatencyMs?: number;
  extraUplinkMs?: number;
  extraDownlinkMs?: number;
  jitterMs?: number;
  packetLossPct?: number;
  burstDropEnabled?: boolean;
  burstPeriodMs?: number;
  burstDurationMs?: number;
  nowMs?: number;
}

export const DEFAULT_NETWORK_STRESS_CONFIG = {
  presetId: "ideal_lan",
  extraUplinkMs: 0,
  extraDownlinkMs: 0,
  jitterMs: 0,
  packetLossPct: 0,
  burstDropEnabled: false,
  burstPeriodMs: 2000,
  burstDurationMs: 750,
};

export interface NetworkStressChannelSimulatorLike {
  setAsymmetricLatency?: (uplinkMs: number, downlinkMs: number) => void;
  setJitter?: (jitterMs: number) => void;
  setBurstDrop?: (periodMs: number, durationMs: number, enabled: boolean) => void;
  triggerBlackout?: (durationMs: number, nowMs?: number) => void;
  clearBlackout?: () => void;
  jitterMs?: number;
}

export interface NetworkStressChannelTarget extends NetworkStressChannelSimulatorLike {
  simulator?: NetworkStressChannelSimulatorLike | null;
  setExtraLatency?: (latencyMs: number) => void;
  setPacketLossRate?: (lossRate: number) => void;
  forceDropNextInput?: (count: number) => void;
  extraUplinkMs?: number;
  extraDownlinkMs?: number;
  extraLatencyMs?: number;
  packetLossRate?: number;
  simulatedPacketLossPct?: number;
  burstPeriodMs?: number;
  burstDurationMs?: number;
  burstDropEnabled?: boolean;
}

const getNowMs = () => (typeof performance !== "undefined" ? performance.now() : Date.now());

const clampStressValue = (raw: unknown, name: string, max: number, round = true): number => {
  const val = Number(raw);
  if (!Number.isFinite(val)) {
    throw new Error(`[NetworkStressSimulator] Non-finite ${name}: ${raw}`);
  }
  return Math.max(0, Math.min(max, round ? Math.round(val) : Number(val.toFixed(1))));
};

export class NetworkStressSimulator {
  activePresetId: string;
  extraUplinkMs: number;
  extraDownlinkMs: number;
  jitterMs: number;
  packetLossPct: number;
  burstDropEnabled: boolean;
  burstPeriodMs: number;
  burstDurationMs: number;
  lastPacketTimestampMs: number;
  blackoutStartMs: number;
  blackoutUntilMs: number;
  simulatedStaleAgeOffsetMs: number;

  constructor(options: NetworkStressSimulatorOptions = {}) {
    this.activePresetId = options.presetId || NETWORK_STRESS_PRESETS.IDEAL_LAN.id;
    const initialSym = Math.max(0, Number(options.extraLatencyMs) || 0);
    this.extraUplinkMs = Math.max(0, Number(options.extraUplinkMs ?? initialSym) || 0);
    this.extraDownlinkMs = Math.max(0, Number(options.extraDownlinkMs ?? initialSym) || 0);
    this.jitterMs = Math.max(0, Number(options.jitterMs) || 0);
    this.packetLossPct = Math.max(0, Math.min(100, Number(options.packetLossPct) || 0));
    this.burstDropEnabled = Boolean(options.burstDropEnabled ?? false);
    this.burstPeriodMs = Math.max(1, Math.floor(Number(options.burstPeriodMs) || 2000));
    this.burstDurationMs = Math.max(
      0,
      Math.min(this.burstPeriodMs - 1, Math.floor(Number(options.burstDurationMs) || 750))
    );

    this.lastPacketTimestampMs = options.nowMs ?? getNowMs();
    this.blackoutStartMs = 0;
    this.blackoutUntilMs = 0;
    this.simulatedStaleAgeOffsetMs = 0;
  }

  get extraRttMs(): number {
    return this.extraUplinkMs + this.extraDownlinkMs;
  }

  get extraLatencyMs(): number {
    return Math.round((this.extraUplinkMs + this.extraDownlinkMs) * 0.5);
  }

  recordPacketReceived(nowMs = getNowMs()): void {
    if (this.blackoutUntilMs > nowMs) return;
    this.lastPacketTimestampMs = nowMs;
    this.simulatedStaleAgeOffsetMs = 0;
  }

  applyPreset(
    presetId: string,
    channel: NetworkStressChannelTarget | null = null,
    nowMs = getNowMs()
  ): Readonly<NetworkStressPresetSpec> {
    const found =
      NETWORK_STRESS_PRESET_LIST.find((p) => p.id === presetId) ||
      NETWORK_STRESS_PRESETS[presetId] ||
      NETWORK_STRESS_PRESETS.IDEAL_LAN;

    this.activePresetId = found.id;
    this.setStress(
      {
        extraUplinkMs: found.extraUplinkMs,
        extraDownlinkMs: found.extraDownlinkMs,
        jitterMs: found.jitterMs,
        packetLossPct: found.packetLossPct,
      },
      channel
    );

    if (found.blackoutMs > 0) {
      this.triggerBlackout(found.blackoutMs, channel, nowMs);
      if (found.blackoutMs >= SESSION_DISCONNECT_THRESHOLD_MS) {
        this.simulatedStaleAgeOffsetMs = SESSION_DISCONNECT_THRESHOLD_MS + 250;
      } else if (found.blackoutMs >= INPUT_STALE_NEUTRAL_THRESHOLD_MS) {
        this.simulatedStaleAgeOffsetMs = INPUT_STALE_NEUTRAL_THRESHOLD_MS + 200;
      }
    } else {
      this.clearBlackout(channel, nowMs);
    }

    return found;
  }

  setStress(
    params: Partial<NetworkStressSimulatorOptions> = {},
    channel: NetworkStressChannelTarget | null = null
  ): void {
    if (params.extraLatencyMs !== undefined && params.extraUplinkMs === undefined && params.extraDownlinkMs === undefined) {
      const clamped = clampStressValue(params.extraLatencyMs, "extraLatencyMs", 500);
      this.extraUplinkMs = clamped;
      this.extraDownlinkMs = clamped;
    }
    if (params.extraUplinkMs !== undefined) {
      this.extraUplinkMs = clampStressValue(params.extraUplinkMs, "extraUplinkMs", 500);
    }
    if (params.extraDownlinkMs !== undefined) {
      this.extraDownlinkMs = clampStressValue(params.extraDownlinkMs, "extraDownlinkMs", 500);
    }
    if (params.jitterMs !== undefined) {
      this.jitterMs = clampStressValue(params.jitterMs, "jitterMs", 200);
    }
    if (params.packetLossPct !== undefined) {
      this.packetLossPct = clampStressValue(params.packetLossPct, "packetLossPct", 100, false);
    }
    if (params.burstDropEnabled !== undefined) {
      this.burstDropEnabled = Boolean(params.burstDropEnabled);
    }
    if (params.burstPeriodMs !== undefined) {
      this.burstPeriodMs = Math.max(1, Math.floor(Number(params.burstPeriodMs) || 2000));
    }
    if (params.burstDurationMs !== undefined) {
      const val = Math.floor(Number(params.burstDurationMs) || 0);
      this.burstDurationMs = Math.max(0, Math.min(this.burstPeriodMs - 1, val));
    } else if (this.burstDurationMs >= this.burstPeriodMs) {
      this.burstDurationMs = Math.max(0, this.burstPeriodMs - 1);
    }

    this.syncToChannel(channel);
  }

  syncToChannel(channel: NetworkStressChannelTarget | null): void {
    if (!channel) return;
    const sim = channel.simulator;
    if (typeof channel.setAsymmetricLatency === "function") {
      channel.setAsymmetricLatency(this.extraUplinkMs, this.extraDownlinkMs);
    } else if (sim && typeof sim.setAsymmetricLatency === "function") {
      sim.setAsymmetricLatency(this.extraUplinkMs, this.extraDownlinkMs);
    } else {
      channel.extraUplinkMs = this.extraUplinkMs;
      channel.extraDownlinkMs = this.extraDownlinkMs;
      if (typeof channel.setExtraLatency === "function") {
        channel.setExtraLatency(this.extraLatencyMs);
      } else {
        channel.extraLatencyMs = this.extraLatencyMs;
      }
    }

    if (typeof channel.setJitter === "function") {
      channel.setJitter(this.jitterMs);
    } else if (sim && typeof sim.setJitter === "function") {
      sim.setJitter(this.jitterMs);
    } else {
      channel.jitterMs = this.jitterMs;
      if (sim) sim.jitterMs = this.jitterMs;
    }

    const lossRate = this.packetLossPct / 100.0;
    if (typeof channel.setPacketLossRate === "function") {
      channel.setPacketLossRate(lossRate);
    } else {
      channel.packetLossRate = lossRate;
    }
    channel.simulatedPacketLossPct = this.packetLossPct;

    if (typeof channel.setBurstDrop === "function") {
      channel.setBurstDrop(this.burstPeriodMs, this.burstDurationMs, this.burstDropEnabled);
    } else if (sim && typeof sim.setBurstDrop === "function") {
      sim.setBurstDrop(this.burstPeriodMs, this.burstDurationMs, this.burstDropEnabled);
    } else {
      channel.burstPeriodMs = this.burstPeriodMs;
      channel.burstDurationMs = this.burstDurationMs;
      channel.burstDropEnabled = this.burstDropEnabled;
    }
  }

  triggerBlackout(
    durationMs: number,
    channel: NetworkStressChannelTarget | null = null,
    nowMs = getNowMs()
  ): void {
    const dur = Math.max(0, Number(durationMs) || 0);
    this.blackoutStartMs = nowMs;
    this.blackoutUntilMs = nowMs + dur;

    const sim = channel?.simulator || channel;
    if (sim && typeof sim.triggerBlackout === "function") {
      sim.triggerBlackout(dur, nowMs);
    } else if (channel?.forceDropNextInput) {
      const approxPackets = Math.max(1, Math.ceil((dur / 1000) * 120));
      channel.forceDropNextInput(approxPackets);
    }
  }

  clearBlackout(
    channel: NetworkStressChannelTarget | null = null,
    nowMs = getNowMs()
  ): void {
    this.blackoutStartMs = 0;
    this.blackoutUntilMs = 0;
    this.simulatedStaleAgeOffsetMs = 0;
    this.lastPacketTimestampMs = nowMs;

    const sim = channel?.simulator || channel;
    if (sim && typeof sim.clearBlackout === "function") {
      sim.clearBlackout();
    }
    this.syncToChannel(channel);
  }

  getHealthSnapshot(
    metrics: ConnectionMetricsInput = {},
    nowMs = getNowMs()
  ) {
    const isBlackoutActive = this.blackoutUntilMs > nowMs;
    const rawElapsedMs = Math.max(0, nowMs - this.lastPacketTimestampMs);
    const blackoutElapsedMs = isBlackoutActive ? Math.max(0, nowMs - this.blackoutStartMs) : 0;
    const packetAgeMs = Math.round(Math.max(rawElapsedMs, blackoutElapsedMs, this.simulatedStaleAgeOffsetMs));

    const evaluation = evaluateConnectionQuality({
      rttMs: metrics.rttMs ?? this.extraRttMs,
      jitterMs: metrics.jitterMs ?? this.jitterMs,
      packetLossPct: metrics.packetLossPct ?? this.packetLossPct,
      lastErrorUu: metrics.lastErrorUu ?? 0,
      packetAgeMs,
    });

    return {
      presetId: this.activePresetId,
      extraUplinkMs: this.extraUplinkMs,
      extraDownlinkMs: this.extraDownlinkMs,
      extraRttMs: this.extraRttMs,
      extraLatencyMs: this.extraLatencyMs,
      jitterMs: this.jitterMs,
      packetLossPct: this.packetLossPct,
      packetAgeMs,
      isBlackoutActive,
      ...evaluation,
    };
  }
}
