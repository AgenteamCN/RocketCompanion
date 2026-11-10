import React from 'react';
import {
  Activity,
  Compass,
  Download,
  FileSpreadsheet,
  FileJson,
} from 'lucide-react';
import {
  useSubsystemIsolationLabStore,
  type KickoffDuelChannelMode,
} from '../../../stores/subsystemIsolationLabStore';
import { SegmentedSwitch } from '../../../primitives/SegmentedSwitch';
import { Badge } from '../../../primitives/Badge';
import { Button } from '../../../primitives/Button';

export interface KickoffDuelDiagnosticsCardProps {
  isLight: boolean;
  cardBg: string;
  subPanelBg: string;
  mutedText: string;
  blueShortName?: string;
  orangeShortName?: string;
}

export const KickoffDuelDiagnosticsCard: React.FC<KickoffDuelDiagnosticsCardProps> = ({
  isLight,
  cardBg,
  subPanelBg,
  mutedText,
  blueShortName,
  orangeShortName,
}) => {
  const {
    kickoffDuelBlueModel,
    kickoffDuelOrangeModel,
    kickoffDuelPhase,
    kickoffDuelCurrentTick,
    kickoffDuelTouchTick,
    kickoffDuelTouchWinner,
    kickoffDuelInputsCutOff,
    kickoffDuelBlueDist,
    kickoffDuelOrangeDist,
    kickoffDuelBallPos,
    kickoffDuelBallVel,
    kickoffDuelBallSpeed,
    kickoffDuelBallOutcome,
    kickoffDuelChannelMode,
    kickoffDuelLiveBlueSteps,
    kickoffDuelLiveOrangeSteps,
    kickoffDuelDiagnosticRunning,
    kickoffDuelDiagnosticSummary,
    setKickoffDuelChannelMode,
    exportKickoffDuelDiagnostics,
  } = useSubsystemIsolationLabStore();

  const latestBlue = kickoffDuelLiveBlueSteps.slice(-6);
  const latestOrange = kickoffDuelLiveOrangeSteps.slice(-6);
  const resolvedBlueShort = blueShortName ?? kickoffDuelBlueModel.toUpperCase();
  const resolvedOrangeShort = orangeShortName ?? kickoffDuelOrangeModel.toUpperCase();

  return (
    <>
      {/* 3. Live Touch Winner, Input Cutoff & Ball Trajectory Telemetry */}
      <div className={`p-2.5 rounded-xl border flex flex-col gap-2 ${cardBg}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Compass className="h-3.5 w-3.5 text-emerald-400" />
            <span className="font-semibold text-[11px]">
              Live First-Touch Winner &amp; Post-Cutoff Ball Trajectory
            </span>
          </div>
          <Badge
            variant={kickoffDuelInputsCutOff ? 'amber' : 'emerald'}
            size="sm"
            isLight={isLight}
            className="font-mono text-[9px]"
          >
            {kickoffDuelInputsCutOff ? 'INPUTS CUT OFF (NEUTRAL)' : kickoffDuelPhase}
          </Badge>
        </div>

        <div
          className={`p-2 rounded-lg border grid grid-cols-3 gap-2 font-mono text-[10px] ${subPanelBg}`}
        >
          <div className="flex flex-col">
            <span className={`text-[9px] ${mutedText}`}>FIRST TOUCH WINNER</span>
            <span
              className={`font-bold text-xs ${
                kickoffDuelTouchWinner === 'BLUE'
                  ? 'text-sky-400'
                  : kickoffDuelTouchWinner === 'ORANGE'
                  ? 'text-orange-400'
                  : kickoffDuelTouchWinner === 'TIE'
                  ? 'text-amber-400'
                  : ''
              }`}
            >
              {kickoffDuelTouchWinner === 'BLUE'
                ? `BLUE (${resolvedBlueShort})`
                : kickoffDuelTouchWinner === 'ORANGE'
                ? `ORANGE (${resolvedOrangeShort})`
                : kickoffDuelTouchWinner === 'TIE'
                ? 'SIMULTANEOUS TIE'
                : 'PENDING...'}
            </span>
            <span className={`text-[9px] ${mutedText}`}>
              {kickoffDuelTouchTick > 0
                ? `Frame ${kickoffDuelTouchTick}f (${(kickoffDuelTouchTick / 120).toFixed(2)}s)`
                : `Elapsed ${kickoffDuelCurrentTick}f`}
            </span>
          </div>

          <div className="flex flex-col">
            <span className={`text-[9px] ${mutedText}`}>DIST AT TOUCH (B / O)</span>
            <span className="font-bold text-xs">
              <span className="text-sky-400">{kickoffDuelBlueDist}</span>
              {' / '}
              <span className="text-orange-400">{kickoffDuelOrangeDist}</span> uu
            </span>
            <span className={`text-[9px] ${mutedText}`}>
              Δ = {Math.abs(kickoffDuelBlueDist - kickoffDuelOrangeDist)} uu
            </span>
          </div>

          <div className="flex flex-col">
            <span className={`text-[9px] ${mutedText}`}>BALL DIRECTION &amp; SPEED</span>
            <span
              className="font-bold text-[10px] truncate text-emerald-400"
              title={kickoffDuelBallOutcome}
            >
              {kickoffDuelBallOutcome}
            </span>
            <span className={`text-[9px] ${mutedText}`}>
              Vy={kickoffDuelBallVel[1]} · Spd={kickoffDuelBallSpeed} · Y={kickoffDuelBallPos[1]}
            </span>
          </div>
        </div>
      </div>

      {/* 4. Action & Channel Diagnostics Exporter */}
      <div className={`p-2.5 rounded-xl border flex flex-col gap-2 ${cardBg}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Activity className="h-3.5 w-3.5 text-violet-400" />
            <span className="font-semibold text-[11px]">
              Model Action &amp; Channel Diagnostics (Live Trace &amp; JSON/CSV Export)
            </span>
          </div>
          <Badge variant="emerald" size="sm" isLight={isLight} className="font-mono text-[9px]">
            {kickoffDuelChannelMode === 'keyboard_coupled'
              ? 'KEYBOARD COUPLED (257.8f)'
              : 'GROUND/AIR SEPARATED (265.2f)'}
          </Badge>
        </div>

        {/* Channel Mode Switcher & Explanation */}
        <div className={`p-2 rounded-lg border flex flex-col gap-1.5 ${subPanelBg}`}>
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] font-semibold">
              KO_v2 (RLRL101 a9a52e7) Throttle / Pitch Channel Mapping
            </span>
            <span className={`text-[9px] font-mono ${mutedText}`}>
              prevAct[0] = onGround ? throttle : -pitch · No Forced W
            </span>
          </div>
          <SegmentedSwitch
            value={kickoffDuelChannelMode}
            fullWidth
            size="sm"
            isLight={isLight}
            onValueChange={(v) => setKickoffDuelChannelMode(v as KickoffDuelChannelMode)}
            options={[
              {
                value: 'keyboard_coupled',
                label: 'Keyboard Coupled (W/S -> Thr & Pitch · 257.8f Optimal)',
              },
              {
                value: 'ground_air_separated',
                label: 'Separated (Ground=Thr, Air=Pitch · 265.2f)',
              },
            ]}
          />
          <div className={`text-[9.5px] leading-snug ${mutedText}`}>
            {kickoffDuelChannelMode === 'keyboard_coupled'
              ? 'Unseparated standard keyboard output (multiDiscreteToControls): 100% deterministic (0.00e+0 state delta vs keyboard replay) and preserves airborne CAR_AIR_CONTROL_THROTTLE (66.67 uu/s²).'
              : 'Separated mode zeroes throttle in air and zeroes pitch on ground, losing airborne forward throttle acceleration (+7.4f slower avg).'}
          </div>
        </div>

        {/* Live Action Step Trace (Blue vs Orange) */}
        <div className="grid grid-cols-2 gap-2">
          <div className={`p-1.5 rounded-lg border flex flex-col gap-1 ${subPanelBg}`}>
            <div className="flex items-center justify-between text-[9.5px] font-mono">
              <span className="font-bold text-sky-400">
                BLUE ({kickoffDuelBlueModel.toUpperCase()}) STEPS
              </span>
              <span className={mutedText}>t · keys · thr/pit · prev0</span>
            </div>
            <div className="flex flex-col gap-0.5 max-h-24 overflow-y-auto font-mono text-[9px]">
              {latestBlue.length === 0 ? (
                <span className={mutedText}>Waiting for steps...</span>
              ) : (
                latestBlue.map((s) => (
                  <div
                    key={s.tick}
                    className="flex items-center justify-between border-b last:border-b-0 border-neutral-500/15 py-0.5"
                  >
                    <span className={mutedText}>
                      {s.tick}f {s.onGround ? 'G' : 'A'}
                    </span>
                    <span className="font-bold text-sky-400 truncate max-w-[95px]" title={s.keysLabel}>
                      {s.keysLabel}
                    </span>
                    <span>
                      {s.controls.throttle}/{s.controls.pitch} ({s.prevAct0})
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className={`p-1.5 rounded-lg border flex flex-col gap-1 ${subPanelBg}`}>
            <div className="flex items-center justify-between text-[9.5px] font-mono">
              <span className="font-bold text-orange-400">
                ORANGE ({kickoffDuelOrangeModel.toUpperCase()}) STEPS
              </span>
              <span className={mutedText}>t · keys · thr/pit · prev0</span>
            </div>
            <div className="flex flex-col gap-0.5 max-h-24 overflow-y-auto font-mono text-[9px]">
              {latestOrange.length === 0 ? (
                <span className={mutedText}>Waiting for steps...</span>
              ) : (
                latestOrange.map((s) => (
                  <div
                    key={s.tick}
                    className="flex items-center justify-between border-b last:border-b-0 border-neutral-500/15 py-0.5"
                  >
                    <span className={mutedText}>
                      {s.tick}f {s.onGround ? 'G' : 'A'}
                    </span>
                    <span
                      className="font-bold text-orange-400 truncate max-w-[95px]"
                      title={s.keysLabel}
                    >
                      {s.keysLabel}
                    </span>
                    <span>
                      {s.controls.throttle}/{s.controls.pitch} ({s.prevAct0})
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Diagnostic Export Buttons */}
        <div className="flex flex-wrap items-center justify-between gap-1.5 pt-0.5">
          <div className="flex items-center gap-1.5">
            <Button
              variant="secondary"
              size="sm"
              disabled={kickoffDuelDiagnosticRunning}
              onClick={() => exportKickoffDuelDiagnostics('json', 'all_models_all_slots')}
              isLight={isLight}
              className="gap-1 px-2 py-0.5 text-[9.5px]"
            >
              <FileJson className="h-3 w-3 text-sky-400" />
              <span>Export All 4 Models (5 Slots) JSON</span>
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={kickoffDuelDiagnosticRunning}
              onClick={() => exportKickoffDuelDiagnostics('csv', 'all_models_all_slots')}
              isLight={isLight}
              className="gap-1 px-2 py-0.5 text-[9.5px]"
            >
              <FileSpreadsheet className="h-3 w-3 text-emerald-400" />
              <span>Export All CSV</span>
            </Button>
          </div>

          <div className="flex items-center gap-1.5">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => exportKickoffDuelDiagnostics('json', 'live')}
              isLight={isLight}
              className="gap-1 px-2 py-0.5 text-[9.5px]"
            >
              <Download className="h-3 w-3" />
              <span>Live Duel JSON</span>
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => exportKickoffDuelDiagnostics('csv', 'live')}
              isLight={isLight}
              className="gap-1 px-2 py-0.5 text-[9.5px]"
            >
              <Download className="h-3 w-3" />
              <span>Live CSV</span>
            </Button>
          </div>
        </div>

        {kickoffDuelDiagnosticSummary && (
          <div className="text-[9.5px] font-mono px-1 text-emerald-400">
            {kickoffDuelDiagnosticSummary}
          </div>
        )}
      </div>
    </>
  );
};
