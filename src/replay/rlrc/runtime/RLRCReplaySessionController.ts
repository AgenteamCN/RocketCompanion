import { useReplayToRcsImporterStore } from '../../../game/runtimeUiPort.ts';
import { ReplayHotkeySubController } from '../../ReplayHotkeySubController.ts';
import type {
  ReplayScoreboardModePort,
  ReplayScoreboardRuntimePort,
} from '../../ReplayScoreboardSynchronizer.ts';
import {
  buildRLRCSessionFromParserOutput,
  convertRLReplayBufferToRLRC,
  type RLRCConvertedReplaySession,
} from '../RLReplayToRLRCConverter.ts';
import { RLRC_FIXED_DT, type RLRCPlayerSlotMeta } from '../RLRCReplayTypes.ts';
import { createRLRCInterveneEnvPort } from './RLRCInterveneEnvPortBuilder.ts';
import { RLRCInterveneTakeoverSubController } from './RLRCInterveneTakeoverSubController.ts';
import {
  RLRCPlaybackAudioEdgeSynthesizer,
  type RLRCPlaybackAudioRuntimePort,
} from './RLRCPlaybackAudioEdgeSynthesizer.ts';
import {
  RLRCPlaybackSyncApplier,
  type RLRCPlaybackRuntimePort,
} from './RLRCPlaybackSyncApplier.ts';
import {
  mapUiInterpolationMethod,
  mapUiNonPovMode,
  publishConvertedSessionTelemetry,
  readLiveRuntimePlayerControls,
  stepRLRCPlaybackCursor,
  syncRLRCNameTagRoster,
} from './RLRCReplaySessionBridgePipeline.ts';
import {
  applyRLRCFrameToSubsystems,
  applySelectedPovSlotToHudAndCamera,
  bindRLRCSessionUiAndHotkeys,
  executeRLRCExportPack,
  executeRLRCFileUpload,
  resetClearedReplayTelemetry,
  triggerRLRCInterveneFromCursor,
} from './RLRCReplayUiAndHudBinder.ts';

const getSt = () => useReplayToRcsImporterStore.getState();
const setTelem: ReturnType<typeof getSt>['updateLiveTelemetry'] = (p) =>
  getSt().updateLiveTelemetry(p);

export class RLRCReplaySessionController {
  public runtime: ReplayScoreboardRuntimePort | null;
  public mode: ReplayScoreboardModePort | null;
  public session: RLRCConvertedReplaySession | null = null;
  public cursorFrame120Hz = 0;
  public activePovSlotIndex = 0;
  public readonly playbackApplier = new RLRCPlaybackSyncApplier();
  public readonly interveneController: RLRCInterveneTakeoverSubController;
  public readonly hotkeySubController = new ReplayHotkeySubController();
  public readonly audioEdgeSynthesizer = new RLRCPlaybackAudioEdgeSynthesizer();
  private _frac = 0;
  private _tick = 0;
  private _hudKey = '';
  private _unsub: (() => void) | null = null;

  public constructor(
    runtime: ReplayScoreboardRuntimePort | null,
    mode: ReplayScoreboardModePort | null = null
  ) {
    this.runtime = runtime;
    this.mode = mode;
    this.interveneController = new RLRCInterveneTakeoverSubController(
      createRLRCInterveneEnvPort({
        getSession: () => this.session,
        getRuntime: () => this.runtime,
        getMode: () => this.mode,
      })
    );
  }

  public get hasLoadedReplay(): boolean {
    return (
      getSt().viewerState !== 'idle' && Boolean(this.session && this.session.frames120Hz.length > 0)
    );
  }

  public get isIntervening(): boolean {
    const v = getSt().viewerState;
    return v === 'preroll-countdown' || v === 'intervening';
  }

  public get isActive(): boolean {
    const st = getSt();
    return Boolean(
      st.isWindowOpen &&
      this.session &&
      this.session.frames120Hz.length > 0 &&
      st.viewerState !== 'idle' &&
      st.viewerState !== 'intervening'
    );
  }

  public attach(): void {
    this._unsub?.();
    this._unsub = bindRLRCSessionUiAndHotkeys(this.hotkeySubController, this);
  }

  public detach(): void {
    this._unsub?.();
    this._unsub = null;
    this.hotkeySubController.unbind();
  }

  public activateMode(): void {
    setTelem({ isWindowOpen: true, hasHotkeyPriority: true });
    if (this.session && this.session.frames120Hz.length > 0) {
      this._hudKey = '';
      this.audioEdgeSynthesizer.reset();
      this._syncRoster(this.session.roster);
      this._applyFrame(this.cursorFrame120Hz, false);
      this.runtime?.camera?.resetView?.();
    }
  }

