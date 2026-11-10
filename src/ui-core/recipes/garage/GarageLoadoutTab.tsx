import React from 'react';
import {
  Disc,
  Flame,
  Sparkles,
  Volume2,
  Sun,
  Wand2,
} from 'lucide-react';
import type { SurfaceVariantMeta } from '../../manifest/surfaceMetaTypes';
import type { VisualMaterialsConfig } from '../../config/uiConfig';
import { SettingSegmentedRow } from '../../compounds/SettingSegmentedRow';
import { useAppStore } from '../../stores/appStore';
import { useSettingActionRowStore } from '../../stores/settingRowStore';
import { useScopedStore } from '../../stores/storeSnapshotScope';

export type { VisualMaterialsConfig };

export const SURFACE_VARIANT_META: SurfaceVariantMeta = {
  variantId: 'loadout',
  label: '3. Loadout & Visual FX',
  description:
    'Ball visual style, demolition FX, boost trail visual, 4 boost audio variations, and luminance.',
};

export const DEFAULT_VISUAL_MATERIALS: VisualMaterialsConfig = {
  ballStyle: 'football',
  carPaint: 'anodized',
  demolishedEffect: 'shockwave',
  boostVisual: 'gold-rush',
  boostAudio: 'rush',
  boostFlameLuminance: 'balanced',
  boostPlumeLuminance: 'balanced',
  paintFinish: 'metallic',
};

export interface GarageLoadoutTabProps {
  onHoverDesc?: (text: string | null) => void;
  isLight?: boolean;
}

export const GarageLoadoutTab: React.FC<GarageLoadoutTabProps> = ({
  onHoverDesc,
  isLight = false,
}) => {
  const { rowGap } = useSettingActionRowStore();
  const storeMaterials = useScopedStore('appStore', useAppStore, (s) => s.materials);
  const updateMaterials = useScopedStore('appStore', useAppStore, (s) => s.updateMaterials);

  const materials: VisualMaterialsConfig = {
    ...DEFAULT_VISUAL_MATERIALS,
    ...(storeMaterials || {}),
  };

  const setHoveredDesc = (desc: string) => onHoverDesc?.(desc);
  const onLeave = () => onHoverDesc?.(null);

  return (
    <div className="flex flex-col justify-between h-full flex-1 py-1" style={{ gap: `${rowGap}px` }}>
      <SettingSegmentedRow
        icon={Disc}
        iconColor="text-sky-400"
        title="Ball Style"
        value="football"
        onValueChange={() => {}}
        options={[{ value: 'football', label: 'Football' }]}
        disabled={true}
        isLight={isLight}
        onMouseEnter={() =>
          setHoveredDesc('Ball style is locked to the classic geodesic football.')
        }
        onMouseLeave={onLeave}
      />

      <SettingSegmentedRow
        icon={Flame}
        iconColor="text-rose-400"
        title="Demolition Effect"
        value="shockwave"
        onValueChange={() => {}}
        options={[{ value: 'shockwave', label: 'Shockwave' }]}
        disabled={true}
        isLight={isLight}
        onMouseEnter={() =>
          setHoveredDesc(
            'High-performance camera-facing radial shockwave ring with inner-hole burn-through and thermal color fade.'
          )
        }
        onMouseLeave={onLeave}
      />

      <SettingSegmentedRow
        icon={Sparkles}
        iconColor="text-amber-400"
        title="Boost Trail Effect"
        value={materials.boostVisual}
        onValueChange={(val) =>
          updateMaterials({ boostVisual: val as 'cartoon' | 'gold-rush' })
        }
        options={[
          { value: 'cartoon', label: 'Cartoon' },
          { value: 'gold-rush', label: 'Gold Rush' },
        ]}
        isLight={isLight}
        onMouseEnter={() =>
          setHoveredDesc(
            'Selects personal rocket booster particle and trail rendering style (Cartoon vs Gold Rush).'
          )
        }
        onMouseLeave={onLeave}
      />

      <SettingSegmentedRow
        icon={Volume2}
        iconColor="text-emerald-400"
        title="Boosted Audio Effect"
        value={materials.boostAudio ?? 'rush'}
        onValueChange={(val) =>
          updateMaterials({
            boostAudio: val as 'rush' | 'standard' | 'flamethrower' | 'plasma',
          })
        }
        options={[
          { value: 'rush', label: 'Gold Rush' },
          { value: 'standard', label: 'Standard' },
          { value: 'flamethrower', label: 'Flame Thrower' },
          { value: 'plasma', label: 'Plasma' },
        ]}
        isLight={isLight}
        onMouseEnter={() =>
          setHoveredDesc(
            'Selects personal boost audio preset across ignition, sustain loop, and release phases (Preset All).'
          )
        }
        onMouseLeave={onLeave}
      />

      <SettingSegmentedRow
        icon={Sun}
        iconColor="text-orange-400"
        title="Boost Flame Luminance"
        value={materials.boostFlameLuminance}
        onValueChange={(val) =>
          updateMaterials({
            boostFlameLuminance: val as 'balanced' | 'dynamic',
          })
        }
        options={[
          { value: 'balanced', label: 'Balanced (1.0x)' },
          { value: 'dynamic', label: 'Dynamic Angle' },
        ]}
        disabled={materials.boostVisual !== 'gold-rush'}
        isLight={isLight}
        onMouseEnter={() =>
          setHoveredDesc(
            materials.boostVisual === 'gold-rush'
              ? 'Adjusts vehicle nozzle flame intensity: Balanced steady 1.0x vs original perspective Dynamic.'
              : 'Flame luminance is locked to balanced preset when using Cartoon boost.'
          )
        }
        onMouseLeave={onLeave}
      />

      <SettingSegmentedRow
        icon={Wand2}
        iconColor="text-purple-400"
        title="Gold Rush Plume Luminance"
        value={materials.boostPlumeLuminance}
        onValueChange={(val) =>
          updateMaterials({
            boostPlumeLuminance: val as 'min' | 'balanced' | 'dynamic' | 'hdr',
          })
        }
        options={[
          { value: 'min', label: 'Minimum' },
          { value: 'balanced', label: 'Balanced' },
          { value: 'dynamic', label: 'Dynamic' },
          { value: 'hdr', label: 'Vivid HDR' },
        ]}
        disabled={materials.boostVisual !== 'gold-rush'}
        isLight={isLight}
        onMouseEnter={() =>
          setHoveredDesc(
            materials.boostVisual === 'gold-rush'
              ? 'Adjusts Gold Rush exhaust plume and spark particle luminance: Minimum, Balanced 1.0x, Dynamic angle, or Vivid HDR.'
              : 'Plume luminance is locked to balanced preset when using Cartoon boost.'
          )
        }
        onMouseLeave={onLeave}
      />
    </div>
  );
};
