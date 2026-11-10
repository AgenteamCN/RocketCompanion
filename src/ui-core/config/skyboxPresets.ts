/**
 * skyboxPresets.ts
 * Pure skybox texture paths, preset definitions, and lookup helpers.
 */

export type SkyboxCategory = 'hemisphere' | 'full-sphere';

export interface SkyboxPresetSpec {
  id: string;
  category: SkyboxCategory;
  label: string;
  shortLabel: string;
  path: string;
  resolution: string;
  sunAzimuthHintDeg: number;
  sunElevationHintDeg: number;
}

export const HEMISPHERE_SKYBOX_PRESETS: SkyboxPresetSpec[] = [
  {
    id: 'woods-sky-d',
    category: 'hemisphere',
    label: 'Woods Sky D (Original Grey Dusk)',
    shortLabel: 'Woods (Default)',
    path: '/assets/arena/Woods_Sky_D.webp',
    resolution: '4096×1024 WebP',
    sunAzimuthHintDeg: 0,
    sunElevationHintDeg: 3.5,
  },
  {
    id: 'chn-sky3',
    category: 'hemisphere',
    label: 'CHN Sky 3 (Vibrant Sunset & Blue Clouds)',
    shortLabel: 'CHN Sky 3',
    path: '/assets/arena/skyboxes/CHN_Sky3.webp',
    resolution: '4096×1024 WebP',
    sunAzimuthHintDeg: 0,
    sunElevationHintDeg: 3.5,
  },
  {
    id: 'chn-dusk-tinted',
    category: 'hemisphere',
    label: 'EuroStadium Dusk Tinted (Warm Amber)',
    shortLabel: 'Euro Dusk',
    path: '/assets/arena/skyboxes/CHN_Sky3_EuroStadium_Dusk_Tinted.webp',
    resolution: '4096×1024 WebP',
    sunAzimuthHintDeg: 0,
    sunElevationHintDeg: 3.5,
  },
  {
    id: 'farmstead-sky-t7',
    category: 'hemisphere',
    label: 'Farmstead Sky T7 (Dramatic Storm & Sunset)',
    shortLabel: 'Farmstead T7',
    path: '/assets/arena/skyboxes/Farmstead_Sky_T7.webp',
    resolution: '4096×2048 WebP',
    sunAzimuthHintDeg: 83,
    sunElevationHintDeg: 2.5,
  },
  {
    id: 'forbidden-temple-clouds',
    category: 'hemisphere',
    label: 'Forbidden Temple (Clear Blue & Horizon Cumulus)',
    shortLabel: 'Beach Clouds',
    path: '/assets/arena/skyboxes/ForbiddenTemple_Beach_Clouds_01.webp',
    resolution: '4096×1024 WebP',
    sunAzimuthHintDeg: 31,
    sunElevationHintDeg: 54,
  },
];

