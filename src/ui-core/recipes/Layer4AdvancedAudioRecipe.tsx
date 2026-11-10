import React, { useState, useMemo, useEffect } from 'react';
import {
  audioConfig,
  resetAllAudioDetailVolumes,
  previewAudioDetailItem,
  stopAudioDetailPreview,
} from '../config/audioConfig';
import { ADVANCED_AUDIO_DETAIL_CATALOG } from '../config/audioDetailCatalog';
import { Card } from '../layout/Card';
import { PanelContainer, PanelHeader, PanelContent } from '../layout/Panel';
import { PanelFooter } from '../layout/PanelFooter';
import { SettingSliderRow } from '../compounds/SettingSliderRow';
import type { StandardSurfaceProps, SurfaceMeta } from '../manifest/surfaceMetaTypes';
import { resolveCalibratedSurfaceSizing } from '../manifest/surfaceCalibration';
import { useAppStore } from '../stores/appStore';
import { useMenuLayoutStore } from '../stores/menuLayoutStore';
import { useSettingActionRowStore } from '../stores/settingRowStore';
import { useStoreSnapshotOverride } from '../stores/storeSnapshotScope';
import {
  AdvancedAudioDynamicsSection,
  type AdvancedAudioScopeOverride,
} from './layer-sections/AdvancedAudioDynamicsSection';

export type { AdvancedAudioScopeOverride } from './layer-sections/AdvancedAudioDynamicsSection';

export const SURFACE_META: SurfaceMeta = {
  id: 'recipe:Layer4AdvancedAudioRecipe',
  title: 'Advanced Audio Settings',
  subtitle: 'Per-trigger gain calibration (0%–500%), preview audition, and JSON export',
  icon: 'volume-2',
  layer: 'layer4',
  menuGroup: 'menu-layer',
  defaultSizing: {
    mode: 'adaptive',
    width: 560,
    height: 560,
    minHeight: 240,
    maxHeight: 1120,
  },
};

export interface AudioDetailCatalogEntry {
  key: string;
  title: string;
  category: string;
  categoryLabel: string;
  assetHint: string;
  description: string;
}

export interface Layer4AdvancedAudioRecipeProps extends StandardSurfaceProps {
  className?: string;
}

function readDetailVolumesFromConfig(): Record<string, number> {
  const map: Record<string, number> = {};
  for (const item of ADVANCED_AUDIO_DETAIL_CATALOG as readonly AudioDetailCatalogEntry[]) {
    const raw = audioConfig.get(item.key);
    const val = typeof raw === 'number' && Number.isFinite(raw) ? raw : 1.0;
    map[item.key] = Math.max(0, Math.min(500, Math.round(val * 100)));
  }
  return map;
}

