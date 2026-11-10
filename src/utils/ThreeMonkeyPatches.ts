/**
 * src/utils/ThreeMonkeyPatches.ts
 * Defensive monkey-patching and compatibility layer for Three.js.
 *
 * Safely wraps and augments Three.js classes and prototype methods so that
 * standard upstream Three.js (r128 - r185+) can seamlessly operate with
 * game assets, interleaved stadium meshes, procedural shaders, and web environments:
 *
 * 1. InterleavedBufferAttribute:
 *    - Augments missing .applyMatrix4(m), .applyNormalMatrix(m), and .transformDirection(m).
 *    - Guards vertex coordinate reads against out-of-bounds NaNs.
 * 2. Box3 & BufferGeometry Bounding Logic:
 *    - Box3.prototype.setFromBufferAttribute: Defensively filters NaN components.
 * 3. LoadingManager:
 *    - Defensively ensures .resolveURL exists.
 * 4. ShaderChunk ANGLE Metal (Apple Silicon) Compatibility:
 *    - Replaces 'out IncidentLight light' with 'inout IncidentLight light' in
 *      ShaderChunk.lights_pars_begin to satisfy Metal Shading Language (MSL) rules.
 * 5. FileLoader Asset Diagnostics & SPA 404 Fallback Guard:
 *    - Intercepts FileLoader fetch responses with validateAssetResponse to fail fast
 *      with clear diagnostics if a static server returns an HTML SPA 404 fallback
 *      instead of a binary .glb/.obj asset.
 */

import { validateAssetResponse } from './AssetResponseValidator.ts';

const appliedThreeInstances = new WeakSet();
let patchesApplied = false;

/**
 * Applies defensive monkey patches to a target Three.js instance.
 * @param {object} THREE Three.js namespace or context
 * @returns {object} The patched Three.js context
 */
