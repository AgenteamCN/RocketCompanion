import fs from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Plugin, ViteDevServer } from 'vite';

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

function resolveWorktreeGitDir(worktreePath: string): string | null {
  try {
    const dotGitPath = resolve(worktreePath, '.git');
    if (!fs.existsSync(dotGitPath)) return null;
    const stat = fs.statSync(dotGitPath);
    if (stat.isDirectory()) return dotGitPath;
    if (stat.isFile()) {
      const content = fs.readFileSync(dotGitPath, 'utf8').trim();
      const match = /^gitdir:\s*(.+)$/i.exec(content);
      if (match?.[1]) {
        return resolve(worktreePath, match[1].trim());
      }
    }
  } catch {
    // Ignore gitdir resolution errors
  }
  return null;
}

function resolveCommonGitDir(gitDir: string): string {
  try {
    const commonDirFile = resolve(gitDir, 'commondir');
    if (fs.existsSync(commonDirFile)) {
      const rel = fs.readFileSync(commonDirFile, 'utf8').trim();
      if (rel) {
        return resolve(gitDir, rel);
      }
    }
  } catch {
    // Ignore commondir resolution errors
  }
  return gitDir;
}

function readLastHeadLogSha(gitDir: string): string | null {
  try {
    const logPath = resolve(gitDir, 'logs/HEAD');
    if (!fs.existsSync(logPath)) return null;
    const content = fs.readFileSync(logPath, 'utf8').trim();
    if (!content) return null;
    const lastLine = content.slice(content.lastIndexOf('\n') + 1).trim();
    const parts = lastLine.split(/\s+/);
    if (parts.length >= 2 && /^[0-9a-f]{40}$/i.test(parts[1])) {
      return parts[1].slice(0, 12);
    }
  } catch {
    // Ignore reflog read errors
  }
  return null;
}

function resolveRefCommitSha(gitDir: string, refName: string): string {
  const commonGitDir = resolveCommonGitDir(gitDir);
  const candidateDirs = commonGitDir !== gitDir ? [gitDir, commonGitDir] : [gitDir];
  try {
    for (const dir of candidateDirs) {
      const looseRefPath = resolve(dir, refName);
      if (fs.existsSync(looseRefPath)) {
        return fs.readFileSync(looseRefPath, 'utf8').trim().slice(0, 12);
      }
    }
    for (const dir of candidateDirs) {
      const packedRefsPath = resolve(dir, 'packed-refs');
      if (fs.existsSync(packedRefsPath)) {
        const lines = fs.readFileSync(packedRefsPath, 'utf8').split('\n');
        const suffix = ` ${refName}`;
        for (const line of lines) {
          if (!line || line.startsWith('#') || line.startsWith('^')) continue;
          if (line.endsWith(suffix)) {
            return line.slice(0, 12);
          }
        }
      }
    }
    const reflogSha = readLastHeadLogSha(gitDir);
    if (reflogSha) return reflogSha;
  } catch {
    // Ignore ref read errors
  }
  return 'unknown';
}

function readWorktreeHeadSnapshot(
  label: string,
  worktreePath: string
): { summary: string; locked: boolean } {
  const gitDir = resolveWorktreeGitDir(worktreePath);
  if (!gitDir) {
    return { summary: `${label}:uninitialized`, locked: false };
  }
  const commonGitDir = resolveCommonGitDir(gitDir);
  try {
    if (
      fs.existsSync(resolve(gitDir, 'index.lock')) ||
      fs.existsSync(resolve(gitDir, 'HEAD.lock')) ||
      fs.existsSync(resolve(commonGitDir, 'index.lock')) ||
      fs.existsSync(resolve(commonGitDir, 'HEAD.lock'))
    ) {
      return { summary: '', locked: true };
    }
    const headPath = resolve(gitDir, 'HEAD');
    if (!fs.existsSync(headPath)) {
      return { summary: `${label}:no-head`, locked: false };
    }
    const headRaw = fs.readFileSync(headPath, 'utf8').trim();
    if (headRaw.startsWith('ref:')) {
      const refName = headRaw.slice(4).trim();
      const shortBranch = refName.replace(/^refs\/heads\//, '');
      const sha = resolveRefCommitSha(gitDir, refName);
      return { summary: `${label}:${shortBranch}@${sha}`, locked: false };
    }
    return { summary: `${label}:detached@${headRaw.slice(0, 12)}`, locked: false };
  } catch {
    return { summary: `${label}:error`, locked: false };
  }
}

function readCompositeGitHeadState(): { signature: string | null; locked: boolean } {
  const targets = [
    { label: 'root', path: ROOT_DIR },
    { label: 'public', path: resolve(ROOT_DIR, 'public') },
  ];
  const parts: string[] = [];
  for (const t of targets) {
    const snap = readWorktreeHeadSnapshot(t.label, t.path);
    if (snap.locked) {
      return { signature: null, locked: true };
    }
    parts.push(snap.summary);
  }
  return { signature: parts.join(' | '), locked: false };
}

/**
 * Dev-only plugin (`apply: 'serve'`): monitors `.git/HEAD` and active branch refs across
 * the main repository and `public` submodule.
 */
export function rcGitHeadAutoRestartPlugin(): Plugin {
  return {
    name: 'rc-git-head-auto-restart',
    apply: 'serve',
    configureServer(server: ViteDevServer) {
      let baselineSignature = readCompositeGitHeadState().signature;
      let isRestarting = false;
      let settleTimer: ReturnType<typeof setTimeout> | null = null;

      const cleanup = () => {
        clearInterval(pollTimer);
        if (settleTimer) {
          clearTimeout(settleTimer);
          settleTimer = null;
        }
      };

      const pollTimer = setInterval(() => {
        if (isRestarting) return;
        const current = readCompositeGitHeadState();
        if (current.locked || !current.signature) return;

        if (baselineSignature === null) {
          baselineSignature = current.signature;
          return;
        }

        if (current.signature !== baselineSignature && !settleTimer) {
          const previousSignature = baselineSignature;
          settleTimer = setTimeout(async () => {
            settleTimer = null;
            if (isRestarting) return;
            const settled = readCompositeGitHeadState();
            if (settled.locked || !settled.signature || settled.signature === previousSignature) {
              return;
            }
            isRestarting = true;
            baselineSignature = settled.signature;
            cleanup();
            console.log(
              `\n  [rc-git-auto-restart] Git HEAD switch detected:\n    prev: ${previousSignature}\n    next: ${settled.signature}\n  -> Auto-restarting Vite dev server...`
            );
            try {
              server.moduleGraph.invalidateAll();
              await server.restart(true);
              server.ws?.send?.({ type: 'full-reload', path: '*' });
            } catch (err) {
              isRestarting = false;
              console.error('[rc-git-auto-restart] Failed to auto-restart Vite server:', err);
            }
          }, 120);
          settleTimer.unref?.();
        }
      }, 150);

      pollTimer.unref?.();
      server.httpServer?.once('close', cleanup);
    },
  };
}
