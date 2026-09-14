/**
 * Build-time guard for the browser half: the artifact must register exactly ONE
 * factory, and that factory must be this package's own row.
 *
 * Why this exists (a real regression, 0.1.5-rc.2): a type-only import written
 * with inline specifiers —
 *
 *   import { type A, type B } from '@deepseek-ai/dsh-api-session-controller/client'
 *
 * — is reduced by the bundler to a side-effect import, so the OTHER package's
 * self-registering client bundle is inlined. The script then installs a second
 * factory under its id, while the real graph row installs the same id again, and
 * boot dies with:
 *
 *   client-modules: duplicate factory registration for "<id>"
 *   (bundle executed twice without invalidate?)
 *
 * Typecheck cannot see this and a loader test that keeps only the LAST
 * registration cannot either — both are green while `dsh web` does not start.
 * The built bytes are the only honest witness, so they are inspected here.
 *
 * Run: node scripts/check-client-bundle.mjs [artifact]   (default: client.js)
 */
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

/**
 * The registration facade call, tolerant of formatting and minification: the
 * two-property object the DSH build banner emits, an id first and a factory
 * second, with any whitespace (including a newline) after the brace.
 */
const REGISTRATION_RE = /__ModuleLoader__\s*\.\s*load\s*\(\s*\{[^}]*?\bid\s*:\s*["']([^"'\n]+)["']/g

const artifact = process.argv[2] ?? 'client.js'
const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
const bundle = await readFile(new URL(`../${artifact}`, import.meta.url), 'utf8')

const ids = [...bundle.matchAll(REGISTRATION_RE)].map(match => match[1])
const foreign = ids.filter(id => id !== manifest.name)

const problems = []
if (ids.length === 0) {
  problems.push(`registers no factory — the module table would report `
    + `"bundle loaded without registering"`)
}
if (ids.length > 1) {
  problems.push(`registers ${ids.length} factories (${ids.join(', ')}) — the loader allows one `
    + `per bundle: this is the "bundle executed twice without invalidate?" class`)
}
if (foreign.length > 0) {
  problems.push(`registers a factory for another package: ${foreign.join(', ')} — a `
    + `self-registering client bundle was inlined instead of being required by the host; `
    + `the loader already owns that row and throws `
    + `client-modules: duplicate factory registration`)
}

if (problems.length > 0) {
  console.error(`${artifact} is not a valid DSH client bundle (${manifest.name}):`)
  for (const problem of problems) console.error(`  - ${problem}`)
  console.error('  A type-only import with inline `type` modifiers is the usual cause: '
    + 'rewrite it as `import type { … }`.')
  process.exit(1)
}

console.log(`${artifact} passed: one factory registration for "${ids[0]}" (${manifest.name})`)
