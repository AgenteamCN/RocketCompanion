/**
 * multiplayerRoomReproLogInterceptor.ts
 * Console and window error interceptor for Multiplayer Room Reproduction runs.
 * Captures PredictionReconciler timeline snap logs, NetworkInputBuffer input
 * starvation warnings, WebRTC DataChannel open transitions, and readonly
 * measuredRttMs TypeErrors, streaming samples in real time.
 */

import { emitReproStreamEvent } from './multiplayerRoomReproProbePipeline.ts';
import type {
  ReproInputStarvationSample,
  ReproReconcilerDesyncSample,
  ReproRole,
  ReproRosterMode,
} from './multiplayerRoomReproTypes.ts';

const RECONCILER_SNAP_RE =
  /\[PredictionReconciler\] Timeline sync aligned \(currentDelta:\s*(-?\d+),\s*target:\s*(-?\d+),\s*rollbackDepth:\s*(-?\d+)\)\.\s*Snapping timeline to server tick\s*(\d+)/;
const INPUT_STARVATION_RE =
  /\[NetworkInputBuffer\] Input starvation for car #(\d+) at tick #(\d+) \(total starvations:\s*(\d+)\)/;

export interface ReproLogInterceptorState {
  readonly reconcilerSamples: ReproReconcilerDesyncSample[];
  readonly starvationSamples: ReproInputStarvationSample[];
  readonly caughtErrors: string[];
  reconcilerSnapLogCount: number;
  inputStarvationLogCount: number;
  readonlyRttTypeErrorCount: number;
  bridgedDataChannelOpened: boolean;
}

export function createReproLogInterceptorState(): ReproLogInterceptorState {
  return {
    reconcilerSamples: [],
    starvationSamples: [],
    caughtErrors: [],
    reconcilerSnapLogCount: 0,
    inputStarvationLogCount: 0,
    readonlyRttTypeErrorCount: 0,
    bridgedDataChannelOpened: false,
  };
}

export function installReproConsoleAndErrorInterceptors(
  role: ReproRole,
  rosterMode: ReproRosterMode,
  getElapsedMs: () => number,
  state: ReproLogInterceptorState
): void {
  const inspectText = (text: string, isErrorChannel: boolean): void => {
    const snapMatch = text.match(RECONCILER_SNAP_RE);
    if (snapMatch) {
      state.reconcilerSnapLogCount++;
      const sample: ReproReconcilerDesyncSample = {
        elapsedMs: getElapsedMs(),
        currentDelta: Number(snapMatch[1]),
        targetDelta: Number(snapMatch[2]),
        rollbackDepth: Number(snapMatch[3]),
        serverTick: Number(snapMatch[4]),
        rawLog: text,
      };
      if (state.reconcilerSamples.length < 30) {
        state.reconcilerSamples.push(sample);
      }
      if (state.reconcilerSnapLogCount <= 8 || state.reconcilerSnapLogCount % 5 === 0) {
        emitReproStreamEvent({
          type: 'reconciler_snap',
          role,
          rosterMode,
          sample,
        });
      }
    }

    const starveMatch = text.match(INPUT_STARVATION_RE);
    if (starveMatch) {
      state.inputStarvationLogCount++;
      const sample: ReproInputStarvationSample = {
        elapsedMs: getElapsedMs(),
        carIndex: Number(starveMatch[1]),
        tick: Number(starveMatch[2]),
        totalStarvations: Number(starveMatch[3]),
        rawLog: text,
      };
      if (state.starvationSamples.length < 30) {
        state.starvationSamples.push(sample);
      }
      if (state.inputStarvationLogCount <= 12) {
        emitReproStreamEvent({
          type: 'input_starvation',
          role,
          rosterMode,
          sample,
        });
      }
    }

    if (text.includes('DataChannel "game_net" OPEN!')) {
      state.bridgedDataChannelOpened = true;
    }

    if (
      text.includes('measuredRttMs') ||
      text.includes('Attempted to assign to readonly property')
    ) {
      state.readonlyRttTypeErrorCount++;
      if (state.caughtErrors.length < 25) {
        state.caughtErrors.push(text);
      }
      if (state.readonlyRttTypeErrorCount <= 6) {
        emitReproStreamEvent({
          type: 'runtime_error',
          role,
          rosterMode,
          elapsedMs: getElapsedMs(),
          errorText: text,
        });
      }
    } else if (
      isErrorChannel &&
      !text.includes('[ReproStream]') &&
      !text.includes('WebSocket is closed') &&
      state.caughtErrors.length < 25
    ) {
      state.caughtErrors.push(text);
    }
  };

  const origLog = console.log.bind(console);
  const origWarn = console.warn.bind(console);
  const origErr = console.error.bind(console);

  console.log = (...args: unknown[]) => {
    origLog(...args);
    inspectText(args.map(String).join(' '), false);
  };
  console.warn = (...args: unknown[]) => {
    origWarn(...args);
    inspectText(args.map(String).join(' '), false);
  };
  console.error = (...args: unknown[]) => {
    origErr(...args);
    inspectText(args.map(String).join(' '), true);
  };

  if (typeof window !== 'undefined') {
    window.addEventListener('error', (ev) => {
      const msg = `${ev.message} (${ev.filename}:${ev.lineno})`;
      inspectText(msg, true);
    });
    window.addEventListener('unhandledrejection', (ev) => {
      const msg = `UnhandledRejection: ${String(ev.reason)}`;
      inspectText(msg, true);
    });
  }
}
