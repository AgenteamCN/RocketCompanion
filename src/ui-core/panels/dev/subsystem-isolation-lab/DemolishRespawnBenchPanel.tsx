import React from 'react';
import {
  Skull,
  ArrowLeft,
  ArrowRight,
  RotateCcw,
  Pause,
  Play,
  ShieldAlert,
  Car,
  Compass,
} from 'lucide-react';
import { useSubsystemIsolationLabStore } from '../../../stores/subsystemIsolationLabStore';
import { RESPAWN_SPAWN_PRESETS } from '../../../config/kickoffDuelConfig';
import { Badge } from '../../../primitives/Badge';
import { Button } from '../../../primitives/Button';
import { ToggleSwitch } from '../../../primitives/ToggleSwitch';
import { SliderControl } from '../../../primitives/SliderControl';

export interface DemolishRespawnBenchPanelProps {
  isLight: boolean;
  cardBg: string;
  subPanelBg: string;
  mutedText: string;
}

const VEHICLE_VISUAL_OPTIONS = [
  { id: 'octane', label: 'Octane (Default)' },
  { id: 'fennec', label: 'Fennec' },
  { id: 'ryza', label: 'Ryza' },
  { id: 'dominus', label: 'Dominus' },
  { id: 'breakout', label: 'Breakout' },
  { id: 'plank', label: 'Plank / Batmobile' },
  { id: 'hybrid', label: 'Hybrid' },
  { id: 'merc', label: 'Merc' },
  { id: 'hitbox-octane', label: 'Hitbox Box (Octane)' },
];

