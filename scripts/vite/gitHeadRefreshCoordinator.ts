import type { ViteDevServer } from 'vite';
import { readCompositeGitHeadState } from './gitHeadSignature.ts';

const POLL_INTERVAL_MS = 150;
const SETTLE_DELAY_MS = 120;
const POST_RESTART_RELOAD_DELAY_MS = 350;

const managedServers = new Set<ViteDevServer>();
let baselineSignature: string | null = readCompositeGitHeadState().signature;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let settleTimer: ReturnType<typeof setTimeout> | null = null;
let isRefreshing = false;

function broadcastSignature(signature: string): void {
  for (const server of managedServers) {
    server.moduleGraph.invalidateAll();
    server.ws?.send?.({
      type: 'custom',
      event: 'rc:git-head-changed',
      data: { signature },
    });
    server.ws?.send?.({ type: 'full-reload', path: '*' });
  }
}

async function restartManagedServers(signature: string): Promise<void> {
  for (const server of managedServers) {
    try {
      await server.restart(true);
    } catch (err) {
      console.error('[rc-git-head] Failed to auto-restart a Vite dev server:', err);
    }
  }
  broadcastSignature(signature);
  setTimeout(() => {
    for (const server of managedServers) {
      server.ws?.send?.({ type: 'full-reload', path: '*' });
    }
  }, POST_RESTART_RELOAD_DELAY_MS);
}

function pollGitHead(): void {
  if (isRefreshing) return;
  const current = readCompositeGitHeadState();
  if (current.locked || !current.signature) return;

  if (baselineSignature === null) {
    baselineSignature = current.signature;
    return;
  }

  if (current.signature === baselineSignature || settleTimer) return;

  const previousSignature = baselineSignature;
  settleTimer = setTimeout(async () => {
    settleTimer = null;
    if (isRefreshing) return;
    const settled = readCompositeGitHeadState();
    if (settled.locked || !settled.signature || settled.signature === previousSignature) {
      return;
    }
    isRefreshing = true;
    baselineSignature = settled.signature;
    console.log(
      `\n  [rc-git-head] Git HEAD switch detected:\n    prev: ${previousSignature}\n    next: ${settled.signature}\n  -> Refreshing the unified dev workspace...`
    );
    broadcastSignature(settled.signature);
    try {
      await restartManagedServers(settled.signature);
    } finally {
      isRefreshing = false;
    }
  }, SETTLE_DELAY_MS);
  settleTimer.unref?.();
}

/** Registers a Vite server with the single process-wide Git HEAD watcher. */
export function registerGitHeadServer(server: ViteDevServer): void {
  managedServers.add(server);
  server.httpServer?.once('close', () => managedServers.delete(server));
  if (pollTimer) return;

  pollTimer = setInterval(pollGitHead, POLL_INTERVAL_MS);
  pollTimer.unref?.();
}
