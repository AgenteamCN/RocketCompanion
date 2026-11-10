/**
 * vehicleConstants.ts
 * Pure, zero-dependency vehicle hitbox, 3D visual model, and role/loadout constants.
 */

export interface HitboxPresetSpec {
  index: number;
  id: string;
  name: string;
  length: number;
  width: number;
  height: number;
  forward: number;
  up: number;
}

export const HITBOX_INDEX_TO_ID: readonly string[] = Object.freeze([
  'hitbox-octane',
  'hitbox-dominus',
  'hitbox-plank',
  'hitbox-breakout',
  'hitbox-hybrid',
  'hitbox-merc',
  'hitbox-psyclops'
]);

export interface CarVisualCatalogItem {
  index: number;
  id: string;
  label: string;
  isPreset: boolean;
  defaultHitboxId: string;
  playerOnly?: boolean;
}

/**
 * Canonical visual model catalog (index 0..31).
 */
export const CAR_VISUAL_CATALOG: readonly Readonly<CarVisualCatalogItem>[] = Object.freeze([
  Object.freeze({ index: 0, id: 'fennec', label: 'Fennec', isPreset: false, defaultHitboxId: 'hitbox-octane' }),
  Object.freeze({ index: 1, id: 'insidio', label: 'Insidio', isPreset: false, defaultHitboxId: 'hitbox-hybrid' }),
  Object.freeze({ index: 2, id: 'trioctane', label: 'TriOctane4', isPreset: false, defaultHitboxId: 'hitbox-octane', playerOnly: true }),
  Object.freeze({ index: 3, id: 'dominus', label: 'Dominus', isPreset: false, defaultHitboxId: 'hitbox-dominus' }),
  Object.freeze({ index: 4, id: 'breakout-mini', label: 'Breakout', isPreset: false, defaultHitboxId: 'hitbox-breakout' }),
  Object.freeze({ index: 5, id: 'sentinel', label: 'Sentinel', isPreset: false, defaultHitboxId: 'hitbox-plank' }),
  Object.freeze({ index: 6, id: 'merc', label: 'Merc', isPreset: false, defaultHitboxId: 'hitbox-merc' }),
  Object.freeze({ index: 7, id: 'ryza', label: 'Ryza', isPreset: false, defaultHitboxId: 'hitbox-octane' }),
  Object.freeze({ index: 8, id: 'trioctane-threewheel', label: 'TriOctane3', isPreset: false, defaultHitboxId: 'hitbox-psyclops', playerOnly: true }),
  Object.freeze({ index: 9, id: 'octane', label: 'Octane', isPreset: false, defaultHitboxId: 'hitbox-octane' })
]);

export const CAR_VISUAL_IDS: readonly string[] = Object.freeze(CAR_VISUAL_CATALOG.map((item) => item.id));

export const CAR_VISUAL_OPTIONS = Object.freeze(
  CAR_VISUAL_CATALOG.map(({ id, label, isPreset }) => ({ id, label, isPreset }))
);

export const SHORT_VISUAL_ALIAS_MAP: Readonly<Record<string, string>> = Object.freeze({
  octane: 'octane',
  dominus: 'dominus',
  breakout: 'breakout-mini',
  'breakout-mini': 'breakout-mini',
  hybrid: 'insidio',
  plank: 'sentinel',
  batmobile: 'sentinel',
  sentinel: 'sentinel',
  merc: 'merc',
  trioctane: 'trioctane',
  trioctane4: 'trioctane',
  'trioctane-4w': 'trioctane',
  'trioctane-octane': 'trioctane',
  trioctane3: 'trioctane-threewheel',
  'trioctane-threewheel': 'trioctane-threewheel',
  'trioctane-3w': 'trioctane-threewheel',
  psyclops: 'trioctane-threewheel',
  tricycle: 'trioctane-threewheel',
  default: 'fennec',
  'hitbox-octane': 'fennec',
  'hitbox-dominus': 'dominus',
  'hitbox-breakout': 'breakout-mini',
  'hitbox-plank': 'sentinel',
  'hitbox-merc': 'merc',
  'hitbox-hybrid': 'insidio',
  'hitbox-psyclops': 'trioctane-threewheel',
  fennec: 'fennec',
  insidio: 'insidio',
  ryza: 'ryza'
});