export const DemolishRespawnBenchPanel: React.FC<DemolishRespawnBenchPanelProps> = ({
  isLight,
  cardBg,
  subPanelBg,
  mutedText,
}) => {
  const {
    demolishRespawnTeam,
    demolishRespawnVisualId,
    demolishRespawnFreezeTimer,
    demolishRespawnAutoHoldDemo,
    demolishRespawnTimerDurationSec,
    demolishRespawnSelectedSlot,
    demolishRespawnObstacleEnabled,
    demolishRespawnObstacleSlot,
    demolishRespawnIsDemolished,
    demolishRespawnRemainingSec,
    demolishRespawnPreviewSlotLabel,
    demolishRespawnPreviewCoords,
    demolishRespawnPreviewYawDeg,
    demolishRespawnCarActualPos,
    demolishRespawnWheelLocalY,
    demolishRespawnLastInputEdge,
    setDemolishRespawnTeam,
    setDemolishRespawnVisualId,
    setDemolishRespawnFreezeTimer,
    setDemolishRespawnAutoHoldDemo,
    setDemolishRespawnTimerDurationSec,
    setDemolishRespawnObstacleEnabled,
    setDemolishRespawnObstacleSlot,
    triggerDemolishNow,
    forceRespawnNow,
    simulateDemolishSteerEdge,
    selectDemolishRespawnSlot,
  } = useSubsystemIsolationLabStore();

  const effectiveSlot =
    demolishRespawnSelectedSlot >= 0 && demolishRespawnSelectedSlot <= 3
      ? demolishRespawnSelectedSlot
      : 0;

  return (
    <div className="flex flex-col gap-2.5">
      {/* Top Status & Quick Action Bar */}
      <div className={`p-2.5 rounded-xl border flex flex-col gap-2 ${cardBg}`}>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <Skull className="h-4 w-4 text-rose-400" />
            <span className="font-bold text-xs">
              Demolish &amp; Respawn Ghost Isolation Bench
            </span>
          </div>
          <Badge
            variant={demolishRespawnIsDemolished ? 'amber' : 'emerald'}
            size="sm"
            isLight={isLight}
            className="font-mono text-[10px]"
          >
            {demolishRespawnIsDemolished
              ? `DEMOLISHED (${demolishRespawnRemainingSec.toFixed(2)}s)`
              : 'ALIVE / ACTIVE'}
          </Badge>
        </div>

        <p className={`text-[11px] leading-snug ${mutedText}`}>
          Directly simulate Left (<code className="font-mono">A</code>) / Right (
          <code className="font-mono">D</code>) respawn slot selection in RocketSim&apos;s left-handed
          coordinate system and inspect ghost chassis &amp; wheel placement without a second device.
        </p>

        <div className="grid grid-cols-2 gap-1.5 pt-0.5">
          <Button
            variant="primary"
            size="sm"
            onClick={triggerDemolishNow}
            isLight={isLight}
            className="gap-1.5 py-1.5 text-[11px] font-semibold"
          >
            <Skull className="h-3.5 w-3.5" />
            <span>Demolish Car Now</span>
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={forceRespawnNow}
            isLight={isLight}
            className="gap-1.5 py-1.5 text-[11px] font-semibold"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span>Respawn Immediately</span>
          </Button>
        </div>
      </div>

      {/* Left / Right Steer Input Simulation & Slot Matrix */}
      <div className={`p-2.5 rounded-xl border flex flex-col gap-2 ${subPanelBg}`}>
        <div className="flex items-center justify-between">
          <span className="font-semibold text-[11px] flex items-center gap-1.5">
            <Compass className="h-3.5 w-3.5 text-sky-400" />
            <span>Left / Right Steer Selection Simulator</span>
          </span>
          <span className={`font-mono text-[10px] ${mutedText}`}>
            {demolishRespawnLastInputEdge || 'Press A / D or click below'}
          </span>
        </div>

        {/* Simulated Rising-Edge Steer Buttons */}
        <div className="grid grid-cols-3 gap-1.5">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => simulateDemolishSteerEdge('left')}
            isLight={isLight}
            className="gap-1 py-1.5 text-[11px] font-semibold"
          >
            <ArrowLeft className="h-3.5 w-3.5 text-sky-400" />
            <span>Pulse Left (A)</span>
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => simulateDemolishSteerEdge('random')}
            isLight={isLight}
            className="gap-1 py-1.5 text-[11px]"
          >
            <span>Random (-1)</span>
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => simulateDemolishSteerEdge('right')}
            isLight={isLight}
            className="gap-1 py-1.5 text-[11px] font-semibold"
          >
            <span>Pulse Right (D)</span>
            <ArrowRight className="h-3.5 w-3.5 text-amber-400" />
          </Button>
        </div>

        {/* Visual 4-Slot Left-to-Right Layout from Player Camera Perspective */}
        <div className="flex flex-col gap-1 pt-1">
          <div className="flex items-center justify-between text-[10px] font-mono">
            <span className="text-sky-400 font-semibold">← CAMERA LEFT (A)</span>
            <span className={mutedText}>
              {demolishRespawnTeam === 0
                ? 'Blue Team 0 (Facing +Y, Left = +X)'
                : 'Orange Team 1 (Facing -Y, Left = -X)'}
            </span>
            <span className="text-amber-400 font-semibold">CAMERA RIGHT (D) →</span>
          </div>

          <div className="grid grid-cols-4 gap-1.5">
            {RESPAWN_SPAWN_PRESETS.map((preset) => {
              const coords = demolishRespawnTeam === 1 ? preset.team1 : preset.team0;
              const isSelected = demolishRespawnSelectedSlot === preset.slotIndex;
              const isPreviewFallback =
                demolishRespawnSelectedSlot === -1 && preset.slotIndex === 0;
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => selectDemolishRespawnSlot(preset.slotIndex)}
                  className={`p-1.5 rounded-lg border text-left transition-all flex flex-col gap-0.5 ${
                    isSelected
                      ? isLight
                        ? 'bg-sky-50 border-sky-500 text-sky-900 shadow-xs'
                        : 'bg-sky-500/20 border-sky-400 text-sky-100 shadow-xs'
                      : isPreviewFallback
                        ? isLight
                          ? 'bg-amber-50/70 border-amber-400/80 text-amber-900'
                          : 'bg-amber-500/10 border-amber-400/50 text-amber-200'
                        : isLight
                          ? 'bg-neutral-50 border-neutral-200 hover:border-neutral-300'
                          : 'bg-neutral-900/60 border-neutral-800 hover:border-neutral-700'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-[10px] truncate">{preset.label}</span>
                    <span className="font-mono text-[9px] opacity-75">#{preset.slotIndex}</span>
                  </div>
                  <span className="font-mono text-[9px] opacity-85">
                    X: {coords.x > 0 ? `+${coords.x}` : coords.x}
                  </span>
                  <span className="font-mono text-[9px] opacity-75">
                    Y: {coords.y > 0 ? `+${coords.y}` : coords.y}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Team, Vehicle Visual & Timer Hold Controls */}
      <div className={`p-2.5 rounded-xl border flex flex-col gap-2 ${subPanelBg}`}>
        <div className="flex items-center justify-between gap-2">
          <span className="font-semibold text-[11px] flex items-center gap-1.5">
            <Car className="h-3.5 w-3.5 text-emerald-400" />
            <span>Team Orientation &amp; Ghost Vehicle Visual</span>
          </span>
        </div>

        <div className="grid grid-cols-2 gap-1.5">
          <Button
            variant={demolishRespawnTeam === 0 ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => setDemolishRespawnTeam(0)}
            isLight={isLight}
            className="py-1 text-[11px]"
          >
            Blue Team 0 (Y = -4608)
          </Button>
          <Button
            variant={demolishRespawnTeam === 1 ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => setDemolishRespawnTeam(1)}
            isLight={isLight}
            className="py-1 text-[11px]"
          >
            Orange Team 1 (Y = +4608)
          </Button>
        </div>

        <div className="flex items-center justify-between gap-2 pt-0.5">
          <span className={`text-[11px] ${mutedText}`}>Vehicle Preset (Wheel Check):</span>
          <select
            value={demolishRespawnVisualId}
            onChange={(e) => setDemolishRespawnVisualId(e.target.value)}
            className={`text-[11px] font-mono rounded-lg px-2 py-1 border outline-none ${
              isLight
                ? 'bg-neutral-50 border-neutral-300 text-neutral-800'
                : 'bg-neutral-900 border-neutral-700 text-neutral-200'
            }`}
          >
            {VEHICLE_VISUAL_OPTIONS.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center justify-between gap-2 pt-1 border-t border-neutral-500/15">
          <div className="flex flex-col">
            <span className="text-[11px] font-medium flex items-center gap-1">
              {demolishRespawnFreezeTimer ? (
                <Pause className="h-3 w-3 text-amber-400" />
              ) : (
                <Play className="h-3 w-3 text-emerald-400" />
              )}
              <span>Freeze Respawn Timer (Inspect Ghost &amp; Wheels)</span>
            </span>
            <span className={`text-[10px] ${mutedText}`}>
              Keeps car in demolished state indefinitely so you can orbit camera &amp; test A/D
            </span>
          </div>
          <ToggleSwitch
            checked={demolishRespawnFreezeTimer}
            onChange={setDemolishRespawnFreezeTimer}
            isLight={isLight}
          />
        </div>

        <div className="flex items-center justify-between gap-2">
          <span className={`text-[11px] ${mutedText}`}>Start Bench in Demolished State</span>
          <ToggleSwitch
            checked={demolishRespawnAutoHoldDemo}
            onChange={setDemolishRespawnAutoHoldDemo}
            isLight={isLight}
          />
        </div>

        <SliderControl
          label="Demolish Countdown Duration"
          value={demolishRespawnTimerDurationSec}
          min={1.0}
          max={6.0}
          step={0.5}
          unit="s"
          onChange={setDemolishRespawnTimerDurationSec}
          isLight={isLight}
        />
      </div>

      {/* Obstacle Conflict Fallback & Telemetry Diagnostics */}
      <div className={`p-2.5 rounded-xl border flex flex-col gap-2 ${subPanelBg}`}>
        <div className="flex items-center justify-between gap-2">
          <span className="font-semibold text-[11px] flex items-center gap-1.5">
            <ShieldAlert className="h-3.5 w-3.5 text-amber-400" />
            <span>Spawn Slot Conflict &amp; Wheel Mount Telemetry</span>
          </span>
          <ToggleSwitch
            checked={demolishRespawnObstacleEnabled}
            onChange={setDemolishRespawnObstacleEnabled}
            isLight={isLight}
          />
        </div>

        {demolishRespawnObstacleEnabled && (
          <div className="flex items-center justify-between gap-1.5">
            <span className={`text-[10px] ${mutedText}`}>Park Blocker Car on Slot:</span>
            <div className="flex items-center gap-1">
              {[0, 1, 2, 3].map((slotIdx) => (
                <Button
                  key={slotIdx}
                  variant={demolishRespawnObstacleSlot === slotIdx ? 'primary' : 'secondary'}
                  size="sm"
                  onClick={() => setDemolishRespawnObstacleSlot(slotIdx)}
                  isLight={isLight}
                  className="px-2 py-0.5 text-[10px] font-mono"
                >
                  #{slotIdx}
                </Button>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-1.5 text-[10px] font-mono pt-1 border-t border-neutral-500/15">
          <div>
            <span className={mutedText}>Target Slot: </span>
            <span className="font-semibold">{demolishRespawnPreviewSlotLabel}</span>
          </div>
          <div>
            <span className={mutedText}>Target XYZ: </span>
            <span>
              ({demolishRespawnPreviewCoords[0]}, {demolishRespawnPreviewCoords[1]},{' '}
              {demolishRespawnPreviewCoords[2]})
            </span>
          </div>
          <div>
            <span className={mutedText}>Actual Car XYZ: </span>
            <span>
              ({demolishRespawnCarActualPos[0]}, {demolishRespawnCarActualPos[1]},{' '}
              {demolishRespawnCarActualPos[2]})
            </span>
          </div>
          <div>
            <span className={mutedText}>Ghost Wheel Y (Three): </span>
            <span className="text-emerald-400">
              {demolishRespawnWheelLocalY.length > 0
                ? `[${demolishRespawnWheelLocalY.join(', ')}]`
                : `Slot #${effectiveSlot} Ground OK`}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
