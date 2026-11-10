import React, { useRef, useId } from 'react';
import { motion } from 'framer-motion';
import { UI_EASING } from '../tokens/easing';
import { UI_RADIUS } from '../tokens/radius';
import { UI_THEME } from '../tokens/colors';
import {
  useUnderlineTabsStore,
  type UnderlineTabsFontFamily,
  type UnderlineTabsFontWeight,
} from '../stores/underlineTabsStore';

export const ALPHA_COMPONENT_ID = 'Alpha:UnderlineTabs' as const;

export interface TabItem {
  id: string;
  label: string;
  icon?: React.ReactNode;
  badge?: React.ReactNode;
  disabled?: boolean;
}

export interface UnderlineTabsProps {
  items?: TabItem[];
  tabs?: TabItem[];
  activeId?: string;
  activeTab?: string;
  onChange?: (id: string) => void;
  onSelect?: (id: string) => void;
  id?: string;
  isLight?: boolean;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  fullWidth?: boolean;
  indicatorColor?: string;
  fontSize?: number;
  iconSize?: number;
  iconGap?: number;
  paddingX?: number;
  paddingY?: number;
  indicatorHeight?: number;
  showIcons?: boolean;
  fontFamily?: UnderlineTabsFontFamily;
  activeFontWeight?: UnderlineTabsFontWeight;
  inactiveFontWeight?: UnderlineTabsFontWeight;
}

