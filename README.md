# dsh-multiroot-workspace
<img width="682" height="608" alt="image" src="https://github.com/user-attachments/assets/4decf92e-c251-438d-bbd6-c143d66e84a2" />

<img width="2988" height="1700" alt="image" src="https://github.com/user-attachments/assets/99d65459-236b-4269-8f6f-87b2b525d8dc" />
<img width="3021" height="2205" alt="image" src="https://github.com/user-attachments/assets/0d6cc943-629b-47ac-beed-0e3859e0cff8" />


External DeepSeek Harness bundle providing logical Workspaces with multiple named filesystem roots. It replaces the stock Workspace UI only while installed, using a source fork pinned in [UPSTREAM.md](./UPSTREAM.md); it does not modify Harness repository files.

## Prerequisites

This build targets DeepSeek Harness **`0.1.7-rc.2`** on macOS, Linux, and Android/Termux: the browser client is rebased on that version's stock `@deepseek-ai/dsh-client-ui-workspace` source (see [UPSTREAM.md](./UPSTREAM.md)). Harness supplies Cordis, DSH client/Host services, Schemastery, React, and ReactDOM when it loads the plugin; install through a Harness profile instead of installing peers into the plugin package.

## Install and start

From any DeepSeek Harness installation (this machine: runtime `0.1.7-rc.2`):

```sh
cd ~/.dsh/profiles/web
dsh plugin --profile web add /путь/к/dsh-multiroot-workspace-0.1.7-rc.2.tgz
# перезапустить dsh web; откат:
dsh plugin --profile web remove dsh-multiroot-workspace
```

Then start the Web UI with `dsh web` and open `http://127.0.0.1:3080/`. The plugin disables only the stock Workspace client row while installed; Sessions, their ordinary Host Workspace membership, and all non-Workspace UI remain owned by Harness.

The bundled configuration keeps cross-root Bash disabled:

```yaml
- id: multiroot-workspace-tools
  config:
    crossRootBash: off
```

To deliberately choose `ancestor` or `unfenced`, put that row in a local patch and start Web with `--patch <file>`. The security differences are described under “Model tools and permissions” below.

The Host row also accepts one deployment-declared logical Workspace:

```yaml
- id: multiroot-workspace
  config:
    title: Product repository
    roots:
      - alias: app
        path: /srv/product/app
        primary: true
      - alias: docs
        path: /srv/product/docs
        primary: false
```

`roots` must be non-empty, aliases are unique case-insensitively, and exactly one root must set `primary: true`. This row becomes the read-only logical Workspace `config-roots`: it cannot be renamed, edited, reprioritized, or deleted through the UI/API. Paths may be absent during startup so deployments can mount them later; file and shell operations still require the selected path to exist when used. Purge clears its Session selections and shadow mapping but preserves the declared record and any adopted Host Workspace. Startup reapplies the configuration; a later new Session whose cwd matches the primary root creates or adopts a Host shadow and attaches that Session.

## Development

```sh
pnpm install --frozen-lockfile
pnpm run test
pnpm run typecheck
pnpm run build
pnpm exec playwright install chromium
pnpm run test:browser
```

The browser check packs the current plugin, creates an isolated temporary DSH home, installs it through the exact public `@deepseek-ai/dsh@0.1.7-rc.2` CLI, and starts Web on a random loopback port. It exercises the public UI with stable fixture titles, aliases, and path suffixes, then stops the server and removes the temporary profile and directories in `finally`; no sibling Harness checkout or manually managed `DSH_WEB_URL` is used.

The unit suite runs against the published `0.1.7-rc.2` packages. Four published-artifact gaps shape that setup: the released `@deepseek-ai/dsh-client-test-runtime` imports renderer and session-controller modules by repo-relative source path (vendored under `tests/vendor/ui-renderer/` and `tests/vendor/api-session-controller/`, aliased in `vitest.config.mjs`); jsdom defines no `ResizeObserver`, which the released primitives' tooltip/marquee fit path constructs (the monorepo's stub is vendored as `tests/vendor/test-dom-environment.ts` and listed under `setupFiles`); the released `@deepseek-ai/dsh-client-*` bundles declare no third-party dependencies (pinned in `devDependencies`); and the common-namespace locale dictionaries they expect must be carried locally as `tests/client/common-locale.ts`, because a deep `.../locale/src/locales/*.ts` import resolves to nothing outside a Harness checkout. All four are documented in [UPSTREAM.md](./UPSTREAM.md) § Test harness notes; none affects the shipped package.

