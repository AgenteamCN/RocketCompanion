import React from 'react';
import { Check, Plus, Upload, X } from 'lucide-react';

export interface StaticTrainingCreatePackDraft {
  isCreatingPack: boolean;
  setIsCreatingPack: React.Dispatch<React.SetStateAction<boolean>>;
  newTitle: string;
  setNewTitle: (val: string) => void;
  newDescription: string;
  setNewDescription: (val: string) => void;
  onCreateSubmit: () => void;
}

export interface StaticTrainingPackToolbarProps {
  isLight: boolean;
  isDevMode?: boolean;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  createDraft: StaticTrainingCreatePackDraft;
  onImportClick: () => void;
  onImportFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onHoverDesc: (desc: string | null) => void;
}

export const StaticTrainingPackToolbar: React.FC<StaticTrainingPackToolbarProps> = React.memo(
  ({
    isLight,
    isDevMode = false,
    fileInputRef,
    createDraft: {
      isCreatingPack,
      setIsCreatingPack,
      newTitle,
      setNewTitle,
      newDescription,
      setNewDescription,
      onCreateSubmit,
    },
    onImportClick,
    onImportFileChange,
    onHoverDesc,
  }) => {
    const acceptedFormats = isDevMode
      ? '.rcspack,.RCSPack,.rcspacke,.RCSPackE,.rlrcspack,.RLRCSPack,.Tem,.tem,.zip,.ZIP,.gz,.json'
      : '.rcspack,.RCSPack,.rcspacke,.RCSPackE,.zip,.ZIP';

    return (
      <div className="flex flex-col gap-2 shrink-0">
        <div className="grid grid-cols-2 gap-2">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={acceptedFormats}
            onChange={onImportFileChange}
            className="hidden"
          />
          <button
            type="button"
            onClick={onImportClick}
            onMouseEnter={() =>
              onHoverDesc(
                isDevMode
                  ? 'Import single or multiple .RCSPack / .RCSPackE / .RLRCSPack / .Tem files or a batch .zip archive.'
                  : 'Import single or multiple .RCSPack / .RCSPackE files or a batch .zip archive.'
              )
            }
            onMouseLeave={() => onHoverDesc(null)}
            className={`flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[11px] font-semibold transition-all cursor-pointer active:scale-95 ${
              isLight
                ? 'bg-neutral-100 hover:bg-neutral-200 border-neutral-300 text-neutral-800'
                : 'bg-neutral-800 hover:bg-neutral-700 border-neutral-700 text-neutral-200'
            }`}
          >
            <Upload className="h-3.5 w-3.5" />
            <span>Import Pack / .ZIP</span>
          </button>
          <button
            type="button"
            onClick={() => setIsCreatingPack((v) => !v)}
            onMouseEnter={() =>
              onHoverDesc(
                'Create a new Static Training Pack with custom Title and Description.'
              )
            }
            onMouseLeave={() => onHoverDesc(null)}
            className={`flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[11px] font-semibold transition-all cursor-pointer active:scale-95 ${
              isLight
                ? 'bg-neutral-900 hover:bg-neutral-800 border-neutral-900 text-white'
                : 'bg-white hover:bg-neutral-200 border-white text-neutral-900'
            }`}
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Create Pack</span>
          </button>
        </div>

        {isCreatingPack && (
          <div
            className={`p-3 rounded-xl border flex flex-col gap-2 shrink-0 ${
              isLight
                ? 'bg-neutral-100/90 border-neutral-300 text-neutral-900'
                : 'bg-neutral-900/90 border-neutral-700 text-neutral-100'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold tracking-tight">
                NEW STATIC TRAINING PACK
              </span>
              <button
                type="button"
                onClick={() => setIsCreatingPack(false)}
                className="p-1 rounded hover:bg-neutral-500/20 cursor-pointer"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <input
                type="text"
                placeholder="Pack Title (e.g. Aerial Redirects)"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                className={`px-2.5 py-1.5 rounded-lg border text-xs outline-none ${
                  isLight
                    ? 'bg-white border-neutral-300 text-neutral-900'
                    : 'bg-neutral-800 border-neutral-700 text-neutral-100'
                }`}
              />
              <input
                type="text"
                placeholder="Description..."
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                className={`px-2.5 py-1.5 rounded-lg border text-xs outline-none ${
                  isLight
                    ? 'bg-white border-neutral-300 text-neutral-900'
                    : 'bg-neutral-800 border-neutral-700 text-neutral-100'
                }`}
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsCreatingPack(false)}
                className={`px-3 py-1 rounded-lg border text-xs font-medium cursor-pointer ${
                  isLight
                    ? 'bg-white border-neutral-300 text-neutral-700'
                    : 'bg-neutral-800 border-neutral-700 text-neutral-300'
                }`}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={onCreateSubmit}
                className={`px-3 py-1 rounded-lg border text-xs font-bold cursor-pointer flex items-center gap-1 ${
                  isLight
                    ? 'bg-neutral-900 border-neutral-900 text-white'
                    : 'bg-white border-white text-neutral-900'
                }`}
              >
                <Check className="h-3.5 w-3.5" />
                <span>Create</span>
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }
);
StaticTrainingPackToolbar.displayName = 'StaticTrainingPackToolbar';
