import React from 'react';
import { Cpu, Sliders, RotateCcw, Eye } from 'lucide-react';
import { useSubsystemIsolationLabStore } from '../../../stores/subsystemIsolationLabStore';
import { SegmentedSwitch } from '../../../primitives/SegmentedSwitch';
import { SliderControl } from '../../../primitives/SliderControl';
import { ToggleSwitch } from '../../../primitives/ToggleSwitch';
import { Badge } from '../../../primitives/Badge';
import { Button } from '../../../primitives/Button';

export interface ProbesBenchPanelProps {
  isLight: boolean;
  cardBg: string;
  subPanelBg: string;
  mutedText: string;
}

export const ProbesBenchPanel: React.FC<ProbesBenchPanelProps> = ({
  isLight,
  cardBg,
  subPanelBg,
  mutedText,
}) => {
  const {
    probesEnabled,
    probeOffsetX,
    probeOffsetY,
    probeOffsetZ,
    probeBaseAltitudeZ,
    probePeakAltitudeZ,
    probeHoldTolerance,
    probeBoostZ,
    probeBoostVz,
    probeBoostPhase,
    probeBoostHoldTicks,
    probeRollDir,
    probeCameraTarget,
    setProbesEnabled,
    setProbeOffsetX,
    setProbeOffsetY,
    setProbeOffsetZ,
    setProbeBaseAltitudeZ,
    setProbePeakAltitudeZ,
    resetProbeParameters,
    setProbeCameraTarget,
  } = useSubsystemIsolationLabStore();

  const effectiveBoostX = -2500 + probeOffsetX;
  const effectiveBoostY = -400 + probeOffsetY;
  const effectiveQeY = 400 + probeOffsetY;
  const effectiveBaseZ = probeBaseAltitudeZ + probeOffsetZ;
  const effectivePeakZ = probePeakAltitudeZ + probeOffsetZ;

  return (
    <div className="flex flex-col gap-2.5">
      <div className={`p-2.5 rounded-xl border flex flex-col gap-2 ${cardBg}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Cpu className="h-3.5 w-3.5 text-sky-400" />
            <span className="font-semibold text-[11px]">
              Two-Car Prediction Probes (Slot 6 & Slot 7 · In-Arena X={effectiveBoostX})
            </span>
          </div>
          <ToggleSwitch
            checked={probesEnabled}
            onCheckedChange={(v) => setProbesEnabled(v)}
            isLight={isLight}
            variant="neutral"
          />
        </div>

        <p className={`text-[10px] leading-relaxed ${mutedText}`}>
          • <b>Car A (Slot 6 - Unpredictable Boost):</b> Gravity ON, XY locked inside arena at{' '}
          <code>X={effectiveBoostX}, Y={effectiveBoostY}</code>. Starts at <code>Z={effectiveBaseZ}</code>, holds boost to{' '}
          <code>Z={effectivePeakZ}</code>, releases to fall below <code>{effectiveBaseZ}</code>, then pulse-taps boost to stabilize within{' '}
          <code>{effectiveBaseZ}±{probeHoldTolerance}</code> for <b>1.0s (120f)</b> before repeating.
          <br />• <b>Car B (Slot 7 - Predictable QE Roll):</b> 0G locked at{' '}
          <code>X={effectiveBoostX}, Y={effectiveQeY}, Z={effectiveBaseZ + 50}</code>, alternating Q/E roll.
        </p>
      </div>

      <div className={`p-2.5 rounded-xl border flex flex-col gap-2 ${cardBg}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Sliders className="h-3.5 w-3.5 text-emerald-400" />
            <span className="font-semibold text-[11px]">
              Probe Relative Position Offsets & Gravity Boost Altitude Targets
            </span>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={resetProbeParameters}
            isLight={isLight}
            className="gap-1 px-2 py-0.5 text-[10px]"
          >
            <RotateCcw className="h-3 w-3" />
            <span>Reset Defaults</span>
          </Button>
        </div>

        <div className={`p-2 rounded-lg border flex flex-col gap-2 ${subPanelBg}`}>
          <SliderControl
            label={`Horizontal X Offset (${probeOffsetX >= 0 ? `+${probeOffsetX}` : probeOffsetX} → X=${effectiveBoostX})`}
            description="Relative X offset from base X=-2500 (type any value & press Enter / unfocus)"
            value={probeOffsetX}
            min={-1500}
            max={5000}
            step={50}
            unit="uu"
            editable={true}
            allowOutOfBoundsInput={true}
            showStepper={true}
            colorScheme="neutral"
            isLight={isLight}
            onChange={(val) => setProbeOffsetX(val)}
          />

          <SliderControl
            label={`Horizontal Y Offset (${probeOffsetY >= 0 ? `+${probeOffsetY}` : probeOffsetY} → Y=${effectiveBoostY}/${effectiveQeY})`}
            description="Relative Y offset from base Y=-400/+400 (commit on Enter / unfocus)"
            value={probeOffsetY}
            min={-3500}
            max={3500}
            step={50}
            unit="uu"
            editable={true}
            allowOutOfBoundsInput={true}
            showStepper={true}
            colorScheme="neutral"
            isLight={isLight}
            onChange={(val) => setProbeOffsetY(val)}
          />

          <SliderControl
            label={`Vertical Z Offset (${probeOffsetZ >= 0 ? `+${probeOffsetZ}` : probeOffsetZ} uu)`}
            description="Relative vertical Z shift applied to both probes (commit on Enter / unfocus)"
            value={probeOffsetZ}
            min={-400}
            max={1200}
            step={25}
            unit="uu"
            editable={true}
            allowOutOfBoundsInput={true}
            showStepper={true}
            colorScheme="neutral"
            isLight={isLight}
            onChange={(val) => setProbeOffsetZ(val)}
          />

          <SliderControl
            label={`Gravity Boost Base Altitude Target Z0 (Eff: ${effectiveBaseZ} uu)`}
            description="Lower recovery & 1.0s hover target altitude (default 500 uu)"
            value={probeBaseAltitudeZ}
            min={100}
            max={1600}
            step={25}
            unit="uu"
            editable={true}
            allowOutOfBoundsInput={true}
            showStepper={true}
            colorScheme="amber"
            isLight={isLight}
            onChange={(val) => setProbeBaseAltitudeZ(val)}
          />

          <SliderControl
            label={`Gravity Boost Peak Altitude Target Z1 (Eff: ${effectivePeakZ} uu)`}
            description="Upper boost cut-off apex target altitude (default 600 uu)"
            value={probePeakAltitudeZ}
            min={150}
            max={1800}
            step={25}
            unit="uu"
            editable={true}
            allowOutOfBoundsInput={true}
            showStepper={true}
            colorScheme="amber"
            isLight={isLight}
            onChange={(val) => setProbePeakAltitudeZ(val)}
          />
        </div>
      </div>

      <div className={`p-2.5 rounded-xl border flex flex-col gap-2 ${cardBg}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Eye className="h-3.5 w-3.5 text-amber-400" />
            <span className="font-semibold text-[11px]">Camera Observation Target</span>
          </div>
          <Badge variant="default" size="sm" isLight={isLight} className="font-mono text-[10px]">
            {probeCameraTarget.toUpperCase()}
          </Badge>
        </div>
        <SegmentedSwitch
          value={probeCameraTarget}
          fullWidth
          size="sm"
          isLight={isLight}
          onValueChange={(v) => setProbeCameraTarget(v as 'player' | 'boost_probe' | 'qe_probe')}
          options={[
            { value: 'player', label: 'Player (Car 0)' },
            { value: 'boost_probe', label: `Boost Probe (Z:${effectiveBaseZ}→${effectivePeakZ})` },
            { value: 'qe_probe', label: '0G QE Roll Probe' },
          ]}
        />
      </div>

      <div className={`p-2.5 rounded-xl border font-mono text-[10px] flex flex-col gap-1.5 ${subPanelBg}`}>
        <div className="flex items-center justify-between border-b border-neutral-700/30 pb-1">
          <span className="font-bold text-sky-400">LIVE PROBE TELEMETRY (120Hz)</span>
          <span>MAX_ARENA_CARS = 8</span>
        </div>
        <div className="grid grid-cols-2 gap-2 pt-0.5">
          <div className="flex flex-col gap-0.5">
            <span className={mutedText}>Car 6 (Gravity Boost Z-Loop):</span>
            <span>
              Phase: <b className="text-amber-400">{probeBoostPhase}</b>
            </span>
            <span>
              Alt Z: <b>{probeBoostZ.toFixed(1)}</b> / {effectivePeakZ} uu
            </span>
            <span>
              Vel Z: <b>{probeBoostVz.toFixed(1)}</b> uu/s
            </span>
            <span>
              {effectiveBaseZ}±{probeHoldTolerance} Hold:{' '}
              <b>{((probeBoostHoldTicks / 120) * 100).toFixed(0)}%</b> ({probeBoostHoldTicks}/120f)
            </span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className={mutedText}>Car 7 (0G QE Air-Roll):</span>
            <span>
              Gravity: <b>0.0 G (Locked XYZ)</b>
            </span>
            <span>
              Roll Input: <b className="text-emerald-400">{probeRollDir > 0 ? '+1.0 (Q)' : '-1.0 (E)'}</b>
            </span>
            <span className="text-[9px] opacity-75 mt-1">
              All numeric inputs commit only on Enter or unfocus (blur).
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
