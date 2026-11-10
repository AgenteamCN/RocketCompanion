/**
 * RLRCReplayUiAndHudBinder.ts
 * Vertical UI store handler binding, ReplayHotkeySubController wiring, upload/export orchestration,
 * POV slot selection with Goal Replay camera override, and frame subsystem sync
 * for RLRCReplaySessionController.
 */

import {
  hudStore,
  useQuickNotificationStore,
  useReplayToRcsImporterStore,
  useReplayViewerStore,
} from '../../../game/runtimeUiPort.ts';
import type { ReplayHotkeySubController } from '../../ReplayHotkeySubController.ts';
import type {
  ReplayScoreboardModePort,
  ReplayScoreboardRuntimePort,
} from '../../ReplayScoreboardSynchronizer.ts';
import type { RLRCConvertedReplaySession } from '../RLReplayToRLRCConverter.ts';
import type { RLRCPlayerSlotMeta, RLRCTeamIndex } from '../RLRCReplayTypes.ts';
import type { RLRCInterveneTakeoverSubController } from './RLRCInterveneTakeoverSubController.ts';
import type {
  RLRCPlaybackAudioEdgeSynthesizer,
  RLRCPlaybackAudioRuntimePort,
} from './RLRCPlaybackAudioEdgeSynthesizer.ts';
import type {
  RLRCPlaybackRuntimePort,
  RLRCPlaybackSyncApplier,
} from './RLRCPlaybackSyncApplier.ts';
import {
  downloadRcsReplayPack,
  mapUiNonPovMode,
  resolveRLRCPovSlotSelection,
  syncRLRCFrameHudMatchState,
  syncRLRCNameTagRoster,
} from './RLRCReplaySessionBridgePipeline.ts';

const CONFLICT_MSG =
  '[RLRCReplaySessionController] Replay Importer hotkeys (O/P/[/]/G) claimed by another window.';
const getSt = () => useReplayToRcsImporterStore.getState();
const setTelem: ReturnType<typeof getSt>['updateLiveTelemetry'] = (p) =>
  getSt().updateLiveTelemetry(p);

export interface RLRCSessionUiActionTarget {
  readonly runtime: ReplayScoreboardRuntimePort | null;
  readonly hasLoadedReplay: boolean;
  readonly isIntervening: boolean;
  readonly session: RLRCConvertedReplaySession | null;
  deactivateMode: () => void;
  handleUploadFile: (file: File) => Promise<void> | void;
  exportRcsReplayPack: () => Promise<void> | void;
  startPlaying: () => void;
  pausePlaying: () => void;
  seekFrame: (frameIndex120Hz: number) => void;
  selectPovSlot: (slotKey: number) => void;
  beginScrub: (direction: 'rewinding' | 'forwarding') => void;
  pauseScrub: () => void;
  resumeFromCursor: () => void;
  returnToReplay: () => void;
  handleInterpolationMethodChange: (method: string) => void;
  handleNonPovModeChange: (mode: string) => void;
  clearReplay: () => void;
}

