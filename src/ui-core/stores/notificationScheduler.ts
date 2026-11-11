import type {
  QuickNotificationType,
  QuickNotificationItem,
  QuickNotificationPushOptions,
  QuickNotificationOngoingPushOptions,
  OngoingConflictPolicy,
  QuickNotificationStoreState,
} from './notificationTypes';

export type {
  QuickNotificationItem,
  QuickNotificationPushOptions,
  QuickNotificationOngoingPushOptions,
  OngoingConflictPolicy,
  QuickNotificationStoreState,
};

export type SchemaErrorPresenter = (message: string) => void;
let customSchemaErrorPresenter: SchemaErrorPresenter | null = null;

/**
 * Optional hook to register a custom error UI presenter (e.g. Dialogue modal)
 * without coupling the pure notification scheduler to any specific UI widget.
 */
export const registerSchemaErrorPresenter = (presenter: SchemaErrorPresenter | null) => {
  customSchemaErrorPresenter = presenter;
};

/**
 * Triggers a fatal parameter schema error:
 * 1. Outputs structured bold red console error
 * 2. Notifies any registered error presenter or dispatches decoupled 'rc-ui:fatal-schema-error' DOM event
 * 3. Throws a fatal JavaScript Error
 */
export const triggerFatalSchemaError = (message: string): never => {
  const errorBanner = `[FATAL NOTIFICATION ERROR] ${message}`;
  console.error(
    `%c${errorBanner}`,
    'background: #dc2626; color: white; font-weight: bold; padding: 6px 12px; border-radius: 4px; font-size: 13px;'
  );

  try {
    if (customSchemaErrorPresenter) {
      customSchemaErrorPresenter(message);
    } else if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('rc-ui:fatal-schema-error', { detail: { message } })
      );
    }
  } catch {
    // Fallback if presenter/listener is not initialized
  }

  throw new Error(errorBanner);
};

/**
 * Strict Runtime Validation for Notification Push Options.
 * Prohibits silent fallbacks. Throws and dispatches fatal schema error event on violation.
 */
export const validateNotificationOptions = (rawConfig: unknown): void => {
  if (!rawConfig || typeof rawConfig !== 'object') {
    triggerFatalSchemaError('Notification configuration must be a valid non-null object.');
  }
  const config = rawConfig as Record<string, any>;

  if ('durationMs' in config) {
    triggerFatalSchemaError(
      `Found invalid property 'durationMs' in notification '${config.id || 'anonymous'}'. ` +
        `You must use 'duration' (in milliseconds) instead.`
    );
  }

  if ('action' in config && !('actionButton' in config)) {
    triggerFatalSchemaError(
      `Found legacy property 'action' in notification '${config.id || 'anonymous'}'. ` +
        `You must use 'actionButton: { label, onClick }' or 'buttons: [...]' instead.`
    );
  }

  if (!config.type) {
    triggerFatalSchemaError(
      `Missing required property 'type' in notification '${config.id || 'anonymous'}'. ` +
        `Must be explicitly set to 'temporary', 'persistent', 'ongoing', or 'background'. Silent fallback is strictly disabled.`
    );
  }

  const validTypes: QuickNotificationType[] = ['temporary', 'persistent', 'ongoing', 'background'];
  if (!validTypes.includes(config.type)) {
    triggerFatalSchemaError(
      `Invalid notification type '${config.type}'. Expected one of: ${validTypes.map((t) => `'${t}'`).join(', ')}.`
    );
  }

  if (config.type === 'temporary') {
    if (typeof config.duration !== 'number' || config.duration <= 0) {
      triggerFatalSchemaError(
        `Temporary notification requires a positive numerical 'duration' (in milliseconds). Received: ${config.duration}.`
      );
    }
  }

  if (config.content === undefined || config.content === null) {
    triggerFatalSchemaError(
      `Notification 'content' cannot be null or undefined in notification '${config.id || 'anonymous'}'.`
    );
  }
};

/**
 * Resolves active ongoing task based on conflict policy
 */
