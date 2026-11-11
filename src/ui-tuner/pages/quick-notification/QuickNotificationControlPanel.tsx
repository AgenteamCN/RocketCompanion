import React from 'react';
import { Sliders, Eye, Type } from 'lucide-react';
import type { QuickNotificationGlowLevel } from '../../../ui-core/compounds/QuickNotification';
import { SegmentedSwitch } from '../../../ui-core/primitives/SegmentedSwitch';
import { ToggleSwitch } from '../../../ui-core/primitives/ToggleSwitch';
import { QuickNotificationButtonsBuilderSection } from './QuickNotificationButtonsBuilderSection';
import { useQuickNotificationDraftState } from './useQuickNotificationDraftState';

const PRESET_ICONS = [
  'bell', 'loader-2', 'download', 'octagon-alert', 'triangle-alert', 'info',
  'flame', 'sparkles', 'check-circle', 'shield-alert', 'activity',
];

const PRESET_TONES: { key: QuickNotificationGlowLevel; label: string; dotClass: string }[] = [
  { key: 'none', label: 'none (No Glow)', dotClass: 'bg-neutral-400' },
  { key: 'info', label: 'info (Grey)', dotClass: 'bg-neutral-300' },
  { key: 'warning', label: 'warning (Yellow)', dotClass: 'bg-yellow-500' },
  { key: 'orange', label: 'orange (Orange)', dotClass: 'bg-orange-500' },
  { key: 'error', label: 'error (Red)', dotClass: 'bg-red-500' },
];

export interface QuickNotificationControlPanelProps {
  isLight: boolean;
}

