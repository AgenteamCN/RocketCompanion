import React from 'react';
import { Send, Trash2 } from 'lucide-react';
import { Button } from '../../../ui-core/primitives/Button';
import { useQuickNotificationStore } from '../../../ui-core/stores/quickNotificationStore';
import type { NotificationIconLifecycle } from '../../../ui-core/navigation/QuickNotificationSystem';

export interface QuickNotificationTelemetryStatusBarProps {
  isLight: boolean;
  iconLifecycle: NotificationIconLifecycle;
  showStackIcon: boolean;
  liveMode: boolean;
  handlePushCurrent: () => void;
}

export const QuickNotificationTelemetryStatusBar: React.FC<
  QuickNotificationTelemetryStatusBarProps
> = ({
  isLight,
  iconLifecycle,
  showStackIcon,
  liveMode,
  handlePushCurrent,
}) => {
  const {
    activeNotification,
    totalUnreadCount,
    ongoingTasks,
    activeOngoingTask,
    ongoingConflictPolicy,
    setOngoingConflictPolicy,
    clearAll,
  } = useQuickNotificationStore();

  const ongoingTasksCount = ongoingTasks.length;

  return (
    <div
      className={`px-4 py-2.5 rounded-xl border flex flex-wrap items-center justify-between gap-3 text-xs font-mono transition-colors ${
        isLight
          ? 'bg-neutral-50/80 border-neutral-200 text-neutral-700 shadow-2xs'
          : 'bg-neutral-900/60 border-neutral-800 text-neutral-300'
      }`}
    >
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-1.5">
          <span className="text-neutral-400">Icon State:</span>
          <span
            className={`font-bold ${
              iconLifecycle === 'visible'
                ? 'text-emerald-500'
                : iconLifecycle === 'spawning'
                ? 'text-amber-500'
                : iconLifecycle === 'hidden'
                ? 'text-neutral-500'
                : 'text-red-500'
            }`}
          >
            {iconLifecycle.toUpperCase()}
          </span>
        </div>

        <span className="text-neutral-300 dark:text-neutral-700">|</span>

        <div className="flex items-center gap-1.5">
          <span className="text-neutral-400">Active Drawer:</span>
          <strong className="text-neutral-900 dark:text-neutral-100 font-bold">
            {activeNotification
              ? `[${activeNotification.type.toUpperCase()}] ${
                  typeof activeNotification.content === 'string'
                    ? activeNotification.content.slice(0, 24)
                    : 'User Active'
                }...`
              : activeOngoingTask
              ? `[ONGOING] ${
                  typeof activeOngoingTask.content === 'string'
                    ? activeOngoingTask.content.slice(0, 24)
                    : activeOngoingTask.id
                }...`
              : 'NONE (IDLE)'}
          </strong>
        </div>

        <span className="text-neutral-300 dark:text-neutral-700">|</span>

        <div className="flex items-center gap-1.5">
          <span className="text-neutral-400">Ongoing Task:</span>
          {activeOngoingTask ? (
            <span className="flex items-center gap-1">
              <span
                className={`font-bold ${
                  activeNotification ? 'text-amber-500' : 'text-emerald-500'
                }`}
              >
                {activeNotification ? '[YIELDED / COVERED]' : '[ACTIVE]'}
              </span>
              <span className="text-neutral-900 dark:text-neutral-100 font-bold max-w-[130px] truncate">
                {typeof activeOngoingTask.content === 'string'
                  ? activeOngoingTask.content
                  : activeOngoingTask.id}
              </span>
              {typeof activeOngoingTask.progress === 'number' && (
                <span className="text-neutral-400 font-normal">
                  (
                  {Math.round(
                    activeOngoingTask.progress > 1
                      ? activeOngoingTask.progress
                      : activeOngoingTask.progress * 100
                  )}
                  %)
                </span>
              )}
            </span>
          ) : (
            <strong className="text-neutral-400">NONE</strong>
          )}
        </div>

        <span className="text-neutral-300 dark:text-neutral-700">|</span>

        <div className="flex items-center gap-1.5">
          <span className="text-neutral-400">Policy:</span>
          <button
            type="button"
            onClick={() =>
              setOngoingConflictPolicy(
                ongoingConflictPolicy === 'latest' ? 'first' : 'latest'
              )
            }
            className="px-1.5 py-0.5 rounded bg-neutral-200 dark:bg-neutral-800 text-[10px] font-bold cursor-pointer hover:bg-neutral-300 dark:hover:bg-neutral-700"
            title="Click to switch multitasking strategy (latest / first)"
          >
            {ongoingConflictPolicy.toUpperCase()}
          </button>
        </div>

        <span className="text-neutral-300 dark:text-neutral-700">|</span>

        <div className="flex items-center gap-1.5">
          <span className="text-neutral-400">Unread in Stack:</span>
          <strong className="text-neutral-900 dark:text-neutral-100 font-bold">
            {totalUnreadCount}
          </strong>
        </div>

        <span className="text-neutral-300 dark:text-neutral-700">|</span>

        <div className="flex items-center gap-1.5">
          <span className="text-neutral-400">Slot 1 (Right):</span>
          <strong
            className={
              showStackIcon
                ? 'text-neutral-900 dark:text-neutral-100'
                : 'text-neutral-400'
            }
          >
            {showStackIcon ? 'SLOT 1 (40px)' : 'DECOUPLED (0px No placeholder)'}
          </strong>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Button
          variant="primary"
          size="sm"
          isLight={isLight}
          icon={<Send className="h-3.5 w-3.5" />}
          onClick={handlePushCurrent}
          className="font-mono text-xs"
        >
          Push current notification
        </Button>

        {(activeNotification || totalUnreadCount > 0 || ongoingTasksCount > 0) && (
          <Button
            variant="danger"
            size="sm"
            isLight={isLight}
            icon={<Trash2 className="h-3.5 w-3.5" />}
            onClick={clearAll}
          >
            Clear notifications (
            {totalUnreadCount + (activeNotification ? 1 : 0) + ongoingTasksCount})
          </Button>
        )}

        <div className="flex items-center gap-2 text-[11px] text-neutral-400">
          <span>Mode:</span>
          <span
            className={`font-bold px-1.5 py-0.5 rounded ${
              liveMode
                ? 'bg-amber-500/20 text-amber-500 border border-amber-500/40'
                : 'bg-neutral-200 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300'
            }`}
          >
            {liveMode ? 'LIVE' : 'PUSH'}
          </span>
        </div>
      </div>
    </div>
  );
};
