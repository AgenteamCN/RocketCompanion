import type { Plugin, ViteDevServer } from 'vite';

/**
 * Raises Node.js Http2SecureServer maxConcurrentStreams (default 100 -> 1000) and
 * maxSessionMemory (default 1000 -> 4096) so cold-cache ESM waterfall bursts (~460 modules)
 * and WebWorker module graphs in Safari/WebKit never trigger NGHTTP2_REFUSED_STREAM.
 */
export function http2HighConcurrencyPlugin(): Plugin {
  return {
    name: 'rc-http2-high-concurrency',
    configureServer(server: ViteDevServer) {
      server.middlewares.use((req, res, next) => {
        const rangeHeader = req.headers.range;
        const reqUrl = String(req.url || '');
        if (rangeHeader) {
          delete req.headers['if-none-match'];
          delete req.headers['if-modified-since'];
          if (reqUrl.includes('__rc_audit=') || rangeHeader === 'bytes=0-15') {
            res.setHeader('Cache-Control', 'no-store');
          }
        }
        next();
      });

      const httpServer = server.httpServer as Record<string | symbol, any> | null;
      if (!httpServer) return;

      httpServer.timeout = 0;
      httpServer.keepAliveTimeout = 60000;

      const optSym = Object.getOwnPropertySymbols(httpServer).find(
        (s) => s.description === 'options'
      );
      if (optSym && httpServer[optSym]) {
        httpServer[optSym].maxSessionMemory = 4096;
        httpServer[optSym].settings = {
          ...(httpServer[optSym].settings || {}),
          maxConcurrentStreams: 1000,
        };
      }

      const activeSessions = new Set<Record<string, any>>();
      httpServer.on('session', (session: Record<string, any>) => {
        activeSessions.add(session);
        session.once?.('close', () => {
          activeSessions.delete(session);
        });
        try {
          if (typeof session.settings === 'function') {
            session.settings({ maxConcurrentStreams: 1000 });
          }
          if (typeof session.setTimeout === 'function') {
            session.setTimeout(0);
          }
        } catch (_err) {
          // Ignore if session is already closing
        }
      });

      httpServer.once?.('close', () => {
        for (const session of activeSessions) {
          try {
            session.destroy?.();
          } catch (_err) {
            // Ignore session destroy errors during shutdown
          }
        }
        activeSessions.clear();
      });
    },
  };
}

export function customParameterUrlsPlugin(): Plugin {
  return {
    name: 'rc-custom-parameter-urls',
    configureServer(server: ViteDevServer) {
      const originalPrintUrls = server.printUrls.bind(server);

      server.printUrls = () => {
        originalPrintUrls();

        const localUrls = server.resolvedUrls?.local ?? [];
        const networkUrls = server.resolvedUrls?.network ?? [];
        if (localUrls.length === 0 && networkUrls.length === 0) return;

        const localBaseUrl = localUrls[0] || 'https://localhost:3001/';
        const networkBaseUrl =
          networkUrls[0] || localBaseUrl.replace('localhost', '192.0.2.1');

        const formatUrlWithQuery = (baseUrl: string, query: string): string => {
          const normalizedBaseUrl = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
          return `${normalizedBaseUrl}${query}`;
        };

        const parameterUrlEntries = [
          { label: 'Developer Mode', url: formatUrlWithQuery(localBaseUrl, '?dev=1') },
          { label: 'No-Key Sim Mode', url: formatUrlWithQuery(localBaseUrl, '?nokey=1') },
          { label: 'Touch Mode', url: formatUrlWithQuery(networkBaseUrl, '?touch=1') },
          { label: 'Headless Mode', url: formatUrlWithQuery(networkBaseUrl, '?touch=2') },
        ];

        console.log('\n  Custom Parameter URLs:');
        for (const { label, url } of parameterUrlEntries) {
          console.log(`  ->  ${label.padEnd(15)}: ${url}`);
        }
      };
    },
  };
}
