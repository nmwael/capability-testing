import { test, expect } from '@playwright/test'

test.describe('alert.flow', () => {
  test('@bdd renders ALERT-001 with distribution data', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByTestId('alert-flow-container')).toBeVisible()
    await expect(page.getByTestId('alert-flow-channel-node')).toBeVisible({ timeout: 2000 })
    await expect(page.getByTestId('alert-flow-alert-node')).toBeVisible({ timeout: 2000 })
  })

  test('@bdd renders 404 for missing alert', async ({ page }) => {
    await page.goto('/?alertId=ALERT-404')
    await expect(page.getByTestId('alert-flow-notfound')).toBeVisible()
  })

  test('@bdd shows loading state when endpoint is slow', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByTestId('alert-flow-loading')).toBeVisible()
  })

  test('@bdd renders retry button for network error', async ({ page }) => {
    await page.route('*/alerts/*/distribution', (route) => {
      route.continue({ status: 500, body: 'Network Error' })
    })
    await page.goto('/')
    await expect(page.getByTestId('alert-flow-network-error')).toBeVisible({ timeout: 10000 })
    await expect(page.getByTestId('alert-flow-retry')).toBeVisible()
  })

  test('@bdd retry refetches after network error', async ({ page }) => {
    await page.route('*/alerts/*/distribution', (route) => {
      if (page.url().includes('retry')) {
        route.continue({ status: 200, body: 'OK' })
      } else {
        route.continue({ status: 500, body: 'Network Error' })
      }
    })
    await page.goto('/')
    await expect(page.getByTestId('alert-flow-network-error')).toBeVisible({ timeout: 10000 })
    await page.click('[data-testid="alert-flow-retry"]')
    await expect(page.getByTestId('alert-flow-container')).toBeVisible()
  })
})