export const Layer4AdvancedAudioRecipe: React.FC<Layer4AdvancedAudioRecipeProps> = React.memo(
  ({ isLight = false, onBack, className = '' }) => {
    const goBack = useAppStore((s) => s.goBack);
    const { rowGap } = useSettingActionRowStore();
    const scopeOverride = useStoreSnapshotOverride<AdvancedAudioScopeOverride>('audioConfig');

    const [detailVolumes, setDetailVolumes] = useState<Record<string, number>>(
      readDetailVolumesFromConfig
    );
    const [activeCategory, setActiveCategory] = useState<string>('all');
    const [searchQuery, setSearchQuery] = useState<string>('');
    const [previewingKey, setPreviewingKey] = useState<string | null>(null);
    const [hoveredDesc, setHoveredDesc] = useState<string | null>(null);

    const volumes = scopeOverride?.detailVolumes ?? detailVolumes;
    const storeSizing = useMenuLayoutStore((s) => s.panels['layer4-advanced-audio']);
    const calibratedSizing = resolveCalibratedSurfaceSizing(
      SURFACE_META.id,
      SURFACE_META.defaultSizing
    );
    const sizing = storeSizing ?? {
      mode: calibratedSizing.mode === 'fixed' ? ('fixed' as const) : ('auto' as const),
      width: calibratedSizing.width,
      targetHeight:
        typeof calibratedSizing.height === 'number' ? calibratedSizing.height : 560,
      minHeight: calibratedSizing.minHeight ?? 240,
      maxHeight: calibratedSizing.maxHeight ?? 1120,
    };

    useEffect(() => {
      const sync = () => {
        setDetailVolumes(readDetailVolumesFromConfig());
      };
      const unsub = audioConfig.subscribe(sync);
      return () => {
        unsub();
        if (scopeOverride?.onStopPreview) {
          scopeOverride.onStopPreview();
        } else {
          stopAudioDetailPreview();
        }
      };
    }, [scopeOverride]);

    const catalog = ADVANCED_AUDIO_DETAIL_CATALOG as readonly AudioDetailCatalogEntry[];

    const categoryCounts = useMemo(() => {
      const counts: Record<string, number> = { all: catalog.length };
      for (const item of catalog) {
        counts[item.category] = (counts[item.category] || 0) + 1;
      }
      return counts;
    }, [catalog]);

    const modifiedCount = useMemo(() => {
      let count = 0;
      for (const item of catalog) {
        if ((volumes[item.key] ?? 100) !== 100) count++;
      }
      return count;
    }, [catalog, volumes]);

    const filteredSections = useMemo(() => {
      const q = searchQuery.trim().toLowerCase();
      const groups = new Map<
        string,
        { id: string; label: string; items: AudioDetailCatalogEntry[] }
      >();

      for (const item of catalog) {
        if (activeCategory !== 'all' && item.category !== activeCategory) continue;
        if (
          q &&
          !item.title.toLowerCase().includes(q) &&
          !item.key.toLowerCase().includes(q) &&
          !item.assetHint.toLowerCase().includes(q) &&
          !item.categoryLabel.toLowerCase().includes(q)
        ) {
          continue;
        }
        let grp = groups.get(item.category);
        if (!grp) {
          grp = { id: item.category, label: item.categoryLabel, items: [] };
          groups.set(item.category, grp);
        }
        grp.items.push(item);
      }

      return Array.from(groups.values());
    }, [catalog, activeCategory, searchQuery]);

    const handleVolumeChange = (key: string, nextVal: number) => {
      const clamped = Math.max(0, Math.min(500, Math.round(Number(nextVal) || 0)));
      setDetailVolumes((prev) => ({ ...prev, [key]: clamped }));
      if (scopeOverride?.onDetailVolumeChange) {
        scopeOverride.onDetailVolumeChange(key, clamped);
      } else {
        audioConfig.set(key, clamped / 100);
      }
    };

    const handleResetAll = () => {
      if (scopeOverride?.onResetDetailVolumes) {
        scopeOverride.onResetDetailVolumes();
      } else {
        resetAllAudioDetailVolumes();
      }
      setDetailVolumes(readDetailVolumesFromConfig());
    };

    const handlePreviewClick = (key: string) => {
      setPreviewingKey(key);
      if (scopeOverride?.onPreviewDetail) {
        scopeOverride.onPreviewDetail(key);
      } else {
        previewAudioDetailItem(key);
      }
      window.setTimeout(() => {
        setPreviewingKey((prev) => (prev === key ? null : prev));
      }, 1350);
    };

    return (
      <PanelContainer
        isLight={isLight}
        sizing={sizing}
        className={`w-full select-none ${className}`}
      >
        <PanelHeader
          isLight={isLight}
          title="ADVANCED AUDIO SETTINGS"
          onBack={onBack ?? goBack}
        />

        <PanelContent scrollable={true} className="flex flex-col gap-3">
          <AdvancedAudioDynamicsSection
            isLight={isLight}
            catalogCount={catalog.length}
            modifiedCount={modifiedCount}
            activeCategory={activeCategory}
            onSelectCategory={setActiveCategory}
            categoryCounts={categoryCounts}
            searchQuery={searchQuery}
            onSearchQueryChange={setSearchQuery}
            onResetAll={handleResetAll}
            scopeOverride={scopeOverride}
            onHoverDesc={setHoveredDesc}
          />

          {filteredSections.map((section) => (
            <Card
              key={section.id}
              isLight={isLight}
              variant="outlined"
              className="p-3 flex flex-col gap-1.5"
            >
              <div className="flex items-center justify-between px-1 pb-1 border-b border-neutral-500/15">
                <span
                  className={`text-[11px] font-bold uppercase tracking-wider ${
                    isLight ? 'text-neutral-700' : 'text-neutral-300'
                  }`}
                >
                  {section.label}
                </span>
                <span
                  className={`text-[10px] font-mono ${
                    isLight ? 'text-neutral-500' : 'text-neutral-400'
                  }`}
                >
                  {section.items.length} {section.items.length === 1 ? 'Item' : 'Items'}
                </span>
              </div>

              <div className="flex flex-col" style={{ gap: `${rowGap}px` }}>
                {section.items.map((item) => {
                  const currentVal = volumes[item.key] ?? 100;
                  const isPreviewing = previewingKey === item.key;
                  const isModified = currentVal !== 100;

                  return (
                    <SettingSliderRow
                      key={item.key}
                      title={item.title}
                      badge={
                        <span
                          className={`px-1.5 py-0.5 rounded text-[9px] font-mono border ${
                            isLight
                              ? 'bg-neutral-100 border-neutral-200 text-neutral-500'
                              : 'bg-white/[0.04] border-white/[0.08] text-neutral-400'
                          }`}
                        >
                          {item.assetHint}
                        </span>
                      }
                      min={0}
                      max={500}
                      step={1}
                      value={currentVal}
                      onChange={(val) => handleVolumeChange(item.key, val)}
                      unit="%"
                      layout="inline"
                      developerMode={true}
                      editable={true}
                      bordered={false}
                      showDescription={false}
                      colorScheme={isModified ? 'amber' : 'neutral'}
                      hoverDescription={`${item.title} (${item.key}): ${item.description} [Default: 100%, Range: 0%–500%]`}
                      onHover={(desc) => desc && setHoveredDesc(desc)}
                      onLeave={() => setHoveredDesc(null)}
                      isLight={isLight}
                      actionSlot={
                        <div className="flex items-center gap-1 shrink-0">
                          {isModified && (
                            <button
                              type="button"
                              onClick={() => handleVolumeChange(item.key, 100)}
                              onMouseEnter={() =>
                                setHoveredDesc(`Reset ${item.title} back to 100%.`)
                              }
                              onMouseLeave={() => setHoveredDesc(null)}
                              className={`px-1.5 py-0.5 rounded text-[9px] font-mono border cursor-pointer transition-colors ${
                                isLight
                                  ? 'bg-neutral-100 hover:bg-neutral-200 border-neutral-300 text-neutral-600'
                                  : 'bg-white/[0.05] hover:bg-white/[0.10] border-white/[0.10] text-neutral-400'
                              }`}
                            >
                              100%
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handlePreviewClick(item.key)}
                            onMouseEnter={() =>
                              setHoveredDesc(
                                `Preview "${item.title}" at ${currentVal}% gain (${item.assetHint}).`
                              )
                            }
                            onMouseLeave={() => setHoveredDesc(null)}
                            className={`px-2 py-0.5 rounded text-[10px] font-semibold tracking-wide border cursor-pointer transition-colors ${
                              isPreviewing
                                ? 'bg-amber-500/25 border-amber-500/50 text-amber-400'
                                : isLight
                                ? 'bg-neutral-100 hover:bg-neutral-200 border-neutral-300 text-neutral-700'
                                : 'bg-white/[0.06] hover:bg-white/[0.12] border-white/[0.12] text-neutral-200'
                            }`}
                          >
                            {isPreviewing ? 'Playing' : 'Preview'}
                          </button>
                        </div>
                      }
                    />
                  );
                })}
              </div>
            </Card>
          ))}
        </PanelContent>

        <PanelFooter
          isLight={isLight}
          defaultDescription="Calibrate individual audio triggers (0%–500%, default 100%), audition via Preview, press Enter to commit numeric input, and Copy/Export JSON."
          hoveredDescription={hoveredDesc}
        />
      </PanelContainer>
    );
  }
);

Layer4AdvancedAudioRecipe.displayName = 'Layer4AdvancedAudioRecipe';
export default Layer4AdvancedAudioRecipe;
