import React, { useState } from 'react';
import {
  Bot,
  Paintbrush,
  Sparkles,
  Volume2,
  Music,
  Check,
  Shuffle,
  RotateCcw,
  Copy,
} from 'lucide-react';
import type {
  StandardSurfaceProps,
  SurfaceMeta,
} from '../../manifest/surfaceMetaTypes';
import { Badge } from '../../primitives/Badge';
import { useBotsLoadoutStore } from '../../stores/botsLoadoutStore';
import { PAINT_FINISH_CATALOG, BOOST_VISUAL_CATALOG, BOOST_AUDIO_CATALOG, ALL_BOT_ANTHEM_CATEGORIES, type BotPaintFinishOption, type BotBoostVisualOption, type BotBoostAudioOption, type BotAnthemCategoryOption } from '../../config/botsLoadoutConfig';
import { BotsCarModelPoolSection } from './bots-loadout-tuner/BotsCarModelPoolSection';

export const SURFACE_META: SurfaceMeta = {
  id: 'bots-loadout-tuner',
  title: 'Bots Loadout Tuner',
  subtitle: 'Multi-Select Randomizable Bot Loadout Pool (Car Models, Paint, Boost & Anthem)',
  description:
    'Multi-select randomizable Bot Loadout pool (8 GLB models across 6 hitboxes default, Metallic paint, Cartoon boost, Standard boost audio, Random TrainStation anthem).',
  icon: 'Bot',
  layer: 'floating-dev',
  menuGroup: 'active-tuners',
  defaultSizing: {
    width: 480,
    height: 580,
    minHeight: 220,
    mode: 'adaptive',
  },
};

export interface BotsLoadoutTunerFloatingWindowProps
  extends StandardSurfaceProps {
  active?: boolean;
}

export const BotsLoadoutTunerFloatingWindow: React.FC<
  BotsLoadoutTunerFloatingWindowProps
