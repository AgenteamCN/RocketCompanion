import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { QuickNotificationDrawer } from '../compounds/QuickNotification';
import { useQuickNotificationStore } from '../stores/quickNotificationStore';
import type { QuickNotificationItem } from '../stores/notificationTypes';
import {
  QuickNotificationBellCluster,
  QuickNotificationUnreadStackTray,
} from './QuickNotificationToastCard';

/**
 * Sequenced lifecycle states for the Notification Icon UI:
 * - 'hidden': completely unmounted
 * - 'spawning': generation animation in progress
 * - 'visible': idle & interactive
 * - 'exiting_window': Step 1: active or stack drawer is collapsing
 * - 'exiting_bubble': Step 2: counter bubble is shrinking/fading
 * - 'exiting_bell': Step 3a: bell icon is fading/shrinking
 * - 'exiting_container': Step 3b: 40x40 container is shrinking to center 0x0
 */
export type NotificationIconLifecycle =
  | 'hidden'
  | 'spawning'
  | 'visible'
  | 'exiting_window'
  | 'exiting_bubble'
  | 'exiting_bell'
  | 'exiting_container';

export interface QuickNotificationSystemProps {
  isLight?: boolean;
  className?: string;
  absolute?: boolean;
  placement?: 'top-right' | 'bottom-right';
  slotRight?: React.ReactNode | boolean;
  activeNotification?: QuickNotificationItem | null;
  ongoingNotification?: QuickNotificationItem | null;
  previewNotification?: QuickNotificationItem | null;
  unreadStack?: QuickNotificationItem[];
  isStackOpen?: boolean;
  onAction?: () => void;
  onCollapse?: () => void;
  onIgnore?: () => void;
  onResolveFromStack?: (id: string) => void;
  onDismissFromStack?: (id: string) => void;
  onToggleStack?: () => void;
  onStackOpenChange?: (open: boolean) => void;
  onLifecycleChange?: (lifecycle: NotificationIconLifecycle) => void;
}

