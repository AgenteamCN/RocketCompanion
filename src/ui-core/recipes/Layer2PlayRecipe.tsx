import React, { useState } from 'react';
import { Bot, Server, Wifi, PencilRuler, BookOpen, SlidersHorizontal } from 'lucide-react';
import type { StandardSurfaceProps, SurfaceMeta } from '../manifest/surfaceMetaTypes';
import { PanelContainer, PanelHeader, PanelContent } from '../layout/Panel';
import { PanelFooter } from '../layout/PanelFooter';
import { PlayModeCard } from '../layout/PlayModeCard';
import { useAppStore } from '../stores/appStore';
import { useMenuLayoutStore } from '../stores/menuLayoutStore';
import {
  usePlayCardStyleStore,
  type PlayCardStyleParams,
  type PlayCardStyleVariant,
} from '../stores/playCardStyleStore';
import { useSignalingProfileStore } from '../stores/signalingProfileStore';
import {
  useScopedStore,
  useStoreSnapshotOverride,
} from '../stores/storeSnapshotScope';

export const SURFACE_META: SurfaceMeta = {
  id: 'recipe:Layer2PlayRecipe',
  title: 'Play Mode Selection',
  subtitle: '2x3 grid of match, online lobby, and training disciplines',
  icon: 'Gamepad2',
  layer: 'layer2',
  menuGroup: 'menu-layer',
  defaultSizing: {
    width: 680,
    minHeight: 340,
    maxHeight: 520,
    mode: 'adaptive',
  },
};

export interface Layer2PlayRecipeProps extends StandardSurfaceProps {
  className?: string;
}

interface Layer2PlayScopedAppOverrides {
  onSelectMode?: (modeId: string) => void;
  onSelectExhibition?: () => void;
  onSelectHostMatch?: () => void;
  onSelectJoinRoom?: () => void;
  onSelectSelfTraining?: () => void;
}

export interface PlayModeDef {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  icon: React.ReactNode;
  category: 'Match' | 'Training';
  badge: string;
  disabled?: boolean;
}

export const PLAY_MODES: PlayModeDef[] = [
  // Row 1: Exhibition | Host Match | Join Room
  {
    id: 'exhibition',
    title: 'Exhibition',
    subtitle: '1v1 / 2v2 / 3v3 scrimmage against Nexto & Necto RLBot policies',
    description:
      'Exhibition Match: Configure Solo 1v1, Double 2v2, or Standard 3v3 against Nexto or Necto AI policies.',
    icon: <Bot className="h-5 w-5 text-rose-500" />,
    category: 'Match',
    badge: '1v1 · 2v2 · 3v3',
  },
  {
    id: 'host-match',
    title: 'Host Match',
    subtitle: 'Create an authoritative 120Hz online lobby with custom ruleset',
    description:
      'Host Match (Layer 3): Configure Session Mode, Team Format, Bot Fill Policy, and Regulation Duration.',
    icon: <Server className="h-5 w-5 text-neutral-500 dark:text-neutral-400" />,
    category: 'Match',
    badge: 'Host Lobby',
  },
  {
    id: 'join-room',
    title: 'Join Room',
    subtitle: 'Connect to an existing peer-to-peer room code via WebRTC',
    description:
      'Join Room (Layer 3): Enter a 4-digit or custom room code, pick your entry role, and connect at 120Hz.',
    icon: <Wifi className="h-5 w-5 text-emerald-500" />,
    category: 'Match',
    badge: 'WebRTC Client',
  },
  // Row 2: Self-Training | Host Training | Custom
  {
    id: 'self-training',
    title: 'Self-Training',
    subtitle: 'Free Play sandbox, Static Training Packs, Kickoff AI & Replay Viewer',
    description:
      'Self-Training Hub (Layer 3): Choose between Free Play, Static Training Packs (.RCSPack), Kickoff Training, and Replay Viewer.',
    icon: <PencilRuler className="h-5 w-5 text-amber-500" />,
    category: 'Training',
    badge: 'Solo Hub',
  },
  {
    id: 'online-training',
    title: 'Host Training',
    subtitle: 'Shared warmup arena with party members & live collisions',
    description:
      'Host Training: Shared multiplayer free play arena without regulation timer.',
    icon: <BookOpen className="h-5 w-5 text-sky-500" />,
    category: 'Training',
    badge: 'Co-Op Warmup',
  },
  {
    id: 'advanced',
    title: 'Custom',
    subtitle: 'Experimental Multi-Bots (up to 3v3), mutators & physics sandboxes',
    description:
      'Custom Mode: Configure up to 3v3 Experimental Multi-Bots, custom mutators, and simulation speed.',
    icon: <SlidersHorizontal className="h-5 w-5 text-purple-500" />,
    category: 'Training',
    badge: 'Coming Soon',
    disabled: true,
  },
];

