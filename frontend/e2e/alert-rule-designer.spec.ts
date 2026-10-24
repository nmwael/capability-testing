import { test, expect } from '@playwright/test'

test.describe('alert.rule-designer', () => {
  async function focusCanvas(page) {
    await page.locator('.react-flow__node-condition').first().waitFor({ state: 'visible' })
    // autoFocus on the canvas handles focus; click a node to be safe
    await page.locator('[data-testid="condition-node"]').click()
  }

  test('@bdd adds a condition node via keyboard shortcut', async ({ page }) => {
    await page.goto('/')
    await focusCanvas(page)
    await page.keyboard.press('c')
    await expect(page.locator('.react-flow__node-condition')).toHaveCount(2)
  })

  test('@bdd adds an action node via keyboard shortcut', async ({ page }) => {
    await page.goto('/')
    await focusCanvas(page)
    await page.keyboard.press('a')
    await expect(page.locator('.react-flow__node-action')).toHaveCount(2)
  })

  test('@bdd edits a condition field value', async ({ page }) => {
    await page.goto('/')
    const condition = page.locator('[data-testid="condition-node"]')
    const dropdown = condition.locator('[data-testid="field-dropdown"]')
    await dropdown.selectOption('urgency')
    await expect(dropdown).toHaveValue('urgency')
  })

  test('@bdd edits a condition value', async ({ page }) => {
    await page.goto('/')
    const condition = page.locator('[data-testid="condition-node"]')
    const valueInput = condition.locator('[data-testid="value-input"]')
    await valueInput.selectOption('Moderate')
    await expect(valueInput).toHaveValue('Moderate')
  })

  test('@bdd orphan action disables Generate Rules', async ({ page }) => {
    await page.goto('/')
    await focusCanvas(page)
    await page.keyboard.press('a')
    await expect(page.getByTestId('generate-rules-button')).toBeDisabled()
  })

  test('@bdd undo removes last edit', async ({ page }) => {
    await page.goto('/')
    await focusCanvas(page)
    await page.keyboard.press('c')
    await expect(page.locator('.react-flow__node-condition')).toHaveCount(2)
    await page.keyboard.press('u')
    await expect(page.locator('.react-flow__node-condition')).toHaveCount(1)
  })

  test('@bdd redo restores undone edit', async ({ page }) => {
    await page.goto('/')
    await focusCanvas(page)
    await page.keyboard.press('c')
    await page.keyboard.press('u')
    await page.keyboard.press('r')
    await expect(page.locator('.react-flow__node-condition')).toHaveCount(2)
  })

  test('@bdd delete removes selected node', async ({ page }) => {
    await page.goto('/')
    await focusCanvas(page)
    await page.keyboard.press('c')
    await page.locator('.react-flow__node-condition').last().click()
    await page.keyboard.press('Delete')
    await expect(page.locator('.react-flow__node-condition')).toHaveCount(1)
  })

  test('@bdd rename panel appears when node is selected', async ({ page }) => {
    await page.goto('/')
    await page.locator('[data-testid="condition-node"]').click()
    await expect(page.getByTestId('rule-designer-rename-panel')).toBeVisible()
  })

  test('@bdd saves graph and posts to /rules endpoint', async ({ page }) => {
    await page.goto('/')
    await focusCanvas(page)
    await page.keyboard.press('c')
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
    await page.click('[data-testid="rule-designer-reopen-button"]')
    await expect(page.locator('[data-testid="canvas"]')).toBeVisible()
    await expect(page.locator('.react-flow__node-condition')).toBeVisible()
    await expect(page.locator('.react-flow__node-action')).toBeVisible()
  })
})