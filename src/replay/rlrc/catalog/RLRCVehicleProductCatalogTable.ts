/**
 * RLRCVehicleProductCatalogTable.ts
 * Static Rocket League body product ID catalog mapping external .replay vehicle IDs
 * to canonical RocketCompanion hitbox and visual presets.
 */

import type { RLRCHitboxId, RLRCVisualId } from '../RLRCReplayTypes.ts';

export interface RLRCVehicleCatalogEntry {
  readonly bodyProductId: number;
  readonly name: string;
  readonly hitboxId: RLRCHitboxId;
  readonly visualId: RLRCVisualId;
}

export const DEFAULT_HITBOX_ID: RLRCHitboxId = 'hitbox-octane';
export const DEFAULT_VISUAL_ID: RLRCVisualId = 'fennec';

export const HITBOX_DEFAULT_VISUAL_MAP: Readonly<Record<RLRCHitboxId, RLRCVisualId>> =
  Object.freeze({
    'hitbox-octane': 'fennec',
    'hitbox-dominus': 'dominus',
    'hitbox-plank': 'sentinel',
    'hitbox-breakout': 'breakout-mini',
    'hitbox-hybrid': 'insidio',
    'hitbox-merc': 'merc',
    'hitbox-psyclops': 'trioctane-threewheel',
  });