export const PLAYER_ROLES = Object.freeze({
  PLAYER: 'player',
  SPECTATOR: 'spectator'
});

export const PLAYER_ROLE_CODES = Object.freeze({
  PLAYER: 0,
  SPECTATOR: 2
});

const dynamicCustomVisualHitboxes = new Map<string, string>();

export function registerDynamicVisualId(visualId: string, hitboxId = 'hitbox-octane'): void {
  const raw = String(visualId || '').toLowerCase().trim();
  if (raw) {
    dynamicCustomVisualHitboxes.set(raw, String(hitboxId || 'hitbox-octane').toLowerCase().trim());
  }
}

export function normalizeVisualId(visualId: unknown): string {
  if (!visualId) return 'fennec';
  const raw = String(visualId).toLowerCase().trim();
  if (CAR_VISUAL_IDS.includes(raw)) return raw;
  if (SHORT_VISUAL_ALIAS_MAP[raw]) return SHORT_VISUAL_ALIAS_MAP[raw];
  if (dynamicCustomVisualHitboxes.has(raw)) return raw;
  return 'fennec';
}

export function encodeVisualIdIndex(visualId: unknown): number {
  if (typeof visualId === 'number' && Number.isFinite(visualId)) {
    return (visualId >= 0 && visualId < CAR_VISUAL_IDS.length) ? visualId : 0;
  }
  const idx = CAR_VISUAL_IDS.indexOf(normalizeVisualId(visualId));
  return idx >= 0 ? idx : 0;
}

export function decodeVisualIdIndex(index: unknown): string {
  if (typeof index === 'string') {
    const trimmed = index.trim();
    if (!/^\d+$/.test(trimmed)) return normalizeVisualId(trimmed);
  }
  const idx = Number(index);
  return (Number.isInteger(idx) && idx >= 0 && idx < CAR_VISUAL_IDS.length) ? CAR_VISUAL_IDS[idx] : 'fennec';
}

export function resolveHitboxIndex(hitboxOrVisual: unknown): number {
  if (typeof hitboxOrVisual === 'number' && Number.isFinite(hitboxOrVisual)) {
    return (hitboxOrVisual >= 0 && hitboxOrVisual <= 6) ? hitboxOrVisual : 0;
  }
  if (!hitboxOrVisual) return 0;
  const rawLower = String(hitboxOrVisual).toLowerCase().trim();
  const lower = dynamicCustomVisualHitboxes.get(rawLower) || rawLower;
  if (
    lower.includes('psyclops') ||
    lower.includes('tricycle') ||
    lower.includes('threewheel') ||
    lower.includes('three-wheel') ||
    lower === 'trioctane3' ||
    lower === 'trioctane-3w'
  ) {
    return 6;
  }
  if (lower.includes('dominus')) return 1;
  if (lower.includes('plank') || lower.includes('batmobile') || lower.includes('sentinel')) return 2;
  if (lower.includes('breakout')) return 3;
  if (lower.includes('hybrid') || lower.includes('insidio')) return 4;
  if (lower.includes('merc')) return 5;
  if (lower.includes('octane') || lower.includes('fennec') || lower.includes('ryza') || lower.includes('trioctane') || lower === 'default') return 0;
  return 0;
}

export function decodeHitboxIndex(hitboxIndex: unknown): string {
  const idx = Number(hitboxIndex);
  if (Number.isInteger(idx) && idx >= 0 && idx < HITBOX_INDEX_TO_ID.length) {
    return HITBOX_INDEX_TO_ID[idx];
  }
  return 'hitbox-octane';
}

export const encodeHitboxIdIndex = resolveHitboxIndex;

export function resolveVehicleHitboxId(hitboxOrVisual: unknown): string {
  return decodeHitboxIndex(resolveHitboxIndex(hitboxOrVisual));
}

export function encodeRoleIndex(role: unknown): number {
  if (role === 'spectator' || role === PLAYER_ROLE_CODES.SPECTATOR || role === 1) {
    return PLAYER_ROLE_CODES.SPECTATOR;
  }
  return PLAYER_ROLE_CODES.PLAYER;
}

