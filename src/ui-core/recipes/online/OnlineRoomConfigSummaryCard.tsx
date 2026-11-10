import React, { useState } from 'react';
import {
  Bot,
  ChevronDown,
  ChevronUp,
  Clock,
  DoorStairwell,
  SlidersHorizontal,
  Users,
} from 'lucide-react';
import { SettingSegmentedRow } from '../../compounds/SettingSegmentedRow';
import { SliderControl } from '../../primitives/SliderControl';
export type HostMatchTeamFormat = 'standard' | 'doubles' | 'duel';
export type HostMatchBotPolicy = 'none' | 'auto-fill' | 'vs-ai' | 'custom';
export type HostMatchDurationPreset = '90' | '180' | '300' | 'custom';

export interface HostMatchConfig {
  playerName: string;
  roomCode: string;
  roomKey: string;
  teamFormat: HostMatchTeamFormat;
  botPolicy: HostMatchBotPolicy;
  durationPreset: HostMatchDurationPreset;
  customDurationSeconds: number;
}

export const FORMAT_LABELS: Record<HostMatchTeamFormat, string> = {
  standard: 'Standard',
  doubles: 'Doubles',
  duel: 'Duel',
};

export const BOT_POLICY_LABELS: Record<HostMatchBotPolicy, string> = {
  none: 'No Bots',
  'auto-fill': 'Auto-Fill',
  'vs-ai': 'Vs AI',
  custom: 'Custom',
};