export const resolveActiveOngoing = (
  tasks: QuickNotificationItem[],
  policy: OngoingConflictPolicy
): QuickNotificationItem | null => {
  if (tasks.length === 0) return null;
  if (policy === 'first' || policy === 'queue') return tasks[0];
  return tasks[tasks.length - 1];
};

/**
 * Resolves the compound deduplication identity (`sourceNamespace::collapseKey`) for a notification item.
 * Returns `null` when the notification does not participate in collapse/upsert arbitration (`APPEND_ONLY`).
 */
export const resolveCompoundCollapseIdentity = (
  item: Pick<
    QuickNotificationItem,
    'collapseKey' | 'sourceNamespace' | 'collapseStrategy'
  >
): string | null => {
  if (!item.collapseKey || item.collapseStrategy === 'APPEND_ONLY') {
    return null;
  }
  const ns = (item.sourceNamespace || 'default').trim() || 'default';
  return `${ns}::${item.collapseKey.trim()}`;
};

/**
 * Checks whether an existing notification item matches a target identifier
 * (system primary `id`, legacy `externalId`, `collapseKey`, or compound `sourceNamespace::collapseKey`).
 */
export const matchesNotificationIdentifier = (
  item: QuickNotificationItem,
  targetIdOrKey: string
): boolean => {
  if (!targetIdOrKey) return false;
  if (item.id === targetIdOrKey) return true;
  if (item.externalId && item.externalId === targetIdOrKey) return true;
  if (item.collapseKey && item.collapseKey === targetIdOrKey) return true;
  const compound = resolveCompoundCollapseIdentity(item);
  return compound !== null && compound === targetIdOrKey;
};

const canCollapseReplaceExisting = (
  existing: QuickNotificationItem,
  incoming: QuickNotificationItem
): boolean => {
  const incomingKey = resolveCompoundCollapseIdentity(incoming);
  if (!incomingKey) return false;
  const existingKey = resolveCompoundCollapseIdentity(existing);
  if (existingKey !== incomingKey) return false;

  const strategy = incoming.collapseStrategy || 'REPLACE_UNREAD';
  if (strategy === 'APPEND_ONLY') return false;
  if (strategy === 'REPLACE_UNREAD' && existing.isRead) {
    return false;
  }
  return true;
};

/**
 * Notification Scheduler: Pure state arbitration engine
 */
