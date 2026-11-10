import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  Keyboard,
  Gamepad2,
  RotateCcw,
  Check,
  Info,
} from 'lucide-react';
import { SettingActionRow } from '../compounds/SettingActionRow';
import { PanelContainer, PanelHeader, PanelContent } from '../layout/Panel';
import { PanelFooter } from '../layout/PanelFooter';
import { resolveCalibratedSurfaceSizing } from '../manifest/surfaceCalibration';
import type { StandardSurfaceProps, SurfaceMeta } from '../manifest/surfaceMetaTypes';
import { useAppStore } from '../stores/appStore';
import { useMenuLayoutStore } from '../stores/menuLayoutStore';
import { useSettingActionRowStore } from '../stores/settingRowStore';
import { useScopedStore } from '../stores/storeSnapshotScope';
import {
  type ActionBinding,
  INITIAL_BINDINGS,
  type ListeningTarget,
  KeybindingActionRow,
} from './keybinding/KeybindingActionRow';
import {
  ACTION_CATEGORY_MAP,
  KEYBINDING_CATEGORIES,
  type KeybindingActionCategory,
  loadHydratedActionBindings,
  syncActionBindingsToEngine,
} from './keybinding/keybindingEngineSync';
import { useKeybindingCapture } from './keybinding/useKeybindingCapture';

export const SURFACE_META: SurfaceMeta = {
  id: 'recipe:Layer3KeybindingsRecipe',
  title: 'Key Bindings',
  subtitle: '3-Column Keyboard & Controller Action Mapping Table with Category Filters',
  icon: 'Keyboard',
  layer: 'layer3',
  menuGroup: 'menu-layer',
  defaultSizing: {
    width: 560,
    height: 560,
    minHeight: 240,
    maxHeight: 1120,
    mode: 'adaptive',
  },
  variants: [
    {
      variantId: 'all',
      label: 'All Categories (13 Actions)',
    },
    {
      variantId: 'Driving',
      label: 'Driving Actions Only',
    },
    {
      variantId: 'Aerial',
      label: 'Aerial Actions Only',
    },
  ],
};

export type Layer3KeybindingsRecipeProps = StandardSurfaceProps;

export interface ControlsBindingTableProps {
  isLight?: boolean;
  activeTab?: string;
  onTabChange?: (tab: string) => void;
  onNavigateAdvancedController?: () => void;
  onHover?: (desc: string | null) => void;
  onLeave?: () => void;
  className?: string;
}

/**
 * [Recipe] ControlsBindingTable
 * Fully decoupled 3-Column Controls Mapping Table:
 * - Top Row: Advanced Controller Settings -> Configure (Deadzone & Curves)
 * - Category Filter Bar: All / Driving / Aerial / Camera / Ball Control / Session (left-aligned, evenly spaced) + Reset to Default (right-aligned)
 * - Col 1: Action (text only, no leading icon, aligned with Settings row title font size)
 * - Col 2: Keyboard binds (with Lucide Keyboard icon, unlimited binds, hover delete cross, '+' key capture)
 * - Col 3: Controller binds (with Lucide Gamepad2 icon, unlimited binds, hover delete cross, '+' button capture)
 */
