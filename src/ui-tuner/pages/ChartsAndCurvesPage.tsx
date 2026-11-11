import React from 'react';
import {
  Activity,
  CheckCircle2,
  Gauge,
  Plus,
  Spline,
  XCircle,
  Zap,
} from 'lucide-react';
import {
  EventImpulseScatterChart,
  type CollisionImpulseEvent,
} from '../../ui-core/charts/EventImpulseScatterChart';
import { GoalBarrier2DEditor } from '../../ui-core/charts/GoalBarrier2DEditor';
import { MultiTrackReplayTimeline } from '../../ui-core/charts/MultiTrackReplayTimeline';
import { PacingOscilloscopeChart } from '../../ui-core/charts/PacingOscilloscopeChart';
import { Badge } from '../../ui-core/primitives/Badge';
import { Button } from '../../ui-core/primitives/Button';
import { CodeBlock } from '../CodeBlock';
import { TunerConfigExporterBar } from '../components/tuner/TunerConfigExporterBar';
import { PageJumpDirectory, type JumpDirectoryItem } from '../PageJumpDirectory';
import { ChartsBezierTrajectorySection } from './charts-curves/ChartsBezierTrajectorySection';
import { ChartsTelemetrySparklineSection } from './charts-curves/ChartsTelemetrySparklineSection';
import { useChartsAndCurvesSyncedState } from './charts-curves/useChartsAndCurvesSyncedState';

const CHARTS_JUMP_ITEMS: JumpDirectoryItem[] = [
  {
    id: 'chart-5b-1-sparkline',
    code: '5B.1',
    name: 'TelemetrySparklineChart',
    label: '120Hz Zero-allocation Oscilloscope',
    badge: 'RingBuffer',
  },
  {
    id: 'chart-5b-2-scatter',
    code: '5B.2',
    name: 'EventImpulseScatterChart',
    label: 'Physics impulse scatter plot',
    badge: 'SVG',
  },
  {
    id: 'chart-5b-3-bezier',
    code: '5B.3',
    name: 'CubicBezierCurveEditor',
    label: 'Cubic Bezier curve',
    badge: 'SVG Drag',
  },
  {
    id: 'chart-5b-4-trajectory',
    code: '5B.4',
    name: 'ParametricTrajectoryChart',
    label: 'Parametric physical extreme trajectory',
    badge: 'dy/du=0',
  },
  {
    id: 'chart-5b-5-pacing',
    code: '5B.5',
    name: 'PacingOscilloscopeChart',
    label: 'Three-channel clock pacing oscilloscope',
    badge: '120Hz Canvas',
  },
  {
    id: 'chart-5b-6-barrier',
    code: '5B.6',
    name: 'GoalBarrier2DEditor',
    label: 'Goal boolean mask editor',
    badge: '2D Quad',
  },
  {
    id: 'chart-5b-7-timeline',
    code: '5B.7',
    name: 'MultiTrackReplayTimeline',
    label: 'Three-track synchronized playback timeline',
    badge: '120Hz Ref',
  },
];

