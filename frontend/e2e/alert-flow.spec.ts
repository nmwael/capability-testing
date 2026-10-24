import { test, expect } from '@playwright/test'

test.describe('alert.flow', () => {
  test('@bdd renders ALERT-001 with 3 channels', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByTestId('alert-flow-container')).toBeVisible()
    await expect(page.getByTestId('alert-flow-channel-node')).toHaveCount(3)
    await expect(page.getByTestId('alert-flow-alert-node')).toBeVisible()
  })

  test('@bdd network error', async ({ page }) => {
    await page.route('**/alerts/ALERT-001/distribution', route => route.abort('failed'))
    await page.goto('/')
    await expect(page.getByTestId('alert-flow-retry')).toBeVisible()
  })

  test('@bdd retry refetches after network error', async ({ page }) => {
    let calls = 0
    await page.route('**/alerts/ALERT-001/distribution', async route => {
      calls += 1
      return calls === 1 ? route.abort('failed') : route.continue({ status: 200, body: '{"severity":"Minor","urgency":"Expected","rule":"Default routing","channels":[{"label":"sirens","reached":true},{"label":"broadcast","reached":true},{"label":"social","reached":true}]}' })
    })
    await page.goto('/')
    await page.click('[data-testid="alert-flow-retry"]')
    await expect(page.getByTestId('alert-flow-channel-node')).toHaveCount(3)
    await expect(page.getByTestId('alert-flow-alert-node')).toBeVisible()
  })

  test('@bdd loading', async ({ page }) => {
    await page.route('**/alerts/ALERT-001/distribution', async route => {
      await new Promise(r => setTimeout(r, 1500))
      return route.continue({ status: 200, body: '{"severity":"Minor","urgency":"Expected","rule":"Default routing","channels":[{"label":"sirens","reached":true},{"label":"broadcast","reached":true},{"label":"social","reached":true}]}' })
    })
    await page.goto('/')
    await expect(page.getByTestId('alert-flow-loading')).toBeVisible()
    await expect(page.getByTestId('alert-flow-loading')).not.toBeVisible()
    await expect(page.getByTestId('alert-flow-channel-node')).toHaveCount(3)
  })

})
