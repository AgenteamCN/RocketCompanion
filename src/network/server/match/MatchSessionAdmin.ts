/**
 * src/network/server/match/MatchSessionAdmin.ts
 * Authoritative Match Lifecycle, Roster, Signal & Command Coordinator.
 * Composes explicit MatchDomainState and stateful Sub-Controllers:
 * - roster (MatchRosterSubController: players, spectators, spawn/color slots, bot fill)
 * - lifecycle (MatchPhaseLifecycleSubController: lobby, countdown, kickoff, playing, goal, replay, overtime, podium)
 * - commandQueue (MatchCommandQueueSubController: client command deduplication, votes, signal dispatch & ACKs)
 * - goalReplay (MatchGoalReplaySubController: goal replay slice playback & server-filled bot stepping)
 */

import { MATCH_SIGNALS } from '../../protocol/GlobalPayloadCodec.ts';
import { ReplayRingBuffer, REPLAY_BUFFER_MODES } from '../../../replay/ReplayRingBuffer.ts';
import {
  DiagnosticsTestVehicleController,
  DEFAULT_DIAGNOSTIC_FLEET,
} from '../../diagnostics/DiagnosticsTestVehicles.ts';
import type { RosterSnapshot } from './matchLoadoutAndSpawnPipeline.ts';
import {
  MatchDomainState,
  type MatchDomainStateOptions,
  type MatchSessionSnapshot,
} from './MatchDomainState.ts';
import {
  MatchRosterSubController,
  type MatchRosterHostPort,
  type RosterDataHandlerPort,
} from './MatchRosterSubController.ts';
import {
  MatchCommandQueueSubController,
  type CommandQueueSessionPort,
} from './MatchCommandQueueSubController.ts';
import {
  MatchGoalReplaySubController,
  type GoalReplayPhysicsManagerPort,
} from './MatchGoalReplaySubController.ts';
import {
  MatchPhaseLifecycleSubController,
  type PhaseLifecyclePhysicsManagerPort,
  type PhaseLifecycleSessionManagerPort,
  type PhaseLifecycleDiagnosticsPort,
} from './MatchPhaseLifecycleSubController.ts';
import {
  MatchSystemControlSubController,
  type TrainingRulesetConfigOptions,
  type SystemControlPhysicsManagerPort,
} from './MatchSystemControlSubController.ts';
import type { RosterPhysicsManagerPort } from './matchRosterPhysicsAndBotPipeline.ts';
import type { LifecyclePhysicsSnapshotPort } from './matchLifecyclePipeline.ts';

export type { MatchSessionSnapshot, TrainingRulesetConfigOptions };

export type AdminPhysicsManagerPort = PhaseLifecyclePhysicsManagerPort &
  RosterPhysicsManagerPort &
  GoalReplayPhysicsManagerPort &
  SystemControlPhysicsManagerPort & {
    setCarCollisionMask?: (
      carIndex: number,
      interactWithBall: boolean,
      interactWithCars: boolean,
      opacity?: number
    ) => unknown;
    lobbyGhostCoordinator?: {
      lobbyModeActive?: boolean;
      getCarGhostState?: (carIndex: number) => Record<string, unknown> | null;
    } | null;
  };

export type AdminSessionManagerPort = PhaseLifecycleSessionManagerPort &
  CommandQueueSessionPort &
  MatchRosterHostPort['sessionManager'];

export interface AdminDataHandlerPort extends RosterDataHandlerPort {
  dispatchFrameToSessions?: (bytes: Uint8Array) => void;
}

export type ClearRetainedReplayCallback = () => void;
export type RetainCompletedReplayCallback = (data: Record<string, unknown>) => void;

export interface MatchSessionAdminOptions extends MatchDomainStateOptions {
  physicsManager?: AdminPhysicsManagerPort | null;
  sessionManager?: AdminSessionManagerPort | null;
  dataHandler?: AdminDataHandlerPort | null;
  diagnosticsController?: PhaseLifecycleDiagnosticsPort | null;
  onClearRetainedReplay?: ClearRetainedReplayCallback | null;
  onRetainCompletedReplay?: RetainCompletedReplayCallback | null;
  replayCapacityTicks?: number;
  goalReplayLookbackSeconds?: number;
  goalReplayPostGoalSeconds?: number;
}

export class MatchSessionAdmin {
  readonly domain: MatchDomainState;

  private _physicsManager: AdminPhysicsManagerPort | null | undefined;
  private _sessionManager: AdminSessionManagerPort | null | undefined;
  private _dataHandler: AdminDataHandlerPort | null;
  private _replayBuffer: ReplayRingBuffer;
  diagnosticsController: PhaseLifecycleDiagnosticsPort;
  onClearRetainedReplay: ClearRetainedReplayCallback | null;
  onRetainCompletedReplay: RetainCompletedReplayCallback | null;

  readonly roster: MatchRosterSubController;
  readonly commandQueue: MatchCommandQueueSubController;
  readonly goalReplay: MatchGoalReplaySubController;
  readonly systemControl: MatchSystemControlSubController;
  readonly lifecycle: MatchPhaseLifecycleSubController;

