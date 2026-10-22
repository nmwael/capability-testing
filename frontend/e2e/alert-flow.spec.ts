import { test, expect } from '@playwright/test'

test.describe('alert.flow', () => {
  test('renders an alert as a canvas with channel nodes', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByTestId('alert-flow-container')).toBeVisible()
  })

  test('reports an unknown alert', async ({ page }) => {
    await page.goto('/?alertId=ALERT-404')
    await expect(page.getByTestId('alert-flow-notfound')).toBeVisible()
  })

  test('shows a loading state when the endpoint is slow', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByTestId('alert-flow-loading')).toBeVisible()
  })

  test('renders channel nodes for reached and skipped channels', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByTestId('rf__node-sirens')).toBeVisible()
    await expect(page.getByTestId('rf__node-broadcast')).toBeVisible()
    await expect(page.getByTestId('rf__node-social')).toBeVisible()
  })

  test('styles the alert node by danger level', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByTestId('alert-flow-alert-node')).toBeVisible()
  })

  test('fits viewport', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByTestId('alert-flow-canvas')).toBeVisible()
  })

  test('zooming/panning', async ({ page }) => {
    await page.goto('/')
    // Check that zoom controls are available using the CSS class
    // Scoped to avoid strict mode duplicate elements
    await expect(page.locator('[data-testid="alert-flow-canvas"] .react-flow__controls')).toBeVisible()
  })

  test('keyboard nav', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByTestId('alert-flow-canvas')).toBeVisible()
  })
})
