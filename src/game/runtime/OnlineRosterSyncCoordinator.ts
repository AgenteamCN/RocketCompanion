/**
 * OnlineRosterSyncCoordinator.ts
 * Autonomous stateful OnlineRosterSyncCoordinator owning roster snapshot state,
 * participant team mappings, and delegating remote peer vehicle synchronization.
 */

import {
  setNameTagRuntimeState,
  useAppStore,
  useQuickNotificationStore,
  type OnlinePeerEntryPort,
} from '../runtimeUiPort.ts';
import {
  OnlineRemotePeerVehicleSynchronizer,
  type FlipResetVisualHandle,
  type OnlineRosterDiagnosticsPort,
  type OnlineRosterPlayerEntry,
  type OnlineRosterSessionPort,
  type OnlineRosterSnapshotPayload,
  type OnlineRosterSyncHostPort,
  type OnlineRosterWorldPort,
  type RemotePeerChannel,
  type RemoteTransportChannelLike,
} from './OnlineRemotePeerVehicleSynchronizer.ts';

export const HOST_LOBBY_ONGOING_NOTIFICATION_ID = 'host-lobby-players';

export type {
  FlipResetVisualHandle,
  OnlineRosterDiagnosticsPort,
  OnlineRosterPlayerEntry,
  OnlineRosterSessionPort,
  OnlineRosterSnapshotPayload,
  OnlineRosterSyncHostPort,
  OnlineRosterWorldPort,
  RemotePeerChannel,
  RemoteTransportChannelLike,
};

export function dismissHostLobbyOngoingNotification(): void {
  try {
    const notifyStore = useQuickNotificationStore?.getState?.();
    notifyStore?.dismissOngoingNotification?.(HOST_LOBBY_ONGOING_NOTIFICATION_ID);
  } catch (err) {
    console.warn(
      '[OnlineRosterSyncCoordinator] Failed to dismiss host lobby ongoing notification:',
      err
    );
  }
}

export class OnlineRosterSyncCoordinator {
  public readonly host: OnlineRosterSyncHostPort;
  public readonly peerSynchronizer: OnlineRemotePeerVehicleSynchronizer;
  public lastRosterSnapshot: OnlineRosterSnapshotPayload | null = null;
  public readonly participantTeams = new Map<number, number>();

  constructor(host: OnlineRosterSyncHostPort) {
    this.host = host;
    this.peerSynchronizer = new OnlineRemotePeerVehicleSynchronizer(host);
  }

  public resetState(): void {
    this.lastRosterSnapshot = null;
    this.participantTeams.clear();
  }

  public syncHostLobbyOngoingNotification(): void {
    const { session, world } = this.host;
    if (!session.authoritativeServer || world.isBotMatch) {
      dismissHostLobbyOngoingNotification();
      return;
    }

    const isLobby = Boolean(
      world.arena?.isLobbyMode ||
      world.match?.state?.mode !== 'match' ||
      world.match?.state?.phase === 'lobby'
    );
    if (!isLobby) {
      dismissHostLobbyOngoingNotification();
      return;
    }

    const uiOnline = useAppStore?.getState?.()?.onlineSession;
    const gameMode = uiOnline?.gameMode || '3v3';
    const maxPlayers = gameMode === '1v1' ? 2 : gameMode === '2v2' ? 4 : 6;
    const connectedPeers = uiOnline?.connectedPeers || [];
    const joinedCount = Math.min(maxPlayers, 1 + connectedPeers.length);
    const roomCode = uiOnline?.roomId || 'Lobby';
    const ratio = maxPlayers > 0 ? Math.min(1, joinedCount / maxPlayers) : 0;
    const contentText = `Lobby (${roomCode}): ${joinedCount}/${maxPlayers} joined`;

    try {
      const notifyStore = useQuickNotificationStore?.getState?.();
      if (!notifyStore) return;
      const existing = notifyStore.ongoingTasks?.some?.(
        (t) => t.id === HOST_LOBBY_ONGOING_NOTIFICATION_ID
      );
      if (existing) {
        notifyStore.updateOngoingNotification(HOST_LOBBY_ONGOING_NOTIFICATION_ID, {
          content: contentText,
          progress: ratio,
          tone: joinedCount >= maxPlayers ? 'success' : 'info',
          isSpinningIcon: joinedCount < maxPlayers,
        });
      } else {
        notifyStore.pushOngoingNotification({
          id: HOST_LOBBY_ONGOING_NOTIFICATION_ID,
          type: 'ongoing',
          content: contentText,
          icon: 'Users',
          progress: ratio,
          tone: joinedCount >= maxPlayers ? 'success' : 'info',
          isSpinningIcon: joinedCount < maxPlayers,
        });
      }
    } catch (err) {
      console.warn(
        '[OnlineRosterSyncCoordinator] Failed to update host lobby ongoing notification:',
        err
      );
    }
  }

