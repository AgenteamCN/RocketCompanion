import React from 'react';
import {
  RotateCcw,
  Maximize2,
  Check,
  Ruler,
  Compass,
  LogOut,
} from 'lucide-react';
import { Button } from '../../../ui-core/primitives/Button';
import { KeycapBadge } from '../../../ui-core/primitives/KeycapBadge';
import { SliderControl } from '../../../ui-core/primitives/SliderControl';
import { SegmentedSwitch } from '../../../ui-core/primitives/SegmentedSwitch';
import { MainMenuRow } from '../../../ui-core/layout/MainMenuRow';
import { MenuDivider } from '../../../ui-core/layout/MenuContainer';
import type { EdgeDrawerSide } from '../../../ui-core/navigation/EdgeInspectorDrawer';
import {
  type EditSubMode,
  type StaticTrainingShotItem,
} from '../../../ui-core/recipes/static-training/staticTrainingTypes';
import { openStaticTrainingExitConfirmDialogue } from '../../../ui-core/recipes/StaticTrainingShotInspectorDrawer';
import { Layer1MainMenuRecipe } from '../../../ui-core/recipes/Layer1MainMenuRecipe';
import { Layer2PlayRecipe } from '../../../ui-core/recipes/Layer2PlayRecipe';
import { Layer2GarageRecipe } from '../../../ui-core/recipes/Layer2GarageRecipe';
import { Layer2SettingsRecipe } from '../../../ui-core/recipes/Layer2SettingsRecipe';
import { StoreSnapshotScope } from '../../../ui-core/stores/storeSnapshotScope';

export type EscMenuRoute = 'none' | 'main-menu' | 'play' | 'garage' | 'settings';

export interface EdgeInspectorDrawerLayoutSummary {
  isDrawerExpanded: boolean;
  expandedWidth: number;
  collapsedWidth: number;
  drawerSide: EdgeDrawerSide;
}

export interface EdgeInspectorSceneOverlayAndMenuProps {
  isLight: boolean;
  editSubMode: EditSubMode;
  safeIndex: number;
  activeShot: StaticTrainingShotItem;
  drawerLayout: EdgeInspectorDrawerLayoutSummary;
  isEscMenuOpen: boolean;
  escMenuRoute: EscMenuRoute;
  setEscMenuRoute: React.Dispatch<React.SetStateAction<EscMenuRoute>>;
  showToast: (msg: string) => void;
}

export const EdgeInspectorSceneOverlayAndMenu: React.FC<
  EdgeInspectorSceneOverlayAndMenuProps
