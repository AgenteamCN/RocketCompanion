import React, { useEffect, useRef, forwardRef, useImperativeHandle, useCallback } from 'react';
import {
  DEFAULT_INITIAL_ROSTER,
  type EdgeDemoIndicatorConfig,
  type EdgeSkipIndicatorConfig,
  type EdgePlayerSlotState,
  type EdgeRosterHudState,
  type HudRosterViewMode,
  type RosterTransientListener,
  resolveDemoIndicatorConfig,
  resolveSkipIndicatorConfig,
} from '../stores/hudTransientTypes';
import { globalHudTransientChannel } from '../stores/hudTransientChannel';
import {
  BombEmojiSvg,
  ReplaySkipCheckSvg,
  buildSvgDropShadowFilter,
} from '../primitives/svg/packagedSvgDefinitions';
import { KEY_BADGE_WIDTH_PX, computeSlotRanksForRoster, updateSkipBadgeDom, updateDemolishedReadoutDom, mergeRosterSidePlayers, updateSlotCardSurfaceAndBarDom } from './edgePlayerSlotMath';



export interface EdgePlayerSlotCardHandle {
  setRoster: (roster: EdgeRosterHudState) => void;
}

export interface EdgePlayerSlotCardProps {
  slotIndex: number;
  side: 'left' | 'right';
  viewMode?: HudRosterViewMode;
  players?: EdgePlayerSlotState[];
  teamColor?: string;
  barColor?: string;
  isLight?: boolean;
  demoIndicatorConfig?: Partial<EdgeDemoIndicatorConfig>;
  skipIndicatorConfig?: Partial<EdgeSkipIndicatorConfig>;
  onSelectSlot?: (slotKey: 1 | 2 | 3 | 4 | 5 | 6) => void;
  subscribeRoster?: (listener: RosterTransientListener) => () => void;
}

