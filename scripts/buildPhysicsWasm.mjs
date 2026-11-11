#!/usr/bin/env node
/**
 * One-command Rust -> WebAssembly physics builder for RocketCompanion (`crates/rocketsim_wasm`).
 *
 * Modes:
 *   - `pnpm build:wasm`       : Production fat-LTO build (`--release`) -> `src/physics/core.wasm`
 *   - `pnpm build:wasm:dev`   : Fast incremental thin-LTO build (`--profile dev-wasm`, ~2s)
 *   - `pnpm build:wasm:check` : Sub-second workspace type & borrow check (`cargo check`)
 *
 * Caching & Isolation:
 *   - Build artifacts default to `/tmp/rc-wasm-target` (or `$CARGO_TARGET_DIR`) so switching
 *     Git branches preserves incremental compilation cache and never pollutes the repo tree.
 *   - If `cargo` is missing (e.g. fresh cloud container), automatically bootstraps a minimal
 *     `rustup` + `wasm32-unknown-unknown` toolchain in `/tmp/rustup` and `/tmp/cargo-home`.
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');
const CRATES_DIR = path.join(ROOT_DIR, 'crates');
const OUTPUT_WASM_PATH = path.join(ROOT_DIR, 'src', 'physics', 'core.wasm');
const WASM_TARGET = 'wasm32-unknown-unknown';

const args = new Set(process.argv.slice(2));
const isDevProfile = args.has('--dev');
const isCheckOnly = args.has('--check');
const isIfMissing = args.has('--if-missing');

function resolveToolchainEnv() {
  const env = { ...process.env };
  const homeCargoBin = path.join(os.homedir(), '.cargo', 'bin');
  const tmpCargoHome = '/tmp/cargo-home';
  const tmpRustupHome = '/tmp/rustup';
  const tmpCargoBin = path.join(tmpCargoHome, 'bin');

  const hasBinaryInPath = (bin) => {
    const res = spawnSync(bin, ['--version'], { env, stdio: 'ignore' });
    return res.status === 0;
  };

  if (!hasBinaryInPath('cargo')) {
    if (fs.existsSync(path.join(homeCargoBin, 'cargo'))) {
      env.PATH = `${homeCargoBin}${path.delimiter}${env.PATH || ''}`;
    } else if (fs.existsSync(path.join(tmpCargoBin, 'cargo'))) {
      env.CARGO_HOME = env.CARGO_HOME || tmpCargoHome;
      env.RUSTUP_HOME = env.RUSTUP_HOME || tmpRustupHome;
      env.PATH = `${tmpCargoBin}${path.delimiter}${env.PATH || ''}`;
    } else {
      console.log(
        '[WASM-BUILD] `cargo` not found in PATH; bootstrapping minimal Rust + wasm32 toolchain in /tmp...'
      );
      env.CARGO_HOME = tmpCargoHome;
      env.RUSTUP_HOME = tmpRustupHome;
      env.PATH = `${tmpCargoBin}${path.delimiter}${env.PATH || ''}`;
      const bootstrapCmd = `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --default-toolchain stable --profile minimal --target ${WASM_TARGET} --no-modify-path`;
      const boot = spawnSync('bash', ['-c', bootstrapCmd], {
        env,
        stdio: 'inherit',
      });
      if (boot.status !== 0) {
        console.error(
          '\n[WASM-BUILD] [ERROR] Failed to bootstrap Rust toolchain via rustup.'
        );
        console.error(
          '  Local fix: Install Rust from https://rustup.rs and run:'
        );
        console.error(`    rustup target add ${WASM_TARGET}`);
        process.exit(1);
      }
    }
  }

  // Ensure wasm32-unknown-unknown target is installed if rustup is available
  const hasRustup =
    spawnSync('rustup', ['--version'], { env, stdio: 'ignore' }).status === 0;
  if (hasRustup) {
    const targetsOut = spawnSync('rustup', ['target', 'list', '--installed'], {
      env,
      encoding: 'utf8',
    });
    if (
      targetsOut.status === 0 &&
      !targetsOut.stdout.split(/\r?\n/).includes(WASM_TARGET)
    ) {
      console.log(
        `[WASM-BUILD] Installing missing Rust target '${WASM_TARGET}' via rustup...`
      );
      const addTarget = spawnSync('rustup', ['target', 'add', WASM_TARGET], {
        env,
        stdio: 'inherit',
      });
      if (addTarget.status !== 0) {
        console.error(
          `\n[WASM-BUILD] [ERROR] Failed to add Rust target '${WASM_TARGET}'. Run: rustup target add ${WASM_TARGET}`
        );
        process.exit(1);
      }
    }
  }

  if (!env.CARGO_TARGET_DIR) {
    env.CARGO_TARGET_DIR = path.join(os.tmpdir(), 'rc-wasm-target');
  }
  return env;
}

function verifyCompiledWasmExports(wasmBytes) {
  const mod = new WebAssembly.Module(wasmBytes);
  const exportedNames = new Set(
    WebAssembly.Module.exports(mod).map((e) => e.name)
  );
  const coreJsPath = path.join(ROOT_DIR, 'src', 'physics', 'core.js');
  const coreJsText = fs.readFileSync(coreJsPath, 'utf8');
  const expectedMatches = [...coreJsText.matchAll(/'(_physics_[A-Za-z0-9_]+)'/g)].map(
    (m) => m[1]
  );

  const missing = [];
  for (const req of ['memory', '_malloc', '_free', ...expectedMatches]) {
    if (!exportedNames.has(req)) {
      missing.push(req);
    }
  }
  if (missing.length > 0) {
    console.error(
      `\n[WASM-BUILD] [ERROR] Compiled WASM binary is missing ${missing.length} required C-ABI export(s):`
    );
    for (const sym of missing) {
      console.error(`  - ${sym}`);
    }
    process.exit(1);
  }
  return exportedNames.size;
}

function main() {
  if (isIfMissing && fs.existsSync(OUTPUT_WASM_PATH)) {
    try {
      const existingBytes = fs.readFileSync(OUTPUT_WASM_PATH);
      verifyCompiledWasmExports(existingBytes);
      return;
    } catch {
      console.log(
        '[WASM-BUILD] Existing src/physics/core.wasm is invalid or outdated; rebuilding...'
      );
    }
  }
  const startMs = performance.now();
  const env = resolveToolchainEnv();
  const profileName = isDevProfile ? 'dev-wasm' : 'release';

  if (isCheckOnly) {
    console.log(
      `[WASM-BUILD] Running cargo check (--target ${WASM_TARGET} --workspace)...`
    );
    const res = spawnSync(
      'cargo',
      ['check', '--target', WASM_TARGET, '--workspace'],
      {
        cwd: CRATES_DIR,
        env,
        stdio: 'inherit',
      }
    );
    if (res.status !== 0) {
      console.error(
        '\n[WASM-BUILD] [ERROR] Rust workspace check failed. See compiler diagnostics above.'
      );
      process.exit(res.status ?? 1);
    }
    const elapsed = ((performance.now() - startMs) / 1000).toFixed(2);
    console.log(`[WASM-BUILD] [OK] Workspace check passed in ${elapsed}s.`);
    return;
  }

  const cargoArgs = [
    'build',
    '--target',
    WASM_TARGET,
    '-p',
    'rocketsim_wasm',
    ...(isDevProfile ? ['--profile', 'dev-wasm'] : ['--release']),
  ];

  console.log(
    `[WASM-BUILD] Building rocketsim_wasm (${profileName}, targetDir=${env.CARGO_TARGET_DIR})...`
  );
  const buildRes = spawnSync('cargo', cargoArgs, {
    cwd: CRATES_DIR,
    env,
    stdio: 'inherit',
  });

  if (buildRes.status !== 0) {
    console.error(
      `\n[WASM-BUILD] [ERROR] Rust WASM compilation failed (profile: ${profileName}).`
    );
    console.error(
      '  Inspect the rustc error trace above (file:line:col) for exact root cause.'
    );
    process.exit(buildRes.status ?? 1);
  }

  const builtWasmPath = path.join(
    env.CARGO_TARGET_DIR,
    WASM_TARGET,
    profileName,
    'rocketsim_wasm.wasm'
  );
  if (!fs.existsSync(builtWasmPath)) {
    console.error(
      `\n[WASM-BUILD] [ERROR] Expected WASM artifact not found at: ${builtWasmPath}`
    );
    process.exit(1);
  }

  const wasmBytes = fs.readFileSync(builtWasmPath);
  const exportCount = verifyCompiledWasmExports(wasmBytes);

  fs.copyFileSync(builtWasmPath, OUTPUT_WASM_PATH);
  const sizeKb = (wasmBytes.byteLength / 1024).toFixed(1);
  const elapsedSec = ((performance.now() - startMs) / 1000).toFixed(2);
  console.log(
    `[WASM-BUILD] [OK] Wrote src/physics/core.wasm (${sizeKb} KB, ${exportCount} exports, profile=${profileName}) in ${elapsedSec}s.`
  );
}

main();
