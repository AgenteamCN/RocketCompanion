/**
 * cloudProfileSyncTypes.ts
 * Pure types and human-readable field label helpers for Unified Flat Cloud Profile Sync
 * and Git-style 3-Way Merge conflict resolution.
 */

export type ProfileFlatSnapshot = Record<string, unknown>;

export interface ProfileMergeConflictItem {
  key: string;
  label: string;
  baseValue: unknown;
  localValue: unknown;
  devValue: unknown;
  selectedSource: 'local' | 'dev';
}

export interface ProfileThreeWayMergeResult {
  mergedSnapshot: ProfileFlatSnapshot;
  autoAppliedDevKeys: string[];
  keptLocalKeys: string[];
  conflicts: ProfileMergeConflictItem[];
}

export interface CloudManagedAccountItem {
  /** Immutable unique account ID (e.g. u_8f3a9c12) used as MQTT topic key */
  userId: string;
  /** Mutable login username entered by the user when signing in */
  username: string;
  /** Developer-assigned tag / note (#alias) */
  alias: string;
  /** User-configurable Multiplayer Name Card (Display Name) */
  displayName: string;
  password: string;
  passphraseHash: string;
  updatedAt: number;
  userRev: number;
  userRevHash: string;
  devRev: number;
  devRevHash: string;
}

export interface ActiveRemoteTuningSession {
  userId: string;
  username: string;
  alias: string;
  displayName: string;
  password: string;
  stashedLocalSnapshot: ProfileFlatSnapshot;
  baseTargetSnapshot: ProfileFlatSnapshot;
  existingIndex: CloudManagedAccountItem | null;
  startedAt: number;
  lastPushedAt: number | null;
  pushCount: number;
  lastCommitHash: string | null;
}

export interface CloudUserSlotRecord {
  rev: number;
  revHash?: string;
  updatedAt: number;
  passphraseHash: string;
  snapshot: ProfileFlatSnapshot;
  ackDevRev?: number;
  ackDevRevHash?: string;
}

export interface CloudDevSlotRecord {
  rev: number;
  revHash?: string;
  updatedAt: number;
  snapshot: ProfileFlatSnapshot;
  baseSnapshot: ProfileFlatSnapshot;
}

export interface CloudFetchedUserCompleteRecord {
  index: CloudManagedAccountItem | null;
  userSlot: CloudUserSlotRecord | null;
  devSlot: CloudDevSlotRecord | null;
}

export interface CloudProfileSyncBridgeCallbacks {
  fetchUserCompleteRecord: (
    userIdOrUsername: string,
    role: 'client' | 'dev'
  ) => Promise<CloudFetchedUserCompleteRecord>;
  publishUserProfileSlot: (params: {
    userId: string;
    username?: string;
    alias?: string;
    displayName?: string;
    password?: string;
    snapshot: ProfileFlatSnapshot;
    prevIndex?: CloudManagedAccountItem | null;
    ackDevRev?: number;
    ackDevRevHash?: string;
  }) => Promise<{ rev: number; revHash: string }>;
  publishDevProfileSlot: (params: {
    userId: string;
    username?: string;
    alias?: string;
    displayName?: string;
    password?: string;
    snapshot: ProfileFlatSnapshot;
    baseSnapshot: ProfileFlatSnapshot;
    prevIndex?: CloudManagedAccountItem | null;
  }) => Promise<{ rev: number; revHash: string }>;
  fetchAllAccounts: () => Promise<CloudManagedAccountItem[]>;
  upsertAccountDirectoryEntry: (params: {
    userId?: string;
    username: string;
    alias: string;
    displayName?: string;
    password: string;
    existingIndex?: CloudManagedAccountItem | null;
  }) => Promise<CloudManagedAccountItem>;
  deleteAccountDirectoryEntry: (userId: string) => Promise<void>;
  watchUserDevSlot: (
    userId: string,
    onUpdate: (
      devPayload: CloudDevSlotRecord,
      indexPayload: CloudManagedAccountItem | null
    ) => void,
    username?: string
  ) => () => void;
  computePassphraseHash: (userId: string, password: string) => Promise<string>;
}

export type CloudSyncStatus = 'idle' | 'syncing' | 'synced' | 'conflict' | 'error';

export interface LoggedInCloudUser {
  userId: string;
  username: string;
  alias: string;
  displayName: string;
  password: string;
}

