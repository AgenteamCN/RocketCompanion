import React from 'react';
import {
  Barrel,
  FileVideoCamera,
  Play,
  Stone,
  UsersRoundCollaboration,
} from 'lucide-react';
import type { StandardSurfaceProps, SurfaceMeta } from '../manifest/surfaceMetaTypes';
import { resolveCalibratedSurfaceSizing } from '../manifest/surfaceCalibration';
import { PanelContainer, PanelHeader, PanelContent } from '../layout/Panel';
import { PanelFooter } from '../layout/PanelFooter';
import { MenuContainer } from '../layout/MenuContainer';
import { MainMenuRow } from '../layout/MainMenuRow';
import { useAppStore } from '../stores/appStore';
import { floatingStore } from '../stores/floatingStore';
import {
  REPLAY_VIEWER_PRESET,
  REWINDER_CONFIGURATOR_PRESET,
} from '../stores/floatingPresets';
import {
  useMainMenuStyleStore,
  type MainMenuItemSlotId,
} from '../stores/mainMenuStyleStore';
import { useMenuLayoutStore } from '../stores/menuLayoutStore';
import { useRewinderStore } from '../stores/rewinderStore';
import { useScopedStore } from '../stores/storeSnapshotScope';

export type SelfTrainingModeId =
  | 'free-play'
  | 'static-training-pack'
  | 'dynamic-training-pack'
  | 'kickoff-training'
  | 'replay-viewer';

export interface SelfTrainingOption {
  id: SelfTrainingModeId;
  slotId: MainMenuItemSlotId;
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  variant?: 'primary' | 'secondary';
  hasArrow?: boolean;
  disabled?: boolean;
}

export const SELF_TRAINING_OPTIONS: SelfTrainingOption[] = [
  {
    id: 'free-play',
    slotId: 'resume',
    title: 'Free Play',
    subtitle: 'Unlimited boost solo arena with instant ball reset & trajectory lines',
    icon: <Play className="h-5 w-5" />,
    variant: 'primary',
    hasArrow: false,
  },
  {
    id: 'static-training-pack',
    slotId: 'play',
    title: 'Static Training Pack',
    subtitle: 'Browse, import, and practice .RCSPack custom shot sequences',
    icon: <Stone className="h-5 w-5" />,
    hasArrow: true,
  },
  {
    id: 'dynamic-training-pack',
    slotId: 'garage',
    title: 'Dynamic Training Pack',
    subtitle: 'Adaptive multi-agent scenarios with reactive bot passes and defense',
    icon: <UsersRoundCollaboration className="h-5 w-5" />,
    hasArrow: false,
    disabled: true,
  },
  {
    id: 'kickoff-training',
    slotId: 'settings',
    title: 'Kickoff Training',
    subtitle: '5 regulation spawn slots with 120Hz rhythm highway & PPO mirror bot',
    icon: <Barrel className="h-5 w-5" />,
    hasArrow: true,
  },
  {
    id: 'replay-viewer',
    slotId: 'play',
    title: 'Replay Viewer',
    subtitle: 'Multi-track timeline scrubbing, POV switching & TAS take-over',
    icon: <FileVideoCamera className="h-5 w-5" />,
    hasArrow: true,
  },
];

export const SURFACE_META: SurfaceMeta = {
  id: 'recipe:Layer3SelfTrainingRecipe',
  title: 'Self-Training Hub',
  subtitle: 'Free Play, Static Training Packs, Kickoff Drills & Replay Viewer',
  description: 'Select a solo training discipline or replay analysis tool.',
  icon: 'Stone',
  layer: 'layer3',
  menuGroup: 'menu-layer',
  defaultSizing: {
    width: 500,
    height: 460,
    minHeight: 200,
    maxHeight: 960,
    mode: 'adaptive',
  },
};

export interface Layer3SelfTrainingRecipeProps extends StandardSurfaceProps {}

/**
 * [Recipe] Layer 3 Self-Training Hub
 * Vertically stacked menu rows matching Layer 1 Main Menu style:
 * 1. Free Play (`Play` right arrow icon)
 * 2. Static Training Pack (`Stone` / `stone`)
 * 3. Dynamic Training Pack (`UsersRoundCollaboration` / `users-round-collaboration`)
 * 4. Kickoff Training (`Barrel` / `barrel`)
 * 5. Replay Viewer (`FileVideoCamera` / `file-video-camera`)
 *
 * Store-First contract (`StandardSurfaceProps` <= 4 props), reading directly from
 * `useAppStore` and `useRewinderStore` via `useScopedStore`.
 */
