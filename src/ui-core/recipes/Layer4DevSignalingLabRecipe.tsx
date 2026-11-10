import React, { useState } from 'react';
import {
  CheckCircle2,
  GraphStar,
  Info,
  RefreshCw,
  ShieldCheck,
  Wifi,
  XCircle,
} from 'lucide-react';
import { Card } from '../layout/Card';
import { PanelContainer, PanelHeader, PanelContent } from '../layout/Panel';
import { PanelFooter } from '../layout/PanelFooter';
import type { SurfaceMeta } from '../manifest/surfaceMetaTypes';
import { resolveCalibratedSurfaceSizing } from '../manifest/surfaceCalibration';
import { useAppStore } from '../stores/appStore';
import { useMenuLayoutStore } from '../stores/menuLayoutStore';
import { useStoreSnapshotOverride } from '../stores/storeSnapshotScope';
import {
  type Layer4DevSignalingLabRecipeProps,
  type Layer4DevSignalingLabStateOverride,
  type SignalingLabScenarioId,
} from './dev/signalingLabTypes';
import { Layer3DevSelfTestRecipe } from './Layer3DevSelfTestRecipe';
import { useLayer4DevSignalingLabBinding } from './hooks/useLayer4DevSignalingLabBinding';
import { SignalingLabStatusAndScenariosSection } from './dev/SignalingLabStatusAndScenariosSection';
import { SignalingLabLiveMonitorsSection } from './dev/SignalingLabLiveMonitorsSection';

export const SURFACE_META: SurfaceMeta = {
  id: 'recipe:Layer4DevSignalingLabRecipe',
  title: '4-Server Signaling & Dual Bridge Lab',
  subtitle:
    'Full-mesh EMQX CN/GB + Supabase JP/SG physical dir/brg isolation, 4-bit mask, and 5-layer anti-loop guards',
  icon: 'wifi',
  layer: 'layer4',
  menuGroup: 'menu-layer',
  defaultSizing: {
    mode: 'adaptive',
    width: 760,
    height: 680,
    minHeight: 260,
    maxHeight: 1120,
  },
};

export type {
  CanonicalLabEdgeNodeId,
  CanonicalLabRelayId,
  Layer4DevSignalingLabRecipeProps,
  Layer4DevSignalingLabStateOverride,
  SignalingLabCloudAuditLogItem,
  SignalingLabCloudStatsView,
  SignalingLabEndpointViewConfig,
  SignalingLabPacketTraceItem,
  SignalingLabProbeSummaryView,
  SignalingLabScenarioId,
  SignalingLabSlotViewItem,
} from './dev/signalingLabTypes';

/**
 * [Recipe] Layer 4 Developer -> Under Development -> 4-Server Mesh & Dual Bridge Lab
 * Theme-adaptive (light & dark) interactive workbench for inspecting `emqx_cn`, `emqx_gb`,
 * `supabase_jp`, and `supabase_sg` physical dir/brg topic isolation, 4-bit connectivity mask,
 * Dual Edge Function (JP + SG) 1-to-3 fanout, and 5-layer anti-loop guards.
 */