export function decodeRoleIndex(code: unknown): 'player' | 'spectator' {
  return (code === PLAYER_ROLE_CODES.SPECTATOR || code === 1 || code === 'spectator')
    ? PLAYER_ROLES.SPECTATOR
    : PLAYER_ROLES.PLAYER;
}

export const PAINT_FINISH_IDS: readonly string[] = Object.freeze(['matte', 'metallic']);
export const BOOST_VISUAL_IDS: readonly string[] = Object.freeze(['gold-rush', 'cartoon']);
export const BOOST_AUDIO_PRESET_IDS: readonly string[] = Object.freeze([
  'rush',
  'standard',
  'flamethrower',
  'plasma'
]);

export function encodePaintFinishIndex(paintFinish: unknown): number {
  if (typeof paintFinish === 'number' && Number.isFinite(paintFinish)) {
    return (paintFinish & 1);
  }
  return paintFinish === 'matte' ? 0 : 1;
}

export function decodePaintFinishIndex(index: unknown): 'matte' | 'metallic' {
  if (typeof index === 'string') {
    return index === 'matte' ? 'matte' : 'metallic';
  }
  if (index === null || index === undefined) return 'metallic';
  return (Number(index) & 1) === 0 ? 'matte' : 'metallic';
}

export function encodeBoostVisualIndex(boostVisual: unknown): number {
  if (typeof boostVisual === 'number' && Number.isFinite(boostVisual)) {
    return (boostVisual & 1);
  }
  return boostVisual === 'cartoon' ? 1 : 0;
}

export function decodeBoostVisualIndex(index: unknown): 'gold-rush' | 'cartoon' {
  if (typeof index === 'string') {
    return index === 'cartoon' ? 'cartoon' : 'gold-rush';
  }
  return (Number(index) & 1) === 1 ? 'cartoon' : 'gold-rush';
}

export function encodeBoostAudioIndex(boostAudio: unknown): number {
  if (typeof boostAudio === 'number' && Number.isFinite(boostAudio)) {
    return (boostAudio >= 0 && boostAudio < BOOST_AUDIO_PRESET_IDS.length) ? boostAudio : 0;
  }
  if (!boostAudio) return 0;
  const idx = BOOST_AUDIO_PRESET_IDS.indexOf(String(boostAudio).trim());
  return idx >= 0 ? idx : 0;
}

export function decodeBoostAudioIndex(index: unknown): string {
  if (typeof index === 'string') {
    const trimmed = index.trim();
    if (BOOST_AUDIO_PRESET_IDS.includes(trimmed)) return trimmed;
  }
  const idx = Number(index);
  if (Number.isInteger(idx) && idx >= 0 && idx < BOOST_AUDIO_PRESET_IDS.length) {
    return BOOST_AUDIO_PRESET_IDS[idx];
  }
  return 'rush';
}

export interface ExtraLoadoutCosmetics {
  paintFinish?: unknown;
  boostVisual?: unknown;
  boostAudio?: unknown;
}

/**
 * Packs visualIndex (5 bits, 0..31), hitboxIndex (3 bits, 0..7), colorSlot (8 bits, 0..255),
 * and personal cosmetics (paintFinish, boostVisual, boostAudio) into a 32-bit uint32 for PLAYER_LOADOUT_UPDATED.param2
 */