export const ChartsAndCurvesPage: React.FC<{ isLight?: boolean }> = ({ isLight = true }) => {
  const {
    telemetryPreset,
    threshold,
    setThreshold,
    events,
    setEvents,
    orbBezier,
    orbDurationMs,
    orbDropDistance,
    handleResetDefaults,
    buildExportCode,
  } = useChartsAndCurvesSyncedState();

  const emitCollisionBurst = () => {
    const types: Array<'car-ball' | 'car-world' | 'goalpost'> = [
      'car-ball',
      'car-world',
      'goalpost',
    ];
    setEvents((prev) => {
      const aged = prev
        .map((e) => ({ ...e, ageSec: Number((e.ageSec + 0.45).toFixed(2)) }))
        .filter((e) => e.ageSec <= 5.0);
      const newEvent: CollisionImpulseEvent = {
        id: `ev-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        ageSec: 0.08,
        value: Math.round(250 + Math.random() * 2150),
        type: types[Math.floor(Math.random() * types.length)],
      };
      return [...aged, newEvent];
    });
  };

  const isNetPreset = telemetryPreset === 'network-rtt';

  return (
    <div className="flex flex-col gap-8 max-w-5xl">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge size="sm" variant="amber" isLight={isLight}>
            Clarity #1 · Performance #2 · Aesthetics #3
          </Badge>
          <Badge size="sm" variant="neutral" isLight={isLight}>
            120Hz Float32 RingBuffer · Zero Heap Allocation · Cached Skia Gradient
          </Badge>
        </div>
        <h1 className="text-2xl font-bold tracking-tight">
          Charts &amp; Curves High-performance clear chart and curve system
        </h1>
        <p className={`text-xs leading-relaxed ${isLight ? 'text-neutral-600' : 'text-neutral-400'}`}>
          Targeting <code className="font-mono text-amber-500">RocketCompanion</code> 120Hz
          Zero-coupling reinforcement for physical frame timing and network telemetry. Remove legacy
          low-frequency React State Array-driven, Full adoption of pre-allocation{' '}
          <code className="font-mono text-emerald-500">TelemetryRingBuffer (Float32Array)</code> +
          Cached <code className="font-mono">CanvasGradient</code>, Achieved during long-term
          continuous operation{' '}
          <strong>
            0 React Repaints, 0 Heap memory and Skia Native shader allocation, Prevent periodic GC
            Frame drop
          </strong>
          .
        </p>
      </div>

      <PageJumpDirectory
        title="5B · High-Clarity Telemetry chart and curve quick jump directory (Charts Jump Index)"
        subtitle="Click to quickly locate to specified chart component, Click the copy icon on the right to copy the standardized reference code"
        items={CHARTS_JUMP_ITEMS}
        isLight={isLight}
      />

      <TunerConfigExporterBar
        badge="5B-EXPORT"
        title="Charts & Curves Parameter Tuner & One-Click Config Exporter"
        subtitle="Exports 5B Sparkline telemetry channel, Collision impulse threshold & events, Big Boost Orb Bezier trajectory & Hologram dissolve curve"
        copyLabel="Copy 5B Charts Config (Export Snapshot)"
        codeTitle="Current 5B Charts & Curves Parameter Snapshot (Paste directly into DEFAULT_5B_CHARTS_AND_CURVES_SNAPSHOT)"
        actionId="export-5b-charts-config"
        isLight={isLight}
        buildExportCode={buildExportCode}
        onResetDefaults={handleResetDefaults}
      />

      <div
        className={`p-5 rounded-2xl border grid grid-cols-1 md:grid-cols-2 gap-4 text-xs ${
          isLight
            ? 'bg-white border-neutral-200 shadow-2xs'
            : 'bg-neutral-900/60 border-neutral-800'
        }`}
      >
        <div
          className={`p-4 rounded-xl border flex flex-col gap-2 ${
            isLight
              ? 'bg-red-50/60 border-red-200'
              : 'bg-red-950/30 border-red-800/60'
          }`}
        >
          <div className="flex items-center gap-2 font-bold text-red-500">
            <XCircle className="h-4 w-4 shrink-0" />
            <span>Original chart and periodicity GC Root cause of stutter</span>
          </div>
          <ul className="space-y-1.5 list-disc list-inside text-[11px] opacity-90">
            <li>
              <strong>
                Create per frame <code className="font-mono">createLinearGradient</code> Trigger C++
                Skia Memory accumulation
              </strong>
              : 120Hz Per minute generation 7200 Native shader objects, Run 2~3 Trigger after
              minutes V8 Major GC and GPU Cache centralized reclamation causes severe lag.
            </li>
            <li>
              <strong>
                Per Frame <code className="font-mono">.subarray()</code> with full sorting
              </strong>
              : 120Hz Create every frame TypedArray Wrap header and copy sort 240 float numbers.
            </li>
            <li>
              <strong>
                Unconditional modification DOM <code className="font-mono">.className</code>
              </strong>
              : causes browser CSS Engine triggers every frame Recalculate Style.
            </li>
            <li>
              <strong>
                <code className="font-mono">setInterval(8.33)</code> and VSync Conflict
              </strong>
              : Timer drift and callback queue backlog in background.
            </li>
          </ul>
        </div>

        <div
          className={`p-4 rounded-xl border flex flex-col gap-2 ${
            isLight
              ? 'bg-emerald-50/60 border-emerald-200'
              : 'bg-emerald-950/30 border-emerald-800/60'
          }`}
        >
          <div className="flex items-center gap-2 font-bold text-emerald-500">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span>RCUITuner 120Hz Zero-allocation steady-state architecture</span>
          </div>
          <ul className="space-y-1.5 list-disc list-inside text-[11px] opacity-90">
            <li>
              <strong>
                Shader and context resident cache (<code className="font-mono">CanvasRenderCache</code>)
              </strong>
              : <code className="font-mono">CanvasGradient</code> Global reuse with dashed arrays,
              Per Frame 0 Native object allocation.
            </li>
            <li>
              <strong>
                O(1) Circular index direct read (<code className="font-mono">getAt(i)</code>) + 12Hz
                Downsampled quantile sort
              </strong>
              : 120Hz Waveform read directly via circular offset, P50/P95/P99 Quantile per 10
              In-place frame insertion sort once.
            </li>
            <li>
              <strong>Dirty-Checked DOM Text update</strong>: Write only when the formatted string
              or alert boolean actually changes DOM, 0 Redundant style recalculation.
            </li>
            <li>
              <strong>
                Single VSync <code className="font-mono">requestAnimationFrame</code> Stepper
              </strong>
              : With 34ms Step clamp protection, Never backlog during long idle.
            </li>
          </ul>
        </div>
      </div>

      {/* Chart 1: TelemetrySparklineChart */}
      <ChartsTelemetrySparklineSection isLight={isLight} />

      {/* Chart 2: EventImpulseScatterChart */}
      <div
        id="chart-5b-2-scatter"
        className={`scroll-mt-6 p-6 rounded-2xl border flex flex-col gap-4 ${
          isLight
            ? 'bg-white border-neutral-200 shadow-2xs'
            : 'bg-neutral-900/60 border-neutral-800'
        }`}
      >
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-amber-500" />
            <span className="font-bold text-sm">
              2. Physical collision impulse scatter plot and audio threshold tracking chart (EventImpulseScatterChart)
            </span>
          </div>
          <Button
            size="sm"
            variant="secondary"
            isLight={isLight}
            icon={<Plus className="h-3.5 w-3.5 text-amber-500" />}
            onClick={emitCollisionBurst}
          >
            Trigger random physics collision (Emit Collision)
          </Button>
        </div>
        <p className={`text-xs ${isLight ? 'text-neutral-500' : 'text-neutral-400'}`}>
          Use vertical pulse bar (Lollipop Stem) + Circular scatter plot, Clearly distinguish above
          audio threshold (Highlight stroke) Muted when below threshold (Translucent gray) collision
          events. Automatic snapping and locking when mouse nears scatter points:
        </p>
        <EventImpulseScatterChart
          events={events}
          threshold={threshold}
          onThresholdChange={setThreshold}
          onClear={() => setEvents([])}
          isLight={isLight}
        />
      </div>

      {/* Chart 3 & 4: CubicBezierCurveEditor + ParametricTrajectoryChart */}
      <ChartsBezierTrajectorySection isLight={isLight} />

      {/* Chart 5: PacingOscilloscopeChart */}
      <div
        id="chart-5b-5-pacing"
        className={`scroll-mt-6 p-6 rounded-2xl border flex flex-col gap-4 ${
          isLight
            ? 'bg-white border-neutral-200 shadow-2xs'
            : 'bg-neutral-900/60 border-neutral-800'
        }`}
      >
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-amber-500" />
            <span className="font-bold text-sm">
              5. Three-channel synchronized clock pacing and buffer dead-zone oscilloscope (PacingOscilloscopeChart · Pre-Allocated PacingRingBuffer)
            </span>
          </div>
          <Badge size="sm" variant="amber" isLight={isLight}>
            Float32Array + Uint8Array · 0 React Re-render
          </Badge>
        </div>
        <PacingOscilloscopeChart isLight={isLight} />
      </div>

      {/* Chart 6: GoalBarrier2DEditor */}
      <div
        id="chart-5b-6-barrier"
        className={`scroll-mt-6 p-6 rounded-2xl border flex flex-col gap-4 ${
          isLight
            ? 'bg-white border-neutral-200 shadow-2xs'
            : 'bg-neutral-900/60 border-neutral-800'
        }`}
      >
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Spline className="h-4 w-4 text-amber-500" />
            <span className="font-bold text-sm">
              6. Goal boolean mask 2D Geometry editor (GoalBarrier2DEditor · 1792 × 644 UU Orthogonal snap decomposition)
            </span>
          </div>
          <Badge size="sm" variant="neutral" isLight={isLight}>
            New / Add / Subtract / Clear · Disjoint Quad Decomposition
          </Badge>
        </div>
        <GoalBarrier2DEditor isLight={isLight} />
      </div>

      {/* Chart 7: MultiTrackReplayTimeline */}
      <div
        id="chart-5b-7-timeline"
        className={`scroll-mt-6 p-6 rounded-2xl border flex flex-col gap-4 ${
          isLight
            ? 'bg-white border-neutral-200 shadow-2xs'
            : 'bg-neutral-900/60 border-neutral-800'
        }`}
      >
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Gauge className="h-4 w-4 text-amber-500" />
            <span className="font-bold text-sm">
              7. Three-track synchronized playback and input signal timeline (MultiTrackReplayTimeline · 120Hz Playhead Ref)
            </span>
          </div>
          <Badge size="sm" variant="amber" isLight={isLight}>
            Track A Input · Track B Incidents · Track C Signals
          </Badge>
        </div>
        <MultiTrackReplayTimeline isLight={isLight} />
      </div>

      {/* Live Agent Code Recipe */}
      <CodeBlock
        isLight={isLight}
        title="Agent High-performance clear chart calling recipe (Reflects Current 5B Parameters)"
        code={`import {
  TelemetryRingBuffer, TelemetrySparklineChart, EventImpulseScatterChart, CubicBezierCurveEditor,
  ParametricTrajectoryChart, PacingOscilloscopeChart, GoalBarrier2DEditor, MultiTrackReplayTimeline,
} from '@/ui-core/charts/TelemetrySparklineChart';

// 1. 120Hz Zero-allocation mode (${telemetryPreset} preset, budget=${isNetPreset ? 24.0 : 8.33}ms):
const rttRingBuffer = new TelemetryRingBuffer(240);
rttRingBuffer.push(latestSampleMs);

<TelemetrySparklineChart
  ringBuffer={rttRingBuffer}
  budgetMs={${isNetPreset ? 24.0 : 8.33}}
  refreshHz={120}
  isLight={isLight}
/>

// 2. Parametric Boost Orb Trajectory (${orbDurationMs}ms, ${orbDropDistance}uu, threshold=${threshold}):
<ParametricTrajectoryChart
  p1x={${orbBezier.p1x}}
  p1y={${orbBezier.p1y}}
  p2x={${orbBezier.p2x}}
  p2y={${orbBezier.p2y}}
  durationMs={${orbDurationMs}}
  dropDistance={${orbDropDistance}}
  isLight={isLight}
/>`}
      />
    </div>
  );
};