export const formatMatchDurationLabel = (seconds: number): string => {
  const clamped = Math.max(0, Math.min(300, Math.round(seconds)));
  if (clamped === 0) return '0:00 (OT)';
  const mins = Math.floor(clamped / 60);
  const secs = clamped % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

export interface OnlineRoomConfigChangeHandlers {
  onChangeTeamFormat?: (v: HostMatchTeamFormat) => void;
  onChangeBotPolicy?: (v: HostMatchBotPolicy) => void;
  onChangeDurationPreset?: (v: HostMatchDurationPreset) => void;
  onChangeCustomDurationSeconds?: (v: number) => void;
}

export interface OnlineRoomConfigEditorControls {
  editable?: boolean;
  isEditing?: boolean;
  onToggleEditing?: () => void;
  onNavigateAdvancedSettings?: () => void;
}

export interface OnlineRoomConfigSummaryCardProps {
  teamFormat: HostMatchTeamFormat;
  botPolicy: HostMatchBotPolicy;
  durationPreset: HostMatchDurationPreset;
  customDurationSeconds: number;
  handlers?: OnlineRoomConfigChangeHandlers;
  editor?: OnlineRoomConfigEditorControls;
  onHoverDesc?: (desc: string | null) => void;
  title?: string;
  isLight?: boolean;
}

/**
 * Shared Information / Current Configuration Card:
 * - Shows 3-column summary: Format | Bot Policy | Duration
 * - When `editable && isEditing`, renders inline controls for Team Format, Bot Fill Policy, Match Duration, and Advanced Settings.
 */
export const OnlineRoomConfigSummaryCard: React.FC<OnlineRoomConfigSummaryCardProps> = React.memo(({
  teamFormat,
  botPolicy,
  durationPreset,
  customDurationSeconds,
  handlers,
  editor,
  onHoverDesc,
  title = 'Room Information',
  isLight = false,
}) => {
  const {
    onChangeTeamFormat,
    onChangeBotPolicy,
    onChangeDurationPreset,
    onChangeCustomDurationSeconds,
  } = handlers ?? {};
  const {
    editable = false,
    isEditing = false,
    onToggleEditing,
    onNavigateAdvancedSettings,
  } = editor ?? {};
  const resolvedDurationSeconds =
    durationPreset === 'custom' ? customDurationSeconds : Number(durationPreset);
  const durationSummaryText = formatMatchDurationLabel(resolvedDurationSeconds);

  return (
    <div
      data-ui-element="match-config-summary-card"
      className={`rounded-xl border transition-colors ${
        isLight
          ? 'border-neutral-300/90 bg-neutral-100/55'
          : 'border-neutral-800 bg-neutral-900/45'
      }`}
    >
      <div className="flex items-center justify-between gap-3 px-3.5 pt-2.5 pb-2">
        <span
          className={`text-xs font-semibold tracking-tight ${
            isLight ? 'text-neutral-900' : 'text-neutral-100'
          }`}
        >
          {title}
        </span>

        {editable && onToggleEditing ? (
          <button
            type="button"
            onClick={onToggleEditing}
            className={`inline-flex items-center gap-1 text-xs font-medium underline underline-offset-4 decoration-1 cursor-pointer transition-colors ${
              isEditing
                ? isLight
                  ? 'text-neutral-900 decoration-neutral-900'
                  : 'text-white decoration-white'
                : isLight
                ? 'text-neutral-600 hover:text-neutral-900 decoration-neutral-400'
                : 'text-neutral-300 hover:text-white decoration-neutral-500'
            }`}
          >
            <span>{isEditing ? 'Hide Configure' : 'Configure'}</span>
            {isEditing ? (
              <ChevronUp className="h-3.5 w-3.5" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5" />
            )}
          </button>
        ) : (
          <span className="text-[10px] font-mono uppercase tracking-wider text-neutral-400">
            Sync · 120Hz
          </span>
        )}
      </div>

      {/* 3-Column Summary Strip: Format | Bot Policy | Duration */}
      <div className="grid grid-cols-3 gap-2 px-3.5 pb-3">
        <div
          className={`flex flex-col gap-0.5 px-2.5 py-1.5 rounded-lg border ${
            isLight
              ? 'bg-white/80 border-neutral-200/90'
              : 'bg-neutral-950/60 border-neutral-800/90'
          }`}
        >
          <span className="text-[10px] font-mono uppercase tracking-wider text-neutral-400">
            Format
          </span>
          <span
            className={`text-xs font-semibold truncate ${
              isLight ? 'text-neutral-800' : 'text-neutral-100'
            }`}
          >
            {FORMAT_LABELS[teamFormat]}
          </span>
        </div>

        <div
          className={`flex flex-col gap-0.5 px-2.5 py-1.5 rounded-lg border ${
            isLight
              ? 'bg-white/80 border-neutral-200/90'
              : 'bg-neutral-950/60 border-neutral-800/90'
          }`}
        >
          <span className="text-[10px] font-mono uppercase tracking-wider text-neutral-400">
            Bot Policy
          </span>
          <span
            className={`text-xs font-semibold truncate ${
              isLight ? 'text-neutral-800' : 'text-neutral-100'
            }`}
          >
            {BOT_POLICY_LABELS[botPolicy]}
          </span>
        </div>

        <div
          className={`flex flex-col gap-0.5 px-2.5 py-1.5 rounded-lg border ${
            isLight
              ? 'bg-white/80 border-neutral-200/90'
              : 'bg-neutral-950/60 border-neutral-800/90'
          }`}
        >
          <span className="text-[10px] font-mono uppercase tracking-wider text-neutral-400">
            Duration
          </span>
          <span
            className={`text-xs font-mono font-semibold truncate ${
              isLight ? 'text-neutral-800' : 'text-neutral-100'
            }`}
          >
            {durationSummaryText}
          </span>
        </div>
      </div>

      {/* Expanded Editable Controls (Host Lobby Only) */}
      {editable && isEditing && (
        <div
          className={`flex flex-col gap-1.5 px-2.5 pt-2.5 pb-3 border-t ${
            isLight ? 'border-neutral-200/90' : 'border-neutral-800/90'
          }`}
        >
          <SettingSegmentedRow
            icon={Users}
            iconColor="text-sky-400"
            title="Team Format"
            value={teamFormat}
            onChange={(v) => onChangeTeamFormat?.(v as HostMatchTeamFormat)}
            layout="inline"
            bordered={false}
            showDescription={false}
            options={[
              { value: 'standard', label: 'Standard' },
              { value: 'doubles', label: 'Doubles' },
              { value: 'duel', label: 'Duel' },
            ]}
            hoverDescription="Team Format: Standard (3v3), Doubles (2v2), or Duel (1v1). Automatically updates pre-allocated bot slots."
            onHover={(desc) => desc && onHoverDesc?.(desc)}
            onLeave={() => onHoverDesc?.(null)}
            isLight={isLight}
          />

          <SettingSegmentedRow
            icon={Bot}
            iconColor="text-rose-400"
            title="Bot Fill Policy"
            value={botPolicy}
            onChange={(v) => onChangeBotPolicy?.(v as HostMatchBotPolicy)}
            layout="inline"
            bordered={false}
            showDescription={false}
            options={[
              { value: 'none', label: 'No Bots' },
              { value: 'auto-fill', label: 'Auto-Fill' },
              { value: 'vs-ai', label: 'Vs AI' },
              { value: 'custom', label: 'Custom' },
            ]}
            hoverDescription="Bot Fill Policy: Pre-assigns bots directly into Blue and Orange team rosters when enabled."
            onHover={(desc) => desc && onHoverDesc?.(desc)}
            onLeave={() => onHoverDesc?.(null)}
            isLight={isLight}
          />

          <SettingSegmentedRow
            icon={Clock}
            iconColor="text-emerald-400"
            title="Match Duration"
            value={durationPreset}
            onChange={(v) => onChangeDurationPreset?.(v as HostMatchDurationPreset)}
            layout="inline"
            bordered={false}
            showDescription={false}
            options={[
              { value: '90', label: '1:30' },
              { value: '180', label: '3:00' },
              { value: '300', label: '5:00' },
              { value: 'custom', label: 'Custom' },
            ]}
            hoverDescription="Match Duration: Regulation match timer."
            onHover={(desc) => desc && onHoverDesc?.(desc)}
            onLeave={() => onHoverDesc?.(null)}
            isLight={isLight}
          />

          {durationPreset === 'custom' && (
            <div
              className={`mx-2 my-1 px-3 py-2 rounded-xl border ${
                isLight
                  ? 'bg-white/90 border-neutral-200/90'
                  : 'bg-neutral-950/70 border-neutral-800'
              }`}
            >
              <SliderControl
                label={`Custom Duration (${formatMatchDurationLabel(customDurationSeconds)})`}
                value={customDurationSeconds}
                min={0}
                max={300}
                step={1}
                unit="s"
                editable={true}
                colorScheme="amber"
                onChange={(v) => onChangeCustomDurationSeconds?.(v)}
                isLight={isLight}
              />
            </div>
          )}

          {onNavigateAdvancedSettings && (
            <div className="pt-1 px-1">
              <button
                type="button"
                onClick={onNavigateAdvancedSettings}
                className={`w-full py-2 px-4 rounded-xl border text-xs font-semibold tracking-wide flex items-center justify-center gap-2 transition-colors cursor-pointer ${
                  isLight
                    ? 'bg-white hover:bg-neutral-200/70 border-neutral-300 text-neutral-800 shadow-2xs'
                    : 'bg-neutral-800/90 hover:bg-neutral-700/90 border-neutral-700 text-neutral-100'
                }`}
              >
                <SlidersHorizontal className="h-3.5 w-3.5 text-amber-500" />
                <span>Advanced Settings</span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
});
OnlineRoomConfigSummaryCard.displayName = 'OnlineRoomConfigSummaryCard';

export interface DoubleConfirmServerButtonProps {
  label?: string;
  requireDoubleConfirm?: boolean;
  onConfirm?: () => void;
  onHoverDesc?: (desc: string | null) => void;
  isLight?: boolean;
}

/**
 * Bottom `Stop Server` / `Shutdown Server` / `Leave Room` action button using `DoorStairwell` (`door-stairwell`).
 * Supports optional 2-step double confirmation (`Shutdown Server` -> `Confirm Shutdown? [Confirm] [Cancel]`).
 */
export const DoubleConfirmServerButton: React.FC<DoubleConfirmServerButtonProps> = React.memo(({
  label = 'Stop Server',
  requireDoubleConfirm = false,
  onConfirm,
  onHoverDesc,
  isLight = false,
}) => {
  const [confirming, setConfirming] = useState(false);

  if (requireDoubleConfirm && confirming) {
    return (
      <div
        className={`flex items-center justify-between gap-2 p-2 rounded-xl border ${
          isLight
            ? 'bg-rose-50 border-rose-300 text-rose-900'
            : 'bg-rose-950/45 border-rose-500/50 text-rose-100'
        }`}
      >
        <div className="flex items-center gap-2 pl-1.5 min-w-0">
          <DoorStairwell className="h-4 w-4 text-rose-500 shrink-0" />
          <span className="text-xs font-bold truncate">
            Confirm {label}? All peers will disconnect.
          </span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => {
              setConfirming(false);
              onConfirm?.();
            }}
            className="px-3 py-1.5 rounded-lg bg-rose-500 hover:bg-rose-600 text-white text-xs font-bold uppercase tracking-wider cursor-pointer transition-colors"
          >
            Confirm
          </button>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            className={`px-2.5 py-1.5 rounded-lg border text-xs font-semibold cursor-pointer transition-colors ${
              isLight
                ? 'bg-white hover:bg-neutral-100 border-neutral-300 text-neutral-700'
                : 'bg-neutral-900 hover:bg-neutral-800 border-neutral-700 text-neutral-300'
            }`}
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => {
        if (requireDoubleConfirm) {
          setConfirming(true);
        } else {
          onConfirm?.();
        }
      }}
      onMouseEnter={() =>
        onHoverDesc?.(
          requireDoubleConfirm
            ? `${label}: Requires double confirmation before terminating the authoritative session.`
            : `${label}: Disconnect and return to Free Play.`
        )
      }
      onMouseLeave={() => onHoverDesc?.(null)}
      className={[
        'w-full py-2.5 px-4 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 text-rose-500',
        'border border-rose-500/35 text-xs font-bold uppercase tracking-wider',
        'flex items-center justify-center gap-2 transition-colors cursor-pointer shrink-0',
      ].join(' ')}
    >
      <DoorStairwell className="h-4 w-4 shrink-0" />
      <span>{label}</span>
    </button>
  );
});
DoubleConfirmServerButton.displayName = 'DoubleConfirmServerButton';