  public dismissHostLobbyOngoingNotification(): void {
    dismissHostLobbyOngoingNotification();
  }

  public async applyRosterSnapshot(
    roster: OnlineRosterSnapshotPayload | null | undefined
  ): Promise<void> {
    const { session, world, diagnostics } = this.host;
    if (!roster || !Array.isArray(roster.players)) return;
    this.lastRosterSnapshot = roster;

    const isLobbyDualWorld = session.isLobbyDualWorldActive();
    const isHostLobby = Boolean(session.authoritativeServer && isLobbyDualWorld);

    await world.arena?.vehicleRegistry.ensureOpponent();
    const connectedPeers: OnlinePeerEntryPort[] = [];
    const nameTagEntries: Array<{
      carIndex: number;
      name: string;
      team: 0 | 1;
      isBot: boolean;
    }> = [];

    for (const p of roster.players) {
      const cIdx = p.entityId;
      if (typeof cIdx !== 'number' || cIdx < 0 || cIdx >= 8) continue;
      const preset = p.visualId || 'octane';
      const hitbox = p.hitboxId || preset;
      const rawTeam = p.team ?? cIdx % 2;
      const physicsTeam: 0 | 1 = rawTeam === 1 ? 1 : 0;
      const displayName = p.name || `Player ${cIdx + 1}`;
      this.participantTeams.set(cIdx, physicsTeam);

      nameTagEntries.push({
        carIndex: cIdx,
        name: displayName,
        team: physicsTeam,
        isBot: Boolean(p.isBot),
      });

      if (cIdx !== world.playerCarIndex) {
        connectedPeers.push(
          this.peerSynchronizer.resolveConnectedPeerEntry(
            p,
            cIdx,
            displayName,
            rawTeam,
            physicsTeam
          )
        );
      }

      this.peerSynchronizer.syncRosterPlayerCarInWorld(
        p,
        cIdx,
        physicsTeam,
        preset,
        hitbox,
        isLobbyDualWorld
      );
    }

    if (isLobbyDualWorld || diagnostics.isDiagnosticFleetEnabled()) {
      if (!nameTagEntries.some((e) => e.carIndex === 6)) {
        nameTagEntries.push({ carIndex: 6, name: 'Boost', team: 0, isBot: true });
      }
      if (!nameTagEntries.some((e) => e.carIndex === 7)) {
        nameTagEntries.push({ carIndex: 7, name: 'Roll', team: 1, isBot: true });
      }
    }

    setNameTagRuntimeState({
      isMultiplayerOrMultiCarMode: true,
      carEntries: nameTagEntries,
    });

    if (useAppStore && typeof useAppStore.getState === 'function') {
      const localRosterEntry = roster.players.find(
        (p) =>
          p &&
          (p.entityId === world.playerCarIndex ||
            (session.authoritativeServer && p.sessionId === 'host'))
      );
      const sessionPatch: Record<string, unknown> = { connectedPeers };
      if (localRosterEntry) {
        sessionPatch.localTeam =
          localRosterEntry.team === 2 ? 'neutral' : localRosterEntry.team === 1 ? 'orange' : 'blue';
      }
      if (roster.gameMode === '1v1' || roster.gameMode === '2v2' || roster.gameMode === '3v3') {
        sessionPatch.gameMode = roster.gameMode;
      }
      if (typeof roster.botFillMode === 'string') {
        sessionPatch.botFillMode = roster.botFillMode;
      }
      if (
        typeof roster.durationSeconds === 'number' &&
        Number.isFinite(roster.durationSeconds) &&
        roster.durationSeconds >= 0
      ) {
        sessionPatch.matchDurationSeconds = roster.durationSeconds;
        if (isLobbyDualWorld && world.match?.state) {
          world.match.state.durationSeconds = roster.durationSeconds;
        }
      }
      useAppStore.getState().setOnlineSession(sessionPatch);
    }
    if (isHostLobby || session.authoritativeServer) {
      this.syncHostLobbyOngoingNotification();
    }
  }

  public async onRemotePlayerConnected(
    channel: RemotePeerChannel | null | undefined,
    remotePlayerName = 'Player 2',
    assignedCarIndex: number | null = null
  ): Promise<number | null> {
    return this.peerSynchronizer.onRemotePlayerConnected(
      channel,
      remotePlayerName,
      assignedCarIndex,
      () => this.syncHostLobbyOngoingNotification()
    );
  }

  public async removeRemotePlayer(carIndex: number): Promise<void> {
    this.peerSynchronizer.removeRemotePlayer(carIndex, () =>
      this.syncHostLobbyOngoingNotification()
    );
  }
}
