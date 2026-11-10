import React from 'react';
import { Check, Download, Copy, Camera, RotateCcw } from 'lucide-react';
import {
  enterActiveReplayDirectorReferenceFreeCam,
  exitActiveReplayDirectorReferenceFreeCam,
  getActiveReplayDirectorLiveCameraState,
  exportActiveReplayDirectorReferenceKeyframe,
} from '../../../stores/replayDirectorStore';
import { useAppStore } from '../../../stores/appStore';
import { Badge } from '../../../primitives/Badge';
import { Button } from '../../../primitives/Button';
import { SliderControl } from '../../../primitives/SliderControl';

export interface ReplayDirectorRefKeyframeSectionProps {
  isLight?: boolean;
  canExportReplay: boolean;
  effectiveFrameId: number;
  onStatusMessage?: (msg: string, durationMs?: number) => void;
  onRequestRefresh?: () => void;
}

export const ReplayDirectorRefKeyframeSection: React.FC<
  ReplayDirectorRefKeyframeSectionProps
> = ({
  isLight = false,
  canExportReplay,
  effectiveFrameId,
  onStatusMessage,
  onRequestRefresh,
}) => {
  const [copiedRefKeyframe, setCopiedRefKeyframe] = React.useState(false);

  const isFreeCam = useAppStore((s) => s.isFreeCam);
  const freeCamFov = useAppStore((s) => s.freeCamFov);
  const setFreeCamFov = useAppStore((s) => s.setFreeCamFov);

  const liveCameraState = canExportReplay ? getActiveReplayDirectorLiveCameraState() : null;
  const mutedText = isLight ? 'text-neutral-500' : 'text-neutral-400';

  const handleReferenceKeyframeFromHere = () => {
    if (!canExportReplay) return;
    const ok = enterActiveReplayDirectorReferenceFreeCam({ fov: freeCamFov });
    if (ok) {
      onStatusMessage?.(
        `Reference FreeCam initialized from Frame #${effectiveFrameId} — adjust view & FOV, then Export Reference JSON`,
        3600
      );
    }
    onRequestRefresh?.();
  };

  const handleReturnToDirectorCam = () => {
    exitActiveReplayDirectorReferenceFreeCam();
    onStatusMessage?.(`Returned to Director Camera at Frame #${effectiveFrameId}`, 2600);
    onRequestRefresh?.();
  };

  const handleExportReferenceKeyframeFile = () => {
    if (!canExportReplay) return;
    const res = exportActiveReplayDirectorReferenceKeyframe({
      fovDeg: freeCamFov,
      download: true,
    });
    if (res?.filename) {
      onStatusMessage?.(`Exported Reference Keyframe: ${res.filename}`, 3600);
    }
  };

  const handleCopyReferenceKeyframeJson = () => {
    if (!canExportReplay) return;
    const res = exportActiveReplayDirectorReferenceKeyframe({
      fovDeg: freeCamFov,
      download: false,
    });
    if (res?.content && typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(res.content).catch((err) => {
        console.warn('[ReplayDirectorTuner] Failed to copy Reference Keyframe JSON:', err);
      });
      setCopiedRefKeyframe(true);
      setTimeout(() => setCopiedRefKeyframe(false), 1800);
    }
  };

  return (
    <div className="mt-1 pt-1.5 border-t border-neutral-700/50 flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-1.5 flex-wrap">
        <div className="flex items-center gap-1.5">
          <Camera className="h-3 w-3 text-amber-400 shrink-0" />
          <span className="font-semibold text-[10px] text-amber-300">
            Reference Keyframe Guidance (Shift+F FreeCam)
          </span>
          {isFreeCam && (
            <Badge variant="amber" size="sm" isLight={isLight} className="text-[9px]">
              FREECAM ACTIVE · FOV {Math.round(freeCamFov)}°
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-1 flex-wrap">
          <button
            type="button"
            onClick={handleReferenceKeyframeFromHere}
            title="Pause at this frame, switch into Free Camera (Shift+F), and initialize FreeCam position/aim from the current Director Camera pose"
            className="px-2 py-0.5 rounded border border-amber-500/60 bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 text-[9.5px] font-bold flex items-center gap-1 cursor-pointer"
          >
            <Camera className="h-2.5 w-2.5" />
            <span>Reference Keyframe from Here</span>
          </button>
          {isFreeCam && (
            <button
              type="button"
              onClick={handleReturnToDirectorCam}
              title="Exit FreeCam and snap back to Director AutoCam at this frame"
              className="px-1.5 py-0.5 rounded border border-sky-500/50 bg-sky-500/15 hover:bg-sky-500/25 text-sky-300 text-[9.5px] font-bold flex items-center gap-1 cursor-pointer"
            >
              <RotateCcw className="h-2.5 w-2.5" />
              <span>Back to Director Cam</span>
            </button>
          )}
        </div>
      </div>

      {isFreeCam && liveCameraState?.eyeUnreal && (
        <div className="flex flex-col gap-1 pt-0.5">
          <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-[9.5px] text-amber-200/90">
            <span>
              Ref Eye (UU):{' '}
              <b>
                [{Math.round(liveCameraState.eyeUnreal[0])},{' '}
                {Math.round(liveCameraState.eyeUnreal[1])},{' '}
                {Math.round(liveCameraState.eyeUnreal[2])}]
              </b>
            </span>
            <span>
              Ref Yaw / Pitch / FOV:{' '}
              <b>
                {(liveCameraState.yawUnrealDeg ?? 0).toFixed(1)}° /{' '}
                {(liveCameraState.pitchUnrealDeg ?? 0).toFixed(1)}° /{' '}
                {Math.round(freeCamFov)}°
              </b>
            </span>
          </div>
          <div className={`text-[9px] ${mutedText}`}>
            Controls: <b>WASD</b> move · <b>I / Space</b> up · <b>M / V</b> down ·{' '}
            <b>Shift</b> boost · <b>Mouse Drag</b> aim · <b>- / =</b> or slider for FOV
          </div>
        </div>
      )}

      <SliderControl
        label={`Reference Camera FOV (${Math.round(freeCamFov)}°)`}
        description="Manual horizontal FOV for Reference Keyframe (shortcuts: - / = keys in FreeCam)"
        value={freeCamFov}
        min={30}
        max={150}
        step={1}
        unit="°"
        editable={true}
        showStepper={true}
        colorScheme="amber"
        isLight={isLight}
        onChange={(v) => setFreeCamFov(v)}
      />

      <div className="flex flex-wrap items-center justify-between gap-1.5 pt-0.5">
        <Button
          variant="secondary"
          size="sm"
          disabled={!canExportReplay}
          onClick={handleExportReferenceKeyframeFile}
          isLight={isLight}
          className="gap-1 px-2 py-0.5 text-[9.5px] font-bold"
          title="Download standalone Reference Keyframe JSON for this frame (includes FreeCam pose, FOV, corridor offsets, inverse ray weights, screen NDC composition, and delta vs AutoCam)"
        >
          <Download className="h-3 w-3 text-amber-400 shrink-0" />
          <span>Export Ref Keyframe (.json)</span>
        </Button>

        <Button
          variant="secondary"
          size="sm"
          disabled={!canExportReplay}
          onClick={handleCopyReferenceKeyframeJson}
          isLight={isLight}
          className="gap-1 px-2 py-0.5 text-[9.5px]"
          title="Copy standalone Reference Keyframe JSON for this frame to clipboard"
        >
          {copiedRefKeyframe ? (
            <>
              <Check className="h-3 w-3 text-emerald-400 shrink-0" />
              <span>Copied Ref Keyframe #{effectiveFrameId}!</span>
            </>
          ) : (
            <>
              <Copy className="h-3 w-3 text-sky-400 shrink-0" />
              <span>Copy Ref Keyframe JSON</span>
            </>
          )}
        </Button>
      </div>
    </div>
  );
};
