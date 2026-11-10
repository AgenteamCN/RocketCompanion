import React, { useState } from 'react';
import { useAppStore } from '../../stores/appStore';
import { useHudStore } from '../../stores/hudStore';
import { floatingStore } from '../../stores/floatingStore';
import {
  networkDiagnosticsStore,
  useNetworkDiagnosticsData,
} from '../../stores/networkDiagnosticsStore';
import { NETWORK_MONITOR_PRESET } from '../../stores/floatingPresets';
import { useScopedStore } from '../../stores/storeSnapshotScope';
import { MatchLobbyRoomRecipe } from '../online/MatchLobbyRoomRecipe';
import type {
  LobbyPlayerSlot,
  LobbyTeamAssignment,
} from '../online/MatchLobbyTeamRosterSection';
import { DuringMatchRoomRecipe } from '../online/DuringMatchRoomRecipe';
import type { ActiveMatchPlayer } from '../online/DuringMatchClientRejoinControls';
import {
  OnlineWarmupRoomRecipe,
  type WarmupRoomPlayer,
} from '../online/OnlineWarmupRoomRecipe';
import type {
  HostMatchBotPolicy,
  HostMatchDurationPreset,
  HostMatchTeamFormat,
} from '../online/OnlineRoomConfigSummaryCard';
import type { SignalingHealthState } from '../online/OnlineRoomTopStatusBar';

export type RoomStateMode = 'free-play' | 'match';
export type OnlineSessionContextId =
  | 'match-lobby-host'
  | 'match-lobby-client'
  | 'online-match-host'
  | 'online-match-client'
  | 'online-warmup-host'
  | 'online-warmup-client';

const FORMAT_TO_MODE: Record<HostMatchTeamFormat, '1v1' | '2v2' | '3v3'> = {
  duel: '1v1',
  doubles: '2v2',
  standard: '3v3',
};
const MODE_TO_FORMAT: Record<string, HostMatchTeamFormat> = {
  '1v1': 'duel',
  '2v2': 'doubles',
  '3v3': 'standard',
};

export interface OnlineRoomControlStateOverride {
  roomCode?: string;
  sessionContext?: OnlineSessionContextId;
  signalingState?: SignalingHealthState;
  onRefreshSignaling?: () => void | Promise<void>;
  localTeam?: LobbyTeamAssignment;
  onSwitchTeam?: (team: LobbyTeamAssignment) => void;
  teamFormat?: HostMatchTeamFormat;
  onChangeTeamFormat?: (format: HostMatchTeamFormat) => void;
  botPolicy?: HostMatchBotPolicy;
  onChangeBotPolicy?: (policy: HostMatchBotPolicy) => void;
  durationPreset?: HostMatchDurationPreset;
  onChangeDurationPreset?: (preset: HostMatchDurationPreset) => void;
  customDurationSeconds?: number;
  onChangeCustomDurationSeconds?: (seconds: number) => void;
  lobbyPeers?: LobbyPlayerSlot[];
  matchPlayers?: ActiveMatchPlayer[];
  warmupPlayers?: WarmupRoomPlayer[];
  onKickPeer?: (peerId: string) => void;
  zeroGProbes?: boolean;
  onToggleZeroGProbes?: () => void;
  testSfx?: boolean;
  onToggleTestSfx?: () => void;
  onResetBall?: () => void;
  isMatchPaused?: boolean;
  onTogglePause?: () => void;
  defaultRoomState?: RoomStateMode;
  onRoomStateChange?: (state: RoomStateMode) => void;
  defaultMatchLengthMin?: number;
  onStartState?: (state: RoomStateMode, matchLengthMin: number) => void;
  onSessionContextChange?: (ctx: OnlineSessionContextId) => void;
  onStartMatch?: () => void;
  onEnterMatch?: () => void;
  onNavigateAdvancedSettings?: () => void;
  onOpenNetHud?: () => void;
  onCloseRoom?: () => void | Promise<void>;
}

export interface OnlineSessionContextSpec {
  id: OnlineSessionContextId;
  shortLabel: string;
  stageLabel: string;
  role: 'host' | 'client';
  stage: 'lobby' | 'during-match' | 'warmup';
  resolveHeaderTitle: (roomCode: string) => string;
  footerDefaultDesc: string;
}

export interface ManageRoomRosterAndActionsSectionProps {
  activeSpec: OnlineSessionContextSpec;
  resolvedRoomCode: string;
  overrides: OnlineRoomControlStateOverride;
  onTabChange?: (tabId: string) => void;
  propOnCloseRoom?: () => void | Promise<void>;
  onHoverDesc: (desc: string | null) => void;
  isLight: boolean;
}

export const ManageRoomRosterAndActionsSection: React.FC<
  ManageRoomRosterAndActionsSectionProps