export function packLoadoutSignalParam2(
  visualIdOrIndex: unknown,
  colorSlot = 0,
  hitboxIdOrIndex: unknown = null,
  extraOrPaintFinish: ExtraLoadoutCosmetics | unknown = null,
  boostVisualArg: unknown = null,
  boostAudioArg: unknown = null
): number {
  const visualIndex = encodeVisualIdIndex(visualIdOrIndex) & 0x1F;
  const resolvedHitboxIndex = (hitboxIdOrIndex !== null && hitboxIdOrIndex !== undefined)
    ? resolveHitboxIndex(hitboxIdOrIndex)
    : resolveHitboxIndex(decodeVisualIdIndex(visualIndex));
  const encodedHitboxBits = (resolvedHitboxIndex + 1) & 0x07;
  const safeColor = (typeof colorSlot === 'number' && colorSlot >= 0) ? (colorSlot & 0xFF) : 0;
  const base16 = (encodedHitboxBits << 13) | ((visualIndex & 0x1F) << 8) | safeColor;
  const extraLoadout: ExtraLoadoutCosmetics | null = (extraOrPaintFinish && typeof extraOrPaintFinish === 'object')
    ? (extraOrPaintFinish as ExtraLoadoutCosmetics)
    : (extraOrPaintFinish !== null || boostVisualArg !== null || boostAudioArg !== null)
      ? { paintFinish: extraOrPaintFinish, boostVisual: boostVisualArg, boostAudio: boostAudioArg }
      : null;
  if (!extraLoadout) {
    return base16 >>> 0;
  }
  const paintBit = encodePaintFinishIndex(extraLoadout.paintFinish) & 0x01;
  const boostVisBit = encodeBoostVisualIndex(extraLoadout.boostVisual) & 0x01;
  const boostAudBits = encodeBoostAudioIndex(extraLoadout.boostAudio) & 0x07;
  const extBits = (1 << 21) | (boostAudBits << 18) | (boostVisBit << 17) | (paintBit << 16);
  return (base16 | extBits) >>> 0;
}

export function unpackLoadoutSignalParam2(param2: number | null | undefined) {
  const raw = (param2 ?? 0) >>> 0;
  const colorSlotId = raw & 0xFF;
  const visualIndex = (raw >>> 8) & 0x1F;
  const encodedHitboxBits = (raw >>> 13) & 0x07;
  const visualId = decodeVisualIdIndex(visualIndex);
  const hitboxIndex = encodedHitboxBits > 0
    ? (encodedHitboxBits - 1)
    : resolveHitboxIndex(visualId);
  const hitboxId = decodeHitboxIndex(hitboxIndex);
  const hasExtended = ((raw >>> 21) & 0x01) !== 0;
  const paintFinishIndex = hasExtended ? ((raw >>> 16) & 0x01) : 1;
  const boostVisualIndex = hasExtended ? ((raw >>> 17) & 0x01) : 0;
  const boostAudioIndex = hasExtended ? ((raw >>> 18) & 0x07) : 0;
  return {
    visualIndex,
    visualId,
    hitboxIndex,
    hitboxId,
    colorSlot: colorSlotId,
    colorSlotId,
    paintFinishIndex,
    paintFinish: decodePaintFinishIndex(paintFinishIndex),
    boostVisualIndex,
    boostVisual: decodeBoostVisualIndex(boostVisualIndex),
    boostAudioIndex,
    boostAudio: decodeBoostAudioIndex(boostAudioIndex),
    hasExtendedCosmetics: hasExtended
  };
}

export function packLoadoutCommandParam1(visualIdOrIndex: unknown, hitboxIdOrIndex: unknown = null): number {
  const visualIndex = encodeVisualIdIndex(visualIdOrIndex) & 0xFF;
  const hitboxIndex = (hitboxIdOrIndex !== null && hitboxIdOrIndex !== undefined)
    ? resolveHitboxIndex(hitboxIdOrIndex)
    : resolveHitboxIndex(decodeVisualIdIndex(visualIndex));
  return 0x8000 | ((hitboxIndex & 0x7F) << 8) | visualIndex;
}

export function unpackLoadoutCommandParam1(param1: unknown) {
  if (typeof param1 === 'string') {
    const visualId = decodeVisualIdIndex(param1);
    const visualIndex = encodeVisualIdIndex(visualId);
    const hitboxIndex = resolveHitboxIndex(visualId);
    return {
      visualIndex,
      visualId,
      hitboxIndex,
      hitboxId: decodeHitboxIndex(hitboxIndex)
    };
  }
  const raw = (Number(param1) || 0) & 0xFFFF;
  const visualIndex = raw & 0xFF;
  const visualId = decodeVisualIdIndex(visualIndex);
  const hasExplicitHitbox = (raw & 0x8000) !== 0;
  const hitboxIndex = hasExplicitHitbox
    ? ((raw >>> 8) & 0x7F)
    : resolveHitboxIndex(visualId);
  const hitboxId = decodeHitboxIndex(hitboxIndex);
  return {
    visualIndex,
    visualId,
    hitboxIndex,
    hitboxId
  };
}