export const Layer3SelfTrainingRecipe: React.FC<Layer3SelfTrainingRecipeProps> = React.memo(({
  isLight = true,
  onTabChange,
  onBack: propOnBack,
}) => {
  const storeGoBack = useScopedStore('appStore', useAppStore, (s) => s.goBack);
  const navigate = useScopedStore('appStore', useAppStore, (s) => s.navigate);
  const closeMenu = useScopedStore('appStore', useAppStore, (s) => s.closeMenu);
  const setMatchMode = useScopedStore('appStore', useAppStore, (s) => s.setMatchMode);
  const bridge = useScopedStore('appStore', useAppStore, (s) => s.bridge);
  const rewinderWindowOpen = useScopedStore(
    'rewinderStore',
    useRewinderStore,
    (s) => s.rewinderWindowOpen
  );

  const onBack = propOnBack ?? storeGoBack;

  const handleSelectMode = (mode: SelfTrainingModeId) => {
    if (mode === 'dynamic-training-pack') {
      return;
    }
    if (onTabChange) {
      onTabChange(mode);
      return;
    }
    if (mode === 'free-play') {
      setMatchMode('freeplay');
      closeMenu();
      bridge.onReturnToFreeplay?.();
      if (rewinderWindowOpen) {
        floatingStore.spawnWindow({
          ...REWINDER_CONFIGURATOR_PRESET,
          startMinimized: true,
        });
      }
      return;
    }
    if (mode === 'static-training-pack') {
      navigate('static-training-pack');
      return;
    }
    if (mode === 'kickoff-training') {
      navigate('kickoff-training');
      return;
    }
    if (mode === 'replay-viewer') {
      setMatchMode('replay-viewer');
      closeMenu();
      if (bridge.onStartReplayViewer) {
        bridge.onStartReplayViewer();
      } else {
        floatingStore.spawnWindow({
          ...REPLAY_VIEWER_PRESET,
          startMinimized: false,
        });
      }
    }
  };

  const storeSizing = useScopedStore(
    'menuLayoutStore',
    useMenuLayoutStore,
    (s) => s.panels['layer3-self-training']
  );
  const calibratedSizing = resolveCalibratedSurfaceSizing(
    SURFACE_META.id,
    SURFACE_META.defaultSizing
  );
  const sizing = storeSizing ?? {
    mode: calibratedSizing.mode === 'fixed' ? 'fixed' : 'auto',
    width: calibratedSizing.width,
    targetHeight: typeof calibratedSizing.height === 'number' ? calibratedSizing.height : 460,
    minHeight: calibratedSizing.minHeight ?? 200,
    maxHeight: calibratedSizing.maxHeight ?? 960,
  };

  const menuStyle = useScopedStore('mainMenuStyleStore', useMainMenuStyleStore);

  return (
    <PanelContainer
      isLight={isLight}
      sizing={sizing}
      className="w-full select-none"
    >
      <PanelHeader
        isLight={isLight}
        title="SELF-TRAINING"
        onBack={onBack}
      />

      <PanelContent
        scrollable={true}
        style={{
          paddingLeft: `${menuStyle.contentPaddingXPx}px`,
          paddingRight: `${menuStyle.contentPaddingXPx}px`,
          paddingTop: `${menuStyle.contentPaddingYPx}px`,
          paddingBottom: `${menuStyle.contentPaddingYPx}px`,
        }}
      >
        <MenuContainer
          ariaLabel="Self-Training Menu"
          gapPx={menuStyle.itemGapPx}
          paddingPx={menuStyle.menuContainerPaddingPx}
        >
          {SELF_TRAINING_OPTIONS.map((opt) => (
            <MainMenuRow
              key={opt.id}
              slotId={opt.slotId}
              title={opt.title}
              subtitle={opt.subtitle}
              icon={opt.icon}
              variant={opt.variant ?? 'secondary'}
              hasArrow={opt.hasArrow}
              disabled={opt.disabled}
              isLight={isLight}
              styleVariant={menuStyle.variant}
              styleParams={menuStyle}
              onClick={() => {
                if (opt.disabled) return;
                handleSelectMode(opt.id);
              }}
            />
          ))}
        </MenuContainer>
      </PanelContent>

      <PanelFooter
        isLight={isLight}
        defaultDescription="Select a solo training discipline or replay analysis tool."
      />
    </PanelContainer>
  );
});

Layer3SelfTrainingRecipe.displayName = 'Layer3SelfTrainingRecipe';
export default Layer3SelfTrainingRecipe;
