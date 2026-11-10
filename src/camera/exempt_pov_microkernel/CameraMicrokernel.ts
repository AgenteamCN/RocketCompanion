/**
 * CameraMicrokernel.ts
 * Exempt Black Box: Immutable External POV Camera Microkernel
 * Standalone WebAssembly microkernel for RocketSim camera tracking calculations.
 *
 * Security & Integrity Contract:
 * - Real-time SHA-256 digest validation using Web Crypto API.
 * - Strict WebAssembly ABI contract validation: memory, getViewPtr, stepView, resetView.
 * - Linear memory address bounds check for view buffer.
 * - Fail-Fast: Zero fallback paths allowed.
 */

import { getCameraDeterminismHarness } from '../CameraDeterminismHarness.ts';
import { resolveAssetPath } from '../../utils/AssetResponseValidator.ts';

export const EXPECTED_CAMERA_WASM_HASH =
  'b8adc96e73372d0f53346499fb150b576fb08deb0494d8f7f7e989d9daea0854';
export const CAMERA_VIEW_BUFFER_FLOATS = 42;
export const TOTAL_VIEW_BUFFER_SIZE = 42;
export const CAMERA_VIEW_BUFFER_BYTES = CAMERA_VIEW_BUFFER_FLOATS * Float64Array.BYTES_PER_ELEMENT; // 336 bytes

export interface CameraMicrokernelOptions {
  locateFile?: (filename: string) => string;
  wasmBinary?: ArrayBuffer | ArrayBufferView;
  _skipHashCheckForAbiTest?: boolean;
}

export interface MicrokernelFatalError extends Error {
  isMicrokernelError?: boolean;
  expectedHash?: string;
  actualHash?: string;
  cause?: unknown;
}

interface CameraWasmAbiExports extends WebAssembly.Exports {
  memory: WebAssembly.Memory;
  getViewPtr: () => number;
  stepView: () => void;
  resetView: () => void;
}

function createMicrokernelError(
  message: string,
  extra?: Partial<Pick<MicrokernelFatalError, 'expectedHash' | 'actualHash' | 'cause'>>
): MicrokernelFatalError {
  const err = new Error(message) as MicrokernelFatalError;
  err.isMicrokernelError = true;
  if (extra) {
    Object.assign(err, extra);
  }
  return err;
}

/**
 * Computes SHA-256 hash hex string of binary buffer using Web Crypto API.
 */
