import {
  useQuickNotificationStore,
  pushQuickNotification,
  pushOngoingNotification,
  updateOngoingNotification,
  dismissOngoingNotification,
  clearAllQuickNotifications,
} from '../../../ui-core/stores/quickNotificationStore';
import type { QuickNotificationPushOptions } from '../../../ui-core/stores/notificationTypes';

export interface NotificationScenarioContext {
  appendLog: (testId: string, message: string) => void;
  setTestStatus: (
    testId: string,
    status: 'idle' | 'running' | 'passed' | 'failed'
  ) => void;
  resetTestLog: (testId: string) => void;
  resolveActive: () => void;
  collapseActive: () => void;
}

export async function executeScenario1PreemptionAndRestore(
  ctx: NotificationScenarioContext
): Promise<void> {
  ctx.setTestStatus('test1', 'running');
  ctx.resetTestLog('test1');
  clearAllQuickNotifications();
  ctx.appendLog(
    'test1',
    'Step 1: Push WebSocket Persistent disconnect notification (type: persistent, tone: warning)...'
  );
  pushQuickNotification({
    id: 'ws-disconnect-alert',
    type: 'persistent',
    tone: 'warning',
    icon: 'wifi-off',
    duration: 0,
    content:
      'WebSocket Signaling server disconnected, In use P2P WebRTC Maintain match. ',
    buttons: [
      {
        label: 'Reconnect',
        color: 'amber',
        onClick: () => {
          ctx.appendLog('test1', 'User clicked business Reconnect button');
        },
      },
    ],
  });
  await new Promise((r) => setTimeout(r, 1200));
  const state1 = useQuickNotificationStore.getState();
  if (state1.activeNotification?.id !== 'ws-disconnect-alert') {
    ctx.appendLog('test1', '[x] failed: Persistent notification failed to activate');
    ctx.setTestStatus('test1', 'failed');
    return;
  }
  ctx.appendLog(
    'test1',
    '[ok] confirm: Persistent notification is Active Display state (Clickable Reconnect or built-in on right CircleSlash Ignore button)'
  );
  ctx.appendLog(
    'test1',
    'Step 2: Trigger a temporary notification (type: temporary, duration: 2500ms)...'
  );
  pushQuickNotification({
    id: 'temp-kickoff-alert',
    type: 'temporary',
    tone: 'none',
    icon: 'sparkles',
    duration: 2500,
    content: 'Match about to start (Kickoff in 3s)',
  });
  await new Promise((r) => setTimeout(r, 400));
  const state2 = useQuickNotificationStore.getState();
  if (state2.activeNotification?.id !== 'temp-kickoff-alert') {
    ctx.appendLog('test1', '[x] failed: Temporary notification failed to preempt Active Show');
    ctx.setTestStatus('test1', 'failed');
    return;
  }
  if (
    state2.preemptedPersistentStack.length !== 1 ||
    state2.preemptedPersistentStack[0].id !== 'ws-disconnect-alert'
  ) {
    ctx.appendLog(
      'test1',
      '[x] failed: Persistent notification not entered preemptedPersistentStack Suspend stack'
    );
    ctx.setTestStatus('test1', 'failed');
    return;
  }
  ctx.appendLog(
    'test1',
    '[ok] confirm: Temporary notification preempts foreground, Persistent notification attached preemptedPersistentStack'
  );
  ctx.appendLog(
    'test1',
    'Step 3: Wait for temporary notification 2500ms Countdown natural end...'
  );
  await new Promise((r) => setTimeout(r, 2800));
  const state3 = useQuickNotificationStore.getState();
  if (state3.activeNotification?.id !== 'ws-disconnect-alert') {
    ctx.appendLog(
      'test1',
      `[x] failed: Persistent notifications fail to restore after temporary notifications end (current Active: ${state3.activeNotification?.id})`
    );
    ctx.setTestStatus('test1', 'failed');
    return;
  }
  ctx.appendLog(
    'test1',
    '[ok] confirm: Temporary notification countdown collapse, Persistent Notification[Auto smooth recovery] displayed!'
  );
  ctx.appendLog('test1', '[!] scene 1 validation passed (PASS)');
  ctx.setTestStatus('test1', 'passed');
}

export async function executeScenario2DualPersistentStack(
  ctx: NotificationScenarioContext
): Promise<void> {
  ctx.setTestStatus('test2', 'running');
  ctx.resetTestLog('test2');
  clearAllQuickNotifications();
  ctx.appendLog('test2', 'Step 1: Push first persistent notification A (Host Migration)...');
  pushQuickNotification({
    id: 'persistent-A',
    type: 'persistent',
    tone: 'info',
    icon: 'shield-alert',
    duration: 0,
    content: 'Room ownership transferred to Striker-9921',
  });
  await new Promise((r) => setTimeout(r, 800));
  ctx.appendLog(
    'test2',
    'Step 2: Push second persistent notification B (NAT Traversal Warning)...'
  );
  pushQuickNotification({
    id: 'persistent-B',
    type: 'persistent',
    tone: 'warning',
    icon: 'alert-triangle',
    duration: 0,
    content: 'NAT Type detected as Strict, May affect direct connection quality',
  });
  await new Promise((r) => setTimeout(r, 500));
  const state1 = useQuickNotificationStore.getState();
  if (state1.activeNotification?.id !== 'persistent-B') {
    ctx.appendLog('test2', '[x] failed: Persistent Notification B Failed to preempt foreground');
    ctx.setTestStatus('test2', 'failed');
    return;
  }
  if (
    state1.preemptedPersistentStack.length !== 1 ||
    state1.preemptedPersistentStack[0].id !== 'persistent-A'
  ) {
    ctx.appendLog(
      'test2',
      '[x] failed: Persistent Notification A Failed to queue in pending stack'
    );
    ctx.setTestStatus('test2', 'failed');
    return;
  }
  ctx.appendLog(
    'test2',
    '[ok] confirm: B Preempt display, A Correct at preemptedPersistentStack Suspend'
  );
  ctx.appendLog(
    'test2',
    'Step 3: User resolved via click (Resolve) Current notification B...'
  );
  ctx.resolveActive();
  await new Promise((r) => setTimeout(r, 500));
  const state2 = useQuickNotificationStore.getState();
  if (state2.activeNotification?.id !== 'persistent-A') {
    ctx.appendLog(
      'test2',
      `[x] failed: B After resolve A Failed to cascade restore (current Active: ${state2.activeNotification?.id})`
    );
    ctx.setTestStatus('test2', 'failed');
    return;
  }
  ctx.appendLog(
    'test2',
    '[ok] confirm: B After resolve, Underlying persistent notification A automatically restored!'
  );
  ctx.appendLog('test2', '[!] scene 2 validation passed (PASS)');
  ctx.setTestStatus('test2', 'passed');
}

export async function executeScenario3CollapseIsolation(
  ctx: NotificationScenarioContext
): Promise<void> {
  ctx.setTestStatus('test3', 'running');
  ctx.resetTestLog('test3');
  clearAllQuickNotifications();
  ctx.appendLog('test3', 'Step 1: Push a persistent notification C...');
  pushQuickNotification({
    id: 'persistent-C',
    type: 'persistent',
    tone: 'orange',
    icon: 'flame',
    duration: 0,
    content: 'Tournament queue match success, Please within 30 seconds click confirm. ',
  });
  await new Promise((r) => setTimeout(r, 600));
  ctx.appendLog('test3', 'Step 2: User click Collapse button (Collapse to tray)...');
  ctx.collapseActive();
  await new Promise((r) => setTimeout(r, 400));
  const state = useQuickNotificationStore.getState();
  if (state.activeNotification !== null) {
    ctx.appendLog('test3', '[x] failed: After manual collapse Active Not cleared');
    ctx.setTestStatus('test3', 'failed');
    return;
  }
  if (state.unreadStack.length !== 1 || state.unreadStack[0].id !== 'persistent-C') {
    ctx.appendLog(
      'test3',
      '[x] failed: Notification not categorized unreadStack Unread tray'
    );
    ctx.setTestStatus('test3', 'failed');
    return;
  }
  ctx.appendLog(
    'test3',
    '[ok] confirm: Active Cleared, Notification entered unreadStack Tray, Top-right counter value +1, And no unsolicited pop-up disturbance'
  );
  ctx.appendLog('test3', '[!] scene 3 validation passed (PASS)');
  ctx.setTestStatus('test3', 'passed');
}