  public deactivateMode(): void {
    if (this.isIntervening) this.interveneController.exitInterveneToViewing();
    this.audioEdgeSynthesizer.reset();
    setTelem({
      isWindowOpen: false,
      hasHotkeyPriority: false,
      viewerState: this.session ? 'paused' : 'idle',
    });
  }

  public async handleUploadFile(file: File): Promise<void> {
    await executeRLRCFileUpload(
      file,
      (buf, name) => this.loadReplayBuffer(buf, name),
      () => this.session
    );
  }

  public loadReplayBuffer(buffer: ArrayBuffer | Uint8Array, fileName = 'match.replay'): void {
    const interpolationMethod = mapUiInterpolationMethod(getSt().interpolationMethod);
    this._installSession(convertRLReplayBufferToRLRC(buffer, { interpolationMethod }), fileName, 0);
  }

  private _installSession(
    c: RLRCConvertedReplaySession,
    fileName: string,
    initialCursor: number
  ): void {
    this.session = c;
    const clamped = Math.max(0, Math.min(Math.max(0, c.frames120Hz.length - 1), initialCursor));
    this.cursorFrame120Hz = clamped;
    this._frac = clamped;
    this._tick = 0;
    this._hudKey = '';
    this.activePovSlotIndex = c.roster[0]?.slotIndex ?? 0;
    this._syncPov(this.activePovSlotIndex);
    this.audioEdgeSynthesizer.configureSession(
      c,
      this.runtime as unknown as RLRCPlaybackAudioRuntimePort
    );
    this._syncRoster(c.roster);
    this._applyFrame(clamped, false);
    this.runtime?.camera?.resetView?.();
    publishConvertedSessionTelemetry(c, fileName, clamped, this.activePovSlotIndex);
  }

  public async exportRcsReplayPack(): Promise<void> {
    await executeRLRCExportPack(this.session);
  }

  public startPlaying(): void {
    const s = this.session;
    if (!s || s.frames120Hz.length === 0) return;
    if (this.isIntervening) this.returnToReplay();
    if (this.cursorFrame120Hz >= s.frames120Hz.length - 1) {
      this.cursorFrame120Hz = 0;
      this._frac = 0;
      this.audioEdgeSynthesizer.reset();
    }
    this._tick = 0;
    setTelem({ viewerState: 'playing', cursorFrame: this.cursorFrame120Hz });
  }

  public pausePlaying(): void {
    if (!this.session || this.isIntervening) return;
    this.runtime?.audioSubsystem?.resetAudio?.();
    this.audioEdgeSynthesizer.reset();
    setTelem({
      viewerState: 'paused',
      cursorFrame: this.cursorFrame120Hz,
      targetFrame: this.cursorFrame120Hz,
    });
  }

  public beginScrub(direction: 'rewinding' | 'forwarding'): void {
    if (!this.session || this.isIntervening) return;
    this._tick = 0;
    setTelem({ viewerState: direction });
  }

  public pauseScrub(): void {
    const v = getSt().viewerState;
    if (v === 'rewinding' || v === 'forwarding') this.pausePlaying();
  }

  public seekFrame(frameIndex120Hz: number): void {
    const s = this.session;
    if (!s || s.frames120Hz.length === 0) return;
    if (this.isIntervening) {
      this.interveneController.exitInterveneToViewing();
      this._syncRoster(s.roster);
    }
    const clamped = Math.max(0, Math.min(s.frames120Hz.length - 1, Math.round(frameIndex120Hz)));
    this.cursorFrame120Hz = clamped;
    this._frac = clamped;
    this.audioEdgeSynthesizer.reset();
    this._hudKey = '';
    this._applyFrame(clamped, false);
    setTelem({ viewerState: 'paused', cursorFrame: clamped, targetFrame: clamped });
  }

  public selectPovSlot(slotKey: number): void {
    const s = this.session;
    if (!s) return;
    this._hudKey = '';
    const resolved = applySelectedPovSlotToHudAndCamera({
      roster: s.roster,
      slotKey,
      isIntervening: this.isIntervening,
      sessionPort: this.runtime,
      sessionMode: this.mode,
      interveneController: this.interveneController,
      syncPovToArena: (slot) => {
        this.activePovSlotIndex = slot;
        this._syncPov(slot);
      },
      applyCurrentFrame: () => this._applyFrame(this.cursorFrame120Hz, false),
    });
    if (!resolved) return;
  }

