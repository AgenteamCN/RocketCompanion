import React, { useEffect, useState } from 'react';
import { dialogue } from '../../compounds/dialogue/dialogueStore';
import type {
  CloudProfileSyncState,
  ProfileMergeConflictItem,
} from '../../config/cloudProfileSyncTypes';

export const CLOUD_PROFILE_CONFLICT_DIALOGUE_ID = 'cloud-profile-merge-conflict';

export interface ConflictDialogueStorePort {
  getState: () => CloudProfileSyncState;
  subscribe: (listener: (state: CloudProfileSyncState) => void) => () => void;
}

function formatValuePreview(val: unknown): string {
  if (val === undefined) return 'unset';
  if (val === null) return 'null';
  if (typeof val === 'string') return val.length > 36 ? `${val.slice(0, 33)}...` : val;
  if (typeof val === 'number' || typeof val === 'boolean') return String(val);
  try {
    const str = JSON.stringify(val);
    return str.length > 42 ? `${str.slice(0, 39)}...` : str;
  } catch {
    return String(val);
  }
}

export const CloudProfileConflictDialogueContent: React.FC<{
  storePort: ConflictDialogueStorePort;
}> = ({ storePort }) => {
  const [conflicts, setConflicts] = useState<ProfileMergeConflictItem[]>(
    () => storePort.getState().conflicts
  );
  const [devRevHash, setDevRevHash] = useState<string>(
    () => storePort.getState().devRevHash
  );

  useEffect(() => {
    return storePort.subscribe((state) => {
      setConflicts(state.conflicts);
      setDevRevHash(state.devRevHash);
    });
  }, [storePort]);

  if (conflicts.length === 0) {
    return null;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%' }}>
      <div style={{ fontSize: 12, lineHeight: 1.45, opacity: 0.9 }}>
        Developer commit <strong>#{devRevHash}</strong> modified{' '}
        <strong>{conflicts.length}</strong> setting(s) that you also changed locally.
        Non-conflicting settings were applied automatically. Choose which value to keep:
      </div>

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
          maxHeight: 220,
          overflowY: 'auto',
          padding: 8,
          borderRadius: 6,
          background: 'rgba(0, 0, 0, 0.22)',
          border: '1px solid rgba(128, 128, 128, 0.22)',
        }}
      >
        {conflicts.map((item) => {
          const isDev = item.selectedSource === 'dev';
          return (
            <div
              key={item.key}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 10,
                padding: '6px 8px',
                borderRadius: 4,
                background: 'rgba(255, 255, 255, 0.04)',
                fontSize: 11,
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0, flex: 1 }}>
                <span style={{ fontWeight: 700, wordBreak: 'break-word' }}>{item.label}</span>
                <span style={{ fontSize: 10, opacity: 0.75, fontFamily: 'monospace' }}>
                  Mine: {formatValuePreview(item.localValue)} | Dev: {formatValuePreview(item.devValue)}
                </span>
              </div>

              <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                <button
                  type="button"
                  onClick={() => storePort.getState().selectConflictSource(item.key, 'local')}
                  style={{
                    padding: '3px 8px',
                    borderRadius: 4,
                    fontSize: 10,
                    fontWeight: 700,
                    cursor: 'pointer',
                    border: !isDev
                      ? '1px solid rgba(56, 189, 248, 0.85)'
                      : '1px solid rgba(128, 128, 128, 0.3)',
                    background: !isDev ? 'rgba(56, 189, 248, 0.2)' : 'transparent',
                    color: 'inherit',
                  }}
                >
                  Mine
                </button>
                <button
                  type="button"
                  onClick={() => storePort.getState().selectConflictSource(item.key, 'dev')}
                  style={{
                    padding: '3px 8px',
                    borderRadius: 4,
                    fontSize: 10,
                    fontWeight: 700,
                    cursor: 'pointer',
                    border: isDev
                      ? '1px solid rgba(251, 191, 36, 0.9)'
                      : '1px solid rgba(128, 128, 128, 0.3)',
                    background: isDev ? 'rgba(251, 191, 36, 0.22)' : 'transparent',
                    color: 'inherit',
                  }}
                >
                  Dev
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

import { useCloudProfileSyncStore } from '../../stores/cloudProfileSyncStore';

let conflictDialogueSubscriptionAttached = false;

export function attachCloudProfileConflictDialogueAutoSync(): void {
  if (conflictDialogueSubscriptionAttached) return;
  conflictDialogueSubscriptionAttached = true;

  let prevConflictsCount = useCloudProfileSyncStore.getState().conflicts.length;
  if (prevConflictsCount > 0) {
    syncConflictDialogueState(prevConflictsCount, useCloudProfileSyncStore);
  }

  useCloudProfileSyncStore.subscribe((state) => {
    const nextCount = state.conflicts.length;
    if (nextCount !== prevConflictsCount) {
      prevConflictsCount = nextCount;
      syncConflictDialogueState(nextCount, useCloudProfileSyncStore);
    }
  });
}

export function syncConflictDialogueState(
  conflictsCount: number,
  storePort: ConflictDialogueStorePort
): void {
  if (conflictsCount <= 0) {
    dialogue.dismiss(CLOUD_PROFILE_CONFLICT_DIALOGUE_ID);
    return;
  }

  dialogue.show({
    id: CLOUD_PROFILE_CONFLICT_DIALOGUE_ID,
    title: 'PROFILE SYNC CONFLICT',
    titleFontSize: 20,
    titleLetterSpacing: 4,
    tone: 'warning',
    icon: 'git-merge',
    maxWidth: 620,
    showCloseButton: true,
    content: React.createElement(CloudProfileConflictDialogueContent, { storePort }),
    buttons: [
      {
        key: 'keep-local',
        label: 'KEEP MINE',
        variant: 'outline',
        onClick: () => {
          void storePort.getState().resolveConflicts('all-local');
        },
      },
      {
        key: 'apply-selected',
        label: 'APPLY SELECTED',
        variant: 'outline',
        onClick: () => {
          void storePort.getState().resolveConflicts('selected');
        },
      },
      {
        key: 'use-dev',
        label: 'USE DEVELOPER',
        variant: 'primary',
        onClick: () => {
          void storePort.getState().resolveConflicts('all-dev');
        },
      },
    ],
  });
}
