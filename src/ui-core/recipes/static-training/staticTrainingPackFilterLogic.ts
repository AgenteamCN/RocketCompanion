import { RANK_ORDER_MAP } from '../../config/temMetadataAndTagClassifier';
import type { StaticTrainingVariationConfig } from '../../config/staticTrainingVariationTypes';

export type StaticPackDownCounterOption = 1 | 2 | 3;

export type StaticPackSortOrder = 'updated' | 'rank' | 'date' | 'title';

export type TopCategoryFilter = 'All' | 'Kevpert' | 'Psyonix' | 'Rank' | 'Others' | 'Native';

export interface StaticTrainingPackSummary {
  uuid: string;
  id?: string;
  title: string;
  name?: string;
  description: string;
  originalDescription?: string;
  itemCount: number;
  shotCount?: number;
  createdAt?: number;
  updatedAt?: number | string;
  tags?: string[];
  code?: string;
  creator?: string;
  creatorName?: string;
  releaseYearMonth?: string;
  rankTier?: string;
  sourcePackType?: 'RCSPack' | 'RCSPackE' | 'RLRCSPack';
  recommendedVariation?: StaticTrainingVariationConfig;
  isBuiltIn?: boolean;
  isBuiltInDevPack?: boolean;
}

export const PSYONIX_YEARS = ['2024', '2023', '2022'] as const;

export const PSYONIX_MONTH_DEFINITIONS: ReadonlyArray<{
  mm: string;
  shortLabel: string;
}> = [
  { mm: '01', shortLabel: 'Jan' },
  { mm: '02', shortLabel: 'Feb' },
  { mm: '03', shortLabel: 'Mar' },
  { mm: '04', shortLabel: 'Apr' },
  { mm: '05', shortLabel: 'May' },
  { mm: '06', shortLabel: 'June' },
  { mm: '07', shortLabel: 'July' },
  { mm: '08', shortLabel: 'Aug' },
  { mm: '09', shortLabel: 'Sept' },
  { mm: '10', shortLabel: 'Oct' },
  { mm: '11', shortLabel: 'Nov' },
  { mm: '12', shortLabel: 'Dec' },
];

export const RANK_SUBFOLDERS = [
  'Progression',
  'SSL',
  'GC',
  'Champion',
  'Diamond',
  'Platinum',
  'Gold',
  'Silver',
  'Bronze',
] as const;

export function hasTagCaseInsensitive(tags: string[] | undefined, target: string): boolean {
  if (!tags || tags.length === 0) return false;
  const lower = target.toLowerCase();
  return tags.some((t) => t.toLowerCase() === lower);
}

export function getEffectiveCreator(pack: StaticTrainingPackSummary): string {
  return (pack.creator || pack.creatorName || '').trim();
}

export function isKevpertPack(pack: StaticTrainingPackSummary): boolean {
  if (pack.tags && pack.tags.length > 0) {
    return hasTagCaseInsensitive(pack.tags, 'Kevpert');
  }
  const creator = getEffectiveCreator(pack);
  return (
    /kevpert|hampert|samuraipert/i.test(creator) ||
    /^kevpert\b/i.test(pack.title)
  );
}

export function isPsyonixPack(pack: StaticTrainingPackSummary): boolean {
  if (pack.tags && pack.tags.length > 0) {
    return hasTagCaseInsensitive(pack.tags, 'Psyonix');
  }
  const creator = getEffectiveCreator(pack);
  return (
    /psyonix/i.test(creator) ||
    /^psyonix\b/i.test(pack.title) ||
    /^(progression|ssl|gc|champion|diamond|platinum|gold|silver|bronze)\s+(pack|goals)\s+/i.test(
      pack.title.trim()
    )
  );
}

/**
 * Native packs are strictly `.RCSPack` or `.RCSPackE` packs (never `.RLRCSPack`).
 */
export function isNativePack(pack: StaticTrainingPackSummary): boolean {
  if (pack.sourcePackType === 'RLRCSPack') return false;
  if (pack.sourcePackType === 'RCSPack' || pack.sourcePackType === 'RCSPackE') {
    return true;
  }
  return hasTagCaseInsensitive(pack.tags, 'Native');
}

