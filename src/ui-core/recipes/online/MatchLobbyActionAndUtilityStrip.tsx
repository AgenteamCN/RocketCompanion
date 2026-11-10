import React, { useState } from 'react';
import {
  Gamepad2,
  Play,
  SlidersHorizontal,
} from 'lucide-react';
import { DoubleConfirmServerButton } from './OnlineRoomConfigSummaryCard';

export interface MatchLobbyUtilitiesState {
  zeroGProbes?: boolean;
  onToggleZeroGProbes?: () => void;
  testSfx?: boolean;
  onToggleTestSfx?: () => void;
  onResetBall?: () => void;
  onOpenNetHud?: () => void;
}

export interface MatchLobbyPrimaryActionRowProps {
  isHost: boolean;
  isEditingConfig: boolean;
  onToggleEditingConfig: () => void;
  onStartMatch?: () => void;
  onEnterMatch?: () => void;
  onHoverDesc?: (desc: string | null) => void;
  isLight?: boolean;
}

export const MatchLobbyPrimaryActionRow: React.FC<
  MatchLobbyPrimaryActionRowProps
> = React.memo(({
  isHost,
  isEditingConfig,
  onToggleEditingConfig,
  onStartMatch,
  onEnterMatch,
  onHoverDesc,
  isLight = false,
}) => {
  const [enteredArena, setEnteredArena] = useState<boolean>(false);

  if (isHost) {
    return (
      <div className="grid grid-cols-3 gap-2">
        <button
          type="button"
          onClick={onStartMatch}
          onMouseEnter={() =>
            onHoverDesc?.(
              'Start Match: Transition the room from Lobby into Regulation Match for all connected peers.'
            )
          }
          onMouseLeave={() => onHoverDesc?.(null)}
          className="py-2.5 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-neutral-950 font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all cursor-pointer shadow-xs"
        >
          <Play className="h-3.5 w-3.5 fill-current" />
          <span>Start Match</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setEnteredArena((prev) => !prev);
            onEnterMatch?.();
          }}
          onMouseEnter={() =>
            onHoverDesc?.('Start Playing: Manually spawn your car into the lobby arena.')
          }
          onMouseLeave={() => onHoverDesc?.(null)}
          className={`py-2.5 px-4 rounded-xl border text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
            enteredArena
              ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400'
              : isLight
              ? 'bg-white hover:bg-neutral-100 border-neutral-300 text-neutral-800'
              : 'bg-neutral-800 hover:bg-neutral-700 border-neutral-700 text-neutral-200'
          }`}
        >
          <Gamepad2 className="h-3.5 w-3.5" />
          <span>{enteredArena ? 'In Arena' : 'Start Playing'}</span>
        </button>

        <button
          type="button"
          onClick={onToggleEditingConfig}
          onMouseEnter={() =>
            onHoverDesc?.(
              'Configure (Edit): Adjust Team Format, Bot Fill Policy, and Match Duration directly from the lobby.'
            )
          }
          onMouseLeave={() => onHoverDesc?.(null)}
          className={`py-2.5 px-4 rounded-xl border text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
            isEditingConfig
              ? 'bg-sky-500 text-white border-sky-400'
              : isLight
              ? 'bg-white hover:bg-neutral-100 border-neutral-300 text-neutral-800'
              : 'bg-neutral-800 hover:bg-neutral-700 border-neutral-700 text-neutral-200'
          }`}
        >
          <SlidersHorizontal className="h-3.5 w-3.5 text-amber-500" />
          <span>Configure</span>
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => {
        setEnteredArena((prev) => !prev);
        onEnterMatch?.();
      }}
      onMouseEnter={() =>
        onHoverDesc?.('Join Match: Enter the match arena with your selected team (Blue / Auto / Orange).')
      }
      onMouseLeave={() => onHoverDesc?.(null)}
      className="w-full py-2.5 px-5 rounded-xl bg-amber-500 hover:bg-amber-400 text-neutral-950 font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all cursor-pointer shadow-xs"
    >
      <Play className="h-3.5 w-3.5 fill-current" />
      <span>{enteredArena ? 'Joined Match · In Arena' : 'Join Match'}</span>
    </button>
  );
});

MatchLobbyPrimaryActionRow.displayName = 'MatchLobbyPrimaryActionRow';

export interface MatchLobbyFooterControlsProps {
  isHost: boolean;
  utilities?: MatchLobbyUtilitiesState;
  onStopOrLeave?: () => void;
  onHoverDesc?: (desc: string | null) => void;
  isLight?: boolean;
}

