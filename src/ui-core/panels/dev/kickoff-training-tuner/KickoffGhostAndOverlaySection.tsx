import React from 'react';
import { Eye, Keyboard } from 'lucide-react';
import {
  useKickoffTrainingStore,
  KICKOFF_SPAWNS,
  type KickoffGhostPlacement,
} from '../../../stores/kickoffTrainingStore';
import { SegmentedSwitch } from '../../../primitives/SegmentedSwitch';
import { ToggleSwitch } from '../../../primitives/ToggleSwitch';

export interface KickoffGhostAndOverlaySectionProps {
  isLight?: boolean;
}

export const KickoffGhostAndOverlaySection: React.FC<
  KickoffGhostAndOverlaySectionProps
> = ({ isLight = false }) => {
  const {
    spawnIndex,
    ghostPlacement,
    ghostModeEnabled,
    showGhostCar,
    showGhostBall,
    showKeyboardOverlay,
    showFallingNotes,
    requiredKeyStr,
    setGhostPlacement,
    setGhostModeEnabled,
    setShowGhostCar,
    setShowGhostBall,
    setShowKeyboardOverlay,
    setShowFallingNotes,
  } = useKickoffTrainingStore();

  const cardBg = isLight
    ? 'bg-neutral-50/90 border-neutral-200 text-neutral-800'
    : 'bg-neutral-850/60 border-neutral-700/60 text-neutral-200';

  const subPanelBg = isLight
    ? 'bg-white border-neutral-200/90 text-neutral-800'
    : 'bg-neutral-950/50 border-neutral-800 text-neutral-200';

  const mutedText = isLight ? 'text-neutral-500' : 'text-neutral-400';

  return (
    <div className={`p-2.5 rounded-xl border flex flex-col gap-2 ${cardBg}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Eye className={`h-3.5 w-3.5 ${isLight ? 'text-sky-600' : 'text-sky-400'}`} />
          <span className="font-semibold text-[11px]">AI Ghost / Solid Opponent & Overlay</span>
        </div>
        <span className={`font-mono text-[10px] ${mutedText}`}>
          Target: {requiredKeyStr}
        </span>
      </div>

      {/* AI Spawn Side: Same Position (Default) vs Opposite Side */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between text-[10px]">
          <span className={`font-semibold ${mutedText}`}>AI Spawn Side</span>
          <span className={`font-mono ${mutedText}`}>
            {ghostPlacement === 'same'
              ? ghostModeEnabled
                ? 'Same Position (Overlap)'
                : `Mirror Partner (${KICKOFF_SPAWNS[spawnIndex]?.shortLabel} ↔ ${KICKOFF_SPAWNS[4 - spawnIndex]?.shortLabel})`
              : 'Opposite Half (180°)'}
          </span>
        </div>
        <SegmentedSwitch
          value={ghostPlacement}
          fullWidth
          size="sm"
          isLight={isLight}
          onValueChange={(val) => setGhostPlacement(val as KickoffGhostPlacement)}
          options={[
            { value: 'same', label: 'Same Position' },
            { value: 'opposite', label: 'Opposite Side' },
          ]}
        />
      </div>

      {/* Ghost Mode ON (Translucent) vs OFF (Solid Physical Collision Car) */}
      <div className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg border ${subPanelBg}`}>
        <div className="flex flex-col min-w-0 pr-2">
          <span className="text-[11px] font-semibold">
            {ghostModeEnabled ? 'Ghost Mode (No Collision)' : 'Solid Car Mode (Physical Collision)'}
          </span>
          <span className={`text-[9px] leading-snug truncate ${mutedText}`}>
            {ghostModeEnabled
              ? 'Translucent ghost car & ball in isolated world'
              : ghostPlacement === 'opposite'
              ? '1v1 physical kickoff: block/dunk or test slow kickoff'
              : 'Same-side physical kickoff (1↔5, 2↔4; pos 3 disabled)'}
          </span>
        </div>
        <ToggleSwitch
          checked={ghostModeEnabled}
          onCheckedChange={setGhostModeEnabled}
          isLight={isLight}
          variant="neutral"
        />
      </div>

      <div className="grid grid-cols-2 gap-2 pt-0.5">
        <div
          className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg border ${subPanelBg} ${
            !ghostModeEnabled ? 'opacity-50' : ''
          }`}
        >
          <span className="text-[11px] font-medium">Ghost Car Mesh</span>
          <ToggleSwitch
            checked={showGhostCar}
            onCheckedChange={setShowGhostCar}
            disabled={!ghostModeEnabled}
            isLight={isLight}
            variant="neutral"
          />
        </div>

        <div
          className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg border ${subPanelBg} ${
            !ghostModeEnabled ? 'opacity-50' : ''
          }`}
        >
          <span className="text-[11px] font-medium">Ghost Ball + Trail</span>
          <ToggleSwitch
            checked={showGhostBall}
            onCheckedChange={setShowGhostBall}
            disabled={!ghostModeEnabled}
            isLight={isLight}
            variant="neutral"
          />
        </div>

        <div className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg border ${subPanelBg}`}>
          <span className="text-[11px] font-medium flex items-center gap-1">
            <Keyboard className={`h-3 w-3 ${isLight ? 'text-emerald-600' : 'text-emerald-400'}`} />
            <span>Key Overlay</span>
          </span>
          <ToggleSwitch
            checked={showKeyboardOverlay}
            onCheckedChange={setShowKeyboardOverlay}
            isLight={isLight}
            variant="neutral"
          />
        </div>

        <div className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg border ${subPanelBg}`}>
          <span className="text-[11px] font-medium">Falling Notes</span>
          <ToggleSwitch
            checked={showFallingNotes}
            onCheckedChange={setShowFallingNotes}
            isLight={isLight}
            variant="neutral"
          />
        </div>
      </div>
    </div>
  );
};
