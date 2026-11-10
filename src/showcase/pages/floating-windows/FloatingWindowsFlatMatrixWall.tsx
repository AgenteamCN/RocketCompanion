import React, { useState } from 'react';
import { LayoutGrid, Layers } from 'lucide-react';
import { Badge } from '../../../ui-core/primitives/Badge';
import {
  FloatingWindowContent,
  FloatingWindowFooter,
  FloatingWindowHeader,
} from '../../../ui-core/layout/UniversalThreeStageShell';
import { CornerCurvedDragger } from '../../../ui-core/navigation/CornerCurvedDragger';
import { getFloatingWindowIcon } from '../../../ui-core/navigation/FloatingWindowIcon';
import { useMenuLayoutStore } from '../../../ui-core/stores/menuLayoutStore';
import { StoreSnapshotScope } from '../../../ui-core/stores/storeSnapshotScope';
import { DEFAULT_FLOATING_SHELL_TOKENS } from '../../../ui-core/tokens/menuLayoutTokens';
import { AuditTicketHeader } from '../../components/AuditTicketHeader';
import {
  USER_PRESET_WINDOWS,
  type PresetConfig,
  type FloatingWindowVisibilityTier,
} from '../../../ui-core/stores/floatingPresets';
import { DEV_PRESET_WINDOWS } from '../../../ui-core/stores/devFloatingPresets';
import { renderFloatingWindowPanel } from '../../../ui-core/panels/floatingWindowRegistry';
import {
  buildFloatingWindowsLinearPlaylist,
  type FloatingWindowPlaylistUnit,
} from './floatingWindowsLinearPlaylists';

export interface FloatingWindowsFlatMatrixWallProps {
  isLight: boolean;
  tier: FloatingWindowVisibilityTier;
  selectedPreset?: PresetConfig;
}

const RealFloatingShellCard: React.FC<{
  card: FloatingWindowPlaylistUnit;
  isLight: boolean;
  floatingOuterRadius: number;
}> = React.memo(({ card, isLight, floatingOuterRadius }) => {
  const [hoveredDesc, setHoveredDesc] = useState<string | null>(null);
  const { preset, subtab: tabId, tabLabel, storeOverrides } = card;
  const showCornerDragger = preset.resizable !== false;
  const defaultDesc =
    preset.summary ||
    `${preset.title} · Hover controls for details · Drag bottom-right corner arc to resize.`;

  const handleContentMouseOver = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement | null;
    if (!target) return;
    const descEl = target.closest('[data-footer-desc],[title]') as HTMLElement | null;
    if (descEl) {
      const desc = descEl.getAttribute('data-footer-desc') || descEl.getAttribute('title');
      if (desc && desc.trim().length > 0) {
        setHoveredDesc(desc.trim());
      }
    }
  };

  return (
    <div
      data-shell-variant="floating"
      data-alpha-id="Alpha:3StageFloatingShell"
      data-floating-window-id={preset.id}
      style={{
        maxWidth: `${Math.max(480, preset.width)}px`,
        borderRadius: floatingOuterRadius,
      }}
      className={`relative flex flex-col w-full mx-auto border overflow-hidden select-none outline-none shadow-2xl ${
        isLight
          ? 'bg-neutral-50/98 border-neutral-300/90 text-neutral-900'
          : 'bg-neutral-900/98 border-neutral-700/80 text-neutral-100'
      }`}
    >
      {/* STAGE 1: REAL FLOATING WINDOW HEADER */}
      <FloatingWindowHeader
        title={tabLabel ? `${preset.title} · [${tabLabel}]` : preset.title}
        icon={getFloatingWindowIcon(preset.category, preset.id)}
        isLight={isLight}
        onIconHoverChange={(hovered) =>
          setHoveredDesc(
            hovered
              ? `Window Category Icon (${preset.category || 'telemetry'}): ${preset.width}×${preset.height}px (minH ${preset.minHeight}px)`
              : null
          )
        }
        onMinimizeHoverChange={(hovered) =>
          setHoveredDesc(
            hovered
              ? 'Minimize to Stack [-]: Collapse window into top-right Floating Stack Icon.'
              : null
          )
        }
      />

      {/* STAGE 2: REAL FLOATING WINDOW CONTENT BODY */}
      <FloatingWindowContent
        scrollable={false}
        onMouseOver={handleContentMouseOver}
        onMouseLeave={() => setHoveredDesc(null)}
      >
        <StoreSnapshotScope overrides={storeOverrides ?? {}}>
          {renderFloatingWindowPanel(preset.id, {
            isLight,
            activeTab: tabId,
          })}
        </StoreSnapshotScope>
      </FloatingWindowContent>

      {/* STAGE 3: REAL FLOATING WINDOW FOOTER */}
      <FloatingWindowFooter
        defaultDescription={defaultDesc}
        hoveredDescription={hoveredDesc}
        reserveCornerDraggerSpace={showCornerDragger}
        isLight={isLight}
      />

      {/* BOTTOM-RIGHT CONCENTRIC CORNER ARC DRAGGER */}
      {showCornerDragger && (
        <div
          onMouseEnter={() =>
            setHoveredDesc(
              `Corner Resize Dragger (${preset.width}×${preset.height}px · MinW ${preset.minWidth ?? 280}px · MinH ${preset.minHeight}px)`
            )
          }
          onMouseLeave={() => setHoveredDesc(null)}
          className="absolute bottom-0 right-0 flex items-end justify-end select-none z-30 pointer-events-auto"
        >
          <CornerCurvedDragger
            styleVariant="corner-arc"
            outerRadius={floatingOuterRadius}
            concentric={true}
            arcRadius={12}
            inset={4}
            sweepDeg={68}
            strokeWidth={2.4}
            idleOpacity={60}
            colorMode="neutral"
            isLight={isLight}
          />
        </div>
      )}
    </div>
  );
});
RealFloatingShellCard.displayName = 'RealFloatingShellCard';

