/**
 * scenarioRuntimeErrorInterceptor.ts
 * Zero-escape runtime error interception (`window.onerror`, `unhandledrejection`,
 * `console.error`) and headless browser focus/visibility environment guards for
 * deterministic VirtualClock scenario runs.
 */

const roundMs = (val: number): number => Math.round(val * 100) / 100;

export interface CapturedRuntimeErrorEntry {
  tick: number;
  virtualTimeMs: number;
  source: 'window.onerror' | 'unhandledrejection' | 'console.error';
  message: string;
  stack?: string;
  fileName?: string;
  lineNumber?: number;
  columnNumber?: number;
}

export interface RuntimeErrorInterceptionSummary {
  windowErrorCount: number;
  unhandledRejectionCount: number;
  consoleErrorCount: number;
  totalErrorCount: number;
  entries: CapturedRuntimeErrorEntry[];
}

export interface RuntimeErrorInterceptorHandle {
  buildSummary(): RuntimeErrorInterceptionSummary;
  dispose(): void;
}

export function formatConsoleErrorArgs(args: readonly unknown[]): {
  message: string;
  stack?: string;
  fileName?: string;
  lineNumber?: number;
  columnNumber?: number;
} {
  let stack: string | undefined;
  const parts: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a instanceof Error) {
      parts.push(a.message || String(a));
      if (!stack && a.stack) stack = a.stack;
    } else if (typeof a === 'object' && a !== null) {
      try {
        parts.push(JSON.stringify(a));
      } catch {
        parts.push(String(a));
      }
    } else {
      parts.push(String(a));
    }
  }

  if (!stack) {
    try {
      stack = new Error().stack;
    } catch {
      /* ignore */
    }
  }

  let fileName: string | undefined;
  let lineNumber: number | undefined;
  let columnNumber: number | undefined;

  if (stack) {
    for (const l of stack.split('\n').slice(1)) {
      if (l.includes('VirtualClockFastForwardDriver') || l.includes('scenarioRuntimeError'))
        continue;
      const m = l.match(/(?:https?:\/\/[^/\s]+)?(\/[^\s:)]+):(\d+):(\d+)/);
      if (m) {
        fileName = m[1];
        lineNumber = Number(m[2]);
        columnNumber = Number(m[3]);
        break;
      }
    }
  }

  return { message: parts.join(' ').slice(0, 600), stack, fileName, lineNumber, columnNumber };
}

export function attachRuntimeErrorInterceptors(
  getTickAndVirtualOffsetMs: () => { tick: number; virtualOffsetMs: number }
): RuntimeErrorInterceptorHandle {
  const entries: CapturedRuntimeErrorEntry[] = [];
  let windowErrorCount = 0;
  let unhandledRejectionCount = 0;
  let consoleErrorCount = 0;
  const origConsoleError = console.error;
  const origHasFocus =
    typeof document !== 'undefined' && typeof document.hasFocus === 'function'
      ? document.hasFocus.bind(document)
      : null;
  const origHiddenDescriptor =
    typeof document !== 'undefined'
      ? Object.getOwnPropertyDescriptor(Document.prototype, 'hidden') ||
        Object.getOwnPropertyDescriptor(document, 'hidden')
      : undefined;

  if (typeof document !== 'undefined') {
    try {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
      document.hasFocus = () => true;
    } catch {
      /* ignore */
    }
  }

  const onWindowError = (ev: ErrorEvent) => {
    windowErrorCount++;
    const { tick, virtualOffsetMs } = getTickAndVirtualOffsetMs();
    entries.push({
      tick,
      virtualTimeMs: roundMs(virtualOffsetMs),
      source: 'window.onerror',
      message: ev.message || String(ev.error || 'Uncaught window error'),
      stack: ev.error?.stack,
      fileName: ev.filename,
      lineNumber: ev.lineno,
      columnNumber: ev.colno,
    });
  };

  const onUnhandledRejection = (ev: PromiseRejectionEvent) => {
    unhandledRejectionCount++;
    const { tick, virtualOffsetMs } = getTickAndVirtualOffsetMs();
    const f = formatConsoleErrorArgs([ev.reason]);
    entries.push({
      tick,
      virtualTimeMs: roundMs(virtualOffsetMs),
      source: 'unhandledrejection',
      message: f.message || 'Unhandled Promise Rejection',
      stack: f.stack,
      fileName: f.fileName,
      lineNumber: f.lineNumber,
      columnNumber: f.columnNumber,
    });
  };

  if (typeof window !== 'undefined') {
    window.addEventListener('error', onWindowError);
    window.addEventListener('unhandledrejection', onUnhandledRejection);
  }

  console.error = (...args: unknown[]) => {
    consoleErrorCount++;
    const { tick, virtualOffsetMs } = getTickAndVirtualOffsetMs();
    const f = formatConsoleErrorArgs(args);
    entries.push({
      tick,
      virtualTimeMs: roundMs(virtualOffsetMs),
      source: 'console.error',
      message: f.message,
      stack: f.stack,
      fileName: f.fileName,
      lineNumber: f.lineNumber,
      columnNumber: f.columnNumber,
    });
    origConsoleError.apply(console, args);
  };

  return {
    buildSummary(): RuntimeErrorInterceptionSummary {
      return {
        windowErrorCount,
        unhandledRejectionCount,
        consoleErrorCount,
        totalErrorCount: windowErrorCount + unhandledRejectionCount + consoleErrorCount,
        entries: [...entries],
      };
    },
    dispose(): void {
      console.error = origConsoleError;
      if (typeof window !== 'undefined') {
        window.removeEventListener('error', onWindowError);
        window.removeEventListener('unhandledrejection', onUnhandledRejection);
      }
      if (typeof document !== 'undefined') {
        try {
          if (origHasFocus) document.hasFocus = origHasFocus;
          if (origHiddenDescriptor) Object.defineProperty(document, 'hidden', origHiddenDescriptor);
        } catch {
          /* ignore */
        }
      }
    },
  };
}
