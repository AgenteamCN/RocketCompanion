import React, { useEffect, useState } from 'react';
import {
  Rocket,
  Sliders,
  Monitor,
  ExternalLink,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Terminal,
  ShieldCheck,
  Smartphone,
  Cpu,
} from 'lucide-react';

interface EndpointStatus {
  port: number;
  protocol: 'http' | 'https';
  name: string;
  role: string;
  online: boolean;
  checking: boolean;
}

const ENDPOINTS: Omit<EndpointStatus, 'online' | 'checking'>[] = [
  {
    port: 3001,
    protocol: 'https',
    name: 'Rocket Companion (HTTPS)',
    role: 'Main 3D Engine & WebRTC / SharedArrayBuffer Host',
  },
  {
    port: 3002,
    protocol: 'http',
    name: 'RC UI Tuner Workbench',
    role: 'Component Matrix, Surface Calibration & WS State Sync',
  },
  {
    port: 3003,
    protocol: 'http',
    name: 'Tauri WebView / HTTP Mirror',
    role: 'Zero-SSL-Warning Localhost Secure Context & Desktop Bridge',
  },
];

export const EntryHubApp: React.FC = () => {
  const [statuses, setStatuses] = useState<Record<number, { online: boolean; checking: boolean }>>({
    3001: { online: true, checking: false },
    3002: { online: true, checking: false },
    3003: { online: true, checking: false },
  });

  const hostname = typeof window !== 'undefined' ? window.location.hostname || 'localhost' : 'localhost';

  const probePorts = async () => {
    setStatuses((prev) => ({
      3001: { ...prev[3001], checking: true },
      3002: { ...prev[3002], checking: true },
      3003: { ...prev[3003], checking: true },
    }));

    try {
      const res = await fetch('/__rc_entry_status', { cache: 'no-store' });
      if (res.ok) {
        const data = (await res.json()) as Record<string, boolean>;
        setStatuses({
          3001: { online: Boolean(data['3001']), checking: false },
          3002: { online: Boolean(data['3002']), checking: false },
          3003: { online: Boolean(data['3003']), checking: false },
        });
        return;
      }
    } catch {
      // Fallback if status endpoint is not mounted
    }

    setStatuses((prev) => ({
      3001: { online: prev[3001].online, checking: false },
      3002: { online: prev[3002].online, checking: false },
      3003: { online: prev[3003].online, checking: false },
    }));
  };

  useEffect(() => {
    probePorts();
    const timer = setInterval(probePorts, 4000);
    return () => clearInterval(timer);
  }, []);

  const rcHttpsBase = `https://${hostname}:3001`;
  const tunerHttpBase = `http://${hostname}:3002`;
  const tauriHttpBase = `http://${hostname}:3003`;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans p-6 md:p-12 flex flex-col justify-between">
      <div className="max-w-5xl w-full mx-auto space-y-8">
        {/* Header */}
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-zinc-800/80 pb-6">
          <div className="space-y-1.5">
            <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-sky-500/10 border border-sky-500/30 text-sky-400 text-xs font-mono">
              <Terminal className="w-3.5 h-3.5" />
              <span>UNIFIED MONOREPO LAUNCHPAD · PORT 3000</span>
            </div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-white">
              Rocket Companion — Global Entry Hub
            </h1>
            <p className="text-sm text-zinc-400">
              Unified 4-port workspace orchestrating Engine HTTPS (3001), UI Tuner HTTP (3002), and Tauri HTTP Mirror (3003).
            </p>
          </div>

          <button
            type="button"
            onClick={probePorts}
            className="self-start md:self-auto inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-700/80 text-xs font-mono text-zinc-200 cursor-pointer transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Refresh Status</span>
          </button>
        </header>

        {/* 3 Primary Launch Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {/* Card 1: Port 3001 Rocket Companion HTTPS */}
          <div className="rounded-xl bg-zinc-900/90 border border-zinc-800 p-6 flex flex-col justify-between space-y-6">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-mono font-semibold">
                  HTTPS :3001
                </span>
                <StatusBadge state={statuses[3001]} />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center gap-2 text-lg font-bold text-white">
                  <Rocket className="w-5 h-5 text-emerald-400" />
                  <span>Rocket Companion</span>
                </div>
                <p className="text-xs text-zinc-400 leading-relaxed">
                  Primary 3D simulation &amp; gameplay host with self-signed TLS, HTTP/2 high-concurrency streams, and dev profile injection.
                </p>
              </div>
            </div>

            <div className="space-y-3 pt-2 border-t border-zinc-800/80">
              <a
                href={rcHttpsBase}
                target="_blank"
                rel="noreferrer"
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-sm transition-colors"
              >
                <span>Launch RC (HTTPS :3001)</span>
                <ExternalLink className="w-4 h-4" />
              </a>

              <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                <a
                  href={`${rcHttpsBase}/?dev=1`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center justify-center gap-1 px-2.5 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 transition-colors"
                >
                  <Cpu className="w-3 h-3 text-emerald-400" />
                  <span>?dev=1</span>
                </a>
                <a
                  href={`${rcHttpsBase}/?nokey=1`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center justify-center gap-1 px-2.5 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 transition-colors"
                >
                  <ShieldCheck className="w-3 h-3 text-amber-400" />
                  <span>?nokey=1</span>
                </a>
                <a
                  href={`${rcHttpsBase}/?touch=1`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center justify-center gap-1 px-2.5 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 transition-colors"
                >
                  <Smartphone className="w-3 h-3 text-sky-400" />
                  <span>?touch=1</span>
                </a>
                <a
                  href={`${rcHttpsBase}/?touch=2`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center justify-center gap-1 px-2.5 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 transition-colors"
                >
                  <span>?touch=2</span>
                </a>
              </div>
            </div>
          </div>

          {/* Card 2: Port 3002 UI Tuner Workbench */}
          <div className="rounded-xl bg-zinc-900/90 border border-zinc-800 p-6 flex flex-col justify-between space-y-6">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-sky-500/10 border border-sky-500/30 text-sky-400 text-xs font-mono font-semibold">
                  HTTP :3002
                </span>
                <StatusBadge state={statuses[3002]} />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center gap-2 text-lg font-bold text-white">
                  <Sliders className="w-5 h-5 text-sky-400" />
                  <span>RC UI Tuner</span>
                </div>
                <p className="text-xs text-zinc-400 leading-relaxed">
                  Component &amp; state audit workbench (L1–L8) with real-time WebSocket multi-tab synchronization and zero SSL prompts.
                </p>
              </div>
            </div>

            <div className="space-y-3 pt-2 border-t border-zinc-800/80">
              <a
                href={tunerHttpBase}
                target="_blank"
                rel="noreferrer"
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-semibold text-sm transition-colors"
              >
                <span>Launch UI Tuner (:3002)</span>
                <ExternalLink className="w-4 h-4" />
              </a>

              <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                <a
                  href={`${tunerHttpBase}/?tab=overview`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center justify-center px-2.5 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 transition-colors"
                >
                  Overview
                </a>
                <a
                  href={`${tunerHttpBase}/?tab=floating-windows`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center justify-center px-2.5 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 transition-colors"
                >
                  Floating Win
                </a>
                <a
                  href={`${tunerHttpBase}/?tab=layer-preview`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center justify-center px-2.5 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 transition-colors"
                >
                  Menu Layers
                </a>
                <a
                  href={`${tunerHttpBase}/?tab=hud-elements`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center justify-center px-2.5 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 transition-colors"
                >
                  HUD Elements
                </a>
              </div>
            </div>
          </div>

          {/* Card 3: Port 3003 Tauri HTTP Mirror / Bridge */}
          <div className="rounded-xl bg-zinc-900/90 border border-zinc-800 p-6 flex flex-col justify-between space-y-6">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-violet-500/10 border border-violet-500/30 text-violet-400 text-xs font-mono font-semibold">
                  HTTP :3003
                </span>
                <StatusBadge state={statuses[3003]} />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center gap-2 text-lg font-bold text-white">
                  <Monitor className="w-5 h-5 text-violet-400" />
                  <span>Tauri / HTTP Host</span>
                </div>
                <p className="text-xs text-zinc-400 leading-relaxed">
                  Pure HTTP mirror of Rocket Companion for Tauri WebView (`devUrl: http://localhost:3003`) and certificate-free local testing.
                </p>
              </div>
            </div>

            <div className="space-y-3 pt-2 border-t border-zinc-800/80">
              <a
                href={tauriHttpBase}
                target="_blank"
                rel="noreferrer"
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-white font-semibold text-sm transition-colors"
              >
                <span>Open RC HTTP (:3003)</span>
                <ExternalLink className="w-4 h-4" />
              </a>

              <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                <a
                  href={`${tauriHttpBase}/?dev=1`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center justify-center px-2.5 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 transition-colors"
                >
                  HTTP ?dev=1
                </a>
                <a
                  href={`${tauriHttpBase}/?nokey=1`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center justify-center px-2.5 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 transition-colors"
                >
                  HTTP ?nokey=1
                </a>
              </div>
            </div>
          </div>
        </div>

        {/* Port Architecture Summary Table */}
        <div className="rounded-xl bg-zinc-900/60 border border-zinc-800/80 overflow-hidden">
          <div className="px-5 py-3 border-b border-zinc-800/80 text-xs font-mono text-zinc-400 uppercase tracking-wider">
            Active 4-Port Topology
          </div>
          <div className="divide-y divide-zinc-800/60 text-xs font-mono">
            {ENDPOINTS.map((ep) => (
              <div key={ep.port} className="px-5 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-3">
                  <span className="text-zinc-300 font-bold">:{ep.port}</span>
                  <span className="uppercase px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300 text-[10px]">
                    {ep.protocol}
                  </span>
                  <span className="text-zinc-200 font-sans font-medium">{ep.name}</span>
                </div>
                <span className="text-zinc-400 font-sans">{ep.role}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <footer className="max-w-5xl w-full mx-auto pt-8 text-xs font-mono text-zinc-500 flex items-center justify-between">
        <span>RocketCompanion Monorepo · Branch: alpha</span>
        <span>src/ui-core internalized · src/showcase integrated</span>
      </footer>
    </div>
  );
};

const StatusBadge: React.FC<{ state?: { online: boolean; checking: boolean } }> = ({ state }) => {
  if (!state || state.checking) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-mono text-zinc-400">
        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
        <span>Checking</span>
      </span>
    );
  }
  if (state.online) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-mono text-emerald-400">
        <CheckCircle2 className="w-3.5 h-3.5" />
        <span>Online</span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs font-mono text-rose-400">
      <XCircle className="w-3.5 h-3.5" />
      <span>Offline</span>
    </span>
  );
};

export default EntryHubApp;
