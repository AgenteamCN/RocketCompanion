import { create } from 'zustand';
import { syncBridge as crossClientSync } from './syncBridge';
import type {
  QuickNotificationItem,
  QuickNotificationPushOptions,
  QuickNotificationOngoingPushOptions,
  OngoingConflictPolicy,
  QuickNotificationStoreState,
  QuickNotificationCompletionOptions,
  QuickNotificationActions,
  QuickNotificationStore,
} from './notificationTypes';
import {
  validateNotificationOptions,
  resolveActiveOngoing,
  notificationScheduler,
} from './notificationScheduler';


let activeTimer: ReturnType<typeof setTimeout> | null = null;
let activeProgressInterval: ReturnType<typeof setInterval> | null = null;

const clearActiveTimers = () => {
  if (activeTimer) {
    clearTimeout(activeTimer);
    activeTimer = null;
  }
  if (activeProgressInterval) {
    clearInterval(activeProgressInterval);
    activeProgressInterval = null;
  }
};

const isSpinningIconName = (icon: unknown): boolean =>
  typeof icon === 'string' &&
  (icon.includes('loader') || icon.includes('refresh') || icon.includes('spin'));

const startTimerForActive = (
  item: QuickNotificationItem,
  set: (fn: (state: QuickNotificationStore) => Partial<QuickNotificationStore>) => void,
  get: () => QuickNotificationStore
) => {
  clearActiveTimers();
  if (item.type !== 'temporary') return;

  const totalMs = Math.max(800, item.duration || 3000);
  const startTime = Date.now();

  activeProgressInterval = setInterval(() => {
    const remainingFraction = Math.max(0, 1 - (Date.now() - startTime) / totalMs);
    const active = get().activeNotification;
    if (active && active.id === item.id) {
      set(() => ({
        activeNotification: {
          ...active,
          remainingProgress: remainingFraction,
        },
      }));
    }
  }, 50);

  activeTimer = setTimeout(() => {
    clearActiveTimers();
    const { nextState, restoredItem } = notificationScheduler.scheduleTimeoutAutoCollapse(get());
    set(() => nextState);
    if (restoredItem && restoredItem.type === 'temporary') {
      startTimerForActive(restoredItem, set, get);
    }
  }, totalMs);
};

