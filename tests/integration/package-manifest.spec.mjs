import assert from 'node:assert/strict'
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

const root = new URL('../..', import.meta.url)
/** Host packages the plugin consumes, at the version this build was rebased on. */
const expectedPeers = {
  '@deepseek-ai/cordis': '^4.0.2',
  '@deepseek-ai/dsh-api-remotes': '^0.1.5-rc.2',
  '@deepseek-ai/dsh-api-session-controller': '^0.1.5-rc.2',
  '@deepseek-ai/dsh-api-workspace-controller': '^0.1.5-rc.2',
  '@deepseek-ai/dsh-client-connection': '^0.1.5-rc.2',
  '@deepseek-ai/dsh-client-locale': '^0.1.5-rc.2',
  '@deepseek-ai/dsh-client-store': '^0.1.5-rc.2',
  '@deepseek-ai/dsh-client-ui-conversation': '^0.1.5-rc.2',
  '@deepseek-ai/dsh-client-ui-layout': '^0.1.5-rc.2',
  '@deepseek-ai/dsh-client-ui-primitives': '^0.1.5-rc.2',
  '@deepseek-ai/dsh-client-ui-renderer': '^0.1.5-rc.2',
  '@deepseek-ai/dsh-client-ui-session': '^0.1.5-rc.2',
  '@deepseek-ai/dsh-client-ui-sidebar': '^0.1.5-rc.2',
  '@deepseek-ai/dsh-client-ui-slots': '^0.1.5-rc.2',
  '@deepseek-ai/dsh-fs': '^0.1.5-rc.2',
  '@deepseek-ai/dsh-storage-domain': '^0.1.5-rc.2',
  '@deepseek-ai/dsh-tools': '^0.1.5-rc.2',
  '@deepseek-ai/schemastery': '^3.18.2',
  react: '18.3.1',
  'react-dom': '18.3.1',
}
const expectedPeerMetadata = Object.fromEntries(
  Object.keys(expectedPeers).map(name => [name, { optional: true }]),
)
/** The informational `dsh.client.inject` list: the 0.1.5-rc.2 ui-workspace rows. */
const expectedClientInject = [
  '@deepseek-ai/dsh-api-remotes',
  '@deepseek-ai/dsh-api-session-controller',
  '@deepseek-ai/dsh-api-workspace-controller',
  '@deepseek-ai/dsh-client-connection',
  '@deepseek-ai/dsh-client-locale',
  '@deepseek-ai/dsh-client-ui-conversation',
  '@deepseek-ai/dsh-client-ui-layout',
  '@deepseek-ai/dsh-client-ui-renderer',
  '@deepseek-ai/dsh-client-ui-session',
  '@deepseek-ai/dsh-client-ui-sidebar',
]

const artifactDir = await mkdtemp(join(tmpdir(), 'dsh-manifest-'))
try {
  const pack = spawnSync('pnpm', ['pack', '--pack-destination', artifactDir], {
    cwd: root,
    encoding: 'utf8',
  })
  assert.equal(pack.status, 0, pack.stderr || pack.stdout)
  const artifacts = await readdir(artifactDir)
  assert.deepEqual(artifacts.filter(name => name.endsWith('.tgz')).length, 1)
  const tarball = join(artifactDir, artifacts.find(name => name.endsWith('.tgz')))

  const extract = spawnSync('tar', ['-xOzf', tarball, 'package/package.json'], { encoding: 'utf8' })
  assert.equal(extract.status, 0, extract.stderr)
  const manifest = JSON.parse(extract.stdout)

  const listing = spawnSync('tar', ['-tzf', tarball], { encoding: 'utf8' })
  assert.equal(listing.status, 0, listing.stderr)
  assert.deepEqual(listing.stdout.trim().split('\n').sort(), [
    'package/CHANGELOG.md',
    'package/LICENSE',
    'package/LICENSES/DeepSeek-Harness-MIT.txt',
    'package/README.md',
    'package/UPSTREAM.md',
    'package/client.js',
    'package/cordis.patch.yml',
    'package/index.js',
    'package/package.json',
    'package/tools.js',
  ])
  const packedLicense = spawnSync('tar', ['-xOzf', tarball, 'package/LICENSE'], { encoding: 'utf8' })
  assert.equal(packedLicense.status, 0, packedLicense.stderr)
  assert.equal(packedLicense.stdout, await readFile(new URL('../../LICENSE', import.meta.url), 'utf8'))

  assert.deepEqual(manifest.peerDependencies, expectedPeers)
  assert.deepEqual(manifest.peerDependenciesMeta, expectedPeerMetadata)
  assert.deepEqual(manifest.dependencies, { clsx: '^2.0.0', zod: '^4.4.3' })
  assert.deepEqual(manifest.dsh?.client, { platform: 'web', inject: expectedClientInject })
  assert.equal(manifest.dsh?.bundle?.patch, './cordis.patch.yml')
  // The removed-in-0.1.5 runtime package must not reappear anywhere.
  assert.equal(manifest.peerDependencies?.['@deepseek-ai/dsh-client-runtime'], undefined)
  assert.equal(manifest.devDependencies?.['@deepseek-ai/dsh-client-runtime'], undefined)
  // The client half composes the platform rows the loader seeds (primitives
  // among them) and reads the api-* wire layers, so both are declared peers.
  assert.equal(manifest.peerDependencies?.['@deepseek-ai/dsh-client-ui-primitives'], '^0.1.5-rc.2')
  assert.equal(manifest.peerDependencies?.['@deepseek-ai/dsh-api-workspace-controller'], '^0.1.5-rc.2')
  for (const [name, version] of Object.entries(manifest.devDependencies ?? {})) {
    if (name.startsWith('@deepseek-ai/dsh-')) assert.equal(version, '0.1.5-rc.2', name)
  }
  assert.equal(manifest.devDependencies?.['@deepseek-ai/cordis'], '^4.0.2')
  assert.equal(manifest.devDependencies?.['@deepseek-ai/schemastery'], '^3.18.2')
  assert.equal(manifest.devDependencies?.react, '18.3.1')
  assert.equal(manifest.devDependencies?.['react-dom'], '18.3.1')
  // Every dev spec must be a publishable registry range: no `link:`/`file:` paths,
  // which would make the frozen-lockfile gate depend on a machine layout.
  for (const [name, spec] of Object.entries(manifest.devDependencies ?? {})) {
    assert.doesNotMatch(spec, /^(?:link|file|portal):/, name)
  }
  for (const [name, spec] of Object.entries(manifest.peerDependencies ?? {})) {
    assert.doesNotMatch(spec, /^(?:link|file|portal):/, name)
  }
  assert.deepEqual(manifest.engines, { node: '>=24.11.1 <25', dsh: '^0.1.5-rc.2' })

  const workspace = await readFile(new URL('../../pnpm-workspace.yaml', import.meta.url), 'utf8')
  assert.match(workspace, /^packages:\n  - \.\n\nallowBuilds:\n  lightningcss: true\n$/)
} finally {
  await rm(artifactDir, { recursive: true, force: true })
}

console.log('packed manifest passed: direct imports, host peers, client services, workspace policy')