export const MatchLobbyFooterControls: React.FC<
  MatchLobbyFooterControlsProps
> = React.memo(({
  isHost,
  utilities,
  onStopOrLeave,
  onHoverDesc,
  isLight = false,
}) => {
  const {
    zeroGProbes: controlledZeroGProbes,
    onToggleZeroGProbes,
    testSfx: controlledTestSfx,
    onToggleTestSfx,
    onResetBall,
    onOpenNetHud,
  } = utilities ?? {};

  const [internalZeroGProbes, setInternalZeroGProbes] = useState(false);
  const [internalTestSfx, setInternalTestSfx] = useState(false);
  const [ballResetFlash, setBallResetFlash] = useState(false);
  const zeroGProbes = controlledZeroGProbes ?? internalZeroGProbes;
  const testSfx = controlledTestSfx ?? internalTestSfx;

  return (
    <>
      {isHost && (
        <div className="grid grid-cols-4 gap-1.5">
          <button
            type="button"
            onClick={() => {
              setInternalZeroGProbes((v) => !v);
              onToggleZeroGProbes?.();
            }}
            onMouseEnter={() => onHoverDesc?.('Probes: Toggle 0G physics probes in the lobby arena.')}
            onMouseLeave={() => onHoverDesc?.(null)}
            className={`py-1.5 px-2 rounded-lg border text-[10px] font-mono font-bold uppercase transition-colors cursor-pointer ${
              zeroGProbes
                ? 'bg-amber-500/20 border-amber-500/40 text-amber-400'
                : isLight
                ? 'bg-neutral-100 border-neutral-300 text-neutral-600'
                : 'bg-neutral-900 border-neutral-800 text-neutral-400'
            }`}
          >
            Probes: {zeroGProbes ? 'ON' : 'OFF'}
          </button>

          <button
            type="button"
            onClick={() => {
              setInternalTestSfx((v) => !v);
              onToggleTestSfx?.();
            }}
            onMouseEnter={() => onHoverDesc?.('SFX: Broadcast synchronized audio test chime across peers.')}
            onMouseLeave={() => onHoverDesc?.(null)}
            className={`py-1.5 px-2 rounded-lg border text-[10px] font-mono font-bold uppercase transition-colors cursor-pointer ${
              testSfx
                ? 'bg-amber-500/20 border-amber-500/40 text-amber-400'
                : isLight
                ? 'bg-neutral-100 border-neutral-300 text-neutral-600'
                : 'bg-neutral-900 border-neutral-800 text-neutral-400'
            }`}
          >
            SFX: {testSfx ? 'ON' : 'OFF'}
          </button>

          <button
            type="button"
            onClick={() => {
              onResetBall?.();
              setBallResetFlash(true);
              setTimeout(() => setBallResetFlash(false), 600);
            }}
            onMouseEnter={() => onHoverDesc?.('Reset Ball: Reset ball to center kickoff anchor.')}
            onMouseLeave={() => onHoverDesc?.(null)}
            className={`py-1.5 px-2 rounded-lg border text-[10px] font-mono font-bold uppercase transition-colors cursor-pointer ${
              ballResetFlash
                ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400'
                : isLight
                ? 'bg-neutral-100 hover:bg-neutral-200 border-neutral-300 text-neutral-700'
                : 'bg-neutral-900 hover:bg-neutral-800 border-neutral-800 text-neutral-300'
            }`}
          >
            {ballResetFlash ? 'Ball Reset!' : 'Reset Ball'}
          </button>

          <button
            type="button"
            onClick={onOpenNetHud}
            onMouseEnter={() => onHoverDesc?.('Net HUD: Open Network & P2P Diagnostics Floating HUD.')}
            onMouseLeave={() => onHoverDesc?.(null)}
            className="py-1.5 px-2 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-500 text-[10px] font-mono font-bold uppercase transition-colors cursor-pointer"
          >
            Net HUD ↗
          </button>
        </div>
      )}

      <DoubleConfirmServerButton
        label={isHost ? 'Stop Server' : 'Leave Room'}
        requireDoubleConfirm={false}
        onConfirm={onStopOrLeave}
        onHoverDesc={onHoverDesc}
        isLight={isLight}
      />
    </>
  );
});

MatchLobbyFooterControls.displayName = 'MatchLobbyFooterControls';
