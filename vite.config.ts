import { defineConfig, type UserConfig } from 'vite';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import basicSsl from '@vitejs/plugin-basic-ssl';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { rcPrivateCredentialsDevPlugin } from './scripts/vite/rcDevProfilePlugin.ts';
import {
  http2HighConcurrencyPlugin,
  customParameterUrlsPlugin,
} from './scripts/vite/http2HighConcurrencyPlugin.ts';
import { rcGitHeadAutoRestartPlugin } from './scripts/vite/gitHeadAutoRestartPlugin.ts';
import { rcUiTunerSyncPlugin, customHtmlEntryPlugin } from './scripts/vite/tunerWsSyncPlugin.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const host = process.env.TAURI_DEV_HOST;

export type RcServerRole = 'entry' | 'rc-https' | 'tuner' | 'rc-http';

export function createRcViteConfig(
  role: RcServerRole = (process.env.RC_VITE_ROLE as RcServerRole) || 'rc-https',
  statusResolver?: () => Record<string, boolean>
): UserConfig {
  const isHttps = role === 'rc-https';
  const portMap: Record<RcServerRole, number> = {
    entry: 3000,
    'rc-https': 3001,
    tuner: 3002,
    'rc-http': 3003,
  };
  const port = portMap[role] || 3001;

  const plugins = [
    react({
      exclude: [/\/node_modules\//, /\/\.vite\//, /\/rc-vite-cache\//],
    }),
    tailwindcss(),
    rcGitHeadAutoRestartPlugin(),
  ];

  if (role === 'entry') {
    plugins.unshift(customHtmlEntryPlugin('entry.html', statusResolver));
  } else if (role === 'tuner') {
    plugins.unshift(customHtmlEntryPlugin('tuner.html'));
    plugins.push(rcUiTunerSyncPlugin());
  } else {
    plugins.unshift(rcPrivateCredentialsDevPlugin());
    if (isHttps) {
      plugins.push(basicSsl(), http2HighConcurrencyPlugin());
    }
    plugins.push(customParameterUrlsPlugin());
  }

  const baseReactInclude = [
    'react',
    'react-dom',
    'react-dom/client',
    'react/jsx-runtime',
    'react/jsx-dev-runtime',
    'lucide-react',
  ];

  const uiInclude = [
    ...baseReactInclude,
    'zustand',
    'framer-motion',
    '@radix-ui/react-dialog',
    '@radix-ui/react-slider',
    '@radix-ui/react-slot',
    '@radix-ui/react-tabs',
    'clsx',
    'tailwind-merge',
  ];

  const gameInclude = [
    ...uiInclude,
    'three',
    'three/addons/lines/LineMaterial.js',
    'three/addons/lines/LineSegments2.js',
    'three/addons/lines/LineSegmentsGeometry.js',
    'three/addons/loaders/GLTFLoader.js',
    'three/addons/postprocessing/Pass.js',
    'three/addons/shaders/CopyShader.js',
  ];

  const optimizeEntries =
    role === 'entry'
      ? ['entry.html', 'src/entry/main.tsx']
      : role === 'tuner'
        ? ['tuner.html', 'src/ui-tuner/main.tsx']
        : [
            'index.html',
            'src/main.ts',
            'src/game/GameBootstrap.ts',
            'src/ui-system/index.tsx',
            'src/network/server/AuthoritativeServerWorker.ts',
          ];

  const optimizeInclude =
    role === 'entry' ? baseReactInclude : role === 'tuner' ? uiInclude : gameInclude;

  return {
    clearScreen: false,
    cacheDir: resolve(__dirname, 'node_modules/.vite', role),
    worker: {
      format: 'es',
    },
    envPrefix: ['VITE_', 'TAURI_ENV_*'],
    optimizeDeps: {
      entries: optimizeEntries,
      include: optimizeInclude,
    },
    server: {
      host: host || true,
      port,
      strictPort: true,
      open: false,
      watch: {
        ignored: ['**/src-tauri/**'],
      },
      headers: {
        'Cross-Origin-Resource-Policy': 'cross-origin',
      },
    },
    preview: {
      host: true,
      port,
      headers: {
        'Cross-Origin-Resource-Policy': 'cross-origin',
      },
    },
    build: {
      outDir: 'dist',
      assetsDir: 'assets',
      sourcemap: true,
      target: 'esnext',
      rollupOptions: {
        input: {
          main: resolve(__dirname, 'index.html'),
          tuner: resolve(__dirname, 'tuner.html'),
          entry: resolve(__dirname, 'entry.html'),
        },
      },
    },
    resolve: {
      alias: {
        '@': resolve(__dirname, './src'),
      },
    },
    plugins,
  };
}

export default defineConfig(createRcViteConfig());
