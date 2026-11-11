import React from 'react';
import {
  useQuickNotificationStore,
  pushQuickNotification,
  clearAllQuickNotifications,
} from '../../../ui-core/stores/quickNotificationStore';
import { dialogue } from '../../../ui-core/compounds/dialogue/dialogueStore';
import { createScopedSyncedState } from '../../stores/crossClientSync';
import {
  executeScenario1PreemptionAndRestore,
  executeScenario2DualPersistentStack,
  executeScenario3CollapseIsolation,
  executeScenario5SchemaValidation,
  executeScenario6OngoingTaskYield,
  type NotificationScenarioContext,
} from './notificationIntegrationScenarios';

const useState = createScopedSyncedState('page:notification-integration');

export interface TestCaseResult {
  id: string;
  name: string;
  status: 'idle' | 'running' | 'passed' | 'failed';
  log: string[];
}

export const INITIAL_NOTIFICATION_TEST_RESULTS: Record<string, TestCaseResult> = {
  test1: {
    id: 'test1',
    name: 'scene 1: WebSocket Persistent disconnection notifications preempted by temporary notifications with timeout recovery (Preemption & Restore)',
    status: 'idle',
    log: [],
  },
  test2: {
    id: 'test2',
    name: 'scene 2: Dual Persistent Preemption and Resolve Cascading fallback (LIFO Stack Restoration)',
    status: 'idle',
    log: [],
  },
  test3: {
    id: 'test3',
    name: 'scene 3: User initiated Collapse Isolation test (Move to unread tray, No intrusive pop-ups)',
    status: 'idle',
    log: [],
  },
  test4: {
    id: 'test4',
    name: 'scene 4: Long error progressive disclosure (Notification Summary + Details button -> Dialogue Popup)',
    status: 'idle',
    log: [],
  },
  test5: {
    id: 'test5',
    name: 'scene 5: Strict parameter validation Ghost Fatal Error Dialogue Debug popup (Zero silence Fallback)',
    status: 'idle',
    log: [],
  },
  test6: {
    id: 'test6',
    name: 'scene 6: Ongoing Competition test between lowest-priority tasks and interactive notifications (Background execution and foreground yield)',
    status: 'idle',
    log: [],
  },
};