/**
 * [Recipe] Layer 2 Play / Mode Selection Menu
 * Store-First direct connection with `<StoreSnapshotScope>` support and 4-prop shell contract.
 */
export const Layer2PlayRecipe: React.FC<Layer2PlayRecipeProps> = ({
  isLight = false,
  onTabChange,
  onBack,
  className = '',
}) => {
  const navigate = useScopedStore('appStore', useAppStore, (s) => s.navigate);
  const goBack = useScopedStore('appStore', useAppStore, (s) => s.goBack);
  const appOverrides = useStoreSnapshotOverride<Layer2PlayScopedAppOverrides>('appStore');

  const sizing = useScopedStore(
    'menuLayoutStore',
    useMenuLayoutStore,
    (s) => s.panels['layer2-play']
  );
  const storeCardStyle = usePlayCardStyleStore();
  const cardStyleOverrides = useStoreSnapshotOverride<PlayCardStyleParams>('playCardStyleStore');

  const signalingSource = useScopedStore(
    'signalingProfileStore',
    useSignalingProfileStore,
    (s) => s.source
  );
  const signalingShortHash = useScopedStore(
    'signalingProfileStore',
    useSignalingProfileStore,
    (s) => s.shortHash
  );
  const [hoveredDesc, setHoveredDesc] = useState<string | null>(null);

  const mergedCardParams: PlayCardStyleParams = {
    ...storeCardStyle,
    ...(cardStyleOverrides || {}),
    cardIconColors: {
      ...storeCardStyle.cardIconColors,
      ...(cardStyleOverrides?.cardIconColors || {}),
    },
  };
  const activeVariant: PlayCardStyleVariant =
    cardStyleOverrides?.variant ?? storeCardStyle.variant;

  const handleCardClick = (modeId: string) => {
    if (modeId === 'exhibition' && appOverrides?.onSelectExhibition) {
      appOverrides.onSelectExhibition();
      return;
    }
    if (modeId === 'host-match' && appOverrides?.onSelectHostMatch) {
      appOverrides.onSelectHostMatch();
      return;
    }
    if (modeId === 'join-room' && appOverrides?.onSelectJoinRoom) {
      appOverrides.onSelectJoinRoom();
      return;
    }
    if (modeId === 'self-training' && appOverrides?.onSelectSelfTraining) {
      appOverrides.onSelectSelfTraining();
      return;
    }
    if (appOverrides?.onSelectMode) {
      appOverrides.onSelectMode(modeId);
      return;
    }
    if (onTabChange) {
      onTabChange(modeId);
      return;
    }
    if (modeId === 'exhibition') {
      navigate('exhibition');
    } else if (modeId === 'host-match') {
      useAppStore.getState().setOnlineSession({ roomType: 'match', gameMode: '1v1' });
      navigate('host-match');
    } else if (modeId === 'join-room') {
      useAppStore.getState().setOnlineSession({ roomType: 'match', gameMode: '1v1' });
      navigate('join-room');
    } else if (modeId === 'self-training') {
      navigate('self-training');
    } else if (modeId === 'online-training') {
      useAppStore.getState().setOnlineSession({ roomType: 'warmup', gameMode: '3v3' });
      navigate('host-training');
    } else if (modeId === 'advanced') {
      navigate('custom-play');
    }
  };

  return (
    <PanelContainer isLight={isLight} sizing={sizing} className={`w-full ${className}`.trim()}>
      <PanelHeader
        title="PLAY"
        onBack={onBack ?? goBack}
        isLight={isLight}
      />

      <PanelContent scrollable>
        <div
          className="grid grid-cols-1 md:grid-cols-3 w-full"
          style={{ gap: `${mergedCardParams.gridGapPx}px` }}
        >
          {PLAY_MODES.map((mode) => (
            <PlayModeCard
              key={mode.id}
              id={mode.id}
              title={mode.title}
              subtitle={mode.subtitle}
              badge={mode.badge}
              badgeVariant={mode.category === 'Match' ? 'primary' : 'warning'}
              icon={mode.icon}
              disabled={mode.disabled}
              isLight={isLight}
              variant={activeVariant}
              styleParams={mergedCardParams}
              onClick={handleCardClick}
              onMouseEnter={() => {
                const isOnlineCard = mode.id === 'host-match' || mode.id === 'join-room';
                const suffix = isOnlineCard
                  ? signalingSource === 'public'
                    ? ` (Active: Public Fallback #${signalingShortHash}, Unverified / No SLA)`
                    : ` (Active: ${signalingSource} #${signalingShortHash})`
                  : '';
                setHoveredDesc(`${mode.description}${suffix}`);
              }}
              onMouseLeave={() => setHoveredDesc(null)}
            />
          ))}
        </div>
      </PanelContent>

      <PanelFooter
        isLight={isLight}
        defaultDescription="Select game mode, online host/join lobby, or training discipline."
        hoveredDescription={hoveredDesc}
      />
    </PanelContainer>
  );
};
