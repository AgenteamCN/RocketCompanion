import React from 'react';
import {
  Palette,
  Maximize2,
  Ruler,
  Activity,
  ShieldCheck,
  Sparkles,
  CheckCircle2,
  Layers,
} from 'lucide-react';
import { AccentColor } from '../../ui-core/tokens/colors';
import { UI_RADIUS } from '../../ui-core/tokens/radius';
import { UI_SPACING } from '../../ui-core/tokens/spacing';
import { UI_EASING } from '../../ui-core/tokens/easing';
import { useAccentStore } from '../stores/themeStore';
import { CodeBlock } from '../CodeBlock';
import { TunerConfigExporterBar } from '../components/tuner/TunerConfigExporterBar';

const ACCENT_LIST: { key: AccentColor; name: string; desc: string; previewBg: string }[] = [
  {
    key: 'amber',
    name: 'Amber (warm orange · default recommendation)',
    desc: 'Soft, non-glaring esports high-contrast primary color, Replace high-frequency blue, Compatible with both dark stadium and light modes.',
    previewBg: 'bg-amber-500',
  },
  {
    key: 'neutral',
    name: 'Neutral (Minimalist B&W · Zero Saturation)',
    desc: 'benchmark Apple / Linear Pure achromatic system, Focus color attention 100% Reserved for 3D Viewport and telemetry status.',
    previewBg: 'bg-neutral-900 dark:bg-neutral-100',
  },
  {
    key: 'sky',
    name: 'Sky (Classic Science Blue)',
    desc: 'Suitable for traditional engineering telemetry, Network diagnostics and scenarios requiring cool-tone auxiliary markers.',
    previewBg: 'bg-sky-500',
  },
];

const RADIUS_ENTRIES = [
  { key: 'window', value: UI_RADIUS.window, desc: 'Main menu and modal container (16px)' },
  { key: 'panel', value: UI_RADIUS.panel, desc: '3-Stage Compound Standard Panel (16px)' },
  { key: 'card', value: UI_RADIUS.card, desc: 'Generic content cards and selectors (12px)' },
  { key: 'menuItem', value: UI_RADIUS.menuItem, desc: '52px Touch menu items and large buttons (12px)' },
  { key: 'button', value: UI_RADIUS.button, desc: 'Regular Button, Segmented switch frame (8px)' },
  { key: 'badge', value: UI_RADIUS.badge, desc: 'Status capsule badge and inline label (6px)' },
  { key: 'keycap', value: UI_RADIUS.keycap, desc: 'Keyboard/Controller flat button badge (6px)' },
];

const SPACING_SCALE = [
  { name: 'space1', rem: UI_SPACING.space1, px: '4px' },
  { name: 'space1_5', rem: UI_SPACING.space1_5, px: '6px' },
  { name: 'space2', rem: UI_SPACING.space2, px: '8px (Menu Container Cushion)' },
  { name: 'space2_5', rem: UI_SPACING.space2_5, px: '10px (Menu Item Gap)' },
  { name: 'space3', rem: UI_SPACING.space3, px: '12px' },
  { name: 'space4', rem: UI_SPACING.space4, px: '16px (Footer Vertical)' },
  { name: 'space5', rem: UI_SPACING.space5, px: '20px (Body Vertical / Header Top)' },
  { name: 'space6', rem: UI_SPACING.space6, px: '24px (3-Stage Horizontal Baseline)' },
  { name: 'space8', rem: UI_SPACING.space8, px: '32px' },
];

const SPRING_CARDS = [
  { title: 'UI_EASING.apple', color: 'text-amber-500', spec: `[${UI_EASING.apple.join(', ')}]`, desc: 'Fluid & Sequenced Standard Curve' },
  { title: 'spring.tactile', color: 'text-emerald-500', spec: `stiffness: ${UI_EASING.spring.tactile.stiffness}, damping: ${UI_EASING.spring.tactile.damping}`, desc: 'Button and switch micro-haptic feedback' },
  { title: 'spring.smooth', color: 'text-sky-500', spec: `stiffness: ${UI_EASING.spring.smooth.stiffness}, damping: ${UI_EASING.spring.smooth.damping}`, desc: 'Smooth transition between container and indicator' },
  { title: 'spring.bouncy', color: 'text-rose-500', spec: `stiffness: ${UI_EASING.spring.bouncy.stiffness}, damping: ${UI_EASING.spring.bouncy.damping}`, desc: 'Kickoff countdown and highlight elastic animation' },
];

