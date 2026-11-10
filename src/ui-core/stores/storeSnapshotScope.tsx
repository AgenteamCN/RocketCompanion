import React, { createContext, useContext, useMemo, useRef } from 'react';
import type { StandardSurfaceProps } from '../manifest/surfaceMetaTypes';

export type { StandardSurfaceProps };

export type StoreSnapshotOverridesMap = Record<string, Record<string, unknown>>;

const StoreSnapshotContext = createContext<StoreSnapshotOverridesMap | null>(null);

export interface StoreSnapshotScopeProps {
  /**
   * Keyed by logical store identifier (e.g. `'appStore'`, `'onlineRoomStore'`, `'garageStore'`).
   * Nested scopes merge cleanly with parent scope overrides.
   */
  overrides: StoreSnapshotOverridesMap;
  children: React.ReactNode;
}

/**
 * Transparent Store Snapshot Scope (`<StoreSnapshotScope>`).
 *
 * - In RocketCompanion runtime: this provider is never mounted; `useScopedStore` and
 *   `createScopedStoreHook` execute the native Zustand hook directly with zero overhead.
 * - In RCUITuner runtime (single-stage state switcher or side-by-side Matrix Shootouts):
 *   wrapping any card in `<StoreSnapshotScope overrides={{ onlineRoomStore: SNAPSHOT }}>`
 *   shadows the target store slice locally for that subtree so 4-6 state variants can
 *   mount side-by-side simultaneously without mutating the global singleton store.
 */
export const StoreSnapshotScope: React.FC<StoreSnapshotScopeProps> = ({
  overrides,
  children,
}) => {
  const parentOverrides = useContext(StoreSnapshotContext);

  const mergedOverrides = useMemo<StoreSnapshotOverridesMap>(() => {
    if (!parentOverrides) return overrides;
    const next: StoreSnapshotOverridesMap = { ...parentOverrides };
    for (const [storeKey, patch] of Object.entries(overrides)) {
      next[storeKey] = {
        ...(parentOverrides[storeKey] ?? {}),
        ...patch,
      };
    }
    return next;
  }, [parentOverrides, overrides]);

  return (
    <StoreSnapshotContext.Provider value={mergedOverrides}>
      {children}
    </StoreSnapshotContext.Provider>
  );
};

/**
 * Returns the active snapshot override dictionary for `storeKey` if inside a `<StoreSnapshotScope>`,
 * or `undefined` in normal production runtime.
 */
export function useStoreSnapshotOverride<TState extends object = Record<string, unknown>>(
  storeKey: string
): Partial<TState> | undefined {
  const ctx = useContext(StoreSnapshotContext);
  if (!ctx) return undefined;
  return ctx[storeKey] as Partial<TState> | undefined;
}

export type ZustandStoreHookLike<TState extends object> = {
  (): TState;
  <TSlice>(selector: (state: TState) => TSlice): TSlice;
  getState: () => TState;
};

/**
 * Evaluates a Zustand selector against the scoped override merged with the live store state
 * when inside `<StoreSnapshotScope>`, or directly invokes `useStoreHook(selector)` when un-scoped.
 * Caches the merged state and selected slice by `(liveState, scopedPatch, selector)` to guarantee
 * referential stability for React 19 `useSyncExternalStore`.
 */
export function useScopedStore<TState extends object, TSlice = TState>(
  storeKey: string,
  useStoreHook: ZustandStoreHookLike<TState>,
  selector?: (state: TState) => TSlice
): TSlice {
  const scopedPatch = useStoreSnapshotOverride<TState>(storeKey);
  const cacheRef = useRef<{
    liveState?: TState;
    scopedPatch?: Partial<TState>;
    selector?: ((state: TState) => TSlice) | undefined;
    effectiveState?: TState;
    hasSlice?: boolean;
    slice?: TSlice;
  }>({});

  return useStoreHook((liveState: TState) => {
    const cache = cacheRef.current;
    let effectiveState = liveState;
    if (scopedPatch) {
      if (
        cache.liveState === liveState &&
        cache.scopedPatch === scopedPatch &&
        cache.effectiveState
      ) {
        effectiveState = cache.effectiveState;
      } else {
        effectiveState = {
          ...liveState,
          ...scopedPatch,
        } as TState;
      }
    }

    if (
      cache.hasSlice &&
      cache.liveState === liveState &&
      cache.scopedPatch === scopedPatch &&
      cache.selector === selector
    ) {
      return cache.slice as TSlice;
    }

    const nextSlice = selector
      ? selector(effectiveState)
      : (effectiveState as unknown as TSlice);
    cache.liveState = liveState;
    cache.scopedPatch = scopedPatch;
    cache.selector = selector;
    cache.effectiveState = effectiveState;
    cache.hasSlice = true;
    cache.slice = nextSlice;
    return nextSlice;
  });
}

/**
 * Wraps a Zustand `use*Store` hook so that any component calling `useStore(selector)` or `useStore()`
 * automatically respects `<StoreSnapshotScope overrides={{ [storeKey]: ... }}>` when mounted in RCUITuner,
 * while remaining 100% pass-through in RocketCompanion.
 */
export function createScopedStoreHook<
  TState extends object,
  TStoreHook extends ZustandStoreHookLike<TState> = ZustandStoreHookLike<TState>
>(storeKey: string, baseHook: TStoreHook): TStoreHook {
  const scopedHook = (<TSlice = TState>(
    selector?: (state: TState) => TSlice
  ): TSlice => {
    return useScopedStore<TState, TSlice>(storeKey, baseHook, selector);
  }) as TStoreHook;

  Object.assign(scopedHook, baseHook);
  return scopedHook;
}
