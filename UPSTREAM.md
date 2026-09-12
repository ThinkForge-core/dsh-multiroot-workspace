# ui-workspace source fork

Rebased on **DeepSeek Harness `0.1.5-rc.2`** (tag `dsh-v0.1.5-rc.2`):

- Package: `@deepseek-ai/dsh-client-ui-workspace@0.1.5-rc.2`
- Source directory: `packages/client/ui-workspace/src` (copied 1:1 into `src/`)
- Upstream layout of that version: `src/client/{index,navigation,stores,tree,subagent-lineage,locales}.ts`,
  `src/client/WorkspacePicker.{tsx,module.css}`, `src/client/contract/slots.ts`, and
  `src/client/rows/{Rows.tsx,Rows.module.css,WorkspaceBrowser.tsx,WorkspaceBrowser.module.css}`.
- Upstream copy is pristine; `diff` against the checkout's sources shows only the deviations below.

Permitted deviations (additive feature layer `src/client/multiroot/` + integration):

- `src/client/rows/WorkspaceBrowser.tsx` — multiroot record loading/join (`useMultirootRecords`,
  `joinMultiroot`), a dedicated branch icon-button in the header that opens the create dialog
  directly, manage-row wiring, an error banner, and the `MultirootDialog` mount.
- `src/client/rows/Rows.tsx` + `Rows.module.css` — logical-title rows with the
  `{count} roots · primary {alias}` meta line, taller multiroot rows, and the `Manage` row-menu
  action.
- `src/client/locales.ts` — added `multiroot.*` keys (zh/en) only.
- `src/client/rows/WorkspaceBrowser.module.css` — `.multirootError` and a wider header-actions
  budget for the extra icon.
- New `src/client/multiroot/{types,api,join,Dialogs}.ts*` feature files (fetch the
  `/plugins/multiroot/api` Host API).

No vendored client primitives, store runtime, or subagent helper remain: the client consumes the
`0.1.5-rc.2` platform rows (`react`, `react/jsx-runtime`, `@deepseek-ai/cordis`,
`@deepseek-ai/dsh-client-store`, `@deepseek-ai/dsh-client-ui-slots`,
`@deepseek-ai/dsh-client-ui-primitives`) exactly like the stock package does. `subagent-lineage.ts`
is an upstream file in this version; the `dsh-client-store` platform row replaces the previously
vendored Workspace view store runtime, and the removed `@deepseek-ai/dsh-client-runtime` package is
gone from both the manifest and the bundle.

The bundled client half requires exactly the module-table rows it uses — `react`,
`react/jsx-runtime`, `@deepseek-ai/cordis`, `@deepseek-ai/dsh-client-store`, and
`@deepseek-ai/dsh-client-ui-primitives` — and inlines everything else (`clsx`, the
`dsh-util-workspace-path` and `dsh-api-*` wire layers), matching the stock build's
`PLATFORM_MODULES`-only externals policy. `PRELOADED_CLIENT_EXTERNALS` is empty in `0.1.5-rc.2`, so
there is no `/client` preload specifier to request.

The full upstream MIT notice is preserved in `LICENSES/DeepSeek-Harness-MIT.txt` and included in
the published package.

## Test harness notes

Two published-artifact gaps in `0.1.5-rc.2` shape the test setup; both are harness-only and do not
affect the shipped bundle.

- `@deepseek-ai/dsh-client-test-runtime@0.1.5-rc.2` imports
  `@deepseek-ai/dsh-client-ui-renderer/src/client/{bind.ts,scoped-slots.tsx}` by repo-relative source
  path, and the published renderer package ships only `lib/`. `tests/vendor/ui-renderer/` carries
  those files (plus the `bindings.tsx` they import and the ambient typings for their
  `use-sync-external-store` shim), copied verbatim from the same tag, and `vitest.config.mjs` aliases
  the two specifiers onto that copy.
- The published `@deepseek-ai/dsh-client-*` bundles declare no third-party dependencies, so the
  test harness pins the versions the monorepo resolves: `zustand`, `immer`, `use-sync-external-store`,
  `shiki`, `@shikijs/langs`, `anser`, `katex`, `js-yaml`, `mime-types`, `ws`, and the
  `micromark-*` / `mdast-util-*` markdown stack.

`vitest.config.mjs` also converts every `lib/client.js` closure-factory artifact — `dsh-client-*`
and `dsh-api-*` alike — into ESM for the test graph, and inlines all `@deepseek-ai/*` packages so
those factories pass through Vite.

## Verification

Verified on 2026-09-12 against Harness `0.1.5-rc.2` on Linux:

- `pnpm run typecheck`: 0 errors. `pnpm run test`: 18 files and 250 tests passed.
- `pnpm run test:client-bundle`, `pnpm run test:package-manifest`,
  `pnpm run test:release-docs`, `pnpm run test:workflow-policy`, and
  `pnpm run test:reproducible-build` passed.
- Consecutive builds produce identical `client.js` and `dist/index.cjs` bytes, containing no absolute
  checkout path, and the packed client executes through the `0.1.5-rc.2` module-loader handoff
  requiring only the platform rows listed above.
- The browser matrix (`pnpm run test:browser`) was brought in line with `0.1.5-rc.2` — the fixture
  now installs `@deepseek-ai/dsh@0.1.5-rc.2`, passes `--no-open`, and reads the authenticated
  `?token=` startup URL — but has **not** been re-run end to end here: that gate needs pnpm `11.9.0`
  and a Playwright browser download, neither of which this machine provides.

The server halves (`index.js`, `tools.js`) are byte-identical to `0.1.1-rc.2`; every Cordis service
and waterfall they consume (`storageDomain`, `workspaceRegistry`, `webServer`, `fs`, `shell`,
`tools`, `systemPrompt`, `sandboxPolicy`, `fs/write-intent`, `fs/edit-intent`, `fs/observed`,
`session/created`) still exists with the same signature in `0.1.5-rc.2`, and the host-side unit
suites (`tests/host`, `tests/tools`) pass unchanged against the new packages.

All clean-profile and browser checks use temporary `DSH_HOME` directories. No sibling Harness
checkout is imported, modified, or required by the shipped package.