  constructor(options: MatchSessionAdminOptions = {}) {
    this.domain = new MatchDomainState(options);

    this._physicsManager = options.physicsManager;
    this._sessionManager = options.sessionManager;
    this._dataHandler = options.dataHandler || null;
    this.diagnosticsController =
      options.diagnosticsController ||
      (new DiagnosticsTestVehicleController(
        DEFAULT_DIAGNOSTIC_FLEET
      ) as unknown as PhaseLifecycleDiagnosticsPort);
    this.onClearRetainedReplay = options.onClearRetainedReplay || null;
    this.onRetainCompletedReplay = options.onRetainCompletedReplay || null;

    this._replayBuffer = new ReplayRingBuffer({
      mode: this.domain.isTrainingMode
        ? REPLAY_BUFFER_MODES.COUNTUP_FIFO
        : REPLAY_BUFFER_MODES.COUNTDOWN_MATCH,
      capacityTicks: options.replayCapacityTicks,
    });

    this.roster = new MatchRosterSubController({
      domain: this.domain,
      physicsManager: this._physicsManager,
      sessionManager: this._sessionManager,
      dataHandler: this._dataHandler,
    });

    this.commandQueue = new MatchCommandQueueSubController({
      domain: this.domain,
      roster: this.roster,
      physicsManager: this._physicsManager,
      sessionManager: this._sessionManager,
      dataHandler: this._dataHandler,
      replayBuffer: this._replayBuffer,
    });

    const self = this;
    this.goalReplay = new MatchGoalReplaySubController(
      {
        domain: this.domain,
        commandQueue: this.commandQueue,
        get actions() {
          return self.lifecycle;
        },
        get replayBuffer() {
          return self._replayBuffer;
        },
        get physicsManager() {
          return self._physicsManager;
        },
      },
      {
        goalReplayLookbackSeconds: options.goalReplayLookbackSeconds,
        goalReplayPostGoalSeconds: options.goalReplayPostGoalSeconds,
      }
    );

    this.systemControl = new MatchSystemControlSubController({
      domain: this.domain,
      commandQueue: this.commandQueue,
      get physicsManager() {
        return self._physicsManager;
      },
      get replayBuffer() {
        return self._replayBuffer;
      },
      encodeFramePacket: (snap: LifecyclePhysicsSnapshotPort | null) =>
        this.lifecycle.encodeFramePacket(snap),
    });

    this.lifecycle = new MatchPhaseLifecycleSubController({
      domain: this.domain,
      roster: this.roster,
      commandQueue: this.commandQueue,
      goalReplay: this.goalReplay,
      systemControl: this.systemControl,
      get physicsManager() {
        return self._physicsManager;
      },
      get sessionManager() {
        return self._sessionManager;
      },
      get diagnosticsController() {
        return self.diagnosticsController;
      },
      get replayBuffer() {
        return self._replayBuffer as unknown as MatchPhaseLifecycleSubController['host']['replayBuffer'];
      },
      get onClearRetainedReplay() {
        return self.onClearRetainedReplay;
      },
      get onRetainCompletedReplay() {
        return self.onRetainCompletedReplay;
      },
    });

    this.roster.signalPort = this.commandQueue;
    this.roster.lobbyAutoStarter = this.lifecycle;
    this.commandQueue.lifecycle = this.lifecycle;
    this.commandQueue.goalReplay = this.goalReplay;
    this.commandQueue.systemControl = this.systemControl;
  }

  get physicsManager(): AdminPhysicsManagerPort | null | undefined {
    return this._physicsManager;
  }
  set physicsManager(value: AdminPhysicsManagerPort | null | undefined) {
    this._physicsManager = value;
    this.roster.physicsManager = value;
    this.commandQueue.physicsManager = value;
  }

  get sessionManager(): AdminSessionManagerPort | null | undefined {
    return this._sessionManager;
  }
  set sessionManager(value: AdminSessionManagerPort | null | undefined) {
    this._sessionManager = value;
    this.roster.sessionManager = value;
    this.commandQueue.sessionManager = value;
  }

  get dataHandler(): AdminDataHandlerPort | null {
    return this._dataHandler;
  }
  set dataHandler(value: AdminDataHandlerPort | null) {
    this._dataHandler = value;
    this.roster.dataHandler = value;
    this.commandQueue.dataHandler = value;
  }

  get replayBuffer(): ReplayRingBuffer {
    return this._replayBuffer;
  }
  set replayBuffer(value: ReplayRingBuffer) {
    this._replayBuffer = value;
    this.commandQueue.replayBuffer = value;
  }

  getSnapshot(): MatchSessionSnapshot {
    return this.domain.buildSessionSnapshot(this.roster.buildRosterSnapshot());
  }

  buildRosterSnapshot(): RosterSnapshot {
    return this.roster.buildRosterSnapshot();
  }

  removePlayerSession(sessionId: string): void {
    this.roster.removePlayerSession(sessionId);
  }

  destroy(): void {
    this.commandQueue.dispatchSignal(MATCH_SIGNALS.MATCH_DESTROYED, this.domain.matchTick, 0, 0);
    if (this._dataHandler && typeof this._dataHandler.dispatchFrameToSessions === 'function') {
      try {
        const finalBytes = this.lifecycle.encodeFramePacket(null);
        if (finalBytes && finalBytes.length > 0) {
          this._dataHandler.dispatchFrameToSessions(finalBytes);
        }
      } catch (err) {
        console.warn('[MatchSessionAdmin] Failed to flush MATCH_DESTROYED packet on destroy:', err);
      }
    }
    this.roster.clear();
    this.commandQueue.clear();
    this.goalReplay.clear();
    this.systemControl.clear();
    this._replayBuffer?.clear();
  }
}
