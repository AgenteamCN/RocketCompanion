import React, { useState } from 'react';
import { Shield, Paintbrush } from 'lucide-react';
import type { SurfaceVariantMeta } from '../../manifest/surfaceMetaTypes';
import type { StoredColorPrefs } from '../../config/uiConfig';
import {
  loadStoredColorPrefs,
  saveStoredColorPrefs,
} from '../../config/vehiclePresets';
import { SettingSegmentedRow } from '../../compounds/SettingSegmentedRow';
import {
  PriorityQueueList,
  PriorityQueueItem,
} from '../../compounds/tuner/PriorityQueueList';
import { useAppStore } from '../../stores/appStore';
import { useExperimentalMultiBotsStore } from '../../stores/experimentalMultiBotsStore';
import {
  useScopedStore,
  useStoreSnapshotOverride,
} from '../../stores/storeSnapshotScope';
import { BLUE_TEAM_COLORS, ORANGE_TEAM_COLORS } from './garageConstants';

export const SURFACE_VARIANT_META: SurfaceVariantMeta = {
  variantId: 'paint',
  label: '2. Paint & Team Priority',
  description:
    'Primary team preview, Matte/Metallic paint finish, and 6-slot Blue/Orange color preference order.',
};

export interface GaragePaintTabProps {
  onHoverDesc?: (desc: string | null) => void;
  isLight?: boolean;
}

interface GaragePaintScopedOverrides {
  primaryTeam?: 'blue' | 'orange';
  blueOrder?: number[];
  orangeOrder?: number[];
}

export const DEFAULT_BLUE_ORDER: number[] = [1, 5, 3];
export const DEFAULT_ORANGE_ORDER: number[] = [2, 4, 0];