export function packLoadoutCommandParam2(
  colorSlot = 0,
  extraOrPaintFinish: ExtraLoadoutCosmetics | unknown = null,
  boostVisualArg: unknown = null,
  boostAudioArg: unknown = null
): number {
  const safeColor = (typeof colorSlot === 'number' && colorSlot >= 0) ? (colorSlot & 0xFF) : 0;
  const extraLoadout: ExtraLoadoutCosmetics | null = (extraOrPaintFinish && typeof extraOrPaintFinish === 'object')
    ? (extraOrPaintFinish as ExtraLoadoutCosmetics)
    : (extraOrPaintFinish !== null || boostVisualArg !== null || boostAudioArg !== null)
      ? { paintFinish: extraOrPaintFinish, boostVisual: boostVisualArg, boostAudio: boostAudioArg }
      : null;
  if (!extraLoadout) {
    return safeColor;
  }
  const paintBit = encodePaintFinishIndex(extraLoadout.paintFinish) & 0x01;
  const boostVisBit = encodeBoostVisualIndex(extraLoadout.boostVisual) & 0x01;
  const boostAudBits = encodeBoostAudioIndex(extraLoadout.boostAudio) & 0x07;
  return (0x8000 | (boostAudBits << 10) | (boostVisBit << 9) | (paintBit << 8) | safeColor) & 0xFFFF;
}

export function unpackLoadoutCommandParam2(param2: number | null | undefined) {
  const raw = (param2 ?? 0) & 0xFFFF;
  const colorSlot = raw & 0xFF;
  const hasExtended = (raw & 0x8000) !== 0;
  const paintFinishIndex = hasExtended ? ((raw >>> 8) & 0x01) : 1;
  const boostVisualIndex = hasExtended ? ((raw >>> 9) & 0x01) : 0;
  const boostAudioIndex = hasExtended ? ((raw >>> 10) & 0x07) : 0;
  return {
    colorSlot,
    paintFinishIndex,
    paintFinish: decodePaintFinishIndex(paintFinishIndex),
    boostVisualIndex,
    boostVisual: decodeBoostVisualIndex(boostVisualIndex),
    boostAudioIndex,
    boostAudio: decodeBoostAudioIndex(boostAudioIndex),
    hasExtendedCosmetics: hasExtended
  };
}

export interface CarColorSlotSpec {
  id: number;
  name: string;
  nameEn: string;
  hex: string;
  team: number;
  teamName: string;
  teamNameEn: string;
}

export const CAR_COLOR_SLOTS: readonly Readonly<CarColorSlotSpec>[] = Object.freeze([
  Object.freeze({ id: 0, name: 'Red', nameEn: 'Red', hex: '#ff7043', team: 1, teamName: 'Team Orange/Red', teamNameEn: 'Team Orange/Red' }),
  Object.freeze({ id: 1, name: 'Green', nameEn: 'Green', hex: '#66bb6a', team: 0, teamName: 'Team Blue', teamNameEn: 'Team Blue' }),
  Object.freeze({ id: 2, name: 'Yellow', nameEn: 'Yellow', hex: '#ffc107', team: 1, teamName: 'Team Orange/Red', teamNameEn: 'Team Orange/Red' }),
  Object.freeze({ id: 3, name: 'Blue', nameEn: 'Blue', hex: '#42a5f5', team: 0, teamName: 'Team Blue', teamNameEn: 'Team Blue' }),
  Object.freeze({ id: 4, name: 'Pink', nameEn: 'Pink', hex: '#fd6e9d', team: 1, teamName: 'Team Orange/Red', teamNameEn: 'Team Orange/Red' }),
  Object.freeze({ id: 5, name: 'Purple', nameEn: 'Purple', hex: '#ba68c8', team: 0, teamName: 'Team Blue', teamNameEn: 'Team Blue' })
]);

export function getCarColorSlotById(id: unknown): Readonly<CarColorSlotSpec> {
  const num = Number(id);
  return CAR_COLOR_SLOTS.find(s => s.id === num) || CAR_COLOR_SLOTS[0];
}

export function parseColorToNumber(hex: unknown): number {
  if (typeof hex === 'number') return hex;
  if (!hex) return 0xff7043;
  return parseInt(String(hex).replace('#', ''), 16);
}
