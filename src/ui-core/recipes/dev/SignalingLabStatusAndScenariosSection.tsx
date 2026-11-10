import React from 'react';
import { Play, ShieldAlert } from 'lucide-react';
import { DevSignalingRelayStatusGrid } from './DevSignalingRelayStatusGrid';
import type {
  CanonicalLabRelayId,
  SignalingLabEndpointViewConfig,
  SignalingLabProbeSummaryView,
  SignalingLabScenarioId,
} from './signalingLabTypes';

export interface SignalingLabStatusAndScenariosSectionProps {
  isLight: boolean;
  endpointConfig: SignalingLabEndpointViewConfig;
  probeSummary: SignalingLabProbeSummaryView | null;
  isBusy: boolean;
  customSourceRelay: CanonicalLabRelayId;
  onCustomSourceRelayChange: (next: CanonicalLabRelayId) => void;
  customTargetRelay: CanonicalLabRelayId;
  onCustomTargetRelayChange: (next: CanonicalLabRelayId) => void;
  onRunScenario: (scenario: SignalingLabScenarioId, label: string) => void;
  onHover: (desc: string | null) => void;
}

const QUICK_SCENARIOS: ReadonlyArray<{
  id: SignalingLabScenarioId;
  title: string;
  subtitle: string;
  actionLabel: string;
  hoverDesc: string;
  icon: 'play' | 'shield';
}> = [
  {
    id: 'emqx-cn-direct',
    title: '1. emqx_cn Direct (dir/+)',
    subtitle: 'Same-relay E2EE SDP/ICE on Hangzhou EMQX (0 Webhook)',
    actionLabel: 'Testing emqx_cn <-> emqx_cn Direct (dir/+)...',
    hoverDesc: 'Two peers on emqx_cn exchange E2EE SDP Offer/Answer directly on dir/<topicHash>.',
    icon: 'play',
  },
  {
    id: 'emqx-gb-direct',
    title: '2. emqx_gb Direct (dir/+)',
    subtitle: 'Same-relay E2EE SDP/ICE on Global Asia-SE1 EMQX (0 Webhook)',
    actionLabel: 'Testing emqx_gb <-> emqx_gb Direct (dir/+)...',
    hoverDesc: 'Two peers on emqx_gb exchange E2EE SDP Offer/Answer directly on dir/<topicHash>.',
    icon: 'play',
  },
  {
    id: 'supabase-jp-direct',
    title: '3. supabase_jp Direct (dir:+)',
    subtitle: 'Phoenix Broadcast E2EE SDP/ICE on Tokyo RTJP',
    actionLabel: 'Testing supabase_jp <-> supabase_jp Direct (dir:+)...',
    hoverDesc: 'Two peers on supabase_jp exchange E2EE SDP Offer/Answer over Phoenix Channel.',
    icon: 'play',
  },
  {
    id: 'supabase-sg-direct',
    title: '4. supabase_sg Direct (dir:+)',
    subtitle: 'Phoenix Broadcast E2EE SDP/ICE on Singapore RTSG',
    actionLabel: 'Testing supabase_sg <-> supabase_sg Direct (dir:+)...',
    hoverDesc: 'Two peers on supabase_sg exchange E2EE SDP Offer/Answer over Phoenix Channel.',
    icon: 'play',
  },
  {
    id: 'bridge-jp-to-cn',
    title: '5. Bridge: supabase_jp -> emqx_cn',
    subtitle: 'JP Client -> JP Edge (CN Bridge Account) -> emqx_cn (dir)',
    actionLabel: 'Testing supabase_jp -> JP Edge -> emqx_cn...',
    hoverDesc: 'Isolated supabase_jp peer bridges through JP Edge Function to emqx_cn.',
    icon: 'play',
  },
  {
    id: 'bridge-sg-to-gb',
    title: '6. Bridge: supabase_sg -> emqx_gb',
    subtitle: 'SG Client -> SG Edge (GB Bridge Account) -> emqx_gb (dir)',
    actionLabel: 'Testing supabase_sg -> SG Edge -> emqx_gb...',
    hoverDesc: 'Isolated supabase_sg peer bridges through SG Edge Function to emqx_gb.',
    icon: 'play',
  },
  {
    id: 'bridge-cn-to-jp',
    title: '7. EMQX_CN Rule -> supabase_jp',
    subtitle: 'emqx_cn (brg/+) -> EMQX Rule Webhook -> JP Edge -> supabase_jp',
    actionLabel: 'Testing emqx_cn Rule Engine -> JP Edge -> supabase_jp...',
    hoverDesc: 'Publishes to emqx_cn brg/<hash> to verify EMQX_CN Rule Engine HTTP Webhook.',
    icon: 'play',
  },
  {
    id: 'bridge-gb-to-sg',
    title: '8. EMQX_GB Rule -> supabase_sg',
    subtitle: 'emqx_gb (brg/+) -> EMQX Rule Webhook -> SG Edge -> supabase_sg',
    actionLabel: 'Testing emqx_gb Rule Engine -> SG Edge -> supabase_sg...',
    hoverDesc: 'Publishes to emqx_gb brg/<hash> to verify EMQX_GB Rule Engine HTTP Webhook.',
    icon: 'play',
  },
  {
    id: 'anti-loop-torture',
    title: '9. 5-Layer Anti-Loop Guard Check',
    subtitle: 'Verifies BridgeUser, DirTopic, LegacyId, HopTTL=1 & MsgId Dedup',
    actionLabel: 'Running 5-Layer Anti-Loop Guard Verification...',
    hoverDesc: 'Verifies all 5 server-side anti-loop guards on the Edge Function bridge.',
    icon: 'shield',
  },
];

export const SignalingLabStatusAndScenariosSection: React.FC<
  SignalingLabStatusAndScenariosSectionProps
> = React.memo((props) => {
  const { isLight, isBusy, onRunScenario, onHover } = props;

  return (
    <>
      <DevSignalingRelayStatusGrid {...props} />

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
        {QUICK_SCENARIOS.map((spec) => (
          <button
            key={spec.id}
            type="button"
            disabled={isBusy}
            onClick={() => onRunScenario(spec.id, spec.actionLabel)}
            onMouseEnter={() => onHover(spec.hoverDesc)}
            onMouseLeave={() => onHover(null)}
            className={`p-2 rounded-xl border text-left flex flex-col gap-0.5 transition-all cursor-pointer active:scale-[0.98] disabled:opacity-50 ${
              isLight
                ? 'bg-neutral-100/80 hover:bg-neutral-200/70 border-neutral-300'
                : 'bg-neutral-800/50 hover:bg-neutral-800 border-neutral-700'
            }`}
          >
            <span
              className={`text-xs font-bold inline-flex items-center gap-1.5 ${
                isLight ? 'text-neutral-900' : 'text-neutral-100'
              }`}
            >
              {spec.icon === 'shield' ? (
                <ShieldAlert className="h-3.5 w-3.5 text-rose-500 shrink-0" />
              ) : (
                <Play className="h-3 w-3 text-cyan-500 fill-current shrink-0" />
              )}
              <span className="truncate">{spec.title}</span>
            </span>
            <span
              className={`text-[10px] leading-snug truncate ${
                isLight ? 'text-neutral-600' : 'text-neutral-400'
              }`}
            >
              {spec.subtitle}
            </span>
          </button>
        ))}
      </div>
    </>
  );
});

SignalingLabStatusAndScenariosSection.displayName = 'SignalingLabStatusAndScenariosSection';
