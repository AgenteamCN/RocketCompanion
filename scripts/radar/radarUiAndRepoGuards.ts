import fs from 'node:fs';
import path from 'node:path';
import {
  kebabToPascalCase,
  ROOT_DIR,
  SRC_DIR,
  stripComments,
  toPosixRel,
} from './radarConstantsAndFs.ts';

export function checkUiNamingAndRouteAlignment(errors: string[]): void {
  const routeRegistryPath = path.join(SRC_DIR, 'ui-system/core/menuRouteRegistry.tsx');
  if (fs.existsSync(routeRegistryPath)) {
    const content = stripComments(fs.readFileSync(routeRegistryPath, 'utf8'));
    const importRegex = /import\s+\{([^}]+)\}\s+from\s+['"]([^'"]+)['"]/g;
    let m: RegExpExecArray | null;
    while ((m = importRegex.exec(content)) !== null) {
      const importedNames = m[1]
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const fromSpec = m[2];
      for (const rawName of importedNames) {
        if (rawName.startsWith('type ')) continue;
        const localName = rawName
          .split(/\s+as\s+/)
          .pop()!
          .trim();
        if (new RegExp(`<${localName}\\b`).test(content) && localName !== 'LogOut') {
          const isLayerRecipeImport =
            /ui-core\/recipes\/Layer\d+\w+Recipe(?:\.tsx)?$/.test(fromSpec) &&
            /^Layer\d+\w+Recipe$/.test(localName);
          if (!isLayerRecipeImport) {
            errors.push(
              `[UI ROUTE ALIGNMENT VIOLATION] src/ui-system/core/menuRouteRegistry.tsx mounts non-recipe route component <${localName}> from "${fromSpec}". All menu route page components must reside in src/ui-core/recipes/Layer*Recipe.tsx.`
            );
          }
        }
      }
    }
  }

  const presetFiles = [
    path.join(SRC_DIR, 'ui-core/stores/floatingPresets.ts'),
    path.join(SRC_DIR, 'ui-core/stores/devFloatingPresets.ts'),
  ];
  const registryPath = path.join(SRC_DIR, 'ui-core/panels/floatingWindowRegistry.tsx');
  const registryContent = fs.existsSync(registryPath)
    ? stripComments(fs.readFileSync(registryPath, 'utf8'))
    : '';
  const usesGlobAutoDiscovery =
    /\b(?:import\.meta\.glob|importMetaGlob|getDiscoveredFloatingSurfaces)\b/.test(registryContent);

  const presetBlockRegex =
    /export\s+const\s+\w+_PRESET\s*:\s*PresetConfig\s*=\s*\{([\s\S]*?)\n\};/g;
  for (const presetFile of presetFiles) {
    if (!fs.existsSync(presetFile)) continue;
    const rel = toPosixRel(presetFile);
    const content = stripComments(fs.readFileSync(presetFile, 'utf8'));
    let blockMatch: RegExpExecArray | null;
    while ((blockMatch = presetBlockRegex.exec(content)) !== null) {
      const body = blockMatch[1];
      const idMatch = body.match(/\bid\s*:\s*['"]([^'"]+)['"]/);
      const compMatch = body.match(/\bcomponent\s*:\s*['"]([^'"]+)['"]/);
      const sourceMatch = body.match(/\bsourcePath\s*:\s*['"]([^'"]+)['"]/);
      if (!idMatch) continue;

      const id = idMatch[1];
      const component = compMatch?.[1] || '';
      const sourcePath = sourceMatch?.[1] || '';
      const expectedComponent = `${kebabToPascalCase(id)}FloatingWindow`;

      if (/(?:^|-)ob(?:-|$)/i.test(id) || /OBFloatingWindow/.test(component)) {
        errors.push(
          `[UI NAMING VIOLATION] ${rel} preset '${id}' (${component}) uses unexpanded abbreviation 'OB'. Expand to full semantic name (e.g., 'event-stream-observer' / 'EventStreamObserverFloatingWindow').`
        );
      }

      if (component !== expectedComponent) {
        errors.push(
          `[UI NAMING VIOLATION] ${rel} preset '${id}' maps to component '${component}', expected strict 1:1 PascalCase '${expectedComponent}'.`
        );
      }

      if (!sourcePath.endsWith(`/${expectedComponent}.tsx`)) {
        errors.push(
          `[UI NAMING VIOLATION] ${rel} preset '${id}' has sourcePath '${sourcePath}', expected path ending with '/${expectedComponent}.tsx'.`
        );
      }

      if (usesGlobAutoDiscovery) {
        const absSourcePath = sourcePath.startsWith('src/')
          ? path.join(ROOT_DIR, sourcePath)
          : path.join(SRC_DIR, 'ui-core', sourcePath);
        if (!fs.existsSync(absSourcePath)) {
          errors.push(
            `[UI NAMING VIOLATION] ${rel} preset '${id}' points to missing floating window file '${sourcePath}'.`
          );
        } else {
          const winContent = stripComments(fs.readFileSync(absSourcePath, 'utf8'));
          const metaBlockMatch = winContent.match(
            /\bexport\s+const\s+SURFACE_META\b[\s\S]*?\bid\s*:\s*['"]([^'"]+)['"]/
          );
          if (!metaBlockMatch || metaBlockMatch[1] !== id) {
            errors.push(
              `[UI NAMING VIOLATION] ${sourcePath} must export SURFACE_META with id '${id}' (found '${metaBlockMatch?.[1] || 'missing'}') to match 1:1 filename '${expectedComponent}.tsx'.`
            );
          }
        }
      } else if (registryContent && !registryContent.includes(`<${expectedComponent}`)) {
        errors.push(
          `[UI NAMING VIOLATION] src/ui-core/panels/floatingWindowRegistry.tsx does not render expected 1:1 component <${expectedComponent}> for preset '${id}'.`
        );
      }
    }
  }
}

