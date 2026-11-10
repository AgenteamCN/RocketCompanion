/**
 * temMetadataAndTagClassifier.ts
 * Pure metadata, rank tier, release date, and tag derivation helpers for .Tem training packs.
 */

export const RANK_ORDER_MAP: Record<string, number> = {
  Bronze: 1,
  Silver: 2,
  Gold: 3,
  Platinum: 4,
  Diamond: 5,
  Champion: 6,
  GC: 7,
  'Grand Champion': 7,
  SSL: 8,
  'Supersonic Legend': 8,
  Progression: 9,
};

const MONTH_NAME_TO_NUM: Record<string, string> = {
  jan: '01',
  january: '01',
  feb: '02',
  february: '02',
  mar: '03',
  march: '03',
  apr: '04',
  april: '04',
  may: '05',
  jun: '06',
  june: '06',
  jul: '07',
  july: '07',
  aug: '08',
  august: '08',
  sep: '09',
  sept: '09',
  september: '09',
  oct: '10',
  october: '10',
  nov: '11',
  november: '11',
  dec: '12',
  december: '12',
};

export function extractEpochMs(val: unknown, fallbackMs: number): number {
  if (typeof val === 'number' && val > 0) {
    return val < 10_000_000_000 ? Math.round(val * 1000) : Math.round(val);
  }
  if (val && typeof val === 'object' && 'epoch' in val) {
    const epochSec = Number((val as { epoch?: unknown }).epoch);
    if (Number.isFinite(epochSec) && epochSec > 0) {
      return Math.round(epochSec * 1000);
    }
  }
  return fallbackMs;
}

/**
 * Checks whether an EditorFreeCam pose in a `.Tem` round is Rocket League's untouched
 * default editor spawn camera (`location: [-600, -700, 530], pitch: -15°, yaw: 65°`).
 */
export function isDefaultRlEditorFreeCam(
  loc: [number, number, number],
  pitchDeg: number,
  yawDeg: number
): boolean {
  return (
    Math.abs(loc[0] - -600) < 25 &&
    Math.abs(loc[1] - -700) < 25 &&
    Math.abs(loc[2] - 530) < 25 &&
    Math.abs(pitchDeg - -15) < 1.8 &&
    Math.abs(yawDeg - 65) < 1.8
  );
}

/**
 * Derives structured folder/filter tags, competitive rank tier, and official release date
 * from a training pack's title, creator, code, and difficulty.
 */
export function derivePackTagsAndMetadata(params: {
  title: string;
  creator?: string | null;
  code?: string | null;
  difficulty?: unknown;
}): {
  tags: string[];
  rankTier?: string;
  releaseYearMonth?: string;
  normalizedCreator?: string;
} {
  const { title, creator, code } = params;
  const tagSet = new Set<string>();
  const rawCreator = (creator || '').trim();
  const titleLower = (title || '').toLowerCase();
  const creatorLower = rawCreator.toLowerCase();

  let normalizedCreator = rawCreator || undefined;

  const isKevpert =
    creatorLower.includes('kevpert') ||
    creatorLower.includes('hampert') ||
    creatorLower.includes('samuraipert') ||
    titleLower.includes('kevpert');
  const isPsyonix =
    !isKevpert &&
    (creatorLower === 'psyonix' ||
      titleLower.includes('psyonix') ||
      /^(progression|ssl|gc|champion|diamond|platinum|gold|silver|bronze)\s+(pack|goals)\s+/i.test(
        (title || '').trim()
      ));

  if (isKevpert) {
    tagSet.add('Kevpert');
    if (!normalizedCreator) normalizedCreator = 'Kevpert';
  } else if (isPsyonix) {
    tagSet.add('Psyonix');
    normalizedCreator = 'Psyonix';
  } else {
    if (code && code.trim().toUpperCase() === '0FB6-C16F-D26D-0A6F' && !normalizedCreator) {
      normalizedCreator = 'Iowa';
    }
    tagSet.add('Others');
  }

  // Extract Kevpert F-key tag if present
  const fKeyMatch = title.match(/\b(F1[0-2]|F[35789])\b/i);
  if (fKeyMatch) {
    tagSet.add(fKeyMatch[1].toUpperCase());
  }

  // Detect Month + Year (e.g. "Sept 2022", "July 2023", "Nov 2024")
  let releaseYearMonth: string | undefined;
  const dateMatch = title.match(
    /\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(20\d{2})\b/i
  );
  if (dateMatch) {
    const mKey = dateMatch[1].toLowerCase();
    const yr = dateMatch[2];
    const mNum = MONTH_NAME_TO_NUM[mKey] || '01';
    releaseYearMonth = `${yr}-${mNum}`;
    tagSet.add(yr);
    tagSet.add(releaseYearMonth);
    if (isPsyonix) {
      tagSet.add(`Psyonix ${yr}`);
    }
  }

  // Detect Rank Tier or Progression strictly for Psyonix packs
  let rankTier: string | undefined;
  if (isPsyonix) {
    if (/\bprogression\b/i.test(title)) {
      rankTier = 'Progression';
    } else if (/\b(ssl|supersonic legend)\b/i.test(title)) {
      rankTier = 'SSL';
    } else if (/\b(gc|grand champion)\b/i.test(title)) {
      rankTier = 'GC';
    } else if (/\bchampion\b/i.test(title)) {
      rankTier = 'Champion';
    } else if (/\bdiamond\b/i.test(title)) {
      rankTier = 'Diamond';
    } else if (/\bplatinum\b/i.test(title)) {
      rankTier = 'Platinum';
    } else if (/\bgold\b/i.test(title)) {
      rankTier = 'Gold';
    } else if (/\bsilver\b/i.test(title)) {
      rankTier = 'Silver';
    } else if (/\bbronze\b/i.test(title)) {
      rankTier = 'Bronze';
    }
  }

  if (rankTier) {
    tagSet.add(rankTier);
  }

  return {
    tags: Array.from(tagSet),
    rankTier,
    releaseYearMonth,
    normalizedCreator,
  };
}