export const BODY_PRODUCT_CATALOG_ENTRIES: readonly RLRCVehicleCatalogEntry[] = Object.freeze([
  // Octane hitbox -> Fennec visual (including Octane 23 and Fennec 4284)
  { bodyProductId: 23, name: 'Octane', hitboxId: 'hitbox-octane', visualId: 'fennec' },
  { bodyProductId: 4284, name: 'Fennec', hitboxId: 'hitbox-octane', visualId: 'fennec' },
  {
    bodyProductId: 7948,
    name: 'Octane Preset Variant',
    hitboxId: 'hitbox-octane',
    visualId: 'fennec',
  },
  { bodyProductId: 24, name: 'Takumi', hitboxId: 'hitbox-octane', visualId: 'fennec' },
  { bodyProductId: 26, name: 'Road Hog', hitboxId: 'hitbox-octane', visualId: 'fennec' },
  { bodyProductId: 27, name: 'Gizmo', hitboxId: 'hitbox-octane', visualId: 'fennec' },
  { bodyProductId: 29, name: 'Backfire', hitboxId: 'hitbox-octane', visualId: 'fennec' },
  { bodyProductId: 402, name: 'Scarab', hitboxId: 'hitbox-octane', visualId: 'fennec' },
  { bodyProductId: 404, name: 'Zippy', hitboxId: 'hitbox-octane', visualId: 'fennec' },
  { bodyProductId: 597, name: 'Grog', hitboxId: 'hitbox-octane', visualId: 'fennec' },
  { bodyProductId: 1159, name: 'Marauder', hitboxId: 'hitbox-octane', visualId: 'fennec' },
  { bodyProductId: 1317, name: 'Takumi RX-T', hitboxId: 'hitbox-octane', visualId: 'fennec' },
  { bodyProductId: 1416, name: 'Road Hog XL', hitboxId: 'hitbox-octane', visualId: 'fennec' },
  { bodyProductId: 1475, name: 'Proteus', hitboxId: 'hitbox-octane', visualId: 'fennec' },
  { bodyProductId: 1603, name: 'Vulcan', hitboxId: 'hitbox-octane', visualId: 'fennec' },
  { bodyProductId: 1675, name: 'Bone Shaker', hitboxId: 'hitbox-octane', visualId: 'fennec' },
  { bodyProductId: 1691, name: 'Twinzer', hitboxId: 'hitbox-octane', visualId: 'fennec' },
  { bodyProductId: 3879, name: 'Mudcat GXT', hitboxId: 'hitbox-octane', visualId: 'fennec' },
  { bodyProductId: 4725, name: 'Harbinger GXT', hitboxId: 'hitbox-octane', visualId: 'fennec' },
  { bodyProductId: 5657, name: 'Dingo', hitboxId: 'hitbox-octane', visualId: 'fennec' },

  // Octane hitbox -> Ryza dedicated visual
  { bodyProductId: 12814, name: 'Ryza', hitboxId: 'hitbox-octane', visualId: 'ryza' },

  // Hybrid hitbox -> Insidio visual
  { bodyProductId: 3582, name: 'Insidio', hitboxId: 'hitbox-hybrid', visualId: 'insidio' },
  { bodyProductId: 5480, name: 'Insidio Edition', hitboxId: 'hitbox-hybrid', visualId: 'insidio' },
  { bodyProductId: 25, name: 'Venom', hitboxId: 'hitbox-hybrid', visualId: 'insidio' },
  { bodyProductId: 31, name: 'X-Devil', hitboxId: 'hitbox-hybrid', visualId: 'insidio' },
  { bodyProductId: 1171, name: 'Esper', hitboxId: 'hitbox-hybrid', visualId: 'insidio' },
  { bodyProductId: 1300, name: 'X-Devil Mk2', hitboxId: 'hitbox-hybrid', visualId: 'insidio' },
  { bodyProductId: 1623, name: 'Jager 619', hitboxId: 'hitbox-hybrid', visualId: 'insidio' },
  { bodyProductId: 2070, name: 'Skyline GT-R R34', hitboxId: 'hitbox-hybrid', visualId: 'insidio' },
  { bodyProductId: 2298, name: 'Endo', hitboxId: 'hitbox-hybrid', visualId: 'insidio' },
  { bodyProductId: 2852, name: 'Nimbus', hitboxId: 'hitbox-hybrid', visualId: 'insidio' },
  { bodyProductId: 4369, name: 'R3MX GXT', hitboxId: 'hitbox-hybrid', visualId: 'insidio' },
  { bodyProductId: 5082, name: 'Tygris', hitboxId: 'hitbox-hybrid', visualId: 'insidio' },

  // Dominus hitbox -> Dominus visual (403 is Dominus, along with 1568 and 12262)
  { bodyProductId: 403, name: 'Dominus', hitboxId: 'hitbox-dominus', visualId: 'dominus' },
  { bodyProductId: 1568, name: 'Dominus GT', hitboxId: 'hitbox-dominus', visualId: 'dominus' },
  {
    bodyProductId: 12262,
    name: 'Dominus Variant',
    hitboxId: 'hitbox-dominus',
    visualId: 'dominus',
  },
  { bodyProductId: 21, name: 'Hotshot', hitboxId: 'hitbox-dominus', visualId: 'dominus' },
  { bodyProductId: 600, name: 'Ripper', hitboxId: 'hitbox-dominus', visualId: 'dominus' },
  { bodyProductId: 1172, name: 'Aftershock', hitboxId: 'hitbox-dominus', visualId: 'dominus' },
  { bodyProductId: 1173, name: 'Masamune', hitboxId: 'hitbox-dominus', visualId: 'dominus' },
  { bodyProductId: 1796, name: 'Imperator DT5', hitboxId: 'hitbox-dominus', visualId: 'dominus' },
  {
    bodyProductId: 2069,
    name: 'Dodge Charger R/T',
    hitboxId: 'hitbox-dominus',
    visualId: 'dominus',
  },
  { bodyProductId: 2665, name: 'Maverick GXT', hitboxId: 'hitbox-dominus', visualId: 'dominus' },
  { bodyProductId: 3624, name: 'Guardian GXT', hitboxId: 'hitbox-dominus', visualId: 'dominus' },
  { bodyProductId: 4291, name: 'Ronin GXT', hitboxId: 'hitbox-dominus', visualId: 'dominus' },
  { bodyProductId: 4611, name: 'Peregrine TT', hitboxId: 'hitbox-dominus', visualId: 'dominus' },

  // Breakout hitbox -> Breakout-Mini visual
  { bodyProductId: 22, name: 'Breakout', hitboxId: 'hitbox-breakout', visualId: 'breakout-mini' },
  {
    bodyProductId: 1894,
    name: 'Breakout Type-S',
    hitboxId: 'hitbox-breakout',
    visualId: 'breakout-mini',
  },
  {
    bodyProductId: 12658,
    name: 'Breakout Variant',
    hitboxId: 'hitbox-breakout',
    visualId: 'breakout-mini',
  },
  {
    bodyProductId: 1478,
    name: 'Animus GP',
    hitboxId: 'hitbox-breakout',
    visualId: 'breakout-mini',
  },
  { bodyProductId: 2268, name: 'Samurai', hitboxId: 'hitbox-breakout', visualId: 'breakout-mini' },
  { bodyProductId: 3032, name: 'Cyclone', hitboxId: 'hitbox-breakout', visualId: 'breakout-mini' },
  { bodyProductId: 4014, name: 'Komodo', hitboxId: 'hitbox-breakout', visualId: 'breakout-mini' },

  // Plank hitbox -> Sentinel visual
  { bodyProductId: 4268, name: 'Sentinel', hitboxId: 'hitbox-plank', visualId: 'sentinel' },
  { bodyProductId: 803, name: 'Batmobile 2016', hitboxId: 'hitbox-plank', visualId: 'sentinel' },
  { bodyProductId: 28, name: 'Paladin', hitboxId: 'hitbox-plank', visualId: 'sentinel' },
  { bodyProductId: 1624, name: 'Mantis', hitboxId: 'hitbox-plank', visualId: 'sentinel' },
  { bodyProductId: 1711, name: 'Centio V17', hitboxId: 'hitbox-plank', visualId: 'sentinel' },
  { bodyProductId: 1932, name: 'Twin Mill III', hitboxId: 'hitbox-plank', visualId: 'sentinel' },
  { bodyProductId: 3250, name: 'Artemis GXT', hitboxId: 'hitbox-plank', visualId: 'sentinel' },

  // Merc hitbox -> Merc visual
  { bodyProductId: 30, name: 'Merc', hitboxId: 'hitbox-merc', visualId: 'merc' },
  { bodyProductId: 4880, name: 'Battle Bus', hitboxId: 'hitbox-merc', visualId: 'merc' },
]);

export const BODY_PRODUCT_ID_MAP: ReadonlyMap<number, RLRCVehicleCatalogEntry> = new Map(
  BODY_PRODUCT_CATALOG_ENTRIES.map((entry) => [entry.bodyProductId, entry])
);
