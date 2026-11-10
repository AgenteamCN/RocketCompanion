import React, { useEffect, useState } from 'react';
import {
  BugPlay,
  CheckCircle2,
  Download,
  Gauge,
  Loader2,
  Play,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import { SettingSegmentedRow } from '../../compounds/SettingSegmentedRow';
import { SettingToggleRow } from '../../compounds/SettingToggleRow';
import { useAppStore } from '../../stores/appStore';
import { useScopedStore } from '../../stores/storeSnapshotScope';

export type ScenarioSpeedPreset = '1x' | '10x' | '20x' | '50x';

export interface ScenarioAssertionItem {
  name: string;
  passed: boolean;
  detail?: string;
}

export interface ScenarioRunReportSummary {
  id: string;
  name: string;
  passed: boolean;
  simulatedTicks: number;
  wallClockDurationMs: number;
  effectiveTickRateHz: number;
  speedupFactorVsRealtime: number;
  assertions: ScenarioAssertionItem[];
  runtimeErrors: {
    totalErrorCount: number;
  };
}

export interface GoldenDiffReportSummary {
  passed: boolean;
  descriptorDiffs?: Array<{ passed: boolean }>;
  rigProbeDiffs?: Array<{ passed: boolean }>;
}

export interface BaselineSuiteReportSummary {
  schemaVersion: string;
  generatedAtIso: string;
  configuredSpeedPreset: string;
  overallPassed: boolean;
  scenarios: ScenarioRunReportSummary[];
  goldenBaselineDiff?: GoldenDiffReportSummary | null;
}

export interface ScenarioDriverRunOptionsInput {
  speed?: ScenarioSpeedPreset;
  includeGoldenDiff?: boolean;
  failOnConsoleError?: boolean;
}

export interface WindowScenarioDriverPort {
  setFastForwardSpeed?: (speed: ScenarioSpeedPreset) => void;
  listScenarioIds?: () => string[];
  runScenarioById?: (
    scenarioId: string,
    options?: ScenarioDriverRunOptionsInput,
  ) => Promise<BaselineSuiteReportSummary>;
  runBaselineSuite?: (
    queryValue?: string,
    options?: ScenarioDriverRunOptionsInput,
  ) => Promise<BaselineSuiteReportSummary>;
  runSelfTest?: (
    options?: ScenarioDriverRunOptionsInput,
  ) => Promise<BaselineSuiteReportSummary>;
  runGoldenDiffAudit?: () => GoldenDiffReportSummary;
}

const FALLBACK_SCENARIO_IDS: readonly string[] = [
  'boot_and_freeplay_goal_replay',
  'multiplayer_6car_loadout_stress',
  'replay_viewer_6car_playback_and_exit',
  'isolation_lab_and_tuner_matrix',
  'training_and_kickoff_lifecycle',
  'online_3v3_ducky_full_lifecycle',
  'replay_director_and_export_lifecycle',
  'training_session_fifo_and_sys_ctrl_e2e',
  'roster_combinations_matrix_exploration',
];

const SUITE_GROUP_PRESETS: ReadonlyArray<{ value: string; label: string }> = [
  { value: 'all', label: 'Suite: All Baseline Scenarios' },
  { value: 'e2e', label: 'Suite: Autonomous E2E (3v3 + FIFO + Matrix)' },
  { value: 'calibration', label: 'Suite: 65f1538d Golden Calibration' },
  { value: 'basic', label: 'Suite: Basic Smoke (Boot + FIFO)' },
  { value: 'complex', label: 'Suite: Complex 6-Car Stress' },
];

function getWindowScenarioDriver(): WindowScenarioDriverPort | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { __rcScenarioDriver?: WindowScenarioDriverPort };
  return w.__rcScenarioDriver ?? null;
}

function getWindowScenarioReport(): BaselineSuiteReportSummary | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { __rcScenarioReport?: BaselineSuiteReportSummary };
  return w.__rcScenarioReport ?? null;
}

export interface DevScenarioRunnerSectionProps {
  isLight?: boolean;
  onHoverDesc?: (desc: string | null) => void;
}

