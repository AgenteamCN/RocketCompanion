/**
 * ReconcilerControlMessenger.ts
 * Outbound client input packet encoder, piggybacked signal ACK & client command queue,
 * and packet diagnostic dump coordinator.
 */

import {
  InputPacketCodec,
  type PiggybackedSignalAck,
  type PiggybackedClientCommand,
} from '../protocol/InputPacketCodec.ts';
import type { MatchSignalDescriptor } from '../protocol/GlobalPayloadCodec.ts';
import {
  dumpNetworkPacket,
  type DumpedNetworkPacket,
  type InspectablePacketInput,
} from '../diagnostics/PacketDumpDiagnostics.ts';
import type { CarControls, PredictionHistoryBuffer } from './PredictionHistoryBuffer.ts';
import type {
  ReconcilerMetrics,
  TelemetryChannelPort,
  TelemetrySimPort,
} from './ReconcilerMetricsModel.ts';
import {
  drainAndParseServerPacketBatch,
  type DrainServerPacketsContext,
  type ParsedReconcilerPacket,
} from './reconcilerInboundPacketParser.ts';

export type { DrainServerPacketsContext, ParsedReconcilerPacket };

export interface PendingSignalAckEntry {
  signalId: number;
  signalType: number;
  remainingSends: number;
}

export interface PendingClientCommandEntry {
  commandId: number;
  commandType: number;
  param1: number;
  param2: number;
  remainingSends: number;
}

export interface OutboundRedundantInputConfig {
  redundantHistoryCount: number;
  enableRedundantInputs: boolean;
  redundantHistoryTicks: number;
  tickDtMs: number;
  lastServerRecordedInputTick: number;
}

export interface FlushPendingControlContext {
  readonly channel?: TelemetryChannelPort | null;
  readonly sim?: TelemetrySimPort | null;
  readonly lastAckedServerTick: number;
  readonly localCarIndex: number;
  readonly neutralControls: Readonly<CarControls>;
  readonly replayPlaybackMode: boolean;
  readonly localSkipReplayReady: boolean;
}

type DumpResolveCallback = (dumped: DumpedNetworkPacket | null) => void;

export class ReconcilerControlMessenger {
  pendingSignalAcks: Map<number, PendingSignalAckEntry> = new Map();
  pendingClientCommands: Map<number, PendingClientCommandEntry> = new Map();
  nextClientCommandId = 0;

  hasServerReportedBuffer = false;
  lastServerRecordedInputTick = -1;
  lastProcessedClientTimestamp = 0;
  baseMeasuredRtt = 0;
  measuredRtt = 0;
  lastReceivedPacketRaw: Uint8Array | ArrayBuffer | null = null;
  lastParsedPacket: ParsedReconcilerPacket | null = null;
  pendingDumpNextPacket = false;
  onNextDumpResolve: DumpResolveCallback | null = null;
  drainedReplayPackets: ParsedReconcilerPacket[] = [];

  constructor(initialServerRecordedInputTick = -1) {
    this.lastServerRecordedInputTick = initialServerRecordedInputTick;
  }

  resetTimelineCounters(initialServerRecordedInputTick: number): void {
    this.hasServerReportedBuffer = false;
    this.lastServerRecordedInputTick = initialServerRecordedInputTick;
    this.drainedReplayPackets.length = 0;
  }

  receiveChannelPackets(
    channel: TelemetryChannelPort | null | undefined,
    nowMs: number
  ): unknown[] | null {
    if (typeof channel?.receiveClientPackets === 'function')
      return channel.receiveClientPackets(nowMs);
    if (typeof channel?.receiveServerPackets === 'function')
      return channel.receiveServerPackets(nowMs);
    if (Array.isArray(channel?.inboundQueue)) return channel.inboundQueue.splice(0);
    return null;
  }

  triggerDumpNextPacket(): Promise<DumpedNetworkPacket | null> {
    this.pendingDumpNextPacket = true;
    return new Promise((resolve) => {
      this.onNextDumpResolve = resolve;
    });
  }

