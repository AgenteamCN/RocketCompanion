import React from 'react';
import { Check, Play, UserCheck } from 'lucide-react';
import type { LobbyTeamAssignment } from './MatchLobbyTeamRosterSection';
export interface ActiveMatchPlayer {
  id: string;
  name: string;
  pingMs: number;
  pairId?: string;
  team: 'blue' | 'orange';
  isHost?: boolean;
  isSelf?: boolean;
  isBot?: boolean;
  /** True when peer has disconnected or stopped sending input and can be replaced on rejoin */
  noInput?: boolean;
}
export interface DuringMatchClientRejoinControlsProps {
  selectedReplacePlayer?: ActiveMatchPlayer;
  clientJoinTeam: LobbyTeamAssignment;
  joinedMatchState: 'idle' | 'joined' | 'replaced';
  onSelectTeam: (team: LobbyTeamAssignment) => void;
  onJoinOrReplace: () => void;
  onHoverDesc?: (desc: string | null) => void;
  isLight?: boolean;
}

export const DuringMatchClientRejoinControls: React.FC<DuringMatchClientRejoinControlsProps> = ({
  selectedReplacePlayer,
  clientJoinTeam,
  joinedMatchState,
  onSelectTeam,
  onJoinOrReplace,
  onHoverDesc,
  isLight = false,
}) => (
  <div data-ui-element="during-match-client-rejoin-controls" className="flex flex-col gap-2">
    <div
      className="grid grid-cols-3 gap-2"
      onMouseEnter={() =>
        onHoverDesc?.(
          'Mid-Match Side Selection: Choose Blue, Auto (default), or Orange when joining or reconnecting during an active match.'
        )
      }
      onMouseLeave={() => onHoverDesc?.(null)}
    >
      <button
        type="button"
        onClick={() => onSelectTeam('blue')}
        className={`py-2 px-3 rounded-xl border text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
          !selectedReplacePlayer && clientJoinTeam === 'blue'
            ? 'bg-sky-500 text-white border-sky-400 shadow-sm ring-2 ring-sky-400/35'
            : isLight
            ? 'bg-sky-500/10 hover:bg-sky-500/20 border-sky-400/45 text-sky-700'
            : 'bg-sky-500/12 hover:bg-sky-500/22 border-sky-500/35 text-sky-400'
        }`}
      >
        {!selectedReplacePlayer && clientJoinTeam === 'blue' && (
          <Check className="h-3.5 w-3.5 stroke-[2.5]" />
        )}
        <span>Blue</span>
      </button>

      <button
        type="button"
        onClick={() => onSelectTeam('neutral')}
        className={`py-2 px-3 rounded-xl border text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
          !selectedReplacePlayer && clientJoinTeam === 'neutral'
            ? isLight
              ? 'bg-neutral-800 text-white border-neutral-700 shadow-sm ring-2 ring-neutral-400/40'
              : 'bg-neutral-200 text-neutral-950 border-white shadow-sm ring-2 ring-neutral-300/35'
            : isLight
            ? 'bg-neutral-200/75 hover:bg-neutral-300/80 border-neutral-400/50 text-neutral-700'
            : 'bg-neutral-800/75 hover:bg-neutral-700/80 border-neutral-600/50 text-neutral-300'
        }`}
      >
        {!selectedReplacePlayer && clientJoinTeam === 'neutral' && (
          <Check className="h-3.5 w-3.5 stroke-[2.5]" />
        )}
        <span>Auto</span>
      </button>

      <button
        type="button"
        onClick={() => onSelectTeam('orange')}
        className={`py-2 px-3 rounded-xl border text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
          !selectedReplacePlayer && clientJoinTeam === 'orange'
            ? 'bg-orange-500 text-white border-orange-400 shadow-sm ring-2 ring-orange-400/35'
            : isLight
            ? 'bg-orange-500/10 hover:bg-orange-500/20 border-orange-400/45 text-orange-700'
            : 'bg-orange-500/12 hover:bg-orange-500/22 border-orange-500/35 text-orange-400'
        }`}
      >
        {!selectedReplacePlayer && clientJoinTeam === 'orange' && (
          <Check className="h-3.5 w-3.5 stroke-[2.5]" />
        )}
        <span>Orange</span>
      </button>
    </div>

    <button
      type="button"
      onClick={onJoinOrReplace}
      onMouseEnter={() =>
        onHoverDesc?.(
          selectedReplacePlayer
            ? `Replace & Enter: Take over the No Input slot of ${selectedReplacePlayer.name} (${selectedReplacePlayer.team.toUpperCase()} Team).`
            : 'Join Match: Enter the ongoing match with your selected side (Blue / Auto / Orange).'
        )
      }
      onMouseLeave={() => onHoverDesc?.(null)}
      className="w-full py-2.5 px-5 rounded-xl bg-amber-500 hover:bg-amber-400 text-neutral-950 font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all cursor-pointer shadow-xs"
    >
      {selectedReplacePlayer ? (
        <>
          <UserCheck className="h-3.5 w-3.5" />
          <span>
            {joinedMatchState === 'replaced'
              ? `Replaced ${selectedReplacePlayer.name} · In Match`
              : `Replace & Enter (${selectedReplacePlayer.name})`}
          </span>
        </>
      ) : (
        <>
          <Play className="h-3.5 w-3.5 fill-current" />
          <span>
            {joinedMatchState === 'joined' ? 'Joined Match · In Arena' : 'Join Match'}
          </span>
        </>
      )}
    </button>
  </div>
);
