import React, { useEffect, useRef } from 'react';
import type {
  NameTagBoostIndicatorMode,
  NameTagConfig,
} from '../../../ui-core/config/nameTagCalibrationMath';
import {
  drawNameTagPillCard2D,
  renderNameTagOverlayPass2D,
} from '../../../ui-core/config/nameTagPillRenderer';
import { buildSinglePillCard2D } from './nameTagArenaProjectionMath';

interface ModeDescriptor {
  mode: NameTagBoostIndicatorMode;
  badge: string;
  title: string;
  fairnessNote: string;
}

const MODE_DESCRIPTORS: ModeDescriptor[] = [
  {
    mode: 'bottom-up-fill',
    badge: 'MODE A · RECOMMENDED',
    title: 'Bottom-to-Top Fill Override',
    fairnessNote: 'Vertical height is identical for short ("K") and long ("AlphaStriker") names.',
  },
  {
    mode: 'left-right-fill',
    badge: 'MODE B · HORIZONTAL BAR',
    title: 'Left-to-Right Fill Override',
    fairnessNote: 'Intuitive progress bar; fill speed scales with horizontal pill width.',
  },
  {
    mode: 'sunset-circle',
    badge: 'MODE C · EMBEDDED GAUGE',
    title: 'Sunset Circle Gauge',
    fairnessNote: 'Fixed circular rising-sun gauge on the left; text background remains crisp.',
  },
  {
    mode: 'border-only',
    badge: 'MODE D · LEGACY',
    title: 'Perimeter Border Only',
    fairnessNote: 'Original RocketCompanion 922800b clockwise perimeter stroke.',
  },
];

const ModeSampleCanvas: React.FC<{
  config: NameTagConfig;
  mode: NameTagBoostIndicatorMode;
}> = ({ config, mode }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const width = 320;
    const height = 98;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const sampleConfig: NameTagConfig = {
      ...config,
      boostIndicatorMode: mode,
      boostBorderEnabled: true,
    };

    const boostPct = sampleConfig.previewBoostAmounts[1] ?? 66;
    const shortCard = buildSinglePillCard2D(0, 'K', 0, boostPct, 74, 49, 0.56, 1800, 1800 * 1800, sampleConfig, true);
    const longCard = buildSinglePillCard2D(
      1,
      'AlphaStriker',
      1,
      boostPct,
      214,
      49,
      0.56,
      1800,
      1800 * 1800,
      sampleConfig,
      true,
    );

    drawNameTagPillCard2D(ctx, shortCard, sampleConfig);
    drawNameTagPillCard2D(ctx, longCard, sampleConfig);
  }, [config, mode]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        width: '100%',
        height: 98,
        display: 'block',
        borderRadius: 8,
        background: 'radial-gradient(circle at 50% 40%, rgba(30, 41, 59, 0.78), rgba(9, 13, 22, 0.92))',
        border: '1px solid rgba(255, 255, 255, 0.08)',
      }}
    />
  );
};

