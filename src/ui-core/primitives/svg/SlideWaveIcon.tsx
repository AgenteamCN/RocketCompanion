import React from 'react';

export interface SlideWaveIconProps {
  size?: number | string;
  strokeWidth?: number | string;
  color?: string;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * Private SVG icon component derived from Lucide `waves-arrow-up` with the top upward arrow
 * (`M12 2v8` and `m8 6 4-4 4 4`) removed, leaving the dual horizontal wave curves centered.
 */
export const SlideWaveIcon: React.FC<SlideWaveIconProps> = React.memo(
  ({
    size = 24,
    strokeWidth = 2,
    color = 'currentColor',
    className = '',
    style,
  }) => (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      data-icon="slide-wave-private-svg"
      className={`shrink-0 select-none ${className}`}
      style={style}
    >
      <path d="M2 9c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1" />
      <path d="M2 15c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1" />
    </svg>
  )
);

SlideWaveIcon.displayName = 'SlideWaveIcon';
export default SlideWaveIcon;