export function bindRLRCSessionUiAndHotkeys(
  hotkeySubController: ReplayHotkeySubController,
  target: RLRCSessionUiActionTarget
): () => void {
  const onUploadRLReplayFile = (f: File) => void target.handleUploadFile(f);
  const onExportRcsReplayPack = () => void target.exportRcsReplayPack();
  const onStartPlaying = () => target.startPlaying();
  const onPausePlaying = () => target.pausePlaying();
  const onSeekFrame = (f: number) => target.seekFrame(f);
  const onSelectPovSlot = (k: number | null) => target.selectPovSlot(k ?? 1);
  const onPushBackwardStart = () => target.beginScrub('rewinding');
  const onPushBackwardStop = () => target.pauseScrub();
  const onPushForwardStart = () => target.beginScrub('forwarding');
  const onPushForwardStop = () => target.pauseScrub();
  const onResumeFromHere = () => target.resumeFromCursor();
  const onReturnToReplay = () => target.returnToReplay();
  const onInterpolationMethodChange = (m: string) => target.handleInterpolationMethodChange(m);
  const onNonPovInterventionModeChange = (m: string) => target.handleNonPovModeChange(m);
  const onClearReplay = () => target.clearReplay();

  getSt().setRuntimeHandlers({
    onUploadRLReplayFile,
    onExportRcsReplayPack,
    onStartPlaying,
    onPausePlaying,
    onSeekFrame,
    onSelectPovSlot,
    onPushBackwardStart,
    onPushBackwardStop,
    onPushForwardStart,
    onPushForwardStop,
    onResumeFromHere,
    onReturnToReplay,
    onInterpolationMethodChange,
    onNonPovInterventionModeChange,
    onClearReplay,
  });

  const getWindowStatus = () => ({
    isWindowOpen: Boolean(getSt().isWindowOpen),
    hasHotkeyPriority: Boolean(getSt().hasHotkeyPriority),
  });
  const getRuntime = () => target.runtime as Record<string, unknown> | null;
  const hasLoadedReplay = () => target.hasLoadedReplay;
  const hasFrames = () => Boolean(target.session && target.session.frames120Hz.length > 0);
  const onHotkeySelectPovSlot = (k: number) => target.selectPovSlot(k);
  const onResumeFromCursor = () => target.resumeFromCursor();
  const onBeginScrub = (dir: 'rewinding' | 'forwarding') => target.beginScrub(dir);
  const onPauseScrub = () => target.pauseScrub();

  hotkeySubController.bindReplayViewerHotkeys({
    getRuntime,
    hasLoadedReplay,
    hasFrames,
    getWindowStatus,
    conflictErrorMessage: CONFLICT_MSG,
    onSelectPovSlot: onHotkeySelectPovSlot,
    onStartPlaying,
    onPausePlaying,
    onResumeFromCursor,
    onBeginScrub,
    onPauseScrub,
  });

  const unsubImporter = useReplayToRcsImporterStore.subscribe(() => {
    hotkeySubController.checkWindowOpenAndPriority(getWindowStatus(), CONFLICT_MSG);
  });

  let prevViewerOpen = Boolean(useReplayViewerStore.getState().isWindowOpen);
  let prevViewerLoading = Boolean(useReplayViewerStore.getState().isLoadingReplay);
  let prevViewerState = useReplayViewerStore.getState().viewerState;
  const unsubStandardViewer = useReplayViewerStore.subscribe(() => {
    const vSt = useReplayViewerStore.getState();
    const openedNow = !prevViewerOpen && Boolean(vSt.isWindowOpen);
    const loadingNow = !prevViewerLoading && Boolean(vSt.isLoadingReplay);
    const playingNow =
      prevViewerState !== vSt.viewerState &&
      (vSt.viewerState === 'playing' ||
        vSt.viewerState === 'forwarding' ||
        vSt.viewerState === 'rewinding');
    prevViewerOpen = Boolean(vSt.isWindowOpen);
    prevViewerLoading = Boolean(vSt.isLoadingReplay);
    prevViewerState = vSt.viewerState;
    if ((openedNow || loadingNow || playingNow) && (getSt().isWindowOpen || target.isIntervening)) {
      target.deactivateMode();
    }
  });

  return () => {
    unsubImporter();
    unsubStandardViewer();
  };
}

export function pushRLRCUploadNotification(
  id: 'rlrc-replay-loaded' | 'rlrc-replay-error',
  content: string,
  tone: 'info' | 'error',
  duration: number
): void {
  try {
    useQuickNotificationStore.getState().pushNotification({
      id,
      content,
      type: 'temporary',
      duration,
      tone,
    });
  } catch {
    /* ignore notification schema errors in headless environments */
  }
}

export async function executeRLRCFileUpload(
  file: File,
  loadReplayBuffer: (buf: ArrayBuffer, fileName: string) => void,
  getSession: () => RLRCConvertedReplaySession | null
): Promise<void> {
  setTelem({ isLoadingReplay: true, errorMessage: null });
  try {
    const buf = await file.arrayBuffer();
    loadReplayBuffer(buf, file.name);
    const s = getSession();
    pushRLRCUploadNotification(
      'rlrc-replay-loaded',
      `RL Replay Converted (120Hz): ${file.name} (${s?.frames120Hz.length ?? 0} frames, ${s?.roster.length ?? 0} players).`,
      'info',
      2800
    );
  } catch (err) {
    const errorMessage = `Failed to parse .replay: ${err instanceof Error ? err.message : String(err)}`;
    setTelem({ isLoadingReplay: false, errorMessage });
    pushRLRCUploadNotification('rlrc-replay-error', errorMessage, 'error', 3600);
  }
}

export async function executeRLRCExportPack(
  session: RLRCConvertedReplaySession | null
): Promise<void> {
  if (!session) return;
  setTelem({ isExportingRcsPack: true });
  try {
    await downloadRcsReplayPack(session, getSt().loadedFileName);
  } finally {
    setTelem({ isExportingRcsPack: false });
  }
}

