import React, { useState } from 'react';
import {
  Check,
  Copy,
  Radio,
  RefreshCw,
  WifiOff,
} from 'lucide-react';

export type SignalingHealthState = 'green' | 'yellow';

export interface OnlineRoomTopStatusBarProps {
  roomCode: string;
  signalingState?: SignalingHealthState;
  onChangeSignalingState?: (state: SignalingHealthState) => void;
  onRefreshSignaling?: () => void | Promise<void>;
  onHoverDesc?: (desc: string | null) => void;
  isLight?: boolean;
}

/**
 * Row 1 for Host panels (Match Lobby Host, During Match Host, Online Warmup Host):
 * - Left: `Room Code` + `Copy` button
 * - Right: `Signaling` status indicator (Green vs Yellow, clickable to simulate) + `Refresh` button to reconnect when Yellow
 */
export const OnlineRoomTopStatusBar: React.FC<OnlineRoomTopStatusBarProps> = React.memo(({
  roomCode,
  signalingState: controlledSignaling,
  onChangeSignalingState,
  onRefreshSignaling,
  onHoverDesc,
  isLight = false,
}) => {
  const [internalSignaling, setInternalSignaling] = useState<SignalingHealthState>('green');
  const [copied, setCopied] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const signaling = controlledSignaling ?? internalSignaling;
  const setSignaling = (next: SignalingHealthState) => {
    setInternalSignaling(next);
    onChangeSignalingState?.(next);
  };

  const handleCopy = () => {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(roomCode).catch(() => {});
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  const handleRefresh = () => {
    setRefreshing(true);
    void Promise.resolve(onRefreshSignaling?.()).finally(() => {
      setTimeout(() => {
        setRefreshing(false);
        setSignaling('green');
      }, 650);
    });
  };

  const isGreen = signaling === 'green';

  return (
    <div
      data-ui-element="host-room-signaling-bar"
      onMouseEnter={() =>
        onHoverDesc?.(
          'Room Code & Signaling Status: Copy room code on the left, or inspect/refresh signaling server connection on the right.'
        )
      }
      onMouseLeave={() => onHoverDesc?.(null)}
      className={`flex items-center justify-between gap-2 rounded-xl border px-3 py-2 ${
        isLight
          ? 'bg-neutral-100/90 border-neutral-200/90 text-neutral-800'
          : 'bg-neutral-900/75 border-neutral-800 text-neutral-200'
      }`}
    >
      {/* Left: Room Code + Copy */}
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-xs font-mono text-neutral-400 shrink-0">Room Code:</span>
        <span
          className={`text-xs font-mono font-bold truncate ${
            isLight ? 'text-neutral-900' : 'text-neutral-100'
          }`}
        >
          #{roomCode}
        </span>
        <button
          type="button"
          onClick={handleCopy}
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg border text-[10px] font-mono font-bold uppercase tracking-wider transition-colors cursor-pointer shrink-0 ${
            copied
              ? isLight
                ? 'bg-neutral-800 border-neutral-800 text-white'
                : 'bg-neutral-200 border-neutral-200 text-neutral-900'
              : isLight
              ? 'bg-white hover:bg-neutral-200/80 border-neutral-300 text-neutral-700'
              : 'bg-neutral-800 hover:bg-neutral-700 border-neutral-700 text-neutral-300'
          }`}
          title="Copy Room Code"
        >
          {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          <span>{copied ? 'Copied' : 'Copy'}</span>
        </button>
      </div>

      {/* Right: Signaling Status (Green / Yellow) + Refresh Button */}
      <div className="flex items-center gap-1.5 shrink-0">
        <button
          type="button"
          onClick={() => setSignaling(isGreen ? 'yellow' : 'green')}
          onMouseEnter={() =>
            onHoverDesc?.(
              'Signaling Status: Green = Connected to relay; Yellow = Standby/Disconnected (click to toggle simulation).'
            )
          }
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[10px] font-mono font-bold uppercase tracking-wider transition-colors cursor-pointer ${
            isGreen
              ? isLight
                ? 'bg-emerald-500/10 border-emerald-500/35 text-emerald-700'
                : 'bg-emerald-500/15 border-emerald-500/35 text-emerald-400'
              : isLight
              ? 'bg-amber-500/15 border-amber-500/45 text-amber-700'
              : 'bg-amber-500/20 border-amber-500/45 text-amber-400'
          }`}
          title="Click to simulate Green (Connected) vs Yellow (Standby/Disconnected) signaling state"
        >
          <span
            className={`w-2 h-2 rounded-full shrink-0 ${
              isGreen ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'
            }`}
          />
          <span>{isGreen ? 'Signaling: OK' : 'Signaling: Warn'}</span>
        </button>

        <button
          type="button"
          onClick={handleRefresh}
          onMouseEnter={() =>
            onHoverDesc?.(
              'Refresh Signaling: Manually reconnect to the signaling server when status turns yellow.'
            )
          }
          className={`p-1.5 rounded-lg border transition-colors cursor-pointer ${
            !isGreen
              ? 'bg-amber-500 text-neutral-950 border-amber-400 hover:bg-amber-400 shadow-2xs'
              : isLight
              ? 'bg-white hover:bg-neutral-200 border-neutral-300 text-neutral-700'
              : 'bg-neutral-800 hover:bg-neutral-700 border-neutral-700 text-neutral-300'
          }`}
          title="Reconnect Signaling Server"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
        </button>
      </div>
    </div>
  );
});
OnlineRoomTopStatusBar.displayName = 'OnlineRoomTopStatusBar';

