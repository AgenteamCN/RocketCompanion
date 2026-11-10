import React from 'react';
import { Eye } from 'lucide-react';
import {
  CenterUpperTypographyConfig,
  CenterUpperTimingConfig,
} from '../../../ui-core/hud/CenterUpperInfoHUD';
import { TakeoverGlowConfig } from '../../../ui-core/hud/TakeoverCountdownHUD';
import { resolveTakeoverTopLabelVisuals } from '../../../ui-core/hud/takeoverCountdownDefaults';
import type { TakeoverVignetteConfig } from '../../../ui-core/hud/TakeoverVignetteOverlay';
import { Badge } from '../../../ui-core/primitives/Badge';
import { CodeBlock } from '../../CodeBlock';

export interface TakeoverScenarioPreset {
  id: string;
  badge: string;
  title: string;
  topText: string;
  subText: string;
  teamSide: 'blue' | 'orange';
}

export const TAKEOVER_SCENARIO_PRESETS: TakeoverScenarioPreset[] = [
  {
    id: 'bot-handoff',
    badge: '1. Bot Takeover - Blue Team',
    title: 'Takeover in... (3 -> 2 -> 1)',
    topText: 'Takeover in...',
    subText: '',
    teamSide: 'blue',
  },
  {
    id: 'reconnect-resume',
    badge: '2. Reconnect Handoff - Orange Team',
    title: 'Takeover in... (Orange Side)',
    topText: 'Takeover in...',
    subText: 'RECONNECTED - OCTANE_99',
    teamSide: 'orange',
  },
  {
    id: 'training-intervention',
    badge: '3. Replay / Training Intervention',
    title: 'Replacing in... (3 -> 2 -> 1)',
    topText: 'Replacing in...',
    subText: '',
    teamSide: 'blue',
  },
];

export interface TakeoverArchetypesSectionProps {
  isLight: boolean;
  stageBgColor: string;
  bottomOffsetPx: number;
  topLabelText: string;
  myTeamSide: 'blue' | 'orange';
  glowConfig: TakeoverGlowConfig;
  typoConfig: CenterUpperTypographyConfig;
  timingConfig: CenterUpperTimingConfig;
  vignetteConfig: TakeoverVignetteConfig;
  onSelectScenario: (preset: TakeoverScenarioPreset) => void;
}