export function isOthersPack(pack: StaticTrainingPackSummary): boolean {
  if (hasTagCaseInsensitive(pack.tags, 'Others')) return true;
  if (isKevpertPack(pack) || isPsyonixPack(pack) || isNativePack(pack)) return false;
  return true;
}

export function normalizeRankLabel(rawRank: string | undefined): string | null {
  if (!rawRank) return null;
  const trimmed = rawRank.trim();
  if (/^(ssl|supersonic legend)$/i.test(trimmed)) return 'SSL';
  if (/^(gc|grand champion)$/i.test(trimmed)) return 'GC';
  for (const r of RANK_SUBFOLDERS) {
    if (r.toLowerCase() === trimmed.toLowerCase()) return r;
  }
  return null;
}

export function matchesRankSubfolder(pack: StaticTrainingPackSummary, rank: string): boolean {
  if (pack.tags && pack.tags.length > 0) {
    if (hasTagCaseInsensitive(pack.tags, rank)) return true;
    if (rank === 'SSL' && hasTagCaseInsensitive(pack.tags, 'Supersonic Legend')) return true;
    if (rank === 'GC' && hasTagCaseInsensitive(pack.tags, 'Grand Champion')) return true;
    return false;
  }
  if (!isPsyonixPack(pack)) return false;
  return normalizeRankLabel(pack.rankTier) === rank;
}

export function hasAnyRankTag(pack: StaticTrainingPackSummary): boolean {
  return RANK_SUBFOLDERS.some((rank) => matchesRankSubfolder(pack, rank));
}

export function matchesPsyonixYear(pack: StaticTrainingPackSummary, yr: string): boolean {
  if (pack.releaseYearMonth && pack.releaseYearMonth.startsWith(`${yr}-`)) return true;
  return (
    hasTagCaseInsensitive(pack.tags, yr) ||
    hasTagCaseInsensitive(pack.tags, `Psyonix ${yr}`)
  );
}

export function matchesPsyonixYearMonth(pack: StaticTrainingPackSummary, ymTag: string): boolean {
  if (pack.releaseYearMonth === ymTag) return true;
  return hasTagCaseInsensitive(pack.tags, ymTag);
}