export const useQuickNotificationStore = create<QuickNotificationStore>((set, get) => ({
  activeNotification: null,
  preemptedPersistentStack: [],
  unreadStack: [],
  totalUnreadCount: 0,
  isStackOpen: false,
  ongoingTasks: [],
  activeOngoingTask: null,
  ongoingConflictPolicy: 'latest',

  setOngoingConflictPolicy: (policy: OngoingConflictPolicy) => {
    set(() => ({
      ongoingConflictPolicy: policy,
      activeOngoingTask: resolveActiveOngoing(get().ongoingTasks, policy),
    }));
  },

  pushOngoingNotification: (config: QuickNotificationOngoingPushOptions) => {
    validateNotificationOptions({ ...config, type: config.type || 'ongoing', duration: 0 });

    const taskId = config.id || `ongoing-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const currentTasks = get().ongoingTasks;
    const existingIndex = currentTasks.findIndex((t) => t.id === taskId);

    const taskItem: QuickNotificationItem = {
      id: taskId,
      content: config.content,
      tone: config.tone || 'none',
      icon: config.icon || 'loader-2',
      type: 'ongoing',
      duration: 0,
      progress: config.progress,
      isSpinningIcon: config.isSpinningIcon ?? isSpinningIconName(config.icon),
      timestamp: Date.now(),
    };

    const nextTasks = [...currentTasks];
    if (existingIndex >= 0) {
      nextTasks[existingIndex] = { ...nextTasks[existingIndex], ...taskItem };
    } else {
      nextTasks.push(taskItem);
    }

    set(() => ({
      ongoingTasks: nextTasks,
      activeOngoingTask: resolveActiveOngoing(nextTasks, get().ongoingConflictPolicy),
    }));

    return taskId;
  },

  updateOngoingNotification: (idOrUpdates, updates) => {
    const targetId =
      typeof idOrUpdates === 'string'
        ? idOrUpdates
        : get().activeOngoingTask?.id || get().ongoingTasks[get().ongoingTasks.length - 1]?.id;
    const patch: Partial<QuickNotificationPushOptions> =
      typeof idOrUpdates === 'string' ? updates || {} : idOrUpdates;

    if (!targetId) return;
    const currentTasks = get().ongoingTasks;
    const targetIndex = currentTasks.findIndex((t) => t.id === targetId);
    if (targetIndex < 0) return;

    const current = currentTasks[targetIndex];
    const isSpinning =
      patch.isSpinningIcon !== undefined
        ? patch.isSpinningIcon
        : patch.icon !== undefined
        ? isSpinningIconName(patch.icon)
        : current.isSpinningIcon;

    const nextTasks = [...currentTasks];
    nextTasks[targetIndex] = {
      ...current,
      content: patch.content !== undefined ? patch.content : current.content,
      tone: patch.tone !== undefined ? patch.tone : current.tone,
      icon: patch.icon !== undefined ? patch.icon : current.icon,
      progress: patch.progress !== undefined ? patch.progress : current.progress,
      isSpinningIcon: isSpinning,
      timestamp: Date.now(),
    };

    set(() => ({
      ongoingTasks: nextTasks,
      activeOngoingTask: resolveActiveOngoing(nextTasks, get().ongoingConflictPolicy),
    }));
  },

  dismissOngoingNotification: (id?: string) => {
    const targetId =
      id || get().activeOngoingTask?.id || get().ongoingTasks[get().ongoingTasks.length - 1]?.id;
    if (!targetId) return;

    const nextTasks = get().ongoingTasks.filter((t) => t.id !== targetId);
    set(() => ({
      ongoingTasks: nextTasks,
      activeOngoingTask: resolveActiveOngoing(nextTasks, get().ongoingConflictPolicy),
    }));
  },

  completeOngoingNotification: (id, options) => {
    const targetId = id || get().activeOngoingTask?.id;
    if (!targetId) return;

    get().updateOngoingNotification(targetId, {
      content: options?.content || 'Completed',
      progress: 1,
      icon: options?.icon || 'check',
      isSpinningIcon: false,
      tone: options?.tone || 'none',
    });

    setTimeout(() => {
      get().dismissOngoingNotification(targetId);
    }, options?.autoDismissMs ?? 1200);
  },

  pushNotification: (config: QuickNotificationPushOptions) => {
    validateNotificationOptions(config);
    if (config.type === 'ongoing' || config.type === 'background') {
      return get().pushOngoingNotification(config);
    }

    clearActiveTimers();
    const newItem: QuickNotificationItem = {
      id: config.id || `notif-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      content: config.content,
      tone: config.tone || 'none',
      icon: config.icon || 'bell',
      type: config.type,
      duration: config.duration ?? (config.type === 'temporary' ? 3000 : 0),
      buttons: config.buttons,
      actionButton: config.actionButton,
      timestamp: Date.now(),
      remainingProgress: 1,
    };

    set(() => notificationScheduler.schedulePush(get(), newItem));
    startTimerForActive(newItem, set, get);
    return newItem.id;
  },

  updateNotification: (id: string, patch: Partial<QuickNotificationPushOptions>) => {
    const current = get();
    if (current.activeNotification?.id === id) {
      set(() => ({ activeNotification: { ...current.activeNotification!, ...patch } }));
    }

    const preemptedIndex = current.preemptedPersistentStack.findIndex((item) => item.id === id);
    if (preemptedIndex >= 0) {
      const nextPreempted = [...current.preemptedPersistentStack];
      nextPreempted[preemptedIndex] = { ...nextPreempted[preemptedIndex], ...patch };
      set(() => ({ preemptedPersistentStack: nextPreempted }));
    }

    const unreadIndex = current.unreadStack.findIndex((item) => item.id === id);
    if (unreadIndex >= 0) {
      const nextUnread = [...current.unreadStack];
      nextUnread[unreadIndex] = { ...nextUnread[unreadIndex], ...patch };
      set(() => ({
        unreadStack: nextUnread,
        totalUnreadCount: nextUnread.length + current.preemptedPersistentStack.length,
      }));
    }

    if (current.ongoingTasks.some((item) => item.id === id)) {
      get().updateOngoingNotification(id, patch);
    }
  },

  dismissNotification: (id: string) => {
    clearActiveTimers();
    const { nextState, restoredItem } = notificationScheduler.scheduleDismissById(get(), id);
    set(() => nextState);
    if (restoredItem?.type === 'temporary') {
      startTimerForActive(restoredItem, set, get);
    }
  },

  resolveNotification: (id: string) => {
    const current = get();
    const target =
      (current.activeNotification?.id === id ? current.activeNotification : null) ||
      current.preemptedPersistentStack.find((item) => item.id === id) ||
      current.unreadStack.find((item) => item.id === id);

    (target?.actionButton?.onClick || target?.buttons?.[0]?.onClick)?.();
    get().dismissNotification(id);
  },

  collapseActive: () => {
    clearActiveTimers();
    set(() => notificationScheduler.scheduleUserCollapseActive(get()));
  },

  resolveActive: () => {
    clearActiveTimers();
    const active = get().activeNotification;
    (active?.actionButton?.onClick || active?.buttons?.[0]?.onClick)?.();
    const { nextState, restoredItem } = notificationScheduler.scheduleResolveOrDismissActive(get());
    set(() => nextState);
    if (restoredItem?.type === 'temporary') {
      startTimerForActive(restoredItem, set, get);
    }
  },

  ignoreActive: () => {
    clearActiveTimers();
    const { nextState, restoredItem } = notificationScheduler.scheduleResolveOrDismissActive(get());
    set(() => nextState);
    if (restoredItem?.type === 'temporary') {
      startTimerForActive(restoredItem, set, get);
    }
  },

  toggleStack: () => {
    const s = get();
    if (s.unreadStack.length + s.preemptedPersistentStack.length === 0) return;
    set(() => ({ isStackOpen: !s.isStackOpen }));
  },

  setStackOpen: (open: boolean) => set(() => ({ isStackOpen: open })),

  expandNotificationCenter: () => {
    const s = get();
    if (s.unreadStack.length + s.preemptedPersistentStack.length > 0 && !s.isStackOpen) {
      set(() => ({ isStackOpen: true }));
    }
  },

  resolveFromStack: (id: string) => get().resolveNotification(id),
  dismissFromStack: (id: string) => get().dismissNotification(id),

  clearAll: () => {
    clearActiveTimers();
    set(() => ({
      activeNotification: null,
      preemptedPersistentStack: [],
      unreadStack: [],
      totalUnreadCount: 0,
      ongoingTasks: [],
      activeOngoingTask: null,
      isStackOpen: false,
    }));
  },
}));

