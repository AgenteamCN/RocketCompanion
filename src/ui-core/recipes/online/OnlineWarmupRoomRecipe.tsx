import React, { useEffect, useState } from 'react';
import {
  Eye,
  Server,
  User,
  UserRoundX,
} from 'lucide-react';
import {
  ClientRoomTopBars,
  OnlineRoomTopStatusBar,
  type SignalingHealthState,
} from './OnlineRoomTopStatusBar';
import { OnlineWarmupTelemetryAndReadySection } from './OnlineWarmupTelemetryAndReadySection';

export interface WarmupRoomPlayer {
  id: string;
  name: string;
  pingMs: number;
  pairId?: string;
  isHost?: boolean;
  isSelf?: boolean;
}

export interface OnlineWarmupRoomRecipeProps {
  role: 'host' | 'client';
  roomCode?: string;
  pairId?: string;
  signalingState?: SignalingHealthState;
  onRefreshSignaling?: () => void | Promise<void>;
  players?: WarmupRoomPlayer[];
  onKickPlayer?: (id: string) => void;
  onOpenAdvancedManagement?: () => void;
  onExportTrainingReplay?: () => Promise<boolean> | boolean | void;
  onShutdownOrLeave?: () => void;
  onHoverDesc?: (desc: string | null) => void;
  isLight?: boolean;
}

const INITIAL_WARMUP_PLAYERS: WarmupRoomPlayer[] = [
  { id: 'w-1', name: 'Player_01 (Host)', pingMs: 0, pairId: '1A0F', isHost: true },
  { id: 'w-2', name: 'OctaneMain_99', pingMs: 21, pairId: '9B2C' },
  { id: 'w-3', name: 'Aerial_Vortex', pingMs: 33, pairId: '4D1E' },
  { id: 'w-4', name: 'FlipReset_Pro', pingMs: 44, pairId: '5E7A' },
];

export const OnlineWarmupRoomRecipe: React.FC<OnlineWarmupRoomRecipeProps> = React.memo(({
  role,
  roomCode = 'TRN-409',
  pairId = '4C8E',
  signalingState: controlledSignaling,
  onRefreshSignaling,
  players: controlledPlayers,
  onKickPlayer,
  onOpenAdvancedManagement,
  onExportTrainingReplay,
  onShutdownOrLeave,
  onHoverDesc,
  isLight = false,
}) => {
  const isHost = role === 'host';
  const [internalSignaling, setInternalSignaling] = useState<SignalingHealthState>('green');
  const [internalPlayers, setInternalPlayers] = useState<WarmupRoomPlayer[]>(INITIAL_WARMUP_PLAYERS);
  const [showPairId, setShowPairId] = useState<boolean>(isHost);

  useEffect(() => {
    setShowPairId(isHost);
  }, [isHost]);

  const signalingState = controlledSignaling ?? internalSignaling;
  const setSignalingState = setInternalSignaling;
  const players = controlledPlayers ?? internalPlayers;

  const handleRemovePlayer = (id: string) => {
    if (onKickPlayer) {
      onKickPlayer(id);
    } else {
      setInternalPlayers((prev) => prev.filter((p) => p.id !== id));
    }
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

      {/* 2. PLAYERS IN ROOM (Up to 6 players, Flat list without teams) */}
      <div
        data-ui-element="warmup-players-in-room"
        className="flex flex-col gap-1.5"
        onMouseEnter={() =>
          onHoverDesc?.(
            'Players in Room: Up to 6 online players in shared warmup. Toggle Pair ID (Eye) to inspect peer IDs instead of RTT.'
          )
        }
        onMouseLeave={() => onHoverDesc?.(null)}
      >
        <div className="flex items-center justify-between text-xs font-mono font-semibold text-neutral-400">
          <div className="flex items-center gap-2">
            <span>PLAYERS IN ROOM</span>
            <span className={isLight ? 'text-black font-bold' : 'text-white font-bold'}>
              {players.length} / 6
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

        <div
          className={`rounded-xl border p-2 grid grid-cols-2 gap-1.5 ${
            isLight
              ? 'bg-neutral-50 border-neutral-200/90'
              : 'bg-neutral-900/60 border-neutral-800'
          }`}
        >
          {players.map((p) => {
            const isSelf = (isHost && p.isHost) || (!isHost && p.id === 'w-2');
            return (
              <div
                key={p.id}
                className={`flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg border text-xs font-mono ${
                  isSelf
                    ? 'bg-amber-500/10 border-amber-500/35'
                    : isLight
                    ? 'bg-white border-neutral-200/90'
                    : 'bg-neutral-950/65 border-neutral-800/90'
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  {p.isHost ? (
                    <Server className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                  ) : (
                    <User className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                  )}
                  <span
                    className={`truncate ${
                      isSelf
                        ? isLight
                          ? 'font-bold text-neutral-900'
                          : 'font-bold text-white'
                        : isLight
                        ? 'text-neutral-800'
                        : 'text-neutral-200'
                    }`}
                  >
                    {p.name}
                    {!isHost && p.id === 'w-2' ? ' (You)' : ''}
                  </span>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
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
                      ? `#${p.pairId || '4C8E'}`
                      : p.isHost
                      ? '0ms'
                      : `${p.pingMs}ms`}
                  </span>
                  {isHost && !p.isHost && (
                    <button
                      type="button"
                      onClick={() => handleRemovePlayer(p.id)}
                      className="inline-flex items-center justify-center p-1 rounded-md border border-rose-500/35 bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 cursor-pointer transition-colors"
                      title="Kick player from warmup room"
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

      <OnlineWarmupTelemetryAndReadySection
        isHost={isHost}
        onOpenAdvancedManagement={onOpenAdvancedManagement}
        onExportTrainingReplay={onExportTrainingReplay}
        onShutdownOrLeave={onShutdownOrLeave}
        onHoverDesc={onHoverDesc}
        isLight={isLight}
      />
    </div>
  );
});

OnlineWarmupRoomRecipe.displayName = 'OnlineWarmupRoomRecipe';
