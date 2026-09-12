import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

/**
 * Adapt DSH's published browser factory bundles to Vitest's ESM module graph.
 * Every package that ships a browser half under `lib/client.js` (the
 * `dsh-client-*` plugin packages as well as the `dsh-api-*` wire layers)
 * emits a closure-factory artifact that registers with
 * `window.__ModuleLoader__`; none of them can be imported as ESM directly.
 * The load hook matches by artifact path because the transform hook keys off
 * the factory banner, which is only readable once the file is loaded.
 */
function dshClientBundles() {
  return {
    name: 'dsh-client-bundles',
    enforce: 'pre',
    load(id) {
      if (!/node_modules\/.*\/lib\/client\.js$/u.test(id)) return
      return readFileSync(id, 'utf8').replace(/\n\/\/# sourceMappingURL=.*$/u, '')
    },
    transform(code) {
      if (!code.startsWith('window.__ModuleLoader__.load({')) return

      const dependencies = [...new Set([...code.matchAll(/\brequire\("([^"]+)"\)/g)].map(match => match[1]))]
      const names = [...new Set([...code.matchAll(/\bexports\.([A-Za-z_$][\w$]*)\s*=/g)].map(match => match[1]))]
      const imports = dependencies.map((specifier, index) =>
        `import * as dshDependency${index} from ${JSON.stringify(specifier)}`).join('\n')
      const modules = dependencies.map((specifier, index) =>
        `[${JSON.stringify(specifier)}, dshDependency${index}]`).join(',\n  ')
      const exports = names.map(name => `export const ${name} = dshExports.${name}`).join('\n')
      const handoffCode = code
        .replace(/^window\.__ModuleLoader__\.load\(/u, 'dshCapture(')
        .replace(/\n\/\/# sourceMappingURL=.*$/u, '')

      return `${imports}
let dshHandoff
const dshCapture = handoff => { dshHandoff = handoff }
${handoffCode}
if (dshHandoff === undefined) throw new Error('DSH client bundle did not register with ModuleLoader')
const dshModules = new Map([
  ${modules}
])
const dshExports = dshHandoff.factory(specifier => {
  if (!dshModules.has(specifier)) throw new Error(\`Unknown DSH client bundle dependency: \${specifier}\`)
  return dshModules.get(specifier)
})
${exports}
`
    },
  }
}

export default defineConfig({
  plugins: [dshClientBundles()],
  resolve: {
    dedupe: ['react', 'react-dom'],
    alias: [
      {
        find: /^react(\/.*)?$/,
        replacement: `${fileURLToPath(new URL('./node_modules/react/', import.meta.url))}$1`,
      },
      {
        find: /^react-dom(\/.*)?$/,
        replacement: `${fileURLToPath(new URL('./node_modules/react-dom/', import.meta.url))}$1`,
      },
      {
        find: /^use-sync-external-store(\/.*)?$/,
        replacement: `${fileURLToPath(new URL('./node_modules/use-sync-external-store/', import.meta.url))}$1`,
      },
      {
        find: /^@testing-library\/react(\/.*)?$/,
        replacement: `${fileURLToPath(new URL('./node_modules/@testing-library/react/', import.meta.url))}$1`,
      },
      // The published @deepseek-ai/dsh-client-test-runtime imports these two
      // renderer modules by repo-relative source path, which the renderer
      // package does not ship; tests/vendor/ui-renderer carries the same files
      // (see its header) so the suite runs outside the Harness checkout.
      {
        find: '@deepseek-ai/dsh-client-ui-renderer/src/client/bind.ts',
        replacement: fileURLToPath(new URL('./tests/vendor/ui-renderer/bind.ts', import.meta.url)),
      },
      {
        find: '@deepseek-ai/dsh-client-ui-renderer/src/client/scoped-slots.tsx',
        replacement: fileURLToPath(new URL('./tests/vendor/ui-renderer/scoped-slots.tsx', import.meta.url)),
      },
    ],
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.spec.{ts,tsx}'],
    server: {
      deps: {
        // Every @deepseek-ai browser half ships as a closure-factory bundle
        // that only the dshClientBundles plugin above can turn into ESM, so
        // all of them must pass through Vite instead of Node's loader.
        inline: [/@deepseek-ai\//],
      },
    },
    pool: 'forks',
    execArgv: process.allowedNodeEnvironmentFlags.has('--webstorage') ? ['--no-webstorage'] : [],
  },
})
