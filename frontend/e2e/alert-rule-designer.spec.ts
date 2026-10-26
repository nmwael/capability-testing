import { test, expect } from '@playwright/test'

test.describe('alert.rule-designer', () => {
  async function focusCanvas(page) {
    // Wait for default graph nodes to render
    await page.locator('[data-testid="condition-node"]').first().waitFor({ state: 'visible' })
    // Click the canvas to ensure keyboard shortcuts work
    await page.locator('[data-testid="canvas"]').click()
    await page.waitForTimeout(200)
  }

  test('@bdd adds a condition node via keyboard shortcut', async ({ page }) => {
    await page.goto('/')
    await focusCanvas(page)
    await page.keyboard.press('c')
    await page.waitForTimeout(500)
    await expect(page.locator('[data-testid="condition-node"]')).toHaveCount(2)
  })

  test('@bdd adds an action node via keyboard shortcut', async ({ page }) => {
    await page.goto('/')
    await focusCanvas(page)
    await page.keyboard.press('a')
    await page.waitForTimeout(500)
    await expect(page.locator('[data-testid="action-node"]')).toHaveCount(2)
  })

  test('@bdd edits a condition field value', async ({ page }) => {
    await page.goto('/')
    await page.locator('[data-testid="condition-field-select"]').waitFor({ state: 'visible' })
    const condition = page.locator('[data-testid="condition-node"]')
    const dropdown = condition.locator('[data-testid="field-dropdown"]')
    await dropdown.selectOption('urgency')
    await expect(dropdown).toHaveValue('urgency')
  })

  test('@bdd edits a condition value', async ({ page }) => {
    await page.goto('/')
    await page.locator('[data-testid="condition-value-select"]').waitFor({ state: 'visible' })
    const condition = page.locator('[data-testid="condition-node"]')
    const valueInput = condition.locator('[data-testid="value-input"]')
    await valueInput.selectOption('Moderate')
    await expect(valueInput).toHaveValue('Moderate')
  })

  test('@bdd orphan action disables Generate Rules', async ({ page }) => {
    await page.goto('/')
    await focusCanvas(page)
    await page.keyboard.press('a')
    await page.waitForTimeout(500)
    await expect(page.getByTestId('generate-rules-button')).toBeDisabled()
  })

  test('@bdd undo removes last edit', async ({ page }) => {
    await page.goto('/')
    await focusCanvas(page)
    await page.keyboard.press('c')
    await page.waitForTimeout(500)
    await expect(page.locator('[data-testid="condition-node"]')).toHaveCount(2)
    await page.keyboard.press('u')
    await page.waitForTimeout(500)
    await expect(page.locator('[data-testid="condition-node"]')).toHaveCount(1)
  })

  test('@bdd redo restores undone edit', async ({ page }) => {
    await page.goto('/')
    await focusCanvas(page)
    await page.keyboard.press('c')
    await page.keyboard.press('u')
    await page.waitForTimeout(500)
    await page.keyboard.press('r')
    await page.waitForTimeout(500)
    await expect(page.locator('[data-testid="condition-node"]')).toHaveCount(2)
  })

  test('@bdd delete removes selected node', async ({ page }) => {
    await page.goto('/')
    await focusCanvas(page)
    await page.keyboard.press('c')
    await page.waitForTimeout(500)
    await page.locator('[data-testid="condition-node"]').last().click()
    await page.keyboard.press('Delete')
    await page.waitForTimeout(500)
    await expect(page.locator('[data-testid="condition-node"]')).toHaveCount(1)
  })

  test('@bdd rename panel appears when node is selected', async ({ page }) => {
    await page.goto('/')
    await page.locator('[data-testid="condition-node"]').first().click()
    await page.waitForTimeout(500)
    await expect(page.getByTestId('rule-designer-rename-panel')).toBeVisible()
  })

  test('@bdd saves graph and posts to /rules endpoint', async ({ page }) => {
    await page.goto('/')
    await focusCanvas(page)
    await page.keyboard.press('c')
    await page.waitForTimeout(500)
    await page.click('[data-testid="save-button"]')
    const response = await page.waitForResponse((req) => req.url().includes('/rules'))
    expect(response.status()).toBe(200)
  })

  test('@bdd generates rules and shows rule count', async ({ page }) => {
    await page.goto('/')
    await page.click('[data-testid="generate-rules-button"]')
    await expect(page.getByTestId('rule-count')).toBeVisible()
  })

  test('@bdd reopens saved graph restores the graph', async ({ page }) => {
    await page.goto('/')
    await page.click('[data-testid="save-button"]')
    await page.waitForTimeout(500)
    await page.click('[data-testid="rule-designer-reopen-button"]')
    await page.waitForSelector('[data-testid="canvas"]', { state: 'visible' })
    await page.waitForTimeout(500)
    await expect(page.locator('[data-testid="canvas"]')).toBeVisible()
    await expect(page.locator('[data-testid="condition-node"]')).toBeVisible()
    await expect(page.locator('[data-testid="action-node"]')).toBeVisible()
  })
})