/**
 * Flat Matrix Audit Wall for 6D Floating Windows.
 * Renders every window and sub-tab inside the real 3-stage `UniversalThreeStageShell`
 * (`FloatingWindowHeader` + `FloatingWindowContent` + `FloatingWindowFooter` + `CornerCurvedDragger`)
 * wrapped in `<StoreSnapshotScope>` so Alpha shell token tweaks propagate to 100% of matrix cards.
 */
export const FloatingWindowsFlatMatrixWall: React.FC<FloatingWindowsFlatMatrixWallProps> =
  React.memo(({ isLight, tier, selectedPreset }) => {
    const [scope, setScope] = useState<'selected' | 'all-tier'>('selected');
    const floatingOuterRadius =
      useMenuLayoutStore((s) => s.floatingOuterRadius) ??
      DEFAULT_FLOATING_SHELL_TOKENS.floatingOuterRadius ??
      16;

    const tierList = tier === 'user' ? USER_PRESET_WINDOWS : DEV_PRESET_WINDOWS;
    const allTierUnits = React.useMemo(
      () => buildFloatingWindowsLinearPlaylist(tier),
      [tier]
    );

    const cards: FloatingWindowPlaylistUnit[] = React.useMemo(() => {
      if (scope === 'selected' && selectedPreset) {
        const filtered = allTierUnits.filter(
          (u) => u.windowId === selectedPreset.id
        );
        if (filtered.length > 0) return filtered;
      }
      return allTierUnits;
    }, [scope, selectedPreset, allTierUnits]);

    return (
      <div className="flex flex-col gap-4 w-full">
        {/* Matrix Wall Scope Control Bar */}
        <div
          className={`p-3.5 rounded-2xl border flex flex-wrap items-center justify-between gap-3 ${
            isLight
              ? 'bg-amber-50/50 border-amber-200/80'
              : 'bg-neutral-900/80 border-amber-500/30'
          }`}
        >
          <div className="flex items-center gap-2 flex-wrap">
            <Badge
              variant={tier === 'user' ? 'success' : 'warning'}
              size="sm"
              isLight={isLight}
            >
              {tier === 'user' ? 'USER TIER' : 'DEVELOPER TIER'}
            </Badge>
            <span className="text-xs font-bold">
              Flat Matrix Audit Wall ({cards.length} Real 3-Stage Floating Shell Cards)
            </span>
            <span
              className={`text-[11px] font-mono ${
                isLight ? 'text-neutral-500' : 'text-neutral-400'
              }`}
            >
              Mounted inside real FloatingWindowHeader + Content + Footer + CornerCurvedDragger &amp; StoreSnapshotScope.
            </span>
          </div>

          <div className="flex items-center gap-1.5 p-1 rounded-xl border bg-white/80 dark:bg-neutral-950 border-neutral-200 dark:border-neutral-800 text-xs">
            <button
              type="button"
              onClick={() => setScope('selected')}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-mono text-[11px] font-bold cursor-pointer transition-colors ${
                scope === 'selected'
                  ? 'bg-amber-500 text-neutral-950'
                  : 'text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200'
              }`}
            >
              <LayoutGrid className="h-3.5 w-3.5" />
              <span>
                Selected Window ({selectedPreset?.tabs?.length || 1} Tabs)
              </span>
            </button>
            <button
              type="button"
              onClick={() => setScope('all-tier')}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-mono text-[11px] font-bold cursor-pointer transition-colors ${
                scope === 'all-tier'
                  ? 'bg-amber-500 text-neutral-950'
                  : 'text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200'
              }`}
            >
              <Layers className="h-3.5 w-3.5" />
              <span>
                All {tier === 'user' ? 'User' : 'Developer'} ({tierList.length} Windows · {allTierUnits.length} Units)
              </span>
            </button>
          </div>
        </div>

        {/* Flat Matrix Grid */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 w-full items-start">
          {cards.map((card, idx) => (
            <div
              key={card.id}
              className={`p-4 rounded-2xl border flex flex-col gap-3 w-full ${
                isLight
                  ? 'bg-neutral-50/70 border-neutral-200/90'
                  : 'bg-neutral-950/60 border-neutral-800'
              }`}
            >
              <AuditTicketHeader
                index={idx + 1}
                label={card.label}
                description={card.breadcrumb || card.preset.summary}
                referenceCode={card.referenceCode}
                componentName={card.componentName}
                sourceFile={card.sourceFile}
                stateId={card.stateId}
                activeProps={card.activeProps}
                badgeColor={card.preset.tier === 'user' ? 'emerald' : 'amber'}
                isLight={isLight}
              />

              <RealFloatingShellCard
                card={card}
                isLight={isLight}
                floatingOuterRadius={floatingOuterRadius}
              />
            </div>
          ))}
        </div>
      </div>
    );
  });

FloatingWindowsFlatMatrixWall.displayName = 'FloatingWindowsFlatMatrixWall';
