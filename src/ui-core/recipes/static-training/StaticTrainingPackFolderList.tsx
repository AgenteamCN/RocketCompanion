import React, { useMemo, useState } from 'react';
import { ArrowUpDown, Download, FolderOpen, Search } from 'lucide-react';
import {
  type StaticPackDownCounterOption,
  type StaticPackSortOrder,
  type StaticTrainingPackSummary,
  type TopCategoryFilter,
  PSYONIX_YEARS,
  RANK_SUBFOLDERS,
  filterAndSortTrainingPacks,
  computePackCategoryCounts,
  computePsyonixYearCounts,
  computePsyonixMonthsForYear,
  computeRankSubfolderCounts,
} from './staticTrainingPackFilterLogic';
import { StaticTrainingPackFolderGroupItem } from './StaticTrainingPackFolderGroupItem';

export type {
  StaticPackDownCounterOption,
  StaticPackSortOrder,
  StaticTrainingPackSummary,
} from './staticTrainingPackFilterLogic';

export interface StaticTrainingPackFolderListProps {
  isLight: boolean;
  isDevMode?: boolean;
  applyNewKevpertBind?: boolean;
  packs: StaticTrainingPackSummary[];
  selectedUuid?: string | null;
  onSelectPack: (uuid: string) => void;
  onHoverDesc: (desc: string | null) => void;
  onBatchExportFiltered?: (
    packs: StaticTrainingPackSummary[],
    folderLabel: string,
    editable: boolean,
    formatOverride?: 'RCSPack' | 'RCSPackE' | 'RLRCSPack'
  ) => void;
}

const SORT_LABELS: Record<StaticPackSortOrder, string> = {
  updated: 'Recent',
  rank: 'Rank',
  date: 'Date',
  title: 'A–Z',
};

const SORT_CYCLE: StaticPackSortOrder[] = ['updated', 'rank', 'date', 'title'];

