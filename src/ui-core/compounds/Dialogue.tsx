import React, { useRef, useState, useLayoutEffect, useEffect } from 'react';
import { X } from 'lucide-react';
import { UI_RADIUS } from '../tokens/radius';
import { UI_THEME } from '../tokens/colors';
import {
  DialogueButtonVariant,
  DialogueButtonConfig,
  DialogueProps,
  DialogueModalProps,
} from './dialogue/dialogueTypes';
import { dialogue, useDialogueStack } from './dialogue/dialogueStore';
import {
  buildCombinedShadow,
  getToneConfig,
  resolveDialogueIconNode,
  resolveDialogueTitleColorClass,
  resolveDialogueButtonVariantClasses,
  measureEqualDialogueButtonWidth,
  MONO_FONT_STACK,
  DEFAULT_TITLES
} from './dialogue/dialogueStyles';

export const ALPHA_COMPONENT_ID = 'Alpha:Dialogue' as const;

export const Dialogue: React.FC<DialogueProps> = ({
  tone = 'error',
  title,
  titleFontSize = 26,
  titleLetterSpacing = 8,
  titleFontWeight = 600,
  titleMarginTop = 0,
  titleMarginBottom = 10,
  titleColorMode = 'content',
  titleColor,
  content = '',
  contentMarginBottom = 18,
  icon,
  iconVariant = 'plain',
  iconSize = 42,
  buttons = [
    { label: 'Confirm', variant: 'primary' },
    { label: 'Cancel', variant: 'outline' },
  ],
  isLight = false,
  paddingTop = 10,
  paddingBottom = 16,
  paddingY = 16,
  paddingX = 32,
  dialoguePadding,
  sectionGap,
  innerGlowBlur = 36,
  outerShadowBlur = 20,
  minHeight = 165,
  maxWidth = 560,
  className = '',
  showCloseButton = false,
  onClose,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [equalButtonWidth, setEqualButtonWidth] = useState<number | null>(null);
  const theme = isLight ? UI_THEME.light : UI_THEME.dark;

  const resolvedTitle = title || DEFAULT_TITLES[tone] || 'ALERT';

  const effectivePaddingTop = paddingTop ?? paddingY ?? dialoguePadding ?? 10;
  const effectivePaddingBottom = paddingBottom ?? paddingY ?? dialoguePadding ?? 16;
  const effectivePaddingX = paddingX ?? (dialoguePadding ? Math.round(dialoguePadding * 1.25) : 32);
  const effectiveTitleMarginTop = titleMarginTop ?? 0;
  const effectiveTitleMarginBottom = titleMarginBottom ?? sectionGap ?? 10;
  const effectiveContentMarginBottom = contentMarginBottom ?? sectionGap ?? 20;

  const effectiveIconSize = iconSize ?? (iconVariant === 'plain' ? 46 : 22);

  const toneConfig = getToneConfig(tone, isLight);
  const combinedShadow = buildCombinedShadow(tone, isLight, innerGlowBlur, outerShadowBlur);
  const resolvedIconNode = resolveDialogueIconNode(
    icon,
    effectiveIconSize,
    toneConfig.defaultIconComponent
  );
  const titleColorClass = resolveDialogueTitleColorClass(
    tone,
    isLight,
    titleColorMode,
    titleColor
  );

  useLayoutEffect(() => {
    const measured = measureEqualDialogueButtonWidth(containerRef.current);
    if (measured !== null) setEqualButtonWidth(measured);
  }, [buttons, isLight, title, content, maxWidth, effectivePaddingX]);

  useEffect(() => {
    const handleResize = () => {
      const measured = measureEqualDialogueButtonWidth(containerRef.current);
      if (measured !== null) setEqualButtonWidth(measured);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [buttons]);

  const minHeightStyle = typeof minHeight === 'number' ? `${minHeight}px` : minHeight;
  const maxWidthStyle = typeof maxWidth === 'number' ? `${maxWidth}px` : maxWidth;
  const letterSpacingStyle = typeof titleLetterSpacing === 'number' ? `${titleLetterSpacing}px` : titleLetterSpacing;

  const renderButton = (btn: DialogueButtonConfig, index: number) => {
    const variant: DialogueButtonVariant =
      btn.variant ?? (index === 0 ? toneConfig.defaultButtonVariant : 'outline');
    const variantClasses = resolveDialogueButtonVariantClasses(variant, isLight);
    const isDisabled = Boolean(btn.disabled);

    return (
      <button
        key={btn.key ?? `${btn.label}-${index}`}
        data-dialogue-btn="true"
        type="button"
        disabled={isDisabled}
        onClick={(e) => {
          if (isDisabled) {
            e.preventDefault();
            e.stopPropagation();
            return;
          }
          if (btn.onClick) btn.onClick();
        }}
        style={{
          width: equalButtonWidth ? `${equalButtonWidth}px` : undefined,
          fontFamily: MONO_FONT_STACK,
        }}
        className={[
          'inline-flex items-center justify-center px-4 py-2 text-xs font-semibold border select-none',
          'transition-all duration-150 outline-none focus-visible:ring-2 focus-visible:ring-neutral-400',
          'active:scale-[0.98] cursor-pointer disabled:opacity-35 disabled:cursor-not-allowed',
          'disabled:active:scale-100 truncate text-center',
          UI_RADIUS.md,
          variantClasses,
        ].join(' ')}
      >
        {btn.label}
      </button>
    );
  };

  return (
    <div
      ref={containerRef}
      data-alpha-id={ALPHA_COMPONENT_ID}
      data-component="dialogue"
      data-tone={tone}
      style={{
        minHeight: minHeightStyle,
        maxWidth: maxWidthStyle,
        paddingTop: `${effectivePaddingTop}px`,
        paddingBottom: `${effectivePaddingBottom}px`,
        paddingLeft: `${effectivePaddingX}px`,
        paddingRight: `${effectivePaddingX}px`,
        boxShadow: combinedShadow,
        fontFamily: MONO_FONT_STACK,
      }}
      className={`relative w-full flex flex-col justify-between ${UI_RADIUS.xl} border transition-all duration-150 select-none ${
        isLight
          ? `bg-white ${theme.textPrimary} ${toneConfig.cardBorderClass}`
          : `bg-neutral-900 ${theme.textPrimary} ${toneConfig.cardBorderClass}`
      } ${className}`}
    >
      {showCloseButton && onClose && (
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className={`absolute top-3.5 right-3.5 p-1 rounded-lg transition-colors cursor-pointer outline-none focus-visible:ring-2 ${
            isLight
              ? 'text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100'
              : 'text-neutral-500 hover:text-neutral-200 hover:bg-neutral-800'
          }`}
        >
          <X className="h-4 w-4" />
        </button>
      )}

      <div 
        className="w-full shrink-0 flex items-center justify-center text-center px-2"
        style={{ 
          marginTop: `${effectiveTitleMarginTop}px`,
          marginBottom: `${effectiveTitleMarginBottom}px` 
        }}
      >
        <h2
          style={{
            fontSize: `${titleFontSize}px`,
            letterSpacing: letterSpacingStyle,
            fontWeight: Number(titleFontWeight) || 400,
            color: titleColor || undefined,
          }}
          className={`text-center tracking-tight truncate leading-snug transition-colors ${titleColorClass}`}
        >
          {resolvedTitle}
        </h2>
      </div>

      <div 
        className="flex-1 min-h-0 flex items-center gap-4 sm:gap-4.5 px-1"
        style={{ marginBottom: `${effectiveContentMarginBottom}px` }}
      >
        {iconVariant === 'container' ? (
          <div
            className={`shrink-0 rounded-xl flex items-center justify-center p-2.5 transition-transform select-none ${toneConfig.iconContainerClass}`}
          >
            {resolvedIconNode}
          </div>
        ) : (
          <div
            className={`shrink-0 flex items-center justify-center select-none transition-transform ${toneConfig.plainIconColorClass}`}
          >
            {resolvedIconNode}
          </div>
        )}

        <div className="flex-1 min-w-0 text-left">
          {typeof content === 'string' ? (
            <p
              className={`text-xs sm:text-sm leading-relaxed whitespace-pre-line font-normal ${
                isLight ? 'text-neutral-600' : 'text-neutral-300'
              }`}
            >
              {content}
            </p>
          ) : (
            content
          )}
        </div>
      </div>

      {buttons.length > 0 && (
        <div className="shrink-0 flex flex-wrap items-center justify-center gap-2.5 sm:gap-3 mt-auto w-full">
          {buttons.map((btn, index) => renderButton(btn, index))}
        </div>
      )}
    </div>
  );
};

/**
 * Centered Dialogue Modal Overlay (Zero background darkening mask, stackable)
 */
export const DialogueModal: React.FC<DialogueModalProps> = ({
  open,
  onClose,
  closeOnClickOutside = false,
  closeOnEsc = false,
  isLight = false,
  showCloseButton = false,
  zIndex = 800,
  ...dialogueProps
}) => {
  useEffect(() => {
    if (!open || !closeOnEsc || !onClose) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose, closeOnEsc]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{ zIndex }}
      className="fixed inset-0 flex items-center justify-center p-4 sm:p-6 select-none bg-transparent pointer-events-none transition-opacity duration-200"
      onClick={(e) => {
        if (closeOnClickOutside && onClose && e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        className="w-full flex items-center justify-center pointer-events-auto cursor-default animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        <Dialogue
          {...dialogueProps}
          isLight={isLight}
          showCloseButton={showCloseButton}
          onClose={showCloseButton ? onClose : undefined}
        />
      </div>
    </div>
  );
};

/**
 * Global or page container that renders stacked dialogues.
 * No background mask darkening is applied, rendering layered dialogues cleanly.
 */
export const DialogueStackContainer: React.FC<{ isLight?: boolean }> = ({ isLight }) => {
  const { stack, dismiss } = useDialogueStack();

  useEffect(() => {
    const handleSchemaError = (e: Event) => {
      const customEvent = e as CustomEvent<{ message?: string }>;
      const message = customEvent.detail?.message || 'Unknown schema violation';
      dialogue.show({
        title: 'FATAL ERROR',
        tone: 'error',
        icon: 'ghost',
        content: (
          <div className="flex flex-col gap-2 font-mono text-xs w-full text-left">
            <p className="font-bold text-red-600 dark:text-red-400">
              Fatal parameter schema violation occurred in the Notification System:
            </p>
            <div className="p-2.5 rounded-lg bg-red-50 text-red-900 border border-red-200 dark:bg-red-950/40 dark:border-red-800/80 dark:text-red-200 whitespace-pre-wrap select-all leading-relaxed">
              {message}
            </div>
            <p className="opacity-80 text-[11px] mt-1 text-neutral-500 dark:text-neutral-400">
              Silent fallbacks are strictly prohibited. Fix the parameter keys or provide required values in source code.
            </p>
          </div>
        ),
        buttons: [
          {
            label: 'Acknowledge',
            variant: 'danger',
          },
        ],
      });
    };

    window.addEventListener('rc-ui:fatal-schema-error', handleSchemaError);
    return () => window.removeEventListener('rc-ui:fatal-schema-error', handleSchemaError);
  }, []);

  useEffect(() => {
    if (stack.length === 0) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        const topItem = stack[stack.length - 1];
        if (topItem) {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
          const cancelBtn = topItem.buttons?.find(
            (b) => /cancel|close|no|dismiss/i.test(b.label)
          );
          if (cancelBtn?.onClick && !cancelBtn.disabled) {
            cancelBtn.onClick();
          }
          dismiss(topItem.id);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [stack, dismiss]);

  if (stack.length === 0) return null;

  return (
    <>
      {stack.map((item, index) => {
        // Subtle vertical lift per layer underneath so user can appreciate the stack
        const layerDepth = stack.length - 1 - index;
        const translateY = -layerDepth * 10;
        const scale = 1 - layerDepth * 0.02;

        const docIsLight =
          typeof document !== 'undefined'
            ? document.documentElement.classList.contains('light') ||
              document.documentElement.dataset.theme === 'light' ||
              document.body.classList.contains('light')
            : false;
        const effectiveIsLight = item.isLight ?? isLight ?? docIsLight;

        return (
          <div
            key={item.id}
            role="dialog"
            aria-modal="true"
            style={{ zIndex: item.zIndex }}
            className="fixed inset-0 flex items-center justify-center p-4 sm:p-6 select-none bg-transparent pointer-events-none transition-all duration-200"
          >
            <div
              style={{
                transform: `translateY(${translateY}px) scale(${scale})`,
              }}
              className="w-full flex items-center justify-center pointer-events-auto cursor-default animate-in fade-in zoom-in-95 duration-150 transition-transform"
              onClick={(e) => e.stopPropagation()}
            >
              <Dialogue
                {...item}
                isLight={effectiveIsLight}
                buttons={item.buttons?.map((b) => ({
                  ...b,
                  onClick: () => {
                    if (b.disabled) return;
                    if (b.onClick) b.onClick();
                    dismiss(item.id);
                  },
                }))}
              />
            </div>
          </div>
        );
      })}
    </>
  );
};
