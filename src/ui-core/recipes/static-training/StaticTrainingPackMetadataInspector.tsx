import React from 'react';
import { Target } from 'lucide-react';
import type { StaticTrainingPackSummary } from './staticTrainingPackFilterLogic';
import {
  StaticTrainingPackInspectorActions,
  type StaticTrainingPackActionCallbacks,
  type StaticTrainingPackDownCounterControl,
} from './StaticTrainingPackInspectorActions';
import {
  StaticTrainingPackTagsAndAuthorSection,
  type StaticTrainingPackMetadataDraft,
} from './StaticTrainingPackTagsAndAuthorSection';

export type {
  StaticTrainingPackActionCallbacks,
  StaticTrainingPackDownCounterControl,
} from './StaticTrainingPackInspectorActions';
export type { StaticTrainingPackMetadataDraft } from './StaticTrainingPackTagsAndAuthorSection';

export interface StaticTrainingPackMetadataInspectorProps {
  isLight: boolean;
  isDevMode?: boolean;
  selectedMeta: StaticTrainingPackSummary | null;
  draft: StaticTrainingPackMetadataDraft;
  downCounter: StaticTrainingPackDownCounterControl;
  actions: StaticTrainingPackActionCallbacks;
  applyNewKevpertBind?: boolean;
  onToggleApplyNewKevpertBind?: (val: boolean) => void;
  onUpdatePackTags?: (uuid: string, nextTags: string[]) => void;
  onHoverDesc: (desc: string | null) => void;
}

export const StaticTrainingPackMetadataInspector: React.FC<
  StaticTrainingPackMetadataInspectorProps
> = React.memo(
  ({
    isLight,
    isDevMode = false,
    selectedMeta,
    draft,
    downCounter,
    actions,
    applyNewKevpertBind = false,
    onToggleApplyNewKevpertBind,
    onUpdatePackTags,
    onHoverDesc,
  }) => {
    return (
      <div
        className={`flex-1 min-h-0 flex flex-col justify-between rounded-xl border p-3.5 overflow-y-auto ${
          isLight
            ? 'bg-white border-neutral-200/90 text-neutral-900'
            : 'bg-neutral-900/70 border-neutral-800 text-neutral-100'
        }`}
      >
        {selectedMeta ? (
          <>
            <div className="flex flex-col gap-2.5">
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={`text-[10px] font-mono uppercase tracking-wider ${
                      isLight ? 'text-neutral-500' : 'text-neutral-400'
                    }`}
                  >
                    {selectedMeta.sourcePackType || 'RCSPACK'} • {selectedMeta.itemCount}{' '}
                    {selectedMeta.itemCount === 1 ? 'SCENARIO' : 'SCENARIOS'}
                  </span>
                  <span
                    className={`text-[10px] font-mono truncate max-w-[210px] ${
                      isLight ? 'text-neutral-400' : 'text-neutral-500'
                    }`}
                    title={`/static-training-pack/${selectedMeta.uuid}`}
                  >
                    {selectedMeta.code
                      ? `Code: ${selectedMeta.code}`
                      : `ID: ${selectedMeta.uuid.slice(0, 8)}`}
                  </span>
                </div>

                <StaticTrainingPackTagsAndAuthorSection
                  isLight={isLight}
                  isDevMode={isDevMode}
                  selectedMeta={selectedMeta}
                  draft={draft}
                  applyNewKevpertBind={applyNewKevpertBind}
                  onToggleApplyNewKevpertBind={onToggleApplyNewKevpertBind}
                  onUpdatePackTags={onUpdatePackTags}
                  onHoverDesc={onHoverDesc}
                />
              </div>
            </div>

            <StaticTrainingPackInspectorActions
              isLight={isLight}
              selectedMeta={selectedMeta}
              downCounter={downCounter}
              actions={actions}
              onHoverDesc={onHoverDesc}
            />
          </>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-center opacity-60">
            <Target className="h-8 w-8 mb-2" />
            <span className="text-xs font-semibold">Select or Create a Training Pack</span>
          </div>
        )}
      </div>
    );
  }
);
StaticTrainingPackMetadataInspector.displayName = 'StaticTrainingPackMetadataInspector';
