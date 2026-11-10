import React from 'react';
import { Lock, Radio, Shuffle } from 'lucide-react';
import { useSettingActionRowStore } from '../../stores/settingRowStore';
import { useSignalingProfileStore } from '../../stores/signalingProfileStore';
import {
  finalizeHostRoomCode,
  generateRandomRoomCode,
  sanitizeHostRoomCodeDraft,
  sanitizeJoinRoomCodeDraft,
} from '../../config/roomCodeConnectivityCodec';

export interface OnlineRoomIdentityState {
  playerName: string;
  onPlayerNameChange: (value: string) => void;
  roomCode: string;
  onRoomCodeChange: (value: string) => void;
  roomKey: string;
  onRoomKeyChange: (value: string) => void;
}

export interface OnlineRoomIdentityFieldsProps {
  identity: OnlineRoomIdentityState;
  showRandomize?: boolean;
  onRandomizeRoomCode?: () => void;
  onNotYouClick?: () => void;
  onSignalingConfigClick?: () => void;
  onHoverDesc?: (desc: string | null) => void;
  isLight?: boolean;
  className?: string;
}

const sanitizeAscii = (raw: string): string => raw.replace(/[^\x20-\x7E]/g, '');

/**
 * Decoupled identity, room access & signaling status header shared across Host Match, Join Room, and Host Training:
 * - Row 1: `Player Name:` + `Not you?` underlined link (navigates to Garage Sync) + full-width input
 * - Row 2: 50/50 split (`grid-cols-2`):
 *   - Left: `Room Code` + optional `Randomize` action on the right, sanitized input (4-digit affine or `<custom>-<hex>`)
 *   - Right: Lock icon + `Key`, ASCII input with gray `None` placeholder when empty
 * - Row 3: Signaling Server Status & Fingerprint Row:
 *   - Displays active source (`Public (No SLA)`, `Custom`, or `Bundle #xxxx`), availability dot (Green when reachable),
 *     and a `"Not expected? / Self-hosted / Import?"` underlined link that jumps directly to Settings -> Advanced.
 */
