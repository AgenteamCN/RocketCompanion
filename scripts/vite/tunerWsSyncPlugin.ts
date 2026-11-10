import fs from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Plugin, ViteDevServer } from 'vite';

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

/**
 * Lightweight Vite WebSocket State Relay Plugin for RCUITuner (Port 3002).
 * Reuses Vite's built-in WebSocket server (`server.ws`) so that multiple tabs,
 * macOS Safari Private Browsing windows, and other devices on the same LAN
 * stay synchronized in real time with zero external dependencies.
 */
export function rcUiTunerSyncPlugin(): Plugin {
  const stateRegistry = new Map<string, unknown>();

  return {
    name: 'rc-ui-tuner-ws-sync',
    configureServer(server: ViteDevServer) {
      server.ws.on(
        'rc-ui-tuner:sync-patch',
        (data: { senderId?: string; entries?: Record<string, unknown>; ts?: number }) => {
          if (!data || !data.entries || typeof data.entries !== 'object') return;
          for (const [key, value] of Object.entries(data.entries)) {
            if (key === 'store:menuLayout' || key === 'store:floating') continue;
            stateRegistry.set(key, value);
          }
          server.ws.send('rc-ui-tuner:sync-patch', data);
        }
      );

      server.ws.on(
        'rc-ui-tuner:sync-seed',
        (data: { senderId?: string; entries?: Record<string, unknown> }) => {
          if (!data || !data.entries || typeof data.entries !== 'object') return;
          const newlySeeded: Record<string, unknown> = {};
          let hasNew = false;
          for (const [key, value] of Object.entries(data.entries)) {
            if (!stateRegistry.has(key)) {
              stateRegistry.set(key, value);
              newlySeeded[key] = value;
              hasNew = true;
            }
          }
          if (hasNew) {
            server.ws.send('rc-ui-tuner:sync-patch', {
              senderId: data.senderId,
              entries: newlySeeded,
              ts: Date.now(),
            });
          }
        }
      );

      server.ws.on(
        'rc-ui-tuner:sync-request',
        (data: { senderId?: string }, client) => {
          const entries = Object.fromEntries(stateRegistry.entries());
          client.send('rc-ui-tuner:sync-snapshot', {
            targetId: data?.senderId,
            entries,
            ts: Date.now(),
          });
        }
      );

      server.ws.on(
        'rc-ui-tuner:sync-reset',
        (data: { senderId?: string; scopePrefix?: string; ts?: number }) => {
          if (data?.scopePrefix) {
            for (const key of Array.from(stateRegistry.keys())) {
              if (key.startsWith(data.scopePrefix)) {
                stateRegistry.delete(key);
              }
            }
          } else {
            stateRegistry.clear();
          }
          server.ws.send('rc-ui-tuner:sync-reset', {
            senderId: data?.senderId,
            scopePrefix: data?.scopePrefix,
            ts: Date.now(),
          });
        }
      );
    },
  };
}

/**
 * Serves a custom root HTML file (`tuner.html` or `entry.html`) when accessing `/` on dedicated ports (3000 or 3002).
 */
export function customHtmlEntryPlugin(
  htmlFilename: string,
  statusResolver?: () => Record<string, boolean>
): Plugin {
  const htmlPath = resolve(ROOT_DIR, htmlFilename);
  return {
    name: `rc-custom-html-entry-${htmlFilename}`,
    apply: 'serve',
    configureServer(server: ViteDevServer) {
      if (statusResolver) {
        server.middlewares.use('/__rc_entry_status', (_req, res) => {
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.setHeader('Cache-Control', 'no-store');
          res.end(JSON.stringify(statusResolver()));
        });
      }

      server.middlewares.use(async (req, res, next) => {
        if (!req.url) return next();
        const urlPath = req.url.split('?')[0];
        if (urlPath === '/' || urlPath === '/index.html' || urlPath === `/${htmlFilename}`) {
          try {
            const rawHtml = fs.readFileSync(htmlPath, 'utf8');
            const transformed = await server.transformIndexHtml(req.url, rawHtml);
            res.statusCode = 200;
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            res.end(transformed);
            return;
          } catch (err) {
            return next(err);
          }
        }
        next();
      });
    },
  };
}
