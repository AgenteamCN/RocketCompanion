import React, { useRef, useState } from 'react';
import {
  FolderOpen,
  Image as ImageIcon,
  ChevronLeft,
  ChevronRight,
  Trash2,
  Download,
  Copy,
  Check,
  Upload,
  RotateCcw,
} from 'lucide-react';
import { ToggleSwitch } from '../../../primitives/ToggleSwitch';
import {
  useReferenceOverlayStore,
  DEFAULT_REFERENCE_RESOLUTION,
  REFERENCE_RESOLUTION_REF_SPEC,
  normalizeResolutionDimensionsKey,
  type ReferenceImageItem,
} from '../../../stores/referenceOverlayStore';
import { ReferenceOverlayTransformSliders } from './ReferenceOverlayTransformSliders';

type FileWithRelativePath = File & { webkitRelativePath?: string };

export interface ReferenceOverlayCardProps {
  isLight: boolean;
  cardClass: string;
}

export const ReferenceOverlayCard: React.FC<ReferenceOverlayCardProps> = ({
  isLight,
  cardClass,
}) => {
  const folderInputRef = useRef<HTMLInputElement | null>(null);
  const importJsonInputRef = useRef<HTMLInputElement | null>(null);
  const [loadingImages, setLoadingImages] = useState(false);
  const [copiedOverlayJson, setCopiedOverlayJson] = useState(false);

  const overlayEnabled = useReferenceOverlayStore((s) => s.enabled);
  const setOverlayEnabled = useReferenceOverlayStore((s) => s.setEnabled);
  const folderName = useReferenceOverlayStore((s) => s.folderName);
  const images = useReferenceOverlayStore((s) => s.images);
  const activeIndex = useReferenceOverlayStore((s) => s.activeIndex);
  const activeResolutionKey = useReferenceOverlayStore((s) => s.activeResolutionKey);
  const setFolderImages = useReferenceOverlayStore((s) => s.setFolderImages);
  const clearImages = useReferenceOverlayStore((s) => s.clearImages);
  const setActiveIndex = useReferenceOverlayStore((s) => s.setActiveIndex);
  const stepImage = useReferenceOverlayStore((s) => s.stepImage);
  const setActiveResolutionKey = useReferenceOverlayStore((s) => s.setActiveResolutionKey);
  const updateProfile = useReferenceOverlayStore((s) => s.updateProfile);
  const resetProfile = useReferenceOverlayStore((s) => s.resetProfile);
  const exportProfilesJson = useReferenceOverlayStore((s) => s.exportProfilesJson);
  const exportActiveProfileJson = useReferenceOverlayStore((s) => s.exportActiveProfileJson);
  const importProfilesJson = useReferenceOverlayStore((s) => s.importProfilesJson);

  const activeImage = images[activeIndex] || null;
  const effectiveResKey =
    activeResolutionKey !== 'ALL'
      ? activeResolutionKey
      : activeImage
      ? `${activeImage.width}x${activeImage.height}`
      : DEFAULT_REFERENCE_RESOLUTION;

  const activeProfile = useReferenceOverlayStore((s) => s.getProfile(effectiveResKey));

  const resolutionCounts = React.useMemo(() => {
    const counts = new Map<string, number>();
    for (const img of images) {
      const k = `${img.width}x${img.height}`;
      counts.set(k, (counts.get(k) || 0) + 1);
    }
    return counts;
  }, [images]);

  const extraResolutions = React.useMemo(() => {
    return Array.from(resolutionCounts.entries()).filter(
      ([rk]) => rk !== DEFAULT_REFERENCE_RESOLUTION
    );
  }, [resolutionCounts]);

  const defaultResCount = resolutionCounts.get(DEFAULT_REFERENCE_RESOLUTION) || 0;

  const filteredImages = React.useMemo(() => {
    if (activeResolutionKey === 'ALL') return images.map((img, idx) => ({ img, idx }));
    const targetDims = normalizeResolutionDimensionsKey(activeResolutionKey);
    const matched = images
      .map((img, idx) => ({ img, idx }))
      .filter(({ img }) => `${img.width}x${img.height}` === targetDims);
    return matched.length > 0 ? matched : images.map((img, idx) => ({ img, idx }));
  }, [images, activeResolutionKey]);

  const handleFolderSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;

    setLoadingImages(true);
    try {
      const pngFiles = Array.from<File>(fileList)
        .filter((f) => f.type === 'image/png' || f.name.toLowerCase().endsWith('.png'))
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

      let detectedFolder = 'Selected Folder';
      if (pngFiles.length > 0) {
        const rel = (pngFiles[0] as FileWithRelativePath).webkitRelativePath || '';
        if (rel.includes('/')) detectedFolder = rel.split('/')[0];
      }

      const loadedItems: ReferenceImageItem[] = [];
      for (let i = 0; i < pngFiles.length; i++) {
        const file = pngFiles[i];
        const url = URL.createObjectURL(file);
        const dims = await new Promise<{ width: number; height: number }>((resolve) => {
          const img = new Image();
          img.onload = () =>
            resolve({ width: img.naturalWidth || 4112, height: img.naturalHeight || 2658 });
          img.onerror = () => resolve({ width: 4112, height: 2658 });
          img.src = url;
        });

        loadedItems.push({
          id: `${file.name}-${i}-${file.size}`,
          name: file.name,
          relativePath: (file as FileWithRelativePath).webkitRelativePath || file.name,
          url,
          width: dims.width,
          height: dims.height,
          sizeBytes: file.size,
        });
      }

      setFolderImages(detectedFolder, loadedItems);
    } finally {
      setLoadingImages(false);
      e.target.value = '';
    }
  };

  const handleCopyOverlayJson = async () => {
    try {
      const payload = exportActiveProfileJson(effectiveResKey);
      await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
      setCopiedOverlayJson(true);
      setTimeout(() => setCopiedOverlayJson(false), 2000);
    } catch (err) {
      console.warn('[ReferenceOverlayCard] Copy overlay profile JSON failed:', err);
    }
  };

  const handleDownloadOverlayJson = () => {
    try {
      const payload = exportProfilesJson();
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `hitbox-reference-overlay-${effectiveResKey}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.warn('[ReferenceOverlayCard] Download overlay JSON failed:', err);
    }
  };

  const handleImportOverlayJsonFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      importProfilesJson(JSON.parse(await file.text()));
    } catch (err) {
      console.warn('[ReferenceOverlayCard] Failed to import overlay JSON:', err);
    } finally {
      e.target.value = '';
    }
  };

  const btnNeutral = isLight
    ? 'bg-white hover:bg-neutral-100 border-neutral-300 text-neutral-700'
    : 'bg-neutral-800 hover:bg-neutral-700 border-neutral-700 text-neutral-200';

  return (
    <div className={cardClass}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <ImageIcon className="h-3.5 w-3.5 text-amber-500 shrink-0" />
          <span className="font-bold text-[11px] text-amber-500 truncate">
            Reference PNG Folder Overlay (z-4 · Normal Alpha Mix)
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <div className="flex items-center gap-1">
            <span className="text-[10px] opacity-75">Invert RGB</span>
            <ToggleSwitch
              checked={activeProfile.invertImage}
              onChange={(invertImage) => updateProfile({ invertImage }, effectiveResKey)}
              isLight={isLight}
            />
          </div>
          <div className="flex items-center gap-1">
            <span className="text-[10px] font-mono opacity-75">Overlay</span>
            <ToggleSwitch
              checked={overlayEnabled}
              onChange={(checked) => setOverlayEnabled(checked)}
              isLight={isLight}
            />
          </div>
        </div>
      </div>

      <input
        ref={folderInputRef}
        type="file"
        accept=".png,image/png"
        multiple
        {...({ webkitdirectory: '', directory: '' } as React.InputHTMLAttributes<HTMLInputElement>)}
        onChange={handleFolderSelect}
        className="hidden"
      />
      <input
        ref={importJsonInputRef}
        type="file"
        accept=".json,application/json"
        onChange={handleImportOverlayJsonFile}
        className="hidden"
      />

      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={() => folderInputRef.current?.click()}
          className={`flex-1 min-w-[150px] px-2.5 py-1.5 rounded-lg border text-[11px] font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-colors ${
            isLight
              ? 'bg-amber-500 hover:bg-amber-400 border-amber-500 text-neutral-950'
              : 'bg-amber-500 hover:bg-amber-400 border-amber-400 text-neutral-950'
          }`}
        >
          <FolderOpen className="h-3.5 w-3.5" />
          <span>
            {loadingImages
              ? 'Reading PNGs...'
              : images.length > 0
              ? `Folder: ${folderName} (${images.length} PNG)`
              : 'Select PNG Reference Folder'}
          </span>
        </button>

        {images.length > 0 && (
          <button
            type="button"
            onClick={clearImages}
            title="Clear loaded reference images"
            className={`px-2 py-1.5 rounded-lg border text-[10px] font-semibold flex items-center gap-1 cursor-pointer transition-colors ${
              isLight
                ? 'bg-white hover:bg-rose-50 border-neutral-300 text-rose-600'
                : 'bg-neutral-800 hover:bg-rose-950/40 border-neutral-700 text-rose-400'
            }`}
          >
            <Trash2 className="h-3 w-3" />
          </button>
        )}

        <button
          type="button"
          onClick={handleCopyOverlayJson}
          title="Copy active resolution overlay calibration profile JSON"
          className={`px-2 py-1.5 rounded-lg border text-[10px] font-semibold flex items-center gap-1 cursor-pointer transition-colors ${
            copiedOverlayJson
              ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400'
              : btnNeutral
          }`}
        >
          {copiedOverlayJson ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          <span>{copiedOverlayJson ? 'Copied' : 'Copy Profile JSON'}</span>
        </button>

        <button
          type="button"
          onClick={handleDownloadOverlayJson}
          title="Export overlay calibration profiles .JSON"
          className={`px-2 py-1.5 rounded-lg border text-[10px] font-semibold flex items-center gap-1 cursor-pointer transition-colors ${btnNeutral}`}
        >
          <Download className="h-3 w-3" />
          <span>Export</span>
        </button>

        <button
          type="button"
          onClick={() => importJsonInputRef.current?.click()}
          title="Import overlay calibration .JSON"
          className={`px-2 py-1.5 rounded-lg border text-[10px] font-semibold flex items-center gap-1 cursor-pointer transition-colors ${btnNeutral}`}
        >
          <Upload className="h-3 w-3" />
          <span>Import</span>
        </button>
      </div>

      {/* Resolution Specialization Filter & Image Switcher */}
      <div
        className={`p-2 rounded-lg border flex flex-col gap-1.5 ${
          isLight ? 'bg-white border-neutral-200' : 'bg-neutral-950/60 border-neutral-800'
        }`}
      >
        <div className="flex items-center justify-between gap-2 text-[10px]">
          <span className="font-semibold opacity-80">
            Target Resolution Profile (Default: 4112×2658 Big):
          </span>
          <div className="flex items-center gap-1">
            <select
              value={activeResolutionKey}
              onChange={(e) => setActiveResolutionKey(e.target.value)}
              className={`px-1.5 py-0.5 rounded border font-mono text-[10px] outline-none ${
                isLight
                  ? 'bg-neutral-50 border-neutral-300 text-neutral-800'
                  : 'bg-neutral-900 border-neutral-700 text-amber-400'
              }`}
            >
              <option value={DEFAULT_REFERENCE_RESOLUTION}>
                4112x2658 (Big) [{defaultResCount}]
              </option>
              <option value={REFERENCE_RESOLUTION_REF_SPEC}>
                4112x2658 (Ref Spec) [{defaultResCount}]
              </option>
              {extraResolutions.map(([rk, count]) => (
                <option key={rk} value={rk}>
                  {rk} [{count}]
                </option>
              ))}
              <option value="ALL">All Resolutions [{images.length}]</option>
            </select>

            <button
              type="button"
              onClick={() => resetProfile(effectiveResKey)}
              title={`Reset calibration profile for ${effectiveResKey}`}
              className={`px-1.5 py-0.5 rounded border text-[10px] font-mono flex items-center gap-0.5 cursor-pointer ${
                isLight
                  ? 'bg-neutral-100 hover:bg-neutral-200 border-neutral-300 text-neutral-700'
                  : 'bg-neutral-800 hover:bg-neutral-700 border-neutral-700 text-neutral-300'
              }`}
            >
              <RotateCcw className="h-2.5 w-2.5" />
              <span>Reset</span>
            </button>
          </div>
        </div>

        {images.length > 0 ? (
          <div className="flex items-center gap-1.5 pt-0.5">
            <button
              type="button"
              onClick={() => stepImage(-1)}
              className={`p-1 rounded border cursor-pointer ${
                isLight
                  ? 'bg-neutral-100 hover:bg-neutral-200 border-neutral-300'
                  : 'bg-neutral-800 hover:bg-neutral-700 border-neutral-700'
              }`}
              title="Previous PNG in folder"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>

            <select
              value={activeIndex}
              onChange={(e) => setActiveIndex(Number(e.target.value))}
              className={`flex-1 min-w-0 px-2 py-1 rounded border font-mono text-[11px] truncate outline-none ${
                isLight
                  ? 'bg-neutral-50 border-neutral-300 text-neutral-800'
                  : 'bg-neutral-900 border-neutral-700 text-neutral-100'
              }`}
            >
              {filteredImages.map(({ img, idx }, pos) => (
                <option key={img.id} value={idx}>
                  [{pos + 1}/{filteredImages.length}] {img.name} ({img.width}×{img.height})
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={() => stepImage(1)}
              className={`p-1 rounded border cursor-pointer ${
                isLight
                  ? 'bg-neutral-100 hover:bg-neutral-200 border-neutral-300'
                  : 'bg-neutral-800 hover:bg-neutral-700 border-neutral-700'
              }`}
              title="Next PNG in folder"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : (
          <div className="text-[10px] font-mono opacity-60 py-0.5">
            No folder loaded yet. Select a folder containing reference PNG screenshots (e.g. 4112×2658) to overlay on top of the 3D viewport.
          </div>
        )}
      </div>

      {/* Opacity, Scale & Offset Controls */}
      <ReferenceOverlayTransformSliders
        activeProfile={activeProfile}
        effectiveResKey={effectiveResKey}
        updateProfile={updateProfile}
        isLight={isLight}
      />
    </div>
  );
};
