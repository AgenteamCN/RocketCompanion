#!/usr/bin/env node
/**
 * scripts/generateTauriCrossbarIcons.mjs
 * Renders the Crossbar #1 (7267515 — Outlined Sphere + Beam bottom entry route)
 * vector paths into high-DPI PNGs via Headless Chrome + HTML5 2D Canvas, then invokes
 * `pnpm tauri icon` to generate all desktop bundle icons (.icns, .ico, .png) and
 * specialized macOS / Windows tray icons under `src-tauri/icons/`.
 */

import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');
const ICONS_DIR = path.join(ROOT_DIR, 'src-tauri/icons');

const CROSSBAR_7267515_PATHS = [
  'M2935 4091 c-11 -5 -31 -21 -45 -36 -25 -27 -25 -27 -25 -226 l0 -199 33 -32 c28 -28 39 -33 82 -33 43 0 54 5 82 33 l33 32 0 200 0 200 -31 31 c-33 33 -92 46 -129 30z',
  'M2235 3831 c-45 -20 -70 -60 -70 -112 l0 -49 141 -141 c133 -133 144 -141 186 -146 42 -5 49 -2 84 30 35 32 39 40 39 86 l0 51 -141 141 c-126 126 -145 141 -180 145 -21 2 -48 0 -59 -5z',
  'M3615 3831 c-11 -5 -81 -71 -155 -145 l-135 -136 0 -50 c0 -43 5 -54 33 -82 28 -28 39 -33 82 -33 l50 0 142 143 143 142 0 50 c0 42 -5 54 -31 81 -33 33 -92 46 -129 30z',
  'M2883 3225 c-74 -20 -147 -59 -197 -105 l-43 -40 -931 -2 c-922 -3 -931 -3 -958 -24 -15 -11 -37 -33 -48 -48 -21 -27 -21 -33 -21 -986 0 -953 0 -959 21 -986 11 -15 33 -37 48 -48 26 -20 40 -21 285 -21 l258 0 37 29 c68 52 66 27 66 731 l0 635 665 0 665 0 48 -25 c138 -71 306 -71 444 0 46 24 53 25 273 25 l225 0 2 -649 c3 -638 3 -650 24 -677 11 -15 33 -37 48 -48 26 -20 40 -21 285 -21 l258 0 37 29 c70 53 66 -3 66 1026 0 1029 4 973 -66 1026 l-37 29 -490 3 -490 3 -43 39 c-110 101 -286 144 -431 105z',
  'M3090 2979 c153 -69 196 -252 88 -375 -54 -61 -94 -79 -178 -79 -61 0 -82 5 -112 23 -137 85 -169 254 -70 364 73 81 182 108 272 67z',
  'M2522 2773 c-2 -38 3 -92 11 -120 l14 -53 -643 -2 c-631 -3 -643 -3 -670 -24 -15 -11 -37 -33 -48 -48 -21 -27 -21 -39 -24 -677 l-2 -649 -120 0 -120 0 0 820 0 820 803 0 802 0 -3 -67z',
  'M4200 2020 l0 -820 -120 0 -120 0 -2 649 c-3 638 -3 650 -24 677 -50 67 -56 69 -278 72 l-203 3 14 52 c8 29 13 82 11 120 l-3 67 363 0 362 0 0 -820z',
  'M2275 2211 c-11 -5 -67 -57 -125 -115 -105 -106 -105 -106 -105 -156 0 -43 5 -54 33 -82 28 -28 39 -33 82 -33 l50 0 112 113 113 112 0 50 c0 42 -5 54 -31 81 -33 33 -92 46 -129 30z',
  'M2775 2111 c-11 -5 -171 -161 -355 -345 l-335 -336 0 -50 c0 -43 5 -54 33 -82 28 -28 39 -33 82 -33 l50 0 342 343 343 342 0 50 c0 42 -5 54 -31 81 -33 33 -92 46 -129 30z',
];

