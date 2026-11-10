import React, { useState, useRef } from 'react';
import {
  EighthNotes,
  ChevronDown,
  Gamepad2,
  Target,
  Users,
  Trophy,
  Timer,
} from 'lucide-react';
import { SettingActionRow } from '../../../compounds/SettingActionRow';
import { SettingSliderRow } from '../../../compounds/SettingSliderRow';
import { SettingToggleRow } from '../../../compounds/SettingToggleRow';
import { Checkbox } from '../../../primitives/Checkbox';
import { useSettingActionRowStore } from '../../../stores/settingRowStore';
import { useSpatialAudioStore } from '../../../stores/spatialAudioStore';
import { useScopedStore } from '../../../stores/storeSnapshotScope';
import type { BgmSceneConfig } from '../../../config/spatialAudioConfig';

export interface BgmFolderAndSceneConfigSectionProps {
  isLight?: boolean;
  developerMode?: boolean;
  onHover: (desc: string) => void;
  onLeave: () => void;
}

const BGM_SCENE_ITEMS: readonly {
  key: keyof BgmSceneConfig;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
}[] = [
  {
    key: 'freePlay',
    label: 'Free Play',
    description: 'Play background music during Free Play driving and menu navigation',
    icon: Gamepad2,
  },
  {
    key: 'singlePlayerTraining',
    label: 'Single Player Training',
    description: 'Play background music during Kickoff Training and Custom Training Packs',
    icon: Target,
  },
  {
    key: 'multiplayerTraining',
    label: 'Multiplayer Training',
    description: 'Play background music during Online Warmup and multiplayer training sessions',
    icon: Users,
  },
  {
    key: 'match',
    label: 'Match',
    description: 'Play background music during Exhibition, Bot Matches, and Online Matches',
    icon: Trophy,
  },
];

/**
 * [Layer 2 Settings -> Audio Tab -> Background Music Folder Upload & Scene Filter Card]
 * Encapsulates the Background Music toggle row, local directory audio uploader,
 * expandable per-scene playback checklist, and fade-in/fade-out duration slider.
 */
