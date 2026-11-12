import { useState, useEffect, useRef, useMemo } from 'react';
import { useMenuLayoutStore } from '../../stores/menuLayoutStore';
import { useQuickNotificationStore } from '../../stores/quickNotificationStore';
import {
  dispatchOnlineRoomErrorNotification,
  type CreationProgressStatus,
  type CreationStepSpec,
} from './OnlineRoomCreationProgress';

export interface OnlineRoomLaunchErrorRecord {
  message: string;
  roomId?: string;
  timestamp: number;
}

let lastOnlineRoomLaunchError: OnlineRoomLaunchErrorRecord | null = null;

export function recordOnlineRoomLaunchError(err: unknown, roomId?: string): void {
  const message =
    err instanceof Error
      ? err.message
      : typeof err === 'string' && err.trim()
      ? err.trim()
      : 'Could not bind or connect to signaling room within 10s.';
  lastOnlineRoomLaunchError = {
    message,
    roomId,
    timestamp: Date.now(),
  };
}

export function clearOnlineRoomLaunchError(): void {
  lastOnlineRoomLaunchError = null;
}

export function consumeOnlineRoomLaunchError(): OnlineRoomLaunchErrorRecord | null {
  const current = lastOnlineRoomLaunchError;
  lastOnlineRoomLaunchError = null;
  return current;
}

export interface ClassifiedRoomStepFailure {
  step: number;
  errorTitle: string;
  errorDescription: string;
}

export function classifyOnlineRoomFailure(
  mode: 'join' | 'host',
  rawMessage: string | undefined,
  roomCode: string,
  steps: CreationStepSpec[]
): ClassifiedRoomStepFailure {
  const msg = (rawMessage || '').trim();
  const lower = msg.toLowerCase();

  let step = 3;
  if (
    lower.includes('p2p blocked by nat') ||
    lower.includes('sdp/ice') ||
    lower.includes('p2p channel disconnected') ||
    lower.includes('nat traversal')
  ) {
    step = 4;
  } else if (
    lower.includes('all signaling relays') ||
    lower.includes('signaling connection timed out') ||
    lower.includes('no signaling profile') ||
    lower.includes('unreachable')
  ) {
    step = 2;
  } else if (
    lower.includes('did not respond within') ||
    lower.includes('declined by host') ||
    lower.includes('stopped responding during pairing') ||
    lower.includes('room')
  ) {
    step = 3;
  }

  const clampedStep = Math.max(1, Math.min(steps.length || 5, step));
  const spec = steps[clampedStep - 1] ?? steps[0];
  const fallbackTitle =
    mode === 'join' ? 'Room Not Found or Key Mismatch' : 'Room Creation Failed';
  const fallbackDesc =
    mode === 'join'
      ? `Connected to signaling relay, but room "${roomCode}" (or matching password) did not respond within 10s.`
      : `Could not register or initialize room "${roomCode}" within 10s.`;

  return {
    step: clampedStep,
    errorTitle: spec?.errorTitle ?? fallbackTitle,
    errorDescription: msg || spec?.errorDescription || fallbackDesc,
  };
}

export interface UseOnlineRoomProgressControllerOptions {
  mode: 'join' | 'host';
  steps: CreationStepSpec[];
  controlledProgressStatus?: CreationProgressStatus;
  controlledCurrentStep?: number;
  onProgressStatusChange?: (status: CreationProgressStatus) => void;
  onCurrentStepChange?: (step: number) => void;
}

export interface StartOnlineRoomSequenceOptions {
  roomCode: string;
  willFail: boolean;
  stepIntervalMs?: number;
  executeAsyncLaunch?: () => Promise<boolean>;
  onSuccess: () => void;
  onFailure?: () => void;
  onPreviewComplete?: () => void;
}

