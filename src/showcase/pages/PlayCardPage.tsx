import React, { useState } from 'react';
import {
  Sparkles,
  Layers,
  RotateCcw,
  Copy,
  Check,
  Code2,
  ArrowUpRight,
  CheckCircle2,
} from 'lucide-react';
import { PlayModeCard } from '../../ui-core/layout/PlayModeCard';
import { PLAY_MODES } from '../../ui-core/recipes/Layer2PlayRecipe';
import { Badge } from '../../ui-core/primitives/Badge';
import { Button } from '../../ui-core/primitives/Button';
import { CodeBlock } from '../CodeBlock';
import { PageJumpDirectory, type JumpDirectoryItem } from '../PageJumpDirectory';
import {
  usePlayCardStyleStore,
  PLAY_CARD_STYLE_PRESETS,
  type PlayCardStyleVariant,
} from '../../ui-core/stores/playCardStyleStore';
import { PlayCardGeometryAndIconColorSection } from './play-card/PlayCardGeometryAndIconColorSection';
import { PlayCardMatrixShootoutSection } from './play-card/PlayCardMatrixShootoutSection';

export interface PlayCardPageProps {
  isLight?: boolean;
  onNavigateToSandboxPlay?: () => void;
}

const PLAY_CARD_JUMP_ITEMS: JumpDirectoryItem[] = [
  {
    code: '2B.1',
    componentName: 'PlayModeCard',
    label: 'Single-card three-style side-by-side inspection (Style 1 vs Style 2 vs Style 3)',
    targetId: 'play-card-2b-1-single',
    tag: 'L2 · Single Card',
  },
  {
    code: '2B.2',
    componentName: 'PlayCardWatermarkAndColorTuner',
    label: 'Full-parameter tuning workbench (8 Official weights + 30% Watermark Icon + 6 Card tints)',
    targetId: 'play-card-2b-2-tuner',
    tag: 'L0–L2 · Parameters',
  },
  {
    code: '2B.3',
    componentName: 'Layer2PlayRecipe',
    label: 'L2 Play menu 2×3 full panel real-time preview (synced with 7A Sandbox)',
    targetId: 'play-card-2b-3-panel',
    tag: 'L6/L7 · Live Panel',
  },
  {
    code: '2B.4',
    componentName: 'PlayCardMatrixShootoutSection',
    label: 'Three styles 2×3 menu panel side-by-side matrix (Full Panel 3-Way Shootout)',
    targetId: 'play-card-2b-4-matrix',
    tag: 'Shootout Matrix',
  },
];

const VARIANT_META: {
  id: PlayCardStyleVariant;
  code: string;
  title: string;
  formula: string;
  desc: string;
}[] = [
  {
    id: 'icon-badge-top',
    code: 'Style 1',
    title: 'style 1 · Classic Four-part Layout (left Icon + Right Badge → Title → Desc)',
    formula: 'Row 1: [Icon | Badge] → Row 2: Title → Row 3: Description',
    desc: 'Four-part Structure: First row left framed placement/Borderless Icon, Place capsule on right Badge; Below Is Title, Multiline at bottom Description.',
  },
  {
    id: 'icon-title-inline',
    code: 'Style 2',
    title: 'style 2 · Compact inline none Badge Style (left Icon + Right Title → Desc)',
    formula: 'Row 1: [Icon + Title] (No Badge) → Row 2: Description',
    desc: 'Removed top-right corner Badge Visual noise: Left side of first row Icon, Immediately to the right (Or justified) Title, Display directly below Description, Vertically more compact and clean.',
  },
  {
    id: 'mono-giant-watermark',
    code: 'Style 3',
    title: 'Style 3 (Current default) · JetBrains Mono Large heading + 30% extra large background Icon',
    formula: 'FG: JetBrains Mono Giant Title + BG: 30% Opacity Oversized Icon',
    desc: 'Industrial telemetry aesthetic: Use large font for foreground JetBrains Mono Heading text (support Thin ~ Extra Bold All 8 Official font weight), Default background overlay 30% Large-scale opacity vector Icon watermark.',
  },
];

