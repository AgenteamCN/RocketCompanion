export interface KickoffMatrixSlotResult {
  slotIndex: number;
  slotCode: string;
  touchTick: number;
  touchSec: number;
  winner: string;
  blueDist: number;
  orangeDist: number;
  endBallX: number;
  endBallY: number;
  endBallVy: number;
  outcome: string;
}

export interface KickoffMatrixPairResult {
  pairId: string;
  label: string;
  category: string;
  blue: string;
  orange: string;
  blueWins: number;
  orangeWins: number;
  ties: number;
  slots: KickoffMatrixSlotResult[];
}

const SLOT_CODES = ["DR", "DL", "BR", "BL", "CT"] as const;

type CompactSlotSpec = [
  slotIndex: number,
  touchTick: number,
  touchSec: number,
  winner: string,
  blueDist: number,
  orangeDist: number,
  endBallX: number,
  endBallY: number,
  endBallVy: number,
  outcome: string,
];

function expandMatrixSlot(spec: CompactSlotSpec): KickoffMatrixSlotResult {
  const [
    slotIndex,
    touchTick,
    touchSec,
    winner,
    blueDist,
    orangeDist,
    endBallX,
    endBallY,
    endBallVy,
    outcome,
  ] = spec;
  return {
    slotIndex,
    slotCode: SLOT_CODES[slotIndex] || "DR",
    touchTick,
    touchSec,
    winner,
    blueDist,
    orangeDist,
    endBallX,
    endBallY,
    endBallVy,
    outcome,
  };
}

export function buildKickoffMatrixPairResult(
  pairId: string,
  label: string,
  category: string,
  blue: string,
  orange: string,
  blueWins: number,
  orangeWins: number,
  ties: number,
  compactSlots: CompactSlotSpec[]
): KickoffMatrixPairResult {
  return {
    pairId,
    label,
    category,
    blue,
    orange,
    blueWins,
    orangeWins,
    ties,
    slots: compactSlots.map(expandMatrixSlot),
  };
}

const OUTCOME_NEUTRAL = "Dead-Ball Neutral (0,0)";
const OUTCOME_ORANGE = "Toward Orange (+Y)";
const OUTCOME_BLUE_KOV1_BLOCK = "Toward Blue (-Y) (KO_v1 Late Block)";
const OUTCOME_BLUE_NECTO_BLOCK = "Toward Blue (-Y) (Necto Block)";

function buildSelfTiePair(
  pairId: string,
  label: string,
  modelId: string,
  ticksAndSecs: Array<[number, number, number]>
): KickoffMatrixPairResult {
  const compactSlots: CompactSlotSpec[] = ticksAndSecs.map(([tick, sec, dist], idx) => [
    idx,
    tick,
    sec,
    "TIE",
    dist,
    dist,
    0,
    0,
    0,
    OUTCOME_NEUTRAL,
  ]);
  return buildKickoffMatrixPairResult(pairId, label, "self", modelId, modelId, 0, 0, 5, compactSlots);
}

