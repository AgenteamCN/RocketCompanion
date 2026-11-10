# Exempt Black-Box Zone (Exempt POV Microkernel Zone)

> **Immutable External Black-Box POV Camera Model**
> 
> This directory is the dedicated controlled black-box zone for the RocketSim POV camera microkernel.
> According to the system architectural contract, the POV Camera is an external solidified black-box microkernel with the following strict specifications:
> 
> 1. **Tampering Prohibited & Strong Hash Verification**:
>    - The canonical SHA-256 hash of the physical WASM binary `camera.wasm` is:
>      `b8adc96e73372d0f53346499fb150b576fb08deb0494d8f7f7e989d9daea0854`
>    - Web Crypto API (`crypto.subtle.digest('SHA-256', buffer)`) strictly validates the byte stream at runtime during initial loading.
>    - If the hash mismatches or loading fails, a blocking fatal exception is immediately thrown:
>      `[FATAL] POV Camera Microkernel hash mismatch or missing! Tampering detected.`
> 
> 2. **Strict ABI & Linear Memory Contract**:
>    - Mandatory verification of the four exported symbols: `memory`, `getViewPtr`, `stepView`, and `resetView`.
>    - Strict validation that the pointer returned by `getViewPtr()` is 8-byte aligned and falls entirely within valid WASM linear memory bounds (accommodating 42 Float64 fields).
> 
> 3. **Reference Baseline for A/B Determinism Verification**:
>    - The active default POV camera is implemented in `src/camera/CleanPovCameraKernel.ts`, while `camera.wasm` is retained as the reference source for side-by-side frame comparison via `CameraDeterminismHarness`.
>    - Legacy heuristic fallbacks (`stepFallbackView`) and physics core (`core.wasm`) substitutions remain strictly prohibited.
>    - Once field validation confirms zero divergence or camera jitter, this reference microkernel and `public/assets/camera/camera.wasm` will be removed.
