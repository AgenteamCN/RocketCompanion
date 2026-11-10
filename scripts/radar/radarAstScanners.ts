import path from 'node:path';
import {
  ARBITRARY_SPLIT_FILENAME_RE,
  FILE_ANY_LIMIT,
  MAX_LINE_CHAR_LIMIT,
} from './radarConstantsAndFs.ts';

export function checkLanguageAndEmoji(rel: string, content: string, errors: string[]): void {
  const cjkRegex = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff66-\uff9f]/;
  const emojiRegex = /[\p{Emoji_Presentation}\p{Extended_Pictographic}]/u;
  const allowedTechnicalSymbols = /[±×÷→←↑↓↔↗↘↙↖⇒⇐⇔µαβγδθλμπσωΔΩ°✓✗✔✘⚠⚡]/g;

  const lines = content.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (cjkRegex.test(line)) {
      const sample = line.trim().slice(0, 80);
      errors.push(
        `[NON-ENGLISH / EMOJI VIOLATION] ${rel}:${i + 1} contains non-English CJK characters: "${sample}"`
      );
      break;
    }
    const sanitized = line.replace(allowedTechnicalSymbols, '');
    if (emojiRegex.test(sanitized)) {
      const sample = line.trim().slice(0, 80);
      errors.push(
        `[NON-ENGLISH / EMOJI VIOLATION] ${rel}:${i + 1} contains forbidden emoji character: "${sample}"`
      );
      break;
    }
  }
}