`pnpm run build` ends with `scripts/check-client-bundle.mjs`, which reads the built `client.js` and refuses an artifact that does not register exactly one module-table factory, for this package. A browser bundle is loaded as one graph row: if the build inlines another self-registering client package — which a type-only import written as `import { type X } from '<pkg>/client'` causes, because the bundler lowers it to a side-effect import — the loader sees that package register twice and `dsh web` stops with `client-modules: duplicate factory registration`. Typecheck and the declaration gates cannot see this, so the built bytes are checked directly; `tests/integration/client-bundle.spec.mjs` keeps every `window.__ModuleLoader__.load` handoff (not just the last one) and runs the same guard against a deliberately broken bundle.

The check writes ten review screenshots under `tests/browser/screenshots/`: light and dark variants of the wide sidebar, rail, create dialog, manage dialog, and Hero picker. Runtime directories remain exclusive temporary paths, while their visible screenshot text is normalized to a stable display prefix. These generated PNGs are local review artifacts and are intentionally not staged with release commits; the directory itself is retained by `.gitkeep`.

Pull requests and `main` run the same Node.js 24.11.1 / pnpm 11.9.0 release gate in GitHub Actions, including packed-profile, deterministic-build, client-bundle, and browser checks. A `v<package-version>` tag may publish the `next` dist-tag only after that reusable gate passes. Publication uses npm Trusted Publishing through `.github/workflows/release.yml` with GitHub OIDC; no long-lived npm token is used.

The Host API is served under `/plugins/multiroot/api`. Creating a logical Workspace immediately creates or adopts its primary Host Workspace and returns `shadowWorkspaceId`. The browser joins logical metadata by that id and leaves the stock Workspace list authoritative for Session membership, search, grouping, ordering, and selection.

`ws_cd` stores the current-root selection as plugin-owned state keyed by Session id, so it survives plugin and Harness restarts without adding a custom Session event. A Session with no stored selection uses its logical Workspace's primary root. Deleting or purging that logical Workspace clears its selections. Forked Sessions do not inherit the source Session's selection and therefore begin on the primary root.

The selection table is additive within storage-domain version 4. Harness `0.1.7-rc.2` has no domain migration API and rejects a changed version stamp, while its supported backends safely materialize a newly declared table at the existing version; this preserves previously stored logical Workspaces.

## Model tools and permissions

Sessions opened in a logical Workspace receive these tools:

- `ws_list` lists aliases, canonical paths, and the primary/current markers.
- `ws_cd` changes the plugin-owned current alias for that Session.
- `ws_read`, `ws_write`, and `ws_edit` access a root-relative text file. The tools reject lexical traversal and canonical targets outside the selected root (including symlink escapes); reads are limited to 1 MiB. Mutations use the Harness read-before-write/version waterfalls and publish `fs/observed` events.
- `ws_glob` and `ws_grep` run ripgrep inside the selected root and cap output at 200 lines. Ripgrep exit 1 is an empty result; real command failures and cancellation are surfaced.
- `ws_bash` runs in one selected root by default and passes that exact root to the active sandbox policy. `workdir` cannot escape the selected root.

`crossRootBash` controls an explicit non-empty `roots` list. The default, `off`, rejects multiple roots. `ancestor` fences the process to their tightest common ancestor, which can expose sibling content below that ancestor. `unfenced` requests `danger-full-access` with no `workspaceRoot`; enable it only when the deployment deliberately accepts unrestricted host access. Unknown aliases are always rejected before a shell process starts.

## UI behavior

- **按工作区** shows ordinary and logical Workspace project rows. Logical rows add the root count and primary alias.
- **全部会话** is the stock flat view: it hides project rows and shows every visible Session once.
- The branch icon in the Workspace header opens multiroot creation. A logical Workspace row's existing action menu opens management.
- The management dialog shows complete directory names and paths in a two-column layout. When a Workspace has many roots, only the root list scrolls; the name field, add action, and footer remain fixed.
- Forms use Harness Modal, Button, icon, and theme primitives; no Unicode folder/archive icons are rendered.

## Storage, purge, and removal

Logical Workspace records, shadow ownership, and per-Session current-root selections live in the plugin's `multiroot_workspace` storage domain. An existing Host Workspace at the primary path is adopted; the plugin never deletes an adopted Workspace. If no suitable Workspace exists, the plugin creates and owns a shadow so stock Session grouping keeps working. Purge deletes owned shadows, user-created logical records, and all current-root selections while preserving adopted user Workspaces, Sessions, and the deployment-declared `config-roots` record.

With Web still running, purge plugin-owned data before removing the package:

```sh
curl -fsS -X DELETE http://127.0.0.1:3080/plugins/multiroot/api/data
# Stop the Web process, then remove the profile dependency.
dsh plugin --profile web remove dsh-multiroot-workspace
```

Removing without the purge request leaves the plugin's durable records for a later reinstall; it does not make the plugin delete them implicitly.