> = ({
  activeSpec,
  resolvedRoomCode,
  overrides,
  onTabChange,
  propOnCloseRoom,
  onHoverDesc,
  isLight,
}) => {
  const appState = useScopedStore('appStore', useAppStore);
  const {
    onlineSession,
    setOnlineSession,
    matchMode,
    setMatchMode,
    bridge,
    closeMenu,
    navigate,
  } = appState;
  const liveMatchPaused = useHudStore((s) => s.isPaused);
  const diagData = useNetworkDiagnosticsData();

  const [fallbackLocalTeam, setFallbackLocalTeam] = useState<LobbyTeamAssignment>('neutral');
  const localTeam: LobbyTeamAssignment =
    overrides.localTeam ?? onlineSession?.localTeam ?? fallbackLocalTeam;

  const teamFormat: HostMatchTeamFormat =
    overrides.teamFormat ??
    MODE_TO_FORMAT[onlineSession?.gameMode || '2v2'] ??
    'doubles';
  const botPolicy: HostMatchBotPolicy =
    overrides.botPolicy ??
    (onlineSession?.botFillMode === 'no_bots'
      ? 'none'
      : onlineSession?.botFillMode === 'bots_vs_humans'
      ? 'vs-ai'
      : onlineSession?.botFillMode === 'custom'
      ? 'custom'
      : 'auto-fill');
  const rawDurationSec = onlineSession?.matchDurationSeconds ?? 90;
  const durationPreset: HostMatchDurationPreset =
    overrides.durationPreset ??
    (rawDurationSec === 90
      ? '90'
      : rawDurationSec === 180
      ? '180'
      : rawDurationSec === 300
      ? '300'
      : 'custom');
  const customDurationSeconds = overrides.customDurationSeconds ?? rawDurationSec;

  const handleChangeTeamFormat =
    overrides.onChangeTeamFormat ??
    ((fmt: HostMatchTeamFormat) => {
      const nextGameMode = FORMAT_TO_MODE[fmt] || '2v2';
      setOnlineSession({ gameMode: nextGameMode });
      bridge.onSetOnlineGameMode?.(nextGameMode);
    });

  const handleChangeBotPolicy =
    overrides.onChangeBotPolicy ??
    ((pol: HostMatchBotPolicy) => {
      const nextBotFill =
        pol === 'none'
          ? 'no_bots'
          : pol === 'vs-ai'
          ? 'bots_vs_humans'
          : pol === 'custom'
          ? 'custom'
          : 'auto_fill';
      setOnlineSession({ botFillMode: nextBotFill });
      bridge.onSetOnlineBotFillMode?.(nextBotFill);
    });

  const handleChangeDurationPreset =
    overrides.onChangeDurationPreset ??
    ((preset: HostMatchDurationPreset) => {
      if (preset === 'custom') return;
      const secs = Number(preset) || 300;
      setOnlineSession({ matchDurationSeconds: secs });
      bridge.onSetOnlineMatchDuration?.(secs);
    });

  const handleChangeCustomDurationSeconds =
    overrides.onChangeCustomDurationSeconds ??
    ((secs: number) => {
      const clean = Math.max(0, Math.round(Number(secs) || 0));
      setOnlineSession({ matchDurationSeconds: clean });
      bridge.onSetOnlineMatchDuration?.(clean);
    });

  const handleSwitchTeam =
    overrides.onSwitchTeam ??
    ((team: LobbyTeamAssignment) => {
      setFallbackLocalTeam(team);
      setOnlineSession({ localTeam: team });
      const teamCode = team === 'blue' ? 0 : team === 'orange' ? 1 : 2;
      bridge.onSwitchOnlineRoleTeam?.('player', teamCode);
    });

  const handleKickPeer =
    overrides.onKickPeer ??
    ((peerId: string) => {
      const found = onlineSession?.connectedPeers?.find(
        (p) => String(p.id) === peerId || `car-${p.carIndex}` === peerId
      );
      if (found && typeof found.carIndex === 'number') {
        void bridge.onRemovePlayer?.(found.carIndex);
      }
    });

  const handleStartMatch =
    overrides.onStartMatch ??
    (() => {
      const targetDuration = onlineSession?.matchDurationSeconds ?? 90;
      setOnlineSession({
        roomType: 'match',
        gameMode: onlineSession?.gameMode || '3v3',
        botFillMode: onlineSession?.botFillMode || 'auto_fill',
        matchDurationSeconds: targetDuration,
      });
      bridge.onForceStartOnlineMatch?.(targetDuration);
      closeMenu();
    });

  const handleEnterMatch =
    overrides.onEnterMatch ??
    (() => {
      if (!onlineSession?.isHosting) {
        const nextReady = !onlineSession?.isReady;
        setOnlineSession({ isReady: nextReady });
        bridge.onSetClientReady?.(nextReady);
        if (matchMode === 'match') {
          const targetTeamCode = localTeam === 'orange' ? 1 : localTeam === 'blue' ? 0 : 2;
          bridge.onSwitchOnlineRoleTeam?.('player', targetTeamCode);
        }
      }
      closeMenu();
    });

  const handleOpenNetHud =
    overrides.onOpenNetHud ??
    (() => {
      floatingStore.spawnWindow({
        ...NETWORK_MONITOR_PRESET,
        startMinimized: false,
      });
    });

  const handleCloseRoom =
    propOnCloseRoom ??
    overrides.onCloseRoom ??
    (() => {
      if (bridge.onLeaveOnlineServer) {
        void bridge.onLeaveOnlineServer();
      }
      setMatchMode('freeplay');
    });

  const handleNavigateAdvanced =
    overrides.onNavigateAdvancedSettings ??
    (() => {
      onTabChange?.('exp-multi-bots');
      navigate('exp-multi-bots');
    });

  const signalingState: SignalingHealthState =
    overrides.signalingState ?? (onlineSession?.signalingConnected ? 'green' : 'yellow');
  const onRefreshSignaling =
    overrides.onRefreshSignaling ?? (() => bridge.onReconnectSignaling?.());
  const isMatchPaused = overrides.isMatchPaused ?? liveMatchPaused;
  const onTogglePause =
    overrides.onTogglePause ?? (() => bridge.onPauseOnlineMatch?.(!isMatchPaused, 3));

  return (
    <>
      {activeSpec.stage === 'lobby' && (
        <MatchLobbyRoomRecipe
          role={activeSpec.role}
          signalingState={signalingState}
          localTeam={localTeam}
          onSwitchTeam={handleSwitchTeam}
          peers={overrides.lobbyPeers}
          roomConfig={{
            roomCode: resolvedRoomCode,
            teamFormat,
            onChangeTeamFormat: handleChangeTeamFormat,
            botPolicy,
            onChangeBotPolicy: handleChangeBotPolicy,
            durationPreset,
            onChangeDurationPreset: handleChangeDurationPreset,
            customDurationSeconds,
            onChangeCustomDurationSeconds: handleChangeCustomDurationSeconds,
          }}
          utilities={{
            zeroGProbes:
              overrides.zeroGProbes ?? Boolean(diagData?.metrics?.zeroGFleetEnabled),
            onToggleZeroGProbes:
              overrides.onToggleZeroGProbes ??
              (() => void networkDiagnosticsStore.toggleZeroGFleet()),
            testSfx:
              overrides.testSfx ?? Boolean(diagData?.metrics?.testCarAudioEnabled),
            onToggleTestSfx:
              overrides.onToggleTestSfx ??
              (() => networkDiagnosticsStore.toggleTestCarAudio()),
            onResetBall: overrides.onResetBall ?? (() => bridge.onResetBall?.()),
            onOpenNetHud: handleOpenNetHud,
          }}
          actions={{
            onRefreshSignaling,
            onKickPeer: handleKickPeer,
            onStartMatch: handleStartMatch,
            onEnterMatch: handleEnterMatch,
            onNavigateAdvancedSettings: handleNavigateAdvanced,
            onStopOrLeave: handleCloseRoom,
          }}
          onHoverDesc={onHoverDesc}
          isLight={isLight}
        />
      )}

      {activeSpec.stage === 'during-match' && (
        <DuringMatchRoomRecipe
          role={activeSpec.role}
          signalingState={signalingState}
          players={overrides.matchPlayers}
          isMatchPaused={isMatchPaused}
          roomConfig={{
            roomCode: resolvedRoomCode,
            teamFormat,
            botPolicy,
            durationPreset,
            customDurationSeconds,
          }}
          localTeam={localTeam}
          actions={{
            onRefreshSignaling,
            onKickPlayer: handleKickPeer,
            onTogglePause,
            onSwitchTeam: handleSwitchTeam,
            onEnterMatch: handleEnterMatch,
            onShutdownOrLeave: handleCloseRoom,
          }}
          onHoverDesc={onHoverDesc}
          isLight={isLight}
        />
      )}

      {activeSpec.stage === 'warmup' && (
        <OnlineWarmupRoomRecipe
          role={activeSpec.role}
          roomCode={resolvedRoomCode}
          signalingState={signalingState}
          onRefreshSignaling={onRefreshSignaling}
          players={overrides.warmupPlayers}
          onKickPlayer={handleKickPeer}
          onExportTrainingReplay={() => bridge.onExportOnlineTrainingReplay?.(60)}
          onShutdownOrLeave={handleCloseRoom}
          onHoverDesc={onHoverDesc}
          isLight={isLight}
        />
      )}
    </>
  );
};
