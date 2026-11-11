import React from 'react';
import {
  Sparkles,
  Send,
  Check,
  Loader2,
  Play,
  Clock,
  Layers,
  CheckCircle2,
  ThumbsDown,
} from 'lucide-react';
import {
  CollapseToRightIcon,
  type QuickNotificationGlowLevel,
  type QuickNotificationType,
  type QuickNotificationButtonConfig,
} from '../../../ui-core/compounds/QuickNotification';
import {
  dismissOngoingNotification,
  completeOngoingNotification,
} from '../../../ui-core/stores/quickNotificationStore';
import type {
  QuickNotificationItem,
  OngoingConflictPolicy,
} from '../../../ui-core/stores/notificationTypes';

export interface QuickNotificationPresetsPanelProps {
  isLight: boolean;
  handlePushCurrent: () => void;
  handlePushPreset: (
    presetTone: QuickNotificationGlowLevel,
    presetType: QuickNotificationType,
    presetDuration: number,
    presetIcon: string,
    presetContent: string,
    presetButtons?: QuickNotificationButtonConfig[]
  ) => void;
  handlePushBatch: () => void;
  handleRunLazyLoadingSimulation: () => void;
  handleRunPriorityPreemptionTest: () => void;
  handleRunMultiTaskTest: () => void;
  ongoingConflictPolicy: OngoingConflictPolicy;
  activeOngoingTask: QuickNotificationItem | null;
}

const PRESET_SAMPLES: Array<{
  key: string;
  label: string;
  badgeText: string;
  badgeColor: string;
  leadingCheck?: boolean;
  tone: QuickNotificationGlowLevel;
  type: QuickNotificationType;
  duration: number;
  icon: string;
  content: string;
  buttons?: QuickNotificationButtonConfig[];
}> = [
  {
    key: 'accept-reject',
    label: 'Accept + Reject Notification (ThumbsDown Reject)',
    badgeText: 'persistent · Dual Buttons',
    badgeColor: 'text-emerald-500',
    leadingCheck: true,
    tone: 'info',
    type: 'persistent',
    duration: 0,
    icon: 'bell',
    content: 'Join cross-region match lobby #US-East-8?',
    buttons: [
      { key: 'accept', label: 'Accept', icon: 'check', format: 'icon-text', color: 'green' },
      { key: 'reject', label: 'Reject', icon: 'thumbs-down', format: 'icon-only', color: 'red' },
    ],
  },
  {
    key: 'warn-3s',
    label: '3sec Temporary alert notification (Warning 3s)',
    badgeText: '3000ms',
    badgeColor: 'text-amber-500',
    tone: 'warning',
    type: 'temporary',
    duration: 3000,
    icon: 'triangle-alert',
    content: 'Telemetry latency spike: 142ms > 80ms threshold',
    buttons: [
      { key: 'inspect', label: 'Inspect', icon: 'rotate-ccw', format: 'icon-text', color: 'amber' },
    ],
  },
  {
    key: 'info-5s',
    label: '5sec Temporary info notification (Info 5s)',
    badgeText: '5000ms',
    badgeColor: 'text-sky-500',
    tone: 'info',
    type: 'temporary',
    duration: 5000,
    icon: 'info',
    content: 'WASM game state synced with WebSocket gateway',
  },
  {
    key: 'err-persist',
    label: 'Persistent Error Notification (Dark collapse button on far right)',
    badgeText: 'persistent',
    badgeColor: 'text-red-500',
    tone: 'error',
    type: 'persistent',
    duration: 0,
    icon: 'octagon-alert',
    content: 'Critical error: Failed to initialize WebGPU context',
    buttons: [
      { key: 'retry', label: 'Retry', icon: 'rotate-ccw', format: 'icon-text', color: 'neutral' },
    ],
  },
];