export const BgmFolderAndSceneConfigSection: React.FC<BgmFolderAndSceneConfigSectionProps> =
  React.memo(({ isLight = false, developerMode = false, onHover, onLeave }) => {
    const bgmEnabled = useScopedStore('spatialAudioStore', useSpatialAudioStore, (s) => s.bgmEnabled);
    const setStoreBgmEnabled = useScopedStore(
      'spatialAudioStore',
      useSpatialAudioStore,
      (s) => s.setBgmEnabled
    );
    const bgmScenes = useScopedStore('spatialAudioStore', useSpatialAudioStore, (s) => s.bgmScenes);
    const setBgmSceneEnabled = useScopedStore(
      'spatialAudioStore',
      useSpatialAudioStore,
      (s) => s.setBgmSceneEnabled
    );
    const uploadStoreBgmFiles = useScopedStore(
      'spatialAudioStore',
      useSpatialAudioStore,
      (s) => s.uploadBgmFiles
    );
    const bgmTracksCount = useScopedStore(
      'spatialAudioStore',
      useSpatialAudioStore,
      (s) => s.bgmTracks.length
    );
    const bgmCurrentTrackTitle = useScopedStore(
      'spatialAudioStore',
      useSpatialAudioStore,
      (s) => s.bgmCurrentTrackTitle
    );
    const bgmFadeDurationSec = useScopedStore(
      'spatialAudioStore',
      useSpatialAudioStore,
      (s) => s.tunerConfig?.bgmFadeDurationSec ?? 2.0
    );
    const updateTunerConfig = useScopedStore(
      'spatialAudioStore',
      useSpatialAudioStore,
      (s) => s.updateTunerConfig
    );

    const [isBgmMoreExpanded, setIsBgmMoreExpanded] = useState(false);
    const folderInputRef = useRef<HTMLInputElement | null>(null);

    const {
      rowGap,
      borderRadius,
      buttonFontSize,
      buttonPaddingX,
      buttonPaddingY,
      buttonRadius,
    } = useSettingActionRowStore();

    const handleFolderSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (files && files.length > 0) {
        uploadStoreBgmFiles(files);
      }
      e.target.value = '';
    };

    const moreDisclosureButton = (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setIsBgmMoreExpanded((prev) => !prev);
        }}
        className={`inline-flex items-center gap-0.5 text-xs font-medium cursor-pointer transition-colors select-none py-0.5 px-1 rounded ${
          isLight
            ? 'text-neutral-500 hover:text-neutral-900'
            : 'text-neutral-400 hover:text-neutral-100'
        }`}
        title={
          isBgmMoreExpanded
            ? 'Collapse background music playback scenes & fade settings'
            : 'Expand background music playback scenes & fade settings'
        }
      >
        <span className="underline underline-offset-3 decoration-current/60">More</span>
        <ChevronDown
          className={`h-3.5 w-3.5 transition-transform duration-200 ${
            isBgmMoreExpanded ? 'rotate-180' : ''
          }`}
        />
      </button>
    );

    const uploadFolderButton = (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          folderInputRef.current?.click();
        }}
        style={{
          fontSize: `${buttonFontSize}px`,
          padding: `${buttonPaddingY}px ${buttonPaddingX}px`,
          borderRadius: `${buttonRadius}px`,
        }}
        className={`font-semibold transition-all duration-150 shrink-0 cursor-pointer border active:scale-[0.98] ${
          isLight
            ? 'bg-neutral-200/60 group-hover:bg-neutral-200/95 hover:!bg-neutral-300/90 border-neutral-300/80 text-neutral-800'
            : 'bg-white/[0.06] group-hover:bg-white/[0.11] hover:!bg-white/[0.16] border-white/[0.10] group-hover:border-white/[0.16] text-neutral-200'
        }`}
        title="Upload a folder of audio files for Background Music"
      >
        {bgmTracksCount > 0 ? 'Change Folder' : 'Upload Folder'}
      </button>
    );

    return (
      <>
        <input
          ref={folderInputRef}
          type="file"
          // @ts-expect-error webkitdirectory is standard across Chromium/WebKit/Firefox browsers
          webkitdirectory=""
          directory=""
          multiple
          accept="audio/*"
          className="hidden"
          onChange={handleFolderSelected}
        />

        <div
          data-ui-element="compound-bgm-config-card"
          className="flex flex-col w-full"
          style={{ gap: `${rowGap}px` }}
        >
          <SettingToggleRow
            icon={EighthNotes}
            iconName="eighth-notes"
            label="Background Music"
            subtitle={
              bgmTracksCount > 0
                ? bgmCurrentTrackTitle
                  ? `${bgmTracksCount} tracks loaded · Playing: ${bgmCurrentTrackTitle}`
                  : `${bgmTracksCount} tracks loaded in current session`
                : 'Upload a local audio folder for soundtrack playback (supports hardware media keys)'
            }
            checked={bgmEnabled}
            onChange={setStoreBgmEnabled}
            extraRightSlot={
              <div className="flex items-center gap-2.5">
                {moreDisclosureButton}
                {uploadFolderButton}
              </div>
            }
            hoverDescription="Background Music: Enable custom background soundtrack playback with smooth fade-in/fade-out and MediaSession shortcut support. Click More to choose active scenes and adjust fade-in/fade-out duration (up to 3.0s), or Upload Folder to load local audio files."
            onHover={(desc) => desc && onHover(desc)}
            onLeave={onLeave}
            isLight={isLight}
          />

          {isBgmMoreExpanded && (
            <div
              style={{
                borderRadius: `${Math.max(6, borderRadius)}px`,
                gap: `${rowGap}px`,
              }}
              className={`mt-1 p-1.5 border flex flex-col w-full transition-all ${
                isLight
                  ? 'bg-neutral-100/75 border-neutral-200/90'
                  : 'bg-neutral-900/55 border-neutral-800/90'
              }`}
            >
              {BGM_SCENE_ITEMS.map((item) => {
                const isSceneChecked = Boolean(bgmScenes[item.key]);
                return (
                  <SettingActionRow
                    key={item.key}
                    icon={item.icon}
                    title={item.label}
                    description={item.description}
                    bordered={false}
                    onAction={() => setBgmSceneEnabled(item.key, !isSceneChecked)}
                    hoverDescription={`${item.label}: ${item.description}.`}
                    onHover={(desc) => desc && onHover(desc)}
                    onLeave={onLeave}
                    isLight={isLight}
                    rightSlot={
                      <Checkbox
                        checked={isSceneChecked}
                        onCheckedChange={(checked) => setBgmSceneEnabled(item.key, checked)}
                        variant="neutral"
                        isLight={isLight}
                      />
                    }
                  />
                );
              })}

              <SettingSliderRow
                icon={Timer}
                label="Fade-In / Fade-Out Duration"
                description="Smooth volume ramp duration when enabling, disabling, playing, or pausing Background Music (0.1s – 3.0s)"
                value={bgmFadeDurationSec}
                min={0.1}
                max={3.0}
                step={0.1}
                unit="s"
                bordered={false}
                developerMode={developerMode}
                onChange={(next) =>
                  updateTunerConfig({
                    bgmFadeDurationSec: Math.max(0.1, Math.min(3.0, Number(next) || 2.0)),
                  })
                }
                hoverDescription="Adjust the smooth fade-in and fade-out duration (0.1s to 3.0s, synced with Spatial Audio & Anthem Tuner) when playing, pausing, or toggling Background Music."
                onHover={(desc) => desc && onHover(desc)}
                onLeave={onLeave}
                isLight={isLight}
              />
            </div>
          )}
        </div>
      </>
    );
  });

BgmFolderAndSceneConfigSection.displayName = 'BgmFolderAndSceneConfigSection';
