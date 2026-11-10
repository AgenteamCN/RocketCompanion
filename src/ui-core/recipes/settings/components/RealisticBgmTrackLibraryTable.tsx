import React, { useMemo } from 'react';
import { Check, Volume2 } from 'lucide-react';
import { Checkbox } from '../../../primitives/Checkbox';
import {
  useSpatialAudioStore,
  getFilteredBgmTracks,
} from '../../../stores/spatialAudioStore';

export interface RealisticBgmTrackLibraryTableProps {
  isLight?: boolean;
}

/**
 * [Layer 2 Settings -> Advanced Tab -> Realistic Background Music -> Track Library Table]
 * Renders the Volume filter pills (in By Volume mode) and the individual audio file checklist
 * with live playback trigger and enable/disable batch actions.
 */
export const RealisticBgmTrackLibraryTable: React.FC<RealisticBgmTrackLibraryTableProps> =
  React.memo(({ isLight = false }) => {
    const bgmTracks = useSpatialAudioStore((s) => s.bgmTracks);
    const bgmVolumes = useSpatialAudioStore((s) => s.bgmVolumes);
    const bgmCategorizedMode = useSpatialAudioStore((s) => s.bgmCategorizedMode);
    const bgmDeselectedVolumes = useSpatialAudioStore((s) => s.bgmDeselectedVolumes);
    const toggleBgmVolume = useSpatialAudioStore((s) => s.toggleBgmVolume);
    const setAllBgmVolumes = useSpatialAudioStore((s) => s.setAllBgmVolumes);
    const bgmDeselectedTrackNames = useSpatialAudioStore((s) => s.bgmDeselectedTrackNames);
    const toggleBgmTrack = useSpatialAudioStore((s) => s.toggleBgmTrack);
    const setAllBgmTracks = useSpatialAudioStore((s) => s.setAllBgmTracks);
    const bgmCurrentTrackId = useSpatialAudioStore((s) => s.bgmCurrentTrackId);
    const playSpecificBgmTrack = useSpatialAudioStore((s) => s.playSpecificBgmTrack);

    const visibleTracks = useMemo(() => {
      if (!bgmCategorizedMode) return bgmTracks;
      const deselectedVolSet = new Set(bgmDeselectedVolumes);
      return bgmTracks.filter((track) => {
        const volKey = track.volume ?? 'uncategorized';
        return !deselectedVolSet.has(volKey);
      });
    }, [bgmTracks, bgmCategorizedMode, bgmDeselectedVolumes]);

    const activePlaylist = useMemo(
      () =>
        getFilteredBgmTracks({
          bgmTracks,
          bgmCategorizedMode,
          bgmDeselectedVolumes,
          bgmDeselectedTrackNames,
        }),
      [bgmTracks, bgmCategorizedMode, bgmDeselectedVolumes, bgmDeselectedTrackNames]
    );

    const deselectedVolSet = new Set(bgmDeselectedVolumes);
    const deselectedTrackSet = new Set(bgmDeselectedTrackNames);

    return (
      <>
        {bgmCategorizedMode && bgmVolumes.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between text-[11px]">
              <span
                className={`font-semibold uppercase tracking-wider ${
                  isLight ? 'text-neutral-600' : 'text-neutral-400'
                }`}
              >
                Volumes ({bgmVolumes.length - bgmDeselectedVolumes.length}/{bgmVolumes.length})
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setAllBgmVolumes(true)}
                  className={`px-2 py-0.5 rounded text-[10px] font-semibold border cursor-pointer transition-colors ${
                    isLight
                      ? 'bg-neutral-200/80 border-neutral-300 text-neutral-800 hover:bg-neutral-300/80'
                      : 'bg-white/[0.08] border-white/[0.12] text-neutral-200 hover:bg-white/[0.14]'
                  }`}
                >
                  Select All
                </button>
                <button
                  type="button"
                  onClick={() => setAllBgmVolumes(false)}
                  className={`px-2 py-0.5 rounded text-[10px] font-semibold border cursor-pointer transition-colors ${
                    isLight
                      ? 'bg-white border-neutral-300 text-neutral-600 hover:bg-neutral-100'
                      : 'bg-neutral-800 border-neutral-700 text-neutral-400 hover:bg-neutral-700'
                  }`}
                >
                  Clear All
                </button>
              </div>
            </div>

            <div className="flex items-center gap-1.5 flex-wrap">
              {bgmVolumes.map((vol) => {
                const isVolSelected = !deselectedVolSet.has(vol);
                const label = vol === 'uncategorized' ? 'Uncategorized' : `Vol ${vol}`;
                return (
                  <button
                    key={vol}
                    type="button"
                    onClick={() => toggleBgmVolume(vol)}
                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-all cursor-pointer select-none ${
                      isVolSelected
                        ? isLight
                          ? 'bg-neutral-900 text-white border-neutral-900 shadow-2xs'
                          : 'bg-white/[0.14] text-white border-white/[0.24]'
                        : isLight
                        ? 'bg-white text-neutral-400 border-neutral-200 hover:text-neutral-700'
                        : 'bg-neutral-950/60 text-neutral-500 border-neutral-800 hover:text-neutral-300'
                    }`}
                  >
                    {isVolSelected && <Check className="h-3 w-3 stroke-[3]" />}
                    <span>{label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between text-[11px]">
            <span
              className={`font-semibold uppercase tracking-wider ${
                isLight ? 'text-neutral-600' : 'text-neutral-400'
              }`}
            >
              Audio Files ({activePlaylist.length}/{visibleTracks.length} Active)
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() =>
                  setAllBgmTracks(
                    true,
                    visibleTracks.map((t) => t.rawName)
                  )
                }
                className={`px-2 py-0.5 rounded text-[10px] font-semibold border cursor-pointer transition-colors ${
                  isLight
                    ? 'bg-neutral-200/80 border-neutral-300 text-neutral-800 hover:bg-neutral-300/80'
                    : 'bg-white/[0.08] border-white/[0.12] text-neutral-200 hover:bg-white/[0.14]'
                }`}
              >
                Enable All
              </button>
              <button
                type="button"
                onClick={() =>
                  setAllBgmTracks(
                    false,
                    visibleTracks.map((t) => t.rawName)
                  )
                }
                className={`px-2 py-0.5 rounded text-[10px] font-semibold border cursor-pointer transition-colors ${
                  isLight
                    ? 'bg-white border-neutral-300 text-neutral-600 hover:bg-neutral-100'
                    : 'bg-neutral-800 border-neutral-700 text-neutral-400 hover:bg-neutral-700'
                }`}
              >
                Disable All
              </button>
            </div>
          </div>

          <div
            className={`max-h-48 overflow-y-auto rounded-lg border divide-y ${
              isLight
                ? 'bg-white border-neutral-200 divide-neutral-100'
                : 'bg-neutral-950/80 border-neutral-800 divide-neutral-800/60'
            }`}
          >
            {visibleTracks.length === 0 ? (
              <div className="p-3 text-center text-xs text-neutral-500">
                No tracks match the selected volume filter.
              </div>
            ) : (
              visibleTracks.map((track) => {
                const isTrackEnabled = !deselectedTrackSet.has(track.rawName);
                const isCurrentPlaying = bgmCurrentTrackId === track.id;

                return (
                  <div
                    key={track.id}
                    className={`flex items-center justify-between px-2.5 py-1.5 text-xs transition-colors ${
                      isCurrentPlaying
                        ? isLight
                          ? 'bg-neutral-100 text-neutral-900'
                          : 'bg-white/[0.08] text-white'
                        : isLight
                        ? 'hover:bg-neutral-50'
                        : 'hover:bg-neutral-900'
                    } ${!isTrackEnabled ? 'opacity-50' : ''}`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      <Checkbox
                        checked={isTrackEnabled}
                        onCheckedChange={() => toggleBgmTrack(track.rawName)}
                        variant="neutral"
                        size="sm"
                        isLight={isLight}
                        title={
                          isTrackEnabled
                            ? `Exclude ${track.rawName} from playlist`
                            : `Include ${track.rawName} in playlist`
                        }
                      />
                      <button
                        type="button"
                        onClick={() => playSpecificBgmTrack(track.id)}
                        className="flex items-center gap-2 min-w-0 flex-1 text-left cursor-pointer truncate"
                        title={`Play ${track.rawName}`}
                      >
                        {isCurrentPlaying && (
                          <Volume2 className="h-3.5 w-3.5 shrink-0 animate-pulse" />
                        )}
                        <span className="font-medium truncate">{track.title}</span>
                        <span
                          className={`text-[10px] font-mono truncate ${
                            isLight ? 'text-neutral-400' : 'text-neutral-500'
                          }`}
                        >
                          ({track.rawName})
                        </span>
                      </button>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0 ml-2">
                      <span
                        className={`text-[10px] font-mono ${
                          isLight ? 'text-neutral-400' : 'text-neutral-500'
                        }`}
                      >
                        {track.volume ? `Vol ${track.volume}` : 'Uncat'}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </>
    );
  });

RealisticBgmTrackLibraryTable.displayName = 'RealisticBgmTrackLibraryTable';
