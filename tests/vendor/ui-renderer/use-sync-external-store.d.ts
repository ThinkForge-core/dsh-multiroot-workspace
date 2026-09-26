/**
 * Local typings for use-sync-external-store 1.2.0: the package ships no types
 * and the DefinitelyTyped package is unavailable offline. Mirrors the shim's
 * with-selector build (the only entry the vendored renderer modules consume).
 *
 * Copied from DeepSeek Harness 0.1.7-rc.2,
 * `packages/client/ui-renderer/src/client/use-sync-external-store.d.ts`, with
 * the extensionless specifier added: `tests/vendor/ui-renderer/bind.ts` imports
 * `use-sync-external-store/shim/with-selector` exactly as the upstream source
 * does, and only this harness resolves it without the monorepo's `allowJs`
 * node_modules descent.
 */
/**
 * Local typings for use-sync-external-store 1.2.0: the package ships no types
 * and the DefinitelyTyped package is unavailable offline. Mirrors the shim's
 * with-selector build (the only entry this package consumes).
 */
declare module 'use-sync-external-store/shim/with-selector.js' {
  export function useSyncExternalStoreWithSelector<Snapshot, Selection>(
    subscribe: (onStoreChange: () => void) => () => void,
    getSnapshot: () => Snapshot,
    getServerSnapshot: undefined | null | (() => Snapshot),
    selector: (snapshot: Snapshot) => Selection,
    isEqual?: (a: Selection, b: Selection) => boolean,
  ): Selection
}

/** The extensionless specifier `bind.ts` imports; see the header above. */
declare module 'use-sync-external-store/shim/with-selector' {
  export function useSyncExternalStoreWithSelector<Snapshot, Selection>(
    subscribe: (onStoreChange: () => void) => () => void,
    getSnapshot: () => Snapshot,
    getServerSnapshot: undefined | null | (() => Snapshot),
    selector: (snapshot: Snapshot) => Selection,
    isEqual?: (a: Selection, b: Selection) => boolean,
  ): Selection
}