export function applyThreeMonkeyPatches(THREE) {
  if (!THREE || typeof THREE !== 'object') return THREE;
  if (appliedThreeInstances.has(THREE)) return THREE;
  appliedThreeInstances.add(THREE);

  // 1. InterleavedBufferAttribute math helpers
  if (THREE.InterleavedBufferAttribute) {
    const proto = THREE.InterleavedBufferAttribute.prototype;

    if (!proto.applyMatrix4) {
      proto.applyMatrix4 = function (m) {
        if (!THREE.Vector3) return this;
        const v = new THREE.Vector3();
        const count = this.data ? this.data.count : this.count;
        for (let i = 0; i < count; i++) {
          v.fromBufferAttribute(this, i);
          v.applyMatrix4(m);
          this.setXYZ(i, v.x, v.y, v.z);
        }
        return this;
      };
    }

    if (!proto.applyNormalMatrix) {
      proto.applyNormalMatrix = function (m) {
        if (!THREE.Vector3) return this;
        const v = new THREE.Vector3();
        const count = this.data ? this.data.count : this.count;
        for (let i = 0; i < count; i++) {
          v.fromBufferAttribute(this, i);
          v.applyNormalMatrix(m);
          this.setXYZ(i, v.x, v.y, v.z);
        }
        return this;
      };
    }

    if (!proto.transformDirection) {
      proto.transformDirection = function (m) {
        if (!THREE.Vector3) return this;
        const v = new THREE.Vector3();
        const count = this.data ? this.data.count : this.count;
        for (let i = 0; i < count; i++) {
          v.fromBufferAttribute(this, i);
          v.transformDirection(m);
          this.setXYZ(i, v.x, v.y, v.z);
        }
        return this;
      };
    }
  }

  // 2. Box3 setFromBufferAttribute NaN bounds guarding
  if (THREE.Box3 && THREE.Vector3) {
    const box3Proto = THREE.Box3.prototype;
    box3Proto.setFromBufferAttribute = function (attribute: { count?: number } | null | undefined) {
      if (!attribute) return this.makeEmpty();
      this.makeEmpty();
      const v = new THREE.Vector3();
      const count = attribute.count || 0;
      for (let i = 0; i < count; i++) {
        v.fromBufferAttribute(attribute, i);
        if (Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z)) {
          this.expandByPoint(v);
        }
      }
      return this;
    };
  }

  // 3. LoadingManager resolveURL defensive fallback
  if (THREE.LoadingManager && !THREE.LoadingManager.prototype.resolveURL) {
    const lmProto = THREE.LoadingManager.prototype;
    lmProto.resolveURL = function (url: string) {
      return typeof this.urlModifier === 'function' ? this.urlModifier(url) : url;
    };
  }

  // 4. ShaderChunk ANGLE Metal MSL light parameter patch
  if (THREE.ShaderChunk && THREE.ShaderChunk.lights_pars_begin) {
    THREE.ShaderChunk.lights_pars_begin = THREE.ShaderChunk.lights_pars_begin.replaceAll(
      /\bout IncidentLight light\b/g,
      'inout IncidentLight light'
    );
  }

  // 5. FileLoader asset diagnostics, SPA 404 HTML fallback guard, and stream stall retry
  if (THREE.FileLoader && !THREE.FileLoader.prototype._hasAssetDiagnosticsPatch) {
    const flProto = THREE.FileLoader.prototype;
    const originalLoad = flProto.load;
    flProto.load = function (
      url: string,
      onLoad?: (data: unknown) => void,
      onProgress?: (event: ProgressEvent) => void,
      onError?: (err: unknown) => void
    ) {
      const origFetch = globalThis.fetch;
      if (typeof origFetch === 'function') {
        const responseType = this.responseType;
        globalThis.fetch = function (input, init) {
          // Restore immediately after invocation to avoid side effects on other fetches
          globalThis.fetch = origFetch;
          const reqUrl =
            typeof input === 'string'
              ? input
              : input && (input as Request).url
                ? (input as Request).url
                : String(url || '');

          if (/^(?:data:|blob:)/i.test(reqUrl)) {
            return origFetch.call(this, input, init);
          }

          const executeAttempt = async (attempt: number): Promise<Response> => {
            const controller =
              typeof AbortController !== 'undefined' ? new AbortController() : null;
            const timeoutId = controller ? setTimeout(() => controller.abort(), 10000) : null;
            try {
              const res =
                attempt === 0
                  ? await origFetch.call(
                      globalThis,
                      input,
                      controller ? { ...init, signal: controller.signal } : init
                    )
                  : await origFetch.call(globalThis, reqUrl, {
                      ...init,
                      cache: 'reload',
                      credentials: 'same-origin',
                      ...(controller ? { signal: controller.signal } : {}),
                    });

              if (typeof validateAssetResponse === 'function') {
                const check = validateAssetResponse(res, reqUrl, responseType);
                if (!check.ok && responseType !== 'document' && !String(reqUrl).endsWith('.html')) {
                  throw check.error;
                }
              }

              if (res.status === 206 && attempt === 0) {
                try {
                  await res.body?.cancel?.();
                } catch (_e) {}
                return executeAttempt(1);
              }

              const buffer = await res.arrayBuffer();
              return new Response(buffer, {
                status: 200,
                statusText: res.statusText || 'OK',
                headers: res.headers,
              });
            } catch (err: unknown) {
              const assetErr = err as { isAssetError?: boolean } | null;
              if (attempt === 0 && !assetErr?.isAssetError) {
                await new Promise((r) => setTimeout(r, 200));
                return executeAttempt(1);
              }
              throw err;
            } finally {
              if (timeoutId) clearTimeout(timeoutId);
            }
          };

          return executeAttempt(0);
        };
        try {
          return originalLoad.call(this, url, onLoad, onProgress, onError);
        } finally {
          globalThis.fetch = origFetch;
        }
      } else {
        return originalLoad.call(this, url, onLoad, onProgress, onError);
      }
    };
    flProto._hasAssetDiagnosticsPatch = true;
  }

  // 6. WebGLRenderer.compileAsync defensive guard against disposed materials and unrejected setTimeout errors
  if (
    THREE.WebGLRenderer &&
    THREE.WebGLRenderer.prototype &&
    !THREE.WebGLRenderer.prototype._hasSafeCompileAsyncPatch
  ) {
    const rendererProto = THREE.WebGLRenderer.prototype;
    Object.defineProperty(rendererProto, 'compileAsync', {
      configurable: true,
      enumerable: true,
      get() {
        return this._safeCompileAsync || this._origCompileAsync;
      },
      set(origCompileAsync) {
        this._origCompileAsync = origCompileAsync;
        this._safeCompileAsync = function (
          scene: unknown,
          camera: unknown,
          targetScene: unknown = null
        ) {
          const renderer = this;
          return new Promise((resolve, reject) => {
            let materials: Set<unknown> | null = null;
            try {
              if (typeof renderer.compile === 'function') {
                materials = renderer.compile(scene, camera, targetScene);
              }
            } catch (err) {
              reject(err);
              return;
            }

            if (!materials || typeof materials.forEach !== 'function' || materials.size === 0) {
              resolve(scene);
              return;
            }
            if (!renderer.extensions?.get?.('KHR_parallel_shader_compile')) {
              resolve(scene);
              return;
            }

            const startTime = typeof performance !== 'undefined' ? performance.now() : Date.now();
            const maxWaitMs = 15000;
            const activeMaterials = materials;

            function checkMaterialsReady() {
              try {
                const props = renderer.properties;
                if (!props || typeof props.get !== 'function') {
                  activeMaterials.clear?.();
                  resolve(scene);
                  return;
                }

                activeMaterials.forEach((material: unknown) => {
                  if (!material) {
                    activeMaterials.delete(material);
                    return;
                  }
                  const materialProperties = props.get(material);
                  const program = materialProperties ? materialProperties.currentProgram : null;
                  if (!program || typeof program.isReady !== 'function' || program.isReady()) {
                    activeMaterials.delete(material);
                  }
                });

                if (activeMaterials.size === 0) {
                  resolve(scene);
                  return;
                }

                const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
                if (now - startTime > maxWaitMs) {
                  activeMaterials.clear?.();
                  resolve(scene);
                  return;
                }

                setTimeout(checkMaterialsReady, 10);
              } catch (err) {
                reject(err);
              }
            }

            setTimeout(checkMaterialsReady, 10);
          });
        };
      },
    });
    rendererProto._hasSafeCompileAsyncPatch = true;
  }

  patchesApplied = true;
  return THREE;
}

export function areThreeMonkeyPatchesApplied(): boolean {
  return patchesApplied;
}
