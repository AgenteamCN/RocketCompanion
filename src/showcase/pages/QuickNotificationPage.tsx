import React, { useState, useEffect, useRef } from 'react';
import { BellDot, Eye } from 'lucide-react';
import {
  useQuickNotificationStore, pushOngoingNotification, updateOngoingNotification,
  completeOngoingNotification,
} from '../../ui-core/stores/quickNotificationStore';
import {
  MONO_FONT_STACK,
  type QuickNotificationGlowLevel, type QuickNotificationType, type QuickNotificationButtonConfig,
} from '../../ui-core/compounds/QuickNotification';
import { QuickNotificationSystem, type NotificationIconLifecycle } from '../../ui-core/navigation/QuickNotificationSystem';
import { CodeBlock } from '../CodeBlock';
import { QuickNotificationControlPanel } from './quick-notification/QuickNotificationControlPanel';
import { QuickNotificationPresetsPanel } from './quick-notification/QuickNotificationPresetsPanel';
import { QuickNotificationTelemetryStatusBar } from './quick-notification/QuickNotificationTelemetryStatusBar';
import { useQuickNotificationDraftState } from './quick-notification/useQuickNotificationDraftState';

const LAZY_LOADING_SIM_STEPS: Array<{
  delayMs: number;
  content: string;
  icon: string;
  progress: number;
  isSpinningIcon: boolean;
}> = [
  {
    delayMs: 1200,
    content: 'Step 2/5: Audio sound packs 25% (2.4MB / 9.6MB)',
    icon: 'download',
    progress: 0.25,
    isSpinningIcon: false,
  },
  {
    delayMs: 2500,
    content: 'Step 3/5: Stadium textures 60% (14.4MB / 24.0MB)',
    icon: 'download',
    progress: 0.6,
    isSpinningIcon: false,
  },
  {
    delayMs: 3800,
    content: 'Step 4/5: Compiling WebGPU shaders (34/40 variants)',
    icon: 'loader-2',
    progress: 0.85,
    isSpinningIcon: true,
  },
  {
    delayMs: 5000,
    content: 'Step 5/5: Finalizing non-essential assets 100%',
    icon: 'loader-2',
    progress: 1.0,
    isSpinningIcon: true,
  },
];