export const QuickNotificationPresetsPanel: React.FC<QuickNotificationPresetsPanelProps> = React.memo(
  ({
    isLight,
    handlePushCurrent,
    handlePushPreset,
    handlePushBatch,
    handleRunLazyLoadingSimulation,
    handleRunPriorityPreemptionTest,
    handleRunMultiTaskTest,
    ongoingConflictPolicy,
    activeOngoingTask,
  }) => {
    const presetRowClass = `py-2 px-3 rounded-xl border text-xs text-left font-medium transition-all cursor-pointer flex items-center justify-between ${
      isLight
        ? 'bg-neutral-50 hover:bg-neutral-100 border-neutral-200 text-neutral-800'
        : 'bg-neutral-850 hover:bg-neutral-800 border-neutral-750 text-neutral-200'
    }`;

    return (
      <div className="lg:col-span-5 flex flex-col gap-5">
        <div
          className={`p-5 rounded-2xl border flex flex-col gap-3 ${
            isLight ? 'bg-white border-neutral-200' : 'bg-neutral-900/60 border-neutral-800'
          }`}
        >
          <div className="flex items-center gap-2 pb-2 border-b border-neutral-200 dark:border-neutral-800">
            <Sparkles className="h-4 w-4 text-amber-500" />
            <h3 className="text-sm font-bold tracking-tight">Quick Test Suite (Test Presets)</h3>
          </div>

          <div className="flex flex-col gap-2.5">
            <button
              type="button"
              onClick={handlePushCurrent}
              className={`w-full py-2.5 px-3.5 rounded-xl border text-xs font-bold transition-all cursor-pointer flex items-center justify-between shadow-2xs active:scale-[0.98] ${
                isLight
                  ? 'bg-neutral-900 hover:bg-neutral-800 text-white border-neutral-900 shadow-neutral-900/10'
                  : 'bg-white hover:bg-neutral-100 text-neutral-950 border-white shadow-black/40'
              }`}
            >
              <div className="flex items-center gap-2">
                <Send className="h-4 w-4 text-amber-400 shrink-0" />
                <span>Push current config notification (Push Notification)</span>
              </div>
              <span
                className={`text-[10px] font-mono px-1.5 py-0.5 rounded font-normal ${
                  isLight ? 'bg-amber-400/20 text-amber-300' : 'bg-amber-500/20 text-amber-700'
                }`}
              >
                Read Panel Parameters
              </span>
            </button>

            <div className="flex items-center gap-2 my-0.5 text-[10px] text-neutral-400 uppercase tracking-wider font-bold">
              <span>Quick preset sample test (Preset Samples)</span>
            </div>

            {PRESET_SAMPLES.map((p) => (
              <button
                key={p.key}
                type="button"
                onClick={() =>
                  handlePushPreset(p.tone, p.type, p.duration, p.icon, p.content, p.buttons)
                }
                className={presetRowClass}
              >
                <div className="flex items-center gap-2">
                  {p.leadingCheck && <Check className="h-3.5 w-3.5 text-emerald-500" />}
                  <span>{p.label}</span>
                </div>
                <span className={`text-[10px] font-bold ${p.badgeColor}`}>{p.badgeText}</span>
              </button>
            ))}

            <button
              type="button"
              onClick={handlePushBatch}
              className={`py-2 px-3 rounded-xl border text-xs text-left font-medium transition-all cursor-pointer flex items-center justify-between ${
                isLight
                  ? 'bg-amber-50 hover:bg-amber-100 border-amber-200 text-amber-900'
                  : 'bg-amber-950/40 hover:bg-amber-900/50 border-amber-800 text-amber-200'
              }`}
            >
              <span>Send Successively 3 Notifications (Stress-test unread stack horizontal drawer flow)</span>
              <span className="text-[10px] text-amber-500 font-bold">Stack ×3</span>
            </button>

            <div className="flex items-center gap-2 my-0.5 pt-2 border-t border-neutral-200 dark:border-neutral-800 text-[10px] text-amber-500 uppercase tracking-wider font-bold">
              <Loader2 className="h-3 w-3 animate-spin" />
              <span>[New]Background Task / Lazy Loading Simulation and priority collision</span>
            </div>

            <button
              type="button"
              onClick={handleRunLazyLoadingSimulation}
              className={`py-2 px-3 rounded-xl border text-xs text-left font-medium transition-all cursor-pointer flex items-center justify-between ${
                isLight
                  ? 'bg-amber-50/80 hover:bg-amber-100/90 border-amber-300 text-amber-950 shadow-2xs'
                  : 'bg-amber-950/30 hover:bg-amber-900/40 border-amber-700/80 text-amber-200 shadow-2xs'
              }`}
            >
              <div className="flex items-center gap-2">
                <Play className="h-3.5 w-3.5 text-amber-500 fill-amber-500 shrink-0" />
                <div className="flex flex-col">
                  <span className="font-bold">Startup Complete Lazy Loading Async Simulation Pipeline</span>
                  <span className="text-[10px] text-neutral-500 dark:text-neutral-400 font-normal">
                    Step 1/5 Checklist → 2/5 audio → 3/5 Material → 4/5 Shader → Auto-exit on completion
                  </span>
                </div>
              </div>
              <span className="text-[10px] text-amber-500 font-bold shrink-0">5-Step Stream</span>
            </button>

            <button type="button" onClick={handleRunPriorityPreemptionTest} className={presetRowClass}>
              <div className="flex items-center gap-2">
                <Clock className="h-3.5 w-3.5 text-sky-500 shrink-0" />
                <div className="flex flex-col">
                  <span className="font-bold">Priority collision test (Preempt &amp; Auto-Restore)</span>
                  <span className="text-[10px] text-neutral-500 dark:text-neutral-400 font-normal">
                    Background streaming download → Immediate high-priority warning overlay → Warning collapses and automatically resumes background download
                  </span>
                </div>
              </div>
              <span className="text-[10px] text-sky-500 font-bold shrink-0">Collision Recovery</span>
            </button>

            <button type="button" onClick={handleRunMultiTaskTest} className={presetRowClass}>
              <div className="flex items-center gap-2">
                <Layers className="h-3.5 w-3.5 text-purple-500 shrink-0" />
                <div className="flex flex-col">
                  <span className="font-bold">Concurrent multi-task streaming (Task A audio + Task B Livery)</span>
                  <span className="text-[10px] text-neutral-500 dark:text-neutral-400 font-normal">
                    Test policy (current: {ongoingConflictPolicy.toUpperCase()}) Scheduling Rules
                  </span>
                </div>
              </div>
              <span className="text-[10px] text-purple-500 font-bold shrink-0">Multi-tasking</span>
            </button>

            {activeOngoingTask && (
              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() =>
                    completeOngoingNotification(undefined, {
                      content: 'All background downloads finished!',
                      autoDismissMs: 1200,
                    })
                  }
                  className="flex-1 py-1.5 px-2.5 rounded-lg border border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20 text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  <span>Remote Task Completion (Complete)</span>
                </button>

                <button
                  type="button"
                  onClick={() => dismissOngoingNotification()}
                  className="py-1.5 px-2.5 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 text-xs font-bold transition-all cursor-pointer text-neutral-600 dark:text-neutral-300"
                >
                  Close Immediately
                </button>
              </div>
            )}
          </div>
        </div>

        <div
          className={`p-5 rounded-2xl border flex flex-col gap-3 text-xs leading-relaxed ${
            isLight
              ? 'bg-neutral-50/80 border-neutral-200 text-neutral-700'
              : 'bg-neutral-900/40 border-neutral-800 text-neutral-300'
          }`}
        >
          <div className="font-bold flex items-center gap-1.5 text-neutral-900 dark:text-neutral-100">
            <Loader2 className="h-3.5 w-3.5 text-amber-500" />
            <span>Ongoing background task notification (Ongoing / Background Task Notification)</span>
          </div>
          <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
            Designed for Lazy Loading, Non-essential asynchronous resource loading or shader compilation.
            User cannot manually close (No ignore or collapse button, Does not pollute unread stack and count red dots).
            Lowest Priority, Smoothly yield and occlude upon any user notification,
            Millisecond-level restoration after user notification is resolved.
            Supports silent progress updates and remote-triggered graceful exit.
          </p>

          <div className="font-bold flex items-center gap-1.5 text-neutral-900 dark:text-neutral-100 pt-1 border-t border-neutral-200/60 dark:border-neutral-800/60">
            <CollapseToRightIcon size={15} className="text-amber-500" />
            <span>Transparency and contrast standards for collapse and ignore buttons</span>
          </div>
          <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
            Collapse and Ignore Use pure transparent background (
            <strong className="text-neutral-900 dark:text-neutral-100">bg-transparent</strong>)
            No solid background. Collapse Use deep black for core guided actions/Pure white high-contrast icon, Right Aligned. Ignore
            Use lightweight low-contrast light gray, Reduce accidental discard probability, Fit Apple HIG Visual weight guidance logic.
          </p>

          <div className="font-bold flex items-center gap-1.5 text-neutral-900 dark:text-neutral-100 pt-1 border-t border-neutral-200/60 dark:border-neutral-800/60">
            <ThumbsDown className="h-3.5 w-3.5 text-red-500" />
            <span>Reject Icon and business color palette system</span>
          </div>
          <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
            Reject/Deselect action deprecated to avoid confusion &quot;Off&quot; Cross Mark (X), Use thumbs down (Thumbs Down)
            Or Forbidden Icon. System Green, Red, Amber, Neutral Monochrome, Sky Blue and Purple 6 Selectable Color Palettes.
          </p>

          <div className="font-bold flex items-center gap-1.5 text-neutral-900 dark:text-neutral-100 pt-1 border-t border-neutral-200/60 dark:border-neutral-800/60">
            <Layers className="h-3.5 w-3.5 text-neutral-400" />
            <span>Stack horizontal drawer expansion animation with zero scrollbars</span>
          </div>
          <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
            When the unread stack expands, notification containers slide out from right to left, Remove downward floating animation.
            Hide scrollbars during transitions and expand shadow boundaries, Prevent right shadow clipping.
          </p>
        </div>
      </div>
    );
  }
);
