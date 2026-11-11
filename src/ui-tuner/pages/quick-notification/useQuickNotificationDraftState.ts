import type { QuickNotificationItem } from '../../../ui-core/stores/notificationTypes';
import type {
  QuickNotificationGlowLevel,
  QuickNotificationType,
  QuickNotificationButtonConfig,
} from '../../../ui-core/compounds/QuickNotification';
import { useSyncedState } from '../../stores/crossClientSync';

const SCOPE = 'page:quick-notification';

export function useQuickNotificationDraftState() {
  const [showStackIcon, setShowStackIcon] = useSyncedState<boolean>(
    `${SCOPE}:showStackIcon`,
    true
  );
  const [liveMode, setLiveMode] = useSyncedState<boolean>(`${SCOPE}:liveMode`, false);
  const [temporalType, setTemporalType] = useSyncedState<QuickNotificationType>(
    `${SCOPE}:temporalType`,
    'temporary'
  );
  const [durationPreset, setDurationPreset] = useSyncedState<'3000' | '5000' | 'custom'>(
    `${SCOPE}:durationPreset`,
    '3000'
  );
  const [customDurationMs, setCustomDurationMs] = useSyncedState<number>(
    `${SCOPE}:customDurationMs`,
    4000
  );
  const [tone, setTone] = useSyncedState<QuickNotificationGlowLevel>(`${SCOPE}:tone`, 'warning');
  const [iconName, setIconName] = useSyncedState<string>(
    `${SCOPE}:iconName`,
    'triangle-alert'
  );
  const [content, setContent] = useSyncedState<string>(
    `${SCOPE}:content`,
    'Telemetry pipeline latency exceeded threshold (148ms > 80ms).'
  );
  const [ongoingProgressMode, setOngoingProgressMode] = useSyncedState<
    'determinate' | 'indeterminate' | 'none'
  >(`${SCOPE}:ongoingProgressMode`, 'determinate');
  const [ongoingProgressPct, setOngoingProgressPct] = useSyncedState<number>(
    `${SCOPE}:ongoingProgressPct`,
    45
  );
  const [isSpinningIcon, setIsSpinningIcon] = useSyncedState<boolean>(
    `${SCOPE}:isSpinningIcon`,
    true
  );
  const [buttons, setButtons] = useSyncedState<QuickNotificationButtonConfig[]>(
    `${SCOPE}:buttons`,
    [
      { key: 'btn-accept', label: 'Accept', icon: 'check', format: 'icon-text', color: 'green' },
      {
        key: 'btn-reject',
        label: 'Reject',
        icon: 'thumbs-down',
        format: 'icon-only',
        color: 'red',
      },
    ]
  );

  const effectiveDuration =
    temporalType === 'temporary'
      ? durationPreset === 'custom'
        ? Math.max(500, customDurationMs || 3000)
        : Number(durationPreset)
      : 0;

  const totalChars = content.length;
  const chineseChars = (content.match(/[\u4e00-\u9fa5]/g) || []).length;
  const asciiChars = totalChars - chineseChars;
  const estimatedContentWidthPx = Math.round(chineseChars * 14 + asciiChars * 8.5);

  const livePreviewDraft: QuickNotificationItem = {
    id: 'live-draft-preview',
    content,
    tone,
    icon: iconName,
    type: temporalType,
    duration: effectiveDuration,
    buttons: temporalType === 'ongoing' ? undefined : buttons,
    progress:
      temporalType === 'ongoing'
        ? ongoingProgressMode === 'indeterminate'
          ? 'indeterminate'
          : ongoingProgressMode === 'determinate'
          ? ongoingProgressPct / 100
          : undefined
        : undefined,
    isSpinningIcon: temporalType === 'ongoing' ? isSpinningIcon : false,
    timestamp: Date.now(),
    remainingProgress: 1,
  };

  return {
    showStackIcon,
    setShowStackIcon,
    liveMode,
    setLiveMode,
    temporalType,
    setTemporalType,
    durationPreset,
    setDurationPreset,
    customDurationMs,
    setCustomDurationMs,
    tone,
    setTone,
    iconName,
    setIconName,
    content,
    setContent,
    ongoingProgressMode,
    setOngoingProgressMode,
    ongoingProgressPct,
    setOngoingProgressPct,
    isSpinningIcon,
    setIsSpinningIcon,
    buttons,
    setButtons,
    effectiveDuration,
    totalChars,
    chineseChars,
    asciiChars,
    estimatedContentWidthPx,
    livePreviewDraft,
  };
}
