/**
 * frameBudgetScheduler.ts
 * Lightweight frame-budget yielding and progress-throttling primitives for
 * background asset streaming, audio DSP conditioning, and neural policy loading.
 *
 * Ensures post-ignition background work yields to the 120Hz WebGL render loop
 * and avoids flooding React/Zustand/localStorage on every individual asset tick.
 */

interface IdleDeadlineLike {
  readonly didTimeout: boolean;
  timeRemaining(): number;
}

type RequestIdleCallbackFn = (
  callback: (deadline: IdleDeadlineLike) => void,
  options?: { timeout?: number }
) => number;

/**
 * Yields until after the next display frame (or a short timer fallback when the
 * document is hidden / running in a headless environment) so background CPU work
 * does not contend with the active render/simulation tick.
 */
export function yieldToNextFrame(maxWaitMs = 24): Promise<void> {
  if (
    typeof window !== 'undefined' &&
    typeof window.requestAnimationFrame === 'function' &&
    (typeof document === 'undefined' || !document.hidden)
  ) {
    return new Promise((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        resolve();
      };
      const fallbackTimer = setTimeout(finish, maxWaitMs);
      window.requestAnimationFrame(() => {
        clearTimeout(fallbackTimer);
        setTimeout(finish, 0);
      });
    });
  }
  return new Promise((resolve) => setTimeout(resolve, 4));
}

/**
 * Yields to an idle slice when `requestIdleCallback` is available, or falls back
 * to `yieldToNextFrame` + a bounded delay.
 */
export function yieldIdleSlice(timeoutMs = 32): Promise<void> {
  if (typeof window !== 'undefined' && (typeof document === 'undefined' || !document.hidden)) {
    const ric = (window as Window & { requestIdleCallback?: RequestIdleCallbackFn })
      .requestIdleCallback;
    if (typeof ric === 'function') {
      return new Promise((resolve) => {
        let settled = false;
        const finish = () => {
          if (settled) return;
          settled = true;
          resolve();
        };
        const timer = setTimeout(finish, timeoutMs + 16);
        ric(
          () => {
            clearTimeout(timer);
            finish();
          },
          { timeout: timeoutMs }
        );
      });
    }
  }
  return yieldToNextFrame(timeoutMs);
}

/**
 * Wraps a high-frequency progress callback so UI store mutations happen at most
 * once per `minIntervalMs` (while always forwarding final `ratio >= 1` updates).
 */
export function createThrottledProgressReporter<TArgs extends unknown[]>(
  minIntervalMs: number,
  callback: (...args: TArgs) => void
): {
  report: (isFinal: boolean, ...args: TArgs) => void;
  flush: (...args: TArgs) => void;
} {
  let lastEmitTime = -Infinity;
  return {
    report(isFinal: boolean, ...args: TArgs): void {
      const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
      if (isFinal || now - lastEmitTime >= minIntervalMs) {
        lastEmitTime = now;
        callback(...args);
      }
    },
    flush(...args: TArgs): void {
      lastEmitTime = typeof performance !== 'undefined' ? performance.now() : Date.now();
      callback(...args);
    },
  };
}
