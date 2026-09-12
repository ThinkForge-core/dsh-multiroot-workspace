import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'
import tsdownConfig from '../../tsdown.config.mjs'

/**
 * Specifiers the client half must never require as a value. Harness
 * `0.1.5-rc.2` removed `@deepseek-ai/dsh-client-runtime` in favour of the
 * `dsh-api-*` controller packages, so a surviving runtime import of it is a
 * guaranteed `client-modules: require(...) missed the module table` throw.
 * The platform rows themselves (react, cordis, `dsh-client-store`,
 * `dsh-client-ui-slots`, `dsh-client-ui-primitives`, `dsh-client-ui-dockkit`)
 * are the ones the loader DOES answer — see the externals assertions below.
 */
const unsupportedRuntimeModules = new Set([
  '@deepseek-ai/dsh-client-runtime/client',
])

async function sourceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = await Promise.all(entries.map(entry => {
    const path = join(directory, entry.name)
    return entry.isDirectory() ? sourceFiles(path) : /\.[cm]?[jt]sx?$/u.test(entry.name) ? [path] : []
  }))
  return files.flat()
}

function unsupportedRuntimeImports(sourceText: string, file = 'source.ts'): string[] {
  const violations: string[] = []
  const source = ts.createSourceFile(file, sourceText, ts.ScriptTarget.Latest, true)
  const record = (specifier: ts.Expression | undefined, typeOnly = false): void => {
    if (typeOnly || specifier === undefined) return
    const visitSpecifier = (node: ts.Node): void => {
      if (ts.isStringLiteralLike(node) && unsupportedRuntimeModules.has(node.text)) violations.push(node.text)
      ts.forEachChild(node, visitSpecifier)
    }
    visitSpecifier(specifier)
  }

  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node)) {
      const clause = node.importClause
      const named = clause?.namedBindings
      record(node.moduleSpecifier, clause?.isTypeOnly === true || (
        clause?.name === undefined && named !== undefined && ts.isNamedImports(named)
        && named.elements.length > 0 && named.elements.every(element => element.isTypeOnly)
      ))
    } else if (ts.isExportDeclaration(node)) {
      const named = node.exportClause
      record(node.moduleSpecifier, node.isTypeOnly || (
        named !== undefined && ts.isNamedExports(named)
        && named.elements.length > 0 && named.elements.every(element => element.isTypeOnly)
      ))
    } else if (ts.isCallExpression(node)) {
      const runtimeLoad = node.expression.kind === ts.SyntaxKind.ImportKeyword
        || (ts.isIdentifier(node.expression) && node.expression.text === 'require')
      if (runtimeLoad) record(node.arguments[0])
    } else if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
      record(node.moduleReference.expression, node.isTypeOnly)
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  return violations
}

describe('client bundle policy', () => {
  it.each([
    ['value export', "export { value } from '@deepseek-ai/dsh-client-runtime/client'"],
    ['star export', "export * from '@deepseek-ai/dsh-client-runtime/client'"],
    ['nested dynamic import', "function load() { return import('@deepseek-ai/dsh-client-runtime/client') }"],
    ['nested require', "function load() { return require('@deepseek-ai/dsh-client-runtime/client') }"],
    ['import equals', "import runtime = require('@deepseek-ai/dsh-client-runtime/client')"],
    ['empty named import', "import {} from '@deepseek-ai/dsh-client-runtime/client'"],
    ['empty named export', "export {} from '@deepseek-ai/dsh-client-runtime/client'"],
    ['template dynamic import', 'import(`@deepseek-ai/dsh-client-runtime/client`)'],
    ['template require', 'require(`@deepseek-ai/dsh-client-runtime/client`)'],
    ['parenthesized dynamic import', "import(('@deepseek-ai/dsh-client-runtime/client'))"],
    ['parenthesized require', "require(('@deepseek-ai/dsh-client-runtime/client'))"],
    ['asserted require', "require('@deepseek-ai/dsh-client-runtime/client' as string)"],
  ])('detects forbidden runtime %s', (_name, source) => {
    expect(unsupportedRuntimeImports(source)).toEqual(['@deepseek-ai/dsh-client-runtime/client'])
  })

  it.each([
    ['import type', "import type { X } from '@deepseek-ai/dsh-client-runtime/client'"],
    ['export type', "export type { X } from '@deepseek-ai/dsh-client-runtime/client'"],
    ['named type import', "import { type X } from '@deepseek-ai/dsh-client-runtime/client'"],
    ['named type export', "export { type X } from '@deepseek-ai/dsh-client-runtime/client'"],
  ])('allows %s', (_name, source) => {
    expect(unsupportedRuntimeImports(source)).toEqual([])
  })

  it('rejects unsupported DSH client runtime imports', async () => {
    const violations: string[] = []
    for (const file of await sourceFiles('src/client')) {
      violations.push(...unsupportedRuntimeImports(await readFile(file, 'utf8'), file)
        .map(specifier => `${file}: ${specifier}`))
    }

    expect(violations).toEqual([])
  })

  it('requests exactly the platform rows and bundles every other DSH package', () => {
    const neverBundle = tsdownConfig.deps?.neverBundle
    expect(typeof neverBundle).toBe('function')
    if (typeof neverBundle !== 'function') return
    const isRequested = neverBundle as (specifier: string) => boolean

    // The loader's seed table: these stay `require()` calls answered at runtime.
    for (const row of [
      'react', 'react/jsx-runtime', 'react-dom', 'react-dom/client',
      '@deepseek-ai/cordis',
      '@deepseek-ai/dsh-client-store',
      '@deepseek-ai/dsh-client-ui-slots',
      '@deepseek-ai/dsh-client-ui-primitives',
      '@deepseek-ai/dsh-client-ui-dockkit',
    ]) {
      expect(isRequested(row), row).toBe(true)
    }

    // Everything else — wire layers, type-only imports, zod, clsx — must inline:
    // a require() the module table cannot answer is a runtime throw.
    for (const row of [
      '@deepseek-ai/example',
      '@deepseek-ai/dsh-api-workspace-controller/client',
      '@deepseek-ai/dsh-client-runtime/client',
    ]) {
      expect(isRequested(row), row).toBe(false)
    }
  })
})
