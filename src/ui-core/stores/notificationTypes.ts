import React from 'react';

export type QuickNotificationGlowLevel = 'none' | 'info' | 'warning' | 'orange' | 'error';
export type QuickNotificationType = 'temporary' | 'persistent' | 'ongoing' | 'background';

export type QuickNotificationButtonVariant =
  | 'green'   // Accept
  | 'red'     // Reject
  | 'amber'   // Retry / Warning
  | 'neutral' // Neutral
  | 'sky'     // Info / Sky
  | 'purple'; // Special

export type QuickNotificationButtonFormat = 'icon-only' | 'text-only' | 'icon-text';

/**
 * Collapse / deduplication arbitration strategy when `collapseKey` is provided:
 * - `'APPEND_ONLY'`: Never overwrite prior notifications (default when `collapseKey` is omitted).
 * - `'REPLACE_UNREAD'`: Upsert/replace in-place if the prior notification with the same `(sourceNamespace, collapseKey)`
 *   is still active or unread in the tray; if the user already read/resolved/dismissed it, append a new entry.
 * - `'ALWAYS_REPLACE'`: Unconditionally overwrite/replace any active or unread notification matching `(sourceNamespace, collapseKey)`
 *   (ideal for ping-pong telemetry buffers like Alpha/Bravo trajectory anomaly capture where prior buffer data is invalidated).
 */
export type QuickNotificationCollapseStrategy =
  | 'APPEND_ONLY'
  | 'REPLACE_UNREAD'
  | 'ALWAYS_REPLACE';

export interface QuickNotificationButtonConfig {
  key?: string;
  label?: string;
  icon?: string | React.ReactNode;
  format?: QuickNotificationButtonFormat;
  color?: QuickNotificationButtonVariant;
  dismissOnClick?: boolean;
  onClick?: () => void;
}

export interface QuickNotificationItem {
  /** System-generated immutable internal primary key (auto-incremented / snowflake style) */
  id: string;
  /** Optional caller-supplied external business key or legacy id alias */
  externalId?: string;
  /** Optional business collapse / deduplication key (e.g. 'traj-anomaly-captured') */
  collapseKey?: string;
  /** Isolated sender namespace preventing cross-service key collisions (default: 'default') */
  sourceNamespace?: string;
  /** Arbitration policy when `collapseKey` is present */
  collapseStrategy?: QuickNotificationCollapseStrategy;
  /** Monotonically increasing revision counter when collapsed/upserted in place */
  version?: number;
  /** Whether the user has explicitly read/interacted with this notification */
  isRead?: boolean;
  content: React.ReactNode;
  tone: QuickNotificationGlowLevel;
  icon: string | React.ReactNode;
  type: QuickNotificationType;
  duration: number; // milliseconds (0 for persistent/ongoing)
  buttons?: QuickNotificationButtonConfig[];
  actionButton?: {
    label: string;
    onClick?: () => void;
  };
  timestamp: number;
  remainingProgress?: number; // 0 to 1 for temporary
  progress?: number | 'indeterminate'; // for ongoing/background tasks
  isSpinningIcon?: boolean;
}

export type QuickNotificationPushOptions = Omit<
  QuickNotificationItem,
  'id' | 'timestamp' | 'icon' | 'tone'
> & {
  id?: string;
  timestamp?: number;
  icon?: string | React.ReactNode;
  tone?: QuickNotificationGlowLevel;
  /** Snake_case alias for `collapseKey` (APNs / standard notification API compatibility) */
  collapse_key?: string;
  /** Snake_case alias for `sourceNamespace` */
  source_app?: string;
  /** Snake_case alias for `collapseStrategy` */
  collapse_strategy?: QuickNotificationCollapseStrategy;
};

export type QuickNotificationOngoingPushOptions = Omit<
  QuickNotificationPushOptions,
  'type' | 'duration'
> & {
  type?: QuickNotificationType;
  duration?: number;
};

export type OngoingConflictPolicy = 'latest' | 'first' | 'queue';

export interface QuickNotificationStoreState {
  activeNotification: QuickNotificationItem | null;
  preemptedPersistentStack: QuickNotificationItem[];
  unreadStack: QuickNotificationItem[];
  totalUnreadCount: number;
  isStackOpen: boolean;
  ongoingTasks: QuickNotificationItem[];
  activeOngoingTask: QuickNotificationItem | null;
  ongoingConflictPolicy: OngoingConflictPolicy;
}

export interface QuickNotificationCompletionOptions {
  content?: React.ReactNode;
  autoDismissMs?: number;
  icon?: string;
  tone?: QuickNotificationGlowLevel;
}

export interface QuickNotificationActions {
  // Ongoing Tasks (Lazy Loading, Preloading, Background Sync)
  pushOngoingNotification: (config: QuickNotificationOngoingPushOptions) => string;
  updateOngoingNotification: (
    idOrUpdates: string | Partial<QuickNotificationOngoingPushOptions>,
    updates?: Partial<QuickNotificationOngoingPushOptions>
  ) => void;
  dismissOngoingNotification: (id?: string) => void;
  completeOngoingNotification: (
    id?: string,
    options?: QuickNotificationCompletionOptions
  ) => void;
  setOngoingConflictPolicy: (policy: OngoingConflictPolicy) => void;

  // Interactive Notifications (Temporary & Persistent Alerts)
  pushNotification: (config: QuickNotificationPushOptions) => string;
  updateNotification: (id: string, patch: Partial<QuickNotificationPushOptions>) => void;
  dismissNotification: (id: string) => void;
  resolveNotification: (id: string) => void;

  // Active notification actions
  collapseActive: () => void;
  resolveActive: () => void;
  ignoreActive: () => void;

  // Unread stack tray
  toggleStack: () => void;
  setStackOpen: (open: boolean) => void;
  expandNotificationCenter: () => void;
  resolveFromStack: (id: string) => void;
  dismissFromStack: (id: string) => void;

  // Global reset
  clearAll: () => void;
}

export type QuickNotificationStore = QuickNotificationStoreState & QuickNotificationActions;
