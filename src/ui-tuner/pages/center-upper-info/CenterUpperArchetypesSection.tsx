import React from 'react';
import {
  CenterUpperInfoPayload,
  CenterUpperInfoVariant,
  WinnerTeamPreset,
} from '../../../ui-core/hud/CenterUpperInfoHUD';
import { Badge } from '../../../ui-core/primitives/Badge';
import { CodeBlock } from '../../CodeBlock';
import {
  CUSTOM_ANNOUNCEMENT_PRESETS,
  type CustomAnnouncementPreset,
} from './CenterUpperStageBackdropBar';
import { useCenterUpperSyncedState } from './useCenterUpperSyncedState';

export interface CenterUpperArchetypesSectionProps {
  isLight: boolean;
  activePayload: CenterUpperInfoPayload | null;
  handleSelectVariant: (variant: CenterUpperInfoVariant) => void;
  startCountdownSequence: (stepIntervalOverride?: number) => void;
  handleSelectWinnerTeam: (team: WinnerTeamPreset) => void;
  handleApplyCustomPreset: (preset: CustomAnnouncementPreset) => void;
}

export const CenterUpperArchetypesSection: React.FC<
  CenterUpperArchetypesSectionProps
> = ({
  isLight,
  activePayload,
  handleSelectVariant,
  startCountdownSequence,
  handleSelectWinnerTeam,
  handleApplyCustomPreset,
}) => {
  const {
    stageBgColor,
    winnerTeam,
    winnerBlueConfig,
    activeVariant,
    upperCenterTopPct,
    glowConfig,
    typoConfig,
    timingConfig,
  } = useCenterUpperSyncedState();
  const blueGlowHex = winnerBlueConfig.syncGlowWithText
    ? winnerBlueConfig.textColor
    : winnerBlueConfig.glowColor;

  return (
    <section id="center-upper-archetypes" className={`p-5 rounded-3xl border flex flex-col gap-5 scroll-mt-24 ${
      isLight ? 'bg-white border-neutral-200 text-neutral-900 shadow-xs'
      : 'bg-neutral-900/80 border-neutral-800 text-neutral-100 shadow-lg' }`}>
      <div className="flex items-center justify-between border-b pb-2.5 border-neutral-200 dark:border-neutral-800 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Badge variant="amber" size="sm" isLight={isLight}>
            5E-3
          </Badge>
          <h2 className="text-sm font-bold font-mono">Visual specification for three types of upper-center high-priority alerts (Countdown / Winner / Custom Announcement)</h2>
        </div>
        <span className="text-xs font-mono opacity-65">Click any card to switch text and trigger animations</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Card 1: 3-2-1-GO Countdown */}
        <div
          onClick={() => {
            handleSelectVariant('countdown');
            startCountdownSequence();
          }}
          className="group relative h-44 rounded-2xl border border-neutral-800 overflow-hidden flex flex-col items-center justify-center cursor-pointer transition-transform hover:scale-[1.01]"
          style={{ backgroundColor: stageBgColor }}
        >
          <span className="absolute top-2.5 left-3 text-[10px] font-mono uppercase tracking-wider text-amber-400/90 bg-black/60 px-2 py-0.5 rounded border border-amber-500/30">
            1. Countdown · 3-2-1-GO · 1.50x Pop
          </span>
          <div style={{ fontFamily: 'var(--font-jetbrains), monospace', fontWeight: 100, fontSize: '68px',
            letterSpacing: '0em', color: '#FFE600', WebkitTextStroke: '1.2px #F59E0B', }}
            className="leading-none select-none">
            3 · 2 · 1 · GO
          </div>
          <span className="absolute bottom-2.5 text-[10px] font-mono text-neutral-400 group-hover:text-white transition-colors">
            Click to play on main stage 3 -&gt; 2 -&gt; 1 -&gt; GO Sequence -&gt;
          </span>
        </div>

        {/* Card 2: Winner (Regular 400 + Thin 100) */}
        <div
          onClick={() => handleSelectWinnerTeam(winnerTeam === 'blue' ? 'orange' : 'blue')}
          className="group relative h-44 rounded-2xl border border-neutral-800 overflow-hidden flex flex-col items-center justify-center gap-1.5 cursor-pointer transition-transform hover:scale-[1.01]"
          style={{ backgroundColor: stageBgColor }}
        >
          <span className="absolute top-2.5 left-3 text-[10px] font-mono uppercase tracking-wider text-sky-400/90 bg-black/60 px-2 py-0.5 rounded border border-sky-500/30">
            2. Winner · Top Unchanged + Blue Team Color
          </span>
          <div style={{ fontFamily: 'var(--font-jetbrains), monospace', fontWeight: 400, fontSize: '20px',
            letterSpacing: '0em', color: '#FFFFFF', textShadow: '0 0 18px rgba(245, 158, 11, 0.7)' }}
            className="leading-none select-none">
            WINNER
          </div>
          <div className="flex items-center gap-2 leading-none select-none"
            style={{ fontFamily: 'var(--font-jetbrains), monospace', fontWeight: 100, fontSize: '36px', letterSpacing: '0em' }}>
            <span style={{ color: winnerBlueConfig.textColor, textShadow: `0 0 22px ${blueGlowHex}` }}>
              BLUE
            </span>
            <span className="text-neutral-500 text-2xl">/</span>
            <span style={{ color: '#FFE600', textShadow: '0 0 22px rgba(245, 158, 11, 0.7)' }}>
              ORANGE
            </span>
          </div>
          <span className="absolute bottom-2.5 text-[10px] font-mono text-neutral-400 group-hover:text-white transition-colors">
            Click to Toggle Blue Team ({winnerBlueConfig.textColor}) / Orange Team -&gt;
          </span>
        </div>

        {/* Card 3: Custom Announcement (ADMIN CONTROL / MATCH PAUSED) */}
        <div
          onClick={() =>
            handleApplyCustomPreset(
              CUSTOM_ANNOUNCEMENT_PRESETS.find((p) => p.id === 'match-paused') ??
                CUSTOM_ANNOUNCEMENT_PRESETS[0]
            )
          }
          className="group relative h-44 rounded-2xl border border-neutral-800 overflow-hidden flex flex-col items-center justify-center gap-1.5 cursor-pointer transition-transform hover:scale-[1.01]"
          style={{ backgroundColor: stageBgColor }}
        >
          <span className="absolute top-2.5 left-3 text-[10px] font-mono uppercase tracking-wider text-emerald-400/90 bg-black/60 px-2 py-0.5 rounded border border-emerald-500/30">
            3. Custom · Forced Uppercase Announcement
          </span>
          <div style={{ fontFamily: 'var(--font-jetbrains), monospace', fontWeight: 400, fontSize: '18px',
            letterSpacing: '0em', color: '#FFFFFF', textShadow: '0 0 18px rgba(245, 158, 11, 0.7)' }}
            className="leading-none select-none uppercase">
            ADMIN CONTROL
          </div>
          <div style={{ fontFamily: 'var(--font-jetbrains), monospace', fontWeight: 100, fontSize: '38px',
            letterSpacing: '0em', color: '#FFE600', textShadow: '0 0 22px rgba(245, 158, 11, 0.7)' }}
            className="leading-none select-none whitespace-nowrap uppercase">
            MATCH PAUSED
          </div>
          <span className="absolute bottom-2.5 text-[10px] font-mono text-neutral-400 group-hover:text-white transition-colors">
            Click to Load ADMIN CONTROL / MATCH PAUSED -&gt;
          </span>
        </div>
      </div>

      {/* Decoupled Integration Recipe */}
      <CodeBlock
        title="Zero Coupling HudAnchorStage (upper-center, top=40%) + CenterUpperInfoHUD Integrated Code Recipe"
        language="tsx"
        isLight={isLight}
        code={`import { HudAnchorStage, HudZone, HudSlot } from '@/ui-core/layout/HudAnchorStage';
import { CenterUpperInfoHUD } from '@/ui-core/hud/CenterUpperInfoHUD';

export function MatchUpperCenterOverlay() {
  return (
    <HudAnchorStage strategy="reserve">
      <HudZone anchor="upper-center" style={{ top: '${upperCenterTopPct}%' }}>
        <HudSlot visible={true} mode="reserve">
          <CenterUpperInfoHUD
            info={{
              variant: '${activeVariant}',
              winnerTeam: '${winnerTeam}',
              topText: '${activePayload?.topText ?? ''}', // JetBrains Mono Regular (400)
              mainText: '${activePayload?.mainText ?? '3'}', // JetBrains Mono Thin (100)
            }}
            glowConfig={{
              textColor: '${glowConfig.textColor}',
              glowColor: '${glowConfig.glowColor}',
              topLabelColor: '${glowConfig.topLabelColor ?? '#FFFFFF'}',
              topLabelGlowColor: '${glowConfig.topLabelGlowColor ?? '#F59E0B'}',
              innerBlurPx: ${glowConfig.innerBlurPx},
              outerBlurPx: ${glowConfig.outerBlurPx},
              ambientBlurPx: ${glowConfig.ambientBlurPx},
              intensityPct: ${glowConfig.intensityPct},
              backdropBloomPct: ${glowConfig.backdropBloomPct ?? 0},
              strokeWidthPx: ${glowConfig.strokeWidthPx ?? 0},
            }}
            winnerBlueConfig={{
              enabled: ${winnerBlueConfig.enabled},
              textColor: '${winnerBlueConfig.textColor}',
              glowColor: '${winnerBlueConfig.glowColor}',
              syncGlowWithText: ${winnerBlueConfig.syncGlowWithText},
              innerBlurPx: ${winnerBlueConfig.innerBlurPx},
              outerBlurPx: ${winnerBlueConfig.outerBlurPx},
              ambientBlurPx: ${winnerBlueConfig.ambientBlurPx},
              intensityPct: ${winnerBlueConfig.intensityPct},
              strokeWidthPx: ${winnerBlueConfig.strokeWidthPx},
              strokeColor: '${winnerBlueConfig.strokeColor}',
            }}
            typographyConfig={{
              mainFontSizePx: ${typoConfig.mainFontSizePx},
              mainFontWeight: ${typoConfig.mainFontWeight},
              mainLetterSpacingEm: ${typoConfig.mainLetterSpacingEm},
              topFontSizePx: ${typoConfig.topFontSizePx},
              topFontWeight: ${typoConfig.topFontWeight},
              topLetterSpacingEm: ${typoConfig.topLetterSpacingEm},
              lineGapPx: ${typoConfig.lineGapPx},
              uppercase: ${typoConfig.uppercase},
              italic: ${typoConfig.italic ?? false},
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
  );
}`}
      />
    </section>
  );
};
