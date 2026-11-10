import React, { useState, useMemo } from 'react';
import {
  MirrorRectangular,
  ChevronDown,
  Play,
  Pause,
  SkipBack,
  SkipForward,
} from 'lucide-react';
import { SettingActionRow } from '../../../compounds/SettingActionRow';
import { ToggleSwitch } from '../../../primitives/ToggleSwitch';
import { useSettingActionRowStore } from '../../../stores/settingRowStore';
import {
  useSpatialAudioStore,
  getFilteredBgmTracks,
} from '../../../stores/spatialAudioStore';
import { RealisticBgmTrackLibraryTable } from './RealisticBgmTrackLibraryTable';

export interface RealisticBgmSectionProps {
  bordered?: boolean;
  onHover: (desc: string) => void;
  onLeave: () => void;
  isLight?: boolean;
}

/**
 * [Layer 2 Settings -> Advanced Tab -> Realistic Background Music]
 * Displayed when a Background Music folder has been uploaded in the current session.
 * - Icon: `mirror-rectangular` (`MirrorRectangular`)
 * - ToggleSwitch on the far right (default: `true` — stadium spatial audio while driving, normal audio in ESC menu)
 * - `More` + down arrow (`ChevronDown`) to the left of the ToggleSwitch (matching `Show Telemetry Summary` underlined disclosure style) to expand Volume / Uncategorized / File Name filters.
 * - Filter state is persisted to localStorage while audio file blobs remain session-only.
 */
