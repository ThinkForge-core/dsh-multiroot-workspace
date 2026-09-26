import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const root = new URL('../..', import.meta.url)
const [manifestText, readme, upstream, changelog, license] = await Promise.all([
  readFile(new URL('package.json', root), 'utf8'),
  readFile(new URL('README.md', root), 'utf8'),
  readFile(new URL('UPSTREAM.md', root), 'utf8'),
  readFile(new URL('CHANGELOG.md', root), 'utf8'),
  readFile(new URL('LICENSE', root), 'utf8'),
])
const manifest = JSON.parse(manifestText)
/** The Harness release this build is rebased on and verified against. */
const DSH_VERSION = '0.1.7-rc.2'

assert.equal(manifest.version, DSH_VERSION)
assert.equal(manifest.description, 'Multi-root logical Workspaces for DeepSeek Harness')
assert.equal(manifest.license, 'MIT')
assert.equal(manifest.packageManager, 'pnpm@11.9.0')
assert.deepEqual(manifest.engines, { node: '>=24.11.1 <25', dsh: `^${DSH_VERSION}` })
assert.deepEqual(manifest.os, ['darwin', 'linux', 'android'])
assert.deepEqual(manifest.publishConfig, { access: 'public' })
assert.equal(manifest.author, 'Blackoutta <hyytez@gmail.com>')
assert.deepEqual(manifest.repository, {
  type: 'git',
  url: 'git+https://github.com/Blackoutta/dsh-multiroot-workspace.git',
})
assert.equal(manifest.homepage, 'https://github.com/Blackoutta/dsh-multiroot-workspace#readme')
assert.deepEqual(manifest.bugs, { url: 'https://github.com/Blackoutta/dsh-multiroot-workspace/issues' })
assert.deepEqual(manifest.keywords, [
  'deepseek',
  'deepseek-harness',
  'dsh',
  'dsh-plugin',
  'multi-root',
  'workspace',
])
for (const file of ['CHANGELOG.md', 'LICENSE', 'UPSTREAM.md']) assert.ok(manifest.files.includes(file), file)
assert.match(license, /^MIT License$/m)
assert.match(license, /^Copyright \(c\) 2026 Blackoutta$/m)
assert.match(license, /^Copyright \(c\) 2026 DeepSeek$/m)

// The README must only ever point at the release this build targets.
assert.match(readme, new RegExp(`DeepSeek Harness \\*\\*\`${DSH_VERSION.replaceAll('.', '\\.')}\`\\*\\*`))
assert.match(readme, new RegExp(`dsh-multiroot-workspace-${DSH_VERSION.replaceAll('.', '\\.')}\\.tgz`))
assert.match(readme, /start the Web UI with `dsh web`/)
assert.match(readme, /^dsh plugin --profile web remove dsh-multiroot-workspace$/m)
assert.doesNotMatch(readme, /npm install --global @deepseek-ai\/dsh/)
assert.doesNotMatch(readme, /DSH_HOME=~\/dsh-test/)
assert.match(readme, /curl -fsS -X DELETE http:\/\/127\.0\.0\.1:3080\/plugins\/multiroot\/api\/data/)
assert.match(readme, /crossRootBash/)
assert.match(readme, /title: Product repository/)
assert.match(readme, /roots:\n      - alias: app/)
assert.match(readme, /exactly one root must set `primary: true`/)
assert.match(readme, /read-only logical Workspace `config-roots`/)
assert.match(readme, /Paths may be absent during startup/)
assert.match(readme, /Purge clears its Session selections and shadow mapping but preserves the declared record/)
assert.match(readme, /a later new Session whose cwd matches the primary root creates or adopts a Host shadow/)
assert.match(readme, /macOS, Linux, and Android\/Termux/)
// The consumer README must never advertise the replaced runtime package; the
// provenance file mentions it only to record that 0.1.7-rc.2 removed it.
assert.doesNotMatch(readme, /@deepseek-ai\/dsh-client-runtime/)
assert.doesNotMatch(upstream, /`@deepseek-ai\/dsh-client-runtime`[\s\S]{0,80}(?:peerDependencies|devDependencies|"0\.1)/)
assert.doesNotMatch(readme, /0\.1\.[01]-rc\./)
// Provenance may name the previous target, but no document may still cite the
// long-superseded 0.1.0-rc.6 build.
assert.doesNotMatch(`${readme}\n${upstream}`, /0\.1\.0-rc\./)

assert.match(upstream, new RegExp(`Harness \`${DSH_VERSION.replaceAll('.', '\\.')}\``))
assert.match(upstream, /20 files and 474 tests\s+passed/)
assert.match(upstream, /Test harness notes/)
assert.match(changelog, /^## \[Unreleased\]$/m)
assert.match(changelog, new RegExp(`^## \\[${DSH_VERSION.replaceAll('.', '\\.')}\\] - \\d{4}-\\d{2}-\\d{2}$`, 'm'))
assert.match(changelog, /^## \[0\.1\.0-rc\.1\] - 2026-08-15$/m)

console.log('release docs passed: package policy, consumer commands, provenance, changelog')
