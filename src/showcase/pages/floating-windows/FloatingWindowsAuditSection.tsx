import React from 'react';
import type {
  PresetConfig,
  FloatingWindowVisibilityTier,
} from '../../../ui-core/stores/floatingPresets';
import { AuditTicketHeader } from '../../components/AuditTicketHeader';
import type { FloatingWindowPlaylistUnit } from './floatingWindowsLinearPlaylists';

export interface FloatingWindowsAuditSectionProps {
  isLight: boolean;
  tier: FloatingWindowVisibilityTier;
  fwMode: 'inspector' | 'matrix' | 'stack';
  currentIndex: number;
  currentPreset: PresetConfig | undefined;
  activeSubTab: string;
  playlistIndex?: number;
  activePlaylistUnit?: FloatingWindowPlaylistUnit;
}

export const FloatingWindowsAuditSection: React.FC<FloatingWindowsAuditSectionProps> = ({
  isLight,
  tier,
  fwMode,
  currentIndex,
  currentPreset,
  activeSubTab,
  playlistIndex,
  activePlaylistUnit,
}) => {
  if (fwMode === 'matrix' || !currentPreset) return null;

  const fallbackTab =
    currentPreset.tabs && currentPreset.tabs.length > 0
      ? currentPreset.tabs.find((t) => t.id === activeSubTab) || currentPreset.tabs[0]
      : undefined;
  const fallbackTabIdx =
    fallbackTab && currentPreset.tabs
      ? currentPreset.tabs.findIndex((t) => t.id === fallbackTab.id)
      : -1;
  const baseCode = `6D.${tier === 'user' ? 'U' : 'D'}${currentIndex + 1}`;
  const resolvedRefCode =
    activePlaylistUnit?.referenceCode ||
    (fallbackTabIdx >= 0 ? `${baseCode}.${fallbackTabIdx + 1}` : baseCode);
  const resolvedLabel =
    activePlaylistUnit?.label ||
    (fallbackTab
      ? `${currentPreset.title} · [${fallbackTab.label}]`
      : currentPreset.title);
  const resolvedStateId =
    activePlaylistUnit?.stateId ||
    (fallbackTab
      ? `${currentPreset.id}:${fallbackTab.id}`
      : `${currentPreset.id}:default`);

  return (
    <div
      className={`px-3.5 py-2.5 rounded-xl border ${
        isLight
          ? 'bg-white border-neutral-200 shadow-2xs'
          : 'bg-neutral-900/80 border-neutral-800'
      }`}
    >
      <AuditTicketHeader
        index={(playlistIndex ?? currentIndex) + 1}
        label={resolvedLabel}
        description={activePlaylistUnit?.breadcrumb || currentPreset.summary}
        referenceCode={resolvedRefCode}
        componentName={
          activePlaylistUnit?.componentName ||
          currentPreset.component ||
          currentPreset.id
        }
        sourceFile={
          activePlaylistUnit?.sourceFile ||
          currentPreset.sourcePath ||
          `src/ui-core/panels/${tier === 'user' ? 'user' : 'dev'}/${
            currentPreset.component || currentPreset.id
          }.tsx`
        }
        stateId={resolvedStateId}
        activeProps={
          activePlaylistUnit?.activeProps || {
            windowId: currentPreset.id,
            tier,
            ...(fallbackTab ? { activeTab: fallbackTab.id } : {}),
          }
        }
        badgeColor={tier === 'user' ? 'emerald' : 'amber'}
        tunerStatus="direct-store"
        isLight={isLight}
      />
    </div>
  );
};
