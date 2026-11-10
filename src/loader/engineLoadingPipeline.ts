import { isVerboseLogEnabled } from './ConsoleProgressObserver.ts';
import {
  createThrottledProgressReporter,
  yieldIdleSlice,
  yieldToNextFrame,
} from './frameBudgetScheduler.ts';
import { LoadingOrchestrator } from './LoadingOrchestrator.ts';
import { LoadingTask } from './LoadingTask.ts';
import type { LoadingBootstrapError } from './types.ts';
import { verifyCameraMicrokernelIntegrity } from '../camera/exempt_pov_microkernel/CameraMicrokernel.ts';
import { auditRequiredAssets, formatMissingAssetsHtml } from '../game/AssetDiagnostics.ts';
import {
  fetchArenaCollisionManifest,
  fetchArenaCollisionChunks,
} from '../physics/RocketSimMeshLoader.ts';

export interface EngineLoadingRuntimePort {
  setupPhysics: (options: { collisionData?: unknown }) => Promise<unknown> | unknown;
  setupScene: (onProgress?: (ratio: number, detail?: string) => void) => Promise<unknown> | unknown;
  setupShaders: (
    onProgress?: (ratio: number, theme?: string) => void
  ) => Promise<unknown> | unknown;
  ignite: () => unknown;
  setupAudio: (
    onProgress?: (loaded: number, total?: number, file?: string) => void
  ) => Promise<unknown> | unknown;
  setupBot: (
    onProgress?: (loaded?: number, total?: number, botId?: string) => void
  ) => Promise<unknown> | unknown;
}

export interface BackgroundPipelineNotificationStorePort {
  pushOngoingNotification: (payload: {
    id: string;
    type: string;
    title: string;
    content: string;
    icon?: string;
    progress?: number;
    tone?: string;
    isSpinningIcon?: boolean;
  }) => void;
  updateOngoingNotification: (id: string, patch: { progress?: number; content?: string }) => void;
  completeOngoingNotification: (
    id: string,
    patch: { content?: string; autoDismissMs?: number; tone?: string }
  ) => void;
  dismissOngoingNotification: (id: string) => void;
}

export interface BackgroundAssetPipelineOptions {
  notifyStore?: BackgroundPipelineNotificationStorePort | null;
}

export type BackgroundAssetCategory = 'audio' | 'fonts' | 'bot';
export type BackgroundAssetProgressCallback = (
  category: BackgroundAssetCategory,
  ratio: number,
  message: string
) => void;