export function detectCircularDependencies(
  importGraph: Map<string, string[]>,
  errors: string[]
): void {
  const visitState = new Map<string, number>();
  const cycles: string[][] = [];

  function dfs(node: string, stack: string[]): void {
    visitState.set(node, 1);
    const neighbors = importGraph.get(node) || [];
    for (const next of neighbors) {
      if (!importGraph.has(next)) continue;
      const state = visitState.get(next) || 0;
      if (state === 1) {
        const idx = stack.indexOf(next);
        cycles.push([...stack.slice(idx), next]);
      } else if (state === 0) {
        dfs(next, [...stack, next]);
      }
    }
    visitState.set(node, 2);
  }

  for (const node of importGraph.keys()) {
    if ((visitState.get(node) || 0) === 0) {
      dfs(node, [node]);
    }
  }

  for (const cycle of cycles) {
    errors.push(`[CIRCULAR DEPENDENCY] ${cycle.join(' -> ')}`);
  }
}

export function checkRootConfigAndWasmParity(errors: string[]): void {
  const forbiddenLegacyFiles = [
    'tsconfig.engine-check.json',
    'vite.config.js',
    'scripts/radar.mjs',
  ];
  for (const legacyRel of forbiddenLegacyFiles) {
    if (fs.existsSync(path.join(ROOT_DIR, legacyRel))) {
      errors.push(
        `[LEGACY CONFIG VIOLATION] ${legacyRel} must be removed in the Pure-TS architecture.`
      );
    }
  }

  const forbiddenLockfiles = ['package-lock.json', 'yarn.lock', 'bun.lockb', 'bun.lock'].filter(
    (lf) => fs.existsSync(path.join(ROOT_DIR, lf))
  );
  if (forbiddenLockfiles.length > 0) {
    errors.push(
      `[LOCKFILE HYGIENE VIOLATION] Non-pnpm lockfile(s) detected in repository root: ${forbiddenLockfiles.join(', ')}. Use pnpm and maintain pnpm-lock.yaml only.`
    );
  }
  if (!fs.existsSync(path.join(ROOT_DIR, 'pnpm-lock.yaml'))) {
    errors.push(
      '[LOCKFILE HYGIENE VIOLATION] Missing pnpm-lock.yaml in repository root. Maintain canonical pnpm lockfile hygiene.'
    );
  }

  try {
    const tsconfigRaw = fs.readFileSync(path.join(ROOT_DIR, 'tsconfig.json'), 'utf8');
    if (/"allowJs"\s*:\s*true/.test(tsconfigRaw)) {
      errors.push(
        '[TSCONFIG VIOLATION] tsconfig.json must keep "allowJs": false now that 100% of source files are TypeScript and core.d.ts is present.'
      );
    }
  } catch {
    errors.push('[TSCONFIG VIOLATION] Unable to read tsconfig.json.');
  }
}
