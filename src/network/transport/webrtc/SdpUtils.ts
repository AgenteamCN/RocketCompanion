/**
 * SdpUtils.ts
 * Utilities for parsing, validating, and injecting ICE candidates and SDP lines.
 * Strictly adheres to RFC 4566 mandatory session header specifications.
 */

export interface IceCandidateDescriptor {
  candidate: string;
  sdpMid?: string | null;
  sdpMLineIndex?: number | null;
  address?: string;
  ip?: string;
  port?: number | string;
  type?: string;
}

export function extractCandidatePort(
  cand: IceCandidateDescriptor | RTCIceCandidateInit | string | null | undefined
): number | null {
  if (!cand) return null;
  if (typeof cand === 'object' && 'port' in cand && cand.port !== undefined) {
    const p = parseInt(String(cand.port), 10);
    if (!isNaN(p) && p > 0) return p;
  }
  const candStr = typeof cand === 'string' ? cand : cand?.candidate || '';
  if (typeof candStr === 'string') {
    const parts = candStr.trim().split(/\s+/);
    if (parts.length >= 6) {
      const p = parseInt(parts[5], 10);
      if (!isNaN(p) && p > 0) return p;
    }
    const match = candStr.match(/\s(\d{1,5})\styp\b/);
    if (match) {
      const p = parseInt(match[1], 10);
      if (!isNaN(p) && p > 0) {
        console.warn(
          `[sdpUtils] Standard token split did not yield port for candidate "${candStr}"; extracted port ${p} via regex fallback.`
        );
        return p;
      }
    }
  }
  return null;
}

export function getLoopbackPortFromCandidates(
  candidates: Array<IceCandidateDescriptor | RTCIceCandidateInit | string> | null | undefined,
  sdp = ''
): number {
  let cand0: IceCandidateDescriptor | RTCIceCandidateInit | string | null = null;
  let cand1: IceCandidateDescriptor | RTCIceCandidateInit | string | null = null;

  if (Array.isArray(candidates) && candidates.length > 0) {
    cand0 = candidates[0];
    if (candidates.length > 1) {
      cand1 = candidates[1];
    }
  }

  if (!cand0 && typeof sdp === 'string' && sdp.length > 0) {
    console.warn(
      '[sdpUtils] No explicit ICE candidates provided to getLoopbackPortFromCandidates; falling back to scanning SDP a=candidate lines.'
    );
    const matches = [...sdp.matchAll(/a=(candidate:[^\r\n]+)/g)];
    if (matches.length > 0) cand0 = matches[0][1];
    if (matches.length > 1) cand1 = matches[1][1];
  }

  const port0 = cand0 ? extractCandidatePort(cand0) : null;
  const port1 = cand1 ? extractCandidatePort(cand1) : port0;
  const resolvedPort = port1 || port0;
  if (!resolvedPort) {
    console.warn(
      '[sdpUtils] Could not extract loopback port from candidates or SDP; falling back to default port 50000.'
    );
    return 50000;
  }

  return resolvedPort;
}

export function createLoopbackCandidate(
  sourceCandidate: IceCandidateDescriptor | RTCIceCandidateInit | string | null | undefined,
  customPort: number | null = null
): IceCandidateDescriptor {
  const extractedPort =
    customPort || (sourceCandidate ? extractCandidatePort(sourceCandidate) : null);
  if (!extractedPort) {
    console.warn(
      '[sdpUtils] createLoopbackCandidate could not resolve port from sourceCandidate; falling back to default port 50000.'
    );
  }
  const port = extractedPort || 50000;
  const sdpMid =
    typeof sourceCandidate === 'object' && sourceCandidate ? (sourceCandidate.sdpMid ?? '0') : '0';
  const sdpMLineIndex =
    typeof sourceCandidate === 'object' && sourceCandidate
      ? (sourceCandidate.sdpMLineIndex ?? 0)
      : 0;

  const foundation = Math.floor(Math.random() * 100000) + 100000;
  const loopbackCandStr = `candidate:${foundation} 1 udp 2130706431 127.0.0.1 ${port} typ host generation 0`;

  return {
    candidate: loopbackCandStr,
    sdpMid: String(sdpMid),
    sdpMLineIndex: Number(sdpMLineIndex),
    address: '127.0.0.1',
    ip: '127.0.0.1',
    port: Number(port),
    type: 'host',
  };
}