  public resumeFromCursor(): void {
    triggerRLRCInterveneFromCursor(
      this.session,
      this.cursorFrame120Hz,
      this.activePovSlotIndex,
      this.isIntervening,
      this.audioEdgeSynthesizer,
      this.interveneController
    );
  }

  public returnToReplay(): void {
    if (!this.session) return;
    const t0Frame = this.interveneController.exitInterveneToViewing();
    this._syncRoster(this.session.roster);
    this.seekFrame(t0Frame);
    this.runtime?.camera?.resetView?.();
  }

  public handleInterpolationMethodChange(uiMethod: string): void {
    if (!this.session?.parserOutput) return;
    const updated = buildRLRCSessionFromParserOutput(this.session.parserOutput, {
      interpolationMethod: mapUiInterpolationMethod(uiMethod),
    });
    this._installSession(updated, getSt().loadedFileName || 'match.replay', this.cursorFrame120Hz);
  }

  public handleNonPovModeChange(uiMode: string): void {
    this.interveneController.setNonPovMode(mapUiNonPovMode(uiMode));
  }

  public clearReplay(): void {
    if (this.isIntervening) this.interveneController.exitInterveneToViewing();
    this.runtime?.audioSubsystem?.resetAudio?.();
    this.audioEdgeSynthesizer.reset();
    this.session = null;
    this.cursorFrame120Hz = 0;
    this._frac = 0;
    this._tick = 0;
    this._hudKey = '';
    resetClearedReplayTelemetry();
  }

  public getViewerState(): string {
    return getSt().viewerState;
  }

  public getPhase(): string {
    return this.isActive && getSt().viewerState === 'paused'
      ? 'paused-viewer'
      : getSt().viewerState;
  }

  public onBeforePhysicsTick(dt = RLRC_FIXED_DT): boolean {
    if (!this.hasLoadedReplay) return true;
    const state = getSt().viewerState;
    if (state === 'intervening') {
      if (this.runtime?.keyboard && this.runtime.keyboard.ballControlEnabled) {
        this.runtime.keyboard.ballControlEnabled = false;
      }
      this.interveneController.stepBeforePhysicsTick(
        readLiveRuntimePlayerControls(this.runtime, this.activePovSlotIndex),
        dt
      );
      return true;
    }
    if (!this.isActive) return true;
    this.stepPlaybackTick(dt);
    return false;
  }

  public onAfterPhysicsTick(): void {
    if (!this.hasLoadedReplay) return;
    if (getSt().viewerState === 'intervening') {
      this.interveneController.stepAfterPhysicsTick(false);
    }
  }

  public stepPlaybackTick(dt = RLRC_FIXED_DT): boolean {
    const frames = this.session?.frames120Hz;
    if (!frames || frames.length === 0) return false;
    const st = getSt();
    const state = st.viewerState;
    if (state === 'preroll-countdown' || state === 'intervening') {
      this.interveneController.stepTick(
        readLiveRuntimePlayerControls(this.runtime, this.activePovSlotIndex),
        dt
      );
      return true;
    }
    const res = stepRLRCPlaybackCursor({
      state,
      effectiveFlowPct: st.effectiveFlowPct,
      maxF: frames.length - 1,
      prevFrac: this._frac,
      prevCursor: this.cursorFrame120Hz,
      prevTick: this._tick,
      applyFrame: (idx, sm) => this._applyFrame(idx, sm),
      pausePlaying: () => this.pausePlaying(),
    });
    this._frac = res.frac;
    this.cursorFrame120Hz = res.cursorFrame120Hz;
    this._tick = res.tick;
    return res.stepped;
  }

  private _syncPov(slot: number): void {
    if (!this.runtime) return;
    this.runtime.playerCarIndex = slot;
    if (this.runtime.arena) this.runtime.arena.playerCarIndex = slot;
  }

  private _syncRoster(roster: readonly RLRCPlayerSlotMeta[]): void {
    this.playbackApplier.configureRoster(
      roster,
      this.runtime as unknown as RLRCPlaybackRuntimePort
    );
    syncRLRCNameTagRoster(roster, this.activePovSlotIndex);
  }

  private _applyFrame(idx: number, smoothStep: boolean): void {
    this._hudKey = applyRLRCFrameToSubsystems({
      session: this.session,
      idx,
      smoothStep,
      activePovSlotIndex: this.activePovSlotIndex,
      isIntervening: this.isIntervening,
      sessionPort: this.runtime,
      playbackApplier: this.playbackApplier,
      audioEdgeSynthesizer: this.audioEdgeSynthesizer,
      prevHudKey: this._hudKey,
    });
  }
}
