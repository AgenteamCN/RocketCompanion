/**
 * RenderClockScheduler.ts
 * High-performance WebGL render loop scheduler.
 *
 * Decouples requestAnimationFrame display measurement from GPU command execution
 * using MessageChannel micro-ticks and WebGL2 fenceSync (SYNC_GPU_COMMANDS_COMPLETE).
 * Supports dynamic FPS limiting (60, 120, 144, 240, or unlocked).
 */

const SIM_INTERVAL_MS = 1000 / 120;

export type RenderTickCallback = (timestamp: number) => boolean | void;
export type DisplayFrameCallback = (timestamp: number) => void;
export type SimulationTickCallback = (timestamp: number) => void;

export class RenderClockScheduler {
  readonly channel: MessageChannel;
  readonly pending: WebGLSync[];
  readonly gl: WebGL2RenderingContext | null;
  readonly render: RenderTickCallback;
  readonly displayFrame: DisplayFrameCallback;
  readonly simulate: SimulationTickCallback | null;
  running = false;
  queued = false;
  displayRequest: number | null = null;
  frameTimer: ReturnType<typeof setTimeout> | null = null;
  frameTask: AbortController | null = null;
  frameInterval = 0;
  unfocusedFrameInterval = 1000 / 30;
  nextFrameTime = 0;
  nextSimTime = 0;
  lastRenderResult = true;
  lastTickTime = 0;
  readonly wake: () => void;
  readonly measureDisplay: (time: number) => void;
  readonly queueTick: () => void;
  readonly tick: () => void;

