import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { checkLanguageAndEmoji } from './radarAstScanners.ts';
import {
  HARD_BYTE_LIMIT,
  HARD_LINE_LIMIT,
  MAX_LINE_CHAR_LIMIT,
  ROOT_DIR,
  SOFT_BYTE_LIMIT,
  SOFT_LINE_LIMIT,
  SRC_DIR,
  stripComments,
  toPosixRel,
} from './radarConstantsAndFs.ts';

function computeGitTreeHashFromDisk(dirPath: string): Buffer {
  const entries = fs
    .readdirSync(dirPath, { withFileTypes: true })
    .filter((d) => d.name !== '.git')
    .map((d) => {
      const fullPath = path.join(dirPath, d.name);
      if (d.isDirectory()) {
        return {
          mode: '40000',
          name: d.name,
          sortKey: `${d.name}/`,
          sha: computeGitTreeHashFromDisk(fullPath),
        };
      }
      const buf = fs.readFileSync(fullPath);
      const blobHash = crypto.createHash('sha1');
      blobHash.update(`blob ${buf.length}\0`);
      blobHash.update(buf);
      return {
        mode: '100644',
        name: d.name,
        sortKey: d.name,
        sha: blobHash.digest(),
      };
    })
    .sort((a, b) => (a.sortKey < b.sortKey ? -1 : a.sortKey > b.sortKey ? 1 : 0));

  const chunks: Buffer[] = [];
  for (const entry of entries) {
    chunks.push(Buffer.from(`${entry.mode} ${entry.name}\0`, 'utf8'), entry.sha);
  }
  const body = Buffer.concat(chunks);
  const treeHash = crypto.createHash('sha1');
  treeHash.update(`tree ${body.length}\0`);
  treeHash.update(body);
  return treeHash.digest();
}

function walkRustFiles(dirPath: string, results: string[] = []): string[] {
  if (!fs.existsSync(dirPath)) return results;
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    if (entry.name === 'target' || entry.name === '.git') continue;
    const full = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      walkRustFiles(full, results);
    } else if (entry.isFile() && entry.name.endsWith('.rs')) {
      results.push(full);
    }
  }
  return results;
}

