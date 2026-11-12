import { createServer, type ViteDevServer } from 'vite';
import { createRcViteConfig, type RcServerRole } from '../vite.config.ts';

interface ManagedEndpoint {
  role: RcServerRole;
  port: number;
  protocol: 'http' | 'https';
  label: string;
  server?: ViteDevServer;
}

const ENDPOINTS: ManagedEndpoint[] = [
  { role: 'entry', port: 3000, protocol: 'http', label: 'Global Entry Hub' },
  { role: 'rc-https', port: 3001, protocol: 'https', label: 'Rocket Companion (HTTPS)' },
  { role: 'tuner', port: 3002, protocol: 'http', label: 'RC UI Tuner Workbench' },
  { role: 'rc-http', port: 3003, protocol: 'http', label: 'Tauri / RC HTTP Mirror' },
];

async function startAllServers() {
  const statusResolver = (): Record<string, boolean> => {
    const out: Record<string, boolean> = {};
    for (const ep of ENDPOINTS) {
      out[String(ep.port)] = Boolean(ep.server?.httpServer?.listening);
    }
    return out;
  };

  console.log('\n====================================================================');
  console.log('  Rocket Companion — Unified 4-Port Workspace Orchestrator');
  console.log('====================================================================');

  for (const ep of ENDPOINTS) {
    const config = createRcViteConfig(ep.role, ep.role === 'entry' ? statusResolver : undefined);
    const server = await createServer({
      ...config,
      configFile: false,
    });
    await server.listen();
    if (ep.role === 'entry') {
      try {
        await (
          server as ViteDevServer & { waitForRequestsIdle?: () => Promise<void> }
        ).waitForRequestsIdle?.();
        await server.warmupRequest('/src/entry/main.tsx');
      } catch {
        // Ignore warmup errors
      }
    }
    ep.server = server;
    console.log(
      `  [OK] :${ep.port} (${ep.protocol.toUpperCase().padEnd(5)}) -> ${ep.label.padEnd(26)} ${ep.protocol}://localhost:${ep.port}/`
    );
  }

  console.log('--------------------------------------------------------------------');
  console.log('  -> Global Entry Hub : http://localhost:3000/');
  console.log('  -> RC Main (HTTPS)  : https://localhost:3001/   (?dev=1 | ?nokey=1 | ?touch=1)');
  console.log('  -> RC UI Tuner      : http://localhost:3002/');
  console.log('  -> Tauri / RC HTTP  : http://localhost:3003/');
  console.log('====================================================================\n');

  const shutdown = async () => {
    for (const ep of ENDPOINTS) {
      try {
        await ep.server?.close();
      } catch {
        // Ignore close errors
      }
    }
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

startAllServers().catch((err) => {
  console.error('[devLauncher] Fatal startup error:', err);
  process.exit(1);
});
