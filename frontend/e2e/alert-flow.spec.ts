import { test, expect } from '@playwright/test'

// The flow page has no backend in CI: index.tsx mounts AlertFlow with the
// default endpoint '/alerts', which vite proxies to :8080. Every scenario
// therefore paints its own response with route.fulfill() - the previous
// route.continue({ status, body }) calls used the wrong API (those are
// fulfill() arguments), so the request fell through to the dead proxy.
const DISTRIBUTION = '**/alerts/ALERT-001/distribution'
const THREE_CHANNELS = {
  severity: 'Minor',
  urgency: 'Expected',
  rule: 'Default routing',
  channels: [
    { label: 'sirens', reached: true },
    { label: 'broadcast', reached: true },
    { label: 'social', reached: true },
  ],
}

function body(payload: unknown): string {
  return JSON.stringify(payload)
}

test.describe('alert.flow', () => {
  test('@bdd renders ALERT-001 with 3 channels', async ({ page }) => {
    await page.route(DISTRIBUTION, route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: body(THREE_CHANNELS),
    }))
    await page.goto('/')
    await expect(page.getByTestId('alert-flow-container')).toBeVisible()
    await expect(page.getByTestId('alert-flow-channel-node')).toHaveCount(3)
    await expect(page.getByTestId('alert-flow-alert-node')).toBeVisible()
  })

  test('@bdd network error', async ({ page }) => {
    await page.route(DISTRIBUTION, route => route.abort('failed'))
    await page.goto('/')
    await expect(page.getByTestId('alert-flow-retry')).toBeVisible()
  })

  test('@bdd retry refetches after network error', async ({ page }) => {
    // index.tsx renders the app inside StrictMode, so React double-invokes
    // the mount effect and issues two fetches before the user sees anything.
    // Both must fail for the retry button to appear; the request the retry
    // click triggers is the one that succeeds.
    let calls = 0
    await page.route(DISTRIBUTION, async route => {
      calls += 1
      return calls <= 2
        ? route.abort('failed')
        : route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: body(THREE_CHANNELS),
          })
    })
    await page.goto('/')
    await page.click('[data-testid="alert-flow-retry"]')
    await expect(page.getByTestId('alert-flow-channel-node')).toHaveCount(3)
    await expect(page.getByTestId('alert-flow-alert-node')).toBeVisible()
  })

  test('@bdd loading', async ({ page }) => {
    await page.route(DISTRIBUTION, async route => {
      await new Promise(r => setTimeout(r, 1500))
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: body(THREE_CHANNELS),
      })
    })
    await page.goto('/')
    await expect(page.getByTestId('alert-flow-loading')).toBeVisible()
    await expect(page.getByTestId('alert-flow-loading')).not.toBeVisible()
    await expect(page.getByTestId('alert-flow-channel-node')).toHaveCount(3)
  })
})
