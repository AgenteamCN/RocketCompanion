import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { BellDot, Layers } from 'lucide-react';
import {
  QuickNotificationDrawer,
  MONO_FONT_STACK,
} from '../compounds/QuickNotification';
import type { QuickNotificationItem } from '../stores/notificationTypes';

type NotificationIconLifecycle =
  | 'hidden'
  | 'spawning'
  | 'visible'
  | 'exiting_window'
  | 'exiting_bubble'
  | 'exiting_bell'
  | 'exiting_container';

export interface QuickNotificationToastCardProps {
  isLight: boolean;
  lifecycle: NotificationIconLifecycle;
  unreadCount: number;
  slotRight?: React.ReactNode | boolean;
  onToggleStack: () => void;
}

export const QuickNotificationBellCluster: React.FC<QuickNotificationToastCardProps> = React.memo(
  ({ isLight, lifecycle, unreadCount, slotRight, onToggleStack }) => {
    const isIconMounted = lifecycle !== 'hidden';
    const isContainerShrunk = lifecycle === 'exiting_container';
    const isBellFaded = lifecycle === 'exiting_bell' || lifecycle === 'exiting_container';
    const isBubbleVisible = unreadCount > 0;
    const hasSlotRight = Boolean(slotRight);

    return (
      <>
        {isIconMounted && (
          <div className="relative w-10 h-10 shrink-0 flex items-center justify-center">
            <AnimatePresence>
              {isIconMounted && (
                <motion.div
                  key="notification-icon-wrapper"
                  initial={
                    lifecycle === 'spawning'
                      ? { scale: 0, opacity: 0 }
                      : { scale: 1, opacity: 1 }
                  }
                  animate={
                    isContainerShrunk
                      ? { scale: 0, opacity: 0 }
                      : { scale: 1, opacity: 1 }
                  }
                  exit={{ scale: 0, opacity: 0 }}
                  transition={{
                    duration: 0.22,
                    ease: [0.2, 0.8, 0.25, 1],
                  }}
                  className="relative w-10 h-10 flex items-center justify-center"
                >
                  <motion.button
                    type="button"
                    onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
                      e.stopPropagation();
                      onToggleStack();
                    }}
                    title={
                      unreadCount > 0
                        ? `View unread notifications (${unreadCount})`
                        : 'Notification Center'
                    }
                    aria-label="Quick Notifications"
                    className={`relative h-10 w-10 flex items-center justify-center rounded-xl border transition-all cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-neutral-400 active:scale-95 z-30 shadow-md ${
                      isLight
                        ? 'bg-white hover:bg-neutral-50 border-neutral-300 text-neutral-900'
                        : 'bg-neutral-900 hover:bg-neutral-850 border-neutral-700 text-neutral-100'
                    }`}
                  >
                    <motion.div
                      initial={
                        lifecycle === 'spawning'
                          ? { opacity: 0, scale: 0.6 }
                          : { opacity: 1, scale: 1 }
                      }
                      animate={
                        isBellFaded
                          ? { opacity: 0, scale: 0.6 }
                          : { opacity: 1, scale: 1 }
                      }
                      transition={{
                        duration: 0.14,
                        ease: 'easeOut',
                        delay: lifecycle === 'spawning' ? 0.08 : 0,
                      }}
                      className="flex items-center justify-center"
                    >
                      <BellDot className="h-5 w-5 text-neutral-900 dark:text-neutral-100" />
                    </motion.div>
                  </motion.button>

                  <AnimatePresence>
                    {isBubbleVisible && (
                      <motion.div
                        key={`notif-bubble-${unreadCount}`}
                        initial={{ scale: 0.4, opacity: 0 }}
                        animate={{ scale: [0.4, 1.25, 1], opacity: 1 }}
                        exit={{
                          scale: 0,
                          opacity: 0,
                          transition: { duration: 0.16, ease: 'easeIn' },
                        }}
                        transition={{ type: 'spring', stiffness: 500, damping: 22 }}
                        style={{ fontFamily: MONO_FONT_STACK }}
                        className={`absolute -top-1.5 -right-1.5 min-w-[20px] h-[20px] px-1 rounded-full border flex items-center justify-center font-mono font-bold text-[11px] pointer-events-none select-none z-40 ${
                          isLight
                            ? 'bg-white text-black border-black shadow-xs'
                            : 'bg-black text-white border-white shadow-xs'
                        }`}
                      >
                        {unreadCount}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        {hasSlotRight && (
          <div className="w-10 h-10 shrink-0 flex items-center justify-center">
            {slotRight === true ? (
              <div
                className={`h-10 w-10 flex items-center justify-center rounded-xl border select-none transition-all cursor-default shadow-md ${
                  isLight
                    ? 'bg-white border-neutral-300 text-neutral-900'
                    : 'bg-neutral-900 border-neutral-700 text-neutral-100'
                }`}
                title="Slot 1 (Stack Icon)"
              >
                <Layers className="h-5 w-5 text-neutral-800 dark:text-neutral-200" />
              </div>
            ) : (
              slotRight
            )}
          </div>
        )}
      </>
    );
  }
);

QuickNotificationBellCluster.displayName = 'QuickNotificationBellCluster';

export interface QuickNotificationUnreadStackTrayProps {
  isOpen: boolean;
  items: QuickNotificationItem[];
  isLight: boolean;
  isBottomRight: boolean;
  hasSlotRight: boolean;
  onResolveItem: (id: string) => void;
  onDismissItem: (id: string) => void;
}

export const QuickNotificationUnreadStackTray: React.FC<QuickNotificationUnreadStackTrayProps> =
  React.memo(
    ({
      isOpen,
      items,
      isLight,
      isBottomRight,
      hasSlotRight,
      onResolveItem,
      onDismissItem,
    }) => {
      return (
        <AnimatePresence>
          {isOpen && items.length > 0 && (
            <motion.div
              key="unread-stack-tray"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              style={{
                scrollbarWidth: 'none',
                msOverflowStyle: 'none',
              }}
              className={`${
                isBottomRight ? 'mb-2.5' : 'mt-2.5'
              } flex flex-col items-end gap-2 z-40 max-h-[460px] overflow-y-auto overflow-x-hidden p-2 ${
                hasSlotRight ? 'pr-[50px]' : 'pr-0.5'
              } [&::-webkit-scrollbar]:hidden`}
            >
              {items.map((item) => (
                <div key={`stacked-row-${item.id}`} className="flex justify-end w-full">
                  <motion.div
                    key={`stacked-drawer-${item.id}`}
                    layout="position"
                    initial={{ width: 0, opacity: 0 }}
                    animate={{ width: 'auto', opacity: 1 }}
                    exit={{ width: 0, opacity: 0 }}
                    transition={{ duration: 0.28, ease: [0.2, 0.8, 0.25, 1] }}
                    style={{ overflow: 'hidden' }}
                    className="flex justify-end py-3 px-1 -my-3 -mx-1"
                  >
                    <motion.div
                      initial={{ x: 60, opacity: 0.6 }}
                      animate={{ x: 0, opacity: 1 }}
                      exit={{ x: 60, opacity: 0 }}
                      transition={{ duration: 0.28, ease: [0.2, 0.8, 0.25, 1] }}
                    >
                      <QuickNotificationDrawer
                        id={item.id}
                        content={item.content}
                        tone={item.tone}
                        icon={item.icon}
                        type={item.type}
                        buttons={item.buttons}
                        actionButton={item.actionButton}
                        isStackedItem={true}
                        isLight={isLight}
                        onAction={() => onResolveItem(item.id)}
                        onIgnore={() => onDismissItem(item.id)}
                      />
                    </motion.div>
                  </motion.div>
                </div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      );
    }
  );

QuickNotificationUnreadStackTray.displayName = 'QuickNotificationUnreadStackTray';