  dumpPacket(
    packetOrRaw: InspectablePacketInput | Uint8Array | ArrayBuffer | null = null
  ): DumpedNetworkPacket | null {
    return dumpNetworkPacket(packetOrRaw || this.lastParsedPacket || this.lastReceivedPacketRaw);
  }

  recordLatestParsedPacket(packet: ParsedReconcilerPacket): void {
    this.lastParsedPacket = packet;
    if (this.pendingDumpNextPacket) {
      this.pendingDumpNextPacket = false;
      const dumped = this.dumpPacket(packet);
      if (typeof this.onNextDumpResolve === 'function') {
        this.onNextDumpResolve(dumped);
        this.onNextDumpResolve = null;
      }
    }
  }

  updateLobbyAuthoritativeSnapshots(
    lobbyDualWorldMode: boolean,
    packet: ParsedReconcilerPacket | null | undefined,
    prev: Float32Array | null,
    curr: Float32Array | null
  ): { prev: Float32Array | null; curr: Float32Array | null } {
    if (!lobbyDualWorldMode || !packet?.stateSnapshot || packet.stateSnapshot.length < 410) {
      return { prev, curr };
    }
    if (!curr || curr.length !== packet.stateSnapshot.length) {
      return {
        prev: new Float32Array(packet.stateSnapshot),
        curr: new Float32Array(packet.stateSnapshot),
      };
    }
    prev!.set(curr);
    curr.set(packet.stateSnapshot);
    return { prev, curr };
  }

  acknowledgeSignal(signalId: number, signalType: number, repeatCount = 8): void {
    if (typeof signalId !== 'number' || signalId <= 0) return;
    const existing = this.pendingSignalAcks.get(signalId);
    if (existing) {
      existing.remainingSends = Math.max(existing.remainingSends, repeatCount);
      return;
    }
    this.pendingSignalAcks.set(signalId, {
      signalId: signalId & 0xffff,
      signalType: signalType & 0xff,
      remainingSends: repeatCount,
    });
  }

  acknowledgeServerSignals(signals: MatchSignalDescriptor[] | null | undefined): void {
    if (!Array.isArray(signals)) return;
    for (let i = 0; i < signals.length; i++) {
      const s = signals[i];
      if (!s) continue;
      if (s.signalType === 0x9f && typeof s.param1 === 'number') {
        this.resolveClientCommandAck(s.param1);
      }
      if (typeof s.signalId === 'number' && s.signalId > 0 && typeof s.signalType === 'number') {
        this.acknowledgeSignal(s.signalId, s.signalType, 6);
      }
    }
  }

  enqueueClientCommand(commandType: number, param1 = 0, param2 = 0, maxSends = 60): number {
    this.nextClientCommandId = ((this.nextClientCommandId || 0) % 65535) + 1;
    const commandId = this.nextClientCommandId;
    this.pendingClientCommands.set(commandId, {
      commandId,
      commandType: commandType & 0xff,
      param1: param1 & 0xffff,
      param2: param2 & 0xffff,
      remainingSends: maxSends,
    });
    return commandId;
  }

  resolveClientCommandAck(commandId: number): void {
    if (typeof commandId === 'number' && commandId > 0)
      this.pendingClientCommands.delete(commandId);
  }

  collectPiggybackAcksAndCommands(): {
    acks: PiggybackedSignalAck[];
    commands: PiggybackedClientCommand[];
  } {
    const acks: PiggybackedSignalAck[] = [];
    if (this.pendingSignalAcks.size > 0) {
      for (const [sigId, item] of this.pendingSignalAcks.entries()) {
        acks.push({ signalId: item.signalId, signalType: item.signalType });
        if (--item.remainingSends <= 0) this.pendingSignalAcks.delete(sigId);
        if (acks.length >= 32) break;
      }
    }

    const commands: PiggybackedClientCommand[] = [];
    if (this.pendingClientCommands.size > 0) {
      for (const [cmdId, cmd] of this.pendingClientCommands.entries()) {
        commands.push({
          commandId: cmd.commandId,
          commandType: cmd.commandType,
          param1: cmd.param1,
          param2: cmd.param2,
        });
        if (--cmd.remainingSends <= 0) this.pendingClientCommands.delete(cmdId);
        if (commands.length >= 16) break;
      }
    }

    return { acks, commands };
  }

