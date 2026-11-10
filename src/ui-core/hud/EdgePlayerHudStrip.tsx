import React, { useRef, forwardRef, useImperativeHandle } from 'react';
import {
  type EdgeDemoIndicatorConfig,
  type EdgeSkipIndicatorConfig,
  type EdgePlayerSlotState,
  type EdgeRosterHudState,
  type HudRosterViewMode,
  type RosterTransientListener,
} from '../stores/hudTransientTypes';
import {
  EdgePlayerSlotCard,
  type EdgePlayerSlotCardHandle,
} from './EdgePlayerSlotCard';

export type { EdgePlayerSlotCardHandle };

export interface EdgePlayerHudStripHandle {
  /** Imperatively push roster state to DOM refs with zero React re-renders */
  setRoster: (roster: EdgeRosterHudState) => void;
}

export interface EdgePlayerHudStripProps {
  /** Which screen edge this vertical player stack attaches to */
  side: 'left' | 'right';
  /** Optional viewMode override (falls back to roster.viewMode or 'player-live') */
  viewMode?: HudRosterViewMode;
  players?: EdgePlayerSlotState[];
  /** Team color for this side (default: left = Blue #2563EB, right = Orange #EA580C) */
  teamColor?: string;
  /** Progress bar fill color (default: bright team accent) */
  barColor?: string;
  /** Light/Dark theme for default (unfocused) card surface */
  isLight?: boolean;
  /**
   * Optional demolished indicator configuration override (Bomb SVG vs Red Cross, strokeWidth, color, glow).
   * Merges over `roster.demoIndicatorConfig` when provided.
   */
  demoIndicatorConfig?: Partial<EdgeDemoIndicatorConfig>;
  /**
   * Optional replay skip / auxiliary extension card configuration override.
   * Merges over `roster.skipIndicatorConfig` when provided.
   */
  skipIndicatorConfig?: Partial<EdgeSkipIndicatorConfig>;
  /** Optional callback when user clicks a card or presses 1-6 to switch POV */
  onSelectSlot?: (slotKey: 1 | 2 | 3 | 4 | 5 | 6) => void;
  /**
   * High-efficiency Transient Channel subscription (0 React re-renders).
   * Updates card transforms, POV highlight, demolished indicator & 3s countdown bar, and 120Hz boost via DOM refs.
   */
  subscribeRoster?: (listener: RosterTransientListener) => () => void;
  className?: string;
}

const TEAM_SLOT_INDICES = [0, 1, 2, 3, 4] as const;

const EdgePlayerHudStripInner = forwardRef<EdgePlayerHudStripHandle, EdgePlayerHudStripProps>(
  (
    {
      side,
      viewMode,
      players,
      teamColor = side === 'left' ? '#2563EB' : '#EA580C',
      barColor = side === 'left' ? '#3B82F6' : '#F97316',
      isLight = true,
      demoIndicatorConfig,
      skipIndicatorConfig,
      onSelectSlot,
      subscribeRoster,
      className = '',
    },
    ref
  ) => {
    const slotHandlesRef = useRef<Array<EdgePlayerSlotCardHandle | null>>([null, null, null, null, null]);

    useImperativeHandle(
      ref,
      () => ({
        setRoster: (roster: EdgeRosterHudState) => {
          for (const slotHandle of slotHandlesRef.current) {
            slotHandle?.setRoster(roster);
          }
        },
      }),
      []
    );

    return (
      <div
        data-alpha-id="Alpha:EdgePlayerHudStrip"
        data-ui-element={`hud-edge-player-strip-${side}`}
        className={`flex flex-col gap-2 select-none pointer-events-auto ${
          side === 'left' ? 'items-start' : 'items-end'
        } ${className}`}
        style={{ fontFamily: 'var(--font-jetbrains)' }}
      >
        {TEAM_SLOT_INDICES.map((slotIndex) => (
          <EdgePlayerSlotCard
            key={slotIndex}
            ref={(handle) => {
              slotHandlesRef.current[slotIndex] = handle;
            }}
            slotIndex={slotIndex}
            side={side}
            viewMode={viewMode}
            players={players}
            teamColor={teamColor}
            barColor={barColor}
            isLight={isLight}
            demoIndicatorConfig={demoIndicatorConfig}
            skipIndicatorConfig={skipIndicatorConfig}
            onSelectSlot={onSelectSlot}
            subscribeRoster={subscribeRoster}
          />
        ))}
      </div>
    );
  }
);

EdgePlayerHudStripInner.displayName = 'EdgePlayerHudStrip';

export const EdgePlayerHudStrip = React.memo(EdgePlayerHudStripInner);
