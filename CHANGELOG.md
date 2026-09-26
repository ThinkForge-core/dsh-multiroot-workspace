# Changelog

All notable changes to this project are documented in this file.

## [Unreleased]

### Added

- Every session row now publishes a stable identity contract for DOM-augmenting extensions: `data-session-id` (the session id) and `data-session-blank` (`"true"`/`"false"`). A blank row renders a shared placeholder title (`session.new`) and hides its row menu, so a title-based lookup cannot tell two never-started sessions apart and no menu exists to append to — the id lets an extension such as `dsh-session-cleaner` offer its own delete affordance on exactly those rows. Attributes only: no visual or behavioural change.
- `scripts/check-client-bundle.mjs` is the build-time half of the guard and now runs as the last step of `npm run build`: it reads the built bytes and refuses an artifact that does not register exactly one factory, for its own package. This is the check the regression below slipped past — typecheck, the declaration gates and a single-slot loader stub were all green while `dsh web` refused to start.
- `tests/integration/client-bundle.spec.mjs` now keeps **every** `window.__ModuleLoader__.load` handoff instead of only the last one (which is why the inlined second factory stayed invisible), asserts a single registration before and after the factory materializes — where the real loader dies — and runs the build guard against a deliberately broken bundle to prove it can reject one.
- The guard script ships in the package (`files`), so the published manifest's `build`/`prepare` scripts never reference a missing file.

### Fixed

- `tools.js` called `ctx.shell.run(...)`, a Host method the `0.1.7-rc.2` `shell` service no longer serves (it exposes `resolve()` plus `execute()` → `ShellExecution.result()`), so `ws_bash`, `ws_glob` and `ws_grep` failed on every invocation with `Error: ctx.shell.run is not a function` while the rest of the row served normally — the three tools were dead, not the plugin. All three call sites now use the `execute()`/`result()` pair and translate a resolved `aborted` outcome into an abort, mirroring `tool-bash`; `tests/tools/tools.spec.ts` queues fake executions behind the new `ctx.shell.execute` double.
- `src/client/tree.ts` imported the Session Controller types with an inline-specifier form (`import { type A, type B } from '...'`), which the bundler lowered to a side-effect import of `@deepseek-ai/dsh-api-session-controller/client` and inlined that package's own self-registering client bundle. At runtime the module table then saw `@deepseek-ai/dsh-api-session-controller` register twice and refused to boot with `client-modules: duplicate factory registration ... (bundle executed twice without invalidate?)`. Switching the declaration to `import type { ... }` drops it from the graph; the bundle now registers only `dsh-multiroot-workspace` (286 kB → 147 kB) while keeping the same five platform rows.

## [0.1.7-rc.2] - 2026-09-24

### Changed

- Rebased the browser client onto the stock ui-workspace source of **DeepSeek Harness `0.1.7-rc.2`**. That version added `pin-order.ts`, `shortcuts.ts`, `rows/AnimatedRows.*`, and `session-actions/*`, dropped `subagent-lineage.ts`, and replaced the removed `useSessionPendingInteraction` global standard prop with `useSessionStatus`, whose snapshot values are `SessionStatus` records (`{ running, pendingInteraction, completionUnread }`) rather than bare pending interactions. The multiroot feature layer (`src/client/multiroot/`) and its six integration points were re-applied on top: the logical title and the `{count} roots · primary {alias}` meta line in `ProjectRowItem`, the `Manage` row-menu action, the header add button, the error banner, the manage wiring, and the `MultirootDialog` mount.
- The `tests/client/upstream/` port was replaced with the `0.1.7-rc.2` ui-workspace specs, including the new `animated-rows`, `session-actions`, and `shortcuts` suites. Every spec that imports a monorepo-relative source path is aliased or vendored; see [UPSTREAM.md](./UPSTREAM.md) § Test harness notes.
- Peer/dev manifest and the loader `dsh.client.inject` list now name the `0.1.7-rc.2` packages, including the new `@deepseek-ai/dsh-agent`, `dsh-client-shortcuts`, `dsh-jobs`, `dsh-subagent`, and `dsh-util-values` edges, and `engines.dsh` declares `^0.1.7-rc.2` for the market's host-compatibility check.

### Unchanged

- Server halves (`index.js`, `tools.js`) and `cordis.patch.yml` are untouched by the rebase; the Host services they consume (`storageDomain`, `workspaceRegistry`, `webServer`, `fs`, `shell`, `tools`, `systemPrompt`, `sandboxPolicy`) keep the same signatures in `0.1.7-rc.2`, and the host-side unit suites (`tests/host`, `tests/tools`) pass unchanged. **Corrected in Unreleased:** the `shell` entry was wrong — `ctx.shell.run()` was replaced by `resolve()`/`execute()` in `0.1.7-rc.2` (see Fixes).