export const FULL_SPHERE_SKYBOX_PRESETS: SkyboxPresetSpec[] = [
  {
    id: 'sbs-cloudy-01',
    category: 'full-sphere',
    label: 'Cloudy 01 — Rose Dusk & Stormy Reflection',
    shortLabel: 'SBS #01 Rose Dusk',
    path: '/assets/arena/skyboxes/full-sphere/Panorama_Sky_01.webp',
    resolution: '2048×1024 WebP',
    sunAzimuthHintDeg: 88,
    sunElevationHintDeg: 27,
  },
  {
    id: 'sbs-cloudy-02',
    category: 'full-sphere',
    label: 'Cloudy 02 — Warm Golden Morning Haze',
    shortLabel: 'SBS #02 Morning Gold',
    path: '/assets/arena/skyboxes/full-sphere/Panorama_Sky_02.webp',
    resolution: '2048×1024 WebP',
    sunAzimuthHintDeg: 87,
    sunElevationHintDeg: 26,
  },
  {
    id: 'sbs-cloudy-03',
    category: 'full-sphere',
    label: 'Cloudy 03 — Soft Amber Horizon Sunset',
    shortLabel: 'SBS #03 Amber Sunset',
    path: '/assets/arena/skyboxes/full-sphere/Panorama_Sky_03.webp',
    resolution: '2048×1024 WebP',
    sunAzimuthHintDeg: 89,
    sunElevationHintDeg: 11,
  },
  {
    id: 'sbs-cloudy-04',
    category: 'full-sphere',
    label: 'Cloudy 04 — Bright Azure Day & Cumulus',
    shortLabel: 'SBS #04 Azure Day',
    path: '/assets/arena/skyboxes/full-sphere/Panorama_Sky_04.webp',
    resolution: '2048×1024 WebP',
    sunAzimuthHintDeg: 91,
    sunElevationHintDeg: 27,
  },
  {
    id: 'sbs-cloudy-05',
    category: 'full-sphere',
    label: 'Cloudy 05 — Crisp Blue Sky & Scattered Clouds',
    shortLabel: 'SBS #05 Crisp Blue',
    path: '/assets/arena/skyboxes/full-sphere/Panorama_Sky_05.webp',
    resolution: '2048×1024 WebP',
    sunAzimuthHintDeg: 89,
    sunElevationHintDeg: 27,
  },
  {
    id: 'sbs-cloudy-06',
    category: 'full-sphere',
    label: 'Cloudy 06 — Clear High-Altitude Blue Horizon',
    shortLabel: 'SBS #06 Clear Blue',
    path: '/assets/arena/skyboxes/full-sphere/Panorama_Sky_06.webp',
    resolution: '2048×1024 WebP',
    sunAzimuthHintDeg: 89,
    sunElevationHintDeg: 28,
  },
  {
    id: 'sbs-cloudy-07',
    category: 'full-sphere',
    label: 'Cloudy 07 — Lavender Violet Evening Clouds',
    shortLabel: 'SBS #07 Lavender Eve',
    path: '/assets/arena/skyboxes/full-sphere/Panorama_Sky_07.webp',
    resolution: '2048×1024 WebP',
    sunAzimuthHintDeg: 89,
    sunElevationHintDeg: 21,
  },
  {
    id: 'sbs-cloudy-08',
    category: 'full-sphere',
    label: 'Cloudy 08 — Cool Silver-Blue Overcast',
    shortLabel: 'SBS #08 Silver Blue',
    path: '/assets/arena/skyboxes/full-sphere/Panorama_Sky_08.webp',
    resolution: '2048×1024 WebP',
    sunAzimuthHintDeg: 90,
    sunElevationHintDeg: 23,
  },
  {
    id: 'sbs-cloudy-09',
    category: 'full-sphere',
    label: 'Cloudy 09 — Dramatic Dark Clouds & Gold Rim',
    shortLabel: 'SBS #09 Storm Gold',
    path: '/assets/arena/skyboxes/full-sphere/Panorama_Sky_09.webp',
    resolution: '2048×1024 WebP',
    sunAzimuthHintDeg: 92,
    sunElevationHintDeg: 33,
  },
  {
    id: 'sbs-cloudy-10',
    category: 'full-sphere',
    label: 'Cloudy 10 — Misty Slate Teal High Sun',
    shortLabel: 'SBS #10 Misty Slate',
    path: '/assets/arena/skyboxes/full-sphere/Panorama_Sky_10.webp',
    resolution: '2048×1024 WebP',
    sunAzimuthHintDeg: 90,
    sunElevationHintDeg: 50,
  },
  {
    id: 'sbs-cloudy-11',
    category: 'full-sphere',
    label: 'Cloudy 11 — Deep Purple Twilight Moon',
    shortLabel: 'SBS #11 Purple Night',
    path: '/assets/arena/skyboxes/full-sphere/Panorama_Sky_11.webp',
    resolution: '2048×1024 WebP',
    sunAzimuthHintDeg: 89,
    sunElevationHintDeg: 36,
  },
  {
    id: 'sbs-cloudy-12',
    category: 'full-sphere',
    label: 'Cloudy 12 — Midnight Indigo Low Moon',
    shortLabel: 'SBS #12 Indigo Night',
    path: '/assets/arena/skyboxes/full-sphere/Panorama_Sky_12.webp',
    resolution: '2048×1024 WebP',
    sunAzimuthHintDeg: 89,
    sunElevationHintDeg: 12,
  },
  {
    id: 'sbs-cloudy-13',
    category: 'full-sphere',
    label: 'Cloudy 13 — Sepia Sandstorm & Warm Haze',
    shortLabel: 'SBS #13 Desert Haze',
    path: '/assets/arena/skyboxes/full-sphere/Panorama_Sky_13.webp',
    resolution: '2048×1024 WebP',
    sunAzimuthHintDeg: 89,
    sunElevationHintDeg: 26,
  },
  {
    id: 'sbs-cloudy-14',
    category: 'full-sphere',
    label: 'Cloudy 14 — Emerald Aurora Green Mist',
    shortLabel: 'SBS #14 Emerald Mist',
    path: '/assets/arena/skyboxes/full-sphere/Panorama_Sky_14.webp',
    resolution: '2048×1024 WebP',
    sunAzimuthHintDeg: 90,
    sunElevationHintDeg: 18,
  },
  {
    id: 'sbs-cloudy-15',
    category: 'full-sphere',
    label: 'Cloudy 15 — Dark Eclipse Night & Amber Orb',
    shortLabel: 'SBS #15 Eclipse Night',
    path: '/assets/arena/skyboxes/full-sphere/Panorama_Sky_15.webp',
    resolution: '2048×1024 WebP',
    sunAzimuthHintDeg: 89,
    sunElevationHintDeg: 22,
  },
  {
    id: 'sbs-cloudy-16',
    category: 'full-sphere',
    label: 'Cloudy 16 — Periwinkle Billowing Cumulus',
    shortLabel: 'SBS #16 Periwinkle',
    path: '/assets/arena/skyboxes/full-sphere/Panorama_Sky_16.webp',
    resolution: '2048×1024 WebP',
    sunAzimuthHintDeg: 86,
    sunElevationHintDeg: 29,
  },
  {
    id: 'sbs-cloudy-17',
    category: 'full-sphere',
    label: 'Cloudy 17 — Magenta Dusk & Golden Sun',
    shortLabel: 'SBS #17 Magenta Dusk',
    path: '/assets/arena/skyboxes/full-sphere/Panorama_Sky_17.webp',
    resolution: '2048×1024 WebP',
    sunAzimuthHintDeg: 89,
    sunElevationHintDeg: 17,
  },
  {
    id: 'sbs-cloudy-18',
    category: 'full-sphere',
    label: 'Cloudy 18 — Coastal Storm Horizon Break',
    shortLabel: 'SBS #18 Storm Break',
    path: '/assets/arena/skyboxes/full-sphere/Panorama_Sky_18.webp',
    resolution: '2048×1024 WebP',
    sunAzimuthHintDeg: 87,
    sunElevationHintDeg: 8,
  },
  {
    id: 'sbs-cloudy-19',
    category: 'full-sphere',
    label: 'Cloudy 19 — Soft Peach & Lavender Dawn',
    shortLabel: 'SBS #19 Peach Dawn',
    path: '/assets/arena/skyboxes/full-sphere/Panorama_Sky_19.webp',
    resolution: '2048×1024 WebP',
    sunAzimuthHintDeg: 90,
    sunElevationHintDeg: 28,
  },
  {
    id: 'sbs-cloudy-20',
    category: 'full-sphere',
    label: 'Cloudy 20 — Crimson Twilight & Dark Nimbus',
    shortLabel: 'SBS #20 Crimson Dusk',
    path: '/assets/arena/skyboxes/full-sphere/Panorama_Sky_20.webp',
    resolution: '2048×1024 WebP',
    sunAzimuthHintDeg: 89,
    sunElevationHintDeg: 22,
  },
  {
    id: 'sbs-cloudy-21',
    category: 'full-sphere',
    label: 'Cloudy 21 — Turquoise Lagoon Clear Sky',
    shortLabel: 'SBS #21 Lagoon Sky',
    path: '/assets/arena/skyboxes/full-sphere/Panorama_Sky_21.webp',
    resolution: '2048×1024 WebP',
    sunAzimuthHintDeg: 89,
    sunElevationHintDeg: 28,
  },
  {
    id: 'sbs-cloudy-22',
    category: 'full-sphere',
    label: 'Cloudy 22 — Heavy Storm Grey & Bright Break',
    shortLabel: 'SBS #22 Heavy Storm',
    path: '/assets/arena/skyboxes/full-sphere/Panorama_Sky_22.webp',
    resolution: '2048×1024 WebP',
    sunAzimuthHintDeg: 90,
    sunElevationHintDeg: 28,
  },
  {
    id: 'sbs-cloudy-23',
    category: 'full-sphere',
    label: 'Cloudy 23 — Warm Terracotta Red Sunset',
    shortLabel: 'SBS #23 Red Sunset',
    path: '/assets/arena/skyboxes/full-sphere/Panorama_Sky_23.webp',
    resolution: '2048×1024 WebP',
    sunAzimuthHintDeg: 89,
    sunElevationHintDeg: 18,
  },
  {
    id: 'sbs-cloudy-24',
    category: 'full-sphere',
    label: 'Cloudy 24 — Pale Arctic Winter Overcast',
    shortLabel: 'SBS #24 Arctic Mist',
    path: '/assets/arena/skyboxes/full-sphere/Panorama_Sky_24.webp',
    resolution: '2048×1024 WebP',
    sunAzimuthHintDeg: 89,
    sunElevationHintDeg: 29,
  },
  {
    id: 'sbs-cloudy-25',
    category: 'full-sphere',
    label: 'Cloudy 25 — Deep Space Nebula & Starlight',
    shortLabel: 'SBS #25 Star Nebula',
    path: '/assets/arena/skyboxes/full-sphere/Panorama_Sky_25.webp',
    resolution: '2048×1024 WebP',
    sunAzimuthHintDeg: 90,
    sunElevationHintDeg: 35,
  },
];

export const SKYBOX_PRESETS: SkyboxPresetSpec[] = [
  ...HEMISPHERE_SKYBOX_PRESETS,
  ...FULL_SPHERE_SKYBOX_PRESETS,
];

export function getPresetsByCategory(category: SkyboxCategory | string = 'hemisphere'): SkyboxPresetSpec[] {
  return category === 'full-sphere' ? FULL_SPHERE_SKYBOX_PRESETS : HEMISPHERE_SKYBOX_PRESETS;
}

export function resolveSkyboxPreset(
  presetIdOrPath: string | null | undefined,
  preferredCategory: SkyboxCategory | string | null = null
): SkyboxPresetSpec {
  if (presetIdOrPath) {
    const found = SKYBOX_PRESETS.find(
      (p) => p.id === presetIdOrPath || p.path === presetIdOrPath
    );
    if (found) return found;
  }
  if (preferredCategory === 'full-sphere') {
    return FULL_SPHERE_SKYBOX_PRESETS[3] || FULL_SPHERE_SKYBOX_PRESETS[0];
  }
  return HEMISPHERE_SKYBOX_PRESETS[4] || HEMISPHERE_SKYBOX_PRESETS[0];
}