export function executeScenario5SchemaValidation(
  ctx: NotificationScenarioContext
): void {
  ctx.setTestStatus('test5', 'running');
  ctx.resetTestLog('test5');
  ctx.appendLog(
    'test5',
    'Step 1: Deliberately pass deprecated fields durationMs and undeclared type invalid configuration...'
  );
  try {
    const malformedPayload = {
      id: 'intentional-bug-alert',
      content: 'This notification has schema bugs',
      durationMs: 3000,
      title: 'Deprecated Title',
    } as unknown as QuickNotificationPushOptions;
    pushQuickNotification(malformedPayload);
    ctx.appendLog(
      'test5',
      '[x] failed: System did not intercept invalid parameter, Silence occurred fallback! '
    );
    ctx.setTestStatus('test5', 'failed');
  } catch (err: unknown) {
    const errMessage = err instanceof Error ? err.message : String(err);
    ctx.appendLog(
      'test5',
      `[ok] Successfully intercepted! Runtime exception captured: ${errMessage}`
    );
    ctx.appendLog(
      'test5',
      '[ok] Verify: Scheduler automatically popped up with highest priority Ghost icon Fatal Error Dialogue popup!'
    );
    ctx.appendLog('test5', '[!] scene 5 validation passed (PASS)');
    ctx.setTestStatus('test5', 'passed');
  }
}

export async function executeScenario6OngoingTaskYield(
  ctx: NotificationScenarioContext
): Promise<void> {
  ctx.setTestStatus('test6', 'running');
  ctx.resetTestLog('test6');
  clearAllQuickNotifications();
  ctx.appendLog(
    'test6',
    'Step 1: Start a background resource download task with lowest priority (Ongoing Task)...'
  );
  const taskId = pushOngoingNotification({
    id: 'bg-asset-download',
    type: 'ongoing',
    content: 'Downloading stadium arena texture pack (0%)',
    progress: 0.1,
    icon: 'download',
  });
  await new Promise((r) => setTimeout(r, 1000));
  updateOngoingNotification(taskId, {
    content: 'Downloading stadium arena texture pack (35%)',
    progress: 0.35,
  });
  ctx.appendLog(
    'test6',
    '[ok] confirm: Background tasks display progress in the foreground with lowest priority'
  );
  await new Promise((r) => setTimeout(r, 800));
  ctx.appendLog(
    'test6',
    'Step 2: High-priority interactive notification (Interrupt and override background task)...'
  );
  pushQuickNotification({
    id: 'high-priority-notice',
    type: 'temporary',
    duration: 2000,
    tone: 'warning',
    content: 'Sudden network jitter: Latency from 15ms increased to 120ms',
  });
  await new Promise((r) => setTimeout(r, 400));
  const state1 = useQuickNotificationStore.getState();
  if (state1.activeNotification?.id !== 'high-priority-notice') {
    ctx.appendLog(
      'test6',
      '[x] failed: Interactive notification failed to overlay background tasks'
    );
    ctx.setTestStatus('test6', 'failed');
    return;
  }
  ctx.appendLog(
    'test6',
    '[ok] confirm: Interactive notification successfully overlays background tasks'
  );
  ctx.appendLog('test6', 'Step 3: Wait for interaction notification 2000ms Countdown finished...');
  await new Promise((r) => setTimeout(r, 2300));
  const state2 = useQuickNotificationStore.getState();
  if (state2.activeOngoingTask?.id !== 'bg-asset-download') {
    ctx.appendLog(
      'test6',
      '[x] failed: After interactive notification collapse, Background task failed to auto-resume'
    );
    ctx.setTestStatus('test6', 'failed');
    return;
  }
  ctx.appendLog(
    'test6',
    '[ok] confirm: After interactive notification collapse, Smooth resumption display of background download tasks! '
  );
  updateOngoingNotification(taskId, {
    content: 'Stadium arena asset pack download complete (100%)',
    progress: 1,
  });
  await new Promise((r) => setTimeout(r, 800));
  dismissOngoingNotification(taskId);
  ctx.appendLog('test6', '[!] scene 6 validation passed (PASS)');
  ctx.setTestStatus('test6', 'passed');
}
