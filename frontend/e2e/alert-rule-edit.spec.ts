import { test, expect } from '@playwright/test'

// alert.rule-edit exercises the rule-editing capability. The mounted page is
// the designer (index.tsx renders AlertRuleDesigner at '/'), which carries the
// behaviours features/frontend/alert-rule-edit.feature describes - the
// standalone AlertRuleEdit.tsx component is never mounted, so it cannot be
// driven end to end. Save/Generate post to the default '/rules' endpoint.
const RULES = '**/rules'

async function focusCanvas(page: import('@playwright/test').Page) {
  await page.locator('[data-testid="condition-node"]').first().waitFor({ state: 'visible', timeout: 15000 })
  await page.locator('[data-testid="canvas"]').click()
}

test.describe('alert.rule-edit', () => {
  test('@bdd loads default graph when no saved graph', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('[data-testid="condition-node"]')).toBeVisible({ timeout: 15000 })
    await expect(page.locator('[data-testid="action-node"]')).toBeVisible()
  })

  test('@bdd edits condition value', async ({ page }) => {
    await page.goto('/')
    const valueInput = page.locator('[data-testid="condition-node"] [data-testid="value-input"]').first()
    await valueInput.waitFor({ state: 'visible', timeout: 15000 })
    await valueInput.selectOption('Moderate')
    await expect(valueInput).toHaveValue('Moderate')
    await expect(page.getByTestId('unsaved-changes')).toBeVisible()
  })

  test('@bdd renames node via rename panel', async ({ page }) => {
    await page.goto('/')
    await focusCanvas(page)
    await page.keyboard.press('c')
    const panel = page.getByTestId('rule-designer-rename-panel')
    await expect(panel).toBeVisible()
    const input = page.getByTestId('rename-input')
    await input.fill('tornado-warning')
    await page.keyboard.press('Enter')
    await expect(panel).toBeHidden()
  })

  test('@bdd saving posts to /rules endpoint', async ({ page }) => {
    await page.route(RULES, route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ruleCount: 1 }),
    }))
    await page.goto('/')
    await expect(page.locator('[data-testid="condition-node"]')).toBeVisible({ timeout: 15000 })
    await page.click('[data-testid="save-button"]')
    const response = await page.waitForResponse(req => req.url().includes('/rules'))
    expect(response.request().method()).toBe('POST')
    expect(response.status()).toBe(200)
    await expect(page.getByTestId('rule-designer-status')).toContainText('Generated 1 rules')
  })

  test('@bdd keeps edit when save is rejected', async ({ page }) => {
    await page.route(RULES, route => route.abort('failed'))
    await page.goto('/')
    await expect(page.locator('[data-testid="condition-node"]')).toBeVisible({ timeout: 15000 })
    await page.click('[data-testid="save-button"]')
    await expect(page.getByTestId('rule-designer-status')).toContainText('Could not reach the rule design endpoint')
    await expect(page.locator('[data-testid="condition-node"]')).toBeVisible()
    await expect(page.getByTestId('unsaved-changes')).toBeVisible()
  })
})
