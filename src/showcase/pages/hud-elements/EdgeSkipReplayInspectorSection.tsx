import React, { useMemo } from 'react';
import { createScopedSyncedState } from '../../stores/crossClientSync';
import {
  DEFAULT_SKIP_INDICATOR_CONFIG,
  resolveSkipIndicatorConfig,
  type EdgeSkipIndicatorConfig,
  type EdgeSkipIndicatorVariant,
  type EdgePlayerSlotState,
  type HudRosterViewMode,
} from '../../../ui-core/stores/hudTransientTypes';
import { Badge } from '../../../ui-core/primitives/Badge';
import { SkipReplayStagePreview } from './SkipReplayStagePreview';
import { SkipReplayTunerControls } from './SkipReplayTunerControls';

const useState = createScopedSyncedState('hud-5a-2-skip-inspector');

export interface EdgeSkipReplayInspectorSectionProps {
  isLight: boolean;
}

const MIXED_SLOT_AUX_MAP: Record<
  1 | 2 | 3 | 4 | 5 | 6,
  { variant: EdgeSkipIndicatorVariant; color: string }
> = {
  1: { variant: 'check', color: '#10B981' },
  2: { variant: 'disconnect', color: '#EF4444' },
  3: { variant: 'packet-loss', color: '#F97316' },
  4: { variant: 'check', color: '#10B981' },
  5: { variant: 'latency', color: '#F59E0B' },
  6: { variant: 'waiting', color: '#38BDF8' },
};