export interface ClientRoomTopBarsProps {
  roomCode: string;
  pairId?: string;
  daisyChainSignaling?: SignalingHealthState;
  onChangeDaisyChainSignaling?: (state: SignalingHealthState) => void;
  onHoverDesc?: (desc: string | null) => void;
  isLight?: boolean;
}

/**
 * Top 2 bars for Client panels (Match Lobby Client, During Match Client, Online Warmup Client):
 * - Bar 1: Left = `Room Code` + `Copy` | Right = `Pair ID` (4-character P2P pair identifier, e.g. `#7F3A`)
 * - Bar 2: Horizontal `Daisy Chain Spectating Enabled` bar:
 *   - Default active (Green). Client can manually `Disconnect` from signaling server, or when Yellow, click `Reconnect`.
 */
export const ClientRoomTopBars: React.FC<ClientRoomTopBarsProps> = React.memo(({
  roomCode,
  pairId = '7F3A',
  daisyChainSignaling: controlledState,
  onChangeDaisyChainSignaling,
  onHoverDesc,
  isLight = false,
}) => {
  const [internalState, setInternalState] = useState<SignalingHealthState>('green');
  const [copied, setCopied] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);

  const sigState = controlledState ?? internalState;
  const setSigState = (next: SignalingHealthState) => {
    setInternalState(next);
    onChangeDaisyChainSignaling?.(next);
  };

  const isGreen = sigState === 'green';

  const handleCopy = () => {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(roomCode).catch(() => {});
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  const handleReconnect = () => {
    setReconnecting(true);
    setTimeout(() => {
      setReconnecting(false);
      setSigState('green');
    }, 600);
  };

  return (
    <div className="flex flex-col gap-2 shrink-0">
      {/* Row 1: Room Code + Copy (Left) | 4-Char Pair ID (Right) */}
      <div
        data-ui-element="client-room-code-pair-bar"
        onMouseEnter={() =>
          onHoverDesc?.(
            `Room Code #${roomCode} & Pair ID #${pairId}: Unique 4-character P2P pairing identifier assigned to your connection.`
          )
        }
        onMouseLeave={() => onHoverDesc?.(null)}
        className={`flex items-center justify-between gap-2 rounded-xl border px-3 py-2 ${
          isLight
            ? 'bg-neutral-100/90 border-neutral-200/90 text-neutral-800'
            : 'bg-neutral-900/75 border-neutral-800 text-neutral-200'
        }`}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs font-mono text-neutral-400 shrink-0">Room Code:</span>
          <span
            className={`text-xs font-mono font-bold truncate ${
              isLight ? 'text-neutral-900' : 'text-neutral-100'
            }`}
          >
            #{roomCode}
          </span>
          <button
            type="button"
            onClick={handleCopy}
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg border text-[10px] font-mono font-bold uppercase tracking-wider transition-colors cursor-pointer shrink-0 ${
              copied
                ? isLight
                  ? 'bg-neutral-800 border-neutral-800 text-white'
                  : 'bg-neutral-200 border-neutral-200 text-neutral-900'
                : isLight
                ? 'bg-white hover:bg-neutral-200/80 border-neutral-300 text-neutral-700'
                : 'bg-neutral-800 hover:bg-neutral-700 border-neutral-700 text-neutral-300'
            }`}
          >
            {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
            <span>{copied ? 'Copied' : 'Copy'}</span>
          </button>
        </div>

        <div
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-mono shrink-0 ${
            isLight
              ? 'bg-white border-neutral-200/90 text-neutral-700'
              : 'bg-neutral-950/80 border-neutral-800 text-neutral-300'
          }`}
        >
          <span className="text-[10px] uppercase tracking-wider text-neutral-400">Pair ID:</span>
          <strong
            className={`font-bold tracking-wider ${
              isLight ? 'text-neutral-900' : 'text-neutral-100'
            }`}
          >
            #{pairId}
          </strong>
        </div>
      </div>

      {/* Row 2: Horizontal Daisy Chain Spectating Enabled Bar */}
      <div
        data-ui-element="client-daisy-chain-spectating-bar"
        onMouseEnter={() =>
          onHoverDesc?.(
            'Daisy Chain Spectating Enabled: Stay in the signaling server so spectators can relay through your client to reduce Host P2P upload consumption. You can manually Disconnect or Reconnect.'
          )
        }
        onMouseLeave={() => onHoverDesc?.(null)}
        className={`flex items-center justify-between gap-2 rounded-xl border px-3 py-2 transition-colors ${
          isGreen
            ? isLight
              ? 'bg-emerald-50/75 border-emerald-300/80 text-emerald-950'
              : 'bg-emerald-950/25 border-emerald-500/35 text-emerald-100'
            : isLight
            ? 'bg-amber-50/85 border-amber-300/90 text-amber-950'
            : 'bg-amber-950/30 border-amber-500/40 text-amber-100'
        }`}
      >
        <button
          type="button"
          onClick={() => setSigState(isGreen ? 'yellow' : 'green')}
          className="flex items-center gap-2 min-w-0 text-left cursor-pointer"
          title="Click to toggle Green (Enabled/Connected) vs Yellow (Disconnected/Standby)"
        >
          <span
            className={`w-2 h-2 rounded-full shrink-0 ${
              isGreen ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'
            }`}
          />
          <Radio
            className={`h-3.5 w-3.5 shrink-0 ${
              isGreen ? 'text-emerald-500' : 'text-amber-500'
            }`}
          />
          <div className="flex flex-col min-w-0">
            <span className="text-xs font-semibold tracking-tight truncate">
              {isGreen
                ? 'Daisy Chain Spectating Enabled'
                : 'Daisy Chain Spectating · Signaling Disconnected'}
            </span>
          </div>
        </button>

        <div className="flex items-center gap-1.5 shrink-0">
          {isGreen ? (
            <button
              type="button"
              onClick={() => setSigState('yellow')}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border text-[10px] font-mono font-bold uppercase tracking-wider transition-colors cursor-pointer ${
                isLight
                  ? 'bg-white hover:bg-rose-50 border-neutral-300 hover:border-rose-300 text-neutral-700 hover:text-rose-600'
                  : 'bg-neutral-900 hover:bg-rose-950/50 border-neutral-700 hover:border-rose-500/40 text-neutral-300 hover:text-rose-300'
              }`}
            >
              <WifiOff className="h-3 w-3" />
              <span>Disconnect</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={handleReconnect}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-500 hover:bg-amber-400 text-neutral-950 text-[10px] font-mono font-bold uppercase tracking-wider transition-colors cursor-pointer shadow-2xs"
            >
              <RefreshCw className={`h-3 w-3 ${reconnecting ? 'animate-spin' : ''}`} />
              <span>{reconnecting ? 'Reconnecting...' : 'Reconnect'}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
});
ClientRoomTopBars.displayName = 'ClientRoomTopBars';

