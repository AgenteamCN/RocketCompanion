import React from 'react';

export function hexToRgbTuple(
  hex: string,
  fallback: [number, number, number] = [250, 200, 0]
): [number, number, number] {
  const clean = (hex || '').replace('#', '').trim();
  if (clean.length === 3) {
    const r = parseInt(clean[0] + clean[0], 16);
    const g = parseInt(clean[1] + clean[1], 16);
    const b = parseInt(clean[2] + clean[2], 16);
    if (!Number.isNaN(r) && !Number.isNaN(g) && !Number.isNaN(b)) return [r, g, b];
  } else if (clean.length >= 6) {
    const r = parseInt(clean.slice(0, 2), 16);
    const g = parseInt(clean.slice(2, 4), 16);
    const b = parseInt(clean.slice(4, 6), 16);
    if (!Number.isNaN(r) && !Number.isNaN(g) && !Number.isNaN(b)) return [r, g, b];
  }
  return fallback;
}

export function buildReplayBorderPath(
  winW: number,
  baseTop: number,
  sideY: number,
  centerY: number,
  wingWidthPct: number,
  slopeWidthPct: number
): string {
  const sideY_px = baseTop + sideY;
  const centerY_px = baseTop + centerY;

  const p1_x = winW * (wingWidthPct / 100);
  const p2_x = winW * ((wingWidthPct + slopeWidthPct) / 100);
  const p3_x = winW * ((100 - wingWidthPct - slopeWidthPct) / 100);
  const p4_x = winW * ((100 - wingWidthPct) / 100);

  return `M 0 ${sideY_px} L ${p1_x} ${sideY_px} L ${p2_x} ${centerY_px} L ${p3_x} ${centerY_px} L ${p4_x} ${sideY_px} L ${winW} ${sideY_px}`;
}

export function buildReplayClipPolygon(
  baseTop: number,
  sideY: number,
  centerY: number,
  wingWidthPct: number,
  slopeWidthPct: number
): string {
  const sideTopPx = baseTop + sideY;
  const centerTopPx = baseTop + centerY;
  return `polygon(
    0% ${sideTopPx}px,
    ${wingWidthPct}% ${sideTopPx}px,
    ${wingWidthPct + slopeWidthPct}% ${centerTopPx}px,
    ${100 - wingWidthPct - slopeWidthPct}% ${centerTopPx}px,
    ${100 - wingWidthPct}% ${sideTopPx}px,
    100% ${sideTopPx}px,
    100% 100%,
    0% 100%
  )`;
}

export const ReplayScorerIconSvg: React.FC = () => (
  <svg
    className="shrink-0"
    style={{ width: '31px', height: '31px' }}
    viewBox="0 0 24 24"
    xmlns="http://www.w3.org/2000/svg"
  >
    <g>
      <path
        d="M15,9l-2.5,2.5M15,6V9h3l3-3H18V3Z"
        fill="none"
        stroke="#ffffff"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
      <path
        d="M12.33,3H12a9,9,0,1,0,9,9c0-.11,0-.22,0-.33"
        fill="none"
        stroke="#ffffff"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
      <path
        d="M16.9,13A5,5,0,1,1,11,7.1"
        fill="none"
        stroke="#ffffff"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </g>
  </svg>
);

export const ReplaySpeedGaugeIconSvg: React.FC = () => (
  <svg
    className="shrink-0"
    style={{ width: '35px', height: '35px' }}
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      d={
        'M6.34315 17.6569C5.22433 16.538 4.4624 15.1126 4.15372 13.5607' +
        'C3.84504 12.0089 4.00346 10.4003 4.60896 8.93853' +
        'C5.21446 7.47672 6.23984 6.22729 7.55544 5.34824' +
        'C8.87103 4.46919 10.4177 4 12 4C13.5823 4 15.129 4.46919 16.4446 5.34824' +
        'C17.7602 6.22729 18.7855 7.47672 19.391 8.93853' +
        'C19.9965 10.4003 20.155 12.0089 19.8463 13.5607' +
        'C19.5376 15.1126 18.7757 16.538 17.6569 17.6569'
      }
      stroke="#ffffff"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    />
    <path
      d="M12 12L16 10"
      stroke="#ffffff"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    />
  </svg>
);

export const ReplayAssisterIconSvg: React.FC = () => (
  <svg
    className="shrink-0"
    style={{ width: '25px', height: '25px' }}
    viewBox="0 0 360.001 360.001"
    xmlns="http://www.w3.org/2000/svg"
  >
    <g fill="#ffffff">
      <path
        d={
          'M81.987,165.207c6.078,0,12.154-2.316,16.791-6.947c9.26-9.269,9.26-24.295,0-33.569' +
          'l-11.02-11.007l11.02-11.008c9.26-9.267,9.26-24.295,0-33.563c-9.271-9.27-24.307-9.272-33.566,0' +
          'L54.204,80.122L43.183,69.112c-9.258-9.272-24.293-9.27-33.553,0' +
          'c-9.275,9.269-9.275,24.297,0,33.563l11.006,11.008L9.63,124.69' +
          'c-9.275,9.274-9.275,24.301,0,33.569c4.635,4.631,10.701,6.947,16.775,6.947' +
          'c6.078,0,12.154-2.316,16.777-6.951l11.021-11.005l11.008,11.005' +
          'C69.847,162.89,75.911,165.207,81.987,165.207z'
        }
      />
      <path
        d={
          'M250.603,187.093c-30.585,0-55.374,24.79-55.374,55.375s24.789,55.375,55.374,55.375' +
          'c30.584,0,55.388-24.79,55.388-55.375S281.187,187.093,250.603,187.093z'
        }
      />
      <path
        d={
          'M356.897,58.524c-1.021-4.274-3.781-7.933-7.599-10.097L267.346,2.056' +
          'c-7.598-4.302-17.248-1.631-21.547,5.965l-5.162,9.101c-2.069,3.652-2.604,7.979-1.485,12.023' +
          'c1.116,4.046,3.809,7.48,7.463,9.548l29.571,16.729c-30.79,11.656-59.528,28.811-85.75,51.206' +
          'c-31.078,26.548-58.768,60.509-82.283,100.937c-34.674,59.63-49.719,114.674-53.506,130.113' +
          'c-1.004,4.144-0.307,8.511,1.943,12.128c2.25,3.619,5.857,6.18,10.025,7.097l12.373,2.728' +
          'c1.139,0.254,2.289,0.371,3.418,0.371c7.107,0,13.559-4.823,15.336-12' +
          'c3.51-14.113,17.396-64.314,48.717-118.159c37.254-64.053,83.781-107.779,138.668-130.401' +
          'l-17.693,26.548c-2.325,3.495-3.172,7.77-2.35,11.893c0.832,4.116,3.26,7.735,6.752,10.06' +
          'l8.711,5.787c7.273,4.833,17.088,2.864,21.933-4.4l52.188-78.358' +
          'C357.112,67.31,357.915,62.805,356.897,58.524z'
        }
      />
    </g>
  </svg>
);