export const UnderlineTabs: React.FC<UnderlineTabsProps> = React.memo(({
  items: propItems,
  tabs,
  activeId,
  activeTab,
  onChange: propOnChange,
  onSelect,
  id,
  isLight = false,
  className = '',
  fullWidth: propFullWidth,
  indicatorColor = 'bg-amber-500',
  fontSize: propFontSize,
  iconSize: propIconSize,
  iconGap: propIconGap,
  paddingX: propPaddingX,
  paddingY: propPaddingY,
  indicatorHeight: propIndicatorHeight,
  showIcons: propShowIcons,
  fontFamily: propFontFamily,
  activeFontWeight: propActiveFontWeight,
  inactiveFontWeight: propInactiveFontWeight,
}) => {
  const store = useUnderlineTabsStore();

  const resolvedFontSize = propFontSize ?? store.fontSize;
  const resolvedIconSize = propIconSize ?? store.iconSize;
  const resolvedIconGap = propIconGap ?? store.iconGap;
  const resolvedPadX = propPaddingX ?? store.paddingX;
  const resolvedPadY = propPaddingY ?? store.paddingY;
  const resolvedIndicatorHeight = propIndicatorHeight ?? store.indicatorHeight;
  const resolvedShowIcons = propShowIcons ?? store.showIcons;
  const resolvedFullWidth = propFullWidth ?? store.fullWidth;
  const resolvedFontFamily = propFontFamily ?? store.fontFamily;
  const resolvedActiveWeight = Number(propActiveFontWeight ?? store.activeFontWeight) || 600;
  const resolvedInactiveWeight = Number(propInactiveFontWeight ?? store.inactiveFontWeight) || 500;
  const reservationWeight = Math.max(resolvedActiveWeight, resolvedInactiveWeight);

  const items = propItems || tabs || [];
  const onChange = (nextId: string) => {
    propOnChange?.(nextId);
    onSelect?.(nextId);
  };
  const containerRef = useRef<HTMLDivElement>(null);
  const reactId = useId();
  const instanceId = id || reactId;

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const enabledItems = items.filter((item) => !item.disabled);
    const currentIndex = enabledItems.findIndex((item) => item.id === activeId);
    if (currentIndex === -1) return;

    if (e.key === 'ArrowRight') {
      e.preventDefault();
      const next = (currentIndex + 1) % enabledItems.length;
      onChange(enabledItems[next].id);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      const prev = (currentIndex - 1 + enabledItems.length) % enabledItems.length;
      onChange(enabledItems[prev].id);
    }
  };

  const renderTabIcon = (iconNode: React.ReactNode) => {
    if (!iconNode || !resolvedShowIcons) return null;
    if (React.isValidElement(iconNode)) {
      const el = iconNode as React.ReactElement<{
        style?: React.CSSProperties;
        width?: number;
        height?: number;
      }>;
      return React.cloneElement(el, {
        width: resolvedIconSize,
        height: resolvedIconSize,
        style: {
          ...(el.props?.style || {}),
          width: `${resolvedIconSize}px`,
          height: `${resolvedIconSize}px`,
        },
      });
    }
    return iconNode;
  };

  return (
    <div
      ref={containerRef}
      role="tablist"
      data-alpha-id={ALPHA_COMPONENT_ID}
      data-ui-element="underline-tabs"
      onKeyDown={handleKeyDown}
      className={`relative flex items-center border-b ${
        resolvedFullWidth ? 'w-full' : ''
      } ${
        resolvedFontFamily === 'mono' ? 'font-mono' : 'font-sans'
      } ${
        isLight ? UI_THEME.light.border : UI_THEME.dark.border
      } ${className}`}
    >
      {items.map((tab) => {
        const isActive = tab.id === (activeId ?? activeTab);
        const renderedIcon = renderTabIcon(tab.icon);
        return (
          <button
            key={tab.id}
            role="tab"
            type="button"
            aria-selected={isActive}
            disabled={tab.disabled}
            onClick={() => !tab.disabled && onChange(tab.id)}
            style={{
              fontSize: `${resolvedFontSize}px`,
              paddingLeft: `${resolvedPadX}px`,
              paddingRight: `${resolvedPadX}px`,
              paddingTop: `${resolvedPadY}px`,
              paddingBottom: `${resolvedPadY}px`,
              gap: `${resolvedIconGap}px`,
            }}
            className={`group relative flex items-center transition-colors duration-150 outline-none select-none cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed leading-tight ${
              resolvedFullWidth ? 'flex-1 min-w-0 justify-center' : 'shrink-0'
            }`}
          >
            {renderedIcon && (
              <span
                style={{
                  width: `${resolvedIconSize}px`,
                  height: `${resolvedIconSize}px`,
                }}
                className={`inline-flex items-center justify-center shrink-0 transition-colors ${
                  isActive
                    ? isLight
                      ? 'text-neutral-900'
                      : 'text-white'
                    : isLight
                    ? 'text-neutral-400 group-hover:text-neutral-600'
                    : 'text-neutral-500 group-hover:text-neutral-300'
                }`}
              >
                {renderedIcon}
              </span>
            )}

            {/* Zero-shift text wrapper: permanent bold ghost reservation ensures exact constant width */}
            <span className="relative inline-flex flex-col items-center justify-center truncate">
              <span
                style={{
                  fontWeight: isActive ? resolvedActiveWeight : resolvedInactiveWeight,
                }}
                className={`truncate transition-colors ${
                  isActive
                    ? isLight
                      ? 'text-neutral-900'
                      : 'text-white'
                    : isLight
                    ? 'text-neutral-500 group-hover:text-neutral-800'
                    : 'text-neutral-400 group-hover:text-neutral-200'
                }`}
              >
                {tab.label}
              </span>
              <span
                style={{ fontWeight: reservationWeight }}
                className="invisible h-0 select-none pointer-events-none truncate"
                aria-hidden="true"
              >
                {tab.label}
              </span>
            </span>

            {tab.badge && <span className="shrink-0 ml-1">{tab.badge}</span>}

            {isActive && (
              <motion.div
                layoutId={`underline-tabs-active-indicator-${instanceId}`}
                layoutDependency={activeId}
                style={{ height: `${resolvedIndicatorHeight}px` }}
                className={`absolute bottom-0 left-0 right-0 ${indicatorColor} ${UI_RADIUS.full}`}
                transition={UI_EASING.spring.tactile}
              />
            )}
          </button>
        );
      })}
    </div>
  );
});

UnderlineTabs.displayName = 'UnderlineTabs';
