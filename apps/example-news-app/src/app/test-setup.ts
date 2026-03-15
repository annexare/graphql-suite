/// <reference lib="dom" />

import { parseHTML } from 'linkedom'

const dom = parseHTML('<!doctype html><html><head></head><body></body></html>')

// Register the minimal set of globals that react-dom/client needs
const globals: Record<string, unknown> = {
  window: dom.window,
  document: dom.document,
  navigator: { userAgent: '' },
  HTMLElement: dom.HTMLElement,
  HTMLIFrameElement: dom.HTMLElement,
  MutationObserver: class MutationObserver {
    observe() {}
    disconnect() {}
    takeRecords() {
      return []
    }
  },
}

for (const [key, value] of Object.entries(globals)) {
  if (!(key in globalThis)) {
    Object.defineProperty(globalThis, key, { value, writable: true, configurable: true })
  }
}
// Enable React's act() environment so it doesn't warn in tests
// biome-ignore lint/suspicious/noExplicitAny: React internal test flag
;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
