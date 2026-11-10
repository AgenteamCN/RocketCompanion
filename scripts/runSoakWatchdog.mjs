#!/usr/bin/env node
/**
 * scripts/runSoakWatchdog.mjs
 * High-speed local stream soak & circuit-breaker watchdog runner (Perf01).
 * Launches Vite with real-time /__rc_soak_stream NDJSON telemetry middleware
 * and headless Chrome with precise V8 heap info, streams 600-tick (5s sim)
 * telemetry lines to stdout, and prints a full Autopsy Report immediately upon
 * soft-limit circuit-breaker trip or soak completion.
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { createServer } from 'vite';

const DEFAULT_OUT_PATH = '/tmp/soak-watchdog-report.json';
const TIMEOUT_MS = 180_000;

function parseCliArgs(argv) {
  let scenario = 'freeplay_chaos_soak';
  let speed = 'max';
  let ticks = 72000;
  let windowTicks = 600;
  let minWindows = 3;
  let maxHeapMb = 512;
  let maxUncleanedAudioEvents = 50000;
  let maxStageDriftRatio = 3.0;
  let noCircuitBreaker = false;
  let expectTrip = false;
  let allowTrip = false;
  let skipShaderPrewarm = true;
  let outPath = DEFAULT_OUT_PATH;

  for (const arg of argv.slice(2)) {
    if (arg.startsWith('--scenario=')) {
      scenario = arg.slice('--scenario='.length).trim() || 'freeplay_chaos_soak';
    } else if (arg.startsWith('--speed=')) {
      speed = arg.slice('--speed='.length).trim() || 'max';
    } else if (arg.startsWith('--ticks=')) {
      ticks = Number(arg.slice('--ticks='.length)) || 72000;
    } else if (arg.startsWith('--window-ticks=')) {
      windowTicks = Number(arg.slice('--window-ticks='.length)) || 600;
    } else if (arg.startsWith('--min-windows=')) {
      minWindows = Number(arg.slice('--min-windows='.length)) || 3;
    } else if (arg.startsWith('--max-heap-mb=')) {
      maxHeapMb = Number(arg.slice('--max-heap-mb='.length)) || 512;
    } else if (arg.startsWith('--max-uncleaned-audio-events=')) {
      maxUncleanedAudioEvents = Number(arg.slice('--max-uncleaned-audio-events='.length)) || 50000;
    } else if (arg.startsWith('--max-stage-drift-ratio=')) {
      maxStageDriftRatio = Number(arg.slice('--max-stage-drift-ratio='.length)) || 3.0;
    } else if (arg === '--no-circuit-breaker') {
      noCircuitBreaker = true;
    } else if (arg === '--expect-trip') {
      expectTrip = true;
    } else if (arg === '--allow-trip') {
      allowTrip = true;
    } else if (arg === '--prewarm-shaders') {
      skipShaderPrewarm = false;
    } else if (arg.startsWith('--out=')) {
      outPath = arg.slice('--out='.length).trim() || DEFAULT_OUT_PATH;
    }
  }

  return {
    scenario,
    speed,
    ticks,
    windowTicks,
    minWindows,
    maxHeapMb,
    maxUncleanedAudioEvents,
    maxStageDriftRatio,
    noCircuitBreaker,
    expectTrip,
    allowTrip,
    skipShaderPrewarm,
    outPath,
  };
}

async function main() {
  const opts = parseCliArgs(process.argv);
  let resolveReport;
  let rejectReport;
  const reportPromise = new Promise((resolve, reject) => {
    resolveReport = resolve;
    rejectReport = reject;
  });

  const printedStreamLines = new Set();
  let autopsyPrinted = false;

  const printStreamLineOnce = (line) => {
    const trimmed = String(line || '').trim();
    if (!trimmed || printedStreamLines.has(trimmed)) return;
    printedStreamLines.add(trimmed);
    console.log(`  ${trimmed}`);
  };

  const printAutopsyOnce = (autopsy) => {
    if (autopsyPrinted || !autopsy?.formattedAutopsyLines) return;
    autopsyPrinted = true;
    console.log('');
    for (const line of autopsy.formattedAutopsyLines) {
      console.log(line);
    }
  };

  const soakWatchdogPlugin = {
    name: 'rc-soak-stream-watchdog-receiver',
    configureServer(server) {
      server.middlewares.use('/__rc_soak_stream', (req, res) => {
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
              const evt = JSON.parse(trimmed);
              if (evt.type === 'window' && evt.sample?.formattedLine) {
                printStreamLineOnce(evt.sample.formattedLine);
              } else if (evt.type === 'autopsy' && evt.autopsy) {
                printAutopsyOnce(evt.autopsy);
              }
            }
          } catch {
            // Ignore malformed stream line
          }
        });
      });

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
    plugins: [soakWatchdogPlugin],
    logLevel: 'warn',
  });

  await server.listen();
  const address = server.httpServer?.address();
  const port = typeof address === 'object' && address ? address.port : 5173;
  const protocol = server.config.server.https ? 'https' : 'http';

  const queryParams = new URLSearchParams({
    autorunScenario: opts.scenario,
    autorunSpeed: opts.speed,
    diffBaseline: '0',
    nokey: '1',
    soakWatchdog: '1',
    soakTicks: String(opts.ticks),
    soakWindowTicks: String(opts.windowTicks),
    minWindows: String(opts.minWindows),
    maxHeapMb: String(opts.maxHeapMb),
    maxUncleanedAudioEvents: String(opts.maxUncleanedAudioEvents),
    maxStageDriftRatio: String(opts.maxStageDriftRatio),
  });
  if (opts.noCircuitBreaker) {
    queryParams.set('noCircuitBreaker', '1');
  }
  if (opts.skipShaderPrewarm) {
    queryParams.set('skipShaderPrewarm', '1');
  }

  const targetUrl = `${protocol}://127.0.0.1:${port}/?${queryParams.toString()}`;
  console.log(`[SoakWatchdog] Vite stream server listening at ${protocol}://127.0.0.1:${port}`);
  console.log(
    `[SoakWatchdog] Thresholds: maxHeap=${opts.maxHeapMb}MB, maxUncleanedAudioEvents=${opts.maxUncleanedAudioEvents.toLocaleString('en-US')}, maxStageDriftRatio=${opts.maxStageDriftRatio}x, window=${opts.windowTicks} ticks`
  );
  console.log(`[SoakWatchdog] Launching headless Chrome (${opts.ticks} target ticks)...`);

  const chromeBin = process.env.CHROME_BIN || '/usr/bin/google-chrome';
  const chromeArgs = [
    '--headless=new',
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--ignore-gpu-blocklist',
    '--enable-webgl',
    '--enable-precise-memory-info',
    '--js-flags=--expose-gc',
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
      const soakMarker = '[SoakStream] ';
      const soakIdx = line.indexOf(soakMarker);
      if (soakIdx !== -1) {
        let msg = line.slice(soakIdx + soakMarker.length);
        const quoteIdx = msg.lastIndexOf('", source:');
        if (quoteIdx !== -1) msg = msg.slice(0, quoteIdx);
        printStreamLineOnce(msg);
      }
      const reportMarker = '[ScenarioBaselineReport:JSON] ';
      const reportIdx = line.indexOf(reportMarker);
      if (reportIdx !== -1) {
        let jsonCandidate = line.slice(reportIdx + reportMarker.length);
        const quoteIdx = jsonCandidate.lastIndexOf('", source:');
        if (quoteIdx !== -1) jsonCandidate = jsonCandidate.slice(0, quoteIdx);
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
    rejectReport(new Error(`Soak watchdog timed out after ${TIMEOUT_MS}ms`));
  }, TIMEOUT_MS);

  try {
    const suiteReport = await reportPromise;
    clearTimeout(timeoutHandle);

    const sc = suiteReport.scenarios?.[0];
    const soakReport = sc?.soakWatchdog;
    if (soakReport?.autopsy) {
      printAutopsyOnce(soakReport.autopsy);
    }

    const resolvedOut = path.resolve(opts.outPath);
    fs.mkdirSync(path.dirname(resolvedOut), { recursive: true });
    fs.writeFileSync(resolvedOut, JSON.stringify(suiteReport, null, 2), 'utf8');

    const tripped = Boolean(soakReport?.autopsy?.circuitBreakerTripped);
    console.log(
      `\n[SoakWatchdog] Bootstrap: ${suiteReport.bootstrap?.totalDurationMs ?? 0}ms | Scenario Wall: ${sc?.wallClockDurationMs ?? 0}ms | Rate: ${sc?.effectiveTickRateHz ?? 0}Hz (${sc?.speedupFactorVsRealtime ?? 0}x realtime)`
    );
    console.log(`[SoakWatchdog] Report saved to: ${resolvedOut}\n`);

    if (opts.expectTrip) {
      process.exitCode = tripped ? 0 : 1;
    } else if (opts.allowTrip) {
      process.exitCode = 0;
    } else {
      process.exitCode = suiteReport.overallPassed && !tripped ? 0 : 1;
    }
  } catch (err) {
    clearTimeout(timeoutHandle);
    console.error('[SoakWatchdog] Execution failed:', err);
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