export const ControlsBindingTable: React.FC<ControlsBindingTableProps> = ({
  isLight = false,
  activeTab,
  onTabChange,
  onNavigateAdvancedController,
  onHover,
  onLeave,
  className = '',
}) => {
  const [bindings, setBindings] = useState<ActionBinding[]>(() =>
    loadHydratedActionBindings()
  );
  const [listeningTarget, setListeningTarget] = useState<ListeningTarget | null>(null);
  const [internalCategory, setInternalCategory] =
    useState<KeybindingActionCategory>('All');
  const [confirmReset, setConfirmReset] = useState(false);
  const tableRef = useRef<HTMLDivElement | null>(null);
  const didMountRef = useRef(false);

  const activeCategory: KeybindingActionCategory =
    activeTab &&
    (KEYBINDING_CATEGORIES as readonly string[]).includes(activeTab)
      ? (activeTab as KeybindingActionCategory)
      : internalCategory;

  const handleSelectCategory = (cat: KeybindingActionCategory) => {
    setInternalCategory(cat);
    onTabChange?.(cat);
  };

  useEffect(() => {
    if (!didMountRef.current) {
      didMountRef.current = true;
      return;
    }
    syncActionBindingsToEngine(bindings, false);
  }, [bindings]);

  const {
    rowGap,
    paddingX,
    buttonFontSize,
    buttonPaddingX,
    buttonPaddingY,
    buttonRadius,
  } = useScopedStore('settingRowStore', useSettingActionRowStore);

  const showFeedback = useCallback(
    (msg: string) => {
      onHover?.(msg);
    },
    [onHover]
  );

  useKeybindingCapture(listeningTarget, setBindings, setListeningTarget, showFeedback);

  const handleRemoveKey = (
    actionId: string,
    kind: 'keyboard' | 'gamepad',
    keyToRemove: string
  ) => {
    setBindings((prev) =>
      prev.map((item) => {
        if (item.id === actionId) {
          return {
            ...item,
            [kind]: item[kind].filter((k) => k !== keyToRemove),
          };
        }
        return item;
      })
    );
    showFeedback(
      `Unbound ${kind === 'keyboard' ? 'keyboard' : 'controller'} input [${keyToRemove}].`
    );
  };

  const handleSelectGamepadPreset = (buttonName: string) => {
    if (!listeningTarget || listeningTarget.kind !== 'gamepad') return;

    setBindings((prev) =>
      prev.map((item) => {
        if (item.id === listeningTarget.actionId) {
          if (item.gamepad.includes(buttonName)) return item;
          return {
            ...item,
            gamepad: [...item.gamepad, buttonName],
          };
        }
        return item;
      })
    );

    showFeedback(`Bound controller button [${buttonName}].`);
    setListeningTarget(null);
  };

  const handleResetDefaults = () => {
    if (!confirmReset) {
      setConfirmReset(true);
      showFeedback('Click again to confirm resetting all key bindings to default.');
      setTimeout(() => setConfirmReset(false), 2500);
      return;
    }
    setBindings(INITIAL_BINDINGS);
    syncActionBindingsToEngine(INITIAL_BINDINGS, true);
    setListeningTarget(null);
    setConfirmReset(false);
    showFeedback('Restored default keyboard and controller bindings.');
  };

  const filteredBindings =
    activeCategory === 'All'
      ? bindings
      : bindings.filter(
          (b) => (ACTION_CATEGORY_MAP[b.id] ?? 'Session') === activeCategory
        );

  return (
    <div
      ref={tableRef}
      className={`flex flex-col w-full text-xs select-none gap-2 ${className}`}
    >
      {/* Top Entry Row: Advanced Controller Settings -> Configure */}
      <SettingActionRow
        icon={Gamepad2}
        iconColor="text-amber-500"
        title="Advanced Controller Settings"
        description="Response curves, axial/radial deadzones, dodge thresholds & input visualizer"
        hoverDescription="Configure analog stick response curves, axial/radial deadzones, dodge thresholds, and live input visualizer."
        buttonHoverDescription="Open Advanced Controller & Input Curves configuration."
        showDescription={false}
        bordered={false}
        actionLabel="Configure"
        onAction={() => onNavigateAdvancedController?.()}
        onHover={(desc) => onHover?.(desc)}
        onLeave={onLeave}
        isLight={isLight}
      />

      {/* Category Filter Pills (left-aligned) + Reset to Default (right-aligned), evenly spaced across full width */}
      <div
        style={{
          paddingLeft: `${Math.max(0, paddingX)}px`,
          paddingRight: `${Math.max(0, paddingX)}px`,
        }}
        className="flex items-center justify-between w-full"
      >
        {KEYBINDING_CATEGORIES.map((cat) => {
          const active = activeCategory === cat;
          return (
            <button
              key={cat}
              type="button"
              onClick={() => handleSelectCategory(cat)}
              onMouseEnter={() =>
                onHover?.(
                  cat === 'All'
                    ? 'Show all keyboard and controller action bindings.'
                    : `Filter bindings by ${cat} actions.`
                )
              }
              onMouseLeave={onLeave}
              style={{
                fontSize: `${buttonFontSize}px`,
                paddingLeft: `${Math.max(6, buttonPaddingX - 2)}px`,
                paddingRight: `${Math.max(6, buttonPaddingX - 2)}px`,
                paddingTop: `${buttonPaddingY}px`,
                paddingBottom: `${buttonPaddingY}px`,
                borderRadius: `${Math.max(0, buttonRadius)}px`,
              }}
              className={`shrink-0 font-semibold transition-all duration-150 cursor-pointer whitespace-nowrap leading-tight active:scale-95 ${
                active
                  ? isLight
                    ? 'bg-neutral-900 text-white shadow-2xs'
                    : 'bg-amber-500 text-neutral-950 font-bold shadow-2xs'
                  : isLight
                  ? 'bg-neutral-200/60 hover:bg-neutral-200/95 text-neutral-600 hover:text-neutral-900'
                  : 'bg-white/[0.06] hover:bg-white/[0.11] text-neutral-400 hover:text-neutral-200'
              }`}
            >
              {cat}
            </button>
          );
        })}

        <button
          type="button"
          onClick={handleResetDefaults}
          onMouseEnter={() =>
            onHover?.('Restore all keyboard and controller bindings to their default values.')
          }
          onMouseLeave={onLeave}
          style={{
            fontSize: `${buttonFontSize}px`,
            paddingLeft: `${buttonPaddingX}px`,
            paddingRight: `${buttonPaddingX}px`,
            paddingTop: `${buttonPaddingY}px`,
            paddingBottom: `${buttonPaddingY}px`,
            borderRadius: `${Math.max(0, buttonRadius)}px`,
          }}
          className={`shrink-0 font-semibold border transition-all duration-150 cursor-pointer inline-flex items-center gap-1.5 leading-tight active:scale-95 whitespace-nowrap ${
            confirmReset
              ? 'bg-rose-500/15 hover:bg-rose-500/25 border-rose-500/40 text-rose-500 font-bold'
              : isLight
              ? 'bg-neutral-200/60 hover:bg-neutral-200/95 border-neutral-300/80 text-neutral-800'
              : 'bg-white/[0.06] hover:bg-white/[0.11] border-white/[0.10] hover:border-white/[0.16] text-neutral-200'
          }`}
          title="Reset all bindings to default"
        >
          {confirmReset ? (
            <Check
              style={{
                width: `${Math.max(11, buttonFontSize)}px`,
                height: `${Math.max(11, buttonFontSize)}px`,
              }}
              className="shrink-0"
            />
          ) : (
            <RotateCcw
              style={{
                width: `${Math.max(11, buttonFontSize)}px`,
                height: `${Math.max(11, buttonFontSize)}px`,
              }}
              className="shrink-0"
            />
          )}
          <span>{confirmReset ? 'Confirm Reset' : 'Reset to Default'}</span>
        </button>
      </div>

      {/* 3-Column Binding Table Header */}
      <div
        style={{
          paddingLeft: `${Math.max(0, paddingX)}px`,
          paddingRight: `${Math.max(0, paddingX)}px`,
        }}
        className={`grid grid-cols-12 items-center py-2 font-semibold text-xs tracking-wider uppercase border-b transition-colors ${
          isLight
            ? 'border-neutral-200/90 text-neutral-500'
            : 'border-neutral-800/80 text-neutral-400'
        }`}
      >
        <div className="col-span-5 flex items-center pr-2">
          <span>Action</span>
        </div>

        <div className="col-span-4 flex items-center gap-1.5 pr-2">
          <Keyboard className="h-3.5 w-3.5 text-sky-500 shrink-0" />
          <span>Keyboard</span>
        </div>

        <div className="col-span-3 flex items-center gap-1.5">
          <Gamepad2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
          <span>Controller</span>
        </div>
      </div>

      {/* 3-Column Binding Table Body */}
      <div className="flex flex-col w-full" style={{ gap: `${rowGap}px` }}>
        {filteredBindings.map((b) => (
          <KeybindingActionRow
            key={b.id}
            binding={b}
            isLight={isLight}
            listeningTarget={listeningTarget}
            onStartListening={setListeningTarget}
            onRemoveKey={handleRemoveKey}
            onSelectGamepadPreset={handleSelectGamepadPreset}
            onHover={onHover}
            onLeave={onLeave}
          />
        ))}
      </div>
    </div>
  );
};