// Listen for decoupled UI expand events (e.g., from L1 InlineErrorNotice)
const sanitizeItem = (item: QuickNotificationItem | null): QuickNotificationItem | null => {
  if (!item) return null;
  return {
    ...item,
    icon: typeof item.icon === 'string' ? item.icon : 'bell',
    buttons: item.buttons?.map((b) => ({
      key: b.key,
      label: b.label,
      color: b.color,
      format: b.format,
      icon: typeof b.icon === 'string' ? b.icon : undefined,
    })),
  };
};

let syncingFromRemoteNotification = false;

useQuickNotificationStore.subscribe((s) => {
  if (syncingFromRemoteNotification || crossClientSync.isApplyingRemote()) return;
  crossClientSync.set('store:quickNotification', {
    activeNotification: sanitizeItem(s.activeNotification),
    preemptedPersistentStack: s.preemptedPersistentStack
      .map(sanitizeItem)
      .filter(Boolean) as QuickNotificationItem[],
    unreadStack: s.unreadStack.map(sanitizeItem).filter(Boolean) as QuickNotificationItem[],
    totalUnreadCount: s.totalUnreadCount,
    isStackOpen: s.isStackOpen,
    ongoingTasks: s.ongoingTasks.map(sanitizeItem).filter(Boolean) as QuickNotificationItem[],
    activeOngoingTask: sanitizeItem(s.activeOngoingTask),
    ongoingConflictPolicy: s.ongoingConflictPolicy,
  });
});

crossClientSync.subscribeKey<Partial<QuickNotificationStoreState>>(
  'store:quickNotification',
  (remote) => {
    if (!remote || typeof remote !== 'object') return;
    syncingFromRemoteNotification = true;
    try {
      clearActiveTimers();
      useQuickNotificationStore.setState({
        activeNotification: remote.activeNotification ?? null,
        preemptedPersistentStack: remote.preemptedPersistentStack ?? [],
        unreadStack: remote.unreadStack ?? [],
        totalUnreadCount: remote.totalUnreadCount ?? 0,
        isStackOpen: remote.isStackOpen ?? false,
        ongoingTasks: remote.ongoingTasks ?? [],
        activeOngoingTask: remote.activeOngoingTask ?? null,
        ongoingConflictPolicy: remote.ongoingConflictPolicy ?? 'latest',
      });
    } finally {
      syncingFromRemoteNotification = false;
    }
  }
);