export function buildPrecomputedKickoffMatrixResults(): KickoffMatrixPairResult[] {
  return [
    buildKickoffMatrixPairResult("ko_v2_vs_ko_v1", "KO_v2 vs KO_v1", "cross", "ko_v2", "ko_v1", 3, 0, 2, [
      [0, 232, 1.93, "TIE", 162, 162, -48, 0, 0, OUTCOME_NEUTRAL],
      [1, 232, 1.93, "TIE", 162, 162, 48, 0, 0, OUTCOME_NEUTRAL],
      [2, 262, 2.18, "BLUE", 161, 205, -140, -220, -185, OUTCOME_BLUE_KOV1_BLOCK],
      [3, 262, 2.18, "BLUE", 161, 205, 140, -220, -185, OUTCOME_BLUE_KOV1_BLOCK],
      [4, 301, 2.51, "BLUE", 158, 221, 0, -310, -240, OUTCOME_BLUE_KOV1_BLOCK],
    ]),
    buildKickoffMatrixPairResult("ko_v2_vs_nexto", "KO_v2 vs Nexto", "cross", "ko_v2", "nexto", 5, 0, 0, [
      [0, 232, 1.93, "BLUE", 162, 1094, 980, 3250, 1980, OUTCOME_ORANGE],
      [1, 232, 1.93, "BLUE", 162, 1094, -980, 3250, 1980, OUTCOME_ORANGE],
      [2, 262, 2.18, "BLUE", 161, 822, -120, 3680, 2210, OUTCOME_ORANGE],
      [3, 262, 2.18, "BLUE", 161, 838, 120, 3680, 2210, OUTCOME_ORANGE],
      [4, 301, 2.51, "BLUE", 158, 816, 0, 4120, 2540, OUTCOME_ORANGE],
    ]),
    buildKickoffMatrixPairResult("ko_v2_vs_necto", "KO_v2 vs Necto", "cross", "ko_v2", "necto", 5, 0, 0, [
      [0, 232, 1.93, "BLUE", 162, 1020, 960, 3210, 1960, OUTCOME_ORANGE],
      [1, 232, 1.93, "BLUE", 162, 753, -910, 3100, 1890, OUTCOME_ORANGE],
      [2, 262, 2.18, "BLUE", 161, 1208, -150, 3740, 2260, OUTCOME_ORANGE],
      [3, 262, 2.18, "BLUE", 161, 938, 150, 3710, 2230, OUTCOME_ORANGE],
      [4, 301, 2.51, "BLUE", 158, 865, 0, 4150, 2560, OUTCOME_ORANGE],
    ]),
    buildKickoffMatrixPairResult("ko_v1_vs_nexto", "KO_v1 vs Nexto", "cross", "ko_v1", "nexto", 5, 0, 0, [
      [0, 232, 1.93, "BLUE", 162, 1094, 970, 3240, 1975, OUTCOME_ORANGE],
      [1, 232, 1.93, "BLUE", 162, 1094, -970, 3240, 1975, OUTCOME_ORANGE],
      [2, 264, 2.2, "BLUE", 165, 782, -110, 3590, 2150, OUTCOME_ORANGE],
      [3, 264, 2.2, "BLUE", 165, 798, 110, 3590, 2150, OUTCOME_ORANGE],
      [4, 304, 2.53, "BLUE", 161, 753, 0, 4010, 2480, OUTCOME_ORANGE],
    ]),
    buildKickoffMatrixPairResult("ko_v1_vs_necto", "KO_v1 vs Necto", "cross", "ko_v1", "necto", 5, 0, 0, [
      [0, 232, 1.93, "BLUE", 162, 1020, 955, 3200, 1950, OUTCOME_ORANGE],
      [1, 232, 1.93, "BLUE", 162, 753, -905, 3090, 1880, OUTCOME_ORANGE],
      [2, 264, 2.2, "BLUE", 165, 1170, -140, 3690, 2210, OUTCOME_ORANGE],
      [3, 264, 2.2, "BLUE", 165, 901, 140, 3660, 2190, OUTCOME_ORANGE],
      [4, 304, 2.53, "BLUE", 161, 806, 0, 4060, 2510, OUTCOME_ORANGE],
    ]),
    buildKickoffMatrixPairResult("nexto_vs_necto", "Nexto vs Necto", "cross", "nexto", "necto", 3, 2, 0, [
      [0, 283, 2.36, "ORANGE", 231, 160, 210, 280, 190, "Toward Orange (+Y) (Nexto Counter)"],
      [1, 271, 2.26, "ORANGE", 447, 164, -420, -890, -610, "Toward Blue (-Y)"],
      [2, 302, 2.52, "BLUE", 164, 534, -190, 1640, 1120, OUTCOME_ORANGE],
      [3, 303, 2.53, "BLUE", 165, 277, 140, -260, -195, OUTCOME_BLUE_NECTO_BLOCK],
      [4, 340, 2.83, "BLUE", 164, 229, 0, -210, -180, OUTCOME_BLUE_NECTO_BLOCK],
    ]),
    buildSelfTiePair("ko_v2_vs_ko_v2", "KO_v2 vs KO_v2 (Self)", "ko_v2", [
      [232, 1.93, 162],
      [232, 1.93, 162],
      [262, 2.18, 161],
      [262, 2.18, 161],
      [301, 2.51, 158],
    ]),
    buildSelfTiePair("ko_v1_vs_ko_v1", "KO_v1 vs KO_v1 (Self)", "ko_v1", [
      [232, 1.93, 162],
      [232, 1.93, 162],
      [264, 2.2, 165],
      [264, 2.2, 165],
      [304, 2.53, 161],
    ]),
    buildSelfTiePair("nexto_vs_nexto", "Nexto vs Nexto (Self)", "nexto", [
      [287, 2.39, 164],
      [287, 2.39, 164],
      [302, 2.52, 164],
      [303, 2.53, 165],
      [340, 2.83, 164],
    ]),
    buildSelfTiePair("necto_vs_necto", "Necto vs Necto (Self)", "necto", [
      [283, 2.36, 160],
      [271, 2.26, 164],
      [328, 2.73, 161],
      [309, 2.58, 162],
      [344, 2.87, 163],
    ]),
  ];
}
