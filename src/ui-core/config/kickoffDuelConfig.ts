/**
 * kickoffDuelConfig.ts
 * Pure data configuration and precomputed baseline matrix results for the 4-Model Kickoff Duel Lab.
 */
import {
  type KickoffMatrixSlotResult,
  type KickoffMatrixPairResult,
  buildPrecomputedKickoffMatrixResults,
} from "./kickoffDuelMatrixBuilder";

export type { KickoffMatrixSlotResult, KickoffMatrixPairResult };

export const KICKOFF_DUEL_MODELS = Object.freeze([
  {
    id: "ko_v2",
    name: "Kickoff PPO v2 (RLRL101 a9a52e7)",
    shortName: "KO_v2",
    arch: "42D -> 128x128 MLP (SafeTensors)",
    obsBadge: "42D (6D Opp Obs · Solo-Trained)",
    hasOpponentObs: false,
    obsNote: "Blind (No Opponent Observation)",
    soloAvgFrames: 257.8,
  },
  {
    id: "ko_v1",
    name: "Kickoff PPO v1 (Legacy)",
    shortName: "KO_v1",
    arch: "75D -> 256x256 MLP (SafeTensors)",
    obsBadge: "75D Blind (No Opp Obs)",
    hasOpponentObs: false,
    obsNote: "Blind (No Opponent Observation)",
    soloAvgFrames: 259.2,
  },
  {
    id: "nexto",
    name: "Nexto (EARL Perceiver GC)",
    shortName: "Nexto",
    arch: "Perceiver 90-Act (SafeTensors)",
    obsBadge: "Multi-Car Perceiver Obs",
    hasOpponentObs: true,
    obsNote: "Opponent-Aware (Multi-Car Perceiver)",
    soloAvgFrames: 303.8,
  },
  {
    id: "necto",
    name: "Necto (EARL Perceiver Diamond)",
    shortName: "Necto",
    arch: "Perceiver 12-Logit (SafeTensors)",
    obsBadge: "Multi-Car Perceiver Obs",
    hasOpponentObs: true,
    obsNote: "Opponent-Aware (Multi-Car Perceiver)",
    soloAvgFrames: 307.0,
  },
]);

export const KICKOFF_DUEL_SLOTS = Object.freeze([
  { slotIndex: 0, code: "DR", name: "Diagonal Right", cppIdx: 0, bluePos: [-2048, -2560], blueYaw: 0.25 * Math.PI },
  { slotIndex: 1, code: "DL", name: "Diagonal Left", cppIdx: 1, bluePos: [2048, -2560], blueYaw: 0.75 * Math.PI },
  { slotIndex: 2, code: "BR", name: "Back Right", cppIdx: 2, bluePos: [-256, -3840], blueYaw: 0.5 * Math.PI },
  { slotIndex: 3, code: "BL", name: "Back Left", cppIdx: 3, bluePos: [256, -3840], blueYaw: 0.5 * Math.PI },
  { slotIndex: 4, code: "CT", name: "Center Back", cppIdx: 4, bluePos: [0, -4608], blueYaw: 0.5 * Math.PI },
]);

export const KICKOFF_DUEL_PAIRINGS = Object.freeze([
  { id: "ko_v2_vs_ko_v1", label: "KO_v2 vs KO_v1", blue: "ko_v2", orange: "ko_v1", category: "cross" },
  { id: "ko_v2_vs_nexto", label: "KO_v2 vs Nexto", blue: "ko_v2", orange: "nexto", category: "cross" },
  { id: "ko_v2_vs_necto", label: "KO_v2 vs Necto", blue: "ko_v2", orange: "necto", category: "cross" },
  { id: "ko_v1_vs_nexto", label: "KO_v1 vs Nexto", blue: "ko_v1", orange: "nexto", category: "cross" },
  { id: "ko_v1_vs_necto", label: "KO_v1 vs Necto", blue: "ko_v1", orange: "necto", category: "cross" },
  { id: "nexto_vs_necto", label: "Nexto vs Necto", blue: "nexto", orange: "necto", category: "cross" },
  { id: "ko_v2_vs_ko_v2", label: "KO_v2 vs KO_v2 (Self)", blue: "ko_v2", orange: "ko_v2", category: "self" },
  { id: "ko_v1_vs_ko_v1", label: "KO_v1 vs KO_v1 (Self)", blue: "ko_v1", orange: "ko_v1", category: "self" },
  { id: "nexto_vs_nexto", label: "Nexto vs Nexto (Self)", blue: "nexto", orange: "nexto", category: "self" },
  { id: "necto_vs_necto", label: "Necto vs Necto (Self)", blue: "necto", orange: "necto", category: "self" },
]);