export const Layer4DevSignalingLabRecipe: React.FC<Layer4DevSignalingLabRecipeProps> = React.memo(
  (rawProps) => {
    const scopeOverride =
      useStoreSnapshotOverride<Layer4DevSignalingLabStateOverride>('signalingLab');
    const mergedProps = {
      ...scopeOverride,
      ...rawProps.stateOverride,
      ...rawProps,
    };
    const {
      isDevPrivateSource,
      isLight,
      onBack,
      sizing: propSizing,
      endpointConfig,
      probeSummary,
      traces,
      roomCode,
      onRoomCodeChange: setRoomCode,
      roomPassword,
      onRoomPasswordChange: setRoomPassword,
      customSourceRelay,
      onCustomSourceRelayChange: setCustomSourceRelay,
      customTargetRelay,
      onCustomTargetRelayChange: setCustomTargetRelay,
      isBusy,
      activeActionLabel,
      lastResultBanner,
      onProbeAll,
      onCloudSelfTest,
      onOneClickFullDiagnostic,
      onRunScenario,
      onClearTraces,
    } = useLayer4DevSignalingLabBinding(mergedProps);
    const className = rawProps.className ?? '';

    const [showEmqxRuleGuide, setShowEmqxRuleGuide] = useState(false);
    const [copiedLabel, setCopiedLabel] = useState<string | null>(null);
    const [hoveredDesc, setHoveredDesc] = useState<string | null>(null);

    const storeSizing = useMenuLayoutStore((s) => s.panels?.['layer4-dev-signaling-lab']);
    const calibratedSizing = resolveCalibratedSurfaceSizing(
      SURFACE_META.id,
      SURFACE_META.defaultSizing
    );
    const defaultResolvedSizing = {
      mode: calibratedSizing.mode === 'fixed' ? ('fixed' as const) : ('auto' as const),
      width: calibratedSizing.width,
      targetHeight:
        typeof calibratedSizing.height === 'number' ? calibratedSizing.height : 680,
      minHeight: calibratedSizing.minHeight ?? 260,
      maxHeight: calibratedSizing.maxHeight ?? 1120,
    };
    const sizing = propSizing ?? storeSizing ?? defaultResolvedSizing;

    if (!isDevPrivateSource) {
      return <Layer3DevSelfTestRecipe isLight={isLight} onBack={onBack} />;
    }

    const handleCopyText = (text: string, label: string) => {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        void navigator.clipboard.writeText(text);
        setCopiedLabel(label);
        window.setTimeout(() => setCopiedLabel(null), 1800);
      }
    };

    const handleScenarioClick = (scenario: SignalingLabScenarioId, label: string) => {
      onRunScenario?.(scenario, label);
    };

    return (
      <PanelContainer
        isLight={isLight}
        sizing={sizing}
        className={`w-full select-none ${className}`}
      >
        <PanelHeader
          title="4-SERVER SIGNALING & DUAL BRIDGE LAB"
          onBack={onBack}
          isLight={isLight}
        />

        <PanelContent scrollable className="flex flex-col gap-2 text-left">
          {/* Top Control & One-Click Diagnostic Toolbar Card */}
          <Card isLight={isLight} variant="outlined" padding="sm" className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <GraphStar
                  className={`h-4 w-4 shrink-0 ${isLight ? 'text-cyan-600' : 'text-cyan-400'}`}
                />
                <span
                  className={`text-xs font-bold uppercase tracking-wider truncate ${
                    isLight ? 'text-neutral-800' : 'text-neutral-200'
                  }`}
                >
                  4-Server Full-Mesh &amp; Dual Edge Bridge Monitor
                </span>
                <span
                  className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold border shrink-0 ${
                    isLight
                      ? 'bg-neutral-100 border-neutral-300 text-neutral-700'
                      : 'bg-neutral-800/80 border-neutral-700 text-neutral-300'
                  }`}
                >
                  NS: {endpointConfig.topicNamespace}
                </span>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => onOneClickFullDiagnostic?.()}
                  onMouseEnter={() =>
                    setHoveredDesc(
                      'One-Click Full Diagnostic: Sequentially verifies 4 Relay Slots -> Dual Cloud Edge Self-Test -> 5-Layer Anti-Loop -> Outbound Bridges -> EMQX Rule Webhooks, stopping on the exact step if anything fails.'
                    )
                  }
                  onMouseLeave={() => setHoveredDesc(null)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border inline-flex items-center gap-1 transition-colors cursor-pointer disabled:opacity-50 ${
                    isLight
                      ? 'border-emerald-600/40 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-900'
                      : 'border-emerald-400/40 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-200'
                  }`}
                >
                  <ShieldCheck className="h-3.5 w-3.5" />
                  <span>One-Click Full Diagnostic</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowEmqxRuleGuide((v) => !v)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-colors cursor-pointer ${
                    isLight
                      ? 'border-amber-500/40 bg-amber-500/15 hover:bg-amber-500/25 text-amber-800'
                      : 'border-amber-400/40 bg-amber-500/15 hover:bg-amber-500/25 text-amber-300'
                  }`}
                >
                  {showEmqxRuleGuide ? 'Hide EMQX Rule SQL' : 'EMQX CN/GB Rule SQL'}
                </button>
              </div>
            </div>

            <div
              className={`flex flex-wrap items-center justify-between gap-2 pt-1.5 border-t ${
                isLight ? 'border-neutral-200/80' : 'border-neutral-800'
              }`}
            >
              <div className="flex flex-wrap items-center gap-2">
                <label className={`text-[11px] font-semibold ${isLight ? 'text-neutral-600' : 'text-neutral-400'}`}>
                  Room:
                </label>
                <input
                  type="text"
                  value={roomCode}
                  onChange={(e) => setRoomCode(e.target.value)}
                  className={`w-24 px-2 py-0.5 rounded-md border text-xs font-mono outline-none ${
                    isLight
                      ? 'bg-white border-neutral-300 text-neutral-900'
                      : 'bg-neutral-900 border-neutral-700 text-neutral-100'
                  }`}
                />
                <label className={`text-[11px] font-semibold ${isLight ? 'text-neutral-600' : 'text-neutral-400'}`}>
                  Key:
                </label>
                <input
                  type="text"
                  value={roomPassword}
                  onChange={(e) => setRoomPassword(e.target.value)}
                  className={`w-20 px-2 py-0.5 rounded-md border text-xs font-mono outline-none ${
                    isLight
                      ? 'bg-white border-neutral-300 text-neutral-900'
                      : 'bg-neutral-900 border-neutral-700 text-neutral-100'
                  }`}
                />
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => onProbeAll?.()}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold border inline-flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50 ${
                    isLight
                      ? 'bg-neutral-100 hover:bg-neutral-200 border-neutral-300 text-neutral-800'
                      : 'bg-neutral-800 hover:bg-neutral-700 border-neutral-700 text-neutral-200'
                  }`}
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${isBusy ? 'animate-spin' : ''}`} />
                  <span>Probe 4 Relays</span>
                </button>

                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => onCloudSelfTest?.()}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold border inline-flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50 ${
                    isLight
                      ? 'border-cyan-500/40 bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-800'
                      : 'border-cyan-400/40 bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-200'
                  }`}
                >
                  <Wifi className="h-3.5 w-3.5" />
                  <span>Dual Cloud Self-Test</span>
                </button>
              </div>
            </div>
          </Card>

          {/* 4+2 Status Cards + Custom Pair Runner + 9 Scenario Buttons */}
          <SignalingLabStatusAndScenariosSection
            isLight={isLight}
            endpointConfig={endpointConfig}
            probeSummary={probeSummary}
            isBusy={isBusy}
            customSourceRelay={customSourceRelay}
            onCustomSourceRelayChange={setCustomSourceRelay}
            customTargetRelay={customTargetRelay}
            onCustomTargetRelayChange={setCustomTargetRelay}
            onRunScenario={handleScenarioClick}
            onHover={setHoveredDesc}
          />

          {/* Active Action / Last Result Diagnostic Banner */}
          {(activeActionLabel || lastResultBanner) && (
            <div
              className={`px-3 py-2 rounded-xl border text-xs flex items-center justify-between gap-2 ${
                activeActionLabel
                  ? isLight
                    ? 'bg-cyan-500/10 border-cyan-500/35 text-cyan-900'
                    : 'bg-cyan-500/10 border-cyan-400/30 text-cyan-200'
                  : lastResultBanner?.ok
                  ? isLight
                    ? 'bg-emerald-500/10 border-emerald-500/35 text-emerald-900'
                    : 'bg-emerald-500/10 border-emerald-400/30 text-emerald-200'
                  : isLight
                  ? 'bg-rose-500/10 border-rose-500/35 text-rose-900'
                  : 'bg-rose-500/10 border-rose-400/30 text-rose-200'
              }`}
            >
              <div className="flex items-center gap-2 min-w-0">
                {activeActionLabel ? (
                  <RefreshCw className="h-4 w-4 animate-spin shrink-0 text-cyan-500" />
                ) : lastResultBanner?.ok ? (
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
                ) : (
                  <XCircle className="h-4 w-4 shrink-0 text-rose-500" />
                )}
                <span className="break-words font-medium">
                  {activeActionLabel || lastResultBanner?.text}
                </span>
              </div>
            </div>
          )}

          {/* Collapsible EMQX Rule SQL + Dual Live Monitors */}
          <SignalingLabLiveMonitorsSection
            isLight={isLight}
            showEmqxRuleGuide={showEmqxRuleGuide}
            copiedLabel={copiedLabel}
            endpointConfig={endpointConfig}
            traces={traces}
            combinedLogs={probeSummary?.combinedLogs || []}
            onCopyText={handleCopyText}
            onClearTraces={() => onClearTraces?.()}
            onRefreshLogs={() => onProbeAll?.()}
            onHover={setHoveredDesc}
          />
        </PanelContent>

        <PanelFooter
          isLight={isLight}
          defaultDescription="4-Server Full-Mesh & Dual Edge Bridge Lab: emqx_cn (8), emqx_gb (4), supabase_jp (2), supabase_sg (1)."
          hoveredDescription={hoveredDesc}
          icon={<Info className="h-3.5 w-3.5 text-neutral-400 shrink-0" />}
        />
      </PanelContainer>
    );
  }
);

Layer4DevSignalingLabRecipe.displayName = 'Layer4DevSignalingLabRecipe';
export default Layer4DevSignalingLabRecipe;
