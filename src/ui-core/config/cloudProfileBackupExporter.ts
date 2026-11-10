/**
 * cloudProfileBackupExporter.ts
 * Pure helper for exporting human- and LLM-readable JSON backups of Unified Profile Snapshots
 * from Settings -> Advanced (local user profile) and Developer -> Remote Profile Management
 * (others' cloud profiles).
 */

import { computeCommitHashSync } from './cloudProfileMergePipeline';
import {
  type CloudManagedAccountItem,
  type LoggedInCloudUser,
  type ProfileFlatSnapshot,
} from './cloudProfileSyncTypes';

export interface CloudProfileBackupAccountMetadata {
  userId: string;
  username: string;
  alias: string;
  displayName: string;
  userRev?: number;
  userRevHash?: string;
  devRev?: number;
  devRevHash?: string;
}

export interface CloudProfileBackupDocument {
  schema: 'rocket-companion-profile-backup-v2';
  exportedAtIso: string;
  exportSource: 'user-advanced-settings' | 'developer-remote-profile';
  commitHash: string;
  account: CloudProfileBackupAccountMetadata;
  groupedSettings: Record<string, Record<string, unknown>>;
  parsedStorageObjects: Record<string, unknown>;
  flatSnapshot: ProfileFlatSnapshot;
}

export function buildCloudProfileBackupDocument(params: {
  snapshot: ProfileFlatSnapshot;
  exportSource: 'user-advanced-settings' | 'developer-remote-profile';
  account?: Partial<CloudProfileBackupAccountMetadata> | null;
  rev?: number;
  revHash?: string | null;
}): CloudProfileBackupDocument {
  const { snapshot, exportSource, account, rev = 1, revHash } = params;
  const sortedFlat: ProfileFlatSnapshot = {};
  const groupedSettings: Record<string, Record<string, unknown>> = {};
  const parsedStorageObjects: Record<string, unknown> = {};

  for (const key of Object.keys(snapshot || {}).sort()) {
    const val = snapshot[key];
    sortedFlat[key] = val;

    const dotIdx = key.indexOf('.');
    const group = dotIdx > 0 ? key.slice(0, dotIdx) : 'general';
    const subKey = dotIdx > 0 ? key.slice(dotIdx + 1) : key;
    if (!groupedSettings[group]) {
      groupedSettings[group] = {};
    }
    groupedSettings[group][subKey] = val;

    if (group === 'storage' && typeof val === 'string') {
      const trimmed = val.trim();
      if (
        (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
        (trimmed.startsWith('[') && trimmed.endsWith(']'))
      ) {
        try {
          parsedStorageObjects[subKey] = JSON.parse(trimmed);
        } catch {
          parsedStorageObjects[subKey] = val;
        }
      } else {
        parsedStorageObjects[subKey] = val;
      }
    }
  }

  const effectiveHash =
    revHash && /^[0-9a-f]{6,12}$/i.test(revHash.trim())
      ? revHash.trim().toLowerCase().slice(0, 7)
      : computeCommitHashSync(sortedFlat, rev, account?.userId || 'backup');

  const resolvedDisplayName =
    account?.displayName ||
    (typeof sortedFlat['garage.displayName'] === 'string'
      ? String(sortedFlat['garage.displayName'])
      : 'Player');

  return {
    schema: 'rocket-companion-profile-backup-v2',
    exportedAtIso: new Date().toISOString(),
    exportSource,
    commitHash: effectiveHash,
    account: {
      userId: account?.userId || 'local',
      username: account?.username || account?.userId || 'local',
      alias: account?.alias || resolvedDisplayName,
      displayName: resolvedDisplayName,
      userRev: account?.userRev,
      userRevHash: account?.userRevHash,
      devRev: account?.devRev,
      devRevHash: account?.devRevHash,
    },
    groupedSettings,
    parsedStorageObjects,
    flatSnapshot: sortedFlat,
  };
}

export function triggerJsonBackupDownload(
  doc: CloudProfileBackupDocument,
  filenamePrefix: string = 'rc-profile-backup'
): string {
  const safeSlug = String(
    doc.account.username !== 'local'
      ? doc.account.username
      : doc.account.displayName || 'local'
  )
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'user';
  const dateStamp = doc.exportedAtIso.slice(0, 10);
  const filename = `${filenamePrefix}-${safeSlug}-${doc.commitHash}-${dateStamp}.json`;

  if (typeof document !== 'undefined' && typeof Blob !== 'undefined') {
    const jsonText = JSON.stringify(doc, null, 2);
    const blob = new Blob([jsonText], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  return filename;
}

export function exportUserBackupFromLoggedInState(
  snapshot: ProfileFlatSnapshot,
  currentUser: LoggedInCloudUser | null,
  lastSyncedUserRev: number,
  lastSyncedDevRev: number,
  lastSyncedHash?: string | null
): string {
  const doc = buildCloudProfileBackupDocument({
    snapshot,
    exportSource: 'user-advanced-settings',
    rev: Math.max(1, lastSyncedUserRev, lastSyncedDevRev),
    revHash: lastSyncedHash,
    account: currentUser
      ? {
          userId: currentUser.userId,
          username: currentUser.username,
          alias: currentUser.alias,
          displayName: currentUser.displayName,
          userRev: lastSyncedUserRev,
          userRevHash: lastSyncedHash || undefined,
          devRev: lastSyncedDevRev,
        }
      : null,
  });
  return triggerJsonBackupDownload(doc, 'rc-profile-backup');
}

export function exportManagedAccountBackup(
  account: CloudManagedAccountItem,
  snapshot: ProfileFlatSnapshot,
  activeHash?: string | null
): string {
  const doc = buildCloudProfileBackupDocument({
    snapshot,
    exportSource: 'developer-remote-profile',
    rev: Math.max(1, account.userRev, account.devRev),
    revHash: activeHash || account.devRevHash || account.userRevHash,
    account: {
      userId: account.userId,
      username: account.username,
      alias: account.alias,
      displayName: account.displayName,
      userRev: account.userRev,
      userRevHash: account.userRevHash,
      devRev: account.devRev,
      devRevHash: account.devRevHash,
    },
  });
  return triggerJsonBackupDownload(doc, 'rc-remote-profile-backup');
}