export const EdgeSkipReplayInspectorSection: React.FC<EdgeSkipReplayInspectorSectionProps> =
  React.memo(({ isLight }) => {
    const [rawSkipCfg, setSkipCfg] = useState<EdgeSkipIndicatorConfig>(
      { ...DEFAULT_SKIP_INDICATOR_CONFIG },
      'skipCfgV2'
    );
    const skipCfg = resolveSkipIndicatorConfig(rawSkipCfg);
    const [viewMode, setViewMode] = useState<HudRosterViewMode>('goal-replay', 'viewMode');
    const [mixedAuxSlots, setMixedAuxSlots] = useState<boolean>(false, 'mixedAuxSlots');
    const [copiedJson, setCopiedJson] = useState<boolean>(false, 'copiedJson');
    const [skipSlots, setSkipSlots] = useState<Record<1 | 2 | 3 | 4 | 5 | 6, boolean>>(
      {
        1: true,
        2: false,
        3: true,
        4: true,
        5: true,
        6: false,
      },
      'skipSlots'
    );

    const updateSkipCfg = (patch: Partial<EdgeSkipIndicatorConfig>) => {
      setSkipCfg((prev) => resolveSkipIndicatorConfig(patch, resolveSkipIndicatorConfig(prev)));
    };

    const toggleSlotSkip = (k: 1 | 2 | 3 | 4 | 5 | 6) => {
      setSkipSlots((prev) => ({ ...prev, [k]: !prev[k] }));
    };

    const setAllSlotsSkip = (active: boolean) => {
      setSkipSlots({
        1: active,
        2: active,
        3: active,
        4: active,
        5: active,
        6: active,
      });
    };

    const handleSimulateGoalReplayStart = () => {
      setViewMode('goal-replay');
      setSkipSlots({ 1: true, 2: true, 3: true, 4: true, 5: true, 6: false });
    };

    const handleSimulateKickoffWillStart = () => {
      setViewMode('player-live');
      if (skipCfg.autoResetOnKickoff) {
        setAllSlotsSkip(false);
      }
    };

    const configJsonString = useMemo(
      () =>
        JSON.stringify(
          {
            variant: skipCfg.variant,
            color: skipCfg.color,
            sizePx: skipCfg.sizePx,
            strokeWidth: skipCfg.strokeWidth,
            glowBlurPx: skipCfg.glowBlurPx,
            glowIntensityPct: skipCfg.glowIntensityPct,
            protrudeWidthPx: skipCfg.protrudeWidthPx,
            underlapPx: skipCfg.underlapPx,
            cardRadiusPx: skipCfg.cardRadiusPx,
            iconOffsetXPx: skipCfg.iconOffsetXPx,
            enterDurationMs: skipCfg.enterDurationMs,
            exitDurationMs: skipCfg.exitDurationMs,
            autoResetOnKickoff: skipCfg.autoResetOnKickoff,
          },
          null,
          2
        ),
      [skipCfg]
    );

    const handleCopyConfigJson = () => {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        navigator.clipboard.writeText(configJsonString).catch(() => {});
      }
      setCopiedJson(true);
      setTimeout(() => setCopiedJson(false), 1800);
    };

    const leftPlayers = useMemo<EdgePlayerSlotState[]>(
      () => [
        {
          slotKey: 1,
          team: 'left',
          name: 'You (Octane_99)',
          boostAmount: 85,
          exists: true,
          isSelf: true,
          isFocusedPov: true,
          isDemolished: false,
          replaySkipReady: Boolean(skipSlots[1]),
          skipIndicatorVariant: mixedAuxSlots ? MIXED_SLOT_AUX_MAP[1].variant : undefined,
          skipIndicatorColor: mixedAuxSlots ? MIXED_SLOT_AUX_MAP[1].color : undefined,
        },
        {
          slotKey: 2,
          team: 'left',
          name: 'Zen_Master_RL',
          boostAmount: 42,
          exists: true,
          isSelf: false,
          isFocusedPov: false,
          isDemolished: false,
          replaySkipReady: Boolean(skipSlots[2]),
          skipIndicatorVariant: mixedAuxSlots ? MIXED_SLOT_AUX_MAP[2].variant : undefined,
          skipIndicatorColor: mixedAuxSlots ? MIXED_SLOT_AUX_MAP[2].color : undefined,
        },
        {
          slotKey: 3,
          team: 'left',
          name: 'Vatira_KC',
          boostAmount: 100,
          exists: true,
          isSelf: false,
          isFocusedPov: false,
          isDemolished: false,
          replaySkipReady: Boolean(skipSlots[3]),
          skipIndicatorVariant: mixedAuxSlots ? MIXED_SLOT_AUX_MAP[3].variant : undefined,
          skipIndicatorColor: mixedAuxSlots ? MIXED_SLOT_AUX_MAP[3].color : undefined,
        },
      ],
      [skipSlots, mixedAuxSlots]
    );

    const rightPlayers = useMemo<EdgePlayerSlotState[]>(
      () => [
        {
          slotKey: 4,
          team: 'right',
          name: 'Firstkiller_NA',
          boostAmount: 64,
          exists: true,
          isSelf: false,
          isFocusedPov: false,
          isDemolished: false,
          replaySkipReady: Boolean(skipSlots[4]),
          skipIndicatorVariant: mixedAuxSlots ? MIXED_SLOT_AUX_MAP[4].variant : undefined,
          skipIndicatorColor: mixedAuxSlots ? MIXED_SLOT_AUX_MAP[4].color : undefined,
        },
        {
          slotKey: 5,
          team: 'right',
          name: 'BeastMode_Fennec',
          boostAmount: 18,
          exists: true,
          isSelf: false,
          isFocusedPov: false,
          isDemolished: false,
          replaySkipReady: Boolean(skipSlots[5]),
          skipIndicatorVariant: mixedAuxSlots ? MIXED_SLOT_AUX_MAP[5].variant : undefined,
          skipIndicatorColor: mixedAuxSlots ? MIXED_SLOT_AUX_MAP[5].color : undefined,
        },
        {
          slotKey: 6,
          team: 'right',
          name: 'Daniel_SSG',
          boostAmount: 90,
          exists: true,
          isSelf: false,
          isFocusedPov: false,
          isDemolished: false,
          replaySkipReady: Boolean(skipSlots[6]),
          skipIndicatorVariant: mixedAuxSlots ? MIXED_SLOT_AUX_MAP[6].variant : undefined,
          skipIndicatorColor: mixedAuxSlots ? MIXED_SLOT_AUX_MAP[6].color : undefined,
        },
      ],
      [skipSlots, mixedAuxSlots]
    );

    return (
      <section
        id="hud-5a-2-skip-inspector"
        data-tuner-label="Skip Replay Config JSON"
        data-tuner-value={configJsonString}
        className="flex flex-col gap-4 scroll-mt-24"
      >
        <div className="flex items-center gap-2 border-b pb-2 border-neutral-200 dark:border-neutral-800 flex-wrap">
          <div className="h-6 px-1.5 rounded-md bg-emerald-500/10 text-emerald-500 flex items-center justify-center font-bold text-xs font-mono">
            5A.2++
          </div>
          <h2 className="text-base font-bold tracking-tight">
            EdgePlayerHudStrip · Skip Replay & Slot Extension Card Dedicated Workbench
          </h2>
          <Badge variant="emerald" size="sm" isLight={isLight}>
            Under-Card Border Tuck · Push/Retract Choreography · Multi-Icon
          </Badge>
          <span className="text-xs font-mono text-neutral-500">
            Default: #2 Emerald (#10B981) · 24px · weight 2.0 · Glow 6px · Exit {skipCfg.exitDurationMs}ms vs 300ms 1-3 Retract
          </span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
          <SkipReplayStagePreview
            isLight={isLight}
            viewMode={viewMode}
            skipCfg={skipCfg}
            leftPlayers={leftPlayers}
            rightPlayers={rightPlayers}
            copiedJson={copiedJson}
            handleSimulateGoalReplayStart={handleSimulateGoalReplayStart}
            handleSimulateKickoffWillStart={handleSimulateKickoffWillStart}
            setAllSlotsSkip={setAllSlotsSkip}
            toggleSlotSkip={toggleSlotSkip}
            handleCopyConfigJson={handleCopyConfigJson}
          />
          <SkipReplayTunerControls
            isLight={isLight}
            skipCfg={skipCfg}
            copiedJson={copiedJson}
            toggleSlotSkip={toggleSlotSkip}
            updateSkipCfg={updateSkipCfg}
            setSkipCfg={setSkipCfg}
            handleCopyConfigJson={handleCopyConfigJson}
          />
        </div>
      </section>
    );
  });

EdgeSkipReplayInspectorSection.displayName = 'EdgeSkipReplayInspectorSection';