export const QuickNotificationSystem: React.FC<QuickNotificationSystemProps> = ({
  isLight = false,
  className = '',
  absolute = true,
  placement = 'top-right',
  slotRight,
  activeNotification: controlledActive,
  ongoingNotification: controlledOngoing,
  previewNotification,
  unreadStack: controlledUnread,
  isStackOpen: controlledIsStackOpen,
  onAction,
  onCollapse,
  onIgnore,
  onResolveFromStack,
  onDismissFromStack,
  onToggleStack,
  onStackOpenChange,
  onLifecycleChange,
}) => {
  const store = useQuickNotificationStore();

  const effectiveUserActive =
    previewNotification ??
    (controlledActive !== undefined ? controlledActive : store.activeNotification);

  const effectiveOngoing =
    controlledOngoing !== undefined ? controlledOngoing : store.activeOngoingTask;

  const effectiveActive = effectiveUserActive ?? effectiveOngoing;

  const effectiveUnread =
    controlledUnread !== undefined
      ? controlledUnread
      : [...store.preemptedPersistentStack, ...store.unreadStack];

  const totalCount = (effectiveActive ? 1 : 0) + effectiveUnread.length;

  const [localStackOpen, setLocalStackOpen] = useState(false);
  const effectiveIsStackOpen =
    controlledIsStackOpen !== undefined
      ? controlledIsStackOpen
      : controlledUnread !== undefined
      ? localStackOpen
      : store.isStackOpen;

  const handleToggleStack = () => {
    if (onToggleStack) {
      onToggleStack();
    } else if (onStackOpenChange) {
      onStackOpenChange(!effectiveIsStackOpen);
    } else if (controlledUnread !== undefined) {
      setLocalStackOpen((prev) => !prev);
    } else {
      store.toggleStack();
    }
  };

  const [lifecycle, setLifecycle] = useState<NotificationIconLifecycle>(() =>
    totalCount > 0 ? 'visible' : 'hidden'
  );

  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const clearTimers = () => {
    timersRef.current.forEach((t) => clearTimeout(t));
    timersRef.current = [];
  };

  const prevCountRef = useRef(totalCount);
  const prevUnreadRef = useRef(effectiveUnread.length);

  useEffect(() => {
    onLifecycleChange?.(lifecycle);
  }, [lifecycle, onLifecycleChange]);

  useEffect(() => {
    const prevCount = prevCountRef.current;
    prevCountRef.current = totalCount;
    prevUnreadRef.current = effectiveUnread.length;

    if (prevCount === 0 && totalCount > 0) {
      clearTimers();
      if (lifecycle === 'hidden' || lifecycle.startsWith('exiting')) {
        setLifecycle('spawning');
        const t = setTimeout(() => {
          setLifecycle('visible');
        }, 260);
        timersRef.current.push(t);
      } else {
        setLifecycle('visible');
      }
      return;
    }

    if (prevCount > 0 && totalCount === 0) {
      clearTimers();
      setLifecycle('exiting_window');

      const t1 = setTimeout(() => {
        setLifecycle('exiting_bell');

        const t2 = setTimeout(() => {
          setLifecycle('exiting_container');

          const t3 = setTimeout(() => {
            setLifecycle('hidden');
          }, 220);
          timersRef.current.push(t3);
        }, 140);
        timersRef.current.push(t2);
      }, 260);
      timersRef.current.push(t1);
      return;
    }

    if (totalCount > 0 && lifecycle !== 'spawning' && !lifecycle.startsWith('exiting')) {
      setLifecycle('visible');
    }
  }, [totalCount, effectiveUnread.length, lifecycle]);

  useEffect(() => {
    return () => clearTimers();
  }, []);

  const hasSlotRight = Boolean(slotRight);
  const isBottomRight = placement === 'bottom-right';
  const anchorClass = isBottomRight
    ? absolute
      ? 'absolute bottom-[180px] right-5 flex-col-reverse'
      : 'fixed bottom-[180px] right-6 flex-col-reverse'
    : absolute
    ? 'absolute top-4 right-4 flex-col'
    : 'fixed top-4 right-6 flex-col';

  return (
    <div
      className={`${anchorClass} z-[900] select-none flex items-end pointer-events-auto ${className}`}
    >
      <div className="h-10 flex items-center gap-2.5 relative">
        <AnimatePresence mode="wait">
          {effectiveActive && (
            <motion.div
              key={`active-drawer-${effectiveActive.id}`}
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 'auto', opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{
                duration: 0.26,
                ease: [0.2, 0.8, 0.25, 1],
              }}
              style={{ overflow: 'hidden' }}
              className="flex items-center justify-end py-3 px-1 -my-3 -mx-1"
            >
              <motion.div
                initial={{ x: 60, opacity: 0.6 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: 60, opacity: 0 }}
                transition={{
                  duration: 0.26,
                  ease: [0.2, 0.8, 0.25, 1],
                }}
              >
                <QuickNotificationDrawer
                  id={effectiveActive.id}
                  content={effectiveActive.content}
                  tone={effectiveActive.tone}
                  icon={effectiveActive.icon}
                  type={effectiveActive.type}
                  duration={effectiveActive.duration}
                  buttons={effectiveActive.buttons}
                  actionButton={effectiveActive.actionButton}
                  remainingProgress={effectiveActive.remainingProgress}
                  progress={effectiveActive.progress}
                  isSpinningIcon={effectiveActive.isSpinningIcon}
                  isLight={isLight}
                  onAction={() => {
                    if (onAction) onAction();
                    else store.resolveActive();
                  }}
                  onCollapse={() => {
                    if (onCollapse) onCollapse();
                    else store.collapseActive();
                  }}
                  onIgnore={() => {
                    if (onIgnore) onIgnore();
                    else store.ignoreActive();
                  }}
                />
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        <QuickNotificationBellCluster
          isLight={isLight}
          lifecycle={lifecycle}
          unreadCount={effectiveUnread.length}
          slotRight={slotRight}
          onToggleStack={handleToggleStack}
        />
      </div>

      <QuickNotificationUnreadStackTray
        isOpen={effectiveIsStackOpen}
        items={effectiveUnread}
        isLight={isLight}
        isBottomRight={isBottomRight}
        hasSlotRight={hasSlotRight}
        onResolveItem={(id) => {
          if (onResolveFromStack) onResolveFromStack(id);
          else store.resolveFromStack(id);
        }}
        onDismissItem={(id) => {
          if (onDismissFromStack) onDismissFromStack(id);
          else store.dismissFromStack(id);
        }}
      />
    </div>
  );
};
