# Global instructions

- Run `pnpm run format` and `pnpm run check` before committing.
- Use `pnpm run radar:audit` (`--audit` or `--audit=<path>`) to inspect structural coupling, host penetration, and pass-through proxies.
- Do not edit generated `src/physics/core.js` or `src/physics/core.wasm`.
- Do not modify `src/ui-core/AGENTS.md` without asking first.
- Keep real signaling endpoints and credentials in untracked `.cache/resolvedProfile.json` or `.rctbnspib`.
- Limit the amount of comments you put in the code to a strict minimum. You should almost never add comments, except sometimes on non-trivial code, function definitions if the arguments aren't self-explanatory, and class definitions and their members.
- Do not remove existing comments unless they are directly related to what you are changing.

## Referring to code in bugs, reviews and commit messages
- **Reference a name, not a position.** This text outlives the code it describes, so cite a selector, function, class, pref or flag name; name a file without a line, and avoid positional phrasing ("the rule above X").

## Code Style & Naming
- Do not use emoji anywhere in the repository.
- Write all code, UI strings, comments, logs, docs, and commit messages strictly in English.
- Never use `soccer` or `soccar` (or compound variants); always use neutral `ball`, `carball`, or `arena` terminology.
- Use clear, self-explanatory identifiers; avoid single-letter or opaque abbreviations except for standard math and graphics conventions.
- Treat every commit as standalone: keep zero backward-compatibility shims, dead code, or re-export barrel files (`index.ts` facades).