crossClientSync.onReset((scopePrefix) => {
  if (scopePrefix && !'store:quickNotification'.startsWith(scopePrefix)) return;
  clearActiveTimers();
  useQuickNotificationStore.setState({
    activeNotification: null,
    preemptedPersistentStack: [],
    unreadStack: [],
    totalUnreadCount: 0,
    ongoingTasks: [],
    activeOngoingTask: null,
    isStackOpen: false,
    ongoingConflictPolicy: 'latest',
  });
});

if (typeof window !== 'undefined') {
  window.addEventListener('ui:expand-quick-notification', () => {
    useQuickNotificationStore.getState().expandNotificationCenter();
  });
}

// Standalone action helpers
export const pushQuickNotification = (config: QuickNotificationPushOptions) =>
  useQuickNotificationStore.getState().pushNotification(config);
export const pushOngoingNotification = (config: QuickNotificationOngoingPushOptions) =>
  useQuickNotificationStore.getState().pushOngoingNotification(config);

export const updateOngoingNotification = (
  idOrUpdates: string | Partial<QuickNotificationOngoingPushOptions>,
  updates?: Partial<QuickNotificationOngoingPushOptions>
) => useQuickNotificationStore.getState().updateOngoingNotification(idOrUpdates, updates);

export const dismissOngoingNotification = (id?: string) =>
  useQuickNotificationStore.getState().dismissOngoingNotification(id);

export const completeOngoingNotification = (
  id?: string,
  options?: QuickNotificationCompletionOptions
) => useQuickNotificationStore.getState().completeOngoingNotification(id, options);

export const updateQuickNotification = (id: string, patch: Partial<QuickNotificationPushOptions>) =>
  useQuickNotificationStore.getState().updateNotification(id, patch);
export const dismissQuickNotification = (id: string) =>
  useQuickNotificationStore.getState().dismissNotification(id);
export const resolveQuickNotification = (id: string) =>
  useQuickNotificationStore.getState().resolveNotification(id);
export const expandQuickNotificationCenter = () =>
  useQuickNotificationStore.getState().expandNotificationCenter();
export const clearAllQuickNotifications = () =>
  useQuickNotificationStore.getState().clearAll();

export const quickNotificationStore = Object.assign(useQuickNotificationStore, {
  pushNotification: pushQuickNotification,
  pushOngoingNotification,
  updateOngoingNotification,
  dismissOngoingNotification,
  completeOngoingNotification,
  updateNotification: updateQuickNotification,
  dismissNotification: dismissQuickNotification,
  resolveNotification: resolveQuickNotification,
  collapseActive: () => useQuickNotificationStore.getState().collapseActive(),
  resolveActive: () => useQuickNotificationStore.getState().resolveActive(),
  ignoreActive: () => useQuickNotificationStore.getState().ignoreActive(),
  toggleStack: () => useQuickNotificationStore.getState().toggleStack(),
  setStackOpen: (open: boolean) => useQuickNotificationStore.getState().setStackOpen(open),
  expandNotificationCenter: expandQuickNotificationCenter,
  resolveFromStack: resolveQuickNotification,
  dismissFromStack: dismissQuickNotification,
  clearAll: clearAllQuickNotifications,
});

export const quickNotification = {
  show: (content: string) =>
    pushQuickNotification({ content, type: 'temporary', tone: 'none', duration: 2400 }),
  info: (content: string) =>
    pushQuickNotification({ content, type: 'temporary', tone: 'info', duration: 2400 }),
  success: (content: string) =>
    pushQuickNotification({ content, type: 'temporary', tone: 'info', duration: 2400 }),
  warning: (content: string) =>
    pushQuickNotification({ content, type: 'temporary', tone: 'warning', duration: 2800 }),
  error: (content: string) =>
    pushQuickNotification({ content, type: 'temporary', tone: 'error', duration: 3200 }),
};