export const INITIAL_SOLO_RESULTS = [
  {
    modelId: "ko_v2", shortName: "KO_v2", hasOpponentObs: false,
    slotTicks: [232, 232, 262, 262, 301], avgTicks: 257.8, avgSec: 2.15,
  },
  {
    modelId: "ko_v1", shortName: "KO_v1", hasOpponentObs: false,
    slotTicks: [232, 232, 264, 264, 304], avgTicks: 259.2, avgSec: 2.16,
  },
  {
    modelId: "nexto", shortName: "Nexto", hasOpponentObs: true,
    slotTicks: [287, 287, 302, 303, 340], avgTicks: 303.8, avgSec: 2.53,
  },
  {
    modelId: "necto", shortName: "Necto", hasOpponentObs: true,
    slotTicks: [283, 271, 328, 309, 344], avgTicks: 307.0, avgSec: 2.56,
  },
];

export const PRECOMPUTED_MATRIX_RESULTS: KickoffMatrixPairResult[] = buildPrecomputedKickoffMatrixResults();

export const RESPAWN_SPAWN_PRESETS = Object.freeze([
  {
    id: "far-left", slotIndex: 0, name: "Far Left", label: "Far Left",
    team0: { x: 2688, y: -4608, z: 17, yaw: Math.PI / 2 },
    team1: { x: -2688, y: 4608, z: 17, yaw: -Math.PI / 2 },
  },
  {
    id: "inner-left", slotIndex: 1, name: "Inner Left", label: "Inner Left",
    team0: { x: 2304, y: -4608, z: 17, yaw: Math.PI / 2 },
    team1: { x: -2304, y: 4608, z: 17, yaw: -Math.PI / 2 },
  },
  {
    id: "inner-right", slotIndex: 2, name: "Inner Right", label: "Inner Right",
    team0: { x: -2304, y: -4608, z: 17, yaw: Math.PI / 2 },
    team1: { x: 2304, y: 4608, z: 17, yaw: -Math.PI / 2 },
  },
  {
    id: "far-right", slotIndex: 3, name: "Far Right", label: "Far Right",
    team0: { x: -2688, y: -4608, z: 17, yaw: Math.PI / 2 },
    team1: { x: 2688, y: 4608, z: 17, yaw: -Math.PI / 2 },
  },
]);

export const HIDDEN_RESPAWN_SPAWN_PRESETS = Object.freeze([
  {
    id: "hidden-far-left", slotIndex: 0, name: "Hidden Far Left", label: "Hidden Far Left",
    team0: { x: 2688, y: -4096, z: 17, yaw: Math.PI / 2 },
    team1: { x: -2688, y: 4096, z: 17, yaw: -Math.PI / 2 },
  },
  {
    id: "hidden-inner-left", slotIndex: 1, name: "Hidden Inner Left", label: "Hidden Inner Left",
    team0: { x: 2304, y: -4096, z: 17, yaw: Math.PI / 2 },
    team1: { x: -2304, y: 4096, z: 17, yaw: -Math.PI / 2 },
  },
  {
    id: "hidden-inner-right", slotIndex: 2, name: "Hidden Inner Right", label: "Hidden Inner Right",
    team0: { x: -2304, y: -4096, z: 17, yaw: Math.PI / 2 },
    team1: { x: 2304, y: 4096, z: 17, yaw: -Math.PI / 2 },
  },
  {
    id: "hidden-far-right", slotIndex: 3, name: "Hidden Far Right", label: "Hidden Far Right",
    team0: { x: -2688, y: -4096, z: 17, yaw: Math.PI / 2 },
    team1: { x: 2688, y: 4096, z: 17, yaw: -Math.PI / 2 },
  },
]);

export function getDesiredRespawnPose(team = 0, slotIndex = 0) {
  const clampedSlot = Math.max(0, Math.min(3, Math.trunc(slotIndex)));
  const entry = RESPAWN_SPAWN_PRESETS[clampedSlot] || RESPAWN_SPAWN_PRESETS[0];
  return Number(team) === 1 ? entry.team1 : entry.team0;
}
