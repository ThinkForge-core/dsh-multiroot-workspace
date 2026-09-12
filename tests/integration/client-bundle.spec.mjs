import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import vm from 'node:vm'

const build = spawnSync('pnpm', ['run', 'build'], { cwd: new URL('../..', import.meta.url), stdio: 'inherit' })
assert.equal(build.status, 0, 'client build must succeed')

const injectedStyles = []
const document = {
  querySelector: () => null,
  createElement: tagName => ({ tagName, dataset: {}, textContent: '' }),
  head: { appendChild: tag => { injectedStyles.push(tag.textContent) } },
}
let handoff
const window = { __ModuleLoader__: { load: value => { handoff = value } } }
const bundle = await readFile(new URL('../../client.js', import.meta.url), 'utf8')
vm.runInNewContext(bundle, { document, window })

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

console.log('client bundle passed: handoff, host module boundary, exports, and plugin CSS')
