/**
 * Vendored from DeepSeek Harness 0.1.7-rc.2, source path
 * `packages/client/ui-renderer/src/client/errors.ts`, MIT (see LICENSES/).
 *
 * Reached by the vendored `scoped-slots.tsx` from the same tag, so the alias
 * set in vitest.config.mjs stays closed over the renderer modules the test
 * runtime imports by repo-relative source path.
 */
/** Shared renderer failure categories. @module */

/** Renderer assembly failures that must escape component error boundaries. */
export class SlotAssemblyError extends Error {}
