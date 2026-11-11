import { CAR_COLOR_SLOTS } from '../../ui-core/config/vehicleConstants.ts';
import { useAppStore, type OnlinePeerEntryPort } from '../runtimeUiPort.ts';
import { gameAudio } from '../../audio/GameAudioEngineFacade.ts';
import type { ArenaWorld } from '../../entities/ArenaWorld.ts';
import type { EntityManager } from '../../entities/EntityManager.ts';
import type { RocketSimPhysicsEngine } from '../../physics/RocketSimPhysicsEngine.ts';
import type { PhysicsStateInterpolator } from '../../physics/PhysicsStateInterpolator.ts';
import type { RuntimeMatchState } from './RuntimeMatchState.ts';
import type { AuthoritativeServerHost } from '../../network/server/AuthoritativeServerHost.ts';
import type { PredictionReconciler } from '../../network/client/PredictionReconciler.ts';
import type { MultiplayerSessionManager } from '../../network/transport/MultiplayerSessionManager.ts';

export interface OnlineRosterPlayerEntry {
  entityId: number;
  sessionId?: string;
  name?: string;
  visualId?: string;
  hitboxId?: string | null;
  team?: number;
  colorSlot?: number;
  paintFinish?: string;
  boostVisual?: string;
  boostAudio?: string;
  isBot?: boolean;
  ready?: boolean;
  pingMs?: number;
  [key: string]: unknown;
}

export interface OnlineRosterSnapshotPayload {
  players: OnlineRosterPlayerEntry[];
  gameMode?: '1v1' | '2v2' | '3v3' | string;
  botFillMode?: string;
  durationSeconds?: number;
  [key: string]: unknown;
}

export interface RemotePeerChannel {
  carIndex?: number;
  visualId?: string;
  hitboxId?: string | null;
  colorSlot?: number;
  paintFinish?: string;
  boostVisual?: string;
  boostAudio?: string;
  measuredRttMs?: number;
  rttMs?: number;
  peerId?: string | null;
  pairingCode?: string | null;
  send?: (payload: string | Uint8Array | ArrayBuffer) => void;
  close?: () => void;
  destroy?: () => void;
  onColorChange?: ((msg: { carIndex?: number; hex: string }) => void) | null;
  onDiagnosticFleetToggle?: ((enabled: boolean, anchorMode?: string) => void) | null;
}

export type RemoteTransportChannelLike = RemotePeerChannel;

export interface FlipResetVisualHandle {
  stopVisual?(): void;
}

export interface OnlineRosterSessionPort {
  readonly authoritativeServer: AuthoritativeServerHost | null;
  readonly networkReconciler: PredictionReconciler | null;
  readonly remotePeerCarMap: Map<string, number>;
  isLobbyDualWorldActive(): boolean;
}

export interface OnlineRosterWorldPort {
  readonly arena: ArenaWorld | null;
  readonly physics: RocketSimPhysicsEngine | null;
  readonly entityManager: EntityManager | null;
  readonly interpolator: PhysicsStateInterpolator | null;
  readonly match: RuntimeMatchState | null;
  readonly multiplayerSession: MultiplayerSessionManager | null;
  readonly flipResetVisuals: Map<number, FlipResetVisualHandle>;
  readonly playerCarIndex: number;
  readonly isBotMatch: boolean;
  selectedColorSlot: number | null;
  setCarColor(carIndex: number, hexColor: string, persistPreference?: boolean): void;
}

export interface OnlineRosterDiagnosticsPort {
  isDiagnosticFleetEnabled(): boolean;
  spawnDiagnosticTestFleet(options?: { anchorMode?: string }): Promise<unknown>;
  despawnDiagnosticTestFleet(): void;
}

export interface OnlineRosterSyncHostPort {
  readonly session: OnlineRosterSessionPort;
  readonly world: OnlineRosterWorldPort;
  readonly diagnostics: OnlineRosterDiagnosticsPort;
}

export class OnlineRemotePeerVehicleSynchronizer {
  private readonly host: OnlineRosterSyncHostPort;

  constructor(host: OnlineRosterSyncHostPort) {
    this.host = host;
  }

  public resolveConnectedPeerEntry(
    p: OnlineRosterPlayerEntry,
    cIdx: number,
    displayName: string,
    rawTeam: number,
    physicsTeam: 0 | 1
  ): OnlinePeerEntryPort {
    const { session, world } = this.host;
    const prevPeers = useAppStore?.getState?.()?.onlineSession?.connectedPeers || [];
    const hostPeerList =
      (world.multiplayerSession?.hostController?.getConnectedPeerList?.() as
        | Array<{ id?: string; carIndex?: number; pairingCode?: string; pingMs?: number }>
        | undefined) || [];
    const matchedHostPeer = hostPeerList.find(
      (hp) => hp.carIndex === cIdx || hp.id === p.sessionId
    );
    const matchedPrevPeer = prevPeers.find((pp) => pp.carIndex === cIdx || pp.id === p.sessionId);
    const resolvedPairingCode =
      matchedHostPeer?.pairingCode ||
      (matchedPrevPeer?.pairingCode as string | undefined) ||
      (!session.authoritativeServer
        ? useAppStore?.getState?.()?.onlineSession?.pairingCode
        : undefined);

    const lastParsed = session.networkReconciler?.lastParsedPacket as
      { allUserRtt?: { players?: Array<{ carIndex?: number; rtt?: number }> } } | null | undefined;
    const packetRttObj = lastParsed?.allUserRtt?.players?.find?.(
      (entry) => entry && entry.carIndex === cIdx
    );
    const resolvedPingMs = p.isBot
      ? 0
      : Math.round(
          (typeof p.pingMs === 'number' && p.pingMs > 0 ? p.pingMs : null) ??
            (typeof packetRttObj?.rtt === 'number' && packetRttObj.rtt > 0
              ? packetRttObj.rtt
              : null) ??
            (typeof matchedHostPeer?.pingMs === 'number' && matchedHostPeer.pingMs > 0
              ? matchedHostPeer.pingMs
              : null) ??
            (typeof matchedPrevPeer?.pingMs === 'number' && matchedPrevPeer.pingMs > 0
              ? matchedPrevPeer.pingMs
              : null) ??
            (!session.authoritativeServer ? session.networkReconciler?.metrics?.rttMs || 15 : 15)
        );

    return {
      id: p.sessionId || `peer_${cIdx}`,
      name: displayName,
      carIndex: cIdx,
      entityId: cIdx,
      team: rawTeam === 2 ? 2 : physicsTeam,
      isBot: Boolean(p.isBot),
      pingMs: resolvedPingMs,
      pairingCode: resolvedPairingCode,
      isReady: Boolean(p.ready),
    };
  }

  public syncRosterPlayerCarInWorld(
    p: OnlineRosterPlayerEntry,
    cIdx: number,
    physicsTeam: 0 | 1,
    preset: string,
    hitbox: string,
    isLobbyDualWorld: boolean
  ): void {
    const { session, world } = this.host;
    session.networkReconciler?.setCarVisualPreset?.(cIdx, preset);

    if (isLobbyDualWorld && cIdx !== world.playerCarIndex) {
      if (world.arena?.cars?.[cIdx]) {
        world.arena.cars[cIdx].visible = false;
      }
      return;
    }

    if (world.physics) {
      if (typeof world.physics.addCarAtSlot === 'function') {
        world.physics.addCarAtSlot(cIdx, physicsTeam, preset);
      } else {
        while (world.physics.numCars <= cIdx) {
          const nextIdx = world.physics.numCars;
          world.physics.addCar(
            nextIdx === cIdx ? physicsTeam : nextIdx % 2,
            session.networkReconciler?.carVisualPresets?.get(nextIdx) || 'octane'
          );
        }
      }
    }
    world.physics?.setCarTeam?.(cIdx, physicsTeam);

    if (world.arena) {
      world.arena.vehicleRegistry.ensureCar(cIdx, physicsTeam, 'fennec');
      if (world.arena.cars[cIdx]) {
        world.arena.cars[cIdx].visible = isLobbyDualWorld ? cIdx === world.playerCarIndex : true;
      }
    }

    if (world.entityManager) {
      world.entityManager.hotSwapVehicle(cIdx, { visual: preset, hitbox });
    } else {
      world.arena?.vehicleRegistry.swapCarVisual(cIdx, preset);
      world.physics?.setCarHitbox?.(cIdx, hitbox);
    }

    let colorHex: string | null = null;
    if (typeof p.colorSlot === 'number' && p.colorSlot >= 0) {
      const slotObj = CAR_COLOR_SLOTS.find((s) => s.id === p.colorSlot);
      if (slotObj) {
        colorHex = slotObj.hex;
        world.arena?.vehicleRegistry.setCarColor(cIdx, slotObj.hex);
        if (cIdx === world.playerCarIndex) {
          world.selectedColorSlot = slotObj.id;
        }
      }
    } else {
      world.arena?.vehicleRegistry.setCarTeam(cIdx, physicsTeam);
    }

    world.arena?.vehicleRegistry.setCarLoadout(cIdx, {
      colorHex: colorHex || undefined,
      paintFinish: p.paintFinish || 'metallic',
      boostVisual: p.boostVisual || 'light-wave',
      boostAudio: p.boostAudio || 'rush',
      isBot: Boolean(p.isBot),
    });
    gameAudio?.setCarBoostAudioVariation?.(cIdx, p.boostAudio || 'rush');
  }