export function buildEngineLoadingPipeline(
  runtime: EngineLoadingRuntimePort,
  options: Record<string, unknown> = {}
): LoadingOrchestrator {
  const orchestrator = new LoadingOrchestrator(options);

  orchestrator.registerTask(
    new LoadingTask({
      id: 'preflight.camera_microkernel',
      name: 'Verify Camera Microkernel Integrity',
      stage: 1,
      stageName: 'Security Preflight',
      type: 'indeterminate',
      category: 'Security Preflight',
      hint: 'Verifying camera.wasm SHA-256 Digest & Linear Memory Contract...',
      weight: 1.0,
      critical: true,
      run: async (ctx) => {
        ctx.reportProgress(0.2, 'Checking SHA-256 and ABI contract...');
        await verifyCameraMicrokernelIntegrity(options);
        ctx.reportProgress(1.0, 'POV camera microkernel verified');
      },
    })
  );

  orchestrator.registerTask(
    new LoadingTask({
      id: 'diagnostics.static_assets',
      name: 'Audit Static Assets & Headers',
      stage: 2,
      stageName: 'Asset Diagnostics',
      type: 'indeterminate',
      category: 'Asset Diagnostics',
      hint: 'Auditing asset availability and binary headers...',
      weight: 1.0,
      critical: true,
      run: async (ctx) => {
        ctx.reportProgress(0.3, 'Auditing asset availability and binary headers...');
        const { missingCritical } = await auditRequiredAssets();

        if (missingCritical && missingCritical.length > 0) {
          const err: LoadingBootstrapError = new Error(formatMissingAssetsHtml(missingCritical));
          err.isAssetError = true;
          throw err;
        }

        ctx.reportProgress(1.0, 'Asset diagnostics passed');
      },
    })
  );

  orchestrator.registerTask(
    new LoadingTask({
      id: 'physics.manifest.fetch',
      name: 'Fetch Arena Collision Manifest',
      stage: 3,
      stageName: 'Physics & Collision Mesh',
      type: 'determinate',
      category: 'Physics & Collision',
      weight: 0.15,
      critical: true,
      run: async (ctx) => {
        ctx.reportProgress(0.2, 'Requesting /arenamesh/manifest.json');
        const chunkFilenames = await fetchArenaCollisionManifest();
        ctx.setShared('meshFilenames', chunkFilenames);
        ctx.reportProgress(1.0, `Discovered ${chunkFilenames.length} arena mesh chunks`);
      },
    })
  );

  orchestrator.registerTask(
    new LoadingTask({
      id: 'physics.mesh.stream',
      name: 'Stream 16 Arena Mesh Chunks',
      stage: 3,
      stageName: 'Physics & Collision Mesh',
      type: 'determinate',
      category: 'Physics & Collision',
      weight: 0.45,
      dependencies: ['physics.manifest.fetch'],
      critical: true,
      run: async (ctx) => {
        const filenames = ctx.getShared<string[]>('meshFilenames') || [];
        const chunks = await fetchArenaCollisionChunks(filenames, {
          fetchBuffer: (url) => ctx.downloadTracker.fetchBuffer(url),
          onChunkLoaded: (completed, total, chunkFile) => {
            ctx.reportProgress(completed / total, `Chunk ${completed}/${total} (${chunkFile})`);
          },
        });

        ctx.setShared('collisionChunks', chunks);
        ctx.reportProgress(1.0, 'All collision mesh chunks downloaded');
      },
    })
  );

  orchestrator.registerTask(
    new LoadingTask({
      id: 'physics.engine.init',
      name: 'Initialize RocketSim WASM & Arena',
      stage: 3,
      stageName: 'Physics & Collision Mesh',
      type: 'indeterminate',
      category: 'Physics & Collision',
      hint: 'Allocating RocketSim WASM linear heap & compiling collision BVH tree...',
      weight: 0.4,
      dependencies: ['physics.mesh.stream', 'preflight.camera_microkernel'],
      critical: true,
      run: async (ctx) => {
        ctx.reportProgress(0.2, 'Allocating WASM heap & compiling rigid-body physics...');
        const collisionData = ctx.getShared('collisionChunks');
        await runtime.setupPhysics({ collisionData });
        ctx.reportProgress(1.0, 'Arena collision space created & player car allocated');
      },
    })
  );

  const isTouchHeadless =
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('touch') === '2';

  orchestrator.registerTask(
    new LoadingTask({
      id: 'geometry.scene.build',
      name: 'Stream 3D Stadium, Vehicle & Pad Geometries',
      stage: 4,
      stageName: '3D Geometry & Assets',
      type: 'determinate',
      category: '3D Geometry',
      weight: 1.0,
      dependencies: ['physics.engine.init'],
      critical: true,
      run: async (ctx) => {
        if (isTouchHeadless) {
          console.info(
            '[Loading][Headless] Headless Parameter Detected (?touch=2) — skipping 3D Stadium & Vehicle GLB asset streaming.'
          );
        }
        await runtime.setupScene((ratio, detail) => {
          ctx.reportProgress(ratio, detail);
        });
        ctx.reportProgress(
          1.0,
          isTouchHeadless
            ? 'Headless Parameter Detected (?touch=2) — 3D scene graph exempted'
            : '3D scene graph & UI overlays mounted'
        );
      },
    })
  );

  orchestrator.registerTask(
    new LoadingTask({
      id: 'shaders.prewarm',
      name: 'Prewarm Shaders & Composite Passes',
      stage: 5,
      stageName: 'Shader Pipeline Prewarming',
      type: 'indeterminate',
      category: 'Graphics Pipeline',
      hint: 'Compiling PBR Uber-Shaders across visual themes (WebGL compileAsync)...',
      weight: 1.0,
      dependencies: ['geometry.scene.build'],
      critical: true,
      run: async (ctx) => {
        if (isTouchHeadless) {
          console.info(
            '[Loading][Headless] Headless Parameter Detected (?touch=2) — skipping WebGL shader prewarming.'
          );
        }
        await runtime.setupShaders((ratio, theme) => {
          ctx.reportProgress(ratio, `Prewarming materials for theme: ${theme}`);
        });
        ctx.reportProgress(
          1.0,
          isTouchHeadless
            ? 'Headless Parameter Detected (?touch=2) — WebGL shader compilation exempted'
            : 'All visual shaders compiled into GPU cache'
        );
      },
    })
  );

  orchestrator.registerTask(
    new LoadingTask({
      id: 'ignition.clock_scheduler',
      name: 'Ignite 120Hz Clock & Synchronize First Frame',
      stage: 6,
      stageName: 'Engine Ignition',
      type: 'indeterminate',
      category: 'Engine Ignition',
      hint: 'Activating 120Hz deterministic render clock & synchronizing frame 0...',
      weight: 1.0,
      dependencies: ['shaders.prewarm'],
      critical: true,
      run: async (ctx) => {
        ctx.reportProgress(
          0.5,
          isTouchHeadless
            ? 'Igniting 120Hz headless physics clock (?touch=2)...'
            : 'Synchronizing physics interpolator and rendering frame 0...'
        );
        runtime.ignite();
        ctx.reportProgress(
          1.0,
          isTouchHeadless
            ? 'Headless ignition complete (?touch=2). Simulation running at 120Hz.'
            : 'Engine ignition complete. Simulation running at 120Hz.'
        );
      },
    })
  );

  return orchestrator;
}

