#!/usr/bin/env node
/**
 * scripts/runScenarioBaseline.mjs
 * Launches a local Vite server and headless Chrome with WebGL2 (ANGLE / SwiftShader),
 * executes the deterministic fast-forward scenario baseline suite
 * (?autorunScenario=all&autorunSpeed=20x&diffBaseline=1), intercepts unhandled runtime
 * exceptions & console.error, runs SceneGraph vehicle rig geometry probes against the
 * 65f1538d Golden Baseline, writes the JSON report, and prints a summary table.
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { createServer } from 'vite';

const DEFAULT_OUT_PATH = '/tmp/telemetry-baseline-report.json';
const TIMEOUT_MS = 270_000;

function parseCliArgs(argv) {
  let scenario = 'all';
  let speed = 'max';
  let diffBaseline = true;
  let allowConsoleError = false;
  let outPath = DEFAULT_OUT_PATH;

  for (const arg of argv.slice(2)) {
    if (arg.startsWith('--scenario=')) {
      scenario = arg.slice('--scenario='.length).trim() || 'all';
    } else if (arg.startsWith('--speed=')) {
      speed = arg.slice('--speed='.length).trim() || 'max';
    } else if (
      arg === '--diff-baseline' ||
      arg === '--diff-baseline=true' ||
      arg === '--diff-baseline=1'
    ) {
      diffBaseline = true;
    } else if (
      arg === '--no-diff-baseline' ||
      arg === '--diff-baseline=false' ||
      arg === '--diff-baseline=0'
    ) {
      diffBaseline = false;
    } else if (arg === '--allow-console-error' || arg === '--allow-console-error=true') {
      allowConsoleError = true;
    } else if (arg.startsWith('--out=')) {
      outPath = arg.slice('--out='.length).trim() || DEFAULT_OUT_PATH;
    }
  }
  return { scenario, speed, diffBaseline, allowConsoleError, outPath };
}

function padRight(str, width) {
  const s = String(str);
  return s.length >= width ? s.slice(0, width) : s + ' '.repeat(width - s.length);
}

function padLeft(str, width) {
  const s = String(str);
  return s.length >= width ? s : ' '.repeat(width - s.length) + s;
}

function printFormattedBaselineReport(report, outPath) {
  const hr = '='.repeat(96);
  const thinHr = '-'.repeat(96);
  console.log(`\n${hr}`);
  console.log(
    ' ROCKET COMPANION -- DETERMINISTIC SCENARIO, SCENEGRAPH PROBE & 65F1538D GOLDEN DIFF REPORT'
  );
  console.log(hr);
  console.log(
    ` Generated At     : ${report.generatedAtIso} (schema v${report.schemaVersion || '1.1.0'})`
  );
  console.log(` Speed Preset     : ${report.configuredSpeedPreset || '20x'}`);
  console.log(` WebGL Renderer   : ${report.webglRenderer}`);
  console.log(` WebGL Vendor     : ${report.webglVendor}`);
  console.log(
    ` Bootstrap Time   : ${report.bootstrap.totalDurationMs} ms (${report.bootstrap.totalSteps} steps) | Bg Assets: ${report.bootstrap.backgroundAssetsDurationMs} ms`
  );
  console.log(
    ` Initial Shaders  : ${report.bootstrap.initialCompiledShaderPrograms} compiled WebGL programs`
  );
  console.log(thinHr);
  console.log(' BOOTSTRAP STAGES (1~6):');
  for (const st of report.bootstrap.stages || []) {
    console.log(
      `   [Stage ${st.stageIndex}] ${padRight(st.stageTitle, 28)} : ${padLeft(st.totalDurationMs.toFixed(1), 7)} ms (${st.taskCount} tasks)`
    );
  }

  for (const sc of report.scenarios || []) {
    console.log(`\n${hr}`);
    console.log(
      ` SCENARIO: ${sc.scenarioId} [${sc.passed ? 'PASSED' : 'FAILED'}] (speed=${sc.configuredSpeedPreset || '20x'})`
    );
    console.log(` Title   : ${sc.title}`);
    console.log(
      ` Pacing  : ${sc.totalTicks} ticks (${sc.simulatedDurationSeconds}s sim) in ${sc.wallClockDurationMs} ms wall -> ${sc.effectiveTickRateHz} Hz (${sc.speedupFactorVsRealtime}x realtime)`
    );
    console.log(
      ` Renders : ${sc.renderedFramesCount} GPU frames rendered, ${sc.skippedRenderFramesCount} intermediate frames fast-forwarded`
    );
    console.log(thinHr);
    console.log(
      ` ${padRight('Pipeline Stage', 20)} | ${padLeft('Mean ms', 9)} | ${padLeft('P50 ms', 9)} | ${padLeft('P95 ms', 9)} | ${padLeft('P99 ms', 9)} | ${padLeft('Max ms', 9)} | ${padLeft('MaxTick', 7)} | ${padLeft('Total ms', 9)}`
    );
    console.log(thinHr);
    for (const stageKey of [
      'InputStage',
      'SimulationStage',
      'GameplayModeStage',
      'PresentationStage',
      'AudioStage',
      'RenderStage',
      'TelemetryStage',
      'TotalFrame',
    ]) {
      const st = sc.stageTimings?.[stageKey];
      if (!st) continue;
      console.log(
        ` ${padRight(st.stage, 20)} | ${padLeft(st.meanMs.toFixed(4), 9)} | ${padLeft(st.p50Ms.toFixed(4), 9)} | ${padLeft(st.p95Ms.toFixed(4), 9)} | ${padLeft(st.p99Ms.toFixed(4), 9)} | ${padLeft(st.maxMs.toFixed(4), 9)} | ${padLeft(st.maxTick, 7)} | ${padLeft(st.totalWallMs.toFixed(2), 9)}`
      );
    }

    console.log(thinHr);
    console.log(' KEYFRAME GPU RENDERS & SHADER COMPILATION DELTAS:');
    for (const kf of sc.keyframeRenders || []) {
      console.log(
        `   tick=${padLeft(kf.tick, 4)} | ${padRight(kf.reason, 42)} | phase=${padRight(kf.phase, 11)} | cam=${padRight(kf.cameraMode, 8)} | render=${padLeft(kf.renderStageWallMs.toFixed(2), 6)}ms | shaders=${kf.shaderProgramsBefore}->${kf.shaderProgramsAfter} (+${kf.shaderProgramsDelta}) | calls=${kf.drawCalls} tris=${kf.triangles}`
      );
    }

    console.log(thinHr);
    console.log(' TOP HITCH FRAMES ATTRIBUTION:');
    for (const hf of sc.topHitchFrames || []) {
      console.log(
        `   tick=${padLeft(hf.tick, 4)} | total=${padLeft(hf.totalFrameWallMs.toFixed(2), 6)}ms | dominant=${padRight(hf.dominantStage, 18)} (${padLeft(hf.dominantStageWallMs.toFixed(2), 6)}ms) | phase=${padRight(hf.phase, 11)} | gpuRender=${hf.didGpuRender} | shaderDelta=+${hf.shaderProgramsDelta}`
      );
    }

    const cs = sc.cameraSmoothness;
    if (cs) {
      console.log(thinHr);
      console.log(
        ` CAMERA SMOOTHNESS : samples=${cs.sampleCount}, NaN=${cs.nanFrameCount}, P95_posStep=${cs.p95PositionStepDistance}uu (max=${cs.maxPositionStepDistance}uu), P95_angStep=${cs.p95AngularStepDeg}deg | DirectorReplaySamples=${cs.directorReplaySamples}, FirstReplayRender=${cs.directorReplayFirstFrameRenderMs ?? 'n/a'}ms (shaderDelta=+${cs.directorReplayFirstFrameShaderDelta ?? 0})`
      );
    }

    const mp = sc.multiplayerLoopback;
    if (mp) {
      console.log(thinHr);
      console.log(
        ` 6-CAR MULTIPLAYER : physicalCars=${mp.activePhysicalCars}/${mp.configuredCarCount}, visibleCars=${mp.visibleArenaCars}, virtualPeers=${mp.virtualPeersConnected}`
      );
      console.log(
        ` PACKET THROUGHPUT : clientSent=${mp.totalClientInputPacketsSent} pkts (${mp.totalClientInputBytesSent} B) | serverRecv=${mp.totalServerFramePacketsReceived} pkts (${mp.totalServerFrameBytesReceived} B)`
      );
      console.log(
        ` RECONCILER STATS  : corrections=${mp.reconcilerCorrections}, skippedTier1=${mp.reconcilerSkippedCorrections}, hardSnaps=${mp.reconcilerHardSnaps}, maxDelta=${mp.reconcilerMaxCorrectionDelta}`
      );
      console.log(` SIGNALS OBSERVED  : [${mp.distinctSignalNames.join(', ')}]`);
    }

    const re = sc.runtimeErrors;
    if (re) {
      console.log(thinHr);
      console.log(
        ` RUNTIME ERROR INTERCEPTION : total=${re.totalErrorCount} (window.onerror=${re.windowErrorCount}, unhandledrejection=${re.unhandledRejectionCount}, console.error=${re.consoleErrorCount})`
      );
      for (const entry of (re.entries || []).slice(0, 8)) {
        const loc = entry.fileName
          ? ` @ ${entry.fileName}:${entry.lineNumber ?? 0}:${entry.columnNumber ?? 0}`
          : '';
        console.log(
          `   [ERROR] (tick ${padLeft(entry.tick, 4)}) [${entry.source}] ${entry.message}${loc}`
        );
      }
    }

    if (sc.vehicleRigProbes && sc.vehicleRigProbes.length > 0) {
      console.log(thinHr);
      console.log(' SCENEGRAPH VEHICLE RIG GEOMETRY PROBES:');
      for (const p of sc.vehicleRigProbes) {
        console.log(
          `   car[${p.carIndex}] preset=${padRight(p.visualId, 14)} hitbox=${padRight(p.hitboxPresetId, 16)} | wheelbaseX=${padLeft(p.wheelbaseX, 7)}uu | frontTrackZ=${padLeft(p.frontTrackWidthZ, 7)}uu | rearTrackZ=${padLeft(p.rearTrackWidthZ, 7)}uu | wheelHeightsY=[${p.wheelHeightsY.join(', ')}] | boosts=${p.boostOutlets.length}`
        );
      }
    }

    console.log(thinHr);
    console.log(' ASSERTIONS:');
    for (const a of sc.assertions || []) {
      console.log(
        `   [${a.passed ? 'PASS' : 'FAIL'}] (tick ${padLeft(a.tick, 4)}) ${padRight(a.label, 44)} -> ${a.detail}`
      );
    }
  }

  const gd = report.goldenBaselineDiff;
  if (gd) {
    console.log(`\n${hr}`);
    console.log(
      ` 65F1538D GOLDEN BASELINE DIFF SUMMARY (ref=${gd.referenceCommit.slice(0, 8)}, ui-core=${gd.referenceUiCoreCommit.slice(0, 8)}) [${gd.passed ? 'MATCHED' : 'DRIFT DETECTED'}]`
    );
    console.log(thinHr);
    const failedStatic = (gd.staticDescriptorDiffs || []).filter((d) => !d.passed);
    console.log(
      ` Static Descriptors & Hitboxes : ${(gd.staticDescriptorDiffs || []).length - failedStatic.length}/${(gd.staticDescriptorDiffs || []).length} checks matched`
    );
    for (const item of gd.staticDescriptorDiffs || []) {
      if (!item.passed) {
        console.log(
          `   [DRIFT] ${padRight(item.field, 38)} | maxDelta=${padLeft(item.maxAbsDelta, 9)} | expected=${JSON.stringify(item.expected)} | actual=${JSON.stringify(item.actual)}`
        );
      }
    }
    for (const rigDiff of gd.vehicleRigDiffs || []) {
      console.log(
        ` Live SceneGraph Rig car[${rigDiff.carIndex}] (${rigDiff.visualId} vs ${rigDiff.goldenReferenceId}) : ${rigDiff.passed ? 'MATCHED' : 'DRIFT'} (maxDelta=${rigDiff.maxCoordinateDeltaUu}uu)`
      );
      for (const m of rigDiff.mismatches || []) {
        console.log(
          `   [RIG DRIFT] ${padRight(m.field, 34)} | maxDelta=${padLeft(m.maxAbsDelta, 9)} | expected=${JSON.stringify(m.expected)} | actual=${JSON.stringify(m.actual)}`
        );
      }
    }
  }

  console.log(`\n${hr}`);
  console.log(
    ` OVERALL SUITE STATUS : ${report.overallPassed ? 'GREEN (ALL SCENARIOS PASSED)' : 'RED (ASSERTION OR RUNTIME ERRORS DETECTED)'}`
  );
  console.log(` JSON REPORT SAVED TO : ${outPath}`);
  console.log(`${hr}\n`);
}

async function main() {
  const { scenario, speed, diffBaseline, allowConsoleError, outPath } = parseCliArgs(process.argv);
  let resolveReport;
  let rejectReport;
  const reportPromise = new Promise((resolve, reject) => {
    resolveReport = resolve;
    rejectReport = reject;
  });

  const reportReceiverPlugin = {
    name: 'rc-scenario-report-receiver',
    configureServer(server) {
      server.middlewares.use('/__rc_scenario_report', (req, res) => {
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
            const parsed = JSON.parse(raw);
            if (parsed.fatalError) {
              rejectReport(new Error(parsed.fatalError));
            } else {
              resolveReport(parsed);
            }
          } catch (err) {
            rejectReport(err);
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
    plugins: [reportReceiverPlugin],
    logLevel: 'warn',
  });

  await server.listen();
  const address = server.httpServer?.address();
  const port = typeof address === 'object' && address ? address.port : 5173;
  const protocol = server.config.server.https ? 'https' : 'http';
  const queryParams = new URLSearchParams({
    autorunScenario: scenario,
    autorunSpeed: speed,
    diffBaseline: diffBaseline ? '1' : '0',
    nokey: '1',
  });
  if (allowConsoleError) {
    queryParams.set('allowConsoleError', '1');
  }
  const targetUrl = `${protocol}://127.0.0.1:${port}/?${queryParams.toString()}`;

  console.log(`[ScenarioRunner] Vite server listening at ${protocol}://127.0.0.1:${port}`);
  console.log(`[ScenarioRunner] Launching headless Chrome with WebGL2 (SwiftShader/ANGLE)...`);
  console.log(`[ScenarioRunner] Target URL: ${targetUrl}`);

  const chromeBin = process.env.CHROME_BIN || '/usr/bin/google-chrome';
  const chromeArgs = [
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
    '--autoplay-policy=no-user-gesture-required',
    '--window-size=1280,720',
    '--enable-logging=stderr',
    '--v=0',
    targetUrl,
  ];

  const chromeProc = spawn(chromeBin, chromeArgs, {
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let stderrBuf = '';
  chromeProc.stderr.on('data', (chunk) => {
    stderrBuf += chunk.toString('utf8');
    let newlineIdx;
    while ((newlineIdx = stderrBuf.indexOf('\n')) !== -1) {
      const line = stderrBuf.slice(0, newlineIdx).trim();
      stderrBuf = stderrBuf.slice(newlineIdx + 1);
      if (
        line.includes('[ScenarioBaseline]') ||
        line.includes('[Bootstrap Error]') ||
        line.includes('[FATAL]')
      ) {
        console.log(`  ${line}`);
      }
      const markerIdx = line.indexOf('[ScenarioBaselineReport:JSON] ');
      if (markerIdx !== -1) {
        const jsonCandidate = line.slice(markerIdx + '[ScenarioBaselineReport:JSON] '.length);
        try {
          const parsed = JSON.parse(jsonCandidate);
          resolveReport(parsed);
        } catch {
          // Wait for HTTP POST if console line was truncated
        }
      }
    }
  });

  const timeoutHandle = setTimeout(() => {
    rejectReport(new Error(`Scenario baseline timed out after ${TIMEOUT_MS}ms`));
  }, TIMEOUT_MS);

  try {
    const report = await reportPromise;
    clearTimeout(timeoutHandle);

    const resolvedOut = path.resolve(outPath);
    fs.mkdirSync(path.dirname(resolvedOut), { recursive: true });
    fs.writeFileSync(resolvedOut, JSON.stringify(report, null, 2), 'utf8');

    printFormattedBaselineReport(report, resolvedOut);
    process.exitCode = report.overallPassed ? 0 : 1;
  } catch (err) {
    clearTimeout(timeoutHandle);
    console.error('[ScenarioRunner] Baseline execution failed:', err);
    process.exitCode = 1;
  } finally {
    try {
      chromeProc.kill('SIGKILL');
    } catch {
      // Ignore
    }
    await server.close();
  }
}

main();