export function checkLineLengthAndFilenameHygiene(
  rel: string,
  content: string,
  codeWithoutComments: string,
  errors: string[]
): void {
  const baseName = path.basename(rel, path.extname(rel));
  if (ARBITRARY_SPLIT_FILENAME_RE.test(baseName)) {
    errors.push(
      `[ARBITRARY SPLIT FILENAME] ${rel} ("${baseName}") uses an arbitrary numbered split suffix. Decompose by functional domain, pure pipeline, or UI slot responsibility instead of line-count halving.`
    );
  }

  const lines = content.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.length > MAX_LINE_CHAR_LIMIT) {
      errors.push(
        `[LINE LENGTH OVERFLOW] ${rel}:${i + 1} has ${line.length} characters (limit <= ${MAX_LINE_CHAR_LIMIT}). Do not inline Base64/data blobs or compress multiple statements onto a single line.`
      );
      break;
    }
  }

  const noLiterals = codeWithoutComments.replace(
    /`(?:\\[\s\S]|[^`\\])*`|'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"/g,
    (m) => m.replace(/[^\n]/g, ' ')
  );
  const codeLines = noLiterals.split(/\r?\n/);
  let multiStmtLines = 0;
  let firstMultiLine = 0;
  let nonEmptyCodeLines = 0;
  let indentedLines = 0;

  for (let i = 0; i < codeLines.length; i++) {
    const rawLine = codeLines[i];
    const trimmed = rawLine.trim();
    if (!trimmed) continue;
    nonEmptyCodeLines++;
    if (/^[ \t]+/.test(rawLine)) indentedLines++;

    if (/^(?:for\s*\(|import\b|export\b|interface\b|type\b)/.test(trimmed)) continue;
    const cleaned = trimmed
      .replace(/\bfor\s*\([^)]*\)/g, 'for()')
      .replace(/&[a-zA-Z0-9#]+;/g, '')
      .replace(/\{[^{}]*\}/g, '{}');
    const statements = cleaned
      .split(';')
      .map((s) => s.trim())
      .filter(Boolean);
    if (statements.length >= 3) {
      errors.push(
        `[MULTI-STATEMENT LINE VIOLATION] ${rel}:${i + 1} packs ${statements.length} statements onto a single line. Run "pnpm run format" instead of compressing lines.`
      );
      return;
    }
    if (statements.length >= 2) {
      multiStmtLines++;
      if (!firstMultiLine) firstMultiLine = i + 1;
    }
  }

  if (multiStmtLines > 2) {
    errors.push(
      `[MULTI-STATEMENT LINE VIOLATION] ${rel}:${firstMultiLine} contains ${multiStmtLines} multi-statement lines. Run "pnpm run format" instead of compressing lines.`
    );
  }

  if (nonEmptyCodeLines >= 60 && indentedLines / nonEmptyCodeLines < 0.25) {
    errors.push(
      `[INDENTATION STRIP VIOLATION] ${rel} stripped indentation across ${nonEmptyCodeLines} code lines. Run "pnpm run format" to restore standard 2-space indentation.`
    );
  }
}

export function checkValueReExports(
  rel: string,
  codeWithoutComments: string,
  errors: string[]
): void {
  if (rel === 'src/ui-core/index.ts') return;

  const reExportRegex = /\bexport\s+(type\s+)?(\*|\{[^}]*\})\s+from\s+['"]([^'"]+)['"]/g;
  let match: RegExpExecArray | null;
  while ((match = reExportRegex.exec(codeWithoutComments)) !== null) {
    const isTypeExport = Boolean(match[1]);
    if (isTypeExport) continue;

    const clause = match[2];
    const fromSpec = match[3];
    if (clause === '*') {
      errors.push(
        `[RE-EXPORT FACADE VIOLATION] ${rel} re-exports wildcard values from "${fromSpec}". Import directly from the defining source module.`
      );
      continue;
    }

    const inner = clause.slice(1, -1);
    const specifiers = inner
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const valueSpecs = specifiers.filter((s) => !/^type\s+/.test(s));
    if (valueSpecs.length > 0) {
      errors.push(
        `[RE-EXPORT FACADE VIOLATION] ${rel} re-exports values { ${valueSpecs.slice(0, 4).join(', ')}${valueSpecs.length > 4 ? ', ...' : ''} } from "${fromSpec}". Import directly from the defining source module.`
      );
    }
  }

  const importedValueLocals = new Map<string, string>();
  const importStmtRegex = /\bimport\s+(type\s+)?([\s\S]*?)\s+from\s+['"]([^'"]+)['"]/g;
  let impMatch: RegExpExecArray | null;
  while ((impMatch = importStmtRegex.exec(codeWithoutComments)) !== null) {
    if (impMatch[1]) continue;
    const clause = impMatch[2].trim();
    const fromSpec = impMatch[3];

    const namedMatch = clause.match(/\{([^}]*)\}/);
    if (namedMatch) {
      for (const rawSpec of namedMatch[1].split(',')) {
        const spec = rawSpec.trim();
        if (!spec || /^type\s+/.test(spec)) continue;
        const asParts = spec.split(/\s+as\s+/);
        const localName = (asParts[1] || asParts[0]).trim();
        if (localName) importedValueLocals.set(localName, fromSpec);
      }
    }

    const defaultPart = clause
      .replace(/\{[^}]*\}/, '')
      .replace(/,/g, '')
      .trim();
    if (defaultPart && !defaultPart.startsWith('*') && /^[A-Za-z_$][\w$]*$/.test(defaultPart)) {
      importedValueLocals.set(defaultPart, fromSpec);
    }
  }

  if (importedValueLocals.size > 0) {
    const localExportRegex = /\bexport\s+(type\s+)?\{([^}]*)\}(?!\s*from\b)/g;
    let expMatch: RegExpExecArray | null;
    while ((expMatch = localExportRegex.exec(codeWithoutComments)) !== null) {
      if (expMatch[1]) continue;
      const reExportedLocals: string[] = [];
      for (const rawSpec of expMatch[2].split(',')) {
        const spec = rawSpec.trim();
        if (!spec || /^type\s+/.test(spec)) continue;
        const localName = spec.split(/\s+as\s+/)[0].trim();
        if (importedValueLocals.has(localName)) {
          reExportedLocals.push(`${localName} (from "${importedValueLocals.get(localName)}")`);
        }
      }
      if (reExportedLocals.length > 0) {
        errors.push(
          `[RE-EXPORT FACADE VIOLATION] ${rel} indirectly re-exports imported values { ${reExportedLocals.slice(0, 4).join(', ')}${reExportedLocals.length > 4 ? ', ...' : ''} }. Import directly from the defining source module.`
        );
      }
    }
  }
}

export function checkAnyPurity(rel: string, codeWithoutComments: string, errors: string[]): void {
  const anyMatches =
    codeWithoutComments.match(/(?::\s*any\b|\bas\s+any\b|<any>|Record<[^,>]+,\s*any>)/g) || [];
  const boundaryAnyRegex =
    /\bexport\s+(?:async\s+)?function\s+\w+[^{]*:\s*any\b|\bexport\s+interface\s+\w+\s*\{[^}]*:\s*any\b/s;
  const hasBoundaryAny = boundaryAnyRegex.test(codeWithoutComments);

  if (anyMatches.length > FILE_ANY_LIMIT || hasBoundaryAny) {
    const reason =
      anyMatches.length > FILE_ANY_LIMIT
        ? `${anyMatches.length} untyped 'any' occurrences (limit: ${FILE_ANY_LIMIT})`
        : `untyped 'any' in exported module boundary signature/interface`;
    errors.push(
      `[UNTYPED ANY VIOLATION] ${rel} contains ${reason}. Declare explicit TypeScript interfaces across module boundaries.`
    );
  }
}
