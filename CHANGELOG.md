# Changelog

All notable changes to this project are documented in this file.

## [Unreleased]

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