export function applySelectedPovSlotToHudAndCamera(params: {
  readonly roster: readonly RLRCPlayerSlotMeta[];
  readonly slotKey: number;
  readonly isIntervening: boolean;
  readonly sessionPort: ReplayScoreboardRuntimePort | null;
  readonly sessionMode: ReplayScoreboardModePort | null;
  readonly interveneController: RLRCInterveneTakeoverSubController;
  readonly syncPovToArena: (slot: number) => void;
  readonly applyCurrentFrame: () => void;
}): { readonly slot: number; readonly key: number; readonly povTeam: RLRCTeamIndex } | null {
  const {
    roster,
    slotKey,
    isIntervening,
    sessionPort,
    sessionMode,
    interveneController,
    syncPovToArena,
    applyCurrentFrame,
  } = params;
  const resolved = resolveRLRCPovSlotSelection(roster, slotKey, sessionPort);
  if (!resolved) return null;
  const { key, slot, povTeam } = resolved;
  if (isIntervening) interveneController.povSlotIndex = slot;
  syncPovToArena(slot);
  syncRLRCNameTagRoster(roster, slot);
  hudStore.getState().setMatchState({ localTeam: isIntervening ? povTeam : 0 });
  if (sessionMode?.directorPreview?.isReplayActive || sessionMode?.isGoalReplayActive?.()) {
    if (sessionMode.directorPreview) sessionMode.directorPreview.goalScorerCarIndex = slot;
    sessionMode.setReplayCameraMode?.('pov');
    sessionPort?.releaseGoalReplayCameraOverride?.();
    hudStore.getState().setReplayState({ replayCameraMode: 'pov' });
  } else if (!isIntervening) {
    applyCurrentFrame();
  }
  sessionPort?.camera?.resetView?.();
  setTelem({ activePovCarIndex: slot, activePovSlotKey: key, activePovTeam: povTeam });
  return { slot, key, povTeam };
}

export function triggerRLRCInterveneFromCursor(
  session: RLRCConvertedReplaySession | null,
  cursorFrame120Hz: number,
  activePovSlotIndex: number,
  isIntervening: boolean,
  audioEdgeSynthesizer: RLRCPlaybackAudioEdgeSynthesizer,
  interveneController: RLRCInterveneTakeoverSubController
): void {
  if (!session || session.frames120Hz.length === 0) return;
  const st = getSt();
  audioEdgeSynthesizer.reset();
  const opts = {
    povSlotIndex: activePovSlotIndex,
    nonPovMode: mapUiNonPovMode(st.nonPovInterventionMode),
    downCounterSeconds: st.downCounterSec,
  };
  if (isIntervening) interveneController.reinterveneAtLastTargetFrame(opts);
  else interveneController.enterInterveneAtFrame(cursorFrame120Hz, opts);
}

export function resetClearedReplayTelemetry(): void {
  setTelem({
    viewerState: 'idle',
    loadedFileName: null,
    totalFrames: 0,
    cursorFrame: 0,
    targetFrame: 0,
    nativeEventTrackCount: 0,
    keyframeTrackCount: 0,
    incidentMarkers: [],
    signalMarkers: [],
    nativeEventMarkers: [],
    keyframeMarkers: [],
    trackDeltaSummary: null,
    errorMessage: null,
  });
}

export function applyRLRCFrameToSubsystems(params: {
  readonly session: RLRCConvertedReplaySession | null;
  readonly idx: number;
  readonly smoothStep: boolean;
  readonly activePovSlotIndex: number;
  readonly isIntervening: boolean;
  readonly sessionPort: ReplayScoreboardRuntimePort | null;
  readonly playbackApplier: RLRCPlaybackSyncApplier;
  readonly audioEdgeSynthesizer: RLRCPlaybackAudioEdgeSynthesizer;
  readonly prevHudKey: string;
}): string {
  const {
    session,
    idx,
    smoothStep,
    activePovSlotIndex,
    isIntervening,
    sessionPort,
    playbackApplier,
    audioEdgeSynthesizer,
    prevHudKey,
  } = params;
  const f = session?.frames120Hz[idx];
  if (!f) return prevHudKey;
  playbackApplier.applyFrame120Hz(f, sessionPort as unknown as RLRCPlaybackRuntimePort, {
    smoothStep,
    activePovSlotIndex,
  });
  audioEdgeSynthesizer.stepFrame(f, {
    smoothStep,
    activePovSlotIndex,
    runtime: sessionPort as unknown as RLRCPlaybackAudioRuntimePort,
    bookmarks: session?.bookmarks ?? [],
  });
  return syncRLRCFrameHudMatchState(
    f,
    session?.roster ?? [],
    activePovSlotIndex,
    isIntervening,
    prevHudKey
  );
}