export async function startBackgroundAssetPipeline(
  runtime: EngineLoadingRuntimePort,
  onProgress: BackgroundAssetProgressCallback | null = null,
  options: BackgroundAssetPipelineOptions = {}
): Promise<void> {
  const verbose = isVerboseLogEnabled();
  const startTime = performance.now();

  if (verbose) {
    console.log('[Loading] > Background asset pipeline started for all deferred subsystems...');
  }

  // Give the newly ignited 120Hz render clock and compositor a clean 2-frame grace window
  // before starting deferred asset streaming and worker initialization.
  await yieldToNextFrame();
  await yieldToNextFrame();

  const notifyStore = options.notifyStore || null;
  const taskId = 'background-asset-pipeline';
  if (notifyStore) {
    notifyStore.pushOngoingNotification({
      id: taskId,
      type: 'background',
      title: 'Background Assets',
      content: 'Synchronizing audio, vehicles, workers, fonts & AI models...',
      icon: 'Layers',
      progress: 0,
      tone: 'info',
      isSpinningIcon: true,
    });
  }

  const throttledNotify = createThrottledProgressReporter(
    125,
    (totalRatio: number, contentText: string) => {
      if (notifyStore) {
        notifyStore.updateOngoingNotification(taskId, {
          progress: totalRatio,
          content: contentText,
        });
      }
    }
  );

  const taskProgress: Record<BackgroundAssetCategory, number> = { audio: 0, fonts: 0, bot: 0 };
  const updateOverall = (
    cat: BackgroundAssetCategory,
    ratio: number,
    desc?: string,
    forceFlush = false
  ) => {
    taskProgress[cat] = Math.min(1, Math.max(0, ratio));
    const totalRatio = (taskProgress.audio + taskProgress.fonts + taskProgress.bot) / 3;
    const contentText = desc || `Synchronizing assets (${Math.round(totalRatio * 100)}%)`;
    throttledNotify.report(forceFlush || totalRatio >= 0.999, totalRatio, contentText);
  };

  const backgroundTasks = [
    {
      name: 'Web Font Preloader',
      run: async () => {
        if (typeof document !== 'undefined' && document.fonts) {
          const fontList = [
            '400 14px "JetBrains Mono"',
            '400 16px Archivo',
            '500 16px Archivo',
            '700 16px Archivo',
            '400 20px "Lilita One"',
          ];
          let loaded = 0;
          for (const f of fontList) {
            try {
              await document.fonts.load(f);
            } catch (err) {
              console.warn(`[Loading][Background] Failed to preload web font "${f}":`, err);
            }
            loaded++;
            const ratio = loaded / fontList.length;
            const msg = `Font loaded: ${f} (${loaded}/${fontList.length})`;
            if (onProgress) onProgress('fonts', ratio, msg);
            updateOverall('fonts', ratio, msg);
            if (verbose) {
              console.log(`[Loading][Background] ${msg}`);
            }
          }
          updateOverall('fonts', 1.0, 'Web fonts preloaded.', true);
        } else {
          updateOverall('fonts', 1.0, 'Web fonts preloaded.', true);
        }
      },
    },
    {
      name: '41-Channel Spatial Audio, Synth Pack & Deferred Arena Assets',
      run: async () => {
        await runtime.setupAudio((loaded = 0, total = 0, file = '') => {
          const filename = file ? file.split('/').pop() : '';
          const ratio = total > 0 ? loaded / total : loaded <= 1.0 ? loaded : 1.0;
          const msg =
            total > 0
              ? `Audio & arena: ${loaded}/${total} (${filename})`
              : `Audio & arena (${Math.round(ratio * 100)}%)`;
          if (onProgress) onProgress('audio', ratio, msg);
          updateOverall('audio', ratio, msg);
          if (verbose) {
            console.log(`[Loading][Background] ${msg}`);
          }
        });
        updateOverall('audio', 1.0, '41-channel audio, synth pack & arena assets ready.', true);
        if (verbose) {
          console.log('[Loading][Background] 41-channel audio, synth pack & arena assets ready.');
        }
      },
    },
    {
      name: 'Server/Bot Workers & All AI Neural Policies',
      run: async () => {
        await runtime.setupBot((loaded = 0, total = 0, botId = '') => {
          const ratio = total > 0 ? loaded / total : 1.0;
          const msg = `Workers & AI: ${botId} (${loaded}/${total})`;
          if (onProgress) onProgress('bot', ratio, msg);
          updateOverall('bot', ratio, msg);
          if (verbose) {
            console.log(`[Loading][Background] ${msg}`);
          }
        });
        updateOverall('bot', 1.0, 'Server/Bot workers & all AI policies synchronized.', true);
        if (verbose) {
          console.log('[Loading][Background] Server/Bot workers & all AI policies synchronized.');
        }
      },
    },
  ];

  try {
    for (const task of backgroundTasks) {
      await yieldIdleSlice(24);
      try {
        await task.run();
      } catch (taskErr) {
        console.warn(`[Loading][Background] Task "${task.name}" warning:`, taskErr);
      }
    }
    if (verbose) {
      const elapsedSec = ((performance.now() - startTime) / 1000).toFixed(2);
      console.log(
        '[Loading] ══════════════ [Background Pipeline] All Assets Loaded ══════════════'
      );
      console.log(
        `[Loading] Background asset pipeline complete in ${elapsedSec}s — all deferred subsystems synchronized.`
      );
    }
    if (notifyStore) {
      notifyStore.completeOngoingNotification(taskId, {
        content: 'All deferred assets, workers & AI policies synchronized',
        autoDismissMs: 3000,
        tone: 'info',
      });
    }
  } catch (err) {
    console.warn('[Loading][Background] Background asset pipeline warning:', err);
    if (notifyStore) {
      notifyStore.dismissOngoingNotification(taskId);
    }
  }
}