const EdgePlayerSlotCardInner = forwardRef<EdgePlayerSlotCardHandle, EdgePlayerSlotCardProps>(
  (
    {
      slotIndex,
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
    },
    ref
  ) => {
    const defaultKey = Math.min(
      6,
      Math.max(1, side === 'left' ? slotIndex + 1 : slotIndex + 4)
    ) as 1 | 2 | 3 | 4 | 5 | 6;
    const rowWrapRef = useRef<HTMLDivElement | null>(null);
    const cardRef = useRef<HTMLDivElement | null>(null);
    const skipClipWrapRef = useRef<HTMLDivElement | null>(null);
    const skipBadgeRef = useRef<HTMLDivElement | null>(null);
    const keyBadgeRef = useRef<HTMLDivElement | null>(null);
    const nameRef = useRef<HTMLSpanElement | null>(null);
    const selfTagRef = useRef<HTMLSpanElement | null>(null);
    const boostTextRef = useRef<HTMLSpanElement | null>(null);
    const demoCrossRef = useRef<HTMLSpanElement | null>(null);
    const demoBombWrapRef = useRef<HTMLSpanElement | null>(null);
    const barTrackRef = useRef<HTMLDivElement | null>(null);
    const barFillRef = useRef<HTMLDivElement | null>(null);
    const currentSlotKeyRef = useRef<1 | 2 | 3 | 4 | 5 | 6>(defaultKey);

    const defaultPlayers =
      players ??
      (side === 'left'
        ? DEFAULT_INITIAL_ROSTER.leftPlayers
        : DEFAULT_INITIAL_ROSTER.rightPlayers);
    const initialSlot = defaultPlayers[slotIndex];
    const isRight = side === 'right';

    const applySlotStateToDom = useCallback(
      (
        slot: EdgePlayerSlotState | undefined,
        currentMode: HudRosterViewMode,
        existingRank: number,
        visualRowIndex: number,
        resolvedDemoCfg: EdgeDemoIndicatorConfig,
        resolvedSkipCfg: EdgeSkipIndicatorConfig
      ) => {
        const rowWrapEl = rowWrapRef.current;
        const cardEl = cardRef.current;
        if (!cardEl || !rowWrapEl) return;

        if (!slot || slot.exists === false) {
          rowWrapEl.style.display = 'none';
          return;
        }
        rowWrapEl.style.display = 'flex';
        currentSlotKeyRef.current = slot.slotKey;

        const isDemo = Boolean(slot.isDemolished);
        const isReplayOrSpec = currentMode === 'goal-replay' || currentMode === 'spectator';
        const clampedBoost = Math.max(0, Math.min(100, Math.round(slot.boostAmount || 0)));

        updateSkipBadgeDom(
          skipClipWrapRef.current,
          skipBadgeRef.current,
          side,
          isLight,
          slot,
          resolvedSkipCfg
        );

        updateSlotCardSurfaceAndBarDom({
          rowWrapEl,
          cardEl,
          keyBadgeEl: keyBadgeRef.current,
          barTrackEl: barTrackRef.current,
          barFillEl: barFillRef.current,
          slot,
          side,
          isLight,
          teamColor,
          barColor,
          isReplayOrSpec,
          existingRank,
          visualRowIndex,
          resolvedDemoCfg,
          clampedBoost,
        });

        if (nameRef.current && nameRef.current.textContent !== slot.name) {
          nameRef.current.textContent = slot.name;
        }
        if (selfTagRef.current) {
          selfTagRef.current.style.display = slot.isSelf ? 'inline-block' : 'none';
        }

        updateDemolishedReadoutDom(
          isDemo,
          clampedBoost,
          resolvedDemoCfg,
          boostTextRef.current,
          demoCrossRef.current,
          demoBombWrapRef.current
        );
      },
      [side, teamColor, barColor, isLight]
    );

    const applyRoster = useCallback(
      (roster: EdgeRosterHudState) => {
        const list = side === 'left' ? roster.leftPlayers : roster.rightPlayers;
        const effectiveMode: HudRosterViewMode = viewMode ?? roster.viewMode ?? 'player-live';
        const isLiveRightCompact =
          side === 'right' &&
          effectiveMode === 'player-live' &&
          roster.opponentDemoCompact !== false;
        const resolvedDemoCfg = resolveDemoIndicatorConfig(
          demoIndicatorConfig,
          resolveDemoIndicatorConfig(roster.demoIndicatorConfig)
        );
        const resolvedSkipCfg = resolveSkipIndicatorConfig(
          skipIndicatorConfig,
          resolveSkipIndicatorConfig(roster.skipIndicatorConfig)
        );
        const { existingRank, demoVisualRank } = computeSlotRanksForRoster(
          list,
          slotIndex,
          isLiveRightCompact
        );
        applySlotStateToDom(
          list[slotIndex],
          effectiveMode,
          existingRank,
          demoVisualRank,
          resolvedDemoCfg,
          resolvedSkipCfg
        );
      },
      [side, slotIndex, viewMode, demoIndicatorConfig, skipIndicatorConfig, applySlotStateToDom]
    );

    useImperativeHandle(ref, () => ({ setRoster: applyRoster }), [applyRoster]);

    useEffect(() => {
      if (subscribeRoster) return subscribeRoster(applyRoster);
      const baseRoster = globalHudTransientChannel.getRoster();
      applyRoster({
        ...baseRoster,
        viewMode: viewMode ?? baseRoster.viewMode,
        leftPlayers:
          side === 'left'
            ? mergeRosterSidePlayers(baseRoster.leftPlayers, players)
            : baseRoster.leftPlayers,
        rightPlayers:
          side === 'right'
            ? mergeRosterSidePlayers(baseRoster.rightPlayers, players)
            : baseRoster.rightPlayers,
        demoIndicatorConfig: resolveDemoIndicatorConfig(
          demoIndicatorConfig,
          baseRoster.demoIndicatorConfig
        ),
        skipIndicatorConfig: resolveSkipIndicatorConfig(
          skipIndicatorConfig,
          baseRoster.skipIndicatorConfig
        ),
      });
    }, [
      subscribeRoster,
      applyRoster,
      players,
      viewMode,
      side,
      demoIndicatorConfig,
      skipIndicatorConfig,
    ]);

    const slotKey = initialSlot?.slotKey ?? defaultKey;
    const initShowSkip = Boolean(initialSlot?.replaySkipReady);
    const shapeClass =
      side === 'left'
        ? 'rounded-r-[9px] rounded-l-none'
        : 'rounded-l-[9px] rounded-r-none';
    const initialDemoCfg = resolveDemoIndicatorConfig(demoIndicatorConfig);
    const initialSkipCfg = resolveSkipIndicatorConfig(skipIndicatorConfig);
    const initUnderlapPx = Math.max(0, Math.round(initialSkipCfg.underlapPx ?? 20));
    const initProtrudePx = Math.max(20, Math.round(initialSkipCfg.protrudeWidthPx ?? 34));
    const initRadiusPx = Math.max(0, Math.round(initialSkipCfg.cardRadiusPx ?? 9));
    const innerLine = isLight ? 'rgba(0, 0, 0, 0.14)' : 'rgba(255, 255, 255, 0.14)';
    const outerRing = isLight ? 'rgba(115, 115, 115, 0.32)' : 'rgba(113, 113, 122, 0.55)';
    const outerSideInset =
      side === 'left' ? `inset -1px 0 0 0 ${innerLine}` : `inset 1px 0 0 0 ${innerLine}`;
    const initDemoFilter = buildSvgDropShadowFilter(
      initialDemoCfg.glowColor,
      initialDemoCfg.glowBlurPx,
      initialDemoCfg.glowIntensityPct
    );

    return (
      <div
        ref={rowWrapRef}
        data-alpha-id="Alpha:EdgePlayerSlotCard"
        className={`flex items-center gap-0 will-change-transform transition-[transform,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
          isRight ? 'flex-row-reverse' : 'flex-row'
        }`}
        style={{ display: initialSlot && initialSlot.exists !== false ? 'flex' : 'none' }}
      >
        <div
          ref={cardRef}
          onClick={() => onSelectSlot?.(currentSlotKeyRef.current)}
          title={`Press [${slotKey}] to observe ${initialSlot?.name ?? `Player ${slotKey}`}`}
          className={`group relative z-20 shrink-0 flex flex-col overflow-hidden cursor-pointer ${shapeClass}`}
          style={{ width: '196px' }}
        >
          <div
            className={`flex items-center h-[32px] w-full ${
              isRight ? 'flex-row-reverse' : 'flex-row'
            }`}
          >
            <div
              ref={keyBadgeRef}
              className={`flex items-center justify-center shrink-0 h-full text-[11px] font-normal tabular-nums ${
                isRight ? 'border-l' : 'border-r'
              } border-black/10 transition-colors duration-200`}
              style={{ width: `${KEY_BADGE_WIDTH_PX}px`, fontWeight: 400 }}
            >
              {slotKey}
            </div>
            <div
              className={`flex items-center gap-1 min-w-0 flex-1 ${
                isRight
                  ? 'flex-row-reverse pr-2.5 pl-1.5 justify-start'
                  : 'flex-row pl-2.5 pr-1.5 justify-start'
              }`}
            >
              <span
                ref={nameRef}
                className={`truncate text-[12px] leading-snug tracking-tight ${
                  isRight ? 'text-right' : 'text-left'
                }`}
                style={{ fontWeight: 400 }}
              >
                {initialSlot?.name ?? `Player ${slotKey}`}
              </span>
              <span
                ref={selfTagRef}
                className="shrink-0 px-1 py-[1px] rounded text-[8px] uppercase tracking-wider bg-black/20 text-current opacity-80"
                style={{ display: initialSlot?.isSelf ? 'inline-block' : 'none' }}
              >
                YOU
              </span>
            </div>
            <div
              className={`flex items-center shrink-0 ${
                isRight ? 'justify-start pl-2.5 pr-1' : 'justify-end pr-2.5 pl-1'
              }`}
            >
              <span
                ref={boostTextRef}
                className={`inline-block w-[3ch] text-[13px] leading-none tabular-nums tracking-tight ${
                  isRight ? 'text-left' : 'text-right'
                }`}
                style={{ fontWeight: 400 }}
              >
                {initialSlot?.boostAmount ?? 100}
              </span>
              <span
                ref={demoCrossRef}
                className={`items-center min-w-[3ch] overflow-visible text-[15px] leading-none font-bold ${
                  isRight ? 'justify-start text-left' : 'justify-end text-right'
                }`}
                style={{
                  display: 'none',
                  color: initialDemoCfg.color,
                  filter: initDemoFilter,
                }}
              >
                x
              </span>
              <span
                ref={demoBombWrapRef}
                className={`items-center min-w-[3ch] overflow-visible leading-none ${
                  isRight ? 'justify-start text-left' : 'justify-end text-right'
                }`}
                style={{
                  display: 'none',
                  color: initialDemoCfg.color,
                  filter: initDemoFilter,
                }}
              >
                <BombEmojiSvg
                  size={initialDemoCfg.sizePx}
                  color={initialDemoCfg.color}
                  strokeWidth={initialDemoCfg.strokeWidth}
                />
              </span>
            </div>
          </div>
          <div
            ref={barTrackRef}
            className="relative w-full h-[5px] bg-[#09090B] overflow-hidden"
          >
            <div
              ref={barFillRef}
              className={`h-full w-full ${
                isRight ? 'origin-right' : 'origin-left'
              } will-change-transform transition-colors duration-150`}
              style={{
                backgroundColor: barColor,
                transform: `scaleX(${((initialSlot?.boostAmount ?? 100) / 100).toFixed(3)})`,
              }}
            />
          </div>
        </div>
        <div
          ref={skipClipWrapRef}
          className="relative z-10 shrink-0 flex items-center"
          style={{
            marginLeft: side === 'left' ? `-${initUnderlapPx}px` : '0px',
            marginRight: side === 'right' ? `-${initUnderlapPx}px` : '0px',
            clipPath:
              side === 'left'
                ? 'inset(-4px -18px -4px 0px)'
                : 'inset(-4px 0px -4px -18px)',
          }}
        >
          <div
            ref={skipBadgeRef}
            data-ui-element={`hud-edge-player-skip-ready-${slotKey}`}
            title={`Player #${slotKey} Ready / Skip Goal Replay`}
            className="h-[37px] shrink-0 flex items-center justify-center will-change-transform transition-transform ease-[cubic-bezier(0.22,1,0.36,1)]"
            style={{
              width: `${initUnderlapPx + initProtrudePx}px`,
              paddingLeft: side === 'left' ? `${initUnderlapPx}px` : '0px',
              paddingRight: side === 'right' ? `${initUnderlapPx}px` : '0px',
              borderRadius:
                side === 'left'
                  ? `0px ${initRadiusPx}px ${initRadiusPx}px 0px`
                  : `${initRadiusPx}px 0px 0px ${initRadiusPx}px`,
              backgroundColor: isLight
                ? 'rgba(255, 255, 255, 0.98)'
                : 'rgba(20, 20, 25, 0.98)',
              boxShadow: `0 0 0 1.5px ${outerRing}, ${outerSideInset}, inset 0 1px 0 0 ${innerLine}, inset 0 -1px 0 0 ${innerLine}`,
              transitionDuration: `${
                initShowSkip
                  ? initialSkipCfg.enterDurationMs
                  : initialSkipCfg.exitDurationMs
              }ms`,
              transform: initShowSkip
                ? 'translate3d(0%, 0, 0)'
                : side === 'left'
                ? 'translate3d(-112%, 0, 0)'
                : 'translate3d(112%, 0, 0)',
              pointerEvents: initShowSkip ? 'auto' : 'none',
            }}
          >
            <ReplaySkipCheckSvg
              variant={initialSlot?.skipIndicatorVariant ?? initialSkipCfg.variant}
              size={initialSkipCfg.sizePx}
              color={initialSlot?.skipIndicatorColor ?? initialSkipCfg.color}
              strokeWidth={initialSkipCfg.strokeWidth}
              glowColor={initialSlot?.skipIndicatorColor ?? initialSkipCfg.glowColor}
              glowBlurPx={initialSkipCfg.glowBlurPx}
              glowIntensityPct={initialSkipCfg.glowIntensityPct}
              style={{
                transform:
                  initialSkipCfg.iconOffsetXPx !== 0 || initialSkipCfg.iconOffsetYPx !== 0
                    ? `translate3d(${initialSkipCfg.iconOffsetXPx}px, ${initialSkipCfg.iconOffsetYPx}px, 0)`
                    : undefined,
              }}
            />
          </div>
        </div>
      </div>
    );
  }
);

EdgePlayerSlotCardInner.displayName = 'EdgePlayerSlotCard';

export const EdgePlayerSlotCard = React.memo(EdgePlayerSlotCardInner);