  private transmitEncodedInputPacket(
    channel: TelemetryChannelPort | null | undefined,
    outboundPacket: Uint8Array,
    nowMs: number
  ): void {
    if (typeof channel?.sendClientInput === 'function') {
      channel.sendClientInput(outboundPacket, nowMs);
    } else if (typeof channel?.send === 'function') {
      channel.send(outboundPacket, nowMs);
    }
  }

  sendOutboundInputForTick(
    channel: TelemetryChannelPort | null | undefined,
    historyBuffer: PredictionHistoryBuffer,
    redundantConfig: OutboundRedundantInputConfig,
    localCarIndex: number,
    tick: number,
    carIndex: number = localCarIndex,
    controls: CarControls | null = null,
    nowMs = performance.now()
  ): void {
    const isRedundantEnabled =
      redundantConfig.redundantHistoryCount > 1 || Boolean(redundantConfig.enableRedundantInputs);
    const { acks, commands } = this.collectPiggybackAcksAndCommands();
    let outboundPacket: Uint8Array;
    if (isRedundantEnabled) {
      const maxHistoryLimit = Math.max(
        redundantConfig.redundantHistoryCount,
        redundantConfig.redundantHistoryTicks || 12,
        Math.ceil((channel?.rttMs || 0) / redundantConfig.tickDtMs) + 6
      );
      const serverRecordedTick = redundantConfig.lastServerRecordedInputTick;
      const unackedCount =
        typeof serverRecordedTick === 'number' &&
        serverRecordedTick >= 0 &&
        tick > serverRecordedTick
          ? tick - serverRecordedTick
          : maxHistoryLimit;
      const historyLimit = Math.max(1, Math.min(maxHistoryLimit, unackedCount));
      const window = historyBuffer.clientInputRingBuffer.getRecentWindow(
        tick,
        historyLimit,
        carIndex
      );
      outboundPacket = InputPacketCodec.encode(carIndex, tick, window, nowMs, acks, commands);
    } else {
      const ctrl =
        controls || historyBuffer.getPreviousCommittedControls(tick + 1, carIndex, localCarIndex);
      const singleWindow = [{ tick, carIndex, controls: { ...ctrl } }];
      outboundPacket = InputPacketCodec.encode(carIndex, tick, singleWindow, nowMs, acks, commands);
    }

    this.transmitEncodedInputPacket(channel, outboundPacket, nowMs);
  }

  flushPendingControlPackets(ctx: FlushPendingControlContext, nowMs = performance.now()): void {
    const wantSkipJump = Boolean(ctx.replayPlaybackMode && ctx.localSkipReplayReady);
    if (this.pendingSignalAcks.size === 0 && this.pendingClientCommands.size === 0 && !wantSkipJump)
      return;
    const { acks, commands } = this.collectPiggybackAcksAndCommands();
    if (acks.length === 0 && commands.length === 0 && !wantSkipJump) return;
    const currentTick = Math.floor(
      ctx.sim?.getHeaderView?.()?.tickCount ?? ctx.lastAckedServerTick ?? 0
    );
    const singleWindow = [
      {
        tick: currentTick,
        carIndex: ctx.localCarIndex,
        controls: { ...ctx.neutralControls, jump: wantSkipJump },
      },
    ];
    const outboundPacket = InputPacketCodec.encode(
      ctx.localCarIndex,
      currentTick,
      singleWindow,
      nowMs,
      acks,
      commands
    );
    this.transmitEncodedInputPacket(ctx.channel, outboundPacket, nowMs);
  }

  drainAndParseServerPackets(
    ctx: DrainServerPacketsContext,
    incomingPackets: unknown[],
    nowMs: number
  ): ParsedReconcilerPacket | null {
    return drainAndParseServerPacketBatch(this, ctx, incomingPackets, nowMs);
  }
}
