import React, { useCallback, useState } from 'react';
import {
  Sliders,
  RotateCcw,
  Copy,
  Check,
  Code2,
  Link2,
  Unlink2,
  AlertTriangle,
  CheckCircle2,
} from 'lucide-react';
import { SliderControl } from '../../../ui-core/primitives/SliderControl';
import { ToggleSwitch } from '../../../ui-core/primitives/ToggleSwitch';
import { Badge } from '../../../ui-core/primitives/Badge';
import { Button } from '../../../ui-core/primitives/Button';
import { useMenuLayoutStore } from '../../../ui-core/stores/menuLayoutStore';
import {
  resolvePanelHeaderBackBtnGeometry,
  type MenuLayoutTokens,
} from '../../../ui-core/tokens/menuLayoutTokens';
import { useReviewLedgerStore } from '../../components/review/reviewLedgerStore';
import { FloatingWindowShellTunerSection } from './FloatingWindowShellTunerSection';
import { PanelHeaderBackButtonLab } from './PanelHeaderBackButtonLab';
import { PanelShellStageThreeFooterSection } from './PanelShellStageThreeFooterSection';

export interface PanelShellTunerProps {
  isLight?: boolean;
  title?: string;
  codeBadge?: string;
}

/**
 * 3-Stage Compound Panel & Floating Shell Tuner (Alpha-3 Universal Container Contract)
 * Customizes Menu (`variant="menu"`) and Floating Window (`variant="floating"`) 3-Stage Shell tokens
 * and propagates `template-stale` status to child surfaces in Workspace Bravo.
 */
