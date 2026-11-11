#!/usr/bin/env node
/**
 * scripts/runMultiplayerRoomRepro.mjs
 * Multi-tab headless Chrome reproduction runner for Multiplayer Host-a-Room and
 * Join-a-Room flows (2-player 1v1 and 3-player + 3 Ducky AI 3v3).
 *
 * Features:
 * - Real-time streaming telemetry receiver (/I__rc_repro_stream + stderr fallback)
 * - Configurable simulation speed multiplier (--speed=1|2|4)
 * - 4.5-minute (270,000ms) auto-termination watchdog (--max-duration-ms=270000)
 *   that flushes all collected telemetry before any 5-minute environment timeout
 * - Exports full JSON report to /tmp/multiplayer-room-repro-report.json
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { createServer } from 'vite';

const DEFAULT_OUT_PATH = '/tmp/multiplayer-room-repro-report.json';
const DEFAULT_MAX_DURATION_MS = 270_000;
const PER_MODE_TIMEOUT_MS = 95_000;

function parseCliArgs(argv) {
  let mode = 'both';
  let speed = 1;
  let maxDurationMs = DEFAULT_MAX_DURATION_MS;
  let outPath = DEFAULT_OUT_PATH;
  let bridgeSignaling = true;

  for (const arg of argv.slice(2)) {
    if (arg.startsWith('--mode=')) {
      const val = arg.slice('--mode='.length).trim();
      if (val === '2p' || val === '3p3ai' || val === 'both') mode = val;
    } else if (arg.startsWith('--speed=')) {
      speed = Math.max(1, Math.min(8, Number(arg.slice('--speed='.length)) || 1));
    } else if (arg.startsWith('--max-duration-ms=')) {
      maxDurationMs = Math.max(
        15_000,
        Number(arg.slice('--max-duration-ms='.length)) || DEFAULT_MAX_DURATION_MS
      );
    } else if (arg.startsWith('--out=')) {
      outPath = arg.slice('--out='.length).trim() || DEFAULT_OUT_PATH;
    } else if (arg === '--no-signaling-bridge') {
      bridgeSignaling = false;
    }
  }

  const modesToRun = mode === 'both' ? ['2p', '3p3ai'] : [mode];
  return { mode, modesToRun, speed, maxDurationMs, outPath, bridgeSignaling };
}

function formatEventStreamLine(evt) {
  if (evt.type === 'lifecycle') {
    return `[Stream][${evt.rosterMode}][${evt.role} +${evt.elapsedMs}ms] ${evt.message}`;
  }
  if (evt.type === 'pose_probe') {
    const p = evt.probe;
    const simSummary = p.simCars
      .map(
        (c) =>
          `car#${c.idx}(posZ=${c.pos[2]},fwdZ=${c.fwdZ},upZ=${c.upZ},sus=[${c.sus.join(',')}],dSus=${c.frontRearSusDelta})`
      )
      .join(' | ');
    const meshSummary = p.meshCars
      .map(
        (m) =>
          `mesh#${m.idx}:${m.preset}(wheelY=[${m.wheelHeightsY.join(',')}],dWheelY=${m.frontRearWheelHeightDeltaY})`
      )
      .join(' | ');
    return `[Stream][PoseProbe][${p.rosterMode}][${p.role}][${p.stage}] mode=${p.matchMode} phase=${p.matchPhase} tick=${p.simTick}\n    sim:  ${simSummary}\n    mesh: ${meshSummary}`;
  }
  if (evt.type === 'reconciler_snap') {
    const s = evt.sample;
    return `[Stream][ReconcilerSnap][${evt.rosterMode}][${evt.role} +${s.elapsedMs}ms] delta=${s.currentDelta} target=${s.targetDelta} rollback=${s.rollbackDepth} serverTick=${s.serverTick}`;
  }
  if (evt.type === 'input_starvation') {
    const s = evt.sample;
    return `[Stream][InputStarvation][${evt.rosterMode}][${evt.role} +${s.elapsedMs}ms] car#${s.carIndex} tick=#${s.tick} total=${s.totalStarvations}`;
  }
  if (evt.type === 'runtime_error') {
    return `[Stream][RuntimeError][${evt.rosterMode}][${evt.role} +${evt.elapsedMs}ms] ${evt.errorText}`;
  }
  if (evt.type === 'handshake_probe') {
    const d = evt.diagnostics;
    return `[Stream][HandshakeDiag][${evt.rosterMode}][${evt.role} +${evt.elapsedMs}ms] hasOwnIsHost=${d.hasOwnIsHostProperty} isHost=${String(d.channelIsHostValue)} isCrossTab=${d.isCrossTab} dc=${d.dataChannelReadyState} rttGetterOnly=${d.measuredRttGetterOnly} hardSnaps=${d.reconcilerHardSnapCount} peers=${d.hostRegisteredClientPeers}`;
  }
  if (evt.type === 'role_summary') {
    const s = evt.summary;
    return `[Stream][RoleSummary][${s.rosterMode}][${s.role}] elapsed=${s.elapsedMs}ms snaps=${s.reconcilerSnapLogCount} starvations=${s.inputStarvationLogCount} rttErrors=${s.readonlyRttTypeErrorCount} enteredMatch=${s.enteredMatch} final=${s.finalMatchMode}/${s.finalMatchPhase}`;
  }
  return `[Stream] ${JSON.stringify(evt)}`;
}

async function main() {
  const opts = parseCliArgs(process.argv);
  const suiteStartMs = Date.now();
  let autoTerminatedByWatchdog = false;

  const eventsByMode = {
    '2p': [],
    '3p3ai': [],
  };
  const summariesByMode = {
    '2p': { host: null, client: null },
    '3p3ai': { host: null, client: null },
  };
  const seenEventFingerprints = new Set();
  let modeCompletionNotifier = null;

  const ingestStreamEvent = (evt) => {
    if (!evt || typeof evt !== 'object') return;
    const fp = JSON.stringify(evt);
    if (seenEventFingerprints.has(fp)) return;
    seenEventFingerprints.add(fp);

    const rosterMode =
      evt.rosterMode || evt.probe?.rosterMode || evt.summary?.rosterMode || '3p3ai';
    if (eventsByMode[rosterMode]) {
      eventsByMode[rosterMode].push(evt);
    }

    console.log(formatEventStreamLine(evt));

    if (evt.type === 'role_summary' && evt.summary) {
      const m = evt.summary.rosterMode;
      const r = evt.summary.role;
      if (summariesByMode[m]) {
        summariesByMode[m][r] = evt.summary;
        if (summariesByMode[m].host && summariesByMode[m].client && modeCompletionNotifier) {
          modeCompletionNotifier(m);
        }
      }
    }
  };

  const reproStreamPlugin = {
    name: 'rc-multiplayer-room-repro-stream',
    configureServer(server) {
      server.middlewares.use('/__rc_repro_stream', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end('Method Not Allowed');
          return;
        }
        const chunks = [];
        req.on('data', (chunk) => chunks.push(chunk));
        req.on('end', () => {
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ ok: true }));
          try {
            const raw = Buffer.concat(chunks).toString('utf8');
            for (const line of raw.split('\n')) {
              const trimmed = line.trim();
              if (!trimmed) continue;
              ingestStreamEvent(JSON.parse(trimmed));
            }
          } catch {
            // Ignore malformed stream payload
          }
        });
      });
    },
  };

  const server = await createServer({
    server: {
      host: '127.0.0.1',
      port: 0,
      strictPort: false,
    },
    plugins: [reproStreamPlugin],
    logLevel: 'warn',
  });

  await server.listen();
  const address = server.httpServer?.address();
  const port = typeof address === 'object' && address ? address.port : 5173;
  const protocol = server.config.server.https ? 'https' : 'http';

  console.log(
    `[MultiplayerRoomRepro] Vite server listening at ${protocol}://127.0.0.1:${port} (modes=${opts.modesToRun.join(',')}, speed=${opts.speed}x, watchdog=${opts.maxDurationMs}ms)`
  );

  let activeChromeProc = null;
  const killActiveChrome = () => {
    if (activeChromeProc && !activeChromeProc.killed) {
      try {
        activeChromeProc.kill('SIGKILL');
      } catch {
        // Ignore
      }
    }
    activeChromeProc = null;
  };

  const watchdogTimer = setTimeout(() => {
    autoTerminatedByWatchdog = true;
    console.warn(
      `\n[MultiplayerRoomRepro] 4.5-minute auto-termination watchdog (${opts.maxDurationMs}ms) reached! Terminating active browser and flushing collected telemetry...`
    );
    killActiveChrome();
    if (modeCompletionNotifier) {
      modeCompletionNotifier('watchdog');
    }
  }, opts.maxDurationMs);

  const chromeBin = process.env.CHROME_BIN || '/usr/bin/google-chrome';

  const workerStarvationsByMode = {
    '2p': [],
    '3p3ai': [],
  };

  for (let i = 0; i < opts.modesToRun.length; i++) {
    if (autoTerminatedByWatchdog) break;
    const rosterMode = opts.modesToRun[i];
    const roomCode = rosterMode === '2p' ? '4816' : '7216';
    const modeStartMs = Date.now();
    const userDataDir = `/tmp/chrome-mp-repro-${rosterMode}-${Date.now()}`;

    const queryParams = new URLSearchParams({
      skipShaderPrewarm: '1',
      log: 'verbose',
      reproRole: 'host',
      reproMode: rosterMode,
      reproRoom: roomCode,
      reproSpeed: String(opts.speed),
      reproBridgeSignaling: opts.bridgeSignaling ? '1' : '0',
    });

    const targetUrl = `${protocol}://127.0.0.1:${port}/?${queryParams.toString()}`;
    console.log(
      `\n[MultiplayerRoomRepro] === Starting scenario ${i + 1}/${opts.modesToRun.length}: mode=${rosterMode} (room=${roomCode}) ===`
    );

    const modeDonePromise = new Promise((resolve) => {
      const modeTimer = setTimeout(() => {
        console.warn(
          `[MultiplayerRoomRepro] Mode ${rosterMode} reached per-mode timeout (${PER_MODE_TIMEOUT_MS}ms); collecting partial results.`
        );
        resolve(rosterMode);
      }, PER_MODE_TIMEOUT_MS);

      modeCompletionNotifier = () => {
        clearTimeout(modeTimer);
        resolve(rosterMode);
      };
    });

    activeChromeProc = spawn(
      chromeBin,
      [
        '--headless=new',
        '--use-gl=angle',
        '--use-angle=swiftshader',
        '--enable-unsafe-swiftshader',
        '--ignore-gpu-blocklist',
        '--enable-webgl',
        '--ignore-certificate-errors',
        '--allow-insecure-localhost',
        '--no-sandbox',
        '--disable-gpu-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-popup-blocking',
        '--disable-features=WebRtcHideLocalIpsWithMdns',
        '--disable-background-timer-throttling',
        '--disable-renderer-backgrounding',
        '--disable-backgrounding-occluded-windows',
        '--autoplay-policy=no-user-gesture-required',
        `--user-data-dir=${userDataDir}`,
        '--window-size=1280,720',
        '--enable-logging=stderr',
        '--v=0',
        targetUrl,
      ],
      { stdio: ['ignore', 'pipe', 'pipe'] }
    );

    let stderrBuf = '';
    activeChromeProc.stderr.on('data', (chunk) => {
      stderrBuf += chunk.toString('utf8');
      let nl;
      while ((nl = stderrBuf.indexOf('\n')) !== -1) {
        const line = stderrBuf.slice(0, nl).trim();
        stderrBuf = stderrBuf.slice(nl + 1);
        const marker = '[ReproStream] ';
        const idx = line.indexOf(marker);
        if (idx !== -1) {
          let payload = line.slice(idx + marker.length);
          const srcIdx = payload.lastIndexOf('", source:');
          if (srcIdx !== -1) payload = payload.slice(0, srcIdx);
          try {
            ingestStreamEvent(JSON.parse(payload));
          } catch {
            // Ignore truncated stderr line
          }
          continue;
        }
        const starvMatch = line.match(
          /\[NetworkInputBuffer\] Input starvation for car #(\d+) at tick #(\d+) \(total starvations: (\d+)\)/
        );
        if (starvMatch) {
          const sample = {
            elapsedMs: Date.now() - modeStartMs,
            carIndex: Number(starvMatch[1]),
            tick: Number(starvMatch[2]),
            totalStarvations: Number(starvMatch[3]),
            rawLog: starvMatch[0],
          };
          workerStarvationsByMode[rosterMode].push(sample);
          ingestStreamEvent({
            type: 'input_starvation',
            role: 'host',
            rosterMode,
            sample,
          });
        }
      }
    });

    await modeDonePromise;
    modeCompletionNotifier = null;
    killActiveChrome();
    try {
      fs.rmSync(userDataDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup error
    }
  }

  clearTimeout(watchdogTimer);
  await server.close();

  for (const m of opts.modesToRun) {
    const h = summariesByMode[m].host;
    const workerStarv = workerStarvationsByMode[m] || [];
    if (h && workerStarv.length > 0) {
      h.inputStarvationLogCount = Math.max(h.inputStarvationLogCount || 0, workerStarv.length);
      if (!Array.isArray(h.starvationSamples) || h.starvationSamples.length === 0) {
        h.starvationSamples = workerStarv;
      }
    }
  }

  const report = {
    generatedAtIso: new Date().toISOString(),
    totalWallDurationMs: Date.now() - suiteStartMs,
    autoTerminatedByWatchdog,
    configuredModes: opts.modesToRun,
    speedMultiplier: opts.speed,
    scenarios: opts.modesToRun.map((m) => ({
      rosterMode: m,
      hostSummary: summariesByMode[m].host,
      clientSummary: summariesByMode[m].client,
      streamEventCount: eventsByMode[m].length,
    })),
  };

  fs.writeFileSync(opts.outPath, JSON.stringify(report, null, 2), 'utf8');

  console.log('\n================================================================================');
  console.log('MULTIPLAYER HOST & JOIN REPRODUCTION DIAGNOSTIC SUMMARY');
  console.log('================================================================================');
  console.log(
    `Wall Clock Duration: ${report.totalWallDurationMs}ms | Watchdog Triggered: ${autoTerminatedByWatchdog}`
  );
  console.log(`Report Written To:   ${opts.outPath}`);

  for (const s of report.scenarios) {
    const h = s.hostSummary;
    const c = s.clientSummary;
    console.log(`\n--- Mode: ${s.rosterMode} ---`);
    if (h) {
      console.log(
        `  [Host]   reconcilerSnapLogs=${h.reconcilerSnapLogCount} (hardSnaps=${h.handshakeDiagnostics.reconcilerHardSnapCount}, corrections=${h.handshakeDiagnostics.reconcilerCorrections})`
      );
      console.log(
        `  [Host]   inputStarvationLogs=${h.inputStarvationLogCount} | enteredMatch=${h.enteredMatch} (${h.finalMatchMode}/${h.finalMatchPhase})`
      );
      console.log(
        `  [Host]   P2PWebRTCChannel.hasOwnIsHost=${h.handshakeDiagnostics.hasOwnIsHostProperty}, isHost=${String(h.handshakeDiagnostics.channelIsHostValue)}, rawCrossTabJoinedBeforeBridge=${h.rawCrossTabJoinedBeforeBridge}`
      );
      const anomalyCount = h.poseProbes.reduce((acc, p) => acc + p.anomalies.length, 0);
      console.log(
        `  [Host]   poseProbes=${h.poseProbes.length} | detectedPoseAnomalies=${anomalyCount}`
      );
      for (const p of h.poseProbes) {
        for (const a of p.anomalies) {
          console.log(`           - [${p.stage}] ${a.kind}: ${a.description}`);
        }
      }
    } else {
      console.log('  [Host]   No summary received');
    }

    if (c) {
      console.log(
        `  [Client] enteredMatch=${c.enteredMatch} (stuck at mode=${c.finalMatchMode}, phase=${c.finalMatchPhase})`
      );
      console.log(
        `  [Client] readonlyRttTypeErrorCount=${c.readonlyRttTypeErrorCount} | measuredRttGetterOnly=${c.handshakeDiagnostics.measuredRttGetterOnly} | isCrossTab=${c.handshakeDiagnostics.isCrossTab}`
      );
      if (c.caughtErrors.length > 0) {
        console.log(`  [Client] sampleError: ${c.caughtErrors[0]}`);
      }
    } else {
      console.log('  [Client] No summary received');
    }
  }
  console.log('================================================================================\n');
}

main().catch((err) => {
  console.error('[MultiplayerRoomRepro] Fatal runner error:', err);
  process.exit(1);
});