export const QuickNotificationPage: React.FC<{ isLight?: boolean }> = ({ isLight = false }) => {
  const {
    activeOngoingTask,
    ongoingConflictPolicy,
    pushNotification,
  } = useQuickNotificationStore();

  const [iconLifecycle, setIconLifecycle] = useState<NotificationIconLifecycle>('hidden');

  const {
    showStackIcon,
    liveMode,
    temporalType,
    tone,
    iconName,
    content,
    ongoingProgressMode,
    ongoingProgressPct,
    isSpinningIcon,
    buttons,
    effectiveDuration,
    livePreviewDraft,
  } = useQuickNotificationDraftState();

  const simTimersRef = useRef<Array<ReturnType<typeof setTimeout>>>([]);
  const clearSimTimers = () => {
    simTimersRef.current.forEach((t) => clearTimeout(t));
    simTimersRef.current = [];
  };

  useEffect(() => {
    return () => clearSimTimers();
  }, []);

  const handlePushCurrent = () => {
    if (temporalType === 'ongoing') {
      pushOngoingNotification({
        content,
        tone,
        icon: iconName,
        progress:
          ongoingProgressMode === 'indeterminate'
            ? 'indeterminate'
            : ongoingProgressMode === 'determinate'
            ? ongoingProgressPct / 100
            : undefined,
        isSpinningIcon,
      });
      return;
    }

    pushNotification({
      content,
      tone,
      icon: iconName,
      type: temporalType,
      duration: effectiveDuration,
      buttons,
    });
  };

  const handlePushPreset = (
    presetTone: QuickNotificationGlowLevel,
    presetType: QuickNotificationType,
    presetDuration: number,
    presetIcon: string,
    presetText: string,
    presetButtons?: QuickNotificationButtonConfig[]
  ) => {
    pushNotification({
      tone: presetTone,
      type: presetType,
      duration: presetDuration,
      icon: presetIcon,
      content: presetText,
      buttons: presetButtons,
    });
  };

  const handlePushBatch = () => {
    handlePushPreset(
      'error',
      'persistent',
      0,
      'octagon-alert',
      'Critical: Main game loop frame drop detected',
      [{ key: 'reconnect', label: 'Reconnect', icon: 'rotate-ccw', format: 'icon-text', color: 'amber' }]
    );
    setTimeout(() => {
      handlePushPreset(
        'warning',
        'temporary',
        3000,
        'flame',
        'GPU temperature reached 84°C',
        [
          { key: 'cool', label: 'Cool', icon: 'check', format: 'icon-only', color: 'green' },
          { key: 'ignore', label: 'Mute', icon: 'thumbs-down', format: 'icon-only', color: 'red' },
        ]
      );
    }, 450);
    setTimeout(() => {
      handlePushPreset('info', 'temporary', 5000, 'bell', 'Notice: Sync token refreshed successfully');
    }, 900);
  };

  const handleRunLazyLoadingSimulation = () => {
    clearSimTimers();
    const taskId = 'lazy-load-sim';

    pushOngoingNotification({
      id: taskId,
      content: 'Step 1/5: Verifying optional asset manifests...',
      icon: 'loader-2',
      progress: 'indeterminate',
      isSpinningIcon: true,
      tone: 'none',
    });

    for (const step of LAZY_LOADING_SIM_STEPS) {
      simTimersRef.current.push(
        setTimeout(() => {
          updateOngoingNotification(taskId, {
            content: step.content,
            icon: step.icon,
            progress: step.progress,
            isSpinningIcon: step.isSpinningIcon,
            tone: 'none',
          });
        }, step.delayMs)
      );
    }

    simTimersRef.current.push(
      setTimeout(() => {
        completeOngoingNotification(taskId, {
          content: 'All lazy-loaded assets ready!',
          icon: 'check',
          autoDismissMs: 1400,
          tone: 'none',
        });
      }, 6200)
    );
  };

  const handleRunPriorityPreemptionTest = () => {
    clearSimTimers();
    const taskId = 'bg-stream-task';

    pushOngoingNotification({
      id: taskId,
      content: 'Lazy Loading: Streaming Champions Field textures (32%)...',
      icon: 'download',
      progress: 0.32,
      isSpinningIcon: false,
      tone: 'none',
    });

    simTimersRef.current.push(
      setTimeout(() => {
        pushNotification({
          content: 'Telemetry spike: 154ms > 80ms threshold',
          tone: 'warning',
          icon: 'triangle-alert',
          type: 'temporary',
          duration: 3000,
          buttons: [
            { key: 'inspect', label: 'Inspect', icon: 'rotate-ccw', format: 'icon-text', color: 'amber' },
          ],
        });
      }, 700)
    );
  };

  const handleRunMultiTaskTest = () => {
    clearSimTimers();
    pushOngoingNotification({
      id: 'task-audio',
      content: 'Task A: Downloading audio pack (40%)',
      progress: 0.4,
      icon: 'download',
      isSpinningIcon: false,
    });

    simTimersRef.current.push(
      setTimeout(() => {
        pushOngoingNotification({
          id: 'task-decals',
          content: 'Task B: Caching custom decals (80%)',
          progress: 0.8,
          icon: 'sparkles',
          isSpinningIcon: false,
        });
      }, 600)
    );
  };

  const generatedUsageCode = `import { QuickNotificationDrawer } from '@/ui-core/compounds/QuickNotification';
import { QuickNotificationSystem } from '@/ui-core/navigation/QuickNotificationSystem';
import {
  quickNotificationStore, pushQuickNotification, pushOngoingNotification, updateOngoingNotification,
  dismissOngoingNotification, completeOngoingNotification,
} from '@/ui-core/stores/quickNotificationStore';

// ── scene A: Background Task / Lazy Loading Notification ──
const taskId = pushOngoingNotification({
  id: 'lazy-pack-downloader',
  content: 'Lazy Loading: Downloading optional textures (45%)...',
  icon: 'download',
  progress: 0.45,
  isSpinningIcon: false,
  tone: 'none',
});

updateOngoingNotification(taskId, {
  content: 'Lazy Loading: Compiling shaders (85%)...',
  progress: 0.85,
  icon: 'loader-2',
  isSpinningIcon: true,
});

completeOngoingNotification(taskId, {
  content: 'All background assets ready!',
  autoDismissMs: 1400,
});

// ── scene B: Standard interaction notification ──
pushQuickNotification({
  content: ${JSON.stringify(content)},
  tone: '${tone}',
  icon: '${iconName}',
  type: '${temporalType}',
  duration: ${effectiveDuration},
  buttons: ${JSON.stringify(buttons, null, 2)},
});

// ── scene C: Receiver container ──
<QuickNotificationSystem slotRight={true} />`;

  return (
    <div style={{ fontFamily: MONO_FONT_STACK }} className="flex flex-col gap-5 w-full relative font-mono text-xs">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-neutral-200/80 dark:border-neutral-800">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-neutral-200/80 dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 flex items-center justify-center shrink-0">
            <BellDot className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Quick Notification Quick notification system</h1>
            <p className={`text-xs mt-0.5 ${isLight ? 'text-neutral-500' : 'text-neutral-400'}`}>
              Lightweight drawer notification. 4 Level inner glow and non-glow regular base plate, Far-right collapse button, Multi-business button color palettes and horizontal drawer expansion animations.
            </p>
          </div>
        </div>
      </div>

      <div
        className={`relative w-full min-h-[520px] rounded-2xl border p-6 overflow-hidden select-none transition-colors ${
        isLight ? 'bg-neutral-100/70 border-neutral-200 shadow-inner'
        : 'bg-neutral-950/80 border-neutral-800 shadow-inner' }`} style={{ backgroundImage: isLight
        ? 'radial-gradient(#d4d4d8 1px, transparent 1px)' : 'radial-gradient(#27272a 1px, transparent 1px)',
        backgroundSize: '24px 24px' }}>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none opacity-30 select-none">
          <span className="text-3xl mb-1">[Bell]</span>
          <span className="text-xs font-mono font-bold text-neutral-800 dark:text-neutral-200">
            [Quick Notification Simulation Canvas]
          </span>
          <span className="text-[11px] text-neutral-400 max-w-md text-center mt-1">
            Top-right dual slots: Slot 1 (Stack Icon / Empty slot) and Slot 2 (Notification Icon). Each drawer slides out from right to left when the unread stack expands.
          </span>
        </div>

        <QuickNotificationSystem isLight={isLight} absolute={true} slotRight={showStackIcon}
          previewNotification={liveMode ? livePreviewDraft : null} onLifecycleChange={setIconLifecycle} />

        {liveMode && (
          <div className="absolute bottom-4 left-4 flex items-center gap-2 px-3 py-1.5 rounded-lg border border-amber-500/40 bg-amber-500/10 text-amber-500 text-[11px] font-mono pointer-events-none">
            <Eye className="h-3.5 w-3.5 animate-pulse" />
            <span>LIVE Enable real-time debug mode · Real-time character and button projection</span>
          </div>
        )}
      </div>

      <QuickNotificationTelemetryStatusBar
        isLight={isLight}
        iconLifecycle={iconLifecycle}
        showStackIcon={showStackIcon}
        liveMode={liveMode}
        handlePushCurrent={handlePushCurrent}
      />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <QuickNotificationControlPanel isLight={isLight} />

        <QuickNotificationPresetsPanel isLight={isLight} handlePushCurrent={handlePushCurrent}
          handlePushPreset={handlePushPreset} handlePushBatch={handlePushBatch}
          handleRunLazyLoadingSimulation={handleRunLazyLoadingSimulation}
          handleRunPriorityPreemptionTest={handleRunPriorityPreemptionTest}
          handleRunMultiTaskTest={handleRunMultiTaskTest} ongoingConflictPolicy={ongoingConflictPolicy}
          activeOngoingTask={activeOngoingTask} />
      </div>

      <div className="mt-2">
        <CodeBlock code={generatedUsageCode} language="tsx" title="QuickNotification Recipe (Code usage demo)" />
      </div>
    </div>
  );
};