export const PlayCardPage: React.FC<PlayCardPageProps> = ({
  isLight = true,
  onNavigateToSandboxPlay,
}) => {
  const store = usePlayCardStyleStore();
  const { variant, setVariant, applyPreset, resetParams, exportConfigCode } = store;

  const [specimenId, setSpecimenId] = useState<string>('exhibition');
  const [copiedCode, setCopiedCode] = useState(false);
  const [showCodeBlock, setShowCodeBlock] = useState(false);

  const specimenMode = PLAY_MODES.find((m) => m.id === specimenId) || PLAY_MODES[0];

  const handleCopyCode = async () => {
    const code = exportConfigCode();
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(code);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    }
  };

  return (
    <div className="flex flex-col gap-10 max-w-5xl">
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex flex-col gap-1.5">
            <div className="inline-flex items-center gap-2 text-xs font-mono text-amber-500 font-semibold uppercase tracking-wider">
              <Sparkles className="h-3.5 w-3.5" />
              <span>L2 Layout &amp; Shells · Decoupled PlayModeCard Preview &amp; Tuner</span>
            </div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-2xl font-bold tracking-tight">
                2B · PlayCard Mode card three-style preview and parameter tuning workbench
              </h1>
              <Badge variant="primary" size="sm" isLight={isLight}>
                L2 Native decoupling · real-time sync 7A Play menu
              </Badge>
            </div>
            <p className={`text-xs leading-relaxed max-w-3xl ${isLight ? 'text-neutral-600' : 'text-neutral-400'}`}>
              Designed for <strong>L2 Play menu (`Layer2PlayRecipe`)</strong> Decoupled zero-coupling independent card component{' '}
              <code className="font-mono">PlayModeCard</code> (Located at pyramid{' '}
              <strong>L2. Layout &amp; Shells Hierarchy</strong>). Supports one-click switching between three visual structures, JetBrains Mono Official 8 Font weight selection, Each card Icon Independent color adjustment (Host Match Default gray), All parameters synced to{' '}
              <strong>7A · Menu Layer full-link sandbox</strong> of <code className="font-mono">Play</code> In menu.
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap shrink-0">
            {onNavigateToSandboxPlay && (
              <Button size="sm" variant="primary" isLight={isLight} icon={<ArrowUpRight className="h-3.5 w-3.5" />} onClick={onNavigateToSandboxPlay}>
                Preview in 7A Menu Sandbox
              </Button>
            )}
            <Button size="sm" variant="secondary" isLight={isLight} icon={<Code2 className="h-3.5 w-3.5" />} onClick={() => setShowCodeBlock((prev) => !prev)}>
              {showCodeBlock ? 'Hide Config Code' : 'View Config Code'}
            </Button>
            <Button size="sm" variant="secondary" isLight={isLight} icon={copiedCode ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />} onClick={handleCopyCode}>
              {copiedCode ? 'Parameters Copied!' : 'Copy Parameter Config'}
            </Button>
            <Button size="sm" variant="ghost" isLight={isLight} icon={<RotateCcw className="h-3.5 w-3.5" />} onClick={resetParams}>
              Reset to Default
            </Button>
          </div>
        </div>

        {showCodeBlock && (
          <CodeBlock
            isLight={isLight}
            title="Current PlayModeCard full parameter configuration (embeddable into src/ui-core/stores/playCardStyleStore.ts)"
            code={exportConfigCode()}
          />
        )}

        <PageJumpDirectory
          title="2B · Play Menu card three-style page quick-jump directory (PlayModeCard Jump Index)"
          subtitle="Click items to quickly locate the three-style card comparison, Parameter tuning workbench, 2×3 Real-time panel or three-style full-size comparison matrix"
          items={PLAY_CARD_JUMP_ITEMS}
          isLight={isLight}
        />
      </div>

      <section
        id="play-card-2b-1-single"
        className={`scroll-mt-6 p-6 rounded-2xl border flex flex-col gap-5 ${
          isLight ? 'bg-white border-neutral-200/90 shadow-2xs' : 'bg-neutral-900/60 border-neutral-800'
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded-md text-xs font-mono font-extrabold bg-amber-500/15 text-amber-500 border border-amber-500/30">
              2B.1
            </span>
            <h2 className="text-base font-bold">
              Side-by-side comparison of three card styles with one-click activation (Single Card 3-Style Inspector)
            </h2>
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs font-mono text-neutral-400 mr-1">Inspect sample card:</span>
            {PLAY_MODES.map((m) => {
              const active = m.id === specimenId;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setSpecimenId(m.id)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-all cursor-pointer ${
                    active
                      ? 'bg-amber-500 text-white border-amber-500 font-bold shadow-2xs'
                      : isLight
                      ? 'bg-neutral-50 hover:bg-neutral-100 border-neutral-200 text-neutral-700'
                      : 'bg-neutral-800 hover:bg-neutral-700 border-neutral-700 text-neutral-300'
                  }`}
                >
                  {m.title}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-stretch">
          {VARIANT_META.map((v) => {
            const isSelected = variant === v.id;
            const cardBorderCls = isSelected
              ? isLight
                ? 'bg-amber-50/40 border-amber-500 ring-2 ring-amber-500/25'
                : 'bg-amber-500/10 border-amber-500 ring-2 ring-amber-500/30'
              : isLight
              ? 'bg-neutral-50/60 border-neutral-200/80'
              : 'bg-neutral-950/60 border-neutral-800';
            const selectBtnCls = isSelected
              ? 'bg-amber-500 text-white shadow-2xs'
              : isLight
              ? 'bg-white hover:bg-neutral-100 text-neutral-700 border border-neutral-300'
              : 'bg-neutral-800 hover:bg-neutral-700 text-neutral-200 border border-neutral-700';
            return (
              <div
                key={v.id}
                className={`p-4 rounded-xl border flex flex-col justify-between gap-4 transition-all ${cardBorderCls}`}
              >
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-amber-500/15 text-amber-500 border border-amber-500/30">
                      {v.code}
                    </span>
                    <button
                      type="button"
                      onClick={() => setVariant(v.id)}
                      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${selectBtnCls}`}
                    >
                      {isSelected ? (
                        <>
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          <span>Active style</span>
                        </>
                      ) : (
                        <span>Set as current style</span>
                      )}
                    </button>
                  </div>

                  <h3 className="font-bold text-xs mt-1">{v.title}</h3>
                  <code
                    className={`text-[10px] font-mono px-2 py-1 rounded border ${
                      isLight ? 'bg-white border-neutral-200 text-neutral-600' : 'bg-neutral-900 border-neutral-800 text-neutral-400'
                    }`}
                  >
                    {v.formula}
                  </code>
                  <p className={`text-[11px] leading-relaxed ${isLight ? 'text-neutral-600' : 'text-neutral-400'}`}>
                    {v.desc}
                  </p>
                </div>

                <div
                  className={`p-4 rounded-xl border flex items-center justify-center ${
                    isLight ? 'bg-neutral-100/80 border-neutral-200/80' : 'bg-neutral-900/90 border-neutral-800'
                  }`}
                >
                  <div className="w-full max-w-[240px]">
                    <PlayModeCard
                      id={specimenMode.id}
                      title={specimenMode.title}
                      subtitle={specimenMode.subtitle}
                      badge={specimenMode.badge}
                      badgeVariant={specimenMode.category === 'Match' ? 'primary' : 'warning'}
                      icon={specimenMode.icon}
                      isLight={isLight}
                      variant={v.id}
                      styleParams={store}
                      onClick={() => setVariant(v.id)}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div
          className={`p-3.5 rounded-xl border flex flex-col gap-2.5 ${
            isLight ? 'bg-neutral-50/80 border-neutral-200/80' : 'bg-neutral-950/60 border-neutral-800'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold flex items-center gap-1.5">
              <Layers className="h-3.5 w-3.5 text-amber-500" />
              <span>6 One-click load for selected preset group (Curated Style Presets)</span>
            </span>
            <span className="text-[11px] font-mono text-neutral-400">
              Click any preset to view below 2B.2 Continue fine-tuning any slider
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
            {PLAY_CARD_STYLE_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => applyPreset(preset.params)}
                className={`p-2.5 rounded-lg border text-left flex flex-col gap-0.5 transition-all cursor-pointer ${
                  isLight ? 'bg-white border-neutral-200 hover:border-amber-400' : 'bg-neutral-900 border-neutral-800 hover:border-amber-500/60'
                }`}
              >
                <span className="text-xs font-bold text-amber-500">{preset.label}</span>
                <span className={`text-[11px] leading-snug ${isLight ? 'text-neutral-600' : 'text-neutral-400'}`}>
                  {preset.subtitle}
                </span>
              </button>
            ))}
          </div>
        </div>
      </section>

      <PlayCardGeometryAndIconColorSection isLight={isLight} />

      <PlayCardMatrixShootoutSection
        isLight={isLight}
        variant={variant}
        setVariant={setVariant}
        variantMeta={VARIANT_META}
        onNavigateToSandboxPlay={onNavigateToSandboxPlay}
      />
    </div>
  );
};
