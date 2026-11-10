import React from 'react';
import { AlertCircle, CheckCircle2, Loader2, RotateCcw } from 'lucide-react';
import { pushQuickNotification, useQuickNotificationStore } from '../../stores/quickNotificationStore';
import { dialogue } from '../../compounds/dialogue/dialogueStore';

export function dispatchOnlineRoomErrorNotification(
  summary = 'Could not bind or connect to signaling room within 10s.',
  details = 'WebSocket Signaling Handshake Failed (ERR_CONNECTION_TIMED_OUT).\nEndpoint: wss://relay.carball.dev/signaling\nAttempted Room: #4829 (120Hz Sub-Tick WebRTC)'
) {
  const store = useQuickNotificationStore.getState();
  const existing =
    store.activeNotification?.id === 'online-room-error' ||
    store.unreadStack.some((item) => item.id === 'online-room-error') ||
    store.preemptedPersistentStack.some((item) => item.id === 'online-room-error');

  if (!existing) {
    pushQuickNotification({
      id: 'online-room-error',
      type: 'persistent',
      tone: 'error',
      icon: 'octagon-alert',
      duration: 0,
      content: summary,
      buttons: [
        {
          label: 'Details',
          color: 'amber',
          onClick: () => {
            dialogue.show({
              title: 'CONNECTION DIAGNOSTIC LOG',
              tone: 'error',
              icon: 'octagon-alert',
              content: (
                <div className="flex flex-col gap-2 font-mono text-xs w-full text-left">
                  <p className="font-bold text-rose-600 dark:text-rose-400">{summary}</p>
                  <div className="p-3 rounded-lg bg-neutral-100 text-neutral-800 border border-neutral-300 dark:bg-neutral-950/70 dark:border-neutral-800 dark:text-neutral-200 text-[11px] leading-relaxed max-h-40 overflow-y-auto whitespace-pre-wrap select-all">
                    {details}
                  </div>
                </div>
              ),
              buttons: [{ label: 'Close', variant: 'primary' }],
            });
          },
        },
      ],
    });
  }
}

export interface CreationStepSpec {
  step: number;
  stageTitle: string;
  description: string;
  errorTitle?: string;
  errorDescription?: string;
}

export const DEFAULT_HOST_CREATION_STEPS: CreationStepSpec[] = [
  {
    step: 1,
    stageTitle: 'Initializing Local Authority',
    description: 'Allocating 120Hz physics world, arena state, and deterministic sub-tick ring buffers...',
    errorTitle: 'Authority Allocation Failed',
    errorDescription: 'Failed to initialize local 120Hz physics authority worker.',
  },
  {
    step: 2,
    stageTitle: 'Connecting Signaling Relay',
    description: 'Establishing WebSocket handshake with signaling server (wss://relay.carball.dev)...',
    errorTitle: 'Signaling Handshake Timed Out',
    errorDescription: 'Could not reach wss://relay.carball.dev/signaling within 10s (ERR_CONNECTION_TIMED_OUT).',
  },
  {
    step: 3,
    stageTitle: 'Registering Room Code & Key',
    description: 'Binding room access code and optional room key on the peer discovery relay...',
    errorTitle: 'Room Code Conflict / Rejected',
    errorDescription: 'Room code is already bound by another active host session or rejected by relay.',
  },
  {
    step: 4,
    stageTitle: 'Gathering ICE & TURN Candidates',
    description: 'Probing STUN/TURN NAT traversal endpoints and opening WebRTC data channels...',
    errorTitle: 'Signaling Connected (SDP/ICE Exchanged) — P2P Blocked by NAT',
    errorDescription:
      'Signaling link exchanged SDP/ICE successfully, but direct WebRTC P2P was blocked by Strict Symmetric NAT.',
  },
  {
    step: 5,
    stageTitle: 'Spawning Match Lobby',
    description: 'Applying match configuration, pre-allocating bot slots, and entering Match Lobby...',
    errorTitle: 'Lobby Spawn Aborted',
    errorDescription: 'Could not transition session state into Match Lobby.',
  },
];

export type CreationProgressStatus = 'idle' | 'running' | 'completed' | 'error';

export interface OnlineRoomCreationProgressProps {
  /** Current 1-indexed step (1..5) */
  currentStep: number;
  /** Total steps (default 5) */
  totalSteps?: number;
  /** Current status ('idle' | 'running' | 'completed' | 'error') */
  status: CreationProgressStatus;
  /** Retry callback when in error or completed state */
  onRetry?: () => void;
  /** Cancel / reset callback */
  onCancel?: () => void;
  /** Custom steps array override */
  steps?: CreationStepSpec[];
  isLight?: boolean;
  className?: string;
}

