import React from 'react';
import { AlertCircle } from 'lucide-react';
import { UI_RADIUS } from '../tokens/radius';

export const ALPHA_COMPONENT_ID = 'Alpha:InlineErrorNotice' as const;

export interface InlineErrorNoticeProps {
  /** Whether the inline error row is visible. When false, renders null (no reserved blank space). */
  visible?: boolean;
  /** Primary inline status text (default: "Something went wrong.") */
  message?: string;
  /** Underlined link text pointing to the top-right notification icon (default: "Check notification") */
  linkText?: string;
  /** Optional callback triggered when clicking "Check notification ↗". Always expands top-right notification center if collapsed. */
  onCheckNotification?: () => void;
  isLight?: boolean;
  className?: string;
}

/**
 * InlineErrorNotice
 * Single-line inline error notice designed for fixed-dimension Layer 3 panels:
 * - Renders nothing when `visible={false}` (zero ugly bottom blank border in normal state).
 * - Displays "Something went wrong." and a pure underlined link `Check notification ↗` (no bulky button).
 * - Clicking `Check notification ↗` dispatches decoupled `'ui:expand-quick-notification'` event and invokes `onCheckNotification`.
 */
export const InlineErrorNotice: React.FC<InlineErrorNoticeProps> = React.memo(({
  visible = true,
  message = 'Something went wrong.',
  linkText = 'Check notification',
  onCheckNotification,
  isLight = false,
  className = '',
}) => {
  if (!visible) return null;

  const handleTrigger = (e: React.MouseEvent | React.KeyboardEvent) => {
    e.stopPropagation();
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('ui:expand-quick-notification'));
    }
    onCheckNotification?.();
  };

  return (
    <div
      role="status"
      aria-live="polite"
      data-alpha-id={ALPHA_COMPONENT_ID}
      data-ui-element="inline-error-notice"
      className={`h-8 px-3 ${UI_RADIUS.md} border flex items-center justify-between gap-2 text-xs select-none shrink-0 transition-colors ${
        isLight
          ? 'bg-rose-50/90 border-rose-200/90 text-rose-800'
          : 'bg-rose-950/35 border-rose-500/35 text-rose-200'
      } ${className}`}
    >
      <div className="flex items-center gap-1.5 min-w-0">
        <AlertCircle className="h-3.5 w-3.5 text-rose-500 shrink-0" />
        <span data-allow-truncate="true" className="font-medium truncate">{message}</span>
      </div>

      <span
        role="link"
        tabIndex={0}
        onClick={handleTrigger}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleTrigger(e);
          }
        }}
        className={`shrink-0 font-semibold underline underline-offset-4 cursor-pointer transition-opacity hover:opacity-80 outline-none focus-visible:ring-1 focus-visible:ring-rose-400 rounded-xs ${
          isLight
            ? 'text-rose-700 decoration-rose-600/80'
            : 'text-rose-300 decoration-rose-300/80'
        }`}
        title="Expand top-right Notification Center"
      >
        {linkText} ↗
      </span>
    </div>
  );
});

InlineErrorNotice.displayName = 'InlineErrorNotice';