const COMBINED_PATH = CROSSBAR_7267515_PATHS.join(' ');

function buildRendererHtml() {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body>
<script>
const COMBINED_PATH = ${JSON.stringify(COMBINED_PATH)};

function drawCrossbarToCanvas(size, mode) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const p = new Path2D(COMBINED_PATH);

  ctx.clearRect(0, 0, size, size);

  if (mode === 'squircle-dark') {
    const pad = size * 0.08;
    const w = size - pad * 2;
    const r = size * 0.22;
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(pad, pad, w, w, r);
    ctx.shadowColor = 'rgba(0, 0, 0, 0.65)';
    ctx.shadowBlur = size * 0.05;
    ctx.shadowOffsetY = size * 0.02;
    const grad = ctx.createLinearGradient(0, pad, 0, size - pad);
    grad.addColorStop(0, '#18181b');
    grad.addColorStop(1, '#09090b');
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.lineWidth = Math.max(2, size * 0.012);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)';
    ctx.stroke();
    ctx.restore();
  }

  ctx.save();
  // Path coordinates span roughly X:[885..4420], Y:[1045..4105] in 5120x5120 space
  // Center of visual bounding box is (2652, 2575), span is ~3535 units.
  const targetSpan = mode === 'squircle-dark' ? size * 0.64 : mode.startsWith('tray-') ? size * 0.82 : size * 0.78;
  const scale = targetSpan / 3560;
  ctx.translate(size / 2, size / 2);
  ctx.scale(scale, -scale);
  ctx.translate(-2652, -2575);

  if (mode === 'frameless-white-black-glow' || mode === 'squircle-dark') {
    // 1. Multi-pass dark outer glow
    for (const blurFactor of [0.06, 0.03, 0.015]) {
      ctx.save();
      ctx.shadowColor = 'rgba(0, 0, 0, 0.92)';
      ctx.shadowBlur = size * blurFactor;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.lineWidth = 150;
      ctx.strokeStyle = '#000000';
      ctx.stroke(p);
      ctx.restore();
    }
    // 2. Crisp dark contour border
    ctx.save();
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.lineWidth = 135;
    ctx.strokeStyle = '#09090b';
    ctx.stroke(p);
    ctx.restore();

    // 3. Pure white crossbar fill
    ctx.fillStyle = '#ffffff';
    ctx.fill(p);
  } else if (mode === 'tray-windows') {
    // Windows Tray: High-contrast black outer contour + subtle dark halo + pure white interior
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
    ctx.shadowBlur = Math.max(2, size * 0.05);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.lineWidth = 280;
    ctx.strokeStyle = '#000000';
    ctx.stroke(p);
    ctx.restore();

    ctx.fillStyle = '#ffffff';
    ctx.fill(p);
  } else if (mode === 'tray-macos-template') {
    // macOS HIG Template Icon: Pure black #000000 + alpha (macOS automatically tints white/black)
    ctx.save();
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.lineWidth = 55;
    ctx.strokeStyle = '#000000';
    ctx.stroke(p);
    ctx.fillStyle = '#000000';
    ctx.fill(p);
    ctx.restore();
  }

  ctx.restore();
  const imgData = ctx.getImageData(0, 0, size, size).data;
  let binary = '';
  for (let i = 0; i < imgData.length; i++) {
    binary += String.fromCharCode(imgData[i]);
  }
  return {
    png: canvas.toDataURL('image/png').split(',')[1],
    rgba: size <= 64 ? btoa(binary) : '',
  };
}

