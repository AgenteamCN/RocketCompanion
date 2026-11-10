import React from 'react';
import { Zap, Eye, RotateCcw, Bug, Activity } from 'lucide-react';
import { useNetworkDiagnosticsData, networkDiagnosticsStore } from '../../../stores/networkDiagnosticsStore';
import { NETWORK_STRESS_PRESET_LIST } from '../../../config/networkStressConfig';
import { SliderControl } from '../../../primitives/SliderControl';

export interface NetworkStressControlsSectionProps {
  isLight?: boolean;
}

export const NetworkStressControlsSection: React.FC<NetworkStressControlsSectionProps> = ({
  isLight = false,
}) => {
  const { metrics } = useNetworkDiagnosticsData();

  return (
    <div
      className={`p-2 rounded-xl border flex flex-col gap-1.5 font-mono text-[11px] ${
        isLight ? 'bg-neutral-50/80 border-neutral-200' : 'bg-neutral-850/80 border-neutral-700/80'
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-neutral-400 uppercase tracking-wider font-semibold">
          Network Stress Presets & Disconnect Probes
        </span>
        <span className="text-[10px] text-amber-400 font-bold">
          Injected RTT: +{metrics.extraRttMs}ms (↑{metrics.extraUplinkMs}/{metrics.extraDownlinkMs}↓)
        </span>
      </div>
      <div className="flex flex-wrap gap-1">
        {NETWORK_STRESS_PRESET_LIST.map((preset) => (
          <button
            key={preset.id}
            type="button"
            onClick={() => networkDiagnosticsStore.applyStressPreset(preset.id)}
            className={`px-1.5 py-0.5 rounded border text-[10px] cursor-pointer transition-colors ${
              metrics.stressPresetId === preset.id
                ? 'bg-amber-500 text-black font-bold border-amber-400'
                : 'bg-neutral-800 border-neutral-700 text-neutral-300 hover:text-white'
            }`}
          >
            {preset.id === 'ideal_lan'
              ? 'LAN 0ms'
              : preset.id === 'wifi_jitter'
              ? 'Wi-Fi Jitter'
              : preset.id === 'asymmetric_link'
              ? 'Asym ↑10/40↓'
              : preset.id === 'cross_region'
              ? 'Cross-Region'
              : preset.id === 'cellular_4g'
              ? '4G Loss'
              : preset.id === 'severe_spike'
              ? 'Congestion'
              : preset.id === 'stale_1s_probe'
              ? '1s Stale Probe'
              : '30s Disconnect'}
          </button>
        ))}
      </div>

      {/* Asymmetric Uplink Delay Slider */}
      <SliderControl
        label="Uplink Delay ↑ (0~500ms)"
        value={metrics.extraUplinkMs}
        min={0}
        max={500}
        step={metrics.adjustStepMs}
        unit=" ms"
        editable={true}
        showStepper={true}
        colorScheme="amber"
        isLight={isLight}
        onChange={(val) => networkDiagnosticsStore.setExtraUplinkLatency(val)}
      />

      {/* Asymmetric Downlink Delay Slider */}
      <SliderControl
        label="Downlink Delay ↓ (0~500ms)"
        value={metrics.extraDownlinkMs}
        min={0}
        max={500}
        step={metrics.adjustStepMs}
        unit=" ms"
        editable={true}
        showStepper={true}
        colorScheme="amber"
        isLight={isLight}
        onChange={(val) => networkDiagnosticsStore.setExtraDownlinkLatency(val)}
      />

      {/* Jitter Slider */}
      <SliderControl
        label="Simulated Jitter (0~100ms)"
        value={metrics.jitterMs}
        min={0}
        max={100}
        step={1}
        unit=" ms"
        editable={true}
        showStepper={true}
        colorScheme="amber"
        isLight={isLight}
        onChange={(val) => networkDiagnosticsStore.setJitter(val)}
      />

      {/* Random Drop Slider (0~100%) */}
      <SliderControl
        label="Random Drop (0~100%)"
        value={metrics.packetLossPct}
        min={0}
        max={100}
        step={1}
        unit="%"
        editable={true}
        showStepper={true}
        colorScheme="amber"
        isLight={isLight}
        onChange={(val) => networkDiagnosticsStore.setPacketLoss(val)}
      />

      {/* Periodic / Intermittent Burst Drop Controls */}
      <div className="pt-1 border-t border-neutral-700/50 flex flex-col gap-1">
        <div className="flex items-center justify-between gap-2">
          <span className="text-neutral-400">Intermittent Burst Drop (Key 8):</span>
          <button
            type="button"
            onClick={() => networkDiagnosticsStore.toggleBurstDrop()}
            className={`flex items-center gap-1 px-2 py-0.5 rounded border text-[10px] font-bold cursor-pointer transition-colors ${
              metrics.burstDropEnabled
                ? 'bg-rose-500 text-black border-rose-400'
                : 'bg-neutral-800 border-neutral-700 text-neutral-400 hover:text-white'
            }`}
          >
            <Zap className="h-3 w-3" />
            <span>{metrics.burstDropEnabled ? 'ENABLED' : 'DISABLED'}</span>
          </button>
        </div>

        <SliderControl
          label="Burst Drop Period (1~5s / ms)"
          value={metrics.burstPeriodMs || 2000}
          min={1000}
          max={5000}
          step={1000}
          unit=" ms"
          editable={true}
          allowOutOfBoundsInput={true}
          showStepper={true}
          colorScheme="amber"
          isLight={isLight}
          onChange={(val) => networkDiagnosticsStore.setBurstPeriodMs(Math.max(1, Math.round(val)))}
        />

        <SliderControl
          label={`Burst Drop Duration (${metrics.burstDurationMs ?? 0}ms / max ${Math.max(0, (metrics.burstPeriodMs || 2000) - 1)}ms)`}
          value={metrics.burstDurationPct}
          min={0}
          max={99}
          step={1}
          unit="%"
          editable={true}
          showStepper={true}
          colorScheme="amber"
          isLight={isLight}
          onChange={(val) => networkDiagnosticsStore.setBurstDurationPct(val)}
        />
      </div>

      {/* Adjust Step Controls */}
      <div className="flex items-center justify-between text-[10px]">
        <span className="text-neutral-400">Step (Keys 9 / 0):</span>
        <div className="flex items-center gap-1">
          {[1, 5, 10, 25, 50].map((step) => (
            <button
              key={step}
              type="button"
              onClick={() => networkDiagnosticsStore.setAdjustStep(step)}
              className={`px-1.5 py-0.5 rounded border transition-colors cursor-pointer ${
                metrics.adjustStepMs === step
                  ? 'bg-amber-500 text-black font-bold border-amber-400'
                  : 'bg-neutral-800 text-neutral-400 border-neutral-700 hover:text-white'
              }`}
            >
              {step}ms
            </button>
          ))}
        </div>
      </div>

      {/* Visual Smoothing & Reset Actions */}
      <div className="flex items-center justify-between pt-1 border-t border-neutral-700/50">
        <button
          type="button"
          onClick={() => networkDiagnosticsStore.setVisualSmoothing(!metrics.visualSmoothing)}
          className={`flex items-center gap-1 px-2 py-1 rounded-lg border text-[10px] font-semibold cursor-pointer transition-colors ${
            metrics.visualSmoothing
              ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400'
              : 'bg-neutral-800 border-neutral-700 text-neutral-400'
          }`}
        >
          <Eye className="h-3 w-3" />
          <span>Smoothing: {metrics.visualSmoothing ? 'ON' : 'OFF'}</span>
        </button>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => networkDiagnosticsStore.resetLatency()}
            className="px-2 py-1 rounded-lg bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-neutral-300 text-[10px] font-medium cursor-pointer transition-colors"
          >
            Reset Link
          </button>
          <button
            type="button"
            onClick={() => networkDiagnosticsStore.resetStats()}
            className="flex items-center gap-1 px-2 py-1 rounded-lg bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-neutral-300 text-[10px] font-medium cursor-pointer transition-colors"
          >
            <RotateCcw className="h-3 w-3" />
            <span>Reset Stats</span>
          </button>
        </div>
      </div>

      {/* Packet Capture & Burst Drop Actions */}
      <div className="flex items-center justify-between pt-0.5">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => networkDiagnosticsStore.dumpNextPacket()}
            className="flex items-center gap-1 px-2 py-1 rounded-lg bg-sky-500/20 hover:bg-sky-500/30 text-sky-400 border border-sky-500/30 text-[10px] font-semibold cursor-pointer transition-colors"
          >
            <Bug className="h-3 w-3" />
            <span>Dump Next</span>
          </button>
          <button
            type="button"
            onClick={() => networkDiagnosticsStore.dumpLatestPacket()}
            className="flex items-center gap-1 px-2 py-1 rounded-lg bg-sky-500/20 hover:bg-sky-500/30 text-sky-400 border border-sky-500/30 text-[10px] font-semibold cursor-pointer transition-colors"
          >
            <Activity className="h-3 w-3" />
            <span>Dump Latest</span>
          </button>
        </div>

        <button
          type="button"
          onClick={() => networkDiagnosticsStore.toggleBurstDrop()}
          className={`flex items-center gap-1 px-2 py-1 rounded-lg font-bold text-[10px] border cursor-pointer transition-all active:scale-95 ${
            metrics.burstDropEnabled
              ? 'bg-rose-500 text-black border-rose-400'
              : 'bg-rose-500/20 hover:bg-rose-500/30 text-rose-400 border-rose-500/30'
          }`}
        >
          <Zap className="h-3 w-3" />
          <span>{metrics.burstDropEnabled ? 'Burst Drop: ON (Key 8)' : 'Burst Drop: OFF (Key 8)'}</span>
        </button>
      </div>
    </div>
  );
};