export const QuickNotificationControlPanel: React.FC<QuickNotificationControlPanelProps> = React.memo(
  ({ isLight }) => {
    const {
      showStackIcon, setShowStackIcon, liveMode, setLiveMode,
      totalChars, chineseChars, asciiChars, estimatedContentWidthPx,
      temporalType, setTemporalType, effectiveDuration,
      durationPreset, setDurationPreset, customDurationMs, setCustomDurationMs,
      ongoingProgressMode, setOngoingProgressMode, ongoingProgressPct, setOngoingProgressPct,
      isSpinningIcon, setIsSpinningIcon, tone, setTone,
      iconName, setIconName, content, setContent, buttons, setButtons,
    } = useQuickNotificationDraftState();

    const activePillCls = isLight
      ? 'bg-neutral-900 text-white border-neutral-900 font-bold'
      : 'bg-white text-neutral-950 border-white font-bold';
    const idlePillCls = isLight
      ? 'bg-neutral-100/60 border-neutral-300 text-neutral-700 hover:bg-neutral-100'
      : 'bg-neutral-800/60 border-neutral-700 text-neutral-300 hover:bg-neutral-800';

    return (
      <div
        className={`lg:col-span-7 flex flex-col gap-5 p-5 rounded-2xl border ${
          isLight ? 'bg-white border-neutral-200' : 'bg-neutral-900/60 border-neutral-800'
        }`}
      >
        <div className="flex items-center justify-between pb-3 border-b border-neutral-200 dark:border-neutral-800">
          <div className="flex items-center gap-2">
            <Sliders className="h-4 w-4 text-amber-500" />
            <h2 className="text-sm font-bold tracking-tight">Parameter control panel (Control Panel)</h2>
          </div>

          <div className="flex items-center gap-2 text-[11px]">
            <span className="text-neutral-500">Slot 1 (Right):</span>
            <input
              type="checkbox"
              checked={showStackIcon}
              onChange={(e) => setShowStackIcon(e.target.checked)}
              className="rounded cursor-pointer accent-neutral-900 dark:accent-neutral-100"
            />
          </div>
        </div>

        <div
          className={`p-3.5 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
            liveMode
              ? 'border-amber-500/40 bg-amber-500/5'
              : isLight
              ? 'border-neutral-200 bg-neutral-50/70'
              : 'border-neutral-800 bg-neutral-950/40'
          }`}
        >
          <div className="flex items-start gap-2.5">
            <Eye className={`h-4 w-4 mt-0.5 shrink-0 ${liveMode ? 'text-amber-500' : 'text-neutral-400'}`} />
            <div>
              <div className="text-xs font-bold flex items-center gap-2">
                <span>Live Real-time tuning mode (Live Preview Mode)</span>
                {liveMode && (
                  <span className="px-1.5 py-0.2 rounded text-[10px] bg-amber-500 text-neutral-950 font-extrabold">
                    ACTIVE
                  </span>
                )}
              </div>
              <p className="text-[11px] text-neutral-400 mt-0.5 leading-relaxed">
                Keep top notification bar expanded after enabling, Modify characters below、color、Buttons or progress bars will be mapped in real time, Observe width adaptive limits and text wrapping points.
              </p>
            </div>
          </div>

          <div className="shrink-0">
            <ToggleSwitch checked={liveMode} onCheckedChange={setLiveMode} isLight={isLight} />
          </div>
        </div>

        <div
          className={`p-3 rounded-xl border flex flex-wrap items-center justify-between gap-3 text-[11px] font-mono ${
            isLight
              ? 'bg-neutral-50 border-neutral-200 text-neutral-600'
              : 'bg-neutral-950/50 border-neutral-800/80 text-neutral-400'
          }`}
        >
          <div className="flex items-center gap-1.5">
            <Type className="h-3.5 w-3.5 text-neutral-400" />
            <span>Character Count:</span>
            <strong className="text-neutral-900 dark:text-neutral-100">{totalChars}</strong>
            <span className="text-neutral-400">
              (Chinese {chineseChars} / ASCII {asciiChars})
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <span>Est. Text Width:</span>
            <strong
              className={
                estimatedContentWidthPx > 260 ? 'text-amber-500' : 'text-neutral-900 dark:text-neutral-100'
              }
            >
              ~{estimatedContentWidthPx}px
            </strong>
            <span className="text-neutral-400">
              {estimatedContentWidthPx > 260 ? '(Multi-line wrap)' : '(Single-line adaptive)'}
            </span>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between text-xs font-bold text-neutral-400 uppercase tracking-wider">
            <span>1. Lifecycle Type (Temporal Type)</span>
            <span className="text-[11px] text-neutral-400 font-normal">
              {temporalType === 'temporary'
                ? `Auto-collapse (${effectiveDuration}ms)`
                : temporalType === 'ongoing'
                ? 'Lowest priority · Non-dismissible · Auto-yield and restore'
                : 'Resident until user action or manual collapse'}
            </span>
          </div>

          <SegmentedSwitch
            options={[
              { value: 'temporary', label: 'Temporary (Countdown)' },
              { value: 'persistent', label: 'Persistent (Resident Interaction)' },
              { value: 'ongoing', label: 'Ongoing (Background Tasks/Progress)' },
            ]}
            value={temporalType}
            onChange={(val) => setTemporalType(val as typeof temporalType)}
            isLight={isLight}
            fullWidth
          />

          {temporalType === 'temporary' && (
            <div className="flex flex-col gap-2 pt-1">
              <div className="flex items-center justify-between text-xs text-neutral-500">
                <span>Countdown Preset (Duration):</span>
                <div className="flex items-center gap-1.5">
                  {(['3000', '5000', 'custom'] as const).map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setDurationPreset(preset)}
                      className={`px-2.5 py-1 rounded-md text-xs font-mono border transition-all cursor-pointer ${
                        durationPreset === preset ? activePillCls : idlePillCls
                      }`}
                    >
                      {preset === '3000' ? '3s (3000ms)' : preset === '5000' ? '5s (5000ms)' : 'Custom'}
                    </button>
                  ))}
                </div>
              </div>

              {durationPreset === 'custom' && (
                <div className="flex items-center justify-between gap-3 pt-1">
                  <span className="text-xs text-neutral-400">Custom milliseconds (ms):</span>
                  <input
                    type="number"
                    min={500}
                    max={60000}
                    step={500}
                    value={customDurationMs}
                    onChange={(e) => setCustomDurationMs(Number(e.target.value))}
                    className="w-28 px-2.5 py-1 rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 text-xs font-mono text-right"
                  />
                </div>
              )}
            </div>
          )}

          {temporalType === 'ongoing' && (
            <div className="p-3 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50/60 dark:bg-neutral-950/40 flex flex-col gap-2.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-neutral-500 font-bold">Bottom Progress Bar Mode (Progress Mode):</span>
                <div className="flex items-center gap-1">
                  {(['determinate', 'indeterminate', 'none'] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setOngoingProgressMode(m)}
                      className={`px-2 py-0.5 rounded text-[11px] border cursor-pointer ${
                        ongoingProgressMode === m
                          ? activePillCls
                          : 'border-neutral-300 dark:border-neutral-700 text-neutral-500'
                      }`}
                    >
                      {m === 'determinate' ? 'Percentage' : m === 'indeterminate' ? 'Flow Wave' : 'No Progress Bar'}
                    </button>
                  ))}
                </div>
              </div>

              {ongoingProgressMode === 'determinate' && (
                <div className="flex items-center justify-between gap-3 text-xs">
                  <span className="text-neutral-500">Current Progress ({ongoingProgressPct}%):</span>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={ongoingProgressPct}
                    onChange={(e) => setOngoingProgressPct(Number(e.target.value))}
                    className="w-40 accent-neutral-900 dark:accent-white cursor-pointer"
                  />
                </div>
              )}

              <div className="flex items-center justify-between text-xs">
                <span className="text-neutral-500">Leading Icon Auto-Spin (isSpinningIcon):</span>
                <ToggleSwitch
                  checked={isSpinningIcon}
                  onCheckedChange={setIsSpinningIcon}
                  isLight={isLight}
                />
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between text-xs font-bold text-neutral-400 uppercase tracking-wider">
            <span>2. Visual style and inner glow (Tone &amp; Inner Glow Level)</span>
            <span className="text-[11px] text-neutral-500 lowercase font-normal">
              4 Glow Level + 1 Level 0 non-glowing base plate
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5">
            {PRESET_TONES.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTone(t.key)}
                className={`flex items-center justify-center gap-1.5 py-2 px-2 rounded-xl border text-xs font-medium transition-all cursor-pointer ${
                  tone === t.key ? `${activePillCls} shadow-2xs` : idlePillCls
                }`}
              >
                <span className={`h-2 w-2 rounded-full ${t.dotClass} shrink-0`} />
                <span className="truncate">{t.key}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between text-xs font-bold text-neutral-400 uppercase tracking-wider">
            <span>3. Leading Icon (Leading Lucide Icon)</span>
            <span className="text-[11px] text-neutral-500 lowercase font-normal">benchmark Dialogue Spec</span>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {PRESET_ICONS.map((icon) => (
              <button
                key={icon}
                type="button"
                onClick={() => setIconName(icon)}
                className={`px-2.5 py-1 rounded-lg border text-xs font-mono transition-all cursor-pointer flex items-center gap-1.5 ${
                  iconName === icon ? activePillCls : idlePillCls
                }`}
              >
                <span>{icon}</span>
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 mt-1">
            <span className="text-[11px] text-neutral-400">Custom Icon Name:</span>
            <input
              type="text"
              value={iconName}
              onChange={(e) => setIconName(e.target.value)}
              placeholder="e.g. bell, flame, activity"
              className="flex-1 px-2.5 py-1 rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 text-xs font-mono"
            />
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between text-xs font-bold text-neutral-400 uppercase tracking-wider">
            <span>4. Notification Body (Notification Content)</span>
            <span className="text-[11px] text-neutral-400 font-normal">{totalChars} Character</span>
          </div>

          <textarea
            rows={2}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="w-full px-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-amber-500"
            placeholder="Input notification prompt text..."
          />
        </div>

        <QuickNotificationButtonsBuilderSection
          isLight={isLight}
          buttons={buttons}
          setButtons={setButtons}
        />
      </div>
    );
  }
);
