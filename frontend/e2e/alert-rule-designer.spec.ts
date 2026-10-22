import { test, expect } from '@playwright/test'

test.describe('alert.rule-designer', () => {
  test('@bdd adds a condition node via keyboard shortcut', async ({ page }) => {
    await page.goto('/')
    await page.keyboard.press('c')
    await expect(page.locator('.react-flow__node-condition')).toBeVisible()
  })

  test('@bdd adds an action node via keyboard shortcut', async ({ page }) => {
    await page.goto('/')
    await page.keyboard.press('a')
    await expect(page.locator('.react-flow__node-action')).toBeVisible()
  })

  test('@bdd edits a condition field value', async ({ page }) => {
    await page.goto('/')
    const condition = page.locator('.react-flow__node-condition')
    const dropdown = condition.locator('[data-testid="field-dropdown"]')
    await dropdown.click()
    await page.selectOption(dropdown, 'severity')
    await expect(condition).toContainText('severity:')
  })

  test('@bdd edits a condition value', async ({ page }) => {
    await page.goto('/')
    const condition = page.locator('.react-flow__node-condition')
    const valueInput = condition.locator('[data-testid="value-input"]')
    await valueInput.fill('Moderate')
    await expect(condition).toContainText('Moderate')
  })

  test('@bdd connects a condition to an action node', async ({ page }) => {
    await page.goto('/')
    await page.keyboard.press('c')
    await page.keyboard.press('a')
    const handles = page.locator('[data-cy="connection-handle"]')
    await handles.first().dblclick()
    await handles.last().dblclick()
    await expect(page.getByTestId('connection')).toBeVisible()
  })

  test('@bdd orphan action disables Generate Rules', async ({ page }) => {
    await page.goto('/')
    await page.keyboard.press('a')
    const generateButton = page.getByTestId('generate-rules-button')
    await expect(generateButton).toBeDisabled()
  })

  test('@bdd saves graph and posts to /rules endpoint', async ({ page }) => {
    await page.goto('/')
    await page.keyboard.press('c')
    await page.keyboard.press('a')
    await page.click('[data-testid="save-button"]')
    const response = await page.waitForResponse((req) => req.url().includes('/rules'))
    expect(response.status()).toBe(200)
  })

  test('@bdd generates rules and shows rule count', async ({ page }) => {
    await page.goto('/')
    await page.keyboard.press('c')
    await page.keyboard.press('a')
    await page.click('[data-testid="generate-rules-button"]')
    await expect(page.getByTestId('rule-count')).toBeVisible()
  })

  test('@bdd reopens saved graph restores the graph', async ({ page }) => {
    await page.goto('/')
    await page.click('[data-testid="save-button"]')
    await page.click('[data-testid="rule-designer-reopen-button"]')
    await expect(page.locator('.react-flow__node-condition')).toBeVisible()
    await expect(page.locator('.react-flow__node-action')).toBeVisible()
  })

  test('@bdd undo removes last edit', async ({ page }) => {
    await page.goto('/')
    await page.keyboard.press('c')
    await page.keyboard.press('u')
    await expect(page.locator('.react-flow__node-condition')).toBeVisible()
    await page.keyboard.press('u')
    await expect(page.locator('[data-testid="condition-node"]')).not.toBeVisible()
  })

  test('@bdd redo restores undone edit', async ({ page }) => {
    await page.goto('/')
    await page.keyboard.press('c')
    await page.keyboard.press('u')
    await page.keyboard.press('u')
    await page.keyboard.press('r')
    await expect(page.locator('.react-flow__node-condition')).toBeVisible()
  })

  test('@bdd delete removes selected node', async ({ page }) => {
    await page.goto('/')
    await page.keyboard.press('c')
    const canvas = page.locator('[data-testid="alert-flow-canvas"]')
    await canvas.dblclick()
    await page.keyboard.press('Delete')
    await expect(page.locator('[data-testid="condition-node"]')).not.toBeVisible()
  })

  test('@bdd rename panel appears when node is selected', async ({ page }) => {
    await page.goto('/')
    await page.keyboard.press('c')
    const canvas = page.locator('[data-testid="alert-flow-canvas"]')
    await canvas.dblclick()
    await expect(page.getByTestId('rule-designer-rename-panel')).toBeVisible()
  })
})