export async function computeSha256(buffer: ArrayBuffer | ArrayBufferView): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new Error(
      '[FATAL] Web Crypto API (crypto.subtle) is unavailable for POV Camera Microkernel verification.'
    );
  }

  const sourceBuffer = ArrayBuffer.isView(buffer)
    ? (buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer)
    : buffer;
  const hashBuffer = await subtle.digest('SHA-256', sourceBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

export class CameraMicrokernel {
  _fnGetViewPtr: (() => number) | null;
  _fnResetView: (() => void) | null;
  _fnStepView: (() => void) | null;
  instance: WebAssembly.Instance | null;
  memory: WebAssembly.Memory | null;
  viewPtr: number;
  viewView: Float64Array | null;
  wasmHash: string | null;

  constructor() {
    this.instance = null;
    this.memory = null;
    this.viewPtr = 0;
    this.viewView = null;
    this._fnGetViewPtr = null;
    this._fnStepView = null;
    this._fnResetView = null;
    this.wasmHash = null;
  }

  /**
   * Asynchronously load and initialize camera WASM microkernel with dual verification.
   */
  async init(options: CameraMicrokernelOptions = {}): Promise<CameraMicrokernel> {
    let wasmBytes = options.wasmBinary;

    if (!wasmBytes) {
      const wasmPath = options.locateFile
        ? options.locateFile('camera.wasm')
        : resolveAssetPath('/assets/camera/camera.wasm');

      try {
        const res = await fetch(wasmPath);
        if (!res.ok) {
          throw createMicrokernelError(
            `[FATAL] POV Camera Microkernel hash mismatch or missing! Tampering detected. (HTTP ${res.status}: ${res.statusText})`
          );
        }
        wasmBytes = await res.arrayBuffer();
      } catch (loadErr: unknown) {
        const errMessage = loadErr instanceof Error ? loadErr.message : String(loadErr);
        throw createMicrokernelError(
          `[FATAL] POV Camera Microkernel hash mismatch or missing! Tampering detected. (${errMessage})`,
          { cause: loadErr }
        );
      }
    }

    if (!wasmBytes || wasmBytes.byteLength === 0) {
      throw createMicrokernelError(
        '[FATAL] POV Camera Microkernel hash mismatch or missing! Tampering detected. (Empty binary)'
      );
    }

    // 1. WASM Binary SHA-256 Hash Verification (Fail-Fast)
    if (!options._skipHashCheckForAbiTest) {
      const actualHash = await computeSha256(wasmBytes);
      this.wasmHash = actualHash;
      if (actualHash !== EXPECTED_CAMERA_WASM_HASH) {
        throw createMicrokernelError(
          `[FATAL] POV Camera Microkernel hash mismatch or missing! Tampering detected. ` +
            `(Expected: ${EXPECTED_CAMERA_WASM_HASH}, Got: ${actualHash})`,
          {
            expectedHash: EXPECTED_CAMERA_WASM_HASH,
            actualHash,
          }
        );
      }
    }

    // 2. WebAssembly Instantiation (zero imports required for standalone microkernel)
    let result: WebAssembly.WebAssemblyInstantiatedSource | WebAssembly.Instance;
    try {
      const sourceBytes = ArrayBuffer.isView(wasmBytes)
        ? (wasmBytes.buffer.slice(
            wasmBytes.byteOffset,
            wasmBytes.byteOffset + wasmBytes.byteLength
          ) as ArrayBuffer)
        : wasmBytes;
      result = await WebAssembly.instantiate(sourceBytes, {});
    } catch (instantiateErr: unknown) {
      const msg = instantiateErr instanceof Error ? instantiateErr.message : String(instantiateErr);
      throw createMicrokernelError(`[FATAL] POV Camera Microkernel instantiation failed: ${msg}`);
    }
    const instance = 'instance' in result ? result.instance : result;
    this.instance = instance;

    // 3. ABI Contract Validation: memory, getViewPtr, stepView, resetView
    const exp = instance.exports as Partial<CameraWasmAbiExports>;
    if (
      !exp.memory ||
      typeof exp.getViewPtr !== 'function' ||
      typeof exp.stepView !== 'function' ||
      typeof exp.resetView !== 'function'
    ) {
      throw createMicrokernelError(
        'camera.wasm is missing required ABI exports (memory, getViewPtr, stepView, resetView)'
      );
    }

    this.memory = exp.memory;
    this._fnGetViewPtr = exp.getViewPtr;
    this._fnStepView = exp.stepView;
    this._fnResetView = exp.resetView;

    // 4. Linear Memory Segment Check
    this.viewPtr = this._fnGetViewPtr();
    const memBuffer = this.memory.buffer;

    if (
      typeof this.viewPtr !== 'number' ||
      !Number.isInteger(this.viewPtr) ||
      this.viewPtr <= 0 ||
      this.viewPtr % Float64Array.BYTES_PER_ELEMENT !== 0 ||
      this.viewPtr + CAMERA_VIEW_BUFFER_BYTES > memBuffer.byteLength
    ) {
      throw createMicrokernelError(
        `camera.wasm getViewPtr() returned invalid pointer (${this.viewPtr}) or out-of-bounds linear memory segment`
      );
    }

    this.resetView();
    return this;
  }

  /**
   * Reset internal camera history, swivel, and tracking filters
   */
  resetView(): void {
    if (typeof this._fnResetView === 'function') {
      this._fnResetView();
    }
    if (this.memory && this.viewPtr > 0) {
      this.viewView = new Float64Array(this.memory.buffer, this.viewPtr, CAMERA_VIEW_BUFFER_FLOATS);
    }
    getCameraDeterminismHarness()?.onResetView();
  }

  /**
   * Advance camera perspective one frame using 42-Float64 view buffer
   */
  stepView(inputView?: ArrayLike<number>): Float64Array {
    const view = this.getViewArray();
    if (inputView) {
      view.set(inputView, 0);
    }
    if (typeof this._fnStepView === 'function') {
      this._fnStepView();
    }
    return view;
  }

  getViewArray(): Float64Array {
    if (!this.memory) {
      throw createMicrokernelError('CameraMicrokernel memory is uninitialized');
    }
    const memBuffer = this.memory.buffer;
    if (!this.viewView || this.viewView.buffer !== memBuffer) {
      this.viewView = new Float64Array(memBuffer, this.viewPtr, CAMERA_VIEW_BUFFER_FLOATS);
    }
    return this.viewView;
  }
}

let cachedCameraKernel: CameraMicrokernel | null = null;

/**
 * Load singleton CameraMicrokernel instance with integrity validation.
 */
export async function loadCameraMicrokernel(
  options: CameraMicrokernelOptions = {}
): Promise<CameraMicrokernel> {
  if (cachedCameraKernel) {
    return cachedCameraKernel;
  }
  const kernel = new CameraMicrokernel();
  await kernel.init(options);
  cachedCameraKernel = kernel;
  return kernel;
}

/**
 * Synchronously retrieve already loaded singleton CameraMicrokernel, or null.
 */
export function getCachedCameraMicrokernel(): CameraMicrokernel | null {
  return cachedCameraKernel;
}

/**
 * Resets cached CameraMicrokernel singleton (useful for test isolation).
 */
export function clearCachedCameraMicrokernel(): void {
  cachedCameraKernel = null;
}

/**
 * Pre-flight verification helper for POV Camera Microkernel.
 * Guarantees camera.wasm exists, passes SHA-256 hash match, and satisfies strict ABI.
 */
export async function verifyCameraMicrokernelIntegrity(
  options: CameraMicrokernelOptions = {}
): Promise<CameraMicrokernel> {
  const kernel = await loadCameraMicrokernel(options);
  if (
    !kernel.instance ||
    !kernel.memory ||
    kernel.getViewArray().length < CAMERA_VIEW_BUFFER_FLOATS
  ) {
    throw createMicrokernelError('CameraMicrokernel post-load ABI integrity verification failed');
  }
  return kernel;
}

export default loadCameraMicrokernel;

/**
 * Formats dedicated actionable fatal error modal for POV Camera Microkernel failures.
 */
export function formatMicrokernelErrorHtml(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return `
  <div class="microkernel-fatal-modal" style="text-align:left;line-height:1.6;font-size:13px;max-width:640px;background:rgba(20,5,8,0.96);padding:20px;border-radius:12px;border:2px solid #ef4444;box-shadow:0 16px 40px rgba(239,68,68,0.35);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#fecaca;">
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">
      <span style="font-size:18px;font-weight:800;color:#ef4444;">[FATAL]</span>
      <div>
        <h3 style="color:#f87171;font-weight:800;margin:0;font-size:16px;letter-spacing:0.5px;">POV Camera Microkernel Tampering Detected</h3>
        <p style="margin:2px 0 0 0;font-size:11px;color:#fca5a5;opacity:0.85;">Microkernel Integrity Check Failed &bull; Startup Blocked &bull; Zero Fallback</p>
      </div>
    </div>
    <div style="background:#2e080d;border-left:4px solid #ef4444;padding:10px 14px;border-radius:6px;margin-bottom:12px;">
      <p style="margin:0;font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:12px;color:#fee2e2;font-weight:600;word-break:break-word;">
        ${message}
      </p>
    </div>
    <div style="font-size:12px;color:#cbd5e1;margin-bottom:12px;">
      <p style="margin:0 0 6px 0;"><strong>Contract Specification:</strong> POV Camera is an external immutable black box microkernel, requiring an untampered WASM binary (<code>camera.wasm</code>) and standard ABI exports.</p>
      <ul style="margin:4px 0 4px 18px;padding:0;font-size:11px;color:#cbd5e1;">
        <li>Standard SHA-256 Digest: <code>b8adc96e73372d0f53346499fb150b576fb08deb0494d8f7f7e989d9daea0854</code></li>
        <li>Required ABI Symbols: <code>memory</code>, <code>getViewPtr</code>, <code>stepView</code>, <code>resetView</code></li>
        <li>Strict Fallback Prohibition: Pure JS emulation fallback (<code>stepFallbackView</code>) has been completely removed.</li>
      </ul>
    </div>
    <div style="padding:8px 12px;background:#180608;border-radius:6px;border:1px dashed #7f1d1d;font-size:11px;color:#fca5a5;">
      [WARNING] Engine startup has been permanently halted. Please verify that <code>public/assets/camera/camera.wasm</code> is intact and reload the page.
    </div>
  </div>
  `;
}