export const OnlineRoomIdentityFields: React.FC<OnlineRoomIdentityFieldsProps> = React.memo(({
  identity,
  showRandomize = false,
  onRandomizeRoomCode,
  onNotYouClick,
  onSignalingConfigClick,
  onHoverDesc,
  isLight = true,
  className = '',
}) => {
  const {
    playerName,
    onPlayerNameChange,
    roomCode,
    onRoomCodeChange,
    roomKey,
    onRoomKeyChange,
  } = identity;
  const { titleFontSize, paddingX } = useSettingActionRowStore();
  const source = useSignalingProfileStore((s) => s.source);
  const shortHash = useSignalingProfileStore((s) => s.shortHash);
  const hostMask = useSignalingProfileStore((s) => s.hostMask);
  const isProbing = useSignalingProfileStore((s) => s.isProbing);
  const hasProbedOnce = useSignalingProfileStore((s) => s.hasProbedOnce);
  const probeResults = useSignalingProfileStore((s) => s.probeResults);

  const labelStyle: React.CSSProperties = {
    fontSize: `${Math.max(13, titleFontSize)}px`,
  };

  const labelColorClass = isLight ? 'text-neutral-800' : 'text-neutral-200';
  const inputSurfaceClass = isLight
    ? 'bg-neutral-100/90 hover:bg-neutral-100 focus:bg-white border-neutral-300/90 text-neutral-900 placeholder:text-neutral-400 focus:border-amber-500'
    : 'bg-neutral-900/90 hover:bg-neutral-900 focus:bg-neutral-950 border-neutral-700/90 text-neutral-100 placeholder:text-neutral-500 focus:border-amber-500';

  const reachableCount = probeResults.filter((r) => r.ok).length;
  const isReachable = !hasProbedOnce || reachableCount > 0 || hostMask > 0;

  const sourceSummaryLabel =
    source === 'imported-bundle'
      ? `Bundle #${shortHash}`
      : source === 'dev-private'
      ? `Private #${shortHash}`
      : source === 'custom'
      ? `Custom #${shortHash}`
      : `Public (No SLA) #${shortHash}`;

  const availabilityBadgeText = isProbing
    ? 'Probing...'
    : hasProbedOnce
    ? isReachable
      ? `Available (${reachableCount}/${Math.max(1, probeResults.length)})`
      : 'Unreachable'
    : 'Ready';

  const quickJumpText =
    source === 'public'
      ? 'Self-hosted / Import?'
      : !isReachable
      ? 'Unreachable · Reconfigure?'
      : 'Not expected?';

  const handleRoomCodeInput = (raw: string) => {
    if (showRandomize) {
      onRoomCodeChange(sanitizeHostRoomCodeDraft(raw));
    } else {
      onRoomCodeChange(sanitizeJoinRoomCodeDraft(raw));
    }
  };

  const handleRoomCodeBlur = () => {
    if (showRandomize) {
      onRoomCodeChange(roomCode.trim() ? finalizeHostRoomCode(roomCode, hostMask) : '');
    } else {
      onRoomCodeChange(sanitizeJoinRoomCodeDraft(roomCode));
    }
  };

  const handleRandomizeClick = () => {
    if (onRandomizeRoomCode) {
      onRandomizeRoomCode();
    } else {
      onRoomCodeChange(generateRandomRoomCode(hostMask));
    }
  };

  return (
    <div
      style={{
        paddingLeft: `${Math.max(0, paddingX)}px`,
        paddingRight: `${Math.max(0, paddingX)}px`,
      }}
      className={`flex flex-col gap-3 shrink-0 ${className}`}
    >
      {/* Row 1: Player Name + Not you? */}
      <div
        className="flex flex-col gap-1.5"
        onMouseEnter={() =>
          onHoverDesc?.(
            'Player Name: Display name broadcast to connected peers. Click "Not you?" to open Garage Sync.'
          )
        }
        onMouseLeave={() => onHoverDesc?.(null)}
      >
        <div className="flex items-center justify-between gap-2">
          <label
            style={labelStyle}
            className={`font-semibold tracking-tight select-none ${labelColorClass}`}
          >
            Player Name:
          </label>
          <button
            type="button"
            onClick={onNotYouClick}
            onMouseEnter={() =>
              onHoverDesc?.('Not you? Jump to Garage -> Sync to switch or bind your online profile.')
            }
            className={`text-xs font-medium underline underline-offset-3 cursor-pointer transition-colors select-none ${
              isLight
                ? 'text-neutral-500 hover:text-neutral-900'
                : 'text-neutral-400 hover:text-neutral-100'
            }`}
          >
            Not you?
          </button>
        </div>

        <input
          type="text"
          value={playerName}
          onChange={(e) => onPlayerNameChange(sanitizeAscii(e.target.value))}
          maxLength={24}
          placeholder="Player Name"
          className={`w-full px-3 py-2 rounded-xl border font-mono text-xs font-medium text-left outline-none transition-colors ${inputSurfaceClass}`}
        />
      </div>

      {/* Row 2: 50/50 Split — Room Code (left) & Lock + Key (right) */}
      <div className="grid grid-cols-2 gap-3">
        {/* Left Half: Room Code */}
        <div
          className="flex flex-col gap-1.5 min-w-0"
          onMouseEnter={() =>
            onHoverDesc?.(
              showRandomize
                ? 'Room Code: Leave blank for auto-generated 4-digit Random code, or type a custom alphanumeric room name (auto-appends -<hex> connectivity mask suffix).'
                : 'Room Code: Enter the 4-digit room code or custom <name>-<hex> code (case-insensitive).'
            )
          }
          onMouseLeave={() => onHoverDesc?.(null)}
        >
          <div className="flex items-center justify-between gap-2">
            <label
              style={labelStyle}
              className={`font-semibold tracking-tight select-none truncate ${labelColorClass}`}
            >
              Room Code
            </label>
            {showRandomize && (
              <button
                type="button"
                onClick={handleRandomizeClick}
                className={`inline-flex items-center gap-1 text-xs font-mono font-medium cursor-pointer transition-colors shrink-0 ${
                  isLight
                    ? 'text-amber-600 hover:text-amber-700'
                    : 'text-amber-400 hover:text-amber-300'
                }`}
                title="Randomize room code"
              >
                <Shuffle className="h-3 w-3" />
                <span>Randomize</span>
              </button>
            )}
          </div>

          <input
            type="text"
            value={roomCode}
            onChange={(e) => handleRoomCodeInput(e.target.value)}
            onBlur={handleRoomCodeBlur}
            maxLength={24}
            placeholder={showRandomize ? 'Random' : 'Room Code'}
            className={`w-full px-3 py-2 rounded-xl border font-mono text-xs font-semibold text-left outline-none transition-colors ${inputSurfaceClass}`}
          />
        </div>

        {/* Right Half: Lock + Key */}
        <div
          className="flex flex-col gap-1.5 min-w-0"
          onMouseEnter={() =>
            onHoverDesc?.(
              'Key: Recommended room password (combined with Room Code in SHA-256 topic & salt derivation to prevent 4-digit room collisions).'
            )
          }
          onMouseLeave={() => onHoverDesc?.(null)}
        >
          <div className="flex items-center justify-between gap-2">
            <label
              style={labelStyle}
              className={`inline-flex items-center gap-1.5 font-semibold tracking-tight select-none truncate ${labelColorClass}`}
            >
              <Lock
                className={`h-3.5 w-3.5 shrink-0 ${
                  isLight ? 'text-amber-600' : 'text-amber-400'
                }`}
              />
              <span>Key</span>
            </label>
          </div>

          <input
            type="text"
            value={roomKey}
            onChange={(e) => onRoomKeyChange(sanitizeAscii(e.target.value))}
            maxLength={24}
            placeholder={showRandomize ? 'None (Recommended)' : 'None'}
            className={`w-full px-3 py-2 rounded-xl border font-mono text-xs font-medium text-left outline-none transition-colors ${inputSurfaceClass}`}
          />
        </div>
      </div>

      {/* Row 3: Signaling Source Fingerprint & Quick Jump to Settings -> Advanced */}
      <div
        data-ui-element="online-room-signaling-source-bar"
        onMouseEnter={() =>
          onHoverDesc?.(
            `Signaling Relay Status (${sourceSummaryLabel}): Both peers must share a matching signaling hash (#${shortHash}) to discover the room. Click "${quickJumpText}" to open Settings -> Advanced.`
          )
        }
        onMouseLeave={() => onHoverDesc?.(null)}
        className={`flex items-center justify-between gap-2 px-3 py-1.5 rounded-xl border text-xs ${
          isLight
            ? 'bg-neutral-100/75 border-neutral-200/90 text-neutral-700'
            : 'bg-neutral-900/60 border-neutral-800/90 text-neutral-300'
        }`}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span
            className={`w-2 h-2 rounded-full shrink-0 ${
              isProbing
                ? 'bg-amber-400 animate-pulse'
                : isReachable
                ? 'bg-emerald-400'
                : 'bg-rose-400'
            }`}
          />
          <Radio className="h-3.5 w-3.5 shrink-0 text-neutral-400" />
          <span className="font-mono font-semibold truncate">{sourceSummaryLabel}</span>
          <span
            className={`text-[10px] font-mono px-1.5 py-0.5 rounded border shrink-0 ${
              isProbing
                ? 'bg-amber-500/15 border-amber-500/35 text-amber-400'
                : isReachable
                ? 'bg-emerald-500/15 border-emerald-500/35 text-emerald-400'
                : 'bg-rose-500/15 border-rose-500/35 text-rose-400'
            }`}
          >
            {availabilityBadgeText}
          </span>
        </div>

        <button
          type="button"
          onClick={onSignalingConfigClick}
          className={`text-xs font-medium underline underline-offset-3 cursor-pointer transition-colors shrink-0 select-none ${
            isLight
              ? 'text-neutral-500 hover:text-neutral-900'
              : 'text-neutral-400 hover:text-neutral-100'
          }`}
        >
          {quickJumpText}
        </button>
      </div>
    </div>
  );
});

OnlineRoomIdentityFields.displayName = 'OnlineRoomIdentityFields';
