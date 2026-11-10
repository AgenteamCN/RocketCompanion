/**
 * scripts/radar/radarStructuralCoupling.ts
 * Radar 2.0 Structural Coupling, Ping-Pong & Host Penetration Analyzer.
 *
 * Detects horizontal halving ("fake splits") across 4 structural dimensions:
 *   1. Host Penetration (Reads vs Writes on injected host/owner/runtime/engine/parent/ctrl/mode)
 *   2. Pass-Through Proxy Boilerplate (one-liner delegating methods on facade/god classes)
 *   3. Bidirectional Ping-Pong Coupling (new Sub(this) + closure callback bags jumping across files)
 *   4. Automated Refactoring Prescription (PURE_PIPELINE | OWN_STATE_SUBCONTROLLER | VERTICAL_DOMAIN_BRIDGE | ELIMINATE_PROXY)
 */

import fs from 'node:fs';
import { stripComments, toPosixRel } from './radarConstantsAndFs.ts';

export const HARD_HOST_PENETRATION_LIMIT = 105;
export const HARD_PASSTHROUGH_PROXY_LIMIT = 40;
export const AUDIT_HOST_PENETRATION_THRESHOLD = 12;
export const AUDIT_PASSTHROUGH_THRESHOLD = 5;
export const AUDIT_PINGPONG_CALLBACK_THRESHOLD = 6;

export type StructuralPrescription =
  | 'VERTICAL_DOMAIN_BRIDGE'
  | 'OWN_STATE_SUBCONTROLLER'
  | 'PURE_PIPELINE'
  | 'ELIMINATE_PASSTHROUGH_PROXY'
  | 'CALLBACK_TO_READONLY_SNAPSHOT';

export interface FileStructuralMetrics {
  readonly rel: string;
  readonly kb: number;
  readonly lines: number;
  readonly hostReads: number;
  readonly hostWrites: number;
  readonly hostPenetration: number;
  readonly passThroughMethods: number;
  readonly newWithThisCount: number;
  readonly callbackBagCount: number;
  readonly pingPongTargets: readonly string[];
  readonly score: number;
  readonly prescription: StructuralPrescription;
}

const HOST_WRITE_RE =
  /\b(?:this\.)?(?:host|owner|parent|ctrl|runtime|engine|mode)\.[a-zA-Z_$][\w$]*(?:\.[a-zA-Z_$][\w$]*)*\s*(?:=(?!=)|\+=|-=|\*=|\/=|\?\?=|\|\|=|&&=|\+\+|--)/g;

const HOST_ACCESS_RE =
  /\b(?:this\.)?(?:host|owner|parent|ctrl|runtime|engine|mode)\.[a-zA-Z_$][\w$]*/g;