> = ({ isLight = false, active = true }) => {
  const visualIds = useBotsLoadoutStore((s) => s.visualIds);
  const paintFinishes = useBotsLoadoutStore((s) => s.paintFinishes);
  const boostVisuals = useBotsLoadoutStore((s) => s.boostVisuals);
  const boostAudios = useBotsLoadoutStore((s) => s.boostAudios);
  const anthemCategories = useBotsLoadoutStore((s) => s.anthemCategories);
  const lastSampleRoll = useBotsLoadoutStore((s) => s.lastSampleRoll);

  const togglePaintFinish = useBotsLoadoutStore((s) => s.togglePaintFinish);
  const toggleBoostVisual = useBotsLoadoutStore((s) => s.toggleBoostVisual);
  const toggleBoostAudio = useBotsLoadoutStore((s) => s.toggleBoostAudio);
  const toggleAnthemCategory = useBotsLoadoutStore((s) => s.toggleAnthemCategory);
  const setAllAnthemCategories = useBotsLoadoutStore(
    (s) => s.setAllAnthemCategories
  );
  const resetDefaults = useBotsLoadoutStore((s) => s.resetDefaults);
  const rollSampleLoadout = useBotsLoadoutStore((s) => s.rollSampleLoadout);

  const [copied, setCopied] = useState(false);

  if (!active) return null;

  const handleCopyJson = () => {
    const payload = {
      visualIds,
      paintFinishes,
      boostVisuals,
      boostAudios,
      anthemCategories,
    };
    const json = JSON.stringify(payload, null, 2);
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(json).catch(() => {});
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const renderMultiSelectChip = <T extends string>(
    id: T,
    label: string,
    selectedList: readonly T[],
    onToggle: (id: T) => void,
    badgeText?: string
  ) => {
    const isChecked = selectedList.includes(id);
    const isDeterministic = isChecked && selectedList.length === 1;
    return (
      <button
        key={id}
        type="button"
        onClick={() => onToggle(id)}
        title={
          isDeterministic
            ? `${label} (1 of 1 selected — deterministic)`
            : `Toggle "${label}" in random pool`
        }
        className={`flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg border text-left transition-all cursor-pointer ${
          isChecked
            ? isLight
              ? 'bg-amber-50 border-amber-500 ring-1 ring-amber-500/40 text-neutral-900 font-semibold'
              : 'bg-amber-500/15 border-amber-500/80 ring-1 ring-amber-500/30 text-white font-semibold'
            : isLight
            ? 'bg-white hover:bg-neutral-50 border-neutral-200 text-neutral-600'
            : 'bg-neutral-900/80 hover:bg-neutral-800 border-neutral-800 text-neutral-400'
        }`}
      >
        <div className="flex items-center gap-1.5 min-w-0">
          <span
            className={`w-3.5 h-3.5 rounded flex items-center justify-center border shrink-0 ${
              isChecked
                ? 'bg-amber-500 border-amber-400 text-neutral-950'
                : isLight
                ? 'border-neutral-300 bg-neutral-100'
                : 'border-neutral-700 bg-neutral-950'
            }`}
          >
            {isChecked && <Check className="w-2.5 h-2.5 stroke-[3]" />}
          </span>
          <span className="text-[11px] truncate">{label}</span>
        </div>
        {badgeText && (
          <Badge
            size="sm"
            variant={isChecked ? 'amber' : 'neutral'}
            isLight={isLight}
          >
            {badgeText}
          </Badge>
        )}
      </button>
    );
  };

  return (
    <div
      data-ui-interactive="true"
      className="flex flex-col gap-3 text-xs select-none"
    >
      {/* Header Banner */}
      <div
        className={`flex items-center justify-between gap-2 px-2.5 py-2 rounded-xl border ${
          isLight
            ? 'bg-neutral-100/90 border-neutral-200 text-neutral-700'
            : 'bg-neutral-900/80 border-neutral-800 text-neutral-300'
        }`}
      >
        <div className="flex items-center gap-2 min-w-0">
          <Bot className="w-4 h-4 text-amber-400 shrink-0" />
          <div className="flex flex-col leading-snug truncate">
            <span className="font-semibold text-[11px] truncate">
              Bots Loadout Multi-Select Randomizer Pool
            </span>
            <span className="text-[10px] text-neutral-400 truncate">
              Each attribute rolls independently per bot on Exhibition start or Auto-Fill
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={() => rollSampleLoadout()}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-semibold border transition-colors cursor-pointer shrink-0 bg-amber-500/15 border-amber-500/40 text-amber-300 hover:bg-amber-500/25"
        >
          <Shuffle className="w-3 h-3" />
          <span>Test Roll</span>
        </button>
      </div>

      {/* 1. Car Models (8 Total, 3 GLB Checked by Default) */}
      <BotsCarModelPoolSection isLight={isLight} />

      {/* 2. Paint Finish & 3. Boost Trail Effect */}
      <div className="grid grid-cols-2 gap-2.5">
        <div
          className={`flex flex-col gap-2 p-2.5 rounded-xl border ${
            isLight
              ? 'bg-neutral-100/70 border-neutral-200'
              : 'bg-neutral-900/60 border-neutral-800'
          }`}
        >
          <div className="flex items-center justify-between gap-1">
            <div className="flex items-center gap-1.5">
              <Paintbrush className="w-3.5 h-3.5 text-amber-400" />
              <span className="font-semibold text-[11px]">2. Paint Finish</span>
            </div>
            <span className="text-[10px] font-mono opacity-60">
              {paintFinishes.length === 1 ? 'Deterministic' : 'Random'}
            </span>
          </div>
          <div className="grid grid-cols-1 gap-1.5">
            {PAINT_FINISH_CATALOG.map((item: { id: string; name: string }) =>
              renderMultiSelectChip(
                item.id as BotPaintFinishOption,
                item.name,
                paintFinishes,
                togglePaintFinish,
                item.id === 'metallic' ? 'Default' : undefined
              )
            )}
          </div>
        </div>

        <div
          className={`flex flex-col gap-2 p-2.5 rounded-xl border ${
            isLight
              ? 'bg-neutral-100/70 border-neutral-200'
              : 'bg-neutral-900/60 border-neutral-800'
          }`}
        >
          <div className="flex items-center justify-between gap-1">
            <div className="flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span className="font-semibold text-[11px]">
                3. Boost Trail FX
              </span>
            </div>
            <span className="text-[10px] font-mono opacity-60">
              {boostVisuals.length === 1 ? 'Deterministic' : 'Random'}
            </span>
          </div>
          <div className="grid grid-cols-1 gap-1.5">
            {BOOST_VISUAL_CATALOG.map((item: { id: string; name: string }) =>
              renderMultiSelectChip(
                item.id as BotBoostVisualOption,
                item.name,
                boostVisuals,
                toggleBoostVisual,
                item.id === 'cartoon' ? 'Default' : undefined
              )
            )}
          </div>
        </div>
      </div>

      {/* 4. Boost Audio Effect */}
      <div
        className={`flex flex-col gap-2 p-2.5 rounded-xl border ${
          isLight
            ? 'bg-neutral-100/70 border-neutral-200'
            : 'bg-neutral-900/60 border-neutral-800'
        }`}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <Volume2 className="w-3.5 h-3.5 text-emerald-400" />
            <span className="font-semibold text-[11px]">
              4. Boost Audio Effect ({boostAudios.length} /{' '}
              {BOOST_AUDIO_CATALOG.length} Selected)
            </span>
          </div>
          <span className="text-[10px] font-mono opacity-60">
            {boostAudios.length === 1 ? 'Deterministic' : 'Random'}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          {BOOST_AUDIO_CATALOG.map((item: { id: string; name: string }) =>
            renderMultiSelectChip(
              item.id as BotBoostAudioOption,
              item.name,
              boostAudios,
              toggleBoostAudio,
              item.id === 'standard' ? 'Default' : undefined
            )
          )}
        </div>
      </div>

      {/* 5. Anthem Stinger Pool */}
      <div
        className={`flex flex-col gap-2 p-2.5 rounded-xl border ${
          isLight
            ? 'bg-neutral-100/70 border-neutral-200'
            : 'bg-neutral-900/60 border-neutral-800'
        }`}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <Music className="w-3.5 h-3.5 text-purple-400" />
            <span className="font-semibold text-[11px]">
              5. Bot Goal Anthem Pool (Default: Random TrainStation)
            </span>
          </div>
          <button
            type="button"
            onClick={() => setAllAnthemCategories()}
            className={`px-2 py-0.5 rounded text-[10px] font-mono border cursor-pointer transition-colors ${
              isLight
                ? 'bg-white hover:bg-neutral-100 border-neutral-300 text-neutral-700'
                : 'bg-neutral-800 hover:bg-neutral-700 border-neutral-700 text-neutral-300'
            }`}
          >
            All Stadiums
          </button>
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          {ALL_BOT_ANTHEM_CATEGORIES.map((cat) =>
            renderMultiSelectChip(
              cat.id as BotAnthemCategoryOption,
              cat.label,
              anthemCategories,
              toggleAnthemCategory,
              cat.id === 'TrainStation'
                ? `Default (${cat.count})`
                : cat.count > 0
                ? `${cat.count}`
                : undefined
            )
          )}
        </div>
      </div>

      {/* Sample Roll Readout (if rolled) */}
      {lastSampleRoll && (
        <div
          className={`px-2.5 py-2 rounded-lg border font-mono text-[10px] flex flex-wrap items-center justify-between gap-2 ${
            isLight
              ? 'bg-amber-50/70 border-amber-300 text-neutral-800'
              : 'bg-amber-500/10 border-amber-500/30 text-amber-200'
          }`}
        >
          <span>
            SAMPLE: <b>{lastSampleRoll.visualId}</b> ({lastSampleRoll.hitboxId}) ·{' '}
            <b>{lastSampleRoll.paintFinish}</b> · trail=
            <b>{lastSampleRoll.boostVisual}</b> · audio=
            <b>{lastSampleRoll.boostAudio}</b> · anthem=
            <b>{lastSampleRoll.anthemId}</b>
          </span>
        </div>
      )}

      {/* Footer Actions */}
      <div className="flex items-center justify-between gap-2 pt-1">
        <button
          type="button"
          onClick={handleCopyJson}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold border transition-colors cursor-pointer ${
            isLight
              ? 'bg-white hover:bg-neutral-100 border-neutral-300 text-neutral-800'
              : 'bg-neutral-800 hover:bg-neutral-700 border-neutral-700 text-neutral-200'
          }`}
        >
          {copied ? (
            <>
              <Check className="w-3.5 h-3.5 text-emerald-400" />
              <span>Copied JSON</span>
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5" />
              <span>Copy JSON</span>
            </>
          )}
        </button>

        <button
          type="button"
          onClick={() => resetDefaults()}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold border transition-colors cursor-pointer ${
            isLight
              ? 'bg-rose-50 hover:bg-rose-100 border-rose-300 text-rose-700'
              : 'bg-rose-500/15 hover:bg-rose-500/25 border-rose-500/35 text-rose-300'
          }`}
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>Reset Defaults</span>
        </button>
      </div>
    </div>
  );
};