export const StaticTrainingPackFolderList: React.FC<StaticTrainingPackFolderListProps> = React.memo(
  ({
    isLight,
    isDevMode = false,
    applyNewKevpertBind = false,
    packs,
    selectedUuid,
    onSelectPack,
    onHoverDesc,
    onBatchExportFiltered,
  }) => {
    const [topCategory, setTopCategory] = useState<TopCategoryFilter>('All');
    const [selectedPsyonixYear, setSelectedPsyonixYear] = useState<string>('ALL');
    const [selectedPsyonixYearMonth, setSelectedPsyonixYearMonth] = useState<string>('ALL');
    const [selectedRank, setSelectedRank] = useState<string>('ALL');
    const [sortOrder, setSortOrder] = useState<StaticPackSortOrder>('updated');
    const [searchQuery, setSearchQuery] = useState<string>('');

    const categoryCounts = useMemo(() => computePackCategoryCounts(packs), [packs]);
    const psyonixYearCounts = useMemo(() => computePsyonixYearCounts(packs), [packs]);
    const psyonixMonthsForSelectedYear = useMemo(
      () => computePsyonixMonthsForYear(packs, selectedPsyonixYear),
      [packs, selectedPsyonixYear]
    );
    const rankCounts = useMemo(() => computeRankSubfolderCounts(packs), [packs]);

    const filteredAndSortedPacks = useMemo(
      () =>
        filterAndSortTrainingPacks({
          packs,
          topCategory,
          selectedPsyonixYear,
          selectedPsyonixYearMonth,
          selectedRank,
          searchQuery,
          sortOrder,
        }),
      [
        packs,
        topCategory,
        selectedPsyonixYear,
        selectedPsyonixYearMonth,
        selectedRank,
        searchQuery,
        sortOrder,
      ]
    );

    const handleSelectTopCategory = (cat: TopCategoryFilter) => {
      setTopCategory(cat);
      if (cat !== 'Psyonix') {
        setSelectedPsyonixYear('ALL');
        setSelectedPsyonixYearMonth('ALL');
      }
      if (cat !== 'Rank') {
        setSelectedRank('ALL');
      }
    };

    const handleSelectPsyonixYear = (yr: string) => {
      setSelectedPsyonixYear(yr);
      setSelectedPsyonixYearMonth('ALL');
    };

    const cycleSortOrder = () => {
      setSortOrder(SORT_CYCLE[(SORT_CYCLE.indexOf(sortOrder) + 1) % SORT_CYCLE.length]);
    };

    const sortLabel = SORT_LABELS[sortOrder];

    const activeFilterSummaryLabel = useMemo(() => {
      if (topCategory === 'Psyonix') {
        if (selectedPsyonixYearMonth !== 'ALL') return `Psyonix-${selectedPsyonixYearMonth}`;
        if (selectedPsyonixYear !== 'ALL') return `Psyonix-${selectedPsyonixYear}`;
        return 'Psyonix';
      }
      if (topCategory === 'Rank') {
        return selectedRank === 'ALL' ? 'Rank' : `Rank-${selectedRank}`;
      }
      return topCategory;
    }, [topCategory, selectedPsyonixYear, selectedPsyonixYearMonth, selectedRank]);

    const topCategoriesToShow: TopCategoryFilter[] = useMemo(() => {
      if (isDevMode) {
        const base: TopCategoryFilter[] = ['All', 'Kevpert', 'Psyonix', 'Rank', 'Others'];
        if (categoryCounts.Native > 0) base.push('Native');
        return base;
      }
      return (['All', 'Native', 'Others', 'Kevpert', 'Psyonix', 'Rank'] as const).filter(
        (cat) => cat === 'All' || categoryCounts[cat] > 0
      );
    }, [isDevMode, categoryCounts]);

    const getPillClasses = (active: boolean) =>
      `px-2 py-0.5 rounded-full text-[9px] font-bold whitespace-nowrap transition-all cursor-pointer shrink-0 border ${
        active
          ? isLight
            ? 'bg-neutral-900 border-neutral-900 text-white'
            : 'bg-cyan-400 border-cyan-300 text-neutral-950'
          : isLight
            ? 'bg-neutral-100 hover:bg-neutral-200 border-neutral-300 text-neutral-700'
            : 'bg-neutral-800/90 hover:bg-neutral-700 border-neutral-700 text-neutral-300'
      }`;

    const exportBtnBase =
      'flex items-center gap-0.5 px-1.5 py-0.5 rounded border text-[9px] font-mono cursor-pointer';
    const exportFolderLabel =
      activeFilterSummaryLabel === 'All' ? 'AllPacks' : activeFilterSummaryLabel;

    const exportOptions: {
      label: string;
      editable: boolean;
      format: 'RCSPack' | 'RCSPackE' | 'RLRCSPack';
      desc: string;
      style: string;
      devOnly?: boolean;
    }[] = [
      {
        label: '.ZIP',
        editable: false,
        format: 'RCSPack',
        desc: `Batch export all ${filteredAndSortedPacks.length} packs in "${activeFilterSummaryLabel}" as read-only .RCSPack inside a .zip archive.`,
        style: isLight
          ? 'bg-white hover:bg-neutral-100 border-neutral-300 text-neutral-700'
          : 'bg-neutral-800 hover:bg-neutral-700 border-neutral-700 text-neutral-200',
      },
      {
        label: '.ZIP(E)',
        editable: true,
        format: 'RCSPackE',
        desc: `Batch export all ${filteredAndSortedPacks.length} packs in "${activeFilterSummaryLabel}" as editable .RCSPackE inside a .zip archive.`,
        style: isLight
          ? 'bg-cyan-50 hover:bg-cyan-100 border-cyan-300 text-cyan-800'
          : 'bg-cyan-950/50 hover:bg-cyan-900/60 border-cyan-500/40 text-cyan-300',
      },
      {
        label: '.ZIP(RL)',
        editable: true,
        format: 'RLRCSPack',
        desc: `Batch export all ${filteredAndSortedPacks.length} packs in "${activeFilterSummaryLabel}" as developer .RLRCSPack (with originalDescription) inside a .zip archive.`,
        style: isLight
          ? 'bg-purple-50 hover:bg-purple-100 border-purple-300 text-purple-800'
          : 'bg-purple-950/50 hover:bg-purple-900/60 border-purple-500/40 text-purple-300',
        devOnly: true,
      },
    ];

    return (
      <div
        className={`col-span-5 flex flex-col rounded-xl border overflow-hidden min-h-0 ${
          isLight
            ? 'bg-neutral-50/70 border-neutral-200/90'
            : 'bg-neutral-900/50 border-neutral-800'
        }`}
      >
        {/* Header Bar with Sort & Batch Export */}
        <div
          className={`px-2.5 py-1.5 border-b flex items-center justify-between gap-1 text-[10px] font-bold tracking-wider uppercase shrink-0 ${
            isLight
              ? 'border-neutral-200 text-neutral-600 bg-neutral-100/60'
              : 'border-neutral-800 text-neutral-300 bg-neutral-900/80'
          }`}
        >
          <div className="flex items-center gap-1.5 truncate">
            <FolderOpen className="h-3.5 w-3.5 opacity-70 shrink-0" />
            <span className="truncate">
              {activeFilterSummaryLabel} ({filteredAndSortedPacks.length}/{packs.length})
            </span>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={cycleSortOrder}
              onMouseEnter={() =>
                onHoverDesc(
                  `Current sort: ${sortLabel}. Click to cycle Order by Recent / Rank / Date / Title.`
                )
              }
              onMouseLeave={() => onHoverDesc(null)}
              className={`flex items-center gap-1 px-1.5 py-0.5 rounded border text-[9px] font-mono cursor-pointer ${
                isLight
                  ? 'bg-white hover:bg-neutral-100 border-neutral-300 text-neutral-700'
                  : 'bg-neutral-800 hover:bg-neutral-700 border-neutral-700 text-neutral-200'
              }`}
            >
              <ArrowUpDown className="h-2.5 w-2.5" />
              <span>{sortLabel}</span>
            </button>

            {onBatchExportFiltered &&
              filteredAndSortedPacks.length > 0 &&
              exportOptions
                .filter((opt) => !opt.devOnly || isDevMode)
                .map((opt) => (
                  <button
                    key={opt.format}
                    type="button"
                    onClick={() =>
                      onBatchExportFiltered(
                        filteredAndSortedPacks,
                        exportFolderLabel,
                        opt.editable,
                        opt.format
                      )
                    }
                    onMouseEnter={() => onHoverDesc(opt.desc)}
                    onMouseLeave={() => onHoverDesc(null)}
                    className={`${exportBtnBase} ${opt.style}`}
                  >
                    <Download className="h-2.5 w-2.5" />
                    <span>{opt.label}</span>
                  </button>
                ))}
          </div>
        </div>

        {/* Hierarchical Folder Tag Pills & Quick Search */}
        <div
          className={`px-2 py-1.5 border-b flex flex-col gap-1.5 shrink-0 ${
            isLight ? 'border-neutral-200/80 bg-white/50' : 'border-neutral-800/80 bg-neutral-900/40'
          }`}
        >
          {/* Row 1: Primary Category Pills */}
          <div className="flex items-center gap-1 overflow-x-auto pb-0.5 no-scrollbar">
            {topCategoriesToShow.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => handleSelectTopCategory(cat)}
                className={getPillClasses(topCategory === cat)}
              >
                {cat} <span className="opacity-65">({categoryCounts[cat]})</span>
              </button>
            ))}
          </div>

          {/* Row 2A: Psyonix Year & Month Sub-Rows */}
          {topCategory === 'Psyonix' && (
            <div className="flex flex-col gap-1 pt-0.5">
              <div className="flex items-center gap-1 overflow-x-auto pb-0.5 no-scrollbar">
                <button
                  type="button"
                  onClick={() => handleSelectPsyonixYear('ALL')}
                  className={getPillClasses(selectedPsyonixYear === 'ALL')}
                >
                  All Years
                </button>
                {PSYONIX_YEARS.map((yr) => {
                  const cnt = psyonixYearCounts.get(yr) || 0;
                  if (cnt === 0) return null;
                  return (
                    <button
                      key={yr}
                      type="button"
                      onClick={() => handleSelectPsyonixYear(yr)}
                      className={getPillClasses(selectedPsyonixYear === yr)}
                    >
                      {yr} <span className="opacity-65">({cnt})</span>
                    </button>
                  );
                })}
              </div>

              {selectedPsyonixYear !== 'ALL' && psyonixMonthsForSelectedYear.length > 0 && (
                <div className="flex items-center gap-1 overflow-x-auto pb-0.5 no-scrollbar">
                  <button
                    type="button"
                    onClick={() => setSelectedPsyonixYearMonth('ALL')}
                    className={getPillClasses(selectedPsyonixYearMonth === 'ALL')}
                  >
                    All {selectedPsyonixYear}
                  </button>
                  {psyonixMonthsForSelectedYear.map((m) => (
                    <button
                      key={m.ymTag}
                      type="button"
                      onClick={() => setSelectedPsyonixYearMonth(m.ymTag)}
                      className={getPillClasses(selectedPsyonixYearMonth === m.ymTag)}
                    >
                      {m.shortLabel} <span className="opacity-65">({m.count})</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Row 2B: Rank Tier Sub-Row */}
          {topCategory === 'Rank' && (
            <div className="flex items-center gap-1 overflow-x-auto pb-0.5 no-scrollbar">
              <button
                type="button"
                onClick={() => setSelectedRank('ALL')}
                className={getPillClasses(selectedRank === 'ALL')}
              >
                All Ranks
              </button>
              {RANK_SUBFOLDERS.map((rank) => {
                const cnt = rankCounts.get(rank) || 0;
                if (cnt === 0) return null;
                return (
                  <button
                    key={rank}
                    type="button"
                    onClick={() => setSelectedRank(rank)}
                    className={getPillClasses(selectedRank === rank)}
                  >
                    {rank} <span className="opacity-65">({cnt})</span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Search Input */}
          <div
            className={`flex items-center gap-1.5 px-2 py-1 rounded-md border text-[10px] ${
              isLight
                ? 'bg-white border-neutral-300 text-neutral-800'
                : 'bg-neutral-950/60 border-neutral-800 text-neutral-200'
            }`}
          >
            <Search className="h-3 w-3 opacity-50 shrink-0" />
            <input
              type="text"
              placeholder="Filter by title, code, creator, or tag..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-transparent outline-none text-[10px]"
            />
          </div>
        </div>

        {/* Pack Items List */}
        <StaticTrainingPackFolderGroupItem
          isLight={isLight}
          applyNewKevpertBind={applyNewKevpertBind}
          packs={filteredAndSortedPacks}
          selectedUuid={selectedUuid}
          onSelectPack={onSelectPack}
          onHoverDesc={onHoverDesc}
        />
      </div>
    );
  }
);
StaticTrainingPackFolderList.displayName = 'StaticTrainingPackFolderList';