export const GaragePaintTab: React.FC<GaragePaintTabProps> = ({
  onHoverDesc,
  isLight = false,
}) => {
  const paintFinish =
    useScopedStore('appStore', useAppStore, (s) => s.materials?.paintFinish) ?? 'metallic';
  const updateMaterials = useScopedStore('appStore', useAppStore, (s) => s.updateMaterials);
  const paintOverrides = useStoreSnapshotOverride<GaragePaintScopedOverrides>('appStore');

  const [colorPrefs, setColorPrefs] = useState<StoredColorPrefs>(() => {
    const stored = loadStoredColorPrefs();
    return {
      primaryTeam: stored.primaryTeam ?? 'blue',
      blueOrder: stored.blueOrder?.length ? stored.blueOrder : DEFAULT_BLUE_ORDER,
      orangeOrder: stored.orangeOrder?.length ? stored.orangeOrder : DEFAULT_ORANGE_ORDER,
    };
  });

  const primaryTeam = paintOverrides?.primaryTeam ?? colorPrefs.primaryTeam;
  const blueList = paintOverrides?.blueOrder ?? colorPrefs.blueOrder;
  const orangeList = paintOverrides?.orangeOrder ?? colorPrefs.orangeOrder;

  const saveAndBroadcastColors = (nextPrefs: StoredColorPrefs) => {
    setColorPrefs(nextPrefs);
    const activeSlotId = saveStoredColorPrefs(nextPrefs);
    useExperimentalMultiBotsStore.getState().syncExhibitionFromColorPrefs?.();
    const allColors = [...BLUE_TEAM_COLORS, ...ORANGE_TEAM_COLORS];
    const found = allColors.find((c) => c.id === activeSlotId);
    if (found) {
      const bridge = useAppStore.getState().bridge;
      bridge?.onColorChange?.(found.hex, found.id);
    }
  };

  const handlePrimaryTeamChange = (nextTeam: 'blue' | 'orange') => {
    saveAndBroadcastColors({ ...colorPrefs, primaryTeam: nextTeam });
  };

  const handlePaintFinishChange = (nextFinish: 'matte' | 'metallic') => {
    updateMaterials({ paintFinish: nextFinish });
  };

  const reorderTeamQueue = (
    team: 'blue' | 'orange',
    list: number[],
    index: number,
    direction: 'up' | 'down'
  ) => {
    const targetIdx = direction === 'up' ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= list.length) return;
    const next = [...list];
    const [removed] = next.splice(index, 1);
    next.splice(targetIdx, 0, removed);
    if (team === 'blue') {
      saveAndBroadcastColors({ ...colorPrefs, blueOrder: next });
    } else {
      saveAndBroadcastColors({ ...colorPrefs, orangeOrder: next });
    }
  };

  const blueQueueItems: PriorityQueueItem[] = blueList
    .slice(0, BLUE_TEAM_COLORS.length)
    .map((cId) => {
      const c = BLUE_TEAM_COLORS.find((item) => item.id === cId) || BLUE_TEAM_COLORS[0];
      return { id: String(c.id), name: c.name, hex: c.hex };
    });

  const orangeQueueItems: PriorityQueueItem[] = orangeList
    .slice(0, ORANGE_TEAM_COLORS.length)
    .map((cId) => {
      const c = ORANGE_TEAM_COLORS.find((item) => item.id === cId) || ORANGE_TEAM_COLORS[0];
      return { id: String(c.id), name: c.name, hex: c.hex };
    });

  return (
    <div className="flex flex-col gap-2" data-ui-element="garage-tab-colour">
      <SettingSegmentedRow
        icon={Shield}
        iconColor="text-sky-400"
        title="Primary Team Priority"
        value={primaryTeam}
        onValueChange={(v) => handlePrimaryTeamChange(v as 'blue' | 'orange')}
        options={[
          {
            value: 'blue',
            label: 'Blue Team',
            icon: <span className="h-2.5 w-2.5 rounded-full bg-blue-500 inline-block mr-1" />,
          },
          {
            value: 'orange',
            label: 'Orange Team',
            icon: <span className="h-2.5 w-2.5 rounded-full bg-orange-500 inline-block mr-1" />,
          },
        ]}
        isLight={isLight}
        onMouseEnter={() =>
          onHoverDesc?.(
            'Primary Team Priority: Freeplay training utilizes Top 1 priority of selected primary team.'
          )
        }
        onMouseLeave={() => onHoverDesc?.(null)}
      />

      <SettingSegmentedRow
        icon={Paintbrush}
        iconColor="text-amber-400"
        title="Vehicle Paint Finishes"
        value={paintFinish}
        onValueChange={(v) => handlePaintFinishChange(v as 'matte' | 'metallic')}
        options={[
          { value: 'matte', label: 'Matte' },
          { value: 'metallic', label: 'Metallic' },
        ]}
        isLight={isLight}
        onMouseEnter={() =>
          onHoverDesc?.(
            'Switches vehicle body finish between Matte (Metallic 0.50, Roughness 0.85) and Metallic (Metallic 0.70, Roughness 0.45).'
          )
        }
        onMouseLeave={() => onHoverDesc?.(null)}
      />

      <div className="grid grid-cols-2 gap-3.5 pt-1">
        <div
          onMouseEnter={() =>
            onHoverDesc?.(
              'Reorder Blue Team fallback palette priority (#1 Primary -> Fallback 1 -> Fallback 2).'
            )
          }
          onMouseLeave={() => onHoverDesc?.(null)}
        >
          <PriorityQueueList
            title="Blue Team Order"
            subtitle={primaryTeam === 'blue' ? 'Primary Choice' : 'Secondary Team'}
            items={blueQueueItems}
            onReorder={(idx, dir) => reorderTeamQueue('blue', blueList, idx, dir)}
            accentDotColor="#3b82f6"
            isLight={isLight}
          />
        </div>

        <div
          onMouseEnter={() =>
            onHoverDesc?.(
              'Reorder Orange Team fallback palette priority (#1 Primary -> Fallback 1 -> Fallback 2).'
            )
          }
          onMouseLeave={() => onHoverDesc?.(null)}
        >
          <PriorityQueueList
            title="Orange Team Order"
            subtitle={primaryTeam === 'orange' ? 'Primary Choice' : 'Secondary Team'}
            items={orangeQueueItems}
            onReorder={(idx, dir) => reorderTeamQueue('orange', orangeList, idx, dir)}
            accentDotColor="#f97316"
            isLight={isLight}
          />
        </div>
      </div>
    </div>
  );
};
