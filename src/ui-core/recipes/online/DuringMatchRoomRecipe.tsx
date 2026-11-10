import React, { useEffect, useState } from 'react';
import {
  Bot,
  Eye,
  User,
  UserRoundX,
} from 'lucide-react';
import type { ActiveMatchPlayer } from './DuringMatchClientRejoinControls';
import {
  ClientRoomTopBars,
  OnlineRoomTopStatusBar,
  type SignalingHealthState,
} from './OnlineRoomTopStatusBar';
import type {
  HostMatchBotPolicy,
  HostMatchDurationPreset,
  HostMatchTeamFormat,
} from './OnlineRoomConfigSummaryCard';
import type { LobbyTeamAssignment } from './MatchLobbyTeamRosterSection';
import { DuringMatchRoomControlsSection } from './DuringMatchRoomControlsSection';


export interface DuringMatchRoomConfig {
  roomCode?: string;
  pairId?: string;
  teamFormat?: HostMatchTeamFormat;
  botPolicy?: HostMatchBotPolicy;
  durationPreset?: HostMatchDurationPreset;
  customDurationSeconds?: number;
}

export interface DuringMatchActions {
  onRefreshSignaling?: () => void | Promise<void>;
  onKickPlayer?: (id: string) => void;
  onTogglePause?: () => void;
  onSwitchTeam?: (team: LobbyTeamAssignment) => void;
  onEnterMatch?: () => void;
  onShutdownOrLeave?: () => void;
}

export interface DuringMatchRoomRecipeProps {
  role: 'host' | 'client';
  signalingState?: SignalingHealthState;
  players?: ActiveMatchPlayer[];
  isMatchPaused?: boolean;
  roomConfig?: DuringMatchRoomConfig;
  localTeam?: LobbyTeamAssignment;
  actions?: DuringMatchActions;
  onHoverDesc?: (desc: string | null) => void;
  isLight?: boolean;
}

const INITIAL_MATCH_PLAYERS: ActiveMatchPlayer[] = [
  { id: 'b-1', name: 'Player_01 (Host)', pingMs: 0, pairId: '1A0F', team: 'blue', isHost: true },
  { id: 'b-2', name: 'Aerial_Vortex', pingMs: 28, pairId: '4D1E', team: 'blue' },
  { id: 'b-3', name: 'Nexto_Bot_1', pingMs: 0, team: 'blue', isBot: true },
  { id: 'o-1', name: 'OctaneMain_99', pingMs: 22, pairId: '9B2C', team: 'orange' },
  { id: 'o-2', name: 'FlipReset_Pro', pingMs: 0, pairId: '5E7A', team: 'orange', noInput: true },
];

