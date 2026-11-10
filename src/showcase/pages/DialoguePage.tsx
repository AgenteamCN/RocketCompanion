import React from 'react';
import { createScopedSyncedState } from '../stores/crossClientSync';
import {
  MessageSquare,
  ExternalLink,
  Check,
  Copy,
  Layers,
  Layers3,
} from 'lucide-react';
import {
  Dialogue,
  DialogueModal,
  DialogueStackContainer,
} from '../../ui-core/compounds/Dialogue';
import { dialogue, useDialogueStack } from '../../ui-core/compounds/dialogue/dialogueStore';
import type {
  DialogueTone,
  DialogueButtonConfig,
  DialogueButtonVariant,
} from '../../ui-core/compounds/dialogue/dialogueTypes';
import { Button } from '../../ui-core/primitives/Button';
import { Badge } from '../../ui-core/primitives/Badge';
import { CodeBlock } from '../CodeBlock';
import { DialogueSlotControlPanel } from './dialogue/DialogueSlotControlPanel';

const useState = createScopedSyncedState('page:dialogue');

export const DialoguePage: React.FC<{ isLight?: boolean }> = ({ isLight = false }) => {
  const [title, setTitle] = useState<string>('ALERT', 'title');
  const [tone, setTone] = useState<DialogueTone>('error', 'tone');
  const [iconName, setIconName] = useState<string>('octagon-alert', 'iconName');
  const [content, setContent] = useState<string>(
    'Failed to establish signaling server through WebSocket.',
    'content'
  );
  const [buttons, setButtons] = useState<DialogueButtonConfig[]>(
    [
      { key: 'btn-1', label: 'Primary', variant: 'primary', disabled: false },
      { key: 'btn-2', label: 'Outline', variant: 'outline', disabled: false },
      { key: 'btn-3', label: 'Danger', variant: 'danger', disabled: false },
    ],
    'buttons'
  );
  const [newButtonLabel, setNewButtonLabel] = useState<string>('Primary', 'newButtonLabel');
  const [newButtonVariant, setNewButtonVariant] = useState<DialogueButtonVariant>(
    'outline',
    'newButtonVariant'
  );
  const [newButtonDisabled, setNewButtonDisabled] = useState<boolean>(false, 'newButtonDisabled');
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false, 'isModalOpen');
  const [copiedParams, setCopiedParams] = useState<boolean>(false, 'copiedParams');
  const { stack } = useDialogueStack();

  const handleAddButton = () => {
    const trimmed = newButtonLabel.trim();
    if (!trimmed) return;
    const newBtn: DialogueButtonConfig = {
      key: `btn-${Date.now()}`,
      label: trimmed,
      variant: newButtonVariant,
      disabled: newButtonDisabled,
    };
    setButtons((prev) => [...prev, newBtn]);
    setNewButtonLabel('Primary');
    setNewButtonDisabled(false);
  };

  const handleRemoveButton = (index: number) => {
    setButtons((prev) => prev.filter((_, i) => i !== index));
  };

  const handleUpdateButtonLabel = (index: number, newLabel: string) => {
    setButtons((prev) =>
      prev.map((btn, i) => (i === index ? { ...btn, label: newLabel } : btn))
    );
  };

  const handleUpdateButtonVariant = (index: number, newVariant: DialogueButtonVariant) => {
    setButtons((prev) =>
      prev.map((btn, i) => (i === index ? { ...btn, variant: newVariant } : btn))
    );
  };

  const handleToggleButtonDisabled = (index: number) => {
    setButtons((prev) =>
      prev.map((btn, i) => (i === index ? { ...btn, disabled: !btn.disabled } : btn))
    );
  };

  const handleSpawnStackedDialogue = () => {
    const stackIndex = dialogue.getCount() + 1;
    dialogue.show({
      title: stackIndex === 1 ? title : `${title} #${stackIndex}`,
      icon: iconName,
      iconVariant: 'plain',
      iconSize: 46,
      content: stackIndex === 1 ? content : `[Stack #${stackIndex}] ${content}`,
      tone,
      isLight,
      buttons: buttons.map((b) => ({
        ...b,
        onClick: () => {
          if (b.onClick) b.onClick();
        },
      })),
    });
  };

  const currentParamsObject = {
    title,
    icon: iconName,
    iconVariant: 'plain',
    iconSize: 46,
    content,
    tone,
    buttons: buttons.map((b) => ({
      label: b.label,
      variant: b.variant ?? 'outline',
      ...(b.disabled ? { disabled: true } : {}),
    })),
  };

  const handleCopyParams = () => {
    navigator.clipboard.writeText(JSON.stringify(currentParamsObject, null, 2));
    setCopiedParams(true);
    setTimeout(() => setCopiedParams(false), 2200);
  };

  const generatedCode = `import { Dialogue, dialogue, DialogueStackContainer } from '@/ui-core/compounds/Dialogue';
<Dialogue
  title="${title}"
  icon="${iconName}"
  iconVariant="plain"
  iconSize={46}
  content="${content.replace(/\n/g, '\\n')}"
  tone="${tone}"
  buttons={[
${buttons.map((b) => `    { label: '${b.label}', variant: '${b.variant ?? 'outline'}'${b.disabled ? ', disabled: true' : ''} }`).join(',\n')}
  ]}
  isLight={${isLight}}
/>
dialogue.show({
  title: "${title}",
  icon: "${iconName}",
  content: "${content.replace(/\n/g, '\\n')}",
  tone: "${tone}",
  buttons: [
    { label: 'Primary', variant: 'primary', onClick: () => console.log('Confirmed') },
    { label: 'Outline', variant: 'outline' },
    { label: 'Danger', variant: 'danger', disabled: true }
  ]
});`;

  return (
    <div className="flex flex-col gap-10 max-w-6xl w-full pb-16 font-sans">
      {/* 1. Static Page Header */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-lg bg-amber-500/10 text-amber-500 flex items-center justify-center">
            <MessageSquare className="h-5 w-5" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Dialogue Dialog specification</h1>
          <Badge variant="primary" size="sm" isLight={isLight}>
            Standardized Component · Plain 46px · Stackable
          </Badge>
        </div>
        <p className={`text-xs leading-relaxed ${isLight ? 'text-neutral-600' : 'text-neutral-400'}`}>
          Standard standalone component. Supports body text, Lucide icons, custom content slots, 4
          tones and button variants/Disabled state (disabled). Features all-directional embossed
          shadow and inner glow, Popup mode without background dimming mask (Zero Mask), Supports
          multi-layer stacking and generation at the top layer.
        </p>
      </div>

      {/* 2. Dual Real-Time Previews */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Layers className="h-4 w-4 text-amber-500" />
            <h2 className="text-base font-bold tracking-tight">
              Dual Previews · Dual real-time preview canvas
            </h2>
          </div>
          <span className={`text-xs font-mono ${isLight ? 'text-neutral-500' : 'text-neutral-400'}`}>
            Plain 46px · Zero Mask · Solidified Dual Elevation
          </span>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Light Mode Canvas */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between px-1">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-amber-500" />
                <span className="text-xs font-semibold">
                  Light Mode Canvas (White background viewport)
                </span>
              </div>
              <Badge variant="neutral" size="sm" isLight={true}>
                bg-white
              </Badge>
            </div>
            <div
              className="w-full min-h-[400px] p-6 sm:p-10 rounded-2xl border border-neutral-200/90 bg-[#f8f9fb] flex items-center justify-center relative overflow-hidden shadow-inner"
              style={{
                backgroundImage: 'radial-gradient(#e2e4e8 1px, transparent 1px)',
                backgroundSize: '16px 16px',
              }}
            >
              <Dialogue
                title={title}
                content={content}
                icon={iconName}
                tone={tone}
                buttons={buttons}
                isLight={true}
              />
            </div>
          </div>

          {/* Dark Mode Canvas */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between px-1">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-neutral-400" />
                <span className="text-xs font-semibold">
                  Dark Mode Canvas (Black background viewport)
                </span>
              </div>
              <Badge variant="neutral" size="sm" isLight={false}>
                bg-black
              </Badge>
            </div>
            <div
              className="w-full min-h-[400px] p-6 sm:p-10 rounded-2xl border border-neutral-800 bg-[#08080a] flex items-center justify-center relative overflow-hidden shadow-inner"
              style={{
                backgroundImage: 'radial-gradient(#27272a 1px, transparent 1px)',
                backgroundSize: '16px 16px',
              }}
            >
              <Dialogue
                title={title}
                content={content}
                icon={iconName}
                tone={tone}
                buttons={buttons}
                isLight={false}
              />
            </div>
          </div>
        </div>
      </div>

      {/* 3. Modal Trigger Actions & Stack Status Banner */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <span className={`text-xs font-mono ${isLight ? 'text-neutral-600' : 'text-neutral-400'}`}>
            Interactive Modal & Stack Triggers:
          </span>
          <div className="shrink-0 flex items-center gap-2.5 flex-wrap">
            <Button
              variant="outline"
              size="md"
              isLight={isLight}
              icon={
                copiedParams ? (
                  <Check className="h-4 w-4 text-emerald-500" />
                ) : (
                  <Copy className="h-4 w-4" />
                )
              }
              onClick={handleCopyParams}
            >
              {copiedParams ? 'Copied JSON' : 'Export JSON'}
            </Button>
            <Button
              variant="primary"
              size="md"
              isLight={isLight}
              icon={<Layers3 className="h-4 w-4" />}
              onClick={handleSpawnStackedDialogue}
            >
              Spawn Stacked (+1 Stacked popup)
            </Button>
            <Button
              variant="outline"
              size="md"
              isLight={isLight}
              icon={<ExternalLink className="h-4 w-4" />}
              onClick={() => setIsModalOpen(true)}
            >
              Single Modal (Single popup)
            </Button>
          </div>
        </div>

        {/* Stack Status Banner if dialogues are active */}
        {stack.length > 0 && (
          <div
            className={`p-3 rounded-xl border flex items-center justify-between text-xs font-mono transition-all ${
              isLight
                ? 'bg-amber-50 border-amber-200 text-amber-900'
                : 'bg-amber-950/40 border-amber-800 text-amber-200'
            }`}
          >
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
              <span>
                Currently stacked <strong>{stack.length}</strong> dialogs (Top-layer priority
                rendering, No dark background mask)
              </span>
            </div>
            <button
              type="button"
              onClick={() => dialogue.clear()}
              className="px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 font-semibold cursor-pointer transition-colors"
            >
              Close all (Clear All)
            </button>
          </div>
        )}
      </div>

      {/* 4. Standardized Slot Control Panel */}
      <DialogueSlotControlPanel
        isLight={isLight}
        slotState={{
          title,
          setTitle,
          tone,
          setTone,
          iconName,
          setIconName,
          content,
          setContent,
          buttons,
          newButtonLabel,
          setNewButtonLabel,
          newButtonVariant,
          setNewButtonVariant,
          newButtonDisabled,
          setNewButtonDisabled,
        }}
        slotActions={{
          handleAddButton,
          handleRemoveButton,
          handleUpdateButtonLabel,
          handleUpdateButtonVariant,
          handleToggleButtonDisabled,
        }}
      />

      {/* Parameters Export Box */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold tracking-tight font-mono uppercase text-neutral-400">
            Exported Parameters JSON (Standardized parameter object meeting requirements)
          </h3>
          <button
            type="button"
            onClick={handleCopyParams}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-mono border transition-all cursor-pointer ${
              copiedParams
                ? 'bg-emerald-500 text-white border-emerald-600 font-bold shadow-xs'
                : isLight
                ? 'bg-neutral-900 text-white border-neutral-900 hover:bg-neutral-800 shadow-xs'
                : 'bg-white text-neutral-900 border-white hover:bg-neutral-100 shadow-xs'
            }`}
          >
            {copiedParams ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            <span>{copiedParams ? 'Copied to Clipboard!' : 'Copy Configuration'}</span>
          </button>
        </div>
        <pre
          className={`p-4 rounded-xl border text-[11px] font-mono leading-relaxed overflow-x-auto ${
            isLight
              ? 'bg-white border-neutral-200 text-neutral-800 shadow-2xs'
              : 'bg-neutral-950 border-neutral-800 text-neutral-200 shadow-2xs'
          }`}
        >
          <code>{JSON.stringify(currentParamsObject, null, 2)}</code>
        </pre>
      </div>

      {/* Recipe Code Block */}
      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-bold tracking-tight">
          Agent Code Recipe (Code reference example)
        </h3>
        <CodeBlock isLight={isLight} title="Dialogue / dialogue.show Recipe" code={generatedCode} />
      </div>

      {/* Centered Modal Overlay */}
      <DialogueModal
        open={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={title}
        content={content}
        icon={iconName}
        tone={tone}
        isLight={isLight}
        buttons={buttons.map((b) => ({
          ...b,
          onClick: () => {
            if (b.disabled) return;
            if (b.onClick) b.onClick();
            setIsModalOpen(false);
          },
        }))}
      />

      {/* Dialogue Stack Container */}
      <DialogueStackContainer isLight={isLight} />
    </div>
  );
};
