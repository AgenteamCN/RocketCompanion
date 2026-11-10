import React, { useEffect, useRef } from 'react';
import { Loader2 } from 'lucide-react';
import { createScopedSyncedState } from '../stores/crossClientSync';
import { LoadingStep, LoadingError } from '../components/loading/types';
import { calculateOverallProgress } from '../components/loading/DualProgressBar';
import { LoadingScreen } from '../components/loading/LoadingScreen';
import { GameViewport } from '../components/GameViewport';
import { LoadingStepInspectorGrid } from './loading/LoadingStepInspectorGrid';
import { LoadingPipelineControlDeck } from './loading/LoadingPipelineControlDeck';

const useState = createScopedSyncedState('page:loading-screen');

export interface LoadingScreenPreviewPageProps {
  isLight?: boolean;
}

const INITIAL_STEPS: LoadingStep[] = [
  {
    id: 'wasm-init',
    title: 'Initializing WebAssembly SIMD Engine',
    category: 'Runtime Core',
    type: 'indeterminate',
    status: 'completed',
    indeterminateHint: 'Compiling 128-bit SIMD bytecode · Thread pool spawned (4 workers)',
  },
  {
    id: 'phys-alloc',
    title: 'Allocating Shared Physics Memory Ring',
    category: 'Physics & State',
    type: 'determinate',
    status: 'completed',
    progressPct: 100,
    bytesLoaded: 33554432,
    bytesTotal: 33554432,
    speedBps: 120000000,
  },
  {
    id: 'arena-download',
    title: 'Downloading Champions Field Geometry & High-Res Textures',
    category: 'Asset Pipeline',
    type: 'determinate',
    status: 'active',
    progressPct: 68,
    bytesLoaded: 149520000,
    bytesTotal: 220200960,
    speedBps: 29800000,
    timeRemainingSec: 2.4,
  },
  {
    id: 'shader-compile',
    title: 'Compiling WebGPU PBR Uber-Shaders',
    category: 'Graphics Pipeline',
    type: 'indeterminate',
    status: 'pending',
    indeterminateHint:
      'Warming graphics pipeline cache (18/64 variants) · WebGPU active, not frozen',
  },
  {
    id: 'soundbank-load',
    title: 'Decompressing Spatial Audio Soundbanks',
    category: 'Audio Engine',
    type: 'determinate',
    status: 'pending',
    progressPct: 0,
    bytesLoaded: 0,
    bytesTotal: 58720256,
    speedBps: 18500000,
  },
  {
    id: 'match-handshake',
    title: 'Establishing Sub-Tick Server Handshake',
    category: 'Network Protocol',
    type: 'indeterminate',
    status: 'pending',
    indeterminateHint: 'Negotiating 120Hz sub-tick synchronizer · Session handshake verified',
  },
];

