import assert from 'node:assert/strict'
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import vm from 'node:vm'

const build = spawnSync('pnpm', ['run', 'build'], { cwd: new URL('../..', import.meta.url), stdio: 'inherit' })
assert.equal(build.status, 0, 'client build must succeed')

const injectedStyles = []
const document = {
  querySelector: () => null,
  createElement: tagName => ({ tagName, dataset: {}, textContent: '' }),
  head: { appendChild: tag => { injectedStyles.push(tag.textContent) } },
}
/**
 * EVERY registration is kept, not just the last one. A bundle that inlines
 * another self-registering client package calls the facade a second time — and
 * the real loader rejects that with "duplicate factory registration", while a
 * single-slot stub silently accepts it. That is exactly how the 0.1.5-rc.2
 * regression (an inlined `dsh-api-session-controller`) stayed invisible here.
 */
const registrations = []
const window = { __ModuleLoader__: { load: value => { registrations.push(value) } } }
const bundle = await readFile(new URL('../../client.js', import.meta.url), 'utf8')
vm.runInNewContext(bundle, { document, window })

assert.equal(registrations.length, 1,
  'the bundle must register exactly one factory: an inlined self-registering client package '
  + 'registers a second one and the loader throws "duplicate factory registration"')
const handoff = registrations[0]
assert.equal(handoff.id, 'dsh-multiroot-workspace')
assert.equal(typeof handoff.factory, 'function')

const requiredModules = new Set()
/**
 * Stands in for every platform row: readable, callable, and — because some
 * plugin rows subclass a cordis `Service` at module scope — constructible.
 */
const stub = new Proxy(function stub() {}, {
  get: () => stub,
  apply: (_target, _this, args) => args[0],
  construct: () => ({}),
})
/**
 * Harness 0.1.5-rc.2 seeds exactly these platform rows into the browser module
 * table (packages/client/web/src/platform.ts); every other specifier a plugin
 * bundle imports must be inlined by its own build.
 */
const platformRows = [
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-store',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-ui-dockkit',
]
const modules = new Map(platformRows.map(row => [row, stub]))
modules.set('react/jsx-runtime', { Fragment: Symbol('Fragment'), jsx: stub, jsxs: stub })
modules.set('react-dom', { createPortal: stub })
const plugin = handoff.factory(specifier => {
  requiredModules.add(specifier)
  assert.ok(modules.has(specifier), `unexpected client module requirement: ${specifier}`)
  return modules.get(specifier)
})

// Materializing the factory is what runs the module bodies. It must not install
// a second factory: an inlined self-registering bundle does it here and the boot
// of the real loader dies on the very same call.
assert.equal(registrations.length, 1,
  'materializing the factory registered another factory — an inlined self-registering '
  + 'client bundle must be required from the host instead of being bundled')
assert.equal(typeof plugin.apply, 'function')
assert.ok(Array.isArray(plugin.inject))
assert.deepEqual(
  [...requiredModules].sort(),
  ['@deepseek-ai/cordis', '@deepseek-ai/dsh-client-store', '@deepseek-ai/dsh-client-ui-primitives', 'react', 'react/jsx-runtime'],
)
// The plugin's own CSS Modules ship inside the bundle (the platform primitives
// it composes bring their own styles), so a plugin-owned class must be present.
assert.ok(
  injectedStyles.some(css => css.includes('multirootError')),
  'plugin CSS must include the plugin-owned multirootError class',
)

// The build gate itself must be able to fail. A guard that never rejects a
// broken artifact is decoration, so the same script is handed a bundle with an
// inlined foreign registration and must exit non-zero with a diagnosis.
const guardDir = await mkdtemp(join(tmpdir(), 'dsh-guard-'))
try {
  await mkdir(join(guardDir, 'scripts'), { recursive: true })
  await writeFile(join(guardDir, 'package.json'), JSON.stringify({ name: 'dsh-multiroot-workspace' }))
  await copyFile(new URL('../../scripts/check-client-bundle.mjs', import.meta.url),
    join(guardDir, 'scripts', 'check-client-bundle.mjs'))
  await writeFile(join(guardDir, 'broken.js'), [
    'window.__ModuleLoader__.load({',
    '\tid: "dsh-multiroot-workspace",',
    '\tfactory: require => { window.__ModuleLoader__.load({',
    '\t\tid: "@deepseek-ai/dsh-api-session-controller",',
    '\t\tfactory: require => ({}) }); return {} }',
    '});',
  ].join('\n'))
  const rejected = spawnSync(process.execPath,
    [join(guardDir, 'scripts', 'check-client-bundle.mjs'), 'broken.js'],
    { encoding: 'utf8' })
  assert.notEqual(rejected.status, 0, 'the guard must reject an inlined foreign registration')
  assert.match(rejected.stderr, /duplicate factory registration/)
  assert.match(rejected.stderr, /@deepseek-ai\/dsh-api-session-controller/)
} finally {
  await rm(guardDir, { recursive: true, force: true })
}

console.log('client bundle passed: handoff, single factory registration, host module boundary, '
  + 'exports, plugin CSS, and the build guard')