export const DuringMatchRoomRecipe: React.FC<DuringMatchRoomRecipeProps> = React.memo(({
  role,
  signalingState: controlledSignaling,
  players: controlledPlayers,
  isMatchPaused: controlledPaused,
  roomConfig,
  localTeam: controlledLocalTeam,
  actions,
  onHoverDesc,
  isLight = false,
}) => {
  const {
    onRefreshSignaling,
    onKickPlayer,
    onTogglePause,
    onSwitchTeam,
    onEnterMatch,
    onShutdownOrLeave,
  } = actions ?? {};
  const {
    roomCode = 'RL-8924',
    pairId = '7F3A',
    teamFormat = 'standard',
    botPolicy = 'auto-fill',
    durationPreset = '300',
    customDurationSeconds = 300,
  } = roomConfig ?? {};
  const isHost = role === 'host';
  const [internalSignaling, setInternalSignaling] = useState<SignalingHealthState>('green');
  const [internalPlayers, setInternalPlayers] = useState<ActiveMatchPlayer[]>(INITIAL_MATCH_PLAYERS);
  const [showPairId, setShowPairId] = useState<boolean>(isHost);

  const [internalClientJoinTeam, setInternalClientJoinTeam] = useState<LobbyTeamAssignment>('neutral');
  const clientJoinTeam = controlledLocalTeam ?? internalClientJoinTeam;
  const setClientJoinTeam = (team: LobbyTeamAssignment) => {
    setInternalClientJoinTeam(team);
    onSwitchTeam?.(team);
  };
  const [selectedReplaceId, setSelectedReplaceId] = useState<string | null>(null);
  const [joinedMatchState, setJoinedMatchState] = useState<'idle' | 'joined' | 'replaced'>('idle');

  useEffect(() => {
    setShowPairId(isHost);
  }, [isHost]);

  const signalingState = controlledSignaling ?? internalSignaling;
  const setSignalingState = setInternalSignaling;
  const players = controlledPlayers ?? internalPlayers;

  const bluePlayers = players.filter((p) => p.team === 'blue');
  const orangePlayers = players.filter((p) => p.team === 'orange');
  const humanPlayersCount = players.filter((p) => !p.isBot).length;

  const selectedReplacePlayer = players.find(
    (p) => p.id === selectedReplaceId && !p.isHost && p.noInput
  );

  const handleRemovePlayer = (id: string) => {
    if (onKickPlayer) {
      onKickPlayer(id);
    } else {
      setInternalPlayers((prev) => prev.filter((p) => p.id !== id));
    }
  };

  const renderTeamColumn = (
    team: 'blue' | 'orange',
    teamPlayers: ActiveMatchPlayer[]
  ) => {
    const isBlue = team === 'blue';
    const iconColor = isBlue ? 'text-sky-400' : 'text-orange-400';

    return (
      <div
        className={`rounded-xl border p-2.5 flex flex-col gap-1.5 ${
          isBlue
            ? isLight
              ? 'bg-sky-50/45 border-sky-200/90'
              : 'bg-sky-950/20 border-sky-500/30'
            : isLight
            ? 'bg-orange-50/45 border-orange-200/90'
            : 'bg-orange-950/20 border-orange-500/30'
        }`}
      >
        <div
          className={`flex items-center justify-between text-[11px] font-mono font-bold ${
            isBlue ? 'text-sky-400' : 'text-orange-400'
          }`}
        >
          <span className="flex items-center gap-1.5">
            <span
              className={`w-2 h-2 rounded-full ${
                isBlue ? 'bg-sky-400' : 'bg-orange-400'
              }`}
            />
            <span>{isBlue ? 'BLUE TEAM' : 'ORANGE TEAM'}</span>
          </span>
          <span>{teamPlayers.length} / 3</span>
        </div>

        <div className="flex flex-col gap-1">
          {teamPlayers.map((p) => {
            const isSelfRow = isHost && p.isHost;
            const canSelectForReplace = !isHost && !p.isHost && !p.isBot && Boolean(p.noInput);
            const isSelectedForReplace = canSelectForReplace && selectedReplaceId === p.id;

            return (
              <div
                key={p.id}
                onClick={
                  canSelectForReplace
                    ? () => {
                        setJoinedMatchState('idle');
                        setSelectedReplaceId((prev) => (prev === p.id ? null : p.id));
                      }
                    : undefined
                }
                className={`flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg border text-xs font-mono transition-all ${
                  isSelectedForReplace
                    ? isLight
                      ? 'bg-amber-50 border-amber-500 ring-2 ring-amber-400/40 cursor-pointer'
                      : 'bg-amber-950/35 border-amber-400 ring-2 ring-amber-400/35 cursor-pointer'
                    : canSelectForReplace
                    ? isLight
                      ? 'bg-white hover:bg-amber-50/60 border-amber-300/90 cursor-pointer'
                      : 'bg-neutral-950/65 hover:bg-amber-950/25 border-amber-500/35 cursor-pointer'
                    : p.isBot
                    ? isLight
                      ? 'bg-neutral-100/70 border-dashed border-neutral-300 text-neutral-600'
                      : 'bg-neutral-900/40 border-dashed border-neutral-800 text-neutral-400'
                    : isLight
                    ? 'bg-white border-neutral-200/90'
                    : 'bg-neutral-950/65 border-neutral-800/90'
                }`}
                title={
                  canSelectForReplace
                    ? `No Input detected for ${p.name} — click to select for Replace & Enter`
                    : undefined
                }
              >
                <div className="flex items-center gap-2 min-w-0">
                  {p.isBot ? (
                    <Bot className={`h-3.5 w-3.5 shrink-0 ${iconColor}`} />
                  ) : (
                    <User className={`h-3.5 w-3.5 shrink-0 ${iconColor}`} />
                  )}
                  <span
                    className={`truncate text-[11px] ${
                      isSelfRow
                        ? isLight
                          ? 'font-bold text-neutral-900'
                          : 'font-bold text-white'
                        : isLight
                        ? 'text-neutral-800'
                        : 'text-neutral-200'
                    }`}
                  >
                    {p.name}
                  </span>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  {p.noInput && !p.isHost && (
                    <span
                      className={`px-1.5 py-0.5 rounded text-[9px] font-semibold border ${
                        isSelectedForReplace
                          ? 'bg-amber-500 text-neutral-950 border-amber-400'
                          : 'bg-amber-500/15 border-amber-500/35 text-amber-500'
                      }`}
                    >
                      {isSelectedForReplace ? 'Replace Selected' : 'No Input'}
                    </span>
                  )}

                  {!p.isBot && !p.noInput && (
                    <span
                      className={`text-[10px] tabular-nums ${
                        showPairId
                          ? isLight
                            ? 'text-neutral-700 font-semibold'
                            : 'text-neutral-300 font-semibold'
                          : 'text-emerald-500'
                      }`}
                    >
                      {showPairId
                        ? `#${p.pairId || '7F3A'}`
                        : p.isHost
                        ? '0ms'
                        : `${p.pingMs}ms`}
                    </span>
                  )}

                  {isHost && !p.isHost && !p.isBot && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRemovePlayer(p.id);
                      }}
                      className="inline-flex items-center justify-center p-1 rounded-md border border-rose-500/35 bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 cursor-pointer transition-colors"
                      title="Kick player from match"
                      aria-label={`Kick ${p.name}`}
                    >
                      <UserRoundX className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-3 w-full select-none">
      {/* 1. Top Status Bar (Host vs Client) */}
      {isHost ? (
        <OnlineRoomTopStatusBar
          roomCode={roomCode}
          signalingState={signalingState}
          onChangeSignalingState={setSignalingState}
          onRefreshSignaling={onRefreshSignaling}
          onHoverDesc={onHoverDesc}
          isLight={isLight}
        />
      ) : (
        <ClientRoomTopBars
          roomCode={roomCode}
          pairId={pairId}
          daisyChainSignaling={signalingState}
          onChangeDaisyChainSignaling={setSignalingState}
          onHoverDesc={onHoverDesc}
          isLight={isLight}
        />
      )}

      {/* 2. PLAYERS IN MATCH (2 Columns: Blue Team | Orange Team) */}
      <div
        data-ui-element="during-match-players"
        className="flex flex-col gap-1.5"
        onMouseEnter={() =>
          onHoverDesc?.(
            isHost
              ? 'Players in Match: Split into Blue Team and Orange Team. Toggle Pair ID (Eye) to inspect peer IDs or use the red icon to kick.'
              : 'Players in Match: Select a team below (Blue / Auto / Orange) to join mid-match, or click a No Input player to Replace & Enter.'
          )
        }
        onMouseLeave={() => onHoverDesc?.(null)}
      >
        <div className="flex items-center justify-between text-xs font-mono font-semibold text-neutral-400">
          <div className="flex items-center gap-2">
            <span>PLAYERS IN MATCH</span>
            <span className={isLight ? 'text-black font-bold' : 'text-white font-bold'}>
              {humanPlayersCount} / 6
            </span>
          </div>

          <button
            type="button"
            onClick={() => setShowPairId((prev) => !prev)}
            className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md border text-[10px] font-mono font-bold cursor-pointer transition-colors ${
              showPairId
                ? isLight
                  ? 'bg-neutral-900 border-neutral-900 text-white shadow-2xs'
                  : 'bg-neutral-100 border-neutral-100 text-neutral-950 shadow-2xs'
                : isLight
                ? 'bg-neutral-100 hover:bg-neutral-200 border-neutral-300 text-neutral-600'
                : 'bg-neutral-900 hover:bg-neutral-800 border-neutral-800 text-neutral-400'
            }`}
            title="Toggle Pair ID display instead of RTT"
          >
            <Eye className="h-3 w-3" />
            <span>Pair ID</span>
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {renderTeamColumn('blue', bluePlayers)}
          {renderTeamColumn('orange', orangePlayers)}
        </div>
      </div>

      <DuringMatchRoomControlsSection
        isHost={isHost}
        rejoinState={{
          selectedReplacePlayer,
          clientJoinTeam,
          joinedMatchState,
          onSelectTeam: (team) => {
            setSelectedReplaceId(null);
            setJoinedMatchState('idle');
            setClientJoinTeam(team);
          },
          onJoinOrReplace: () => {
            if (selectedReplacePlayer) {
              setJoinedMatchState((prev) => (prev === 'replaced' ? 'idle' : 'replaced'));
              onSwitchTeam?.(selectedReplacePlayer.team);
            } else {
              setJoinedMatchState((prev) => (prev === 'joined' ? 'idle' : 'joined'));
              onSwitchTeam?.(clientJoinTeam);
            }
            onEnterMatch?.();
          },
        }}
        configSummary={{
          teamFormat,
          botPolicy,
          durationPreset,
          customDurationSeconds,
        }}
        controlledPaused={controlledPaused}
        onTogglePause={onTogglePause}
        onShutdownOrLeave={onShutdownOrLeave}
        onHoverDesc={onHoverDesc}
        isLight={isLight}
      />
    </div>
  );
});

DuringMatchRoomRecipe.displayName = 'DuringMatchRoomRecipe';