/**
 * [Recipe] Layer3KeybindingsRecipe
 * Full-featured Keybinding Panel conforming to the 4-prop StandardSurfaceProps shell contract.
 */
export const Layer3KeybindingsRecipe: React.FC<Layer3KeybindingsRecipeProps> = ({
  isLight = false,
  activeTab,
  onTabChange,
  onBack: propOnBack,
}) => {
  const [hoveredDesc, setHoveredDesc] = useState<string | null>(null);
  const calibratedSizing = resolveCalibratedSurfaceSizing(
    SURFACE_META.id,
    SURFACE_META.defaultSizing
  );
  const storeSizing = useMenuLayoutStore((s) => s.panels?.['layer3-keybindings']);
  const sizing = storeSizing ?? {
    mode: calibratedSizing.mode === 'fixed' ? ('fixed' as const) : ('auto' as const),
    width: calibratedSizing.width,
    targetHeight:
      typeof calibratedSizing.height === 'number' ? calibratedSizing.height : 560,
    minHeight: calibratedSizing.minHeight ?? 240,
    maxHeight: calibratedSizing.maxHeight ?? 1120,
  };
  const storeGoBack = useScopedStore('appStore', useAppStore, (s) => s.goBack);
  const storeNavigate = useScopedStore('appStore', useAppStore, (s) => s.navigate);
  const onBack = propOnBack ?? storeGoBack;
  const handleNavigateAdvanced = () => storeNavigate('controller-settings');

  return (
    <PanelContainer isLight={isLight} sizing={sizing} className="w-full">
      <PanelHeader title="KEY BINDINGS" onBack={onBack} isLight={isLight} />

      <PanelContent scrollable>
        <ControlsBindingTable
          isLight={isLight}
          activeTab={activeTab}
          onTabChange={onTabChange}
          onNavigateAdvancedController={handleNavigateAdvanced}
          onHover={setHoveredDesc}
          onLeave={() => setHoveredDesc(null)}
        />
      </PanelContent>

      <PanelFooter
        isLight={isLight}
        defaultDescription="Click [+] to bind a new keyboard key or controller button. Hover any keycap to unbind, or press ESC to cancel."
        hoveredDescription={hoveredDesc}
        icon={<Info className="h-3.5 w-3.5 text-neutral-400 shrink-0" />}
      />
    </PanelContainer>
  );
};

export default Layer3KeybindingsRecipe;
