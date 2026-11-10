/**
 * temTrainingPackParser.ts
 * Converts parsed Rocket League Custom Training Pack (.Tem) documents into native
 * RocketCompanion Generation-2 .RLRCSPack / .RCSPack bundles (StaticTrainingPackMetadata + StaticTrainingShotItem[]),
 * mapping VelocityStartRotationR and EditorFreeCam directly into shot items, setting description to
 * "$Code by $CreatorName" (or empty), and storing remaining unmapped .Tem attributes in originalDescription.
 */

import {
  type StaticTrainingPackMetadata,
  type StaticTrainingShotItem,
  type StaticTrainingEditorFreeCam,
  type RCSPackArchive,
  MAX_SHOTS_PER_PACK,
  generateUUID,
  createDefaultShotItem,
  cloneShotItem,
} from './staticTrainingPackTypes';
import { resolveRecommendedVariationForPack } from './staticTrainingVariationTypes';
import { type TemSaveDataEnvelope, type TemObjectTypeEntry, type TemObjectRecord, type TemEnrichedArchetype, type TemRoundRecord, type ParsedTemTrainingPack, type ParsedTemDocument, uruToDegrees, uruToRadians, parseTemBinaryBytes } from './temPropertyDeserializer';
import { extractEpochMs, isDefaultRlEditorFreeCam, derivePackTagsAndMetadata } from './temMetadataAndTagClassifier';

export type { TemSaveDataEnvelope, TemObjectTypeEntry, TemObjectRecord, TemEnrichedArchetype, TemRoundRecord, ParsedTemTrainingPack, ParsedTemDocument };

const CAR_GROUND_SETTLE_THRESHOLD_Z = 45.0;
const CAR_GROUND_DEFAULT_Z = 17.05;
const BALL_GROUND_MIN_Z = 93.15;

export interface TemToRCSPackConversionResult {
  parsedTem: ParsedTemTrainingPack;
  metadata: StaticTrainingPackMetadata;
  items: StaticTrainingShotItem[];
  totalTemRoundsCount: number;
  truncatedFromRoundsCount: number | null;
  unmappedDescriptionDump: Record<string, unknown>;
  archive: RCSPackArchive;
}

export type ConvertedTemPackBundle = TemToRCSPackConversionResult;

/**
 * Converts a parsed `.Tem` document into a Generation-2 RocketCompanion Static Training Pack
 * (`RLRCSPack` / `RCSPackArchive`).
 *
 * - Maps directly supported physics/timing fields (`TM_Name`, `TM_Guid`, `CreatedAt`, `UpdatedAt`,
 *   `TimeLimit`, `Ball_GameEditor` location/speed/direction + `VelocityStartRotationR`,
 *   `DynamicSpawnPointMesh` location/rotation/speed, and `EditorFreeCam` camera pose).
 * - Sets `metadata.description` to `"$Code by $CreatorName"` (or `""` if neither exists).
 * - Stores only the remaining unmapped `.Tem` attributes in `metadata.originalDescription`.
 */
