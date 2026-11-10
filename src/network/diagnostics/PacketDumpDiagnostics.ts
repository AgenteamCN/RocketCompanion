import {
  EstablishedSessionManager,
  type ParsedClientPacketHeader,
} from '../server/EstablishedSessionManager.ts';
import { GlobalPayloadCodec, type DecodedGlobalPayload } from '../protocol/GlobalPayloadCodec.ts';
import { GameStateView } from '../../physics/RocketSimStateViews.ts';

export interface DumpedPhysicsSnapshot {
  tick: number;
  boostPadMaskLow?: number;
  boostPadMaskHigh?: number;
  acknowledgedControls: DecodedGlobalPayload['physics'] extends { acknowledgedControls: infer A }
    ? A
    : unknown[];
  cars: Array<Record<string, unknown>>;
  ball: Record<string, unknown> | null;
  rawSnapshotLength?: number;
}

export interface DumpedNetworkPacket {
  inspectionTimestamp: number;
  summary: Record<string, unknown>;
  clientHeader: Record<string, unknown> | null;
  signals: DecodedGlobalPayload['signals'];
  allUserRtt: DecodedGlobalPayload['allUserRtt'];
  physics: DumpedPhysicsSnapshot | null;
}

export interface InspectablePacketInput {
  clientHeader?: ParsedClientPacketHeader | null;
  globalPayload?: DecodedGlobalPayload | null;
  rawBytes?: Uint8Array | ArrayBuffer;
}

export function dumpNetworkPacket(
  item: InspectablePacketInput | Uint8Array | ArrayBuffer | null | undefined
): DumpedNetworkPacket | null {
  if (!item) {
    console.warn('[NetworkPacket] No network packet available to inspect.');
    return null;
  }

  let parsed: InspectablePacketInput | null = null;
  if (item instanceof Uint8Array || item instanceof ArrayBuffer) {
    const clientHeader = EstablishedSessionManager.parseClientPacket(item);
    const globalPayload = clientHeader?.globalPayloadSlice
      ? GlobalPayloadCodec.decode(clientHeader.globalPayloadSlice)
      : null;
    parsed = { clientHeader, globalPayload, rawBytes: item };
  } else if (typeof item === 'object') {
    parsed = item;
  }

  const output: DumpedNetworkPacket = {
    inspectionTimestamp: performance.now(),
    summary: {},
    clientHeader: null,
    signals: [],
    allUserRtt: null,
    physics: null,
  };

  if (parsed?.clientHeader) {
    const ch = parsed.clientHeader;
    const roundTripMs =
      ch.clientTimestamp > 0 ? (performance.now() - ch.clientTimestamp).toFixed(2) + ' ms' : 'N/A';
    Object.assign(output, {
      clientHeader: {
        clientTimestamp: ch.clientTimestamp,
        serverTimestamp: ch.serverTimestamp,
        inputBufferSize: ch.inputBufferSize,
        inferredRoundTrip: roundTripMs,
      },
    });
    Object.assign(output.summary, {
      inputBufferSize: ch.inputBufferSize,
      inferredRtt: roundTripMs,
    });
  }

  const gp = parsed?.globalPayload;
  if (gp) {
    if (gp.signals && gp.signals.length > 0) {
      Object.assign(output, { signals: gp.signals });
      Object.assign(output.summary, { signalsCount: gp.signals.length });
    }
    if (gp.allUserRtt) {
      Object.assign(output, { allUserRtt: gp.allUserRtt });
      Object.assign(output.summary, { playersRtt: gp.allUserRtt.players });
    }
    if (gp.hasPhysics && gp.physics) {
      const phy = gp.physics;
      Object.assign(output.summary, { serverTick: phy.tick });
      const physicsDump: DumpedPhysicsSnapshot = {
        tick: phy.tick,
        boostPadMaskLow: phy.boostPadMaskLow,
        boostPadMaskHigh: phy.boostPadMaskHigh,
        acknowledgedControls: phy.acknowledgedControls,
        cars: [],
        ball: null,
      };
      Object.assign(output, { physics: physicsDump });

      if (phy.stateSnapshot && phy.stateSnapshot.length > 0) {
        try {
          const gv = new GameStateView();
          gv.attach(phy.stateSnapshot);
          physicsDump.ball = {
            pos: {
              x: +gv.ball.posX.toFixed(2),
              y: +gv.ball.posY.toFixed(2),
              z: +gv.ball.posZ.toFixed(2),
            },
            vel: {
              x: +gv.ball.velX.toFixed(2),
              y: +gv.ball.velY.toFixed(2),
              z: +gv.ball.velZ.toFixed(2),
            },
            angVel: {
              x: +gv.ball.angVelX.toFixed(2),
              y: +gv.ball.angVelY.toFixed(2),
              z: +gv.ball.angVelZ.toFixed(2),
            },
          };
          const activeCars = Math.min(8, Math.max(1, gv.header.numCars || 2));
          for (let i = 0; i < activeCars; i++) {
            const car = gv.getCar(i);
            physicsDump.cars.push({
              carIndex: i,
              pos: { x: +car.posX.toFixed(2), y: +car.posY.toFixed(2), z: +car.posZ.toFixed(2) },
              vel: { x: +car.velX.toFixed(2), y: +car.velY.toFixed(2), z: +car.velZ.toFixed(2) },
              fwd: { x: +car.fwdX.toFixed(2), y: +car.fwdY.toFixed(2), z: +car.fwdZ.toFixed(2) },
              boost: +car.boost.toFixed(1),
              onGround: Boolean(car.isOnGround),
              supersonic: Boolean(car.isSupersonic),
            });
          }
        } catch (e) {
          console.warn('[PredictionReconciler] Failed to parse car snapshot in diagnostics:', e);
          physicsDump.rawSnapshotLength = phy.stateSnapshot.length;
        }
      }
    }
  }

  try {
    console.group(
      `%c[NETWORK PACKET DUMP]%c ServerTick: ${output.summary.serverTick ?? 'N/A'} | InputBuffer: ${output.summary.inputBufferSize ?? 'N/A'} | InferredRTT: ${output.summary.inferredRtt ?? 'N/A'}`,
      'background:#1f6feb;color:#fff;padding:2px 6px;border-radius:3px;font-weight:bold',
      'color:#58a6ff;font-weight:bold'
    );
    console.log('Complete Parsed Datagram:', output);
    if (output.clientHeader) {
      console.log('17-byte Client Header:', output.clientHeader);
    }
    if (output.physics) {
      console.log('Authoritative Physics Tick:', output.physics.tick);
      if (output.physics.acknowledgedControls?.length) {
        console.table(
          output.physics.acknowledgedControls.map((a: { carIndex: number; controls: unknown }) => ({
            carIndex: a.carIndex,
            ...((a.controls as Record<string, unknown>) || {}),
          }))
        );
      }
      if (output.physics.cars?.length) {
        console.table(output.physics.cars);
      }
      if (output.physics.ball) {
        console.log('Authoritative Ball State:', output.physics.ball);
      }
    }
    if (output.signals?.length) {
      console.table(output.signals);
    }
    console.groupEnd();
  } catch (err) {
    console.error('[PredictionReconciler] Failed to print packet diagnostics:', err);
  }

  return output;
}