export const DevScenarioRunnerSection: React.FC<DevScenarioRunnerSectionProps> = ({
  isLight = false,
  onHoverDesc,
}) => {
  const closeMenu = useScopedStore('appStore', useAppStore, (s) => s.closeMenu);
  const [selectedTarget, setSelectedTarget] = useState<string>('basic');
  const [speedPreset, setSpeedPreset] = useState<ScenarioSpeedPreset>('20x');
  const [includeGoldenDiff, setIncludeGoldenDiff] = useState<boolean>(true);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [availableIds, setAvailableIds] = useState<readonly string[]>(FALLBACK_SCENARIO_IDS);
  const [report, setReport] = useState<BaselineSuiteReportSummary | null>(() =>
    getWindowScenarioReport(),
  );
  const [errorText, setErrorText] = useState<string | null>(null);
  const [exportStatus, setExportStatus] = useState<string | null>(null);

  useEffect(() => {
    const drv = getWindowScenarioDriver();
    const ids = drv?.listScenarioIds?.();
    if (Array.isArray(ids) && ids.length > 0) {
      setAvailableIds(ids);
    }
    const existingReport = getWindowScenarioReport();
    if (existingReport) {
      setReport(existingReport);
    }
  }, []);

  const handleSpeedChange = (val: string) => {
    const nextSpeed = (
      val === '1x' || val === '10x' || val === '20x' || val === '50x' ? val : '20x'
    ) as ScenarioSpeedPreset;
    setSpeedPreset(nextSpeed);
    getWindowScenarioDriver()?.setFastForwardSpeed?.(nextSpeed);
  };

  const handleRunSuite = async () => {
    if (isRunning) return;
    const drv = getWindowScenarioDriver();
    setErrorText(null);
    if (!drv) {
      setErrorText('Scenario Driver (window.__rcScenarioDriver) is not attached in static preview.');
      return;
    }

    setIsRunning(true);
    try {
      drv.setFastForwardSpeed?.(speedPreset);
      closeMenu();
      const opts: ScenarioDriverRunOptionsInput = {
        speed: speedPreset,
        includeGoldenDiff,
      };
      const isGroupSuite = SUITE_GROUP_PRESETS.some((g) => g.value === selectedTarget);
      const result =
        !isGroupSuite && typeof drv.runScenarioById === 'function'
          ? await drv.runScenarioById(selectedTarget, opts)
          : typeof drv.runBaselineSuite === 'function'
            ? await drv.runBaselineSuite(selectedTarget, opts)
            : await drv.runSelfTest?.(opts);
      if (result) {
        setReport(result);
      }
    } catch (err) {
      setErrorText(err instanceof Error ? err.message : String(err));
    } finally {
      setIsRunning(false);
    }
  };

  const handleExportReportJson = () => {
    const targetReport = report ?? getWindowScenarioReport();
    if (!targetReport) return;
    const serialized = JSON.stringify(targetReport, null, 2);
    if (typeof document !== 'undefined') {
      const blob = new Blob([serialized], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const stamp = (targetReport.generatedAtIso || new Date().toISOString())
        .replace(/[:.]/g, '-')
        .slice(0, 19);
      const a = document.createElement('a');
      a.href = url;
      a.download = `rc-selftest-report-${stamp}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    }
    setExportStatus('Exported JSON');
    setTimeout(() => setExportStatus(null), 2000);
  };

  const passedScenarios = report?.scenarios?.filter((s) => s.passed).length ?? 0;
  const totalScenarios = report?.scenarios?.length ?? 0;

  return (
    <div
      data-ui-element="dev-scenario-runner-panel"
      className={`rounded-xl border p-3 flex flex-col gap-2.5 ${
        isLight
          ? 'bg-neutral-100/70 border-neutral-200/90 text-neutral-800'
          : 'bg-neutral-900/65 border-neutral-800 text-neutral-200'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <BugPlay className="h-4 w-4 text-amber-500 shrink-0" />
          <span className="text-xs font-bold uppercase tracking-wider">
            Scenario Runner (__rcScenarioDriver)
          </span>
        </div>
        <span
          className={`text-[10px] font-mono px-2 py-0.5 rounded border font-semibold ${
            isRunning
              ? 'bg-amber-500/15 border-amber-500/40 text-amber-400'
              : report
              ? report.overallPassed
                ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-400'
                : 'bg-rose-500/15 border-rose-500/40 text-rose-400'
              : 'bg-sky-500/15 border-sky-500/35 text-sky-400'
          }`}
        >
          {isRunning
            ? 'RUNNING'
            : report
            ? `${report.overallPassed ? 'PASSED' : 'FAILED'} (${passedScenarios}/${totalScenarios})`
            : `${availableIds.length} SCENARIOS READY`}
        </span>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-[10px] font-mono uppercase tracking-wider text-neutral-400">
          Target Suite or Scenario Script
        </label>
        <select
          value={selectedTarget}
          onChange={(e) => setSelectedTarget(e.target.value)}
          onMouseEnter={() =>
            onHoverDesc?.(
              'Select a preset scenario group (all, e2e, calibration, basic, complex) or an individual deterministic scenario script.',
            )
          }
          onMouseLeave={() => onHoverDesc?.(null)}
          className={`w-full rounded-lg border px-2.5 py-1.5 text-xs font-mono outline-none cursor-pointer ${
            isLight
              ? 'bg-white border-neutral-300 text-neutral-900'
              : 'bg-neutral-950 border-neutral-700 text-neutral-100'
          }`}
        >
          <optgroup label="Suite Presets">
            {SUITE_GROUP_PRESETS.map((preset) => (
              <option key={preset.value} value={preset.value}>
                {preset.label}
              </option>
            ))}
          </optgroup>
          <optgroup label="Individual Scenarios">
            {availableIds.map((id) => (
              <option key={id} value={id}>
                {id}
              </option>
            ))}
          </optgroup>
        </select>
      </div>

      <SettingSegmentedRow
        icon={Gauge}
        iconColor="text-amber-500"
        title="Fast-Forward Speed"
        value={speedPreset}
        onChange={handleSpeedChange}
        layout="inline"
        bordered={false}
        showDescription={false}
        options={[
          { value: '1x', label: '1x' },
          { value: '10x', label: '10x' },
          { value: '20x', label: '20x' },
          { value: '50x', label: '50x' },
        ]}
        hoverDescription="VirtualClock Fast-Forward Multiplier: Step physics at fixed 120Hz dt=1/120s while decoupling rendering to accelerate self-test execution."
        onHover={(desc) => desc && onHoverDesc?.(desc)}
        onLeave={() => onHoverDesc?.(null)}
        isLight={isLight}
      />

      <SettingToggleRow
        icon={ShieldCheck}
        iconColor="text-emerald-400"
        title="65f1538d Golden Baseline Diff"
        checked={includeGoldenDiff}
        onChange={setIncludeGoldenDiff}
        bordered={false}
        showDescription={false}
        hoverDescription="Include 65f1538d Golden Baseline descriptor and vehicle rig geometry audit in the self-test report."
        onHover={(desc) => desc && onHoverDesc?.(desc)}
        onLeave={() => onHoverDesc?.(null)}
        isLight={isLight}
      />

      <div className="flex items-center gap-2 pt-1">
        <button
          type="button"
          disabled={isRunning}
          onClick={() => void handleRunSuite()}
          onMouseEnter={() =>
            onHoverDesc?.(
              'Execute the selected scenario suite via window.__rcScenarioDriver and collect telemetry + assertion reports.',
            )
          }
          onMouseLeave={() => onHoverDesc?.(null)}
          className="flex-1 py-2 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-neutral-950 font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all cursor-pointer"
        >
          {isRunning ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Play className="h-3.5 w-3.5 fill-current" />
          )}
          <span>{isRunning ? 'Running Self-Test...' : 'Run Self-Test'}</span>
        </button>

        <button
          type="button"
          disabled={!report}
          onClick={handleExportReportJson}
          onMouseEnter={() =>
            onHoverDesc?.(
              'Export the latest BaselineSuiteTelemetryReport (window.__rcScenarioReport) as a formatted JSON file.',
            )
          }
          onMouseLeave={() => onHoverDesc?.(null)}
          className={`py-2 px-3.5 rounded-xl border text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-40 ${
            isLight
              ? 'bg-white hover:bg-neutral-100 border-neutral-300 text-neutral-800'
              : 'bg-neutral-800 hover:bg-neutral-700 border-neutral-700 text-neutral-100'
          }`}
        >
          <Download className="h-3.5 w-3.5 text-emerald-400" />
          <span>{exportStatus ?? 'Export JSON'}</span>
        </button>
      </div>

      {errorText && (
        <div className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-2.5 py-1.5 text-[11px] font-mono text-rose-400">
          {errorText}
        </div>
      )}

      {report && (
        <div className="flex flex-col gap-1.5 pt-1">
          <div className="flex items-center justify-between text-[10px] font-mono text-neutral-400">
            <span>
              SPEED: {report.configuredSpeedPreset} · GOLDEN DIFF:{' '}
              {report.goldenBaselineDiff
                ? report.goldenBaselineDiff.passed
                  ? 'PASS'
                  : 'DRIFT'
                : 'SKIPPED'}
            </span>
            <span>{report.generatedAtIso.slice(11, 19)} UTC</span>
          </div>

          <div className="flex flex-col gap-1 max-h-40 overflow-y-auto pr-0.5">
            {report.scenarios.map((sc) => {
              const passedAssertions = sc.assertions.filter((a) => a.passed).length;
              return (
                <div
                  key={sc.id}
                  className={`flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg border text-[11px] font-mono ${
                    isLight
                      ? 'bg-white border-neutral-200/90'
                      : 'bg-neutral-950/70 border-neutral-800/90'
                  }`}
                >
                  <div className="flex items-center gap-1.5 min-w-0">
                    {sc.passed ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                    ) : (
                      <XCircle className="h-3.5 w-3.5 text-rose-400 shrink-0" />
                    )}
                    <span className="truncate font-semibold">{sc.id}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 text-[10px] text-neutral-400">
                    <span>
                      {passedAssertions}/{sc.assertions.length} asserts
                    </span>
                    <span className="text-emerald-400">
                      {Math.round(sc.effectiveTickRateHz)}Hz ({sc.speedupFactorVsRealtime}x)
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
