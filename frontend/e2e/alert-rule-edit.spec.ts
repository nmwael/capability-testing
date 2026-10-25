import { test, expect } from '@playwright/test'

test.describe('alert.rule-edit', () => {
  test('@bdd loads default graph when no saved graph', async ({ page }) => {
    await page.goto('/?ruleName=tornado-routing')
    await page.locator('[data-testid="condition-node"]').waitFor({ state: 'visible' })
    await expect(page.locator('[data-testid="condition-node"]')).toBeVisible()
    await expect(page.locator('[data-testid="action-node"]')).toBeVisible()
  })

  test('@bdd edits condition value', async ({ page }) => {
    await page.goto('/?ruleName=tornado-routing')
    await page.locator('[data-testid="condition-value-select"]').waitFor({ state: 'visible' })
    const condition = page.locator('[data-testid="condition-node"]')
    const valueInput = condition.locator('[data-testid="condition-value-select"]')
    await valueInput.selectOption('Moderate')
    await expect(valueInput).toHaveValue('Moderate')
  })

  test('@bdd renames node via rename panel', async ({ page }) => {
    await page.goto('/?ruleName=tornado-routing')
    const condition = page.locator('[data-testid="condition-node"]')
    await condition.click()
    await expect(page.getByTestId('rule-edit-rename-panel')).toBeVisible()
    const input = page.getByTestId('rule-edit-rename-input')
    await input.fill('my-condition')
    await page.keyboard.press('Enter')
    await expect(page.getByTestId('rule-edit-rename-panel')).toBeHidden()
  })

  test('@bdd deletes node with Backspace', async ({ page }) => {
    await page.goto('/?ruleName=tornado-routing')
    const action = page.locator('[data-testid="action-node"]')
    await action.click()
    await page.keyboard.press('Backspace')
    await expect(action).not.toBeVisible()
  })

  test('@bdd saving posts to /rules endpoint', async ({ page }) => {
    await page.goto('/?ruleName=tornado-routing')
    await page.waitForSelector('[data-testid="rule-edit-save"]', { state: 'visible' })
    await page.click('[data-testid="rule-edit-save"]')
    const response = await page.waitForResponse((req) => req.url().includes('/rules'))
    expect(response.status()).toBe(200)
  })

  test('@bdd keeps edit when save is rejected', async ({ page }) => {
    await page.goto('/?ruleName=tornado-routing')
    await page.waitForSelector('[data-testid="rule-edit-save"]', { state: 'visible' })
    await page.route('**/rules/**', route => route.abort('failed'))
    await page.click('[data-testid="rule-edit-save"]')
    await expect(page.getByTestId('rule-edit-unsaved')).toBeVisible()
  })
})