const BallOcclusionSampleCanvas: React.FC<{
  config: NameTagConfig;
  enabled: boolean;
  opacity: number;
  label: string;
}> = ({ config, enabled, opacity, label }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const width = 280;
    const height = 108;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const offscreen = document.createElement('canvas');
    offscreen.width = canvas.width;
    offscreen.height = canvas.height;
    const offCtx = offscreen.getContext('2d');
    if (!offCtx) return;

    offCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    offCtx.clearRect(0, 0, width, height);

    const sampleConfig: NameTagConfig = {
      ...config,
      ballOcclusionEnabled: enabled,
      ballOcclusionOpacity: opacity,
    };

    const boostPct = sampleConfig.previewBoostAmounts[1] ?? 66;
    const opponentCard = buildSinglePillCard2D(
      3,
      'O1 · KickoffTarget',
      1,
      boostPct,
      width * 0.5,
      height * 0.58,
      0.56,
      2600,
      2600 * 2600,
      sampleConfig,
      true,
    );

    renderNameTagOverlayPass2D(
      offCtx,
      [opponentCard],
      width,
      height,
      sampleConfig,
      {
        visible: true,
        screenX: width * 0.5,
        screenY: height * 0.52,
        screenRadiusPx: 29,
        viewZDepthUu: 1300,
        opacity,
      },
    );

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    // Draw background 3D ball silhouette first
    ctx.save();
    ctx.globalAlpha = Math.max(0.1, opacity);
    const ballGrad = ctx.createRadialGradient(
      width * 0.5 - 9,
      height * 0.52 - 9,
      4,
      width * 0.5,
      height * 0.52,
      29,
    );
    ballGrad.addColorStop(0, '#f8fafc');
    ballGrad.addColorStop(0.6, '#94a3b8');
    ballGrad.addColorStop(1, '#1e293b');
    ctx.fillStyle = ballGrad;
    ctx.beginPath();
    ctx.arc(width * 0.5, height * 0.52, 29, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = enabled ? 'rgba(94, 234, 212, 0.7)' : 'rgba(255, 255, 255, 0.3)';
    ctx.lineWidth = 1.25;
    ctx.stroke();
    ctx.restore();

    // Composite the 2D Name Tag overlay pass on top
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(offscreen, 0, 0);
  }, [config, enabled, opacity]);

  return (
    <div
      style={{
        padding: 10,
        borderRadius: 10,
        background: 'rgba(15, 23, 42, 0.55)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
      }}
    >
      <div style={{ fontSize: 11, fontWeight: 700, color: '#e2e8f0', fontFamily: 'var(--font-mono)' }}>
        {label}
      </div>
      <canvas
        ref={canvasRef}
        style={{
          width: '100%',
          height: 108,
          display: 'block',
          borderRadius: 8,
          background: 'radial-gradient(circle at 50% 50%, rgba(15, 23, 42, 0.9), rgba(6, 10, 18, 0.96))',
        }}
      />
    </div>
  );
};

export interface NameTagModeShootoutSectionProps {
  config: NameTagConfig;
  onSelectMode: (mode: NameTagBoostIndicatorMode) => void;
  onUpdateConfig: (patch: Partial<NameTagConfig>) => void;
}

