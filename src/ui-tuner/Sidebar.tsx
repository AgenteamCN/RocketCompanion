import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Sun, Moon, PanelLeftOpen } from 'lucide-react';
import { useAccentStore } from './stores/themeStore';
import { SidebarWorkspaceHeader } from './SidebarWorkspaceHeader';
import { PYRAMID_LAYERS, SIDEBAR_NAV_ITEMS, getWorkspaceForTab, type ShowcaseTab, type TunerWorkspaceId, type WorkspaceSectionId } from './sidebarNavConfig';
import { WORKSPACE_SECTIONS, WORKSPACE_SPECS, getApprovalLedgerSummary } from './workspaceSpecs';

export interface SidebarProps {
  activeTab: ShowcaseTab;
  onSelectTab: (tab: ShowcaseTab) => void;
  activeWorkspace?: TunerWorkspaceId;
  onSelectWorkspace?: (workspace: TunerWorkspaceId) => void;
  isLight: boolean;
  onToggleTheme: () => void;
  collapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
}

const SIDEBAR_COLLAPSED_SESSION_KEY = 'rc-ui-tuner:sidebar-collapsed';

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onSelectTab,
  activeWorkspace: controlledWorkspace,
  onSelectWorkspace,
  isLight,
  onToggleTheme,
  collapsed: controlledCollapsed,
  onCollapsedChange,
}) => {
  const { tokens } = useAccentStore();
  const activeWorkspace: TunerWorkspaceId =
    controlledWorkspace ?? getWorkspaceForTab(activeTab);

  const [showAllPyramidLayers, setShowAllPyramidLayers] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const [internalCollapsed, setInternalCollapsed] = useState<boolean>(() => {
    try {
      return (
        typeof sessionStorage !== 'undefined' &&
        sessionStorage.getItem(SIDEBAR_COLLAPSED_SESSION_KEY) === '1'
      );
    } catch {
      return false;
    }
  });

  const isCollapsed = controlledCollapsed ?? internalCollapsed;

  const setCollapsed = useCallback(
    (next: boolean | ((prev: boolean) => boolean)) => {
      const resolved = typeof next === 'function' ? next(isCollapsed) : next;
      if (controlledCollapsed === undefined) {
        setInternalCollapsed(resolved);
        try {
          if (typeof sessionStorage !== 'undefined') {
            sessionStorage.setItem(
              SIDEBAR_COLLAPSED_SESSION_KEY,
              resolved ? '1' : '0'
            );
          }
        } catch {
          // ignore storage errors
        }
      }
      onCollapsedChange?.(resolved);
    },
    [controlledCollapsed, isCollapsed, onCollapsedChange]
  );

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'b') {
        const target = e.target as HTMLElement | null;
        if (
          target &&
          (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) ||
            target.isContentEditable)
        ) {
          return;
        }
        e.preventDefault();
        setCollapsed((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [setCollapsed]);

  const ledgerSummary = useMemo(() => getApprovalLedgerSummary(), []);

  const handleWorkspaceClick = useCallback(
    (ws: TunerWorkspaceId) => {
      setShowAllPyramidLayers(false);
      if (onSelectWorkspace) onSelectWorkspace(ws);
      else onSelectTab(WORKSPACE_SPECS[ws].defaultTab);
    },
    [onSelectTab, onSelectWorkspace]
  );

  const normalizedSearch = searchQuery.trim().toLowerCase();

  const filteredItems = useMemo(() => {
    return SIDEBAR_NAV_ITEMS.filter((item) => {
      if (
        !showAllPyramidLayers &&
        !normalizedSearch &&
        item.workspace !== activeWorkspace
      ) {
        return false;
      }
      if (!normalizedSearch) return true;
      return (
        item.label.toLowerCase().includes(normalizedSearch) ||
        item.id.toLowerCase().includes(normalizedSearch) ||
        item.layer.toLowerCase().includes(normalizedSearch) ||
        (item.badgeText &&
          item.badgeText.toLowerCase().includes(normalizedSearch))
      );
    });
  }, [activeWorkspace, normalizedSearch, showAllPyramidLayers]);

  const groups = useMemo(() => {
    if (showAllPyramidLayers) {
      const keys = Object.keys(
        PYRAMID_LAYERS
      ) as (keyof typeof PYRAMID_LAYERS)[];
      return keys.map((k) => ({
        key: k,
        meta: PYRAMID_LAYERS[k],
        items: filteredItems.filter((item) => item.layer === k),
      }));
    }
    const allSecKeys = Object.keys(WORKSPACE_SECTIONS) as WorkspaceSectionId[];
    const secKeys = normalizedSearch
      ? allSecKeys
      : allSecKeys.filter(
          (k) => WORKSPACE_SECTIONS[k].workspace === activeWorkspace
        );
    return secKeys.map((k) => ({
      key: k,
      meta: WORKSPACE_SECTIONS[k],
      items: filteredItems.filter((item) => item.workspaceSection === k),
    }));
  }, [activeWorkspace, filteredItems, normalizedSearch, showAllPyramidLayers]);

  return (
    <>
      {isCollapsed && (
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          title="Expand side navigation (Expand Sidebar · Current Window Only [⌘B / Ctrl+B])"
          aria-label="Expand Sidebar"
          className={`absolute left-0 top-3 z-30 flex items-center gap-1.5 pl-2 pr-2.5 py-2 rounded-r-xl border border-l-0 text-xs font-mono font-medium shadow-md backdrop-blur transition-all cursor-pointer ${
            isLight
              ? 'bg-white/95 hover:bg-neutral-100 border-neutral-300 text-neutral-700 hover:text-neutral-950'
              : 'bg-neutral-900/95 hover:bg-neutral-800 border-neutral-700 text-neutral-300 hover:text-white'
          }`}
        >
          <PanelLeftOpen className="h-4 w-4 shrink-0" />
        </button>
      )}

      <aside
        aria-hidden={isCollapsed}
        className={`${
          isCollapsed
            ? 'w-0 border-r-0 opacity-0 pointer-events-none'
            : 'w-72 border-r opacity-100'
        } shrink-0 overflow-hidden flex flex-col justify-between transition-all duration-200 ease-out ${
          isLight
            ? 'bg-[#fbfbfd] border-neutral-200/80 text-neutral-800'
            : 'bg-neutral-950/80 border-neutral-800 text-neutral-200'
        }`}
      >
        <div className="w-72 flex flex-col p-3.5 overflow-y-auto flex-1 min-h-0 gap-3">
          <SidebarWorkspaceHeader
            activeWorkspace={activeWorkspace}
            onSelectWorkspace={handleWorkspaceClick}
            showAllPyramidLayers={showAllPyramidLayers}
            onTogglePyramidLayers={() =>
              setShowAllPyramidLayers((prev) => !prev)
            }
            searchQuery={searchQuery}
            onSearchQueryChange={setSearchQuery}
            ledgerSummary={ledgerSummary}
            onCollapse={() => setCollapsed(true)}
            isLight={isLight}
          />

          <div className="flex flex-col gap-3.5">
            {groups.map(({ key, meta, items }) => {
              if (items.length === 0) return null;
              return (
                <div key={key} className="flex flex-col gap-1">
                  <div
                    className="px-2 mb-0.5 flex items-center gap-1.5"
                    title={meta.rule}
                  >
                    <span
                      className={`px-1.5 py-0.2 rounded text-[9px] font-mono font-extrabold border ${meta.badgeColor}`}
                    >
                      {meta.code}
                    </span>
                    <span
                      className={`text-[10px] font-bold tracking-tight truncate ${
                        isLight ? 'text-neutral-600' : 'text-neutral-300'
                      }`}
                    >
                      {meta.title}
                    </span>
                  </div>
                  {items.map((item) => {
                    const isActive = activeTab === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => onSelectTab(item.id)}
                        className={`flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all text-left cursor-pointer outline-none ${
                          isActive
                            ? isLight
                              ? tokens.activeItemLight
                              : tokens.activeItemDark
                            : isLight
                            ? 'text-neutral-600 hover:bg-neutral-200/50 hover:text-neutral-900'
                            : 'text-neutral-400 hover:bg-neutral-900/80 hover:text-neutral-200'
                        }`}
                      >
                        <span className="flex items-center gap-2 min-w-0">
                          <span className="shrink-0">{item.icon}</span>
                          <span className="truncate">{item.label}</span>
                        </span>
                        {item.badgeText && (
                          <span className="px-1.5 py-0.2 rounded text-[9px] font-mono opacity-75 border border-current/20 shrink-0">
                            {item.badgeText}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>

        {/* Theme Switcher Bottom Bar */}
        <div
          className={`w-72 p-3.5 border-t flex items-center justify-between transition-colors ${
            isLight
              ? 'border-neutral-200/80 bg-neutral-100/40'
              : 'border-neutral-800/60'
          }`}
        >
          <span
            className={`text-xs font-mono ${
              isLight ? 'text-neutral-500' : 'text-neutral-400'
            }`}
          >
            Dark / Light
          </span>
          <button
            type="button"
            onClick={onToggleTheme}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-all cursor-pointer ${
              isLight
                ? 'bg-white hover:bg-neutral-100 border-neutral-300 text-neutral-800 shadow-2xs'
                : 'bg-neutral-900 hover:bg-neutral-800 border-neutral-700 text-neutral-200'
            }`}
          >
            {isLight ? (
              <Sun className="h-3.5 w-3.5 text-amber-500" />
            ) : (
              <Moon className="h-3.5 w-3.5 text-neutral-300" />
            )}
            <span>{isLight ? 'Light' : 'Dark'}</span>
          </button>
        </div>
      </aside>
    </>
  );
};