  public async onRemotePlayerConnected(
    channel: RemotePeerChannel | null | undefined,
    remotePlayerName: string,
    assignedCarIndex: number | null,
    onSyncLobbyNotification: () => void
  ): Promise<number | null> {
    const { session, world, diagnostics } = this.host;
    if (!session.authoritativeServer || !channel) return assignedCarIndex;

    const channelId = session.authoritativeServer.addClientChannel(channel);
    let targetCarIndex = assignedCarIndex;
    if (typeof targetCarIndex !== 'number' || targetCarIndex < 1) {
      const existingPeers = useAppStore?.getState?.()?.onlineSession?.connectedPeers || [];
      const usedCarIndices = new Set<number>([
        ...existingPeers
          .filter((p) => !p?.isBot && !String(p?.id || '').startsWith('bot_'))
          .map((p) => p.carIndex)
          .filter((idx): idx is number => typeof idx === 'number'),
        ...session.remotePeerCarMap.values(),
      ]);
      for (let i = 1; i < 6; i++) {
        if (!usedCarIndices.has(i)) {
          targetCarIndex = i;
          break;
        }
      }
      if (typeof targetCarIndex !== 'number') targetCarIndex = 1;
    }
    session.remotePeerCarMap.set(channelId || `peer_${targetCarIndex}`, targetCarIndex);
    channel.carIndex = targetCarIndex;

    const team = targetCarIndex % 2;
    const peerVisualId = channel.visualId || 'octane';
    const peerHitboxId = channel.hitboxId || null;
    const peerColorSlot = channel.colorSlot ?? 0;
    const peerPaintFinish = channel.paintFinish || 'metallic';
    const peerBoostVisual = channel.boostVisual || 'light-wave';
    const peerBoostAudio = channel.boostAudio || 'rush';
    const isLobby = Boolean(
      session.isLobbyDualWorldActive() ||
      world.match?.state?.mode !== 'match' ||
      world.match?.state?.phase === 'lobby'
    );

    if (!isLobby) {
      session.authoritativeServer.ensureCar(targetCarIndex, team, peerVisualId);
    }
    session.authoritativeServer.notifyPlayerJoined(
      targetCarIndex,
      remotePlayerName,
      'player',
      channelId,
      peerVisualId,
      peerColorSlot,
      peerHitboxId,
      peerPaintFinish,
      peerBoostVisual,
      peerBoostAudio
    );

    if (!isLobby) {
      if (world.arena) {
        await world.arena.vehicleRegistry.ensureOpponent();
        world.arena.vehicleRegistry.ensureCar(targetCarIndex, team, 'fennec');
        if (world.arena.cars[targetCarIndex]) {
          world.arena.cars[targetCarIndex].visible = true;
        }
      }
      if (world.physics) {
        if (typeof world.physics.addCarAtSlot === 'function') {
          world.physics.addCarAtSlot(targetCarIndex, team, peerVisualId);
        } else {
          while (world.physics.numCars <= targetCarIndex) {
            world.physics.addCar(world.physics.numCars % 2, peerVisualId);
          }
        }
        world.physics.setCarTeam?.(targetCarIndex, team);
        world.physics.setCarHitbox(targetCarIndex, peerVisualId);
      }
      world.interpolator?.sync(performance.now());
    } else if (world.arena?.cars?.[targetCarIndex]) {
      world.arena.cars[targetCarIndex].visible = false;
    }

    channel.onColorChange = (msg: { carIndex?: number; hex: string }) => {
      const cIdx = msg.carIndex ?? targetCarIndex;
      world.setCarColor(cIdx, msg.hex, false);
    };
    channel.onDiagnosticFleetToggle = (enabled: boolean, anchorMode?: string) => {
      if (enabled) void diagnostics.spawnDiagnosticTestFleet({ anchorMode });
      else diagnostics.despawnDiagnosticTestFleet();
    };

    if (useAppStore && typeof useAppStore.getState === 'function') {
      const existingPeers = (useAppStore.getState().onlineSession?.connectedPeers || []).filter(
        (p) => p.carIndex !== targetCarIndex
      );
      const ping = Math.round(channel.measuredRttMs || 15);
      useAppStore.getState().setOnlineSession({
        connectedPeers: [
          ...existingPeers,
          {
            id: channel.peerId || `peer_${targetCarIndex}`,
            name: remotePlayerName,
            carIndex: targetCarIndex,
            pingMs: ping,
            pairingCode: channel.pairingCode || undefined,
          },
        ],
      });
    }
    onSyncLobbyNotification();
    return targetCarIndex;
  }

  public removeRemotePlayer(carIndex: number, onSyncLobbyNotification: () => void): void {
    const { session, world } = this.host;
    if (carIndex === world.playerCarIndex) return;

    for (const [k, v] of session.remotePeerCarMap.entries()) {
      if (v === carIndex) session.remotePeerCarMap.delete(k);
    }

    world.arena?.vehicleRegistry.removeCar(carIndex);
    if (world.flipResetVisuals?.has?.(carIndex)) {
      world.flipResetVisuals.get(carIndex)?.stopVisual?.();
      world.flipResetVisuals.delete(carIndex);
    }
    session.authoritativeServer?.removeCar?.(carIndex);

    if (useAppStore && typeof useAppStore.getState === 'function') {
      const peers = useAppStore.getState().onlineSession?.connectedPeers || [];
      useAppStore.getState().setOnlineSession({
        connectedPeers: peers.filter((p) => p.carIndex !== carIndex),
      });
    }
    onSyncLobbyNotification();
  }
}