export function useNotificationIntegrationTestRunner() {
  const store = useQuickNotificationStore();
  const [testResults, setTestResults] = useState<Record<string, TestCaseResult>>(
    INITIAL_NOTIFICATION_TEST_RESULTS,
    'testResults'
  );
  const [isRunningAll, setIsRunningAll] = useState(false, 'isRunningAll');

  const appendLog = (testId: string, message: string) => {
    setTestResults((prev) => {
      const current = prev[testId] || {
        id: testId,
        name: testId,
        status: 'idle' as const,
        log: [],
      };
      return {
        ...prev,
        [testId]: {
          ...current,
          log: [...current.log, `[${new Date().toLocaleTimeString()}] ${message}`],
        },
      };
    });
  };

  const setTestStatus = (
    testId: string,
    status: 'idle' | 'running' | 'passed' | 'failed'
  ) => {
    setTestResults((prev) => {
      const current = prev[testId];
      if (!current) return prev;
      return {
        ...prev,
        [testId]: {
          ...current,
          status,
        },
      };
    });
  };

  const resetTestLog = (testId: string) => {
    setTestResults((prev) => {
      const current = prev[testId];
      if (!current) return prev;
      return {
        ...prev,
        [testId]: { ...current, log: [] },
      };
    });
  };

  const scenarioCtx: NotificationScenarioContext = {
    appendLog,
    setTestStatus,
    resetTestLog,
    resolveActive: () => store.resolveActive(),
    collapseActive: () => store.collapseActive(),
  };

  const runTest4 = () => {
    setTestStatus('test4', 'running');
    resetTestLog('test4');
    clearAllQuickNotifications();
    const fullErrorDetails = `[WebRTC Negotiation Exception]
Status: ICE_CONNECTION_FAILED
Target Room: 8942-US-WEST
Signaling Server: wss://signaling.car-ball.antigravity.dev
Candidate Pair: 192.168.1.104:54321 <-> 104.28.19.4:443 (STUN Timeout 10000ms)
Details: Remote host failed to answer SDP offer within 10-second deadline.
Trace:
  at P2PWebRTCChannel.establishPeerSession (P2PWebRTCChannel.js:142:19)
  at RoomConnectionProgressManager.startJoin (RoomConnectionProgressManager.js:88:12)`;
    appendLog('test4', 'Step 1: Push with Details Compact button error notification...');
    pushQuickNotification({
      id: 'room-join-error-summary',
      type: 'persistent',
      tone: 'error',
      icon: 'octagon-alert',
      duration: 0,
      content: 'Join room failed: Remote host handshake timeout (10s)',
      buttons: [
        {
          label: 'Details',
          color: 'amber',
          onClick: () => {
            appendLog(
              'test4',
              'User clicked Details button, trigger Dialogue Expand full error in popup! '
            );
            dialogue.show({
              title: 'ERROR',
              tone: 'error',
              icon: 'octagon-alert',
              content: (
                <div className="flex flex-col gap-2 font-mono text-xs w-full text-left">
                  <p className="font-bold text-red-600 dark:text-red-400">
                    WebRTC P2P Handshake timeout, direct connection failed:
                  </p>
                  <pre
                    className={[
                      'p-3 rounded-lg bg-neutral-100 text-neutral-800 border border-neutral-300',
                      'dark:bg-neutral-950/70 dark:border-neutral-800 dark:text-neutral-200',
                      'text-[11px] leading-relaxed max-h-48 overflow-y-auto whitespace-pre-wrap select-all',
                    ].join(' ')}
                  >
                    {fullErrorDetails}
                  </pre>
                  <p className="text-neutral-500 dark:text-neutral-400 text-[11px]">
                    Check current network firewall, Or let host regenerate a new one 4 digit
                    room code. Can be closed directly via the built-in slash button or the popup
                    button.
                  </p>
                </div>
              ),
              buttons: [
                {
                  label: 'Copy Logs',
                  variant: 'outline',
                  onClick: async () => {
                    if (typeof navigator !== 'undefined') {
                      await navigator.clipboard.writeText(fullErrorDetails);
                      appendLog('test4', '[ok] Full error log copied to clipboard');
                    }
                  },
                },
                { label: 'Close', variant: 'primary' },
              ],
            });
          },
        },
      ],
    });
    appendLog(
      'test4',
      '[ok] Compact notification popped, Please click on notification [Details] Button validation Dialogue Popup'
    );
    setTestStatus('test4', 'passed');
  };

  const runSingleTestById = (testId: string) => {
    if (testId === 'test1') executeScenario1PreemptionAndRestore(scenarioCtx);
    if (testId === 'test2') executeScenario2DualPersistentStack(scenarioCtx);
    if (testId === 'test3') executeScenario3CollapseIsolation(scenarioCtx);
    if (testId === 'test4') runTest4();
    if (testId === 'test5') executeScenario5SchemaValidation(scenarioCtx);
    if (testId === 'test6') executeScenario6OngoingTaskYield(scenarioCtx);
  };

  const handleRunAll = async () => {
    setIsRunningAll(true);
    await executeScenario1PreemptionAndRestore(scenarioCtx);
    await new Promise((r) => setTimeout(r, 1000));
    await executeScenario2DualPersistentStack(scenarioCtx);
    await new Promise((r) => setTimeout(r, 1000));
    await executeScenario3CollapseIsolation(scenarioCtx);
    await new Promise((r) => setTimeout(r, 1000));
    runTest4();
    await new Promise((r) => setTimeout(r, 1000));
    executeScenario5SchemaValidation(scenarioCtx);
    await new Promise((r) => setTimeout(r, 1000));
    await executeScenario6OngoingTaskYield(scenarioCtx);
    setIsRunningAll(false);
  };

  return {
    store,
    testResults,
    isRunningAll,
    runSingleTestById,
    handleRunAll,
  };
}