export const NameTagModeShootoutSection: React.FC<NameTagModeShootoutSectionProps> = ({
  config,
  onSelectMode,
  onUpdateConfig,
}) => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* 4-Mode Shootout Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(270px, 1fr))',
          gap: 12,
        }}
      >
        {MODE_DESCRIPTORS.map((item) => {
          const active = config.boostIndicatorMode === item.mode;
          return (
            <div
              key={item.mode}
              onClick={() => onSelectMode(item.mode)}
              style={{
                cursor: 'pointer',
                padding: 12,
                borderRadius: 12,
                background: active ? 'rgba(94, 234, 212, 0.08)' : 'rgba(15, 23, 42, 0.55)',
                border: active
                  ? '1.5px solid rgba(94, 234, 212, 0.65)'
                  : '1px solid rgba(255, 255, 255, 0.08)',
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                transition: 'all 140ms ease',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                <span
                  style={{
                    fontSize: 9.5,
                    fontWeight: 800,
                    fontFamily: 'var(--font-mono)',
                    letterSpacing: '0.06em',
                    padding: '2px 7px',
                    borderRadius: 4,
                    background: active ? 'rgba(94, 234, 212, 0.2)' : 'rgba(255, 255, 255, 0.07)',
                    color: active ? '#5eead4' : '#94a3b8',
                  }}
                >
                  {item.badge}
                </span>
                <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: active ? '#5eead4' : '#64748b' }}>
                  {active ? 'ACTIVE' : 'CLICK TO APPLY'}
                </span>
              </div>

              <div style={{ fontSize: 13, fontWeight: 700, color: '#f8fafc' }}>{item.title}</div>

              <ModeSampleCanvas config={config} mode={item.mode} />

              <div style={{ fontSize: 11, color: '#94a3b8', lineHeight: 1.4 }}>{item.fairnessNote}</div>
            </div>
          );
        })}
      </div>

      {/* Kickoff Ball Entity Occlusion Comparison Strip */}
      <div
        style={{
          padding: 14,
          borderRadius: 12,
          background: 'rgba(15, 23, 42, 0.45)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 800, color: '#f8fafc', letterSpacing: '0.03em' }}>
              KICKOFF BALL ENTITY OCCLUSION (DESTINATION-OUT ALPHA MASK)
            </div>
            <div style={{ fontSize: 11, color: '#94a3b8' }}>
              Default is ON at 100% Solid Ball so behind-the-ball name tags are cleanly occluded by the 3D ball silhouette (proportional to Ball Opacity).
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              type="button"
              onClick={() => onUpdateConfig({ ballOcclusionEnabled: false })}
              style={{
                padding: '5px 10px',
                borderRadius: 6,
                fontSize: 10.5,
                fontWeight: 700,
                cursor: 'pointer',
                border: !config.ballOcclusionEnabled
                  ? '1px solid rgba(94, 234, 212, 0.6)'
                  : '1px solid rgba(255, 255, 255, 0.14)',
                background: !config.ballOcclusionEnabled
                  ? 'rgba(94, 234, 212, 0.16)'
                  : 'rgba(255, 255, 255, 0.04)',
                color: !config.ballOcclusionEnabled ? '#5eead4' : '#cbd5e1',
              }}
            >
              Disable: OFF (Unmasked)
            </button>
            <button
              type="button"
              onClick={() => onUpdateConfig({ ballOcclusionEnabled: true, ballOcclusionOpacity: 0.7 })}
              style={{
                padding: '5px 10px',
                borderRadius: 6,
                fontSize: 10.5,
                fontWeight: 700,
                cursor: 'pointer',
                border:
                  config.ballOcclusionEnabled && Math.abs(config.ballOcclusionOpacity - 0.7) < 0.02
                    ? '1px solid rgba(94, 234, 212, 0.6)'
                    : '1px solid rgba(255, 255, 255, 0.14)',
                background:
                  config.ballOcclusionEnabled && Math.abs(config.ballOcclusionOpacity - 0.7) < 0.02
                    ? 'rgba(94, 234, 212, 0.16)'
                    : 'rgba(255, 255, 255, 0.04)',
                color:
                  config.ballOcclusionEnabled && Math.abs(config.ballOcclusionOpacity - 0.7) < 0.02
                    ? '#5eead4'
                    : '#cbd5e1',
              }}
            >
              Enable 70% Ball Opacity
            </button>
            <button
              type="button"
              onClick={() => onUpdateConfig({ ballOcclusionEnabled: true, ballOcclusionOpacity: 1.0 })}
              style={{
                padding: '5px 10px',
                borderRadius: 6,
                fontSize: 10.5,
                fontWeight: 700,
                cursor: 'pointer',
                border:
                  config.ballOcclusionEnabled && config.ballOcclusionOpacity >= 0.99
                    ? '1px solid rgba(94, 234, 212, 0.6)'
                    : '1px solid rgba(255, 255, 255, 0.14)',
                background:
                  config.ballOcclusionEnabled && config.ballOcclusionOpacity >= 0.99
                    ? 'rgba(94, 234, 212, 0.16)'
                    : 'rgba(255, 255, 255, 0.04)',
                color:
                  config.ballOcclusionEnabled && config.ballOcclusionOpacity >= 0.99
                    ? '#5eead4'
                    : '#cbd5e1',
              }}
            >
              Default: 100% Solid Ball
            </button>
          </div>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))',
            gap: 10,
          }}
        >
          <BallOcclusionSampleCanvas
            config={config}
            enabled={false}
            opacity={0.7}
            label="1. Occlusion OFF (Unmasked)"
          />
          <BallOcclusionSampleCanvas
            config={config}
            enabled={true}
            opacity={0.7}
            label="2. Occlusion ON @ 70% Ball Opacity"
          />
          <BallOcclusionSampleCanvas
            config={config}
            enabled={true}
            opacity={1.0}
            label="3. Occlusion ON @ 100% Solid Ball (Default)"
          />
        </div>
      </div>
    </div>
  );
};