export const RealisticBgmSection: React.FC<RealisticBgmSectionProps> = React.memo(
  ({ bordered = false, onHover, onLeave, isLight = false }) => {
    const bgmTracks = useSpatialAudioStore((s) => s.bgmTracks);
    const realisticBgmEnabled = useSpatialAudioStore((s) => s.realisticBgmEnabled);
    const setRealisticBgmEnabled = useSpatialAudioStore((s) => s.setRealisticBgmEnabled);
    const bgmCategorizedMode = useSpatialAudioStore((s) => s.bgmCategorizedMode);
    const setBgmCategorizedMode = useSpatialAudioStore((s) => s.setBgmCategorizedMode);
    const bgmDeselectedVolumes = useSpatialAudioStore((s) => s.bgmDeselectedVolumes);
    const bgmDeselectedTrackNames = useSpatialAudioStore((s) => s.bgmDeselectedTrackNames);
    const bgmIsPlaying = useSpatialAudioStore((s) => s.bgmIsPlaying);
    const nextBgmTrack = useSpatialAudioStore((s) => s.nextBgmTrack);
    const prevBgmTrack = useSpatialAudioStore((s) => s.prevBgmTrack);
    const toggleBgmPlayPause = useSpatialAudioStore((s) => s.toggleBgmPlayPause);

    const [isExpanded, setIsExpanded] = useState(false);
    const { borderRadius, rowGap } = useSettingActionRowStore();

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

    if (bgmTracks.length === 0) {
      return null;
    }

    const moreTriggerButton = (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setIsExpanded((prev) => !prev);
        }}
        className={`inline-flex items-center gap-0.5 text-xs font-medium cursor-pointer transition-colors select-none py-0.5 px-1 rounded ${
          isLight
            ? 'text-neutral-500 hover:text-neutral-900'
            : 'text-neutral-400 hover:text-neutral-100'
        }`}
        title={
          isExpanded
            ? 'Collapse Volume & Track filter'
            : 'Expand Volume, Uncategorized & Track filter'
        }
      >
        <span className="underline underline-offset-3 decoration-current/60">
          More
        </span>
        <ChevronDown
          className={`h-3.5 w-3.5 transition-transform duration-200 ${
            isExpanded ? 'rotate-180' : ''
          }`}
        />
      </button>
    );

    return (
      <div
        data-ui-element="compound-realistic-bgm-section"
        style={{
          borderRadius: `${Math.max(0, borderRadius)}px`,
          gap: `${rowGap}px`,
        }}
        className={`flex flex-col w-full transition-colors ${
          bordered
            ? isLight
              ? 'p-2 border bg-neutral-50/90 border-neutral-200 shadow-2xs'
              : 'p-2 border bg-neutral-850/80 border-neutral-700/80'
            : ''
        }`}
      >
        <SettingActionRow
          icon={MirrorRectangular}
          iconName="mirror-rectangular"
          title="Realistic Background Music"
          description={`Spatial stadium reverb during driving, normal clear playback in menus (${activePlaylist.length}/${bgmTracks.length} active)`}
          bordered={false}
          onAction={() => setRealisticBgmEnabled(!realisticBgmEnabled)}
          hoverDescription="Realistic Background Music: Apply stadium spatial acoustics to Background Music while driving, and transition to clear studio playback when the ESC menu is opened. Click More to filter by Volume, Uncategorized, or individual file names."
          onHover={(desc) => desc && onHover(desc)}
          onLeave={onLeave}
          isLight={isLight}
          rightSlot={
            <div className="flex items-center gap-2.5">
              {moreTriggerButton}
              <ToggleSwitch
                checked={realisticBgmEnabled}
                onCheckedChange={setRealisticBgmEnabled}
                isLight={isLight}
                variant="neutral"
              />
            </div>
          }
        />

        {isExpanded && (
          <div
            style={{
              borderRadius: `${Math.max(6, borderRadius)}px`,
            }}
            className={`mt-1 p-3 border flex flex-col gap-3 w-full transition-all ${
              isLight
                ? 'bg-neutral-100/75 border-neutral-200/90 text-neutral-800'
                : 'bg-neutral-900/55 border-neutral-800/90 text-neutral-200'
            }`}
          >
            {/* Top row: Mode Switcher (Categorized vs Uncategorized) + Transport Controls */}
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-1.5">
                <span
                  className={`text-[11px] font-semibold uppercase tracking-wider ${
                    isLight ? 'text-neutral-500' : 'text-neutral-400'
                  }`}
                >
                  Filter Mode:
                </span>
                <div
                  className={`inline-flex rounded-lg p-0.5 border ${
                    isLight
                      ? 'bg-neutral-200/70 border-neutral-300'
                      : 'bg-neutral-950 border-neutral-800'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => setBgmCategorizedMode(true)}
                    className={`px-2.5 py-0.5 rounded-md text-[11px] font-semibold transition-all cursor-pointer ${
                      bgmCategorizedMode
                        ? isLight
                          ? 'bg-white text-neutral-900 shadow-2xs'
                          : 'bg-white/[0.14] text-white'
                        : isLight
                        ? 'text-neutral-600 hover:text-neutral-900'
                        : 'text-neutral-400 hover:text-neutral-200'
                    }`}
                  >
                    By Volume
                  </button>
                  <button
                    type="button"
                    onClick={() => setBgmCategorizedMode(false)}
                    className={`px-2.5 py-0.5 rounded-md text-[11px] font-semibold transition-all cursor-pointer ${
                      !bgmCategorizedMode
                        ? isLight
                          ? 'bg-white text-neutral-900 shadow-2xs'
                          : 'bg-white/[0.14] text-white'
                        : isLight
                        ? 'text-neutral-600 hover:text-neutral-900'
                        : 'text-neutral-400 hover:text-neutral-200'
                    }`}
                  >
                    Uncategorized (All Files)
                  </button>
                </div>
              </div>

              {/* Quick Mini Transport Controls */}
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={prevBgmTrack}
                  title="Previous Track"
                  className={`p-1.5 rounded-lg border transition-colors cursor-pointer ${
                    isLight
                      ? 'bg-white hover:bg-neutral-100 border-neutral-200 text-neutral-700'
                      : 'bg-neutral-850 hover:bg-neutral-800 border-neutral-700 text-neutral-300'
                  }`}
                >
                  <SkipBack className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={toggleBgmPlayPause}
                  title={bgmIsPlaying ? 'Pause' : 'Play'}
                  className={`p-1.5 rounded-lg border transition-colors cursor-pointer ${
                    bgmIsPlaying
                      ? isLight
                        ? 'bg-neutral-900 text-white border-neutral-900'
                        : 'bg-neutral-100 text-neutral-950 border-neutral-100'
                      : isLight
                      ? 'bg-white hover:bg-neutral-100 border-neutral-200 text-neutral-700'
                      : 'bg-neutral-850 hover:bg-neutral-800 border-neutral-700 text-neutral-300'
                  }`}
                >
                  {bgmIsPlaying ? (
                    <Pause className="h-3.5 w-3.5" />
                  ) : (
                    <Play className="h-3.5 w-3.5" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={nextBgmTrack}
                  title="Next Track"
                  className={`p-1.5 rounded-lg border transition-colors cursor-pointer ${
                    isLight
                      ? 'bg-white hover:bg-neutral-100 border-neutral-200 text-neutral-700'
                      : 'bg-neutral-850 hover:bg-neutral-800 border-neutral-700 text-neutral-300'
                  }`}
                >
                  <SkipForward className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            <RealisticBgmTrackLibraryTable isLight={isLight} />
          </div>
        )}
      </div>
    );
  }
);

RealisticBgmSection.displayName = 'RealisticBgmSection';
