import fs from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Plugin, ViteDevServer } from 'vite';

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const RESOLVED_DEV_PROFILE_PATH = resolve(ROOT_DIR, '.cache/resolvedProfile.json');

export function readDevPrivateProfileSafe(): Record<string, any> | null {
  try {
    if (!fs.existsSync(RESOLVED_DEV_PROFILE_PATH)) return null;
    const parsed = JSON.parse(fs.readFileSync(RESOLVED_DEV_PROFILE_PATH, 'utf8'));
    if (parsed && parsed.profileSource === 'private' && Array.isArray(parsed.signaling?.relays)) {
      return parsed;
    }
  } catch {
    // Ignore read error
  }
  return null;
}

/**
 * Dev-only plugin (`apply: 'serve'`): injects `.cache/resolvedProfile.json` into the local dev session
 * and exposes `/__rc_dev_profile` without ever bundling private credentials into `vite build`.
 */
export function rcPrivateCredentialsDevPlugin(): Plugin {
  return {
    name: 'rc-private-credentials-dev',
    apply: 'serve',
    configureServer(server: ViteDevServer) {
      server.middlewares.use('/__rc_dev_profile', (req, res) => {
        const reqUrl = String(req.url || '').toLowerCase();
        const isNoKey = reqUrl.includes('nokey=1') || reqUrl.includes('nokey=true');
        const profile = isNoKey
          ? {
              profileSource: 'default',
              signaling: { defaultSignalingUrl: '', relays: [] },
              turn: { iceServers: [] },
            }
          : readDevPrivateProfileSafe() || {
              profileSource: 'default',
              signaling: { defaultSignalingUrl: '', relays: [] },
              turn: { iceServers: [] },
            };
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Cache-Control', 'no-store');
        res.end(JSON.stringify(profile));
      });
    },
    transformIndexHtml() {
      const profile = readDevPrivateProfileSafe();
      if (!profile) return [];
      return [
        {
          tag: 'script',
          attrs: { id: 'rc-dev-private-profile' },
          children: `if (!/[?&]nokey=(1|true|yes)/i.test(window.location.search)) { window.__RC_DEV_PRIVATE_PROFILE__ = ${JSON.stringify(profile)}; }`,
          injectTo: 'head-prepend',
        },
      ];
    },
  };
}