## [0.1.5-rc.2] - 2026-09-12

### Changed

- Rebased the browser client onto the stock ui-workspace source of **DeepSeek Harness `0.1.5-rc.2`**, which moved the browsing region to `src/client/rows/WorkspaceBrowser.*` and added the `navigation.ts` / `subagent-lineage.ts` modules; the multiroot feature layer (`src/client/multiroot/`) and its four integration points were re-applied on top unchanged in behavior.
- Followed the core's API reshuffle: `@deepseek-ai/dsh-client-runtime` is gone, so the client now reads Sessions and Workspaces through `@deepseek-ai/dsh-api-session-controller/client` and `@deepseek-ai/dsh-api-workspace-controller/client` and its store runtime through the `@deepseek-ai/dsh-client-store` platform row.
- Browser externals are exactly the `0.1.5-rc.2` `PLATFORM_MODULES` seed words (`react`, `react/jsx-runtime`, `react-dom`, `react-dom/client`, `@deepseek-ai/cordis`, `@deepseek-ai/dsh-client-store`, `@deepseek-ai/dsh-client-ui-slots`, `@deepseek-ai/dsh-client-ui-primitives`, `@deepseek-ai/dsh-client-ui-dockkit`); the former preloaded `@deepseek-ai/dsh-client-runtime/client` row no longer exists. The bundle requires only the five rows it actually uses.
- Peer/dev manifest and the loader `dsh.client.inject` list now name the `0.1.5-rc.2` packages, and `engines.dsh` declares `^0.1.5-rc.2` for the market's host-compatibility check.
- Restored the test toolchain (`vitest`, `jsdom`, `@testing-library/react`, the `0.1.5-rc.2` `@deepseek-ai/dsh-client-test-runtime`) and ported the ui-workspace specs from the new tag, plus the client-bundle, packed-manifest, and release-doc gates.

### Unchanged

- Server halves (`index.js`, `tools.js`) and `cordis.patch.yml` are byte-identical to `0.1.1-rc.2`; the Host services they consume (`storageDomain`, `workspaceRegistry`, `webServer`, `fs`, `shell`, `tools`, `systemPrompt`, `sandboxPolicy`) are unchanged in `0.1.5-rc.2`.

## [0.1.1-rc.2] - 2026-09-06

### Changed

- Rebased the browser client onto the stock ui-workspace source of **DeepSeek Harness `0.1.1-rc.2`** (this machine runtime), instead of the interim `0.1.2-rc.1` layout that cannot activate there.
- Multiroot creation is again a dedicated branch-glyph icon button in the sidebar Workspace header (as in `0.1.0-rc.1`); the "Add multiroot workspace" entry that the narrow Termux work added to the ▾ view-options dropdown is gone. Rows backing a logical Workspace keep the "Manage" action in their row menu, and the create/manage dialog is unchanged.
- Peer/dev manifest and the loader `dsh.client.inject` list now match the `0.1.1-rc.2` runtime; browser externals are exactly the `0.1.1-rc.2` platform rows (`react`, `react/jsx-runtime`, `@deepseek-ai/cordis`, `dsh-client-ui-slots`, `dsh-client-ui-primitives`) plus the preloaded `@deepseek-ai/dsh-client-runtime/client`. No vendored copies remain.

### Unchanged

- Server halves (`index.js`, `tools.js`) and `cordis.patch.yml` are byte-identical to `0.1.0-rc.1` and keep working on `0.1.1-rc.2`.

## [0.1.0-rc.1] - 2026-08-15

### Added

- Logical Workspaces with multiple named filesystem roots, one selected primary root, and stock grouped/flat Session views.
- `ws_list`, `ws_cd`, `ws_read`, `ws_write`, `ws_edit`, `ws_glob`, `ws_grep`, and policy-controlled `ws_bash` tools.
- Plugin-owned per-Session current-root durability, canonical root confinement, storage purge, and adopted-versus-owned shadow handling.
- Self-contained deterministic browser client, packed-profile/tool smoke tests, and a full light/dark browser acceptance matrix.

### Compatibility

- Supports DeepSeek Harness `0.1.0-rc.6` on macOS and Linux.
- Windows is not supported in this prerelease because filesystem search, shell execution, and common-ancestor fencing follow POSIX behavior.