export const TakeoverArchetypesSection: React.FC<TakeoverArchetypesSectionProps> = ({
  isLight,
  stageBgColor,
  bottomOffsetPx,
  topLabelText,
  myTeamSide,
  glowConfig,
  typoConfig,
  timingConfig,
  vignetteConfig,
  onSelectScenario,
}) => {
  return (
    <section
      id="takeover-archetypes"
      className={`p-5 rounded-3xl border flex flex-col gap-5 scroll-mt-24 ${
        isLight
          ? 'bg-white border-neutral-200 text-neutral-900 shadow-xs'
          : 'bg-neutral-900/80 border-neutral-800 text-neutral-100 shadow-lg'
      }`}
    >
      <div className="flex items-center justify-between border-b pb-2.5 border-neutral-200 dark:border-neutral-800 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Badge variant="amber" size="sm" isLight={isLight}>
            5G-3
          </Badge>
          <h2 className="text-sm font-bold font-mono">
            Takeover Handoff Scenario Presets &amp; Decoupled Code Recipe
          </h2>
        </div>
        <span className="text-xs font-mono opacity-65">
          Click any card to switch Team Side (Blue vs Orange) &amp; run the replacing-in -&gt; 3-2-1 -&gt; Cockpit HUD sequence
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {TAKEOVER_SCENARIO_PRESETS.map((preset) => {
          const topVisuals = resolveTakeoverTopLabelVisuals(glowConfig, preset.teamSide);
          return (
            <div
              key={preset.id}
              onClick={() => onSelectScenario(preset)}
              className="group relative h-44 rounded-2xl border border-neutral-800 overflow-hidden flex flex-col items-center justify-center gap-2 cursor-pointer transition-transform hover:scale-[1.01]"
              style={{ backgroundColor: stageBgColor }}
            >
              <span className="absolute top-2.5 left-3 text-[10px] font-mono tracking-wider text-amber-400/90 bg-black/60 px-2 py-0.5 rounded border border-amber-500/30">
                {preset.badge}
              </span>
              <div
                style={{
                  fontFamily: 'var(--font-jetbrains), monospace',
                  fontWeight: typoConfig.topFontWeight,
                  fontSize: '20px',
                  color: topVisuals.fillColor,
                  WebkitTextStroke: topVisuals.strokeCss,
                  paintOrder: 'stroke fill',
                  textShadow: topVisuals.textShadowCss,
                }}
                className="leading-none select-none"
              >
                {typoConfig.uppercase ? preset.topText.toUpperCase() : preset.topText}
              </div>
              <div
                style={{
                  fontFamily: 'var(--font-jetbrains), monospace',
                  fontWeight: typoConfig.mainFontWeight,
                  fontSize: '44px',
                  color: glowConfig.textColor,
                }}
                className="leading-none select-none"
              >
                3 - 2 - 1
              </div>
              <span className="absolute bottom-2.5 text-[10px] font-mono text-neutral-400 group-hover:text-white transition-colors flex items-center gap-1">
                <Eye className="h-3 w-3 text-amber-400" />
                <span>Click to run {preset.title} sequence -&gt;</span>
              </span>
            </div>
          );
        })}
      </div>

      <CodeBlock
        title="Zero Coupling TakeoverOverlay (bottom-center upward offset + Seamless Rounded-Rect TakeoverVignetteOverlay + Team-Colored Top Label) Recipe"
        language="tsx"
        isLight={isLight}
        code={`import { HudAnchorStage, HudZone, HudSlot } from '@/ui-core/layout/HudAnchorStage';
import {
  TakeoverCountdownHUD,
  TakeoverVignetteOverlay,
} from '@/ui-core/hud/TakeoverCountdownHUD';

export function MatchTakeoverOverlay({
  isReplacingIn,
  countdownDigit, // '3' | '2' | '1' | null
  teamSide = '${myTeamSide}', // 'blue' | 'orange'
}: {
  isReplacingIn: boolean;
  countdownDigit: '3' | '2' | '1' | null;
  teamSide?: 'blue' | 'orange';
}) {
  return (
    <div className="relative w-full h-full overflow-hidden">
      {/* 1. Seamless Rounded-Rectangle 4-Edge Vignette Mask underneath the HUD layer (z-10 < HudAnchorStage z-20) */}
      <TakeoverVignetteOverlay
        active={isReplacingIn}
        config={{
          enabled: ${vignetteConfig.enabled},
          renderMode: '${vignetteConfig.renderMode ?? 'sdf-smooth'}',
          depthYPct: ${vignetteConfig.depthYPct ?? 15},
          depthTopPct: ${vignetteConfig.depthTopPct ?? 0},
          depthBottomPct: ${vignetteConfig.depthBottomPct ?? 35},
          verticalOffsetPx: ${vignetteConfig.verticalOffsetPx ?? 0},
          depthXPct: ${vignetteConfig.depthXPct ?? 0},
          blurPx: ${vignetteConfig.blurPx ?? 160},
          innerColor: '${vignetteConfig.innerColor ?? '#000000'}',
          innerIntensityPct: ${vignetteConfig.innerIntensityPct ?? 0},
          color: '${vignetteConfig.color}',
          intensityPct: ${vignetteConfig.intensityPct},
          distancePct: ${vignetteConfig.distancePct},
          outerReachPct: ${vignetteConfig.outerReachPct},
          cornerRadiusPx: ${vignetteConfig.cornerRadiusPx ?? 0},
          curve: {
            p1x: ${vignetteConfig.curve.p1x},
            p1y: ${vignetteConfig.curve.p1y},
            p2x: ${vignetteConfig.curve.p2x},
            p2y: ${vignetteConfig.curve.p2y},
          },
          fadeInMs: ${vignetteConfig.fadeInMs},
          fadeOutMs: ${vignetteConfig.fadeOutMs},
        }}
      />

      {/* 2. Main HUD Layer (z-20): Scoreboard & Team Roster stay visible; Cockpit HUD deploys after 3-2-1 */}
      <HudAnchorStage strategy="reserve">
        {/* Bottom-Center Upward Offset (relative to bottom-center, NOT global center) */}
        <HudZone
          anchor="bottom-center"
          flush
          zIndexClassName="z-40"
          style={{ bottom: '${bottomOffsetPx}px' }}
        >
          <HudSlot visible={isReplacingIn && Boolean(countdownDigit)} mode="reserve">
            <TakeoverCountdownHUD
              teamSide={teamSide}
              payload={
                isReplacingIn && countdownDigit
                  ? {
                      topText: '${topLabelText}', // JetBrains Mono Regular (400) - Team Color + Glowing Stroke
                      mainText: countdownDigit, // JetBrains Mono Thin (100) - Scales 3 -> 2 -> 1
                      teamSide,
                    }
                  : null
              }
              glowConfig={{
                textColor: '${glowConfig.textColor}',
                glowColor: '${glowConfig.glowColor}',
                innerBlurPx: ${glowConfig.innerBlurPx},
                outerBlurPx: ${glowConfig.outerBlurPx},
                ambientBlurPx: ${glowConfig.ambientBlurPx},
                intensityPct: ${glowConfig.intensityPct},
              }}
              typographyConfig={{
                mainFontSizePx: ${typoConfig.mainFontSizePx},
                mainFontWeight: ${typoConfig.mainFontWeight},
                topFontSizePx: ${typoConfig.topFontSizePx},
                topFontWeight: ${typoConfig.topFontWeight},
                lineGapPx: ${typoConfig.lineGapPx},
                uppercase: ${typoConfig.uppercase}, // Default false ('Takeover in...')
              }}
              timingConfig={{
                durationMs: ${timingConfig.durationMs},
                entryScale: ${timingConfig.entryScale},
                entryDurationMs: ${timingConfig.entryDurationMs},
                exitDurationMs: ${timingConfig.exitDurationMs},
              }}
            />
          </HudSlot>
        </HudZone>
      </HudAnchorStage>
    </div>
  );
}`}
      />
    </section>
  );
};