export const PanelShellTuner: React.FC<PanelShellTunerProps> = React.memo(
  ({
    isLight = false,
    title = 'Layer 2+ Universal 3-Stage Menu & Floating Shell Tuner (Alpha-3 Mother Contract)',
    codeBadge = '6A.2S',
  }) => {
    const {
      lockPanelPaddingX,
      panelHeaderPaddingX,
      panelHeaderPaddingY,
      panelHeaderTitleFontSize,
      lockPanelHeaderBackBtnAspect,
      panelHeaderBackBtnWidth,
      panelHeaderBackBtnHeight,
      panelHeaderBackBtnShowArrow,
      panelHeaderBackBtnShowLabel,
      panelHeaderBackBtnRadiusMode,
      panelHeaderBackBtnRadius,
      panelHeaderBackBtnInnerRadius,
      panelHeaderBackBtnRadiusTL,
      panelHeaderBackBtnRadiusTR,
      panelHeaderBackBtnRadiusBR,
      panelHeaderBackBtnRadiusBL,
      panelOuterRadius,
      panelHeaderGap,
      panelBodyPaddingX,
      panelBodyPaddingY,
      panelFooterPaddingX,
      panelFooterPaddingY,
      panelFooterFontSize,
      setToken,
      resetPanelShellTokens,
      exportPanelShellConfigCode,
    } = useMenuLayoutStore();

    const simulateTemplateStale = useReviewLedgerStore((s) => s.simulateTemplateStale);
    const setSimulateTemplateStale = useReviewLedgerStore((s) => s.setSimulateTemplateStale);
    const batchApproveTemplateStale = useReviewLedgerStore((s) => s.batchApproveTemplateStale);

    const [copied, setCopied] = useState(false);
    const [showCode, setShowCode] = useState(false);

    const notifyTemplateDrift = useCallback(() => {
      if (!useReviewLedgerStore.getState().simulateTemplateStale) {
        useReviewLedgerStore.getState().setSimulateTemplateStale(true);
      }
    }, []);

    const setShellToken = <K extends keyof MenuLayoutTokens>(
      key: K,
      val: MenuLayoutTokens[K]
    ) => {
      setToken(key, val);
      notifyTemplateDrift();
    };

    const btnGeom = resolvePanelHeaderBackBtnGeometry({
      panelHeaderPaddingX,
      panelHeaderPaddingY,
      panelHeaderBackBtnWidth,
      panelHeaderBackBtnHeight,
      panelHeaderBackBtnRadiusMode,
      panelHeaderBackBtnRadius,
      panelHeaderBackBtnInnerRadius,
      panelHeaderBackBtnRadiusTL,
      panelHeaderBackBtnRadiusTR,
      panelHeaderBackBtnRadiusBR,
      panelHeaderBackBtnRadiusBL,
      panelOuterRadius,
    });

    const handleCopy = async () => {
      const code = exportPanelShellConfigCode();
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(code);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    };

    const handleResetAllShellTokens = () => {
      resetPanelShellTokens();
      setSimulateTemplateStale(false);
    };

    const mutedTextCls = `text-[11px] font-mono ${isLight ? 'text-neutral-500' : 'text-neutral-400'}`;

    return (
      <div
        id="panel-shell-tuner"
        className={`scroll-mt-6 p-5 md:p-6 rounded-2xl border flex flex-col gap-5 w-full transition-colors ${
          isLight
            ? 'bg-white border-neutral-200/90 shadow-2xs'
            : 'bg-neutral-900/70 border-neutral-800'
        }`}
      >
        {/* Top Bar */}
        <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-neutral-200/70 dark:border-neutral-800">
          <div className="flex items-center gap-2 flex-wrap">
            {codeBadge && (
              <span className="px-2 h-6 rounded-md bg-amber-500/20 text-amber-500 flex items-center justify-center font-bold font-mono text-xs shrink-0">
                {codeBadge}
              </span>
            )}
            <Sliders className="h-4 w-4 text-amber-500 shrink-0" />
            <span className="text-xs font-bold">{title}</span>
            <Badge variant="amber" size="sm" isLight={isLight}>
              L2 ⇄ L6 ⇄ L7 Global Sync
            </Badge>
            <span className={mutedTextCls}>
              Header: {panelHeaderPaddingX}×{panelHeaderPaddingY}px ({panelHeaderTitleFontSize}px ·
              Btn {btnGeom.width}×{btnGeom.height}px · R={btnGeom.radiusSummary}) · Body:{' '}
              {panelBodyPaddingX}×{panelBodyPaddingY}px · Footer: {panelFooterPaddingX}×
              {panelFooterPaddingY}px ({panelFooterFontSize}px)
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            <Button
              size="sm"
              variant="secondary"
              isLight={isLight}
              icon={<Code2 className="h-3.5 w-3.5" />}
              onClick={() => setShowCode((v) => !v)}
            >
              {showCode ? 'hide config code' : 'view config code'}
            </Button>
            <Button
              size="sm"
              variant="primary"
              isLight={isLight}
              icon={copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              onClick={handleCopy}
            >
              {copied ? 'Copied Shell config!' : 'Copy Shell Config'}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              isLight={isLight}
              icon={<RotateCcw className="h-3 w-3" />}
              onClick={handleResetAllShellTokens}
            >
              reset to default
            </Button>
          </div>
        </div>

        {/* Alpha -> Bravo Template-Stale Propagation Status Bar */}
        <div
          className={`flex flex-wrap items-center justify-between gap-3 px-3.5 py-2.5 rounded-xl border transition-colors ${
            simulateTemplateStale
              ? isLight
                ? 'bg-amber-50/90 border-amber-300/80 text-amber-900'
                : 'bg-amber-950/35 border-amber-500/40 text-amber-200'
              : isLight
              ? 'bg-emerald-50/60 border-emerald-200/80 text-emerald-900'
              : 'bg-emerald-950/20 border-emerald-800/50 text-emerald-200'
          }`}
        >
          <div className="flex items-center gap-2.5 flex-wrap">
            {simulateTemplateStale ? (
              <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
            ) : (
              <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
            )}
            <span className="text-xs font-bold">
              {simulateTemplateStale
                ? 'Template Drift Active (Bucket 3 · template-stale): Shell tokens modified — child Menu & Floating surfaces queued for visual re-verification in Workspace Bravo'
                : 'Template Hash Synchronized: All approved child Menu & Floating surfaces match the current Alpha-3 3-Stage Shell baseline'}
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {simulateTemplateStale ? (
              <Button
                size="sm"
                variant="secondary"
                isLight={isLight}
                onClick={() => batchApproveTemplateStale()}
              >
                Batch Re-Approve Child Surfaces
              </Button>
            ) : (
              <Button
                size="sm"
                variant="ghost"
                isLight={isLight}
                onClick={() => setSimulateTemplateStale(true)}
              >
                Simulate Template Drift
              </Button>
            )}
          </div>
        </div>

        {/* Horizontal Alignment Lock Toggle */}
        <div
          className={`flex flex-wrap items-center justify-between gap-3 px-3.5 py-2.5 rounded-xl border ${
            isLight
              ? 'bg-neutral-50 border-neutral-200/80'
              : 'bg-neutral-950/50 border-neutral-800/80'
          }`}
        >
          <div className="flex items-center gap-2">
            {lockPanelPaddingX ? (
              <Link2 className="h-3.5 w-3.5 text-amber-500 shrink-0" />
            ) : (
              <Unlink2 className="h-3.5 w-3.5 text-neutral-400 shrink-0" />
            )}
            <ToggleSwitch
              checked={lockPanelPaddingX}
              onCheckedChange={(v) => setShellToken('lockPanelPaddingX', v)}
              label="Lock horizontal margin alignment (Lock Header / Tabs / Content / Footer Padding X)"
              variant="neutral"
              isLight={isLight}
            />
          </div>
          <span className={mutedTextCls}>
            {lockPanelPaddingX
              ? `Unified left-align baseline locked (${panelHeaderPaddingX}px)`
              : 'Unlocked: Allow Header / Content / Footer Independently set different levels Padding'}
          </span>
        </div>

        {/* Stage 1: Header Typography, Back Button W×H & Paddings */}
        <div className="flex flex-col gap-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-500 font-mono font-bold text-xs">
                Alpha:3StagePanelShell
              </span>
              <span className="text-[11px] font-bold uppercase tracking-wider text-amber-500">
                Variant A · Stage 1 Header Centered Title, Back Button Left &amp; Top-Right
                Minimize-2
              </span>
            </div>
            <div className="flex items-center gap-4 flex-wrap">
              <ToggleSwitch
                checked={panelHeaderBackBtnShowArrow}
                onCheckedChange={(v) => setShellToken('panelHeaderBackBtnShowArrow', v)}
                label="Show Arrow (Show Arrow)"
                variant="neutral"
                isLight={isLight}
              />
              <ToggleSwitch
                checked={panelHeaderBackBtnShowLabel}
                onCheckedChange={(v) => setShellToken('panelHeaderBackBtnShowLabel', v)}
                label="show BACK (Show Back)"
                variant="neutral"
                isLight={isLight}
              />
              <ToggleSwitch
                checked={lockPanelHeaderBackBtnAspect}
                onCheckedChange={(v) => setShellToken('lockPanelHeaderBackBtnAspect', v)}
                label="Lock 1:1 square (Lock W=H)"
                variant="neutral"
                isLight={isLight}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            <SliderControl
              label="title font size (titleFontSize)"
              value={panelHeaderTitleFontSize}
              min={8} max={28} step={1} unit="px"
              editable allowOutOfBoundsInput colorScheme="amber"
              onChange={(v) => setShellToken('panelHeaderTitleFontSize', v)}
              isLight={isLight}
            />
            <SliderControl
              label="Back Button Width (backBtnWidth)"
              value={panelHeaderBackBtnWidth}
              min={12} max={56} step={1} unit="px"
              editable allowOutOfBoundsInput colorScheme="amber"
              onChange={(v) => setShellToken('panelHeaderBackBtnWidth', v)}
              isLight={isLight}
            />
            <SliderControl
              label="Back Button Height (backBtnHeight)"
              value={panelHeaderBackBtnHeight}
              min={12} max={44} step={1} unit="px"
              editable allowOutOfBoundsInput colorScheme="amber"
              onChange={(v) => setShellToken('panelHeaderBackBtnHeight', v)}
              isLight={isLight}
            />
            <SliderControl
              label="Button to title spacing (headerGap)"
              value={panelHeaderGap}
              min={0} max={24} step={1} unit="px"
              editable allowOutOfBoundsInput colorScheme="amber"
              onChange={(v) => setShellToken('panelHeaderGap', v)}
              isLight={isLight}
            />
            <SliderControl
              label="Header horizontal padding (padX)"
              value={panelHeaderPaddingX}
              min={0} max={36} step={1} unit="px"
              editable allowOutOfBoundsInput colorScheme="sky"
              onChange={(v) => setShellToken('panelHeaderPaddingX', v)}
              isLight={isLight}
            />
            <SliderControl
              label="Header vertical padding (padY)"
              value={panelHeaderPaddingY}
              min={0} max={28} step={1} unit="px"
              editable allowOutOfBoundsInput colorScheme="emerald"
              onChange={(v) => setShellToken('panelHeaderPaddingY', v)}
              isLight={isLight}
            />
          </div>

          <PanelHeaderBackButtonLab isLight={isLight} onTemplateTokenChange={notifyTemplateDrift} />
        </div>

        {/* Stage 2 & Stage 3: Menu Content Container & Split Footer */}
        <PanelShellStageThreeFooterSection
          isLight={isLight}
          showCode={showCode}
          onTemplateTokenChange={notifyTemplateDrift}
        />

        {/* Variant B: Floating Window 3-Stage Shell Tokens */}
        <FloatingWindowShellTunerSection
          isLight={isLight}
          onTemplateTokenChange={notifyTemplateDrift}
        />
      </div>
    );
  }
);

PanelShellTuner.displayName = 'PanelShellTuner';
