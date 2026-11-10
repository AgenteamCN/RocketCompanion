import React, { useRef, useEffect, useState, useCallback } from 'react';
import {
  AXIS_INDEX_MAP,
  applyAxisDeadzone,
  computeDodgeAngle,
  computeTurningAngle,
  renderDodgingDeadzoneCanvas,
  renderTurningDeadzoneCanvas,
  type DeadzoneAntiAliasing,
  type StickAxisOption,
} from './deadzoneCanvasRenderer';

export interface ControllerDeadzoneAxisState {
  deadzone: number;
  dodgeDeadzone: number;
  steerAxisRole?: StickAxisOption;
  invertSteerAxis?: boolean;
  pitchAxisRole?: StickAxisOption;
  invertPitchAxis?: boolean;
  selectedGamepadIndex?: number | null;
}

export interface ControllerDeadzoneRenderConfig {
  showCircularOverlay: boolean;
  maxDiagonal: number;
  altArrow: boolean;
  antiAliasing: DeadzoneAntiAliasing;
}

export interface ControllerDeadzoneVisualizerProps {
  axisState: ControllerDeadzoneAxisState;
  renderConfig: ControllerDeadzoneRenderConfig;
  isLight?: boolean;
  onHover?: (desc: string) => void;
  onLeave?: () => void;
}

/**
 * [Decoupled Visualizer] ControllerDeadzoneVisualizer
 * High-performance hardware-accelerated Canvas2D port of HalfwayDead's Rocket League Deadzone Visualizer.
 */
