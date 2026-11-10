import React from 'react';
import { CodeBlock } from '../../CodeBlock';

export interface EdgeInspectorReferenceMatrixProps {
  isLight: boolean;
}

export const EdgeInspectorReferenceMatrix: React.FC<EdgeInspectorReferenceMatrixProps> = ({
  isLight,
}) => {
  return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <CodeBlock
          isLight={isLight}
          title="1. EdgeInspectorDrawer (TAB) and Main Menu (ESC) Two orthogonal independent systems"
          code={`// 1. EdgeInspectorDrawer: Independent resident side inspection suite (z-30), Keep only top-right Collapse [TAB]
<EdgeInspectorDrawer
  isExpanded={isDrawerExpanded}
  onExpandedChange={setIsDrawerExpanded}
  shortcutKey="TAB" // TAB Dedicated key for controlling side inspection drawer storage and expansion, 0% Dim Background
  topOffset={72}
  bottomOffset={184}
>
  <Layer5StaticTrainingPackEditRecipe
    onCollapseDrawer={() => setIsDrawerExpanded(false)}
  />
</EdgeInspectorDrawer>

// 2. Main Menu: Independent central menu system (z-50), ESC Key exclusive control call/Off, Assume Exit Session Exit
{isEscMenuOpen && (
  <Layer1MainMenuRecipe
    onResume={() => setEscMenuRoute('none')}
    extraBottomAction={<MainMenuRow title="Exit Edit Mode" variant="danger" ... />}
  />
)}`}
        />

        <CodeBlock
          isLight={isLight}
          title="2. CollapsibleNumberedRailList (click #04 Enter Detail Track · Click current again #04 Back to List · No top-bar back button needed)"
          code={`// src/ui-core/compounds/CollapsibleNumberedRailList.tsx
<CollapsibleNumberedRailList
  isCollapsedToRail={isInspectingShot} // default false (Full list as initial state)
  items={railItems}
  selectedIndex={safeIndex}
  collapsedRailWidth={60} // #01 Capsule Pinning w-[50px], Outer container flattened left to 60px
  onSelectItem={(idx) => {
    if (!isInspectingShot) {
      setSelectedShotIndex(idx);
      setIsInspectingShot(true); // Click any item in list mode -> Morph into detail track state
    } else if (idx === safeIndex) {
      setIsInspectingShot(false); // Track state re-click on currently activated #number -> Morph back to full list state
    } else {
      setSelectedShotIndex(idx); // Track state click other #number -> Directly switch current edit target, No state transition trigger
    }
  }}
  onAddNew={handleAddNewShot}
  onShowHelp={handleShowHelp}
  onDuplicate={handleDuplicate}
  onHoverDescription={setHoveredDesc}
  detailContent={<StaticTrainingShotInspectorView ... />}
/>`}
        />
      </div>
  );
};
