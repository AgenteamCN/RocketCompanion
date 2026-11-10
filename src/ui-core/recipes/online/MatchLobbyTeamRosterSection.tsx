import React, { useEffect, useState } from 'react';
import { Bot, Check, Eye, User, UserRoundX } from 'lucide-react';

export type LobbyTeamAssignment = 'blue' | 'neutral' | 'orange';

export interface LobbyPlayerSlot {
  id: string;
  name: string;
  pingMs: number;
  pairId?: string;
  team: LobbyTeamAssignment;
  isHost?: boolean;
  isSelf?: boolean;
  isBot?: boolean;
  botLabel?: string;
}

const FALLBACK_PAIR_IDS: Record<string, string> = {
  self: '7F3A',
  'host-peer': '1A0F',
  'peer-1': '9B2C',
  'peer-2': '4D1E',
};

export interface MatchLobbyRosterData {
  slotsPerSide: number;
  maxPlayers: number;
  humanCount: number;
  blueRoster: LobbyPlayerSlot[];
  neutralRoster: LobbyPlayerSlot[];
  orangeRoster: LobbyPlayerSlot[];
}

export interface MatchLobbyPairIdControls {
  showPairId?: boolean;
  onTogglePairId?: () => void;
}

export interface MatchLobbyTeamRosterSectionProps {
  isLight: boolean;
  isHost: boolean;
  localTeam: LobbyTeamAssignment;
  setLocalTeam: (team: LobbyTeamAssignment) => void;
  rosterLayout: 'stacked' | 'columns';
  roster: MatchLobbyRosterData;
  pairIdControls?: MatchLobbyPairIdControls;
  onRemovePeer: (peerId: string) => void;
  onHoverDesc?: (desc: string | null) => void;
}