const PASSTHROUGH_METHOD_RE =
  /\b[a-zA-Z_$][\w$]*\s*\([^)]*\)\s*(?::\s*[^{]+)?\{\s*(?:return\s+)?this\.[a-zA-Z_$][\w$]*\.[a-zA-Z_$][\w$]*\([^;{}]*\);\s*\}/g;

const NEW_WITH_THIS_RE = /\bnew\s+[A-Z][\w$]*\s*\(\s*this\b/g;

const ON_CALLBACK_PROP_RE = /\bon[A-Z][\w$]*\s*:\s*(?:\([^)]*\)\s*=>|function\b|\bthis\.)/g;

function classifyPrescription(
  rel: string,
  hostReads: number,
  hostWrites: number,
  passThroughMethods: number,
  newWithThisCount: number,
  callbackBagCount: number
): StructuralPrescription {
  if (passThroughMethods >= 6 && passThroughMethods * 2 >= hostReads + hostWrites) {
    return 'ELIMINATE_PASSTHROUGH_PROXY';
  }
  if (/Port\.ts$|Ports\.ts$|Bridge\.ts$/i.test(rel) && hostReads + hostWrites >= 25) {
    return 'VERTICAL_DOMAIN_BRIDGE';
  }
  if (hostWrites === 0 && hostReads >= 12) {
    return 'PURE_PIPELINE';
  }
  if (hostWrites > 0 && hostReads + hostWrites >= 12) {
    return 'OWN_STATE_SUBCONTROLLER';
  }
  if (newWithThisCount >= 2 || callbackBagCount >= 6) {
    return 'CALLBACK_TO_READONLY_SNAPSHOT';
  }
  return 'PURE_PIPELINE';
}

export function analyzeStructuralCoupling(
  allFiles: readonly string[],
  importGraph: ReadonlyMap<string, readonly string[]>,
  errors: string[],
  auditFilter?: string | null
): FileStructuralMetrics[] {
  const rawMetricsByRel = new Map<
    string,
    {
      kb: number;
      lines: number;
      hostReads: number;
      hostWrites: number;
      hostPenetration: number;
      passThroughMethods: number;
      newWithThisCount: number;
      callbackBagCount: number;
    }
  >();

  for (const file of allFiles) {
    const rel = toPosixRel(file);
    if (rel.startsWith('src/ui-core/')) continue;

    const raw = fs.readFileSync(file, 'utf8');
    const clean = stripComments(raw);
    const kb = Buffer.byteLength(raw, 'utf8') / 1024;
    const lines = raw.split(/\r?\n/).length;

    const totalAccesses = (clean.match(HOST_ACCESS_RE) || []).length;
    const hostWrites = (clean.match(HOST_WRITE_RE) || []).length;
    const hostReads = Math.max(0, totalAccesses - hostWrites);
    const hostPenetration = totalAccesses;
    const passThroughMethods = (clean.match(PASSTHROUGH_METHOD_RE) || []).length;
    const newWithThisCount = (clean.match(NEW_WITH_THIS_RE) || []).length;
    const callbackBagCount = (clean.match(ON_CALLBACK_PROP_RE) || []).length;

    if (hostPenetration > HARD_HOST_PENETRATION_LIMIT) {
      errors.push(
        `[HOST PENETRATION OVERFLOW] ${rel} accesses host/owner/runtime properties ${hostPenetration} times (${hostReads}R/${hostWrites}W; ceiling <= ${HARD_HOST_PENETRATION_LIMIT}). Decompose into a self-contained domain module or pure pipeline.`
      );
    }

    if (passThroughMethods > HARD_PASSTHROUGH_PROXY_LIMIT) {
      errors.push(
        `[PASS-THROUGH PROXY OVERFLOW] ${rel} contains ${passThroughMethods} single-line delegating proxy methods (ceiling <= ${HARD_PASSTHROUGH_PROXY_LIMIT}). Expose domain sub-controllers directly or use pure pipelines instead of pass-through wrappers.`
      );
    }

    rawMetricsByRel.set(rel, {
      kb,
      lines,
      hostReads,
      hostWrites,
      hostPenetration,
      passThroughMethods,
      newWithThisCount,
      callbackBagCount,
    });
  }

  const auditHotspots: FileStructuralMetrics[] = [];

  for (const [rel, m] of rawMetricsByRel.entries()) {
    if (auditFilter && !rel.includes(auditFilter)) continue;

    const deps = importGraph.get(rel) || [];
    const pingPongTargets: string[] = [];
    for (const dep of deps) {
      const depMetrics = rawMetricsByRel.get(dep);
      if (depMetrics && depMetrics.hostPenetration >= AUDIT_HOST_PENETRATION_THRESHOLD) {
        pingPongTargets.push(`${dep.split('/').pop()}(${depMetrics.hostPenetration})`);
      }
    }

    const isHotspot =
      m.hostPenetration >= AUDIT_HOST_PENETRATION_THRESHOLD ||
      m.passThroughMethods >= AUDIT_PASSTHROUGH_THRESHOLD ||
      m.newWithThisCount >= 2 ||
      m.callbackBagCount >= AUDIT_PINGPONG_CALLBACK_THRESHOLD ||
      pingPongTargets.length >= 2;

    if (!isHotspot) continue;

    const score =
      m.hostReads +
      m.hostWrites * 2 +
      m.passThroughMethods * 3 +
      m.newWithThisCount * 4 +
      m.callbackBagCount * 2 +
      pingPongTargets.length * 5;

    const prescription = classifyPrescription(
      rel,
      m.hostReads,
      m.hostWrites,
      m.passThroughMethods,
      m.newWithThisCount,
      m.callbackBagCount
    );

    auditHotspots.push({
      rel,
      kb: Number(m.kb.toFixed(1)),
      lines: m.lines,
      hostReads: m.hostReads,
      hostWrites: m.hostWrites,
      hostPenetration: m.hostPenetration,
      passThroughMethods: m.passThroughMethods,
      newWithThisCount: m.newWithThisCount,
      callbackBagCount: m.callbackBagCount,
      pingPongTargets,
      score,
      prescription,
    });
  }

  auditHotspots.sort((a, b) => b.score - a.score);
  return auditHotspots;
}

export function printStructuralAuditReport(
  hotspots: readonly FileStructuralMetrics[],
  auditFilter?: string | null
): void {
  const scopeLabel = auditFilter ? `filter="${auditFilter}"` : 'all engine subsystems';
  console.log('----------------------------------------------------------------------');
  console.log(
    ` STRUCTURAL COUPLING & PING-PONG AUDIT (${hotspots.length} target(s) in ${scopeLabel})`
  );
  console.log('----------------------------------------------------------------------');
  for (const h of hotspots) {
    const penStr = `HostPen=${h.hostPenetration}(${h.hostReads}R/${h.hostWrites}W)`;
    const proxyStr = `PassThru=${h.passThroughMethods}`;
    const cbStr = `PingPong=(newThis:${h.newWithThisCount},onCb:${h.callbackBagCount})`;
    const targetsStr =
      h.pingPongTargets.length > 0 ? ` -> Coupled:[${h.pingPongTargets.join(', ')}]` : '';
    console.log(
      `  [!] ${h.rel} (${h.kb}KB/${h.lines}L) | ${penStr} | ${proxyStr} | ${cbStr} | Rx: ${h.prescription}${targetsStr}`
    );
  }
  console.log('----------------------------------------------------------------------');
}