export function useOnlineRoomProgressController({
  mode,
  steps,
  controlledProgressStatus,
  controlledCurrentStep,
  onProgressStatusChange,
  onCurrentStepChange,
}: UseOnlineRoomProgressControllerOptions) {
  const setToken = useMenuLayoutStore((s) => s.setToken);
  const totalSteps = steps.length || 5;

  const [internalProgressStatus, setInternalProgressStatus] =
    useState<CreationProgressStatus>('idle');
  const [internalCurrentStep, setInternalCurrentStep] = useState<number>(1);
  const [runtimeFailure, setRuntimeFailure] =
    useState<ClassifiedRoomStepFailure | null>(null);

  const progressStatus = controlledProgressStatus ?? internalProgressStatus;
  const currentStep = controlledCurrentStep ?? internalCurrentStep;

  const stepRef = useRef<number>(currentStep);
  stepRef.current = currentStep;

  const attemptIdRef = useRef<number>(0);
  const stepTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isMountedRef = useRef<boolean>(true);

  const clearStepTimer = () => {
    if (stepTimerRef.current) {
      clearInterval(stepTimerRef.current);
      stepTimerRef.current = null;
    }
  };

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      attemptIdRef.current += 1;
      clearStepTimer();
    };
  }, []);

  const setProgressStatus = (status: CreationProgressStatus) => {
    if (!isMountedRef.current) return;
    if (controlledProgressStatus === undefined) {
      setInternalProgressStatus(status);
    }
    onProgressStatusChange?.(status);
  };

  const setCurrentStep = (nextStep: number) => {
    if (!isMountedRef.current) return;
    stepRef.current = nextStep;
    if (controlledCurrentStep === undefined) {
      setInternalCurrentStep(nextStep);
    }
    onCurrentStepChange?.(nextStep);
  };

  const failAtStep = (
    step: number,
    errorTitle?: string,
    errorDescription?: string,
    roomCode?: string
  ) => {
    attemptIdRef.current += 1;
    clearStepTimer();
    const spec = steps[Math.max(0, Math.min(totalSteps - 1, step - 1))];
    const resolvedTitle =
      errorTitle ?? spec?.errorTitle ?? `${spec?.stageTitle ?? 'Step'} (Failed)`;
    const resolvedDesc =
      errorDescription ??
      spec?.errorDescription ??
      'Could not bind or connect to signaling room within 10s.';

    setRuntimeFailure({
      step,
      errorTitle: resolvedTitle,
      errorDescription: resolvedDesc,
    });
    setCurrentStep(step);
    setProgressStatus('error');
    setToken('simulateLayer3Error', true);
    dispatchOnlineRoomErrorNotification(
      resolvedTitle,
      `${resolvedDesc}${roomCode ? `\nAttempted Room: ${roomCode}` : ''}`
    );
  };

  const cancelSequence = (onCancelExtra?: () => void) => {
    attemptIdRef.current += 1;
    clearStepTimer();
    clearOnlineRoomLaunchError();
    setRuntimeFailure(null);
    setProgressStatus('idle');
    setCurrentStep(1);
    setToken('simulateLayer3Error', false);
    useQuickNotificationStore.getState().dismissNotification('online-room-error');
    onCancelExtra?.();
  };

  const startSequence = ({
    roomCode,
    willFail,
    stepIntervalMs,
    executeAsyncLaunch,
    onSuccess,
    onFailure,
    onPreviewComplete,
  }: StartOnlineRoomSequenceOptions) => {
    attemptIdRef.current += 1;
    const currentAttemptId = attemptIdRef.current;
    clearStepTimer();
    clearOnlineRoomLaunchError();
    setRuntimeFailure(null);

    if (controlledProgressStatus !== undefined) {
      if (executeAsyncLaunch) {
        void executeAsyncLaunch().then((ok) => {
          if (attemptIdRef.current !== currentAttemptId) return;
          if (ok) onSuccess();
          else onFailure?.();
        });
      } else {
        onPreviewComplete?.();
      }
      return;
    }

    setToken('simulateLayer3Error', false);
    useQuickNotificationStore.getState().dismissNotification('online-room-error');
    setCurrentStep(1);
    setProgressStatus('running');

    const hasRealAsyncLaunch = Boolean(executeAsyncLaunch) && !willFail;
    const intervalMs =
      stepIntervalMs ?? (hasRealAsyncLaunch ? (mode === 'join' ? 1500 : 420) : 520);

    stepTimerRef.current = setInterval(() => {
      if (!isMountedRef.current || attemptIdRef.current !== currentAttemptId) {
        clearStepTimer();
        return;
      }
      const next = stepRef.current + 1;

      if (willFail && next === 3) {
        failAtStep(3, undefined, undefined, roomCode);
        return;
      }

      if (next >= totalSteps) {
        clearStepTimer();
        setCurrentStep(totalSteps);
        if (!hasRealAsyncLaunch) {
          setProgressStatus('completed');
          onPreviewComplete?.();
        }
        return;
      }

      setCurrentStep(next);
    }, intervalMs);

    if (hasRealAsyncLaunch && executeAsyncLaunch) {
      void executeAsyncLaunch()
        .then((ok) => {
          if (!isMountedRef.current || attemptIdRef.current !== currentAttemptId) return;
          clearStepTimer();
          if (ok) {
            setCurrentStep(totalSteps);
            setProgressStatus('completed');
            onSuccess();
          } else {
            const recorded = consumeOnlineRoomLaunchError();
            const classified = classifyOnlineRoomFailure(
              mode,
              recorded?.message,
              roomCode,
              steps
            );
            onFailure?.();
            failAtStep(
              classified.step,
              classified.errorTitle,
              classified.errorDescription,
              roomCode
            );
          }
        })
        .catch((err: unknown) => {
          if (!isMountedRef.current || attemptIdRef.current !== currentAttemptId) return;
          clearStepTimer();
          const rawMsg = err instanceof Error ? err.message : String(err);
          const classified = classifyOnlineRoomFailure(mode, rawMsg, roomCode, steps);
          onFailure?.();
          failAtStep(
            classified.step,
            classified.errorTitle,
            classified.errorDescription,
            roomCode
          );
        });
    }
  };

  const effectiveSteps = useMemo(() => {
    if (!runtimeFailure) return steps;
    return steps.map((spec) =>
      spec.step === runtimeFailure.step
        ? {
            ...spec,
            errorTitle: runtimeFailure.errorTitle,
            errorDescription: runtimeFailure.errorDescription,
          }
        : spec
    );
  }, [steps, runtimeFailure]);

  return {
    progressStatus,
    currentStep,
    totalSteps,
    effectiveSteps,
    setProgressStatus,
    setCurrentStep,
    failAtStep,
    startSequence,
    cancelSequence,
  };
}
