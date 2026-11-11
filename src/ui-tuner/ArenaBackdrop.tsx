import React from 'react';

export type ArenaLightingPreset = 'daylight' | 'twilight' | 'night' | 'flow';

export interface ArenaBackdropProps {
  preset?: ArenaLightingPreset;
  brightness?: number; // 0 to 100
  showPitchMarkings?: boolean;
  className?: string;
}

/**
 * ArenaBackdrop
 * Reusable visual environment for synthetic in-game pitches, lighting simulation, and offline HUD testing.
 * Strictly separates ambient stadium lighting from HUD layer so HUD brightness is guaranteed at 100%.
 */
export const ArenaBackdrop: React.FC<ArenaBackdropProps> = React.memo(({
  preset = 'night',
  brightness = 30,
  showPitchMarkings = true,
  className = '',
}) => {
  const norm = brightness / 100;

  const getBackdropStyles = (): React.CSSProperties => {
    if (preset === 'flow') {
      return {
        filter: `brightness(${(0.75 + norm * 0.45).toFixed(2)})`,
      };
    }
    if (preset === 'daylight') {
      return {
        backgroundImage: `
          radial-gradient(circle at 50% 10%, rgba(255, 255, 255, 0.8) 0%, transparent 60%),
          radial-gradient(circle at 20% 85%, rgba(34, 197, 94, 0.35) 0%, transparent 50%),
          radial-gradient(circle at 80% 85%, rgba(59, 130, 246, 0.3) 0%, transparent 50%),
          linear-gradient(to bottom, #7dd3fc 0%, #bae6fd 30%, #bbf7d0 65%, #22c55e 100%)
        `,
        filter: `brightness(${0.75 + norm * 0.45})`,
      };
    }
    if (preset === 'twilight') {
      return {
        backgroundImage: `
          radial-gradient(circle at 50% 25%, rgba(251, 146, 60, 0.35) 0%, transparent 60%),
          radial-gradient(circle at 80% 80%, rgba(244, 63, 94, 0.3) 0%, transparent 50%),
          radial-gradient(circle at 20% 90%, rgba(16, 185, 129, 0.25) 0%, transparent 50%),
          linear-gradient(to bottom, #1e1b4b 0%, #4c1d95 35%, #831843 65%, #064e3b 100%)
        `,
        filter: `brightness(${0.65 + norm * 0.5})`,
      };
    }
    // night
    return {
      backgroundImage: `
        radial-gradient(circle at 50% 100%, rgba(16, 185, 129, 0.15) 0%, transparent 60%),
        radial-gradient(circle at 20% 50%, rgba(56, 189, 248, 0.12) 0%, transparent 50%),
        radial-gradient(circle at 80% 50%, rgba(245, 158, 11, 0.12) 0%, transparent 50%),
        linear-gradient(to bottom, #09090b 0%, #111827 50%, #030712 100%)
      `,
      filter: `brightness(${0.5 + norm * 0.8})`,
    };
  };

  return (
    <div
      data-ui-element="arena-backdrop"
      className={`absolute inset-0 pointer-events-none overflow-hidden select-none [contain:strict] ${className}`}
    >
      {/* Dynamic atmospheric gradient */}
      <div
        className={`absolute inset-0 pointer-events-none ${
          preset === 'flow' ? 'rcui-flow-backdrop' : ''
        }`}
        style={getBackdropStyles()}
      />

      {/* Synthetic pitch markings */}
      {showPitchMarkings && (
        <div
          className={`absolute inset-0 pointer-events-none ${
            preset === 'daylight' ? 'opacity-40' : 'opacity-25'
          }`}
          style={{
            filter: `brightness(${0.7 + (brightness / 100) * 0.6})`,
          }}
        >
          <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-white shadow-xs -translate-y-1/2" />
          <div className="absolute top-1/2 left-1/2 w-48 h-48 rounded-full border-2 border-white shadow-xs -translate-x-1/2 -translate-y-1/2" />
          <div className="absolute top-1/2 left-1/2 w-4 h-4 rounded-full bg-white -translate-x-1/2 -translate-y-1/2 shadow-xs" />
        </div>
      )}
    </div>
  );
});

ArenaBackdrop.displayName = 'ArenaBackdrop';
