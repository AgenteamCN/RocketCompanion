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
const DEFAULT_MAX_DURATION_MS = 285_000;
const PER_MODE_TIMEOUT_MS = 115_000;

function parseCliArgs(argv) {
  let mode = 'all';
  let speed = 1;
  let maxDurationMs = DEFAULT_MAX_DURATION_MS;
  let outPath = DEFAULT_OUT_PATH;
  let bridgeSignaling = true;
  let probes = 'all';
  let latencyMs = 50;
  let bandwidthKbps = 512;
  let physicsHz = '60,90,100,120,144';

  for (const arg of argv.slice(2)) {
    if (arg.startsWith('--mode=')) {
      const val = arg.slice('--mode='.length).trim();
      if (val === '2p' || val === '2p2ai' || val === '3p3ai' || val === 'both' || val === 'all') {
        mode = val;
      }
    } else if (arg.startsWith('--speed=')) {
      speed = Math.max(1, Math.min(8, Number(arg.slice('--speed='.length)) || 1));
    } else if (arg.startsWith('--probe=') || arg.startsWith('--probes=')) {
      const eq = arg.indexOf('=');
      probes = arg.slice(eq + 1).trim() || 'all';
    } else if (arg.startsWith('--latency-ms=')) {
      latencyMs = Math.max(0, Math.min(300, Number(arg.slice('--latency-ms='.length)) || 0));
    } else if (arg.startsWith('--bandwidth-kbps=')) {
      bandwidthKbps = Math.max(32, Number(arg.slice('--bandwidth-kbps='.length)) || 512);
    } else if (arg.startsWith('--physics-hz=')) {
      physicsHz = arg.slice('--physics-hz='.length).trim() || '60,90,100,120,144';
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

  const modesToRun = mode === 'all' || mode === 'both' ? ['2p', '2p2ai', '3p3ai'] : [mode];
  return {
    mode,
    modesToRun,
    speed,
    probes,
    latencyMs,
    bandwidthKbps,
    physicsHz,
    maxDurationMs,
    outPath,
    bridgeSignaling,
  };
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
    const tagsSummary = (p.nameTagEntries || []).map((t) => `#${t.carIndex}:${t.name}`).join(', ');
    const traj = p.ballTrajectory
      ? `traj(pred=${p.ballTrajectory.predictionCount},max=${p.ballTrajectory.maxObservedPredictionCount},collapses=${p.ballTrajectory.collapseToCatchupCount})`
      : '';
    return `[Stream][PoseProbe][${p.rosterMode}][${p.role}][${p.stage}] mode=${p.matchMode} phase=${p.matchPhase} tick=${p.simTick} playerCar=#${p.playerCarIndex ?? 0} ${traj}\n    sim:  ${simSummary}\n    mesh: ${meshSummary}\n    tags: ${tagsSummary}`;
  }
  if (evt.type === 'lobby_probe_diag') {
    const d = evt.diag;
    return `[Stream][LobbyProbeDiag][${d.rosterMode}][${d.role} +${d.elapsedMs}ms] fleetEnabled=${d.fleetControllerEnabled} mask=0x${d.serverActiveCarMask.toString(16)} car6Vis=${d.car6MeshVisible}(name=${JSON.stringify(d.car6ResolvedNameTag)},exp=${d.expectedCar6NameTag}) car7Vis=${d.car7MeshVisible}(name=${JSON.stringify(d.car7ResolvedNameTag)},exp=${d.expectedCar7NameTag}) hostMismatch=${d.hostProbeNamesMismatch} clientBlind=${d.clientCannotSeeHostProbes}`;
  }
  if (evt.type === 'lobby_goal_reset_diag') {
    const d = evt.diag;
    return `[Stream][LobbyGoalResetDiag][${d.rosterMode}][${d.role} +${d.elapsedMs}ms] dualWorld=${d.isLobbyDualWorld} maxAbsY=${d.maxObservedAbsBallY} postBallY=${d.postWaitBallPos[1]} resetObserved=${d.ballResetToCenterObserved} stuckInGoal=${d.ballStuckInGoal}`;
  }
  if (evt.type === 'network_latency_hud_diag') {
    const d = evt.diag;
    return `[Stream][NetLatencyHudDiag][${d.rosterMode}][${d.role} +${d.elapsedMs}ms] injected=${d.injectedUplinkMs}/${d.injectedDownlinkMs}ms rtt=${d.channelMeasuredRttMsAfterPing}ms(rec=${d.reconcilerRttMs}ms) pings=${d.pingsSentDelta}/${d.pongsReceivedDelta} bw=${d.realizedThroughputKbps}kbps hudBlurPing=${d.hudPeerPingDuringPowerSaveMs}ms(droppedTo18=${d.hudDroppedToHardcoded18Ms})`;
  }
  if (evt.type === 'roster_visibility_probe') {
    const p = evt.probe;
    const names = p.nameTagCarEntries.map((e) => `#${e.carIndex}:${e.name}`).join(', ');
    return `[Stream][RosterVisProbe][${p.rosterMode}][${p.role}][${p.stage}] visibleCars=[${p.visibleCarIndices.join(',')}] clientCar1Vis=${p.clientCar1Visible} genericCarNames=${p.forcedGenericCarNamesDetected} nameTags=[${names}]`;
  }
  if (evt.type === 'host_takeover_diag') {
    const d = evt.diag;
    return `[Stream][HostTakeoverDiag][${d.rosterMode} +${d.elapsedMs}ms] localTeamDefault=${d.uiDefaultLocalTeam} botFill=${d.botFillMode} bots=${d.activeBotCountInMatch} car0AfterNeutralSwitch=${d.car0AssignedEntityAfterNeutralSwitch} botTookOverCar0=${d.botFillTakesOverCar0WhenHostNeutralSwitched} hostCarIdxStill0=${d.hostLocalCarIndexStillZero}`;
  }
  if (evt.type === 'trajectory_diag') {
    const t = evt.summary;
    return `[Stream][TrajectoryDiag][${t.rosterMode}][${t.role}] writeRevDelta=+${t.writeRevisionIncrementsDuringFlight} fullResets=${t.fullResetCountDuringFlight}/${t.samples.length} predCountRange=[${t.minPredictionCountObserved}..${t.maxPredictionCountObserved}]/${t.maxPredictionTicks} catchupBudget=${t.catchupTicksPerFrame} collapsed=${t.trajectoryCollapsedBelow30Ticks}`;
  }
  if (evt.type === 'physics_rate_sweep_diag') {
    const d = evt.diag;
    const stepStr = d.steps.map((s) => `${s.targetHz}->${s.realizedRateHz}Hz`).join(', ');
    return `[Stream][PhysicsRateSweepDiag][${d.rosterMode}][${d.role} +${d.elapsedMs}ms] steps=[${stepStr}] snaps=${d.totalHardSnapsAcrossSweep} starvations=${d.totalStarvationsAcrossSweep}`;
  }
  if (evt.type === 'goal_replay_kickoff_diag') {
    const d = evt.diag;
    return `[Stream][GoalReplayKickoffDiag][${d.rosterMode}][${d.role} +${d.elapsedMs}ms] completed=${d.goalsCompletedToPlaying}/${d.goalsAttempted} tickRegressed=${d.anyTickRegressionDetected} fallbackWarns=${d.totalKickoffFallbackWarnings} clientFrozen=${d.clientFrozenAfterReplay}`;
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
    return `[Stream][RoleSummary][${s.rosterMode}][${s.role}] elapsed=${s.elapsedMs}ms snaps=${s.reconcilerSnapLogCount} starvations=${s.inputStarvationLogCount} fallbackWarns=${s.kickoffFallbackWarnCount ?? 0} rttErrors=${s.readonlyRttTypeErrorCount} enteredMatch=${s.enteredMatch} final=${s.finalMatchMode}/${s.finalMatchPhase}`;
  }
  return `[Stream] ${JSON.stringify(evt)}`;
}

async function main() {
  const opts = parseCliArgs(process.argv);
  const suiteStartMs = Date.now();
  let autoTerminatedByWatchdog = false;

  const eventsByMode = {
    '2p': [],
    '2p2ai': [],
    '3p3ai': [],
  };
  const summariesByMode = {
    '2p': { host: null, client: null },
    '2p2ai': { host: null, client: null },
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
      evt.rosterMode ||
      evt.probe?.rosterMode ||
      evt.diag?.rosterMode ||
      evt.summary?.rosterMode ||
      '3p3ai';
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
    '2p2ai': [],
    '3p3ai': [],
  };

  for (let i = 0; i < opts.modesToRun.length; i++) {
    if (autoTerminatedByWatchdog) break;
    const rosterMode = opts.modesToRun[i];
    const roomCode = rosterMode === '2p' ? '4816' : rosterMode === '2p2ai' ? '8144' : '7216';
    const modeStartMs = Date.now();
    const userDataDir = `/tmp/chrome-mp-repro-${rosterMode}-${Date.now()}`;

    const queryParams = new URLSearchParams({
      skipShaderPrewarm: '1',
      log: 'verbose',
      reproRole: 'host',
      reproMode: rosterMode,
      reproRoom: roomCode,
      reproSpeed: String(opts.speed),
      reproProbes: opts.probes,
      reproLatencyMs: String(opts.latencyMs),
      reproBandwidthKbps: String(opts.bandwidthKbps),
      reproPhysicsHz: opts.physicsHz,
      reproBridgeSignaling: opts.bridgeSignaling ? '1' : '0',
    });

    const targetUrl = `${protocol}://127.0.0.1:${port}/?${queryParams.toString()}`;
    console.log(
      `\n[MultiplayerRoomRepro] === Starting scenario ${i + 1}/${opts.modesToRun.length}: mode=${rosterMode} (room=${roomCode}, probes=${opts.probes}) ===`
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
    configuredProbes: opts.probes,
    latencyMs: opts.latencyMs,
    bandwidthKbps: opts.bandwidthKbps,
    physicsHz: opts.physicsHz,
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
        `  [Host]   inputStarvationLogs=${h.inputStarvationLogCount} | kickoffFallbackWarns=${h.kickoffFallbackWarnCount ?? 0} | enteredMatch=${h.enteredMatch} (${h.finalMatchMode}/${h.finalMatchPhase})`
      );
      console.log(
        `  [Host]   P2PWebRTCChannel.hasOwnIsHost=${h.handshakeDiagnostics.hasOwnIsHostProperty}, isHost=${String(h.handshakeDiagnostics.channelIsHostValue)}, rawCrossTabJoinedBeforeBridge=${h.rawCrossTabJoinedBeforeBridge}`
      );
      if (h.lobbyProbeDiagnostics) {
        const lp = h.lobbyProbeDiagnostics;
        console.log(
          `  [Host]   [Phenomenon C: Lobby Probes] car6Name=${JSON.stringify(lp.car6ResolvedNameTag)} (exp="Boost"), car7Name=${JSON.stringify(lp.car7ResolvedNameTag)} (exp="Roll") | mismatch=${lp.hostProbeNamesMismatch}`
        );
      }
      if (h.lobbyGoalResetDiagnostics) {
        const gr = h.lobbyGoalResetDiagnostics;
        console.log(
          `  [Host]   [Edge-Case 1: Lobby Goal Reset] maxAbsY=${gr.maxObservedAbsBallY} -> postY=${gr.postWaitBallPos[1]} | resetObserved=${gr.ballResetToCenterObserved} | stuckInGoal=${gr.ballStuckInGoal}`
        );
      }
      if (h.networkLatencyHudDiagnostics) {
        const nl = h.networkLatencyHudDiagnostics;
        console.log(
          `  [Host]   [Edge-Case 2: 50ms/50ms Latency & HUD] rtt=${nl.channelMeasuredRttMsAfterPing}ms | pings=${nl.pingsSentDelta}/${nl.pongsReceivedDelta} | bw=${nl.realizedThroughputKbps}kbps | hudBlurPing=${nl.hudPeerPingDuringPowerSaveMs}ms (droppedTo18=${nl.hudDroppedToHardcoded18Ms})`
        );
      }
      if (h.hostTakeoverDiagnostics) {
        const ht = h.hostTakeoverDiagnostics;
        console.log(
          `  [Host]   [Phenomenon A: Host Takeover] localTeamDefault=${ht.uiDefaultLocalTeam} | botFill=${ht.botFillMode} (bots=${ht.activeBotCountInMatch}) | botTookOverCar0=${ht.botFillTakesOverCar0WhenHostNeutralSwitched} (${ht.car0AssignedEntityAfterNeutralSwitch}) | hostCarIdxStill0=${ht.hostLocalCarIndexStillZero}`
        );
      }
      if (Array.isArray(h.rosterVisibilityProbes) && h.rosterVisibilityProbes.length > 0) {
        const replayProbe =
          h.rosterVisibilityProbes.find((p) => p.stage === 'host_after_goal_replay_director') ||
          h.rosterVisibilityProbes[h.rosterVisibilityProbes.length - 1];
        const names = replayProbe.nameTagCarEntries
          .map((e) => `#${e.carIndex}:${e.name}`)
          .join(', ');
        console.log(
          `  [Host]   [Phenomenon B: NameTags & Vis] genericCarNames=${replayProbe.forcedGenericCarNamesDetected} | nameTags=[${names}]`
        );
      }
      if (h.trajectoryDiagnostics) {
        const td = h.trajectoryDiagnostics;
        console.log(
          `  [Host]   [Phenomenon D: Trajectory] writeRevDelta=+${td.writeRevisionIncrementsDuringFlight} | fullResets=${td.fullResetCountDuringFlight}/${td.samples.length} | predCount=[${td.minPredictionCountObserved}..${td.maxPredictionCountObserved}]/${td.maxPredictionTicks} (catchup=${td.catchupTicksPerFrame}) | collapsed=${td.trajectoryCollapsedBelow30Ticks}`
        );
      }
      if (h.physicsRateSweepDiagnostics) {
        const ps = h.physicsRateSweepDiagnostics;
        console.log(
          `  [Host]   [Edge-Case 4: Physics Rate Sweep] range=[${ps.minRealizedHz}..${ps.maxRealizedHz}]Hz | snaps=${ps.totalHardSnapsAcrossSweep} | starvations=${ps.totalStarvationsAcrossSweep}`
        );
      }
      if (h.goalReplayKickoffDiagnostics) {
        const gk = h.goalReplayKickoffDiagnostics;
        console.log(
          `  [Host]   [Edge-Case 3: 2-Goal Replay->Kickoff] completed=${gk.goalsCompletedToPlaying}/${gk.goalsAttempted} | tickRegressed=${gk.anyTickRegressionDetected} | fallbackWarns=${gk.totalKickoffFallbackWarnings}`
        );
      }
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
      const clientStateLabel = c.enteredMatch
        ? `mode=${c.finalMatchMode}, phase=${c.finalMatchPhase}`
        : `stuck at mode=${c.finalMatchMode}, phase=${c.finalMatchPhase}`;
      console.log(`  [Client] enteredMatch=${c.enteredMatch} (${clientStateLabel})`);
      console.log(
        `  [Client] readonlyRttTypeErrorCount=${c.readonlyRttTypeErrorCount} | kickoffFallbackWarns=${c.kickoffFallbackWarnCount ?? 0} | isCrossTab=${c.handshakeDiagnostics.isCrossTab}`
      );
      if (c.lobbyProbeDiagnostics) {
        const clp = c.lobbyProbeDiagnostics;
        console.log(
          `  [Client] [Phenomenon C: Lobby Probes] serverActiveMask=0x${clp.serverActiveCarMask.toString(16)} (bits6&7=${clp.serverCar6BitActive && clp.serverCar7BitActive}) | car6Vis=${clp.car6MeshVisible}, car7Vis=${clp.car7MeshVisible} | clientBlindToHostProbes=${clp.clientCannotSeeHostProbes}`
        );
      }
      if (c.lobbyGoalResetDiagnostics) {
        const cgr = c.lobbyGoalResetDiagnostics;
        console.log(
          `  [Client] [Edge-Case 1: Lobby Goal Reset] dualWorld=${cgr.isLobbyDualWorld} | maxAbsY=${cgr.maxObservedAbsBallY} -> postY=${cgr.postWaitBallPos[1]} | resetObserved=${cgr.ballResetToCenterObserved} | stuckInGoal=${cgr.ballStuckInGoal}`
        );
      }
      if (c.networkLatencyHudDiagnostics) {
        const cnl = c.networkLatencyHudDiagnostics;
        console.log(
          `  [Client] [Edge-Case 2: 50ms/50ms Latency & HUD] rtt=${cnl.channelMeasuredRttMsAfterPing}ms (rec=${cnl.reconcilerRttMs}ms) | pings=${cnl.pingsSentDelta}/${cnl.pongsReceivedDelta} | bw=${cnl.realizedThroughputKbps}kbps | hudBlurPing=${cnl.hudPeerPingDuringPowerSaveMs}ms (droppedTo18=${cnl.hudDroppedToHardcoded18Ms})`
        );
      }
      if (Array.isArray(c.rosterVisibilityProbes) && c.rosterVisibilityProbes.length > 0) {
        const matchVis =
          c.rosterVisibilityProbes.find((p) => p.stage === 'client_match_active_600ms') ||
          c.rosterVisibilityProbes[c.rosterVisibilityProbes.length - 1];
        console.log(
          `  [Client] [Phenomenon B: Client Vis] stage=${matchVis.stage} visibleCars=[${matchVis.visibleCarIndices.join(',')}]`
        );
      }
      if (c.trajectoryDiagnostics) {
        const ctd = c.trajectoryDiagnostics;
        console.log(
          `  [Client] [Phenomenon D: Trajectory] writeRevDelta=+${ctd.writeRevisionIncrementsDuringFlight} | fullResets=${ctd.fullResetCountDuringFlight}/${ctd.samples.length} | predCount=[${ctd.minPredictionCountObserved}..${ctd.maxPredictionCountObserved}]/${ctd.maxPredictionTicks} | collapsed=${ctd.trajectoryCollapsedBelow30Ticks}`
        );
      }
      if (c.physicsRateSweepDiagnostics) {
        const cps = c.physicsRateSweepDiagnostics;
        console.log(
          `  [Client] [Edge-Case 4: Physics Rate Sweep] range=[${cps.minRealizedHz}..${cps.maxRealizedHz}]Hz | snaps=${cps.totalHardSnapsAcrossSweep} | starvations=${cps.totalStarvationsAcrossSweep}`
        );
      }
      if (c.goalReplayKickoffDiagnostics) {
        const cgk = c.goalReplayKickoffDiagnostics;
        console.log(
          `  [Client] [Edge-Case 3: 2-Goal Replay->Kickoff] completed=${cgk.goalsCompletedToPlaying}/${cgk.goalsAttempted} | tickRegressed=${cgk.anyTickRegressionDetected} | fallbackWarns=${cgk.totalKickoffFallbackWarnings} | clientFrozen=${cgk.clientFrozenAfterReplay}`
        );
      }
      const clientAnomalyCount = c.poseProbes.reduce((acc, p) => acc + p.anomalies.length, 0);
      console.log(
        `  [Client] poseProbes=${c.poseProbes.length} | detectedPoseAnomalies=${clientAnomalyCount}`
      );
      for (const p of c.poseProbes) {
        for (const a of p.anomalies) {
          console.log(`           - [${p.stage}] ${a.kind}: ${a.description}`);
        }
      }
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