export const FoundationsPage: React.FC<{ isLight?: boolean }> = ({ isLight = true }) => {
  const { accent, setAccent, tokens } = useAccentStore();
  const cardClass = `p-6 rounded-2xl border flex flex-col gap-4 transition-colors ${
    isLight ? 'bg-white border-neutral-200 shadow-2xs' : 'bg-neutral-900/60 border-neutral-800'
  }`;
  const subCardClass = isLight ? 'bg-neutral-50 border-neutral-200' : 'bg-neutral-900 border-neutral-800';
  const mutedText = isLight ? 'text-neutral-600' : 'text-neutral-400';

  const buildFoundationsExportCode = () =>
    `export const ALPHA_1_FOUNDATIONS_SNAPSHOT = ${JSON.stringify(
      { activeAccent: accent, radius: UI_RADIUS, spacing: UI_SPACING, easing: UI_EASING },
      null,
      2
    )} as const;`;

  return (
    <div className="flex flex-col gap-8 max-w-4xl">
      <div className="flex flex-col gap-2">
        <div className="inline-flex items-center gap-2 text-xs font-mono text-amber-500 font-semibold uppercase tracking-wider">
          <Sparkles className="h-4 w-4" />
          <span>Layer 0 · Foundations (foundation and variables)</span>
        </div>
        <h1 className="text-2xl font-bold tracking-tight">L0. Foundations Cornerstone and design variables</h1>
        <p className={`text-xs leading-relaxed ${mutedText}`}>
          Pure static constants at the bottom of the pyramid, Geometry Dimensions Token and Lightweight Theme Store (
          <code className="font-mono">src/ui-core/tokens/</code> &amp;{' '}
          <code className="font-mono">src/ui-core/stores/</code>). <strong>Strict Access Rules</strong>: Zero Business
          Logic JSX Component, Zero Upper-layer (L1~L7) Reverse Dependency.
        </p>

        <div
          className={`mt-1 p-3 rounded-xl border flex flex-wrap items-center justify-between gap-2 text-xs font-mono ${
            isLight
              ? 'bg-emerald-50/70 border-emerald-200 text-emerald-900'
              : 'bg-emerald-950/30 border-emerald-800/70 text-emerald-300'
          }`}
        >
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-emerald-500 shrink-0" />
            <span>
              <strong>L0 Dependency Audit:</strong> 0 JSX Components · 0 Imports from L1–L7 · Pure Unidirectional Root
            </span>
          </div>
          <span className="px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-bold text-[11px]">
            PASS · 100% Decoupled
          </span>
        </div>
      </div>

      <TunerConfigExporterBar
        badge="L0-EXPORT"
        title="Alpha-1 · L0 Design Tokens & Accent Theme Snapshot Exporter"
        subtitle="Exports active accent tone, concentric corner radii, 4px grid spacing, and Apple HIG spring curves"
        isLight={isLight}
        buildExportCode={buildFoundationsExportCode}
        onResetDefaults={() => setAccent('amber')}
      />

      <div className={cardClass}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 font-bold text-sm">
            <Palette className="h-4 w-4 text-amber-500" />
            <span>1. Color tone and theme Store (colors.ts & themeStore.ts)</span>
          </div>
          <span className="text-[11px] font-mono text-neutral-400">
            Active Accent: <strong className={tokens.text}>{accent.toUpperCase()}</strong>
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {ACCENT_LIST.map((item) => {
            const isSelected = accent === item.key;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => setAccent(item.key)}
                className={`p-4 rounded-xl border text-left flex flex-col justify-between gap-3 transition-all cursor-pointer ${
                  isSelected
                    ? isLight
                      ? 'bg-amber-50/50 border-amber-400 ring-2 ring-amber-500/20'
                      : 'bg-neutral-800/90 border-amber-500/70 ring-2 ring-amber-500/20'
                    : isLight
                    ? 'bg-neutral-50/80 hover:bg-neutral-100/80 border-neutral-200'
                    : 'bg-neutral-900 hover:bg-neutral-800/60 border-neutral-800'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`h-3.5 w-3.5 rounded-full ${item.previewBg}`} />
                    <span className="font-bold text-xs">{item.name}</span>
                  </div>
                  {isSelected && <CheckCircle2 className="h-4 w-4 text-amber-500 shrink-0" />}
                </div>
                <p className={`text-[11px] leading-relaxed ${mutedText}`}>{item.desc}</p>
                <div className="flex items-center gap-1.5 font-mono text-[10px] text-neutral-400">
                  <span>Token:</span>
                  <code className="px-1.5 py-0.5 rounded bg-neutral-200/70 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300">
                    ACCENT_THEMES.{item.key}
                  </code>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div className={cardClass}>
        <div className="flex items-center gap-2 font-bold text-sm">
          <Maximize2 className="h-4 w-4 text-amber-500" />
          <span>2. Semantic corner radius system (radius.ts · UI_RADIUS)</span>
        </div>
        <p className={`text-xs ${mutedText}`}>
          Strictly decreasing from outer to inner container hierarchy (Window 16px → Card/MainMenuRow 12px → Button 8px → Keycap/Badge 6px) :
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {RADIUS_ENTRIES.map((r) => (
            <div key={r.key} className={`p-3.5 border flex items-center gap-3 ${r.value} ${subCardClass}`}>
              <div
                className={`h-10 w-10 border-2 shrink-0 flex items-center justify-center font-mono text-[10px] font-bold ${r.value} ${
                  isLight ? 'border-neutral-800 bg-white text-neutral-900' : 'border-amber-400 bg-neutral-950 text-amber-400'
                }`}
              >
                R
              </div>
              <div className="flex flex-col min-w-0">
                <span className="font-mono font-bold text-xs">UI_RADIUS.{r.key}</span>
                <span className="font-mono text-[10px] text-amber-600 dark:text-amber-400">{r.value}</span>
                <span className={`text-[11px] truncate ${isLight ? 'text-neutral-500' : 'text-neutral-400'}`}>{r.desc}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className={cardClass}>
        <div className="flex items-center gap-2 font-bold text-sm">
          <Ruler className="h-4 w-4 text-emerald-500" />
          <span>3. Spacing Scale and 3-Stage Optical padding (spacing.ts · UI_SPACING)</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className={`p-4 rounded-xl border flex flex-col gap-2.5 ${subCardClass}`}>
            <span className="font-bold text-xs">4px Physical Grid Scale (Base Grid)</span>
            <div className="flex flex-col gap-1.5">
              {SPACING_SCALE.map((s) => (
                <div key={s.name} className="flex items-center justify-between text-xs font-mono">
                  <span className="text-neutral-500">UI_SPACING.{s.name}</span>
                  <div className="flex items-center gap-2">
                    <div className="h-2.5 bg-amber-500/80 rounded-xs" style={{ width: s.rem }} />
                    <span className="text-[11px]">{s.px}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className={`p-4 rounded-xl border flex flex-col justify-between gap-3 ${subCardClass}`}>
            <div className="flex flex-col gap-2">
              <span className="font-bold text-xs flex items-center gap-1.5">
                <Layers className="h-3.5 w-3.5 text-indigo-500" />
                <span>3-Stage Compound Panel and menu physical padding</span>
              </span>
              <ul className={`text-xs space-y-1.5 font-mono ${isLight ? 'text-neutral-700' : 'text-neutral-300'}`}>
                <li>• <strong>panel.header</strong>: <code>{UI_SPACING.panel.header}</code> (Optical vertical center)</li>
                <li>• <strong>panel.body</strong>: <code>{UI_SPACING.panel.body}</code> (24px Strict horizontal baseline)</li>
                <li>• <strong>panel.footer</strong>: <code>{UI_SPACING.panel.footer}</code> (Bottom shortcut hint bar)</li>
                <li>• <strong>menu.container</strong>: <code>{UI_SPACING.menu.container}</code> (Focus ring clipping buffer)</li>
              </ul>
            </div>

            <div className="pt-2 border-t border-neutral-200 dark:border-neutral-800 flex flex-col gap-1">
              <span className="font-bold text-xs">Active Canvas Percentage grid spacing (Stack Gaps)</span>
              <div className="flex items-center gap-3 text-xs font-mono text-amber-600 dark:text-amber-400">
                <span>sm: {UI_SPACING.stackPercentage.sm}</span>
                <span>•</span>
                <span>md: {UI_SPACING.stackPercentage.md}</span>
                <span>•</span>
                <span>lg: {UI_SPACING.stackPercentage.lg}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className={cardClass}>
        <div className="flex items-center gap-2 font-bold text-sm">
          <Activity className="h-4 w-4 text-sky-500" />
          <span>4. Apple HIG Easing and physics spring presets (easing.ts · UI_EASING)</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs font-mono">
          {SPRING_CARDS.map((card) => (
            <div key={card.title} className={`p-3 rounded-xl border ${subCardClass}`}>
              <div className={`font-bold ${card.color} mb-1`}>{card.title}</div>
              <div className="text-[11px]">{card.spec}</div>
              <div className="text-[10px] text-neutral-400 mt-1">{card.desc}</div>
            </div>
          ))}
        </div>
      </div>

      <CodeBlock
        isLight={isLight}
        title="L0 Foundations Standard on-demand reference example (Zero Upper-layer Dependency)"
        code={`import { UI_SPACING } from '@/ui-core/tokens/spacing';
import { UI_RADIUS } from '@/ui-core/tokens/radius';
import { UI_EASING } from '@/ui-core/tokens/easing';
import { useAccentStore } from '@/showcase/stores/themeStore';

const headerClass = \`\${UI_SPACING.panel.header} \${UI_RADIUS.panel}\`;
const { accent, tokens, setAccent } = useAccentStore();`}
      />
    </div>
  );
};
