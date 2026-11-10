import React from 'react';
import { Video } from 'lucide-react';
import { useAppStore } from '../../../stores/appStore';
import { TunerRow } from '../../../compounds/TunerControls';

export interface DriftwoodsFreeCamSectionProps {
  isLight?: boolean;
}

export const DriftwoodsFreeCamSection: React.FC<DriftwoodsFreeCamSectionProps> = ({
  isLight = false,
}) => {
  const isFreeCam = useAppStore((s) => s.isFreeCam);
  const freeCamFov = useAppStore((s) => s.freeCamFov);
  const toggleFreeCam = useAppStore((s) => s.toggleFreeCam);
  const setFreeCamFov = useAppStore((s) => s.setFreeCamFov);

  return (
    <div
      className={`p-2 rounded-xl border flex flex-col gap-1.5 transition-colors ${
        isFreeCam
          ? isLight
            ? 'bg-emerald-50/70 border-emerald-300 ring-1 ring-emerald-400'
            : 'bg-emerald-950/25 border-emerald-500/60 ring-1 ring-emerald-500/30'
          : isLight
          ? 'bg-neutral-50/80 border-neutral-200'
          : 'bg-neutral-900/60 border-neutral-700/60'
      }`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Video className={`h-4 w-4 shrink-0 ${isFreeCam ? 'text-emerald-400' : 'text-neutral-400'}`} />
          <div className="flex flex-col">
            <div className="flex items-center gap-1.5">
              <span className="font-semibold text-xs">Free Camera Mode</span>
              <span className="text-[9px] px-1 py-0.2 rounded font-mono bg-neutral-800 text-neutral-300 border border-neutral-700">
                Shift + F
              </span>
            </div>
            <span className={`text-[10px] leading-tight ${isLight ? 'text-neutral-500' : 'text-neutral-400'}`}>
              {isFreeCam ? 'Active: Coordinates Persisted | WASD Move, I/M Altitude' : 'Developer free-flight spectator mode'}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isFreeCam && (
            <button
              type="button"
              onClick={() => useAppStore.getState().bridge?.onResetFreeCam?.()}
              title="Reset to stadium default panorama coordinates"
              className={`px-2 py-0.5 rounded text-[10px] font-mono font-medium border cursor-pointer transition-all active:scale-95 ${
                isLight
                  ? 'bg-white hover:bg-neutral-100 border-neutral-300 text-neutral-700'
                  : 'bg-neutral-800 hover:bg-neutral-700 border-neutral-600 text-neutral-300'
              }`}
            >
              Reset Coords
            </button>
          )}

          <button
            type="button"
            role="switch"
            aria-checked={isFreeCam}
            onClick={() => toggleFreeCam()}
            className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
              isFreeCam ? 'bg-emerald-500' : isLight ? 'bg-neutral-300' : 'bg-neutral-700'
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                isFreeCam ? 'translate-x-4' : 'translate-x-0'
              }`}
            />
          </button>
        </div>
      </div>

      {isFreeCam && (
        <div className="flex flex-col gap-1.5 pt-1 border-t border-emerald-500/20">
          <TunerRow
            label="Free Camera FOV"
            description="Adjust fly-camera field of view in degrees (10 deg - 140 deg)"
            value={freeCamFov}
            sliderMin={10}
            sliderMax={140}
            sliderStep={1}
            stepOverride={1}
            unit="deg"
            onChange={setFreeCamFov}
            isLight={isLight}
          />

          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] font-mono text-emerald-400/90 bg-emerald-950/40 px-2 py-1 rounded-lg border border-emerald-500/25">
            <span>* <strong>WASD</strong>: Horizontal move</span>
            <span>* <strong>I / M</strong>: Elevate UP / DOWN</span>
            <span>* <strong>Mouse Drag</strong>: Free look</span>
            <span>* <strong>Shift</strong>: 2.5x Speed</span>
          </div>
        </div>
      )}
    </div>
  );
};