export const LoadingScreenPreviewPage: React.FC<LoadingScreenPreviewPageProps> = ({
  isLight = false,
}) => {
  const [steps, setSteps] = useState<LoadingStep[]>(INITIAL_STEPS, 'steps');
  const [currentStepIndex, setCurrentStepIndex] = useState<number>(2, 'currentStepIndex');
  const [isRunning, setIsRunning] = useState<boolean>(false, 'isRunning');
  const [simSpeed, setSimSpeed] = useState<number>(1, 'simSpeed');
  const [error, setError] = useState<LoadingError | null>(null, 'error');
  const [stageIsLight, setStageIsLight] = useState<boolean>(isLight, 'stageIsLight');
  const [feedbackToast, setFeedbackToast] = useState<string | null>(null, 'feedbackToast');
  const waitCountRef = useRef<Record<string, number>>({});

  useEffect(() => {
    setStageIsLight(isLight);
  }, [isLight]);

  const showToast = (msg: string) => {
    setFeedbackToast(msg);
    setTimeout(() => setFeedbackToast(null), 2400);
  };

  const overallProgressPct = calculateOverallProgress(steps, currentStepIndex);

  const handleStepProgressChange = (stepIdx: number, newPct: number) => {
    if (isRunning) setIsRunning(false);

    setSteps((prev) =>
      prev.map((s, idx) => {
        if (idx !== stepIdx) return s;
        const total = s.bytesTotal || 100;
        const loaded = (newPct / 100) * total;
        const isDone = newPct >= 100;
        return {
          ...s,
          progressPct: newPct,
          bytesLoaded: loaded,
          status: isDone ? 'completed' : idx === currentStepIndex ? 'active' : s.status,
          timeRemainingSec: isDone
            ? 0
            : Math.max(0.5, (total - loaded) / (s.speedBps || 25000000)),
        };
      })
    );
  };

  useEffect(() => {
    if (!isRunning || error) return;

    const interval = window.setInterval(() => {
      setSteps((prevSteps) => {
        const nextSteps = [...prevSteps];
        const step = nextSteps[currentStepIndex];
        if (!step) return prevSteps;

        if (step.type === 'determinate') {
          const total = step.bytesTotal || 100;
          const loaded = (step.bytesLoaded || 0) + total * 0.03 * simSpeed;
          const newPct = Math.min(100, (loaded / total) * 100);
          const remainingSec = Math.max(0, (total - loaded) / (step.speedBps || 25000000));

          if (newPct >= 100) {
            nextSteps[currentStepIndex] = {
              ...step,
              status: 'completed',
              progressPct: 100,
              bytesLoaded: total,
              timeRemainingSec: 0,
            };

            if (currentStepIndex < nextSteps.length - 1) {
              const nextIdx = currentStepIndex + 1;
              setCurrentStepIndex(nextIdx);
              nextSteps[nextIdx] = {
                ...nextSteps[nextIdx],
                status: 'active',
              };
            } else {
              setIsRunning(false);
              showToast('[ok] Pipeline loading complete (All Steps Complete!)');
            }
          } else {
            nextSteps[currentStepIndex] = {
              ...step,
              status: 'active',
              progressPct: newPct,
              bytesLoaded: loaded,
              timeRemainingSec: remainingSec,
            };
          }
        } else {
          const waitCounter = waitCountRef.current[step.id] ?? 0;
          if (waitCounter > 25 / simSpeed) {
            waitCountRef.current[step.id] = 0;
            nextSteps[currentStepIndex] = {
              ...step,
              status: 'completed',
            };
            if (currentStepIndex < nextSteps.length - 1) {
              const nextIdx = currentStepIndex + 1;
              setCurrentStepIndex(nextIdx);
              nextSteps[nextIdx] = {
                ...nextSteps[nextIdx],
                status: 'active',
              };
            } else {
              setIsRunning(false);
              showToast('[ok] Pipeline loading complete (All Steps Complete!)');
            }
          } else {
            waitCountRef.current[step.id] = waitCounter + 1;
          }
        }

        return nextSteps;
      });
    }, 100);

    return () => clearInterval(interval);
  }, [isRunning, error, currentStepIndex, simSpeed, steps.length]);

  const triggerSimulatedError = () => {
    setIsRunning(false);
    const activeStep = steps[currentStepIndex] || steps[0];
    const newError: LoadingError = {
      code: 'ERR_SHADER_COMPILATION',
      title: 'Failed to Compile WebGPU PBR Uber-Shaders',
      message:
        'ShaderCompilationError: Syntax error parsing shader module "arena_turf.wgsl" at line 42, col 15: unexpected token "vec3_unorm". Pipeline creation aborted.',
      stepId: activeStep.id,
      technicalDetails: [
        'Error 0x80041002 (WGSL_PARSE_ERROR)',
        '  --> arena_turf.wgsl:42:15',
        '   |',
        '42 | let ambient: vec3_unorm = compute_sky_irradiance();',
        '   |              ^^^^^^^^^ unknown type',
        '   at WebGpuBackend.compileModule (wasm_glue.js:148)',
      ].join('\n'),
      retryable: true,
      timestamp: Date.now(),
    };
    setError(newError);

    setSteps((prev) =>
      prev.map((s, idx) => (idx === currentStepIndex ? { ...s, status: 'error' } : s))
    );
    showToast('[Alert] Error trigger simulated (Throw Error Active)');
  };

  const handleRecoverError = () => {
    setError(null);
    setSteps((prev) =>
      prev.map((s, idx) =>
        idx === currentStepIndex
          ? {
              ...s,
              status: 'active',
              errorDetails: undefined,
            }
          : s
      )
    );
    setIsRunning(true);
    showToast('[ok] Errors cleared and loading pipeline restored');
  };

  const handleReset = () => {
    setIsRunning(false);
    setError(null);
    setCurrentStepIndex(0);
    waitCountRef.current = {};
    setSteps(
      INITIAL_STEPS.map((s, idx) => ({
        ...s,
        status: idx === 0 ? 'active' : 'pending',
        progressPct: 0,
        bytesLoaded: 0,
      }))
    );
    showToast('Loading process reset (Pipeline Reset)');
  };

  const jumpToStep = (index: number) => {
    setError(null);
    setCurrentStepIndex(index);
    waitCountRef.current = {};
    setSteps((prev) =>
      prev.map((s, idx) => ({
        ...s,
        status: idx < index ? 'completed' : idx === index ? 'active' : 'pending',
        progressPct: idx < index ? 100 : idx === index ? s.progressPct || 40 : 0,
        bytesLoaded:
          idx < index
            ? s.bytesTotal
            : idx === index
            ? s.bytesTotal
              ? s.bytesTotal * 0.4
              : 0
            : 0,
      }))
    );
    showToast(`Jump to step ${index + 1}: ${steps[index]?.title}`);
  };

  return (
    <div className="flex flex-col gap-6 w-full">
      {/* 1. Header Toolbar (100% Static — no dynamic buttons or spinning states above View Box) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-neutral-200/80 dark:border-neutral-800">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-sky-500/10 text-sky-500 flex items-center justify-center">
            <Loader2 className="h-5 w-5" />
          </div>
          <div className="flex flex-col">
            <h1 className="text-2xl font-bold tracking-tight">
              Loading Screen &amp; Dual-Layer Progress Bar
            </h1>
            <span className="text-xs text-neutral-500 dark:text-neutral-400 font-mono">
              Two-layer step-by-step advancement · Determinate state download and indeterminate
              state compilation (Apple Minimalist design) · Exception circuit breaker
            </span>
          </div>
        </div>
      </div>

      {/* 2. Live 18:9 Canvas Simulation Stage (View Box — Pinned directly below static Page Header) */}
      <div
        id="loading-viewport-stage"
        className="relative w-full h-[520px] md:h-[580px] rounded-3xl border border-neutral-300 dark:border-neutral-800 overflow-hidden shadow-2xl flex items-center justify-center transition-all duration-300"
      >
        <GameViewport isLight={stageIsLight} className="w-full h-full">
          <LoadingScreen
            steps={steps}
            currentStepIndex={currentStepIndex}
            overallProgressPct={overallProgressPct}
            error={error}
            isLight={stageIsLight}
            appTitle="Rocket Companion"
            appSubtitle="RCUITuner Simulation Environment"
            onRetry={handleRecoverError}
            onReset={handleReset}
          />
        </GameViewport>
      </div>

      {/* 3. Interactive Pipeline Control Simulator */}
      <LoadingPipelineControlDeck
        isLight={isLight}
        steps={steps}
        overallProgressPct={overallProgressPct}
        showToast={showToast}
        onReset={handleReset}
        onTriggerError={triggerSimulatedError}
        onRecoverError={handleRecoverError}
        onJumpToStep={jumpToStep}
        onStepProgressChange={handleStepProgressChange}
      />

      {/* 4. Deep Pipeline Step Inspector */}
      <LoadingStepInspectorGrid
        steps={steps}
        currentStepIndex={currentStepIndex}
        isLight={isLight}
        onJumpToStep={jumpToStep}
        onStepProgressChange={handleStepProgressChange}
      />
    </div>
  );
};