  constructor(
    gl: WebGL2RenderingContext | WebGLRenderingContext | null,
    renderCallback: RenderTickCallback,
    displayFrameCallback: DisplayFrameCallback,
    simulationCallback: SimulationTickCallback | null = null
  ) {
    this.channel = new MessageChannel();
    this.pending = [];
    this.gl = (gl as WebGL2RenderingContext | null) ?? null;
    this.render = renderCallback;
    this.displayFrame = displayFrameCallback;
    this.simulate = simulationCallback;

    this.wake = () => {
      if (!this.active()) {
        this.clearFrameTimer();
        this.nextFrameTime = 0;
        this.nextSimTime = 0;
        this.clearPending();
        if (this.displayRequest !== null) {
          cancelAnimationFrame(this.displayRequest);
          this.displayRequest = null;
        }
        return;
      }

      if (typeof document !== 'undefined' && document.hidden) {
        if (this.displayRequest !== null && typeof cancelAnimationFrame === 'function') {
          cancelAnimationFrame(this.displayRequest);
          this.displayRequest = null;
        }
        this.clearPending();
      } else if (this.displayRequest === null && typeof requestAnimationFrame === 'function') {
        this.displayRequest = requestAnimationFrame(this.measureDisplay);
      }
      this.nextFrameTime = 0;
      this.clearFrameTimer();
      this.schedule();
    };

    this.measureDisplay = (time: number) => {
      this.displayRequest = null;
      if (this.active() && typeof document !== 'undefined' && !document.hidden) {
        this.displayFrame(time);
        if (typeof requestAnimationFrame === 'function') {
          this.displayRequest = requestAnimationFrame(this.measureDisplay);
        }
      }
    };

    this.queueTick = () => {
      this.frameTimer = null;
      this.frameTask = null;
      if (!this.queued && this.active()) {
        this.queued = true;
        this.channel.port2.postMessage(null);
      }
    };

    this.tick = () => {
      this.queued = false;
      if (!this.active()) return;

      const now = performance.now();
      const glCtx = this.gl;
      const effectiveFrameInterval = this._getEffectiveFrameInterval();
      if (effectiveFrameInterval > 0 && now < this.nextFrameTime - 0.1) {
        if (this.simulate && now >= this.nextSimTime - 0.1) {
          const simTarget = this.nextSimTime + SIM_INTERVAL_MS;
          this.nextSimTime = simTarget > now ? simTarget : now + SIM_INTERVAL_MS;
          try {
            this.simulate(now);
          } catch (simErr) {
            console.error('[RenderClockScheduler] Uncaught error during simulation tick:', simErr);
          }
        }
        this.schedule();
        return;
      }

      if (glCtx && typeof glCtx.clientWaitSync === 'function') {
        while (this.pending.length > 0) {
          const syncStatus = glCtx.clientWaitSync(this.pending[0], 0, 0);
          if (syncStatus === glCtx.TIMEOUT_EXPIRED) break;
          if (syncStatus === glCtx.WAIT_FAILED) {
            this.dispose();
            throw new Error('Could not check completion of a rendered frame.');
          }
          const completedSync = this.pending.shift();
          if (completedSync) {
            glCtx.deleteSync(completedSync);
          }
        }
      }

      if (!glCtx || this.pending.length < 2) {
        if (effectiveFrameInterval > 0) {
          const target = this.nextFrameTime + effectiveFrameInterval;
          this.nextFrameTime = target > now ? target : now + effectiveFrameInterval;
        }
        if (this.simulate) {
          const simTarget = this.nextSimTime + SIM_INTERVAL_MS;
          this.nextSimTime = simTarget > now ? simTarget : now + SIM_INTERVAL_MS;
        }
        this.lastTickTime = now;
        let rendered = true;
        try {
          rendered = this.render(now) !== false;
        } catch (renderErr) {
          rendered = false;
          const errMsg =
            renderErr instanceof Error
              ? `${renderErr.name}: ${renderErr.message}\n${renderErr.stack || ''}`
              : String(renderErr);
          console.error(
            '[RenderClockScheduler] Uncaught error during render tick:',
            errMsg,
            renderErr
          );
        }
        this.lastRenderResult = rendered;

        const isHidden = typeof document !== 'undefined' && document.hidden;
        if (glCtx && typeof glCtx.fenceSync === 'function' && rendered !== false && !isHidden) {
          const sync = glCtx.fenceSync(glCtx.SYNC_GPU_COMMANDS_COMPLETE, 0);
          if (sync) {
            this.pending.push(sync);
          } else if (!glCtx.isContextLost()) {
            this.dispose();
            throw new Error('Could not track completion of a rendered frame.');
          }
          glCtx.flush();
        }
      } else if (this.simulate && now >= this.nextSimTime - 0.1) {
        const simTarget = this.nextSimTime + SIM_INTERVAL_MS;
        this.nextSimTime = simTarget > now ? simTarget : now + SIM_INTERVAL_MS;
        try {
          this.simulate(now);
        } catch (simErr) {
          console.error('[RenderClockScheduler] Uncaught error during simulation tick:', simErr);
        }
      }

      this.schedule();
    };

    this.channel.port1.onmessage = this.tick;
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this.wake);
    }
    if (this.gl && this.gl.canvas) {
      this.gl.canvas.addEventListener('webglcontextlost', this.wake);
      this.gl.canvas.addEventListener('webglcontextrestored', this.wake);
    } else {
      console.warn(
        '[RenderClockScheduler] Headless Parameter Detected (gl=null) — running 120Hz timer-paced loop without WebGL context.'
      );
    }
  }

  _getEffectiveFrameInterval(): number {
    const isHidden = typeof document !== 'undefined' && document.hidden;
    const baseInterval = this.frameInterval > 0 ? this.frameInterval : this.gl ? 0 : 1000 / 120;
    if (!isHidden) {
      return baseInterval;
    }
    return this.unfocusedFrameInterval > 0
      ? Math.max(baseInterval, this.unfocusedFrameInterval)
      : Math.max(baseInterval, 1000 / 30);
  }

  start(): void {
    this.running = true;
    this.wake();
  }

  setFpsLimit(maxFps: number | null): void {
    const interval = maxFps !== null && Number.isFinite(maxFps) && maxFps > 0 ? 1000 / maxFps : 0;

    if (interval !== this.frameInterval) {
      this.frameInterval = interval;
      this.nextFrameTime = 0;
      this.clearFrameTimer();
      this.schedule();
    }
  }

  setUnfocusedFpsLimit(maxFps: number | null): void {
    const interval = maxFps !== null && Number.isFinite(maxFps) && maxFps > 0 ? 1000 / maxFps : 0;

    if (interval !== this.unfocusedFrameInterval) {
      this.unfocusedFrameInterval = interval;
      if (typeof document !== 'undefined' && document.hidden) {
        this.nextFrameTime = 0;
        this.clearFrameTimer();
        this.schedule();
      }
    }
  }

  dispose(): void {
    this.running = false;
    this.clearFrameTimer();
    this.clearPending();

    if (this.displayRequest !== null) {
      cancelAnimationFrame(this.displayRequest);
      this.displayRequest = null;
    }

    this.channel.port1.close();
    this.channel.port2.close();
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.wake);
    }
    if (this.gl && this.gl.canvas) {
      this.gl.canvas.removeEventListener('webglcontextlost', this.wake);
      this.gl.canvas.removeEventListener('webglcontextrestored', this.wake);
    }
  }

  stop(): void {
    this.dispose();
  }

  active(): boolean {
    return this.running && (!this.gl || !this.gl.isContextLost());
  }

  clearPending(): void {
    if (this.gl && typeof this.gl.deleteSync === 'function') {
      for (const sync of this.pending) {
        this.gl.deleteSync(sync);
      }
    }
    this.pending.length = 0;
  }

  clearFrameTimer(): void {
    if (this.frameTimer !== null) {
      clearTimeout(this.frameTimer);
      this.frameTimer = null;
    }
    if (this.frameTask) {
      this.frameTask.abort();
      this.frameTask = null;
    }
  }

  schedule(): void {
    if (this.queued || this.frameTimer !== null || this.frameTask !== null || !this.active()) {
      return;
    }

    const effectiveInterval = this._getEffectiveFrameInterval();

    if (this.lastRenderResult === false && effectiveInterval <= 0) {
      const delay = this.simulate
        ? Math.max(
            1,
            Math.ceil(this.nextSimTime > 0 ? this.nextSimTime - performance.now() : SIM_INTERVAL_MS)
          )
        : 16;
      this.frameTimer = setTimeout(this.queueTick, delay);
      return;
    }

    if (effectiveInterval > 0) {
      const now = performance.now();
      const nextTargetTime =
        this.simulate && effectiveInterval > SIM_INTERVAL_MS && this.nextSimTime > 0
          ? Math.min(this.nextFrameTime, this.nextSimTime)
          : this.nextFrameTime;
      const waitMs = Math.max(
        nextTargetTime - now,
        this.pending.length >= 2 ? 1 : 0,
        !this.gl && this.lastTickTime > 0 ? 1 : 0
      );

      if (waitMs > 0) {
        const delay = Math.max(1, Math.ceil(waitMs));
        const globalScheduler = (globalThis as any).scheduler;
        if (globalScheduler && typeof globalScheduler.postTask === 'function') {
          const ctrl = new AbortController();
          this.frameTask = ctrl;
          globalScheduler
            .postTask(this.queueTick, { delay, signal: ctrl.signal })
            .catch((err: unknown) => {
              if (!ctrl.signal.aborted) throw err;
            });
        } else {
          this.frameTimer = setTimeout(this.queueTick, delay);
        }
        return;
      }
    } else {
      if (this.pending.length >= 2) {
        this.frameTimer = setTimeout(this.queueTick, 1);
        return;
      }
      const now = performance.now();
      if (this.lastTickTime && now - this.lastTickTime < 1.0) {
        this.frameTimer = setTimeout(this.queueTick, 1);
        return;
      }
      this.lastTickTime = now;
    }

    this.queueTick();
  }
}

export default RenderClockScheduler;