export const ControllerDeadzoneVisualizer: React.FC<ControllerDeadzoneVisualizerProps> =
  React.memo(
    ({
      axisState: {
        deadzone,
        dodgeDeadzone,
        steerAxisRole = 'left-x',
        invertSteerAxis = false,
        pitchAxisRole = 'left-y',
        invertPitchAxis = false,
        selectedGamepadIndex = null,
      },
      renderConfig: {
        showCircularOverlay,
        maxDiagonal,
        altArrow,
        antiAliasing,
      },
      isLight = false,
      onHover,
      onLeave,
    }) => {
      const turningCanvasRef = useRef<HTMLCanvasElement | null>(null);
      const dodgingCanvasRef = useRef<HTMLCanvasElement | null>(null);

      const [turningStick, setTurningStick] = useState<{ x: number; y: number } | null>(
        null
      );
      const [dodgingStick, setDodgingStick] = useState<{ x: number; y: number } | null>(
        null
      );

      useEffect(() => {
        if (selectedGamepadIndex === null || selectedGamepadIndex < 0) return;
        let rafId = 0;
        const pollGamepad = () => {
          const pads =
            typeof navigator.getGamepads === 'function' ? navigator.getGamepads() : [];
          const pad = pads[selectedGamepadIndex];
          if (pad && pad.connected) {
            const xIdx = AXIS_INDEX_MAP[steerAxisRole] ?? 0;
            const yIdx = AXIS_INDEX_MAP[pitchAxisRole] ?? 1;
            const rawX = Math.max(-1, Math.min(1, pad.axes[xIdx] ?? 0));
            const rawY = Math.max(-1, Math.min(1, -(pad.axes[yIdx] ?? 0)));
            setTurningStick({ x: rawX, y: rawY });
            setDodgingStick({ x: rawX, y: rawY });
          }
          rafId = requestAnimationFrame(pollGamepad);
        };
        rafId = requestAnimationFrame(pollGamepad);
        return () => cancelAnimationFrame(rafId);
      }, [selectedGamepadIndex, steerAxisRole, pitchAxisRole]);

      const computeGameCoords = useCallback(
        (raw: { x: number; y: number } | null) => {
          if (!raw) return { x: 0, y: 0 };
          const effX = invertSteerAxis ? -raw.x : raw.x;
          const effY = invertPitchAxis ? -raw.y : raw.y;
          return {
            x: applyAxisDeadzone(effX, deadzone),
            y: applyAxisDeadzone(effY, deadzone),
          };
        },
        [deadzone, invertSteerAxis, invertPitchAxis]
      );

      useEffect(() => {
        const canvas = turningCanvasRef.current;
        if (!canvas) return;
        renderTurningDeadzoneCanvas({
          canvas,
          deadzone,
          showCircularOverlay,
          maxDiagonal,
          altArrow,
          antiAliasing,
          turningStick,
          gameCoords: computeGameCoords(turningStick),
        });
      }, [
        deadzone,
        showCircularOverlay,
        maxDiagonal,
        altArrow,
        antiAliasing,
        turningStick,
        computeGameCoords,
      ]);

      useEffect(() => {
        const canvas = dodgingCanvasRef.current;
        if (!canvas) return;
        renderDodgingDeadzoneCanvas({
          canvas,
          deadzone,
          dodgeDeadzone,
          showCircularOverlay,
          maxDiagonal,
          antiAliasing,
          dodgingStick,
          gameCoords: computeGameCoords(dodgingStick),
        });
      }, [
        deadzone,
        dodgeDeadzone,
        showCircularOverlay,
        maxDiagonal,
        antiAliasing,
        dodgingStick,
        computeGameCoords,
      ]);

      const extractNormalizedStick = (
        canvas: HTMLCanvasElement,
        clientX: number,
        clientY: number
      ) => {
        const rect = canvas.getBoundingClientRect();
        const normX = ((clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1;
        const normY = 1 - ((clientY - rect.top) / Math.max(1, rect.height)) * 2;
        return {
          x: Math.max(-1, Math.min(1, normX)),
          y: Math.max(-1, Math.min(1, normY)),
        };
      };

      const turningGame = computeGameCoords(turningStick);
      const turningAngle = computeTurningAngle(turningGame);

      const dodgingGame = computeGameCoords(dodgingStick);
      const dodgingAngle = computeDodgeAngle(dodgingGame, dodgeDeadzone);

      const renderTelemetryBox = (
        raw: { x: number; y: number } | null,
        game: { x: number; y: number },
        angleText: string
      ) => (
        <div
          className={`w-full rounded-lg border px-2.5 py-2 flex flex-col gap-1 font-mono text-[11px] transition-colors ${
            isLight
              ? 'bg-neutral-100/80 border-neutral-200/90 text-neutral-700'
              : 'bg-white/[0.04] border-white/[0.08] text-neutral-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className={isLight ? 'text-neutral-500' : 'text-neutral-400'}>
              Raw Input:
            </span>
            <span className="font-semibold tabular-nums">
              {raw ? `${raw.x.toFixed(2)}, ${raw.y.toFixed(2)}` : '0.00, 0.00'}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className={isLight ? 'text-neutral-500' : 'text-neutral-400'}>
              Game Input:
            </span>
            <span className="font-semibold tabular-nums">
              {raw ? `${game.x.toFixed(2)}, ${game.y.toFixed(2)}` : '0.00, 0.00'}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className={isLight ? 'text-neutral-500' : 'text-neutral-400'}>
              Direction Angle:
            </span>
            <span className="font-semibold tabular-nums">{angleText}</span>
          </div>
        </div>
      );

      return (
        <div
          data-ui-element="controller-deadzone-visualizer"
          className="grid grid-cols-2 gap-3 pt-1.5 w-full select-none"
          onMouseEnter={() =>
            onHover?.(
              'Interactive Rocket League Turning & Dodging Deadzone Visualizer. Move cursor over either diagram to inspect raw input, game input, and direction angle.'
            )
          }
          onMouseLeave={onLeave}
        >
          {/* Left Graph: Turning + Raw Input */}
          <div className="flex flex-col gap-2 items-center">
            <div className="flex items-center justify-between w-full px-0.5">
              <span
                className={`text-xs font-bold tracking-wide ${
                  isLight ? 'text-neutral-800' : 'text-neutral-200'
                }`}
              >
                Turning
              </span>
              <span
                className={`text-[10px] font-mono ${
                  isLight ? 'text-neutral-500' : 'text-neutral-400'
                }`}
              >
                DZ {deadzone.toFixed(2)}
              </span>
            </div>

            <div
              className={`relative w-full aspect-square rounded-lg overflow-hidden border shadow-xs cursor-crosshair ${
                isLight ? 'border-neutral-300' : 'border-neutral-700/90'
              }`}
            >
              <canvas
                ref={turningCanvasRef}
                onMouseMove={(e) => {
                  const pos = extractNormalizedStick(
                    e.currentTarget,
                    e.clientX,
                    e.clientY
                  );
                  setTurningStick(pos);
                }}
                onMouseLeave={() => setTurningStick(null)}
                onTouchStart={(e) => {
                  if (e.touches[0]) {
                    const pos = extractNormalizedStick(
                      e.currentTarget,
                      e.touches[0].clientX,
                      e.touches[0].clientY
                    );
                    setTurningStick(pos);
                  }
                }}
                onTouchMove={(e) => {
                  if (e.touches[0]) {
                    const pos = extractNormalizedStick(
                      e.currentTarget,
                      e.touches[0].clientX,
                      e.touches[0].clientY
                    );
                    setTurningStick(pos);
                  }
                }}
                onTouchEnd={() => setTurningStick(null)}
                className="w-full h-full block touch-none"
              />
            </div>

            {renderTelemetryBox(
              turningStick,
              turningGame,
              turningStick
                ? turningAngle === null
                  ? 'No direction.'
                  : `${Math.round(turningAngle)}°`
                : 'No direction.'
            )}
          </div>

          {/* Right Graph: Dodging + Raw Input */}
          <div className="flex flex-col gap-2 items-center">
            <div className="flex items-center justify-between w-full px-0.5">
              <span
                className={`text-xs font-bold tracking-wide ${
                  isLight ? 'text-neutral-800' : 'text-neutral-200'
                }`}
              >
                Dodging
              </span>
              <span
                className={`text-[10px] font-mono ${
                  isLight ? 'text-neutral-500' : 'text-neutral-400'
                }`}
              >
                Dodge {dodgeDeadzone.toFixed(2)}
              </span>
            </div>

            <div
              className={`relative w-full aspect-square rounded-lg overflow-hidden border shadow-xs cursor-crosshair ${
                isLight ? 'border-neutral-300' : 'border-neutral-700/90'
              }`}
            >
              <canvas
                ref={dodgingCanvasRef}
                onMouseMove={(e) => {
                  const pos = extractNormalizedStick(
                    e.currentTarget,
                    e.clientX,
                    e.clientY
                  );
                  setDodgingStick(pos);
                }}
                onMouseLeave={() => setDodgingStick(null)}
                onTouchStart={(e) => {
                  if (e.touches[0]) {
                    const pos = extractNormalizedStick(
                      e.currentTarget,
                      e.touches[0].clientX,
                      e.touches[0].clientY
                    );
                    setDodgingStick(pos);
                  }
                }}
                onTouchMove={(e) => {
                  if (e.touches[0]) {
                    const pos = extractNormalizedStick(
                      e.currentTarget,
                      e.touches[0].clientX,
                      e.touches[0].clientY
                    );
                    setDodgingStick(pos);
                  }
                }}
                onTouchEnd={() => setDodgingStick(null)}
                className="w-full h-full block touch-none"
              />
            </div>

            {renderTelemetryBox(
              dodgingStick,
              dodgingGame,
              dodgingStick
                ? dodgingAngle === null
                  ? 'No dodge.'
                  : `${Math.round(dodgingAngle)}°`
                : 'No dodge.'
            )}
          </div>
        </div>
      );
    }
  );

ControllerDeadzoneVisualizer.displayName = 'ControllerDeadzoneVisualizer';