export function convertParsedTemToRCSPackBundle(
  parsedTem: ParsedTemTrainingPack
): TemToRCSPackConversionResult {
  const now = Date.now();
  const primaryObj =
    parsedTem.objects.find((o) => o.type.includes('TrainingEditorData_TA')) ||
    parsedTem.objects[0];
  const props = primaryObj?.properties || parsedTem.properties || {};

  const rawGuid =
    typeof props.TM_Guid === 'string' && props.TM_Guid.trim()
      ? props.TM_Guid.trim()
      : generateUUID();
  const rawTitle =
    typeof props.TM_Name === 'string' && props.TM_Name.trim()
      ? props.TM_Name.trim()
      : parsedTem.fileName.replace(/\.tem$/i, '') || 'Imported .Tem Pack';

  const rawCode =
    typeof props.Code === 'string' && props.Code.trim() ? props.Code.trim() : undefined;
  const rawCreator =
    typeof props.CreatorName === 'string' && props.CreatorName.trim()
      ? props.CreatorName.trim()
      : undefined;

  const createdAt = extractEpochMs(props.CreatedAt, now);
  const updatedAt = extractEpochMs(props.UpdatedAt, createdAt);

  const rawRounds = Array.isArray(props.Rounds) ? (props.Rounds as TemRoundRecord[]) : [];
  const totalTemRoundsCount = rawRounds.length;
  const cappedRounds = rawRounds.slice(0, MAX_SHOTS_PER_PACK);
  const truncatedFromRoundsCount =
    totalTemRoundsCount > MAX_SHOTS_PER_PACK ? totalTemRoundsCount : null;

  const extraRoundAttributes: Array<Record<string, unknown>> = [];
  const items: StaticTrainingShotItem[] = cappedRounds.map((round, idx) => {
    const archetypes = Array.isArray(round.SerializedArchetypes)
      ? round.SerializedArchetypes
      : [];

    let ballArch: TemEnrichedArchetype | null = null;
    let carArch: TemEnrichedArchetype | null = null;
    let camArch: TemEnrichedArchetype | null = null;
    const unknownArchetypes: unknown[] = [];

    for (const entry of archetypes) {
      if (entry && typeof entry === 'object') {
        const arch = entry as TemEnrichedArchetype;
        if (arch.role === 'Ball' || String(arch.ObjectArchetype || '').includes('Ball')) {
          ballArch = arch;
        } else if (
          arch.role === 'PlayerCarSpawn' ||
          String(arch.ObjectArchetype || '').includes('DynamicSpawnPointMesh')
        ) {
          carArch = arch;
        } else if (arch.role === 'EditorFreeCam' || arch.IsPC === true) {
          camArch = arch;
        } else {
          unknownArchetypes.push(arch);
        }
      } else {
        unknownArchetypes.push(entry);
      }
    }

    const timeoutSeconds = Number.isFinite(Number(round.TimeLimit))
      ? Math.max(1, Math.min(60, Number(round.TimeLimit)))
      : 10;

    const ballX = Number(ballArch?.StartLocationX ?? 0);
    const ballY = Number(ballArch?.StartLocationY ?? 0);
    const ballZ = Math.max(
      BALL_GROUND_MIN_Z,
      Number(ballArch?.StartLocationZ ?? BALL_GROUND_MIN_Z)
    );
    const ballSpeed = Math.max(0, Math.min(4000, Number(ballArch?.VelocityStartSpeed ?? 0)));
    const ballPitchRad = uruToRadians(Number(ballArch?.VelocityStartRotationP ?? 0));
    const ballYawRad = uruToRadians(Number(ballArch?.VelocityStartRotationY ?? 0));
    const ballRollRad = uruToRadians(Number(ballArch?.VelocityStartRotationR ?? 0));

    const kickoffState = ballSpeed <= 1e-3 && ballZ > BALL_GROUND_MIN_Z + 5.0;

    const carX = Number(carArch?.LocationX ?? 0);
    const carY = Number(carArch?.LocationY ?? -2400);
    const rawCarZ = Number(carArch?.LocationZ ?? 30);
    const carPitchRad = uruToRadians(Number(carArch?.RotationP ?? 0));
    const carYawRad = uruToRadians(Number(carArch?.RotationY ?? 16384));
    const carRollRad = uruToRadians(Number(carArch?.RotationR ?? 0));
    const carSpeed = Math.max(0, Math.min(2300, Number(carArch?.VelocityStartSpeed ?? 0)));

    const isCarGrounded =
      rawCarZ <= CAR_GROUND_SETTLE_THRESHOLD_Z &&
      Math.abs(carPitchRad) < 1e-3 &&
      Math.abs(carRollRad) < 1e-3;
    const effectiveCarZ = isCarGrounded
      ? CAR_GROUND_DEFAULT_Z
      : Math.max(CAR_GROUND_DEFAULT_Z, rawCarZ);

    let editorFreeCam: StaticTrainingEditorFreeCam | undefined;
    if (camArch) {
      const camLoc: [number, number, number] = [
        Number(camArch.LocationX ?? 0),
        Number(camArch.LocationY ?? 0),
        Number(camArch.LocationZ ?? 0),
      ];
      const camPitchUru = Number(camArch.RotationP ?? 0);
      const camYawUru = Number(camArch.RotationY ?? 0);
      const camRollUru = Number(camArch.RotationR ?? 0);
      const isDefaultOverview = isDefaultRlEditorFreeCam(
        camLoc,
        uruToDegrees(camPitchUru),
        uruToDegrees(camYawUru)
      );
      editorFreeCam = {
        location: camLoc,
        pitch: uruToRadians(camPitchUru),
        yaw: uruToRadians(camYawUru),
        roll: uruToRadians(camRollUru),
        ...(isDefaultOverview ? { isDefaultOverview: true } : {}),
      };
    }

    const roundExtra: Record<string, unknown> = {};
    if (unknownArchetypes.length > 0) {
      roundExtra.unrecognizedArchetypes = unknownArchetypes;
    }
    for (const [rk, rv] of Object.entries(round)) {
      if (rk !== 'TimeLimit' && rk !== 'SerializedArchetypes' && rk !== 'round_index') {
        roundExtra[rk] = rv;
      }
    }
    if (Object.keys(roundExtra).length > 0) {
      extraRoundAttributes.push({
        roundIndex: round.round_index ?? idx + 1,
        ...roundExtra,
      });
    }

    return cloneShotItem(
      {
        id: `${rawGuid}-shot-${idx}`,
        index: idx,
        name: `Shot ${idx + 1}`,
        timeoutSeconds,
        car: {
          location: [carX, carY, effectiveCarZ],
          headingYaw: carYawRad,
          headingPitch: isCarGrounded ? 0 : carPitchRad,
          airRoll: isCarGrounded ? 0 : carRollRad,
          speed: carSpeed,
          speedYaw: carYawRad,
          speedPitch: isCarGrounded ? 0 : carPitchRad,
          speedFollowsHeading: true,
          snapToGround: isCarGrounded,
          hasFlip: true,
          initialBoost: 100,
          unlimitedBoost: true,
        },
        ball: {
          location: [ballX, ballY, ballZ],
          speed: ballSpeed,
          speedYaw: ballYawRad,
          speedPitch: ballPitchRad,
          ...(Math.abs(ballRollRad) > 1e-6 ? { startRotationRoll: ballRollRad } : {}),
          kickoffState,
          randomAngularVelocity: false,
          angularVelocity: [0, 0, 0],
        },
        ...(editorFreeCam ? { editorFreeCam } : {}),
      },
      idx
    );
  });

  if (items.length === 0) {
    items.push(createDefaultShotItem(0));
  }

  const unmappedPackProperties: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(props)) {
    if (
      key === 'Rounds' ||
      key === 'TM_Name' ||
      key === 'TM_Guid' ||
      key === 'CreatedAt' ||
      key === 'UpdatedAt'
    ) {
      continue;
    }
    unmappedPackProperties[key] = val;
  }

  const unmappedDescriptionDump: Record<string, unknown> = {
    sourceFormat: 'RL_TEM_SaveData',
    sourceFileName: parsedTem.fileName,
    temVariant: parsedTem.variant,
    crcValid: parsedTem.header.crcValid,
    storedCrc32: parsedTem.header.storedCrc32,
    ...(parsedTem.savedataEnvelope ? { savedataEnvelope: parsedTem.savedataEnvelope } : {}),
    ...(Object.keys(parsedTem.rootProperties || {}).length > 0
      ? { rootProperties: parsedTem.rootProperties }
      : {}),
    properties: unmappedPackProperties,
    totalRoundsInTem: totalTemRoundsCount,
    importedShotsCount: items.length,
    ...(truncatedFromRoundsCount !== null
      ? { truncatedFromRounds: truncatedFromRoundsCount }
      : {}),
    ...(extraRoundAttributes.length > 0 ? { roundExtras: extraRoundAttributes } : {}),
  };

  const originalDescriptionJson = JSON.stringify(unmappedDescriptionDump, null, 2);

  // Default description: "$Code by $CreatorName" (e.g. "DEC7-4CAD-1452-30D3 by Kevpert") or empty
  let defaultDescription = '';
  if (rawCode && rawCreator) {
    defaultDescription = `${rawCode} by ${rawCreator}`;
  } else if (rawCode) {
    defaultDescription = rawCode;
  } else if (rawCreator) {
    defaultDescription = `by ${rawCreator}`;
  }

  const derived = derivePackTagsAndMetadata({
    title: rawTitle,
    creator: rawCreator,
    code: rawCode,
    difficulty: props.Difficulty,
  });

  const recommendedVariation = resolveRecommendedVariationForPack(
    rawCode,
    rawTitle,
    rawCreator
  );

  const metadata: StaticTrainingPackMetadata = {
    uuid: rawGuid,
    title: rawTitle,
    description: defaultDescription,
    originalDescription: originalDescriptionJson,
    ...(rawCode ? { code: rawCode } : {}),
    ...(derived.normalizedCreator ? { creator: derived.normalizedCreator } : {}),
    ...(derived.tags.length > 0 ? { tags: derived.tags } : {}),
    ...(derived.releaseYearMonth ? { releaseYearMonth: derived.releaseYearMonth } : {}),
    ...(derived.rankTier ? { rankTier: derived.rankTier } : {}),
    sourcePackType: 'RLRCSPack',
    ...(recommendedVariation ? { recommendedVariation } : {}),
    createdAt,
    updatedAt,
    itemCount: items.length,
  };

  const archive: RCSPackArchive = {
    format: 'RLRCSPack',
    version: 2,
    category: 'static-training-pack',
    metadata,
    items,
  };

  return {
    parsedTem,
    metadata,
    items,
    totalTemRoundsCount,
    truncatedFromRoundsCount,
    unmappedDescriptionDump,
    archive,
  };
}

/**
 * Convenience helper to parse a browser `File` (`.Tem` or `.decrypted.bin`) directly
 * into a `TemToRCSPackConversionResult`.
 */
export async function convertTemFileToRCSPackBundle(
  file: File
): Promise<TemToRCSPackConversionResult> {
  const arrayBuffer = await file.arrayBuffer();
  const rawBytes = new Uint8Array(arrayBuffer);
  const parsedTem = parseTemBinaryBytes(rawBytes, file.name);
  return convertParsedTemToRCSPackBundle(parsedTem);
}

export const parseAndConvertTemFile = convertTemFileToRCSPackBundle;