async function run() {
  const win64 = drawCrossbarToCanvas(64, 'tray-windows');
  const mac64 = drawCrossbarToCanvas(64, 'tray-macos-template');
  const payload = {
    appFrameless1024: drawCrossbarToCanvas(1024, 'frameless-white-black-glow').png,
    appSquircle1024: drawCrossbarToCanvas(1024, 'squircle-dark').png,
    trayWin64: win64.png,
    trayWin64Rgba: win64.rgba,
    trayWin32: drawCrossbarToCanvas(32, 'tray-windows').png,
    trayMac64: mac64.png,
    trayMac64Rgba: mac64.rgba,
    trayMac32: drawCrossbarToCanvas(32, 'tray-macos-template').png,
  };
  await fetch('/__icons_done', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}
run();
</script>
</body>
</html>`;
}

async function main() {
  fs.mkdirSync(ICONS_DIR, { recursive: true });

  let resolvePayload;
  const payloadPromise = new Promise((resolve) => {
    resolvePayload = resolve;
  });

  const server = http.createServer((req, res) => {
    if (req.method === 'POST' && req.url === '/__icons_done') {
      const chunks = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => {
        res.writeHead(200);
        res.end('ok');
        resolvePayload(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      });
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(buildRendererHtml());
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;

  const chromeBin = process.env.CHROME_BIN || '/usr/bin/google-chrome';
  const chromeProc = spawn(
    chromeBin,
    [
      '--headless=new',
      '--no-sandbox',
      '--disable-gpu',
      '--disable-dev-shm-usage',
      `http://127.0.0.1:${port}/`,
    ],
    { stdio: 'ignore' }
  );

  const result = await payloadPromise;
  try {
    chromeProc.kill('SIGKILL');
  } catch {
    // ignore
  }
  server.close();

  const framelessPath = path.join(ICONS_DIR, 'icon-frameless-source.png');
  const squirclePath = path.join(ICONS_DIR, 'icon-squircle-dark.png');
  fs.writeFileSync(framelessPath, Buffer.from(result.appFrameless1024, 'base64'));
  fs.writeFileSync(squirclePath, Buffer.from(result.appSquircle1024, 'base64'));

  fs.writeFileSync(
    path.join(ICONS_DIR, 'tray-icon-win.png'),
    Buffer.from(result.trayWin64, 'base64')
  );
  fs.writeFileSync(
    path.join(ICONS_DIR, 'tray-icon-win-64x64.rgba'),
    Buffer.from(result.trayWin64Rgba, 'base64')
  );
  fs.writeFileSync(
    path.join(ICONS_DIR, 'tray-icon-win@1x.png'),
    Buffer.from(result.trayWin32, 'base64')
  );
  fs.writeFileSync(
    path.join(ICONS_DIR, 'tray-icon-macos-template.png'),
    Buffer.from(result.trayMac64, 'base64')
  );
  fs.writeFileSync(
    path.join(ICONS_DIR, 'tray-icon-macos-64x64.rgba'),
    Buffer.from(result.trayMac64Rgba, 'base64')
  );
  fs.writeFileSync(
    path.join(ICONS_DIR, 'tray-icon-macos-template@1x.png'),
    Buffer.from(result.trayMac32, 'base64')
  );
  // Default cross-platform tray icon fallback
  fs.writeFileSync(
    path.join(ICONS_DIR, 'tray-icon.png'),
    Buffer.from(result.trayWin64, 'base64')
  );

  // Use Tauri CLI to generate all standard bundle icons (.icns, .ico, 32x32, 128x128, etc.)
  // Default desktop icon uses the frameless white crossbar with dark outer glow/stroke
  execFileSync('pnpm', ['tauri', 'icon', framelessPath, '--output', ICONS_DIR], {
    cwd: ROOT_DIR,
    stdio: 'inherit',
  });

  // Clean up temporary source file and mobile icon folders so only desktop & tray icons remain
  fs.unlinkSync(framelessPath);
  fs.rmSync(path.join(ICONS_DIR, 'android'), { recursive: true, force: true });
  fs.rmSync(path.join(ICONS_DIR, 'ios'), { recursive: true, force: true });
  console.log(
    '[generateTauriCrossbarIcons] Successfully generated Crossbar #1 (7267515) desktop & tray icons.'
  );
}

main().catch((err) => {
  console.error('[generateTauriCrossbarIcons] Failed:', err);
  process.exit(1);
});
