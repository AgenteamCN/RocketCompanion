import React, { useState } from 'react';
import { Check, Copy } from 'lucide-react';

export interface CodeBlockProps {
  code: string;
  language?: string;
  title?: string;
  isLight?: boolean;
}

export const CodeBlock: React.FC<CodeBlockProps> = ({
  code,
  language = 'tsx',
  title = 'Component Recipe',
  isLight = false,
}) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      className={`relative flex flex-col rounded-xl overflow-hidden border font-mono text-xs my-3 shadow-sm transition-colors duration-150 ${
        isLight
          ? 'bg-neutral-50/90 border-neutral-200 text-neutral-800'
          : 'border-neutral-800 bg-neutral-950 text-neutral-200'
      }`}
    >
      <div
        className={`flex items-center justify-between px-4 py-2 border-b select-none ${
          isLight
            ? 'bg-neutral-100/80 border-neutral-200 text-neutral-700'
            : 'border-neutral-800 bg-neutral-900/80 text-neutral-300'
        }`}
      >
        <span className="font-semibold text-xs tracking-tight">{title}</span>
        <button
          type="button"
          onClick={handleCopy}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs transition-colors cursor-pointer border ${
            isLight
              ? 'bg-white hover:bg-neutral-100 text-neutral-700 border-neutral-200 shadow-2xs'
              : 'bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white border-neutral-700/60'
          }`}
        >
          {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
          <span>{copied ? 'Copied' : 'Copy'}</span>
        </button>
      </div>
      <div className="p-4 overflow-x-auto max-h-[360px] text-[11px] leading-relaxed">
        <pre>
          <code className={isLight ? 'text-neutral-800 font-medium' : 'text-neutral-200'}>{code}</code>
        </pre>
      </div>
    </div>
  );
};
