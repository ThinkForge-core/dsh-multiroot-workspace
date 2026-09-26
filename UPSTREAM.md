# ui-workspace source fork

Rebased on **DeepSeek Harness `0.1.7-rc.2`** (tag `dsh-v0.1.7-rc.2`):

- Package: `@deepseek-ai/dsh-client-ui-workspace@0.1.7-rc.2`
- Source directory: `packages/client/ui-workspace/src` (copied 1:1 into `src/`)
- Upstream layout of that version: `src/client/{index,navigation,stores,tree,pin-order,shortcuts,locales}.ts`,
  `src/client/WorkspacePicker.{tsx,module.css}`, `src/client/contract/slots.ts`,
  `src/client/rows/{AnimatedRows.tsx,AnimatedRows.module.css,Rows.tsx,Rows.module.css,WorkspaceBrowser.tsx,WorkspaceBrowser.module.css}`,
  and `src/client/session-actions/{ArchiveSession,ForkSession,PinSession,RenameSession,RowActionToast}.tsx`
  with `derived.ts`. `subagent-lineage.ts` was an upstream file only before this version and no longer exists.
- Upstream copy is pristine; `diff` against the checkout's sources shows only the deviations below.

Permitted deviations (additive feature layer `src/client/multiroot/` + integration):

- `src/client/rows/WorkspaceBrowser.tsx` — multiroot record loading/join (`useMultirootRecords`,
  `joinMultiroot`), a dedicated branch icon-button in the header that opens the create dialog
  directly, manage-row wiring, an error banner, and the `MultirootDialog` mount.
- `src/client/rows/Rows.tsx` + `Rows.module.css` — logical-title rows with the
  `{count} roots · primary {alias}` meta line, taller multiroot rows, the `Manage` row-menu action,
  and the `data-session-id` / `data-session-blank` identity attributes on every Session row.
- `src/client/locales.ts` — added `multiroot.*` keys (zh/en) only.
- `src/client/rows/WorkspaceBrowser.module.css` — `.multirootError` and a wider header-actions
  budget for the extra icon.
- New `src/client/multiroot/{types,api,join,Dialogs}.ts*` feature files (fetch the
  `/plugins/multiroot/api` Host API).
- `src/client/tree.ts` — the Session Controller types are imported with `import type {...}` instead of
  the upstream inline `import { type X, ... }` form, which the bundler lowers to a side-effect import
  and inlines that package's self-registering client bundle. The CHANGELOG records the duplicate-factory
  regression this prevents; it is the one deliberate source deviation that is not part of the feature layer.

No vendored client primitives, store runtime, or subagent helper remain: the client consumes the
`0.1.7-rc.2` platform rows (`react`, `react/jsx-runtime`, `@deepseek-ai/cordis`,
`@deepseek-ai/dsh-client-store`, `@deepseek-ai/dsh-client-ui-slots`,
`@deepseek-ai/dsh-client-ui-primitives`) exactly like the stock package does. The bundled client half
requires exactly those rows and inlines everything else (`clsx`, `simple-icons`, the
`dsh-util-workspace-path`, `dsh-util-values`, `dsh-jobs`, `dsh-subagent` and `dsh-api-*` layers),
matching the stock build's `PLATFORM_MODULES`-only externals policy. `PRELOADED_CLIENT_EXTERNALS` is
empty in `0.1.7-rc.2`, so there is no `/client` preload specifier to request.

The full upstream MIT notice is preserved in `LICENSES/DeepSeek-Harness-MIT.txt` and included in
the published package.

## Test harness notes

Published-artifact gaps in `0.1.7-rc.2` shape the test setup; all are harness-only and do not
affect the shipped bundle.

- `@deepseek-ai/dsh-client-test-runtime@0.1.7-rc.2` imports
  `@deepseek-ai/dsh-client-ui-renderer/src/client/{bind.ts,scoped-slots.tsx}` and
  `@deepseek-ai/dsh-api-session-controller/src/client/scope.ts` by repo-relative source path, while
  those packages publish only `lib/`. `tests/vendor/ui-renderer/` (with the `bindings.tsx` and
  `errors.ts` the aliased modules reach) and `tests/vendor/api-session-controller/scope.ts` carry the
  same files, copied verbatim from the same tag, and `vitest.config.mjs` aliases the three specifiers
  onto that copy.
- jsdom defines no `ResizeObserver`, and the `0.1.7-rc.2` `dsh-client-ui-primitives` tooltip/marquee
  fit path constructs one, so a jsdom spec that renders those primitives dies with
  `ReferenceError: ResizeObserver is not defined`. The monorepo installs a stub through its root
  vitest `setupFiles` list; `tests/vendor/test-dom-environment.ts` is that file and
  `vitest.config.mjs` lists it under `setupFiles`.
- The published `@deepseek-ai/dsh-client-*` bundles declare no third-party dependencies, so the test
  harness pins the versions the monorepo resolves: `simple-icons`, `diff`, `zustand`, `immer`,
  `use-sync-external-store`, `shiki`, `@shikijs/langs`, `anser`, `katex`, `js-yaml`, `mime-types`,
  `ws`, and the `micromark-*` / `mdast-util-*` markdown stack.
- `tests/client/common-locale.ts` carries the common-namespace `zh`/`en` dictionaries the specs need,
  because the deep monorepo import (`@deepseek-ai/dsh-client-locale/src/locales/zh.ts`) resolves to
  nothing outside the checkout even though the package declares `./src/*`.
- `pnpm-workspace.yaml` exempts the resolved `@deepseek-ai/*@0.1.7-rc.2` set from pnpm's default
  24-hour `minimumReleaseAge` policy. A pre-release Harness build is published moments before a
  rebase consumes it, so a plain `pnpm install` refuses those entries until they age out; the
  exemption names each package and leaves the policy itself on.

`vitest.config.mjs` also converts every `lib/client.js` closure-factory artifact — `dsh-client-*`
and `dsh-api-*` alike — into ESM for the test graph, and inlines all `@deepseek-ai/*` packages so
those factories pass through Vite.

## Verification

Verified on 2026-09-24 against Harness `0.1.7-rc.2` on Android/Termux:

- `pnpm run typecheck`: 0 errors. `pnpm run test`: 20 files and 474 tests passed.
- Not yet run in this pass, because each packs or builds the package: `pnpm run test:client-bundle`,
  `pnpm run test:package-manifest`, `pnpm run test:reproducible-build`, `pnpm run test:profile-tools`,
  and the `pnpm run test:browser` matrix with `pnpm exec playwright install chromium`.

The server halves (`index.js`, `tools.js`) are byte-identical to `0.1.1-rc.2`; every Cordis service
and waterfall they consume (`storageDomain`, `workspaceRegistry`, `webServer`, `fs`, `shell`,
`tools`, `systemPrompt`, `sandboxPolicy`, `fs/write-intent`, `fs/edit-intent`, `fs/observed`,
`session/created`) still exists with the same signature in `0.1.7-rc.2`, and the host-side unit
suites (`tests/host`, `tests/tools`) pass unchanged against the new packages.

All clean-profile and browser checks use temporary `DSH_HOME` directories. No sibling Harness
checkout is imported, modified, or required by the shipped package.
