import React, { useState } from 'react';
import { Pause, Play } from 'lucide-react';
import {
  DuringMatchClientRejoinControls,
  type ActiveMatchPlayer,
} from './DuringMatchClientRejoinControls';
import {
  DuringMatchSpectatorsSection,
  type SpectatorRouteEntry,
} from './DuringMatchSpectatorsSection';
import {
  DoubleConfirmServerButton,
  OnlineRoomConfigSummaryCard,
  type HostMatchBotPolicy,
  type HostMatchDurationPreset,
  type HostMatchTeamFormat,
} from './OnlineRoomConfigSummaryCard';
import type { LobbyTeamAssignment } from './MatchLobbyTeamRosterSection';

const INITIAL_SPECTATORS: SpectatorRouteEntry[] = [
  {
    id: 'spec-1',
    name: 'Caster_Alpha',
    pingMs: 19,
    pairId: '9B2C',
    fromPlayer: 'OctaneMain_99',
    isDirectHost: false,
    isViaLocalClient: true,
  },
  {
    id: 'spec-2',
    name: 'Scout_Lens',
    pingMs: 34,
    pairId: '4D1E',
    fromPlayer: 'Host (Direct P2P)',
    isDirectHost: true,
    isViaLocalClient: false,
  },
  {
    id: 'spec-3',
    name: 'ReplayWatcher_07',
    pingMs: 27,
    pairId: '8A5F',
    fromPlayer: 'Aerial_Vortex',
    isDirectHost: false,
    isViaLocalClient: true,
  },
];

export interface DuringMatchRoomControlsConfig {
  teamFormat: HostMatchTeamFormat;
  botPolicy: HostMatchBotPolicy;
  durationPreset: HostMatchDurationPreset;
  customDurationSeconds: number;
}

export interface DuringMatchClientRejoinState {
  selectedReplacePlayer?: ActiveMatchPlayer;
  clientJoinTeam: LobbyTeamAssignment;
  joinedMatchState: 'idle' | 'joined' | 'replaced';
  onSelectTeam: (team: LobbyTeamAssignment) => void;
  onJoinOrReplace: () => void;
}

export interface DuringMatchRoomControlsSectionProps {
  isHost: boolean;
  rejoinState: DuringMatchClientRejoinState;
  configSummary: DuringMatchRoomControlsConfig;
  controlledPaused?: boolean;
  onTogglePause?: () => void;
  onShutdownOrLeave?: () => void;
  onHoverDesc?: (desc: string | null) => void;
  isLight?: boolean;
}

export const DuringMatchRoomControlsSection: React.FC<
  DuringMatchRoomControlsSectionProps
> = React.memo(({
  isHost,
  rejoinState,
  configSummary,
  controlledPaused,
  onTogglePause,
  onShutdownOrLeave,
  onHoverDesc,
  isLight = false,
}) => {
  const [spectators, setSpectators] = useState<SpectatorRouteEntry[]>(INITIAL_SPECTATORS);
  const [internalPauseRequested, setInternalPauseRequested] = useState<boolean>(false);

  const pauseRequested = controlledPaused ?? internalPauseRequested;
  const visibleSpectators = isHost
    ? spectators
    : spectators.filter((s) => s.isViaLocalClient);

  const handleRemoveSpectator = (id: string) => {
    setSpectators((prev) => prev.filter((s) => s.id !== id));
  };

  const {
    teamFormat,
    botPolicy,
    durationPreset,
    customDurationSeconds,
  } = configSummary;

  return (
    <>
      {/* 2B. Client Mid-Match Join / Reconnect Controls: Blue | Auto | Orange + Join Match / Replace & Enter */}
      {!isHost && (
        <DuringMatchClientRejoinControls
          selectedReplacePlayer={rejoinState.selectedReplacePlayer}
          clientJoinTeam={rejoinState.clientJoinTeam}
          joinedMatchState={rejoinState.joinedMatchState}
          onSelectTeam={rejoinState.onSelectTeam}
          onJoinOrReplace={rejoinState.onJoinOrReplace}
          onHoverDesc={onHoverDesc}
          isLight={isLight}
        />
      )}

      {/* 3. SPECTATING Section (Host: All + from player route; Client: Only Spectating via You) */}
      <DuringMatchSpectatorsSection
        isHost={isHost}
        visibleSpectators={visibleSpectators}
        onRemoveSpectator={handleRemoveSpectator}
        onHoverDesc={onHoverDesc}
        isLight={isLight}
      />

      {/* 4. Read-Only Match Information Card (No Configure / Custom during active match) */}
      <OnlineRoomConfigSummaryCard
        title="Match Information"
        teamFormat={teamFormat}
        botPolicy={botPolicy}
        durationPreset={durationPreset}
        customDurationSeconds={customDurationSeconds}
        editor={{ editable: false }}
        onHoverDesc={onHoverDesc}
        isLight={isLight}
      />

      {/* 5. Pause Row: Host = Request to Pause (Pause Match); Client = Ask to Pause */}
      <button
        type="button"
        onClick={() => {
          setInternalPauseRequested((prev) => !prev);
          onTogglePause?.();
        }}
        onMouseEnter={() =>
          onHoverDesc?.(
            isHost
              ? 'Request to Pause: Trigger or resume authoritative match pause.'
              : 'Ask to Pause: Send a non-authoritative pause request notification to the Host.'
          )
        }
        onMouseLeave={() => onHoverDesc?.(null)}
        className={`w-full py-2 px-4 rounded-xl border text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-colors cursor-pointer ${
          pauseRequested
            ? 'bg-amber-500/20 border-amber-500/45 text-amber-400'
            : isLight
            ? 'bg-neutral-100 hover:bg-neutral-200 border-neutral-300 text-neutral-800'
            : 'bg-neutral-800/90 hover:bg-neutral-700 border-neutral-700 text-neutral-200'
        }`}
      >
        {pauseRequested ? (
          <Play className="h-3.5 w-3.5" />
        ) : (
          <Pause className="h-3.5 w-3.5 text-amber-500" />
        )}
        <span>
          {isHost
            ? pauseRequested
              ? 'Match Paused · Click to Resume'
              : 'Request to Pause'
            : pauseRequested
            ? 'Pause Requested (Waiting for Host...)'
            : 'Ask to Pause'}
        </span>
      </button>

      {/* 6. Bottom Row: Host = Double-Confirm Shutdown Server; Client = Leave Room */}
      <DoubleConfirmServerButton
        label={isHost ? 'Shutdown Server' : 'Leave Room'}
        requireDoubleConfirm={isHost}
        onConfirm={onShutdownOrLeave}
        onHoverDesc={onHoverDesc}
        isLight={isLight}
      />
    </>
  );
});

DuringMatchRoomControlsSection.displayName = 'DuringMatchRoomControlsSection';
