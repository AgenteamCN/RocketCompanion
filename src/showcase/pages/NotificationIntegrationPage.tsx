import React from 'react';
import {
  CheckCircle2,
  XCircle,
  Play,
  RotateCcw,
  ShieldCheck,
  Terminal,
  Clock,
  RefreshCw,
} from 'lucide-react';
import { clearAllQuickNotifications } from '../../ui-core/stores/quickNotificationStore';
import { QuickNotificationSystem } from '../../ui-core/navigation/QuickNotificationSystem';
import { Button } from '../../ui-core/primitives/Button';
import { Badge } from '../../ui-core/primitives/Badge';
import { useNotificationIntegrationTestRunner } from './quick-notification/useNotificationIntegrationTestRunner';

export const NotificationIntegrationPage: React.FC<{ isLight?: boolean }> = ({
  isLight = false,
}) => {
  const { store, testResults, isRunningAll, runSingleTestById, handleRunAll } =
    useNotificationIntegrationTestRunner();

  return (
    <div className="flex flex-col gap-8 max-w-6xl mx-auto pb-24">
      {/* Header Banner */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <Badge variant="amber" isLight={isLight}>
            Core Architecture Suite
          </Badge>
          <span className={`text-xs font-mono ${isLight ? 'text-neutral-500' : 'text-neutral-400'}`}>
            RCUITuner / QuickNotification & Dialogue Integration
          </span>
        </div>
        <h1
          className={`text-3xl font-bold tracking-tight ${
            isLight ? 'text-neutral-900' : 'text-neutral-100'
          }`}
        >
          Notification & Dialogue Integration test matrix
        </h1>
        <p
          className={`text-sm max-w-3xl leading-relaxed ${
            isLight ? 'text-neutral-600' : 'text-neutral-400'
          }`}
        >
          Test focus: <strong>Notification scheduler (NotificationScheduler) </strong> Preemption and
          auto-recovery mechanism (Preemption & Restoration) , Strict parameter validation with no
          silent fallback (Fatal Schema Validation with Ghost Dialogue) , Long error progressive
          disclosure linkage, And lowest priority Ongoing Task hierarchy competition.
        </p>
      </div>

      {/* Interactive Preview Stage with In-Place QuickNotificationSystem */}
      <div
        className={`relative h-32 rounded-2xl border flex items-center justify-between px-6 overflow-hidden select-none shadow-sm transition-colors ${
          isLight
            ? 'bg-gradient-to-r from-neutral-100 via-neutral-50 to-neutral-100 border-neutral-300/80 text-neutral-900'
            : 'bg-gradient-to-r from-neutral-900 via-neutral-950 to-neutral-900 border-neutral-800 text-neutral-100'
        }`}
      >
        <div className="flex items-center gap-3 z-10">
          <div className="h-3 w-3 rounded-full bg-emerald-500 animate-pulse" />
          <div className="flex flex-col">
            <span
              className={`text-xs font-bold font-mono uppercase tracking-wider ${
                isLight ? 'text-neutral-900' : 'text-neutral-100'
              }`}
            >
              Live Notification Viewport (Top-right floating drawer)
            </span>
            <span className={`text-[11px] font-mono ${isLight ? 'text-neutral-500' : 'text-neutral-400'}`}>
              All triggered notifications expand in this area and the global top-right corner
            </span>
          </div>
        </div>
        {/* Mounted in-place for direct visualization */}
        <QuickNotificationSystem isLight={isLight} absolute={true} />
      </div>

      {/* Real-time Scheduler State Inspector */}
      <div
        className={`p-5 rounded-2xl border flex flex-col gap-4 font-mono text-xs transition-colors ${
          isLight
            ? 'bg-white border-neutral-300 text-neutral-800 shadow-sm'
            : 'bg-neutral-900 border-neutral-800 text-neutral-200'
        }`}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Terminal className="h-4 w-4 text-amber-500" />
            <span className="font-bold uppercase tracking-wider">
              NotificationScheduler Real-time memory probe (Live State)
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              isLight={isLight}
              onClick={() => clearAllQuickNotifications()}
              className="text-xs"
            >
              <RotateCcw className="h-3.5 w-3.5 mr-1" />
              Clear All States (Reset All)
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          {/* Active Notification Card */}
          <div
            className={`p-3 rounded-xl border flex flex-col gap-1.5 transition-colors ${
              store.activeNotification
                ? isLight
                  ? 'bg-amber-50 border-amber-300 text-amber-900'
                  : 'bg-amber-950/40 border-amber-700/60 text-amber-200'
                : isLight
                ? 'bg-neutral-50 border-neutral-200 text-neutral-500'
                : 'bg-neutral-950 border-neutral-800 text-neutral-500'
            }`}
          >
            <span
              className={`text-[10px] uppercase font-bold ${
                isLight ? 'text-neutral-500' : 'text-neutral-400'
              }`}
            >
              1. Active Notification
            </span>
            <span className="font-bold text-sm truncate">
              {store.activeNotification?.id || '(None)'}
            </span>
            <span className="text-[10px] opacity-80">
              Type: {store.activeNotification?.type || 'idle'} • Tone:{' '}
              {store.activeNotification?.tone || 'none'}
            </span>
          </div>

          {/* Preempted Persistent Stack Card */}
          <div
            className={`p-3 rounded-xl border flex flex-col gap-1.5 transition-colors ${
              store.preemptedPersistentStack.length > 0
                ? isLight
                  ? 'bg-rose-50 border-rose-300 text-rose-900'
                  : 'bg-rose-950/40 border-rose-700/60 text-rose-200'
                : isLight
                ? 'bg-neutral-50 border-neutral-200 text-neutral-500'
                : 'bg-neutral-950 border-neutral-800 text-neutral-500'
            }`}
          >
            <span
              className={`text-[10px] uppercase font-bold flex items-center justify-between ${
                isLight ? 'text-neutral-500' : 'text-neutral-400'
              }`}
            >
              <span>2. Preempted Stack (Suspend)</span>
              <span className="font-bold">{store.preemptedPersistentStack.length}</span>
            </span>
            <span className="font-bold text-sm truncate">
              {store.preemptedPersistentStack[0]?.id || '(Empty)'}
            </span>
            <span className="text-[10px] opacity-80">
              Pending persistent notification:{' '}
              {store.preemptedPersistentStack.map((n) => n.id).join(' -> ') || 'none'}
            </span>
          </div>

          {/* Unread Stack Tray Card */}
          <div
            className={`p-3 rounded-xl border flex flex-col gap-1.5 transition-colors ${
              store.unreadStack.length > 0
                ? isLight
                  ? 'bg-sky-50 border-sky-300 text-sky-900'
                  : 'bg-sky-950/40 border-sky-700/60 text-sky-200'
                : isLight
                ? 'bg-neutral-50 border-neutral-200 text-neutral-500'
                : 'bg-neutral-950 border-neutral-800 text-neutral-500'
            }`}
          >
            <span
              className={`text-[10px] uppercase font-bold flex items-center justify-between ${
                isLight ? 'text-neutral-500' : 'text-neutral-400'
              }`}
            >
              <span>3. Unread Stack (Unread tray)</span>
              <span className="font-bold">{store.unreadStack.length}</span>
            </span>
            <span className="font-bold text-sm truncate">
              {store.unreadStack[0]?.id || '(Empty)'}
            </span>
            <span className="text-[10px] opacity-80">
              Collapsed/History: {store.unreadStack.map((n) => n.id).join(', ') || 'none'}
            </span>
          </div>

          {/* Active Ongoing Task Card */}
          <div
            className={`p-3 rounded-xl border flex flex-col gap-1.5 transition-colors ${
              store.activeOngoingTask
                ? isLight
                  ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                  : 'bg-emerald-950/40 border-emerald-700/60 text-emerald-200'
                : isLight
                ? 'bg-neutral-50 border-neutral-200 text-neutral-500'
                : 'bg-neutral-950 border-neutral-800 text-neutral-500'
            }`}
          >
            <span
              className={`text-[10px] uppercase font-bold flex items-center justify-between ${
                isLight ? 'text-neutral-500' : 'text-neutral-400'
              }`}
            >
              <span>4. Ongoing Task (Background)</span>
              <span className="font-bold">{store.ongoingTasks.length}</span>
            </span>
            <span className="font-bold text-sm truncate">
              {store.activeOngoingTask?.id || '(None)'}
            </span>
            <span className="text-[10px] opacity-80">
              Progress:{' '}
              {typeof store.activeOngoingTask?.progress === 'number'
                ? `${Math.round(store.activeOngoingTask.progress * 100)}%`
                : 'none'}
            </span>
          </div>
        </div>
      </div>

      {/* Persistent Automated Test Suite */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-emerald-500" />
            <h2
              className={`text-lg font-bold ${
                isLight ? 'text-neutral-900' : 'text-neutral-100'
              }`}
            >
              Persistent regression verification test suite (Automated Test Suite)
            </h2>
          </div>
          <Button
            variant="primary"
            isLight={isLight}
            disabled={isRunningAll}
            onClick={handleRunAll}
            className="text-xs"
          >
            <Play className="h-3.5 w-3.5 mr-1.5" />
            {isRunningAll
              ? 'Executing full test suite...'
              : 'One-click sequential run for all test cases (Run All)'}
          </Button>
        </div>

        <div className="grid grid-cols-1 gap-4">
          {Object.values(testResults).map((test) => {
            const isRunning = test.status === 'running';
            const isPassed = test.status === 'passed';
            const isFailed = test.status === 'failed';
            return (
              <div
                key={test.id}
                className={`p-5 rounded-2xl border transition-all ${
                  isLight
                    ? 'bg-white border-neutral-200/90 shadow-2xs text-neutral-900'
                    : 'bg-neutral-900/90 border-neutral-800 text-neutral-100'
                }`}
              >
                <div
                  className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b ${
                    isLight ? 'border-neutral-200' : 'border-neutral-800'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    {isPassed && <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0" />}
                    {isFailed && <XCircle className="h-5 w-5 text-red-500 shrink-0" />}
                    {isRunning && (
                      <RefreshCw className="h-5 w-5 text-amber-500 animate-spin shrink-0" />
                    )}
                    {test.status === 'idle' && (
                      <Clock className="h-5 w-5 text-neutral-400 shrink-0" />
                    )}
                    <div className="flex flex-col">
                      <span
                        className={`font-bold text-sm ${
                          isLight ? 'text-neutral-900' : 'text-neutral-100'
                        }`}
                      >
                        {test.name}
                      </span>
                      <span
                        className={`text-[11px] font-mono ${
                          isLight ? 'text-neutral-500' : 'text-neutral-400'
                        }`}
                      >
                        Test ID: {test.id}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      isLight={isLight}
                      disabled={isRunning}
                      onClick={() => runSingleTestById(test.id)}
                      className="text-xs font-mono"
                    >
                      <Play className="h-3 w-3 mr-1" />
                      Run single item (Run)
                    </Button>
                  </div>
                </div>

                {/* Step execution log */}
                <div
                  className={`mt-3 rounded-xl p-3 font-mono text-xs max-h-36 overflow-y-auto flex flex-col gap-1 border transition-colors ${
                    isLight
                      ? 'bg-neutral-50 text-neutral-700 border-neutral-200/90'
                      : 'bg-neutral-950 text-neutral-300 border-neutral-800/80'
                  }`}
                >
                  {test.log.length === 0 ? (
                    <span
                      className={`italic ${
                        isLight ? 'text-neutral-400' : 'text-neutral-500'
                      }`}
                    >
                      click"Run single item"Execute test case and observe state machine steps...
                    </span>
                  ) : (
                    test.log.map((entry, idx) => (
                      <span
                        key={idx}
                        className={
                          entry.includes('[x]')
                            ? isLight
                              ? 'text-red-600 font-bold'
                              : 'text-red-400 font-bold'
                            : entry.includes('[ok]') || entry.includes('[!]')
                            ? isLight
                              ? 'text-emerald-600 font-semibold'
                              : 'text-emerald-400 font-semibold'
                            : isLight
                            ? 'text-neutral-700'
                            : 'text-neutral-300'
                        }
                      >
                        {entry}
                      </span>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