export const MatchLobbyTeamRosterSection: React.FC<MatchLobbyTeamRosterSectionProps> = React.memo(
  ({
    isLight,
    isHost,
    localTeam,
    setLocalTeam,
    rosterLayout,
    roster,
    pairIdControls,
    onRemovePeer,
    onHoverDesc,
  }) => {
    const {
      slotsPerSide,
      maxPlayers,
      humanCount,
      blueRoster,
      neutralRoster,
      orangeRoster,
    } = roster;
    const controlledShowPairId = pairIdControls?.showPairId;
    const onTogglePairId = pairIdControls?.onTogglePairId;
    const [internalShowPairId, setInternalShowPairId] = useState<boolean>(isHost);

    useEffect(() => {
      setInternalShowPairId(isHost);
    }, [isHost]);

    const isPairIdActive = controlledShowPairId ?? internalShowPairId;
    const handleTogglePairId = () => {
      if (onTogglePairId) {
        onTogglePairId();
      } else {
        setInternalShowPairId((prev) => !prev);
      }
    };

    const resolveSlotPairId = (slot: LobbyPlayerSlot): string => {
      if (slot.pairId) return slot.pairId;
      if (FALLBACK_PAIR_IDS[slot.id]) return FALLBACK_PAIR_IDS[slot.id];
      return '8E4B';
    };

    const renderSlotRow = (slot: LobbyPlayerSlot, teamColor: LobbyTeamAssignment) => {
      const iconColorClass =
        teamColor === 'blue'
          ? 'text-sky-400'
          : teamColor === 'orange'
          ? 'text-orange-400'
          : 'text-neutral-400';

      return (
        <div
          key={slot.id}
          className={`flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg border text-xs font-mono ${
            slot.isBot
              ? isLight
                ? 'bg-neutral-100/70 border-dashed border-neutral-300 text-neutral-600'
                : 'bg-neutral-900/40 border-dashed border-neutral-800 text-neutral-400'
              : slot.isSelf
              ? teamColor === 'blue'
                ? 'bg-sky-500/10 border-sky-500/35'
                : teamColor === 'orange'
                ? 'bg-orange-500/10 border-orange-500/35'
                : isLight
                ? 'bg-neutral-200/70 border-neutral-300'
                : 'bg-neutral-800/70 border-neutral-700'
              : isLight
              ? 'bg-white border-neutral-200/90'
              : 'bg-neutral-950/60 border-neutral-800/90'
          }`}
        >
          <div className="flex items-center gap-2 min-w-0">
            {slot.isBot ? (
              <Bot className={`h-3.5 w-3.5 shrink-0 ${iconColorClass}`} />
            ) : (
              <User className={`h-3.5 w-3.5 shrink-0 ${iconColorClass}`} />
            )}
            <span
              className={`truncate ${
                slot.isSelf
                  ? isLight
                    ? 'font-bold text-neutral-900'
                    : 'font-bold text-white'
                  : isLight
                  ? 'text-neutral-800'
                  : 'text-neutral-200'
              }`}
            >
              {slot.name}
            </span>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {!slot.isBot && (
              <span
                className={`text-[10px] tabular-nums ${
                  isPairIdActive
                    ? isLight
                      ? 'text-neutral-700 font-semibold'
                      : 'text-neutral-300 font-semibold'
                    : 'text-emerald-500'
                }`}
              >
                {isPairIdActive
                  ? `#${resolveSlotPairId(slot)} · ${slot.isHost ? '0ms' : `${slot.pingMs}ms`}`
                  : slot.isHost
                  ? '0ms'
                  : `${slot.pingMs}ms`}
              </span>
            )}

            {isHost && !slot.isSelf && !slot.isBot && (
              <button
                type="button"
                onClick={() => onRemovePeer(slot.id)}
                className="inline-flex items-center justify-center p-1 rounded-md border border-rose-500/35 bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 cursor-pointer transition-colors"
                title="Kick player from room"
                aria-label={`Kick ${slot.name}`}
              >
                <UserRoundX className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      );
    };

    const renderTeamBoxes = () => (
      <>
        {/* Blue Team Section */}
        <div
          className={`rounded-xl border p-2.5 flex flex-col gap-1.5 ${
            isLight
              ? 'bg-sky-50/45 border-sky-200/90'
              : 'bg-sky-950/20 border-sky-500/30'
          }`}
        >
          <div className="flex items-center justify-between text-[11px] font-mono font-bold text-sky-400">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-sky-400" />
              <span>BLUE TEAM</span>
            </span>
            <span>
              {blueRoster.length} / {slotsPerSide}
            </span>
          </div>
          {blueRoster.length > 0 ? (
            blueRoster.map((slot) => renderSlotRow(slot, 'blue'))
          ) : (
            <div className="text-[11px] font-mono text-neutral-400 py-1 text-center">
              No Blue players assigned
            </div>
          )}
        </div>

        {/* Auto (Pre-assigned) Section */}
        <div
          className={`rounded-xl border p-2.5 flex flex-col gap-1.5 ${
            isLight
              ? 'bg-neutral-100/75 border-neutral-300/80'
              : 'bg-neutral-900/55 border-neutral-800'
          }`}
        >
          <div className="flex items-center justify-between text-[11px] font-mono font-bold text-neutral-400">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-neutral-400" />
              <span>AUTO</span>
            </span>
            <span>{neutralRoster.length}</span>
          </div>
          {neutralRoster.length > 0 ? (
            neutralRoster.map((slot) => renderSlotRow(slot, 'neutral'))
          ) : (
            <div className="text-[11px] font-mono text-neutral-500 py-1 text-center">
              No players in Auto
            </div>
          )}
        </div>

        {/* Orange Team Section */}
        <div
          className={`rounded-xl border p-2.5 flex flex-col gap-1.5 ${
            isLight
              ? 'bg-orange-50/45 border-orange-200/90'
              : 'bg-orange-950/20 border-orange-500/30'
          }`}
        >
          <div className="flex items-center justify-between text-[11px] font-mono font-bold text-orange-400">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-orange-400" />
              <span>ORANGE TEAM</span>
            </span>
            <span>
              {orangeRoster.length} / {slotsPerSide}
            </span>
          </div>
          {orangeRoster.length > 0 ? (
            orangeRoster.map((slot) => renderSlotRow(slot, 'orange'))
          ) : (
            <div className="text-[11px] font-mono text-neutral-400 py-1 text-center">
              No Orange players assigned
            </div>
          )}
        </div>
      </>
    );

    return (
      <>
        {/* 2. PLAYERS IN ROOM (3-Column default, Stacked variation hidden, Pair ID Eye toggle) */}
        <div
          data-ui-element="lobby-players-in-room"
          className="flex flex-col gap-1.5"
          onMouseEnter={() =>
            onHoverDesc?.(
              'Players in Room: Wide 3-column team roster (Blue / Auto / Orange). Toggle Pair ID (Eye) to inspect per-peer P2P Pair IDs alongside RTT.'
            )
          }
          onMouseLeave={() => onHoverDesc?.(null)}
        >
          <div className="flex items-center justify-between text-xs font-mono font-semibold text-neutral-400">
            <div className="flex items-center gap-2">
              <span>PLAYERS IN ROOM</span>
              <span className={isLight ? 'text-black font-bold' : 'text-white font-bold'}>
                {humanCount} / {maxPlayers}
              </span>
              <span
                className={`text-[10px] font-normal ${
                  isLight ? 'text-neutral-400' : 'text-neutral-500'
                }`}
                title="Vertical Stacked roster variation is hidden; 3-Column view is used by default"
              >
                · Stacked variation hidden
              </span>
            </div>

            <button
              type="button"
              onClick={handleTogglePairId}
              className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md border text-[10px] font-mono font-bold cursor-pointer transition-colors ${
                isPairIdActive
                  ? isLight
                    ? 'bg-neutral-900 border-neutral-900 text-white shadow-2xs'
                    : 'bg-neutral-100 border-neutral-100 text-neutral-950 shadow-2xs'
                  : isLight
                  ? 'bg-neutral-100 hover:bg-neutral-200 border-neutral-300 text-neutral-600'
                  : 'bg-neutral-900 hover:bg-neutral-800 border-neutral-800 text-neutral-400'
              }`}
              title="Toggle Pair ID display instead of RTT (Active by default on Host)"
            >
              <Eye className="h-3 w-3" />
              <span>Pair ID</span>
            </button>
          </div>

          {/* Default 3-Column View */}
          <div className={rosterLayout === 'columns' ? 'grid grid-cols-3 gap-2' : 'hidden'}>
            {renderTeamBoxes()}
          </div>

          {/* Preserved Vertical Stacked Variation (Hidden by default) */}
          <div
            data-ui-variation="stacked-roster-hidden"
            className={rosterLayout === 'stacked' ? 'flex flex-col gap-2' : 'hidden'}
          >
            {renderTeamBoxes()}
          </div>
        </div>

        {/* 3. Three-Button Team Switcher: Blue | Auto | Orange (Default: Auto) */}
        <div
          data-ui-element="lobby-team-switcher-3way"
          className="grid grid-cols-3 gap-2"
          onMouseEnter={() =>
            onHoverDesc?.(
              'Team Selection: Choose Blue, Auto (default), or Orange. Active selection is clearly highlighted.'
            )
          }
          onMouseLeave={() => onHoverDesc?.(null)}
        >
          <button
            type="button"
            onClick={() => setLocalTeam('blue')}
            className={`py-2 px-3 rounded-xl border text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
              localTeam === 'blue'
                ? 'bg-sky-500 text-white border-sky-400 shadow-sm ring-2 ring-sky-400/35'
                : isLight
                ? 'bg-sky-500/10 hover:bg-sky-500/20 border-sky-400/45 text-sky-700'
                : 'bg-sky-500/12 hover:bg-sky-500/22 border-sky-500/35 text-sky-400'
            }`}
          >
            {localTeam === 'blue' && <Check className="h-3.5 w-3.5 stroke-[2.5]" />}
            <span>Blue</span>
          </button>

          <button
            type="button"
            onClick={() => setLocalTeam('neutral')}
            className={`py-2 px-3 rounded-xl border text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
              localTeam === 'neutral'
                ? isLight
                  ? 'bg-neutral-800 text-white border-neutral-700 shadow-sm ring-2 ring-neutral-400/40'
                  : 'bg-neutral-200 text-neutral-950 border-white shadow-sm ring-2 ring-neutral-300/35'
                : isLight
                ? 'bg-neutral-200/75 hover:bg-neutral-300/80 border-neutral-400/50 text-neutral-700'
                : 'bg-neutral-800/75 hover:bg-neutral-700/80 border-neutral-600/50 text-neutral-300'
            }`}
          >
            {localTeam === 'neutral' && <Check className="h-3.5 w-3.5 stroke-[2.5]" />}
            <span>Auto</span>
          </button>

          <button
            type="button"
            onClick={() => setLocalTeam('orange')}
            className={`py-2 px-3 rounded-xl border text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
              localTeam === 'orange'
                ? 'bg-orange-500 text-white border-orange-400 shadow-sm ring-2 ring-orange-400/35'
                : isLight
                ? 'bg-orange-500/10 hover:bg-orange-500/20 border-orange-400/45 text-orange-700'
                : 'bg-orange-500/12 hover:bg-orange-500/22 border-orange-500/35 text-orange-400'
            }`}
          >
            {localTeam === 'orange' && <Check className="h-3.5 w-3.5 stroke-[2.5]" />}
            <span>Orange</span>
          </button>
        </div>
      </>
    );
  }
);
MatchLobbyTeamRosterSection.displayName = 'MatchLobbyTeamRosterSection';
