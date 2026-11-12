#!/usr/bin/env node
/**
 * runAudioScenarios.mjs
 * Runs the `rc_audio_director` scenario regression suite (ball rolling contact, impacts, engine
 * powertrain) against a real RocketSim arena. Every audio bug we fix gets a scenario in
 * `crates/rc_audio_director/tests/audio_scenarios.rs`, so this script is the single entry point.
 *
 * Usage:
 *   node scripts/runAudioScenarios.mjs [-- <extra cargo test args>]
 *   RC_ARENA_MESH_DIR=/path/to/arenamesh node scripts/runAudioScenarios.mjs
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const ROOT_DIR = path.resolve(import.meta.dirname, '..');
const CRATES_DIR = path.join(ROOT_DIR, 'crates');
const MESH_CANDIDATES = [
  process.env.RC_ARENA_MESH_DIR,
  path.join(ROOT_DIR, 'public', 'arenamesh'),
].filter(Boolean);

function resolveMeshDir() {
  for (const candidate of MESH_CANDIDATES) {
    if (fs.existsSync(path.join(candidate, 'mesh_0.cmf'))) return candidate;
  }
  return null;
}

const meshDir = resolveMeshDir();
if (!meshDir) {
  console.error(
    '[audio-scenarios] Arena collision meshes not found.\n' +
      '  Initialize the `public` submodule (`git submodule update --init public`) or set\n' +
      '  RC_ARENA_MESH_DIR to a folder containing mesh_0.cmf .. mesh_15.cmf.'
  );
  process.exit(1);
}

const extraArgs = process.argv.slice(2).filter((arg) => arg !== '--');
const cargoArgs = [
  'test',
  '-p',
  'rc_audio_director',
  '--test',
  'audio_scenarios',
  '--',
  '--nocapture',
  ...extraArgs,
];

const env = {
  ...process.env,
  RC_ARENA_MESH_DIR: meshDir,
  RC_STRICT_AUDIO_SCENARIOS: '1',
  RUSTC_BOOTSTRAP: process.env.RUSTC_BOOTSTRAP ?? '1',
};
if (!process.env.RUSTFLAGS) {
  env.RUSTFLAGS = '-Zcrate-attr=feature(cold_path)';
}

console.log(`[audio-scenarios] meshes: ${meshDir}`);
console.log(`[audio-scenarios] cargo ${cargoArgs.join(' ')}`);

const result = spawnSync('cargo', cargoArgs, {
  cwd: CRATES_DIR,
  env,
  stdio: 'inherit',
});

if (result.error) {
  console.error('[audio-scenarios] failed to launch cargo:', result.error.message);
  process.exit(1);
}
process.exit(result.status ?? 1);