export const notificationScheduler = {
  schedulePush: (
    state: QuickNotificationStoreState,
    newItem: QuickNotificationItem
  ): Partial<QuickNotificationStoreState> => {
    const currentActive = state.activeNotification;
    let nextPreempted = [...state.preemptedPersistentStack];
    let nextUnread = [...state.unreadStack];

    // 1. Compound Key Collapse / Upsert Arbitration (`sourceNamespace::collapseKey`)
    let priorVersion = 0;
    const isReplacingCurrentActive = Boolean(
      currentActive && canCollapseReplaceExisting(currentActive, newItem)
    );
    if (isReplacingCurrentActive && currentActive) {
      priorVersion = Math.max(priorVersion, currentActive.version ?? 1);
    }

    nextPreempted = nextPreempted.filter((existing) => {
      if (canCollapseReplaceExisting(existing, newItem)) {
        priorVersion = Math.max(priorVersion, existing.version ?? 1);
        return false;
      }
      return true;
    });

    nextUnread = nextUnread.filter((existing) => {
      if (canCollapseReplaceExisting(existing, newItem)) {
        priorVersion = Math.max(priorVersion, existing.version ?? 1);
        return false;
      }
      return true;
    });

    const finalNewItem: QuickNotificationItem =
      priorVersion > 0
        ? { ...newItem, version: priorVersion + 1 }
        : { ...newItem, version: newItem.version ?? 1 };

    // 2. Foreground Preemption (only push previous active into stack if it wasn't replaced by this collapse key)
    if (currentActive && !isReplacingCurrentActive) {
      if (currentActive.type === 'persistent') {
        nextPreempted = [currentActive, ...nextPreempted];
      } else if (currentActive.type === 'temporary') {
        nextUnread = [currentActive, ...nextUnread];
      }
    }

    return {
      activeNotification: finalNewItem,
      preemptedPersistentStack: nextPreempted,
      unreadStack: nextUnread,
      totalUnreadCount: nextUnread.length + nextPreempted.length,
    };
  },

  scheduleResolveOrDismissActive: (
    state: QuickNotificationStoreState
  ): {
    nextState: Partial<QuickNotificationStoreState>;
    restoredItem: QuickNotificationItem | null;
  } => {
    let nextActive: QuickNotificationItem | null = null;
    let nextPreempted = [...state.preemptedPersistentStack];

    if (nextPreempted.length > 0) {
      nextActive = nextPreempted[0];
      nextPreempted = nextPreempted.slice(1);
    }

    return {
      nextState: {
        activeNotification: nextActive,
        preemptedPersistentStack: nextPreempted,
        totalUnreadCount: state.unreadStack.length + nextPreempted.length,
      },
      restoredItem: nextActive,
    };
  },

  scheduleTimeoutAutoCollapse: (
    state: QuickNotificationStoreState
  ): {
    nextState: Partial<QuickNotificationStoreState>;
    restoredItem: QuickNotificationItem | null;
  } => {
    const currentActive = state.activeNotification;
    let nextUnread = [...state.unreadStack];

    if (currentActive) {
      nextUnread = nextUnread.filter(
        (existing) => !canCollapseReplaceExisting(existing, currentActive)
      );
      nextUnread = [currentActive, ...nextUnread];
    }

    let nextActive: QuickNotificationItem | null = null;
    let nextPreempted = [...state.preemptedPersistentStack];

    if (nextPreempted.length > 0) {
      nextActive = nextPreempted[0];
      nextPreempted = nextPreempted.slice(1);
    }

    return {
      nextState: {
        activeNotification: nextActive,
        preemptedPersistentStack: nextPreempted,
        unreadStack: nextUnread,
        totalUnreadCount: nextUnread.length + nextPreempted.length,
      },
      restoredItem: nextActive,
    };
  },

  scheduleUserCollapseActive: (
    state: QuickNotificationStoreState
  ): Partial<QuickNotificationStoreState> => {
    const currentActive = state.activeNotification;
    if (!currentActive) return {};

    const filteredUnread = state.unreadStack.filter(
      (existing) => !canCollapseReplaceExisting(existing, currentActive)
    );
    const nextUnread = [currentActive, ...filteredUnread];
    return {
      activeNotification: null,
      unreadStack: nextUnread,
      totalUnreadCount: nextUnread.length + state.preemptedPersistentStack.length,
    };
  },

  scheduleDismissById: (
    state: QuickNotificationStoreState,
    id: string
  ): {
    nextState: Partial<QuickNotificationStoreState>;
    restoredItem: QuickNotificationItem | null;
  } => {
    let nextActive = state.activeNotification;
    let nextPreempted = state.preemptedPersistentStack.filter(
      (item) => !matchesNotificationIdentifier(item, id)
    );
    const nextUnread = state.unreadStack.filter(
      (item) => !matchesNotificationIdentifier(item, id)
    );
    const nextOngoing = state.ongoingTasks.filter(
      (item) => !matchesNotificationIdentifier(item, id)
    );
    let restoredItem: QuickNotificationItem | null = null;

    if (nextActive && matchesNotificationIdentifier(nextActive, id)) {
      if (nextPreempted.length > 0) {
        restoredItem = nextPreempted[0];
        nextActive = restoredItem;
        nextPreempted = nextPreempted.slice(1);
      } else {
        nextActive = null;
      }
    }

    return {
      nextState: {
        activeNotification: nextActive,
        preemptedPersistentStack: nextPreempted,
        unreadStack: nextUnread,
        totalUnreadCount: nextUnread.length + nextPreempted.length,
        ongoingTasks: nextOngoing,
        activeOngoingTask: resolveActiveOngoing(nextOngoing, state.ongoingConflictPolicy),
        isStackOpen: nextUnread.length > 0 ? state.isStackOpen : false,
      },
      restoredItem,
    };
  },
};
