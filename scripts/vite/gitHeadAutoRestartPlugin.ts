import type { Plugin, ViteDevServer } from 'vite';
import { buildGitHeadClientGuardScript } from './gitHeadClientGuard.ts';
import { registerGitHeadServer } from './gitHeadRefreshCoordinator.ts';
import { readCompositeGitHeadState } from './gitHeadSignature.ts';

/**
 * Dev-only plugin (`apply: 'serve'`): serves the composite Git HEAD signature,
 * injects a browser guard, and registers the server with the shared watcher.
 */
export function rcGitHeadAutoRestartPlugin(): Plugin {
  return {
    name: 'rc-git-head-auto-restart',
    apply: 'serve',
    transformIndexHtml(html: string) {
      const signature = readCompositeGitHeadState().signature ?? '';
      const clientGuardScript = buildGitHeadClientGuardScript(signature);
      return html.includes('</body>')
        ? html.replace('</body>', `${clientGuardScript}</body>`)
        : `${html}${clientGuardScript}`;
    },
    configureServer(server: ViteDevServer) {
      server.middlewares.use((_req, res, next) => {
        res.setHeader('Cache-Control', 'no-store');
        next();
      });
      server.middlewares.use('/__rc_git_head', (_req, res) => {
        const current = readCompositeGitHeadState();
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(
          JSON.stringify({
            signature: current.signature,
            locked: current.locked,
          })
        );
      });
      registerGitHeadServer(server);
    },
  };
}