> = ({
  isLight,
  editSubMode,
  safeIndex,
  activeShot,
  drawerLayout: { isDrawerExpanded, expandedWidth, collapsedWidth, drawerSide },
  isEscMenuOpen,
  escMenuRoute,
  setEscMenuRoute,
  showToast,
}) => {
  return (
    <>
      <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center pr-0 lg:pr-48">
        <div
          className={`px-4 py-3 rounded-2xl border backdrop-blur-md flex flex-col items-center gap-1.5 transition-all ${
            isLight
              ? 'bg-white/80 border-neutral-300 text-neutral-900 shadow-lg'
              : 'bg-neutral-950/75 border-neutral-800 text-neutral-100 shadow-xl'
          }`}
        >
          <div className="flex items-center gap-2 text-xs font-mono font-bold text-amber-500">
            <Compass className="h-4 w-4 animate-spin" style={{ animationDuration: '9s' }} />
            <span>[3D Arena Live Scene · Sub-Mode: {editSubMode.toUpperCase()}]</span>
          </div>
          <div className="text-xs font-bold">
            Active Shot #{String(safeIndex + 1).padStart(2, '0')}: {activeShot.name}
          </div>
          <div className="text-[11px] font-mono opacity-75">
            Car Pos: [{Math.round(activeShot.car.location[0])}, {Math.round(activeShot.car.location[1])}, {Math.round(activeShot.car.location[2])}] • Speed: {Math.round(activeShot.car.speed)} UU/s • Ball: {activeShot.ball.kickoffState ? 'FREEZE' : `${Math.round(activeShot.ball.speed)} UU/s`}
          </div>
          <div className="text-[10px] text-emerald-500 font-mono mt-0.5">
            [*] [TAB] Independent Control Edge Inspector Drawer · [ESC] Independent central main menu (Menu and Inspector Two systems do not conflict)
          </div>
        </div>
      </div>

      {isEscMenuOpen && (
        <div
          data-ui-element="esc-main-menu-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setEscMenuRoute('none');
            }
          }}
          style={{
            backgroundColor:
              escMenuRoute === 'main-menu' ? 'transparent' : 'rgba(0, 0, 0, 0.55)',
            transition: 'background-color 220ms cubic-bezier(0.2, 0.8, 0.25, 1)',
          }}
          className="absolute inset-0 z-50 flex items-center justify-center p-6 pointer-events-auto"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="max-w-full max-h-full flex items-center justify-center"
          >
            {escMenuRoute === 'main-menu' && (
              <StoreSnapshotScope
                overrides={{
                  appStore: {
                    extraBottomAction: (
                      <>
                        <MenuDivider isLight={isLight} />
                        <MainMenuRow
                          icon={<LogOut className="h-5 w-5" />}
                          title="Exit Edit Mode"
                          subtitle="Save or discard training pack edits & leave editor"
                          variant="danger"
                          isLight={isLight}
                          onClick={() => {
                            openStaticTrainingExitConfirmDialogue((action) => {
                              setEscMenuRoute('none');
                              showToast(
                                action === 'save'
                                  ? '[ok] Saved changes and exited via main menu Edit Mode'
                                  : '[!] Unsaved changes ignored and exited via the main menu Edit Mode'
                              );
                            });
                          }}
                        />
                      </>
                    ),
                  },
                }}
              >
                <Layer1MainMenuRecipe
                  isLight={isLight}
                  onBack={() => {
                    setEscMenuRoute('none');
                    showToast('Resume: Back 3D Training pack edit scene');
                  }}
                  onTabChange={(target) => {
                    if (target === 'play') setEscMenuRoute('play');
                    else if (target === 'garage') setEscMenuRoute('garage');
                    else if (target.startsWith('settings')) setEscMenuRoute('settings');
                  }}
                />
              </StoreSnapshotScope>
            )}

            {escMenuRoute === 'play' && (
              <Layer2PlayRecipe
                isLight={isLight}
                onBack={() => setEscMenuRoute('main-menu')}
                onTabChange={(mode) => {
                  setEscMenuRoute('none');
                  showToast(`Switched play mode from main menu: ${mode}`);
                }}
              />
            )}

            {escMenuRoute === 'garage' && (
              <Layer2GarageRecipe
                isLight={isLight}
                onBack={() => setEscMenuRoute('main-menu')}
              />
            )}

            {escMenuRoute === 'settings' && (
              <Layer2SettingsRecipe
                isLight={isLight}
                onBack={() => setEscMenuRoute('main-menu')}
              />
            )}
          </div>
        </div>
      )}

      <div className="absolute bottom-4 left-4 z-20 flex items-center gap-2 text-xs font-mono px-3 py-1.5 rounded-xl border bg-black/65 text-neutral-200 backdrop-blur border-white/10">
        <span>Drawer:</span>
        <strong className={isDrawerExpanded ? 'text-amber-400' : 'text-emerald-400'}>
          {isDrawerExpanded
            ? `EXPANDED (${expandedWidth}px · ${drawerSide.toUpperCase()})`
            : `COLLAPSED (${collapsedWidth}px Pill)`}
        </strong>
        <span>|</span>
        <span>Menu:</span>
        <strong className={isEscMenuOpen ? 'text-rose-400' : 'text-neutral-400'}>
          {isEscMenuOpen ? escMenuRoute.toUpperCase() : 'CLOSED'}
        </strong>
        <span>|</span>
        <span className="flex items-center gap-1">
          Drawer: <KeycapBadge shortcut="TAB" size="sm" isLight={false} />
        </span>
        <span className="flex items-center gap-1">
          Menu: <KeycapBadge shortcut="ESC" size="sm" isLight={false} />
        </span>
      </div>
    </>
  );
};

export interface EdgeInspectorDrawerGeometryControls {
  drawerSide: EdgeDrawerSide;
  setDrawerSide: (side: EdgeDrawerSide) => void;
  expandedWidth: number;
  setExpandedWidth: (w: number) => void;
  collapsedWidth: number;
  setCollapsedWidth: (w: number) => void;
  topOffset: number;
  setTopOffset: (t: number) => void;
  bottomOffset: number;
  setBottomOffset: (b: number) => void;
}

export interface EdgeInspectorTunerControlsProps {
  isLight: boolean;
  feedbackToast: string | null;
  handleExportLayoutSnapshot: () => void;
  isInspectingShot: boolean;
  setIsInspectingShot: React.Dispatch<React.SetStateAction<boolean>>;
  isDrawerExpanded: boolean;
  setIsDrawerExpanded: React.Dispatch<React.SetStateAction<boolean>>;
  isEscMenuOpen: boolean;
  setEscMenuRoute: React.Dispatch<React.SetStateAction<EscMenuRoute>>;
  handleResetParams: () => void;
  geometry: EdgeInspectorDrawerGeometryControls;
}

export const EdgeInspectorTunerControls: React.FC<
  EdgeInspectorTunerControlsProps