export type CloudSignalingSource =
  | 'public'
  | 'custom'
  | 'dev-private'
  | 'imported-bundle'
  | 'uploaded'
  | 'builtin';

export interface CloudProfileSyncState {
  available: boolean;
  canManageAccounts: boolean;
  source: CloudSignalingSource;
  loggedInUser: LoggedInCloudUser | null;
  syncStatus: CloudSyncStatus;
  statusMessage: string | null;
  errorMessage: string | null;
  lastSyncedAt: number | null;
  userRev: number;
  userRevHash: string;
  devRev: number;
  devRevHash: string;
  autoSyncEnabled: boolean;
  allowRemoteProfileDeployment: boolean;
  mergedBaseSnapshot: ProfileFlatSnapshot | null;
  conflicts: ProfileMergeConflictItem[];
  accounts: CloudManagedAccountItem[];
  isLoadingAccounts: boolean;
  activeRemoteSession: ActiveRemoteTuningSession | null;
  isApplyingSnapshotInternally: boolean;

  setCapabilityState: (params: {
    available: boolean;
    canManageAccounts: boolean;
    source: CloudSignalingSource;
  }) => void;
  setBridgeCallbacks: (callbacks: CloudProfileSyncBridgeCallbacks | null) => void;
  setAutoSyncEnabled: (enabled: boolean) => void;
  setAllowRemoteProfileDeployment: (enabled: boolean) => void;
  updateUserDisplayName: (displayName: string) => Promise<void>;

  loginAndSyncUser: (
    username: string,
    password: string,
    forceIncludeDevSlot?: boolean
  ) => Promise<boolean>;
  logoutUser: () => void;
  pullUserCloudProfile: (forceIncludeDevSlot?: boolean) => Promise<boolean>;
  pushUserCloudProfile: () => Promise<boolean>;

  selectConflictSource: (key: string, source: 'local' | 'dev') => void;
  resolveConflicts: (mode: 'selected' | 'all-local' | 'all-dev') => Promise<void>;

  refreshAccounts: () => Promise<void>;
  upsertAccount: (
    username: string,
    password: string,
    alias: string,
    displayName?: string,
    userId?: string
  ) => Promise<boolean>;
  deleteAccount: (userId: string) => Promise<boolean>;

  startRemoteTuningSession: (account: {
    userId: string;
    username?: string;
    alias?: string;
    displayName?: string;
    password?: string;
  }) => Promise<boolean>;
  pushActiveRemoteSessionNow: () => Promise<boolean>;
  exitRemoteTuningSession: () => Promise<void>;

  exportLocalUserProfileBackup: () => string;
  exportRemoteAccountProfileBackup: (account: CloudManagedAccountItem) => Promise<boolean>;
}

const FIELD_CATEGORY_PREFIX_LABELS: Record<string, string> = {
  'garage.': 'Garage Loadout',
  'camera.': 'Camera',
  'trajectory.': 'Ball Trajectory',
  'graphics.': 'Display & Graphics',
  'audio.': 'Audio & Acoustics',
  'gameplay.': 'Gameplay',
  'telemetry.': 'Telemetry Overlay',
  'pacing.': 'Clock Pacing & Buffer',
  'boostPad.': 'Boost Pad Tuner',
  'driftwoods.': 'Driftwoods Stadium',
  'nameTag.': 'Name Tag & Off-Screen Indicator',
  'floating.': 'Floating Windows',
  'storage.': 'Extended Config',
};

export function formatSyncFieldLabel(key: string): string {
  for (const [prefix, groupLabel] of Object.entries(FIELD_CATEGORY_PREFIX_LABELS)) {
    if (key.startsWith(prefix)) {
      const rest = key.slice(prefix.length);
      return `${groupLabel} · ${rest}`;
    }
  }
  return key;
}

export function formatSyncValuePreview(val: unknown): string {
  if (val === undefined) return 'Default';
  if (val === null) return 'null';
  if (typeof val === 'boolean') return val ? 'On (true)' : 'Off (false)';
  if (typeof val === 'number') return String(val);
  if (typeof val === 'string') return val.length > 36 ? `${val.slice(0, 33)}...` : val;
  try {
    const json = JSON.stringify(val);
    return json.length > 48 ? `${json.slice(0, 45)}...` : json;
  } catch {
    return String(val);
  }
}