export function checkRustWorkspaceAndWasmGuards(
  errors: string[],
  infos: string[],
  showAllInfos: boolean,
  modifiedRelSet: Set<string>
): { rustFileCount: number; rustLargeFileCount: number } {
  const cratesDir = path.join(ROOT_DIR, 'crates');
  const rocketsimDir = path.join(cratesDir, 'rocketsim');
  const treeHashFile = path.join(cratesDir, 'rocketsim.tree-hash');

  if (fs.existsSync(rocketsimDir)) {
    if (!fs.existsSync(treeHashFile)) {
      errors.push(
        '[ROCKETSIM UPSTREAM LOCK VIOLATION] Missing crates/rocketsim.tree-hash single-line lockfile.'
      );
    } else {
      const rawHashFile = fs.readFileSync(treeHashFile, 'utf8');
      const nonEmptyLines = rawHashFile
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean);
      if (nonEmptyLines.length !== 1 || !/^[0-9a-f]{40}$/.test(nonEmptyLines[0])) {
        errors.push(
          '[ROCKETSIM UPSTREAM LOCK VIOLATION] crates/rocketsim.tree-hash must contain ONLY a single 40-char Git tree SHA-1 line.'
        );
      } else {
        const expectedHash = nonEmptyLines[0];
        const actualHash = computeGitTreeHashFromDisk(rocketsimDir).toString('hex');
        if (actualHash !== expectedHash) {
          errors.push(
            `[ROCKETSIM UPSTREAM LOCK VIOLATION] crates/rocketsim directory hash (${actualHash}) does not match locked crates/rocketsim.tree-hash (${expectedHash}). Keep crates/rocketsim strictly isolated for upstream sync, or if an intentional hook was added, update the single-line crates/rocketsim.tree-hash.`
          );
        }
      }
    }
  }

  try {
    execFileSync('git', ['ls-files', '--error-unmatch', 'src/physics/core.wasm'], {
      cwd: ROOT_DIR,
      stdio: 'ignore',
    });
    errors.push(
      '[WASM BINARY TRACKING VIOLATION] src/physics/core.wasm is tracked in Git index. Run `git rm --cached src/physics/core.wasm` and compile via `pnpm build:wasm`.'
    );
  } catch {
    // Expected: src/physics/core.wasm is not tracked in git
  }

  let rustFileCount = 0;
  let rustLargeFileCount = 0;
  const customCrates = fs.existsSync(cratesDir)
    ? fs
        .readdirSync(cratesDir, { withFileTypes: true })
        .filter((d) => d.isDirectory() && d.name !== 'rocketsim' && d.name !== 'target')
        .map((d) => d.name)
        .sort()
    : [];
  const rustExportSet = new Set<string>();

  for (const crateName of customCrates) {
    const crateDir = path.join(cratesDir, crateName);
    const rsFiles = walkRustFiles(crateDir);
    for (const rsFile of rsFiles) {
      rustFileCount++;
      const rel = toPosixRel(rsFile);
      const content = fs.readFileSync(rsFile, 'utf8');
      const codeWithoutComments = stripComments(content);
      const lines = content.split(/\r?\n/);
      const lineCount = lines.length;
      const byteSize = Buffer.byteLength(content, 'utf8');
      const kbFormatted = (byteSize / 1024).toFixed(1);

      checkLanguageAndEmoji(rel, content, errors);

      for (let i = 0; i < lines.length; i++) {
        if (lines[i].length > MAX_LINE_CHAR_LIMIT) {
          errors.push(
            `[LINE LENGTH VIOLATION] ${rel}:${i + 1} is ${lines[i].length} chars (exceeds max ${MAX_LINE_CHAR_LIMIT}).`
          );
          break;
        }
      }

      if (lineCount > HARD_LINE_LIMIT) {
        errors.push(
          `[RUST VOLUME OVERFLOW] ${rel} has ${lineCount} lines (${kbFormatted} KB; exceeds hard ceiling of ${HARD_LINE_LIMIT} lines). Split Rust module by domain responsibility.`
        );
      }
      if (byteSize > HARD_BYTE_LIMIT) {
        errors.push(
          `[RUST BYTE VOLUME OVERFLOW] ${rel} is ${kbFormatted} KB (${lineCount} lines; exceeds hard ceiling of ${(HARD_BYTE_LIMIT / 1024).toFixed(0)} KB).`
        );
      }
      if (
        lineCount <= HARD_LINE_LIMIT &&
        byteSize <= HARD_BYTE_LIMIT &&
        (lineCount > SOFT_LINE_LIMIT || byteSize > SOFT_BYTE_LIMIT)
      ) {
        rustLargeFileCount++;
        if (showAllInfos || modifiedRelSet.has(rel)) {
          infos.push(
            `[INFO: LARGE RUST FILE NOTICE] ${rel} is ${kbFormatted} KB (${lineCount} lines; soft notice > ${SOFT_LINE_LIMIT}L, hard ceiling ${HARD_LINE_LIMIT}L).`
          );
        }
      }

      if (crateName === 'rocketsim_wasm') {
        const fnRegex = /pub\s+extern\s+"C"\s+fn\s+(_physics_[a-zA-Z0-9_]+)\s*\(/g;
        let m: RegExpExecArray | null;
        while ((m = fnRegex.exec(codeWithoutComments)) !== null) {
          rustExportSet.add(m[1]);
        }
      }
    }
  }

  const coreJsPath = path.join(SRC_DIR, 'physics/core.js');
  const coreDtsPath = path.join(SRC_DIR, 'physics/core.d.ts');
  if (!fs.existsSync(coreDtsPath)) {
    errors.push(
      '[WASM TYPING VIOLATION] src/physics/core.d.ts is missing. Ambient TypeScript declarations for core.js are required.'
    );
  } else if (fs.existsSync(coreJsPath)) {
    const coreJsContent = fs.readFileSync(coreJsPath, 'utf8');
    const coreDtsContent = fs.readFileSync(coreDtsPath, 'utf8');

    const jsExportSet = new Set<string>();
    const jsLiteralRegex = /['"](_physics_[a-zA-Z0-9_]+)['"]/g;
    let jsMatch: RegExpExecArray | null;
    while ((jsMatch = jsLiteralRegex.exec(coreJsContent)) !== null) {
      jsExportSet.add(jsMatch[1]);
    }

    const dtsExportSet = new Set<string>();
    const dtsExportRegex = /^\s*(_physics_[a-zA-Z0-9_]+)\??\s*\(/gm;
    let dtsMatch: RegExpExecArray | null;
    while ((dtsMatch = dtsExportRegex.exec(coreDtsContent)) !== null) {
      dtsExportSet.add(dtsMatch[1]);
    }

    const missingInDts = [...jsExportSet].filter((fn) => !dtsExportSet.has(fn));
    const missingInJs = [...dtsExportSet].filter((fn) => !jsExportSet.has(fn));
    if (missingInDts.length > 0) {
      errors.push(
        `[WASM BRIDGE PARITY] Listed in src/physics/core.js but missing in src/physics/core.d.ts: ${missingInDts.join(', ')}`
      );
    }
    if (missingInJs.length > 0) {
      errors.push(
        `[WASM BRIDGE PARITY] Declared in src/physics/core.d.ts but missing in src/physics/core.js: ${missingInJs.join(', ')}`
      );
    }

    if (rustExportSet.size > 0) {
      const missingInRust = [...dtsExportSet].filter((fn) => !rustExportSet.has(fn));
      const extraInRust = [...rustExportSet].filter((fn) => !dtsExportSet.has(fn));
      if (missingInRust.length > 0) {
        errors.push(
          `[RUST WASM EXPORT PARITY] Declared in src/physics/core.d.ts but missing in crates/rocketsim_wasm: ${missingInRust.join(', ')}`
        );
      }
      if (extraInRust.length > 0) {
        errors.push(
          `[RUST WASM EXPORT PARITY] Exported in crates/rocketsim_wasm but undeclared in src/physics/core.d.ts: ${extraInRust.join(', ')}`
        );
      }
    }
  }

  return { rustFileCount, rustLargeFileCount };
}