export function injectLoopbackCandidate(
  candidates: Array<IceCandidateDescriptor | RTCIceCandidateInit | string> | null | undefined,
  sdp = ''
): IceCandidateDescriptor[] {
  let list = Array.isArray(candidates) ? [...candidates] : [];

  list = list.filter((c) => {
    const s =
      typeof c === 'string'
        ? c
        : c?.candidate ||
          (c as IceCandidateDescriptor)?.ip ||
          (c as IceCandidateDescriptor)?.address ||
          '';
    return !s.includes('127.0.0.1');
  });

  let sourceCand: IceCandidateDescriptor | RTCIceCandidateInit | string | null =
    list.length > 0 ? list[0] : null;
  if (!sourceCand && typeof sdp === 'string') {
    const m = sdp.match(/a=(candidate:[^\r\n]+)/);
    if (m) {
      sourceCand = { candidate: m[1], sdpMid: '0', sdpMLineIndex: 0 };
    }
  }

  const port = getLoopbackPortFromCandidates(list, sdp);
  const loopback = createLoopbackCandidate(sourceCand, port);

  return [
    loopback,
    ...list.map((c) => (typeof c === 'string' ? { candidate: c } : (c as IceCandidateDescriptor))),
  ];
}

export function ensureValidSdp(sdp: string): string {
  if (!sdp || typeof sdp !== 'string') return sdp;

  const normalized = sdp.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = normalized.split('\n');

  if (!lines.some((l) => l.startsWith('v='))) {
    lines.unshift('v=0');
  }

  if (!lines.some((l) => l.startsWith('o='))) {
    const vIdx = lines.findIndex((l) => l.startsWith('v='));
    const sessionId = Math.floor(Math.random() * 1000000000) + 1000000000;
    const oLine = `o=- ${sessionId} 2 IN IP4 127.0.0.1`;
    if (vIdx !== -1) {
      lines.splice(vIdx + 1, 0, oLine);
    } else {
      lines.unshift(oLine);
    }
  }

  if (!lines.some((l) => l.startsWith('s='))) {
    const oIdx = lines.findIndex((l) => l.startsWith('o='));
    if (oIdx !== -1) {
      lines.splice(oIdx + 1, 0, 's=-');
    } else {
      lines.push('s=-');
    }
  }

  if (!lines.some((l) => l.startsWith('t='))) {
    const sIdx = lines.findIndex((l) => l.startsWith('s='));
    if (sIdx !== -1) {
      lines.splice(sIdx + 1, 0, 't=0 0');
    } else {
      lines.push('t=0 0');
    }
  }

  return lines.join('\r\n');
}

export function injectLoopbackIntoSdp(
  sdp: string,
  loopbackCand: IceCandidateDescriptor | { candidate?: string } | string | null | undefined
): string {
  if (!sdp || typeof sdp !== 'string') return sdp;

  let candStr = '';
  if (typeof loopbackCand === 'string') {
    candStr = loopbackCand.startsWith('a=') ? loopbackCand.slice(2) : loopbackCand;
  } else if (loopbackCand && loopbackCand.candidate) {
    candStr = loopbackCand.candidate.startsWith('a=')
      ? loopbackCand.candidate.slice(2)
      : loopbackCand.candidate;
  }

  const validSdp = ensureValidSdp(sdp);
  if (!candStr) return validSdp;

  const cleanLines = validSdp
    .split('\r\n')
    .filter((l) => !(l.startsWith('a=candidate:') && l.includes('127.0.0.1')));
  const customLine = `a=${candStr.trim()}`;
  let inserted = false;
  const res: string[] = [];

  for (const l of cleanLines) {
    if (!inserted && l.startsWith('a=candidate:')) {
      res.push(customLine);
      inserted = true;
    }
    res.push(l);
  }

  if (!inserted) {
    const mIdx = res.findIndex((l) => l.startsWith('m='));
    if (mIdx !== -1) {
      res.splice(mIdx + 1, 0, customLine);
    } else {
      res.push(customLine);
    }
  }

  return ensureValidSdp(res.join('\r\n'));
}

export function injectLoopback(
  sdp: string,
  candidates: Array<IceCandidateDescriptor | RTCIceCandidateInit | string> = []
): string {
  if (!sdp || typeof sdp !== 'string') return sdp;
  const port = getLoopbackPortFromCandidates(candidates, sdp);
  const foundation = Math.floor(Math.random() * 100000);
  const customLine = `a=candidate:${foundation} 1 udp 2130706431 127.0.0.1 ${port} typ host generation 0`;
  return injectLoopbackIntoSdp(sdp, customLine);
}
