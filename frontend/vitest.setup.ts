// Polyfills for jsdom missing globals
import type { ResizeObserverInit } from 'interface-registry'

// ResizeObserver polyfill
if (typeof globalThis.ResizeObserver === 'undefined') {
  class ResizeObserver {
    observe(callback: (entries: ResizeObserverEntry[], observer: ResizeObserver) => void) {}
    unobserve(entry: ResizeObserverEntry) {}
    disconnect() {}
  }
  globalThis.ResizeObserver = ResizeObserver as any
}

// DOMMatrixReadOnly polyfill (stub)
if (typeof globalThis.DOMMatrixReadOnly === 'undefined') {
  class DOMMatrixReadOnly {
    constructor() {}
    getM11(): number { return 1 }
    getM12(): number { return 0 }
    getM21(): number { return 0 }
    getM22(): number { return 1 }
    getA(): number { return 1 }
    getB(): number { return 0 }
    getC(): number { return 0 }
    getD(): number { return 1 }
    getE(): number { return 0 }
    getF(): number { return 0 }
    getAlpha(): number { return 1 }
    getBeta(): number { return 0 }
    getGamma(): number { return 0 }
    getKappa(): number { return 0 }
    getIsIdentity(): boolean { return true }
    toString(): string { return '' }
  }
  globalThis.DOMMatrixReadOnly = DOMMatrixReadOnly as any
}

// URL-keyed fetch mock
const fetchStore = new Map<string, (() => Promise<Response>) | undefined>()

if (typeof globalThis.fetch !== 'undefined') {
  const originalFetch = globalThis.fetch
  globalThis.fetch = (url: string | URL, init?: RequestInit) => {
    const urlString = typeof url === 'string' ? url : url.toString()
    const key = urlString.toLowerCase()
    
    let resolver = fetchStore.get(key)
    if (resolver) {
      return resolver()
    }
    
    // URL-keyed resolution logic
    if (urlString.includes('/slow')) {
      // Never settles - keep loading state visible
      return Promise.resolve({
        ok: false,
        status: 200,
        statusText: 'Loading...',
        headers: new Headers(),
        json: async () => {
          return new Promise(() => {}) // Never resolves
        },
        clone: () => (globalThis.fetch as any)(urlString, init)
      } as unknown as Response)
    }
    
    if (urlString.includes('/fail')) {
      return Promise.resolve({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        headers: new Headers(),
        json: async () => ({}),
        clone: () => (globalThis.fetch as any)(urlString, init)
      } as unknown as Response)
    }
    
    if (urlString.includes('alert-404') || urlString.includes('ALERT-404')) {
      return Promise.resolve({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        headers: new Headers(),
        json: async () => ({}),
        clone: () => (globalThis.fetch as any)(urlString, init)
      } as unknown as Response)
    }
    
    // Default mock response
    return Promise.resolve({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: new Headers(),
      json: async () => ({
        identifier: 'ALERT-001',
        severity: 'Extreme',
        urgency: 'Immediate',
        channels: [
          { label: 'sirens', reached: true, rule: 'severe' },
          { label: 'broadcast', reached: true, rule: 'severe' },
          { label: 'social', reached: false, rule: 'moderate' }
        ]
      }),
      clone: () => (globalThis.fetch as any)(urlString, init)
    } as unknown as Response)
  }
}