> = ({
  isLight,
  feedbackToast,
  handleExportLayoutSnapshot,
  isInspectingShot,
  setIsInspectingShot,
  isDrawerExpanded,
  setIsDrawerExpanded,
  isEscMenuOpen,
  setEscMenuRoute,
  handleResetParams,
  geometry: {
    drawerSide,
    setDrawerSide,
    expandedWidth,
    setExpandedWidth,
    collapsedWidth,
    setCollapsedWidth,
    topOffset,
    setTopOffset,
    bottomOffset,
    setBottomOffset,
  },
}) => {
  return (
      <div
        className={`p-4 rounded-2xl border flex flex-col gap-3.5 transition-colors ${
          isLight
            ? 'bg-white border-neutral-200/90 shadow-2xs'
            : 'bg-neutral-900/70 border-neutral-800'
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-neutral-200/70 dark:border-neutral-800">
          <div className="flex items-center gap-2 flex-wrap">
            <Maximize2 className="h-3.5 w-3.5 text-amber-500 shrink-0" />
            <span className="text-xs font-bold">
              EdgeInspectorDrawer Geometry and HUD Avoidance parameter tuner
            </span>
            <span className="text-[11px] font-mono text-neutral-500 dark:text-neutral-400">
              Bottom-right CircularBoostGauge Fixed size 148×148px (bottom: 20px, right: 24px) → default bottomOffset = 184px
            </span>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {feedbackToast && (
              <span className="text-xs font-mono font-bold text-emerald-500 flex items-center gap-1">
                <Check className="h-3.5 w-3.5" /> {feedbackToast}
              </span>
            )}
            <button
              type="button"
              onClick={handleExportLayoutSnapshot}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-mono font-medium transition-all active:scale-95 cursor-pointer bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700 text-neutral-800 dark:text-neutral-100 border-neutral-300 dark:border-neutral-700 shadow-2xs"
              title="Print and copy current Edge Inspector Size of drawer and left numbering track, Padding, Four-side symmetry data"
            >
              <Ruler className="h-3.5 w-3.5 text-amber-500" />
              <span>Export current preview layout data</span>
            </button>
            <Button
              size="sm"
              variant={isInspectingShot ? 'secondary' : 'primary'}
              isLight={isLight}
              onClick={() => setIsInspectingShot((v) => !v)}
            >
              {isInspectingShot
                ? 'Switch to full list state (Shot List)'
                : 'Switch to track view mode (Edit Shot)'}
            </Button>
            <Button
              size="sm"
              variant="outline"
              isLight={isLight}
              onClick={() => setIsDrawerExpanded((v) => !v)}
            >
              {isDrawerExpanded
                ? 'Store in edge pill [TAB]'
                : 'Expand side inspection panel [TAB]'}
            </Button>
            <Button
              size="sm"
              variant={isEscMenuOpen ? 'primary' : 'outline'}
              isLight={isLight}
              onClick={() =>
                setEscMenuRoute((prev) => (prev === 'none' ? 'main-menu' : 'none'))
              }
            >
              {isEscMenuOpen ? 'Close Main Menu [ESC]' : 'Open Main Menu [ESC]'}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              isLight={isLight}
              icon={<RotateCcw className="h-3 w-3" />}
              onClick={handleResetParams}
            >
              Reset to Defaults
            </Button>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 items-center">
          <div className="flex flex-col gap-1">
            <span
              className={`text-[11px] font-semibold ${
                isLight ? 'text-neutral-600' : 'text-neutral-400'
              }`}
            >
              Dock to Edge (side)
            </span>
            <SegmentedSwitch
              value={drawerSide}
              onValueChange={(v) => setDrawerSide(v as EdgeDrawerSide)}
              isLight={isLight}
              options={[
                { value: 'right', label: 'Right (Default Right)' },
                { value: 'left', label: 'Left (left)' },
              ]}
            />
          </div>
          <SliderControl
            label="Expanded Width (expandedW)"
            value={expandedWidth}
            min={440}
            max={620}
            step={10}
            unit="px"
            colorScheme="amber"
            onChange={setExpandedWidth}
            isLight={isLight}
          />
          <SliderControl
            label="Collapsed Width (collapsedW)"
            value={collapsedWidth}
            min={72}
            max={130}
            step={4}
            unit="px"
            colorScheme="amber"
            onChange={setCollapsedWidth}
            isLight={isLight}
          />
          <SliderControl
            label="Top Offset (topOffset)"
            value={topOffset}
            min={16}
            max={140}
            step={4}
            unit="px"
            colorScheme="sky"
            onChange={setTopOffset}
            isLight={isLight}
          />
          <SliderControl
            label="Bottom Offset (bottomOffset)"
            value={bottomOffset}
            min={24}
            max={240}
            step={4}
            unit="px"
            colorScheme="emerald"
            onChange={setBottomOffset}
            isLight={isLight}
          />
        </div>
      </div>
  );
};