export const OnlineRoomCreationProgress: React.FC<OnlineRoomCreationProgressProps> = React.memo(({
  currentStep,
  totalSteps = 5,
  status,
  onRetry,
  onCancel,
  steps = DEFAULT_HOST_CREATION_STEPS,
  isLight = false,
  className = '',
}) => {
  const clampedStep = Math.max(1, Math.min(totalSteps, currentStep));
  const activeSpec = steps[clampedStep - 1] ?? steps[0];
  const isError = status === 'error';
  const isCompleted = status === 'completed';

  const progressPct = isCompleted
    ? 100
    : Math.max(8, Math.min(100, Math.round((clampedStep / totalSteps) * 100)));

  const displayTitle = isError
    ? activeSpec.errorTitle ?? `${activeSpec.stageTitle} (Failed)`
    : isCompleted
    ? 'Room Ready — Entering Lobby'
    : activeSpec.stageTitle;

  const displayDesc = isError
    ? activeSpec.errorDescription ?? activeSpec.description
    : activeSpec.description;

  return (
    <div
      data-ui-element="online-room-creation-progress"
      className={`rounded-xl border p-3 flex flex-col gap-2 transition-colors ${
        isError
          ? isLight
            ? 'bg-rose-50/90 border-rose-300 text-rose-950'
            : 'bg-rose-950/35 border-rose-500/40 text-rose-100'
          : isCompleted
          ? isLight
            ? 'bg-emerald-50/90 border-emerald-300 text-emerald-950'
            : 'bg-emerald-950/30 border-emerald-500/40 text-emerald-100'
          : isLight
          ? 'bg-neutral-100/80 border-neutral-300/90 text-neutral-900'
          : 'bg-neutral-900/75 border-neutral-800 text-neutral-100'
      } ${className}`}
    >
      {/* Row 1: Left = Stage Name () | Right = X / 5 () */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          {isError ? (
            <AlertCircle className="h-3.5 w-3.5 text-rose-500 shrink-0" />
          ) : isCompleted ? (
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
          ) : (
            <Loader2 className="h-3.5 w-3.5 text-amber-500 animate-spin shrink-0" />
          )}
          <span
            className={`text-xs font-bold tracking-tight truncate ${
              isError
                ? isLight
                  ? 'text-rose-700'
                  : 'text-rose-400'
                : isCompleted
                ? isLight
                  ? 'text-emerald-700'
                  : 'text-emerald-400'
                : isLight
                ? 'text-neutral-900'
                : 'text-neutral-100'
            }`}
          >
            {displayTitle}
          </span>
        </div>

        <span
          className={`text-xs font-mono font-bold tabular-nums shrink-0 px-2 py-0.5 rounded-md border ${
            isError
              ? isLight
                ? 'bg-rose-100 border-rose-300 text-rose-700'
                : 'bg-rose-500/15 border-rose-500/30 text-rose-300'
              : isCompleted
              ? isLight
                ? 'bg-emerald-100 border-emerald-300 text-emerald-700'
                : 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
              : isLight
              ? 'bg-white border-neutral-200 text-amber-600'
              : 'bg-neutral-950 border-neutral-800 text-amber-400'
          }`}
        >
          {clampedStep} / {totalSteps}
        </span>
      </div>

      {/* Row 2: Description */}
      <p
        className={`text-[11px] leading-snug font-mono ${
          isError
            ? isLight
              ? 'text-rose-700/90'
              : 'text-rose-300/90'
            : isLight
            ? 'text-neutral-600'
            : 'text-neutral-400'
        }`}
      >
        {displayDesc}
      </p>

      {/* Row 3: Progress Bar () */}
      <div
        className={`w-full h-2 rounded-full overflow-hidden border ${
          isLight
            ? 'bg-neutral-200/90 border-neutral-300/70'
            : 'bg-neutral-950 border-neutral-800'
        }`}
      >
        <div
          style={{ width: `${progressPct}%` }}
          className={`h-full rounded-full transition-all duration-300 ${
            isError
              ? 'bg-rose-500'
              : isCompleted
              ? 'bg-emerald-500'
              : 'bg-amber-500'
          }`}
        />
      </div>

      {(isError && onRetry) || onCancel ? (
        <div className="flex items-center justify-end gap-1.5 pt-1 border-t border-neutral-500/15 text-[10px] font-mono">
          {isError && onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-500 text-neutral-950 font-bold cursor-pointer hover:bg-amber-400 transition-colors"
            >
              <RotateCcw className="h-2.5 w-2.5" />
              <span>Retry</span>
            </button>
          )}

          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className={`px-1.5 py-0.5 rounded border cursor-pointer transition-colors ${
                isLight
                  ? 'bg-white hover:bg-neutral-100 border-neutral-300 text-neutral-500'
                  : 'bg-neutral-950 hover:bg-neutral-800 border-neutral-800 text-neutral-400'
              }`}
            >
              Cancel
            </button>
          )}
        </div>
      ) : null}
    </div>
  );
});

OnlineRoomCreationProgress.displayName = 'OnlineRoomCreationProgress';