export function filterAndSortTrainingPacks(params: {
  packs: StaticTrainingPackSummary[];
  topCategory: TopCategoryFilter;
  selectedPsyonixYear: string;
  selectedPsyonixYearMonth: string;
  selectedRank: string;
  searchQuery: string;
  sortOrder: StaticPackSortOrder;
}): StaticTrainingPackSummary[] {
  const {
    packs,
    topCategory,
    selectedPsyonixYear,
    selectedPsyonixYearMonth,
    selectedRank,
    searchQuery,
    sortOrder,
  } = params;
  const q = searchQuery.trim().toLowerCase();

  const filtered = packs.filter((p) => {
    if (topCategory === 'Kevpert' && !isKevpertPack(p)) return false;
    if (topCategory === 'Psyonix') {
      if (!isPsyonixPack(p)) return false;
      if (selectedPsyonixYear !== 'ALL' && !matchesPsyonixYear(p, selectedPsyonixYear)) {
        return false;
      }
      if (
        selectedPsyonixYearMonth !== 'ALL' &&
        !matchesPsyonixYearMonth(p, selectedPsyonixYearMonth)
      ) {
        return false;
      }
    }
    if (topCategory === 'Rank') {
      if (selectedRank === 'ALL') {
        if (!hasAnyRankTag(p)) return false;
      } else if (!matchesRankSubfolder(p, selectedRank)) {
        return false;
      }
    }
    if (topCategory === 'Others' && !isOthersPack(p)) return false;
    if (topCategory === 'Native' && !isNativePack(p)) return false;

    if (q) {
      const hay = [
        p.title,
        p.description,
        p.code || '',
        getEffectiveCreator(p),
        p.rankTier || '',
        ...(p.tags || []),
      ]
        .join(' ')
        .toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  return [...filtered].sort((a, b) => {
    if (sortOrder === 'rank') {
      const rA = RANK_ORDER_MAP[a.rankTier || ''] ?? 99;
      const rB = RANK_ORDER_MAP[b.rankTier || ''] ?? 99;
      if (rA !== rB) return rA - rB;
      return a.title.localeCompare(b.title);
    }
    if (sortOrder === 'date') {
      const ymA = a.releaseYearMonth || '';
      const ymB = b.releaseYearMonth || '';
      if (ymA !== ymB) return ymB.localeCompare(ymA);
      return Number(b.createdAt || 0) - Number(a.createdAt || 0);
    }
    if (sortOrder === 'title') {
      return a.title.localeCompare(b.title);
    }
    return Number(b.updatedAt || 0) - Number(a.updatedAt || 0);
  });
}

export function generatePackUUID(): string {
  const bytes = new Uint8Array(16);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

export function normalizePackSummary(
  pack: StaticTrainingPackSummary,
  idx = 0
): StaticTrainingPackSummary {
  const uuid = pack.uuid || pack.id || `pack-${idx}`;
  const title = pack.title || pack.name || 'Untitled Pack';
  const itemCount =
    typeof pack.itemCount === 'number'
      ? pack.itemCount
      : typeof pack.shotCount === 'number'
      ? pack.shotCount
      : 0;
  return {
    ...pack,
    uuid,
    id: uuid,
    title,
    name: title,
    itemCount,
    shotCount: itemCount,
    createdAt: pack.createdAt ?? Date.now(),
    updatedAt: pack.updatedAt ?? Date.now(),
  };
}

export const DEFAULT_STATIC_TRAINING_PACKS: StaticTrainingPackSummary[] = [
  {
    uuid: '550e8400-e29b-41d4-a716-446655440001',
    title: 'Aerial Striker Pack',
    description:
      'High-altitude redirects, double-tap setups, and fast aerial volleys for offensive precision.',
    originalDescription: 'Code: C7E0-9E0B-B739-A899 | Creator: Kevpert | Target Rank: Champion',
    code: 'C7E0-9E0B-B739-A899',
    creator: 'Kevpert',
    rankTier: 'Champion',
    tags: ['Kevpert', 'Champion'],
    sourcePackType: 'RLRCSPack',
    itemCount: 18,
    createdAt: 1711843200000,
    updatedAt: 1711929600000,
  },
  {
    uuid: '550e8400-e29b-41d4-a716-446655440002',
    title: 'Shadow Defense & Backboard Clears',
    description:
      'Awkward overhead saves, corner reads, and backboard clears under heavy pressure.',
    originalDescription: 'Code: 5CCE-FB29-7B05-A0B1 | Creator: Psyonix | 2024-05 Featured',
    code: '5CCE-FB29-7B05-A0B1',
    creator: 'Psyonix',
    releaseYearMonth: '2024-05',
    rankTier: 'Diamond',
    tags: ['Psyonix', '2024', '2024-05', 'Diamond'],
    sourcePackType: 'RLRCSPack',
    itemCount: 12,
    createdAt: 1711756800000,
    updatedAt: 1711843200000,
  },
  {
    uuid: '550e8400-e29b-41d4-a716-446655440003',
    title: 'Wall-to-Air Dribble Mastery',
    description:
      'Clean first touches off the side wall into controlled air dribbles and flip resets.',
    originalDescription: 'Native local pack created inside Rocket Companion Static Training Editor.',
    tags: ['Native'],
    sourcePackType: 'RCSPackE',
    itemCount: 10,
    createdAt: 1711324800000,
    updatedAt: 1711497600000,
  },
  {
    uuid: '550e8400-e29b-41d4-a716-446655440004',
    title: 'Power Shots & Ground Placement',
    description:
      'Half-volley boomers, hook shots, and top-corner placement from midfield.',
    originalDescription: 'Code: 6EB1-79B2-33B8-681C | Creator: Wayprotein | GC',
    code: '6EB1-79B2-33B8-681C',
    creator: 'Wayprotein',
    rankTier: 'GC',
    tags: ['GC'],
    sourcePackType: 'RLRCSPack',
    itemCount: 24,
    createdAt: 1710720000000,
    updatedAt: 1710892800000,
  },
];

export async function decodeRCSPackText(file: File): Promise<string> {
  const rawText = await file.text();
  const trimmed = rawText.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    return trimmed;
  }
  const cleanB64 = trimmed.replace(/^RCS1:/, '').trim();
  const binary = atob(cleanB64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

export async function parseStandaloneImportedPackFile(
  file: File,
  isDevMode: boolean
): Promise<StaticTrainingPackSummary> {
  if (!isDevMode && /\.(rlrcspack|tem)$/i.test(file.name)) {
    throw new Error('.RLRCSPack and .Tem packs can only be imported in Developer Mode.');
  }
  const text = await decodeRCSPackText(file);
  const parsed = JSON.parse(text);
  if (!isDevMode && parsed?.format === 'RLRCSPack') {
    throw new Error('.RLRCSPack packs can only be imported in Developer Mode.');
  }
  const rawMeta = parsed?.metadata || parsed || {};
  const rawItems = Array.isArray(parsed?.items) ? parsed.items : [];
  return normalizePackSummary({
    uuid:
      typeof rawMeta.uuid === 'string' && rawMeta.uuid.trim()
        ? rawMeta.uuid.trim()
        : generatePackUUID(),
    title:
      typeof rawMeta.title === 'string' && rawMeta.title.trim()
        ? rawMeta.title.trim()
        : file.name.replace(/\.(rcspacke?|rlrcspack|gz|json)$/i, '') || 'Imported Pack',
    description: typeof rawMeta.description === 'string' ? rawMeta.description : '',
    itemCount:
      rawItems.length > 0
        ? rawItems.length
        : typeof rawMeta.itemCount === 'number'
        ? rawMeta.itemCount
        : 1,
    sourcePackType: /\.rlrcspack$/i.test(file.name)
      ? 'RLRCSPack'
      : /\.rcspacke$/i.test(file.name)
      ? 'RCSPackE'
      : 'RCSPack',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });
}

export function computePackCategoryCounts(
  packs: StaticTrainingPackSummary[]
): Record<TopCategoryFilter, number> {
  const counts: Record<TopCategoryFilter, number> = {
    All: packs.length,
    Kevpert: 0,
    Psyonix: 0,
    Rank: 0,
    Others: 0,
    Native: 0,
  };
  for (const p of packs) {
    if (isKevpertPack(p)) counts.Kevpert++;
    if (isPsyonixPack(p)) counts.Psyonix++;
    if (hasAnyRankTag(p)) counts.Rank++;
    if (isOthersPack(p)) counts.Others++;
    if (isNativePack(p)) counts.Native++;
  }
  return counts;
}

export function computePsyonixYearCounts(
  packs: StaticTrainingPackSummary[]
): Map<string, number> {
  const map = new Map<string, number>();
  for (const yr of PSYONIX_YEARS) map.set(yr, 0);
  for (const p of packs) {
    if (!isPsyonixPack(p)) continue;
    for (const yr of PSYONIX_YEARS) {
      if (matchesPsyonixYear(p, yr)) {
        map.set(yr, (map.get(yr) || 0) + 1);
      }
    }
  }
  return map;
}

export function computePsyonixMonthsForYear(
  packs: StaticTrainingPackSummary[],
  selectedYear: string
): Array<{ ymTag: string; shortLabel: string; count: number }> {
  if (selectedYear === 'ALL') return [];
  const results: Array<{ ymTag: string; shortLabel: string; count: number }> = [];
  for (const def of PSYONIX_MONTH_DEFINITIONS) {
    const ymTag = `${selectedYear}-${def.mm}`;
    let count = 0;
    for (const p of packs) {
      if (isPsyonixPack(p) && matchesPsyonixYearMonth(p, ymTag)) {
        count++;
      }
    }
    if (count > 0) {
      results.push({ ymTag, shortLabel: def.shortLabel, count });
    }
  }
  return results;
}

export function computeRankSubfolderCounts(
  packs: StaticTrainingPackSummary[]
): Map<string, number> {
  const map = new Map<string, number>();
  for (const r of RANK_SUBFOLDERS) map.set(r, 0);
  for (const p of packs) {
    for (const r of RANK_SUBFOLDERS) {
      if (matchesRankSubfolder(p, r)) {
        map.set(r, (map.get(r) || 0) + 1);
      }
    }
  }
  return map;
}
