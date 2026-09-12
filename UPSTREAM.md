# ui-workspace source fork

Rebased on **DeepSeek Harness `0.1.1-rc.2`** (tag `dsh-v0.1.1-rc.2`, this machine runtime):

- Package: `@deepseek-ai/dsh-client-ui-workspace@0.1.1-rc.2`
- Source directory: `packages/client/ui-workspace/src` (copied 1:1 into `src/`)
- Upstream copy is pristine; `diff` against the runtime sources shows only the deviations below.

Permitted deviations (additive feature layer `src/client/multiroot/` + integration):

- `src/client/WorkspaceBrowser.tsx` — multiroot record loading/join (`useMultirootRecords`, `joinMultiroot`), a dedicated branch icon-button in the header that opens the create dialog directly, manage-row wiring, an error banner, and the `MultirootDialog` mount.
- `src/client/rows/Rows.tsx` + `Rows.module.css` — logical-title rows with the `{count} roots · primary {alias}` meta line, taller multiroot rows, and the `Manage` row-menu action.
- `src/client/locales.ts` — added `multiroot.*` keys (zh/en) only.
- `src/client/WorkspaceBrowser.module.css` — `.multirootError` and a wider header-actions budget for the extra icon.
- New `src/client/multiroot/{types,api,join,Dialogs}.ts*` feature files (fetch the `/plugins/multiroot/api` Host API).

No vendored client primitives, store runtime, or subagent helper remain: the client consumes the `0.1.1-rc.2` platform rows (`@deepseek-ai/dsh-client-ui-primitives`, `@deepseek-ai/dsh-client-ui-slots`, `@deepseek-ai/cordis`, `react`, `react/jsx-runtime`) and the preloaded `@deepseek-ai/dsh-client-runtime/client` exactly like the stock package does.
## Vendored client primitives

The reachable UI primitives were adapted from DeepSeek Harness commit `47f943859bef60e4160492346772ded9b24f765a`, from `packages/client/ui-primitives/src/{Button,HoverCard,Menu,Modal,StateDot,Tooltip}.{tsx,module.css}`. Their behavior and CSS are unchanged; imports were redirected to the local barrel at `src/client/vendor/primitives/index.ts`.

The local barrel exports only the primitive values and types used by this plugin: `Button`, `HoverCard`, `Menu`, `MenuEntry`, `Modal`, `StateDot`, `StateDotState`, and `Tooltip`. Its reduced `icons.tsx` contains only `IconArchiveOutline20`, `IconBranchOutline16`, `IconCloseFill14`, `IconEditOutline16`, `IconEllipsisOutline16`, `IconFolderClose16`, `IconFolderOpen16`, `IconPersonalizationOutline16`, `IconPlusOutline16`, `IconProjectAddOutline16`, `IconSearchOutline16`, `IconSettingsOutline16`, `IconTrashOutline16`, and `IconTriangleRightFill14`.

To avoid copying unrelated package modules, the reachable pointer-grace and clipboard helpers and the Menu/Modal-private check and close glyphs are retained inside their owning vendored components.

The full upstream MIT notice is preserved in `LICENSES/DeepSeek-Harness-MIT.txt` and included in the published package.

## Vendored client store runtime

The Workspace view store retains the upstream structural slot contract: `defineStore` returns a handle carrying its declaration and a scoped instance factory; instances expose snapshot reads, synchronous subscriptions, draft-stripped actions, and persisted-value cleanup. Actions clone before mutation, publish only after successful mutation, then persist whole-value JSON under the unchanged `dsh.workspace.view.v5` key (with an optional scope suffix). Malformed persisted JSON and localStorage read, write, or removal failures fall back without breaking the live store.

The local runtime intentionally omits the upstream generic Zustand, Immer, selector, animation-frame batching, shallow-equality, and arbitrary snapshot-store middleware because this plugin consumes only the JSON-compatible Workspace view store contract.

## Vendored subagent lineage helper

`src/client/vendor/subagents.ts` copies `indexSubagentDescendants` and its `SubagentDescendantSummary` result type from DeepSeek Harness commit `47f943859bef60e4160492346772ded9b24f765a`, source path `packages/client/runtime/src/client/sessions/subagent-lineage.ts`. The implementation is unchanged; its type-only imports use the public `@deepseek-ai/dsh-client-runtime/client` entry, and `src/client/upstream/tree.ts` imports the runtime value from this local module so the browser bundle has no DSH runtime JavaScript dependency.

## Verification

Verified on 2026-08-15 against Harness `0.1.0-rc.6`; the copied source remains pinned to commit `47f943859bef60e4160492346772ded9b24f765a`:

- Node.js `24.11.1` and pnpm `11.9.0`: frozen installation completed from this repository's own workspace and lockfile.
- `pnpm run test`: 17 files and 217 tests passed; `pnpm run typecheck` passed.
- Consecutive builds produced identical `client.js` and `dist/index.cjs` bytes with SHA-256 `b6171a42bce82ba0ece154d710ca3b54835e78a5745a9c2be14b0afc0cda9116`; neither artifact contains an absolute checkout path.
- The packed client executes through the rc.6 module-loader handoff and requires only Host-provided `react`, `react-dom`, and `react/jsx-runtime`.
- A fresh temporary rc.6 Web profile installed the tarball, loaded both bundle rows, executed packed `ws_write`/`ws_read` through the real ToolRuntime and LocalFileSystem, and required no model API key.
- The autonomous Playwright matrix passed in light and dark themes across wide and rail layouts, creation, management, stock Session behavior, Hero selection, deletion, diagnostics, and cleanup. Two consecutive runs produced identical 10/10 screenshot hashes after display-only temporary-path normalization.

All clean-profile and browser checks use temporary `DSH_HOME` directories. The sibling DeepSeek Harness checkout is not imported, modified, or required.
