/**
 * Vendored DeepSeek Harness DOM test environment, copied from
 * `scripts/test-dom-environment.ts` at 0.1.7-rc.2.
 *
 * jsdom defines no `ResizeObserver`, and the 0.1.7 `dsh-client-ui-primitives`
 * tooltip/marquee fit path constructs one, so a jsdom spec that renders those
 * primitives dies with `ReferenceError: ResizeObserver is not defined`. The
 * monorepo installs this stub through the root vitest `setupFiles` list; this
 * repository has no such root, so `vitest.config.mjs` points its `setupFiles`
 * at this copy. The code is unchanged apart from this header.
 */
/** Initial resize delivery from jsdom's modeled offsets; geometry/timing suites supply their own observers. */
import { afterAll, beforeEach } from 'vitest'

const original = Object.getOwnPropertyDescriptor(globalThis, 'ResizeObserver')
let installed = false

class TestResizeObserver implements ResizeObserver {
  private readonly targets = new Set<Element>()

  constructor(private readonly callback: ResizeObserverCallback) {}

  observe(target: Element): void {
    if (this.targets.has(target)) return
    this.targets.add(target)
    const width = target instanceof HTMLElement ? target.offsetWidth : 0
    const height = target instanceof HTMLElement ? target.offsetHeight : 0
    const size = [{ inlineSize: width, blockSize: height }]
    this.callback([{
      target, contentRect: new DOMRectReadOnly(0, 0, width, height),
      borderBoxSize: size, contentBoxSize: size, devicePixelContentBoxSize: size,
    }], this)
  }

  unobserve(target: Element): void { this.targets.delete(target) }

  disconnect(): void { this.targets.clear() }
}

beforeEach(() => {
  if (typeof document !== 'undefined' && typeof ResizeObserver === 'undefined') {
    // Establish the per-environment default, so vi.unstubAllGlobals restores it.
    Object.defineProperty(globalThis, 'ResizeObserver', { configurable: true, writable: true, value: TestResizeObserver })
    installed = true
  }
})

afterAll(() => {
  if (!installed) return
  if (original === undefined) Reflect.deleteProperty(globalThis, 'ResizeObserver')
  else Object.defineProperty(globalThis, 'ResizeObserver', original)
})
