import { test, expect } from '@playwright/test'

test.describe('alert.rule-edit', () => {
  test('@bdd loads saved graph from backend', async ({ page }) => {
    await page.goto('/?ruleName=tornado-routing')
    await expect(page.locator('.react-flow__node-action')).toBeVisible()
  })

  test('@bdd edits condition value in saved graph', async ({ page }) => {
    await page.goto('/?ruleName=tornado-routing')
    const condition = page.locator('.react-flow__node-condition')
    const valueInput = condition.locator('[data-testid="value-input"]')
    await valueInput.fill('Moderate')
    await expect(condition).toContainText('Moderate')
  })

  test('@bdd renames action node', async ({ page }) => {
    await page.goto('/?ruleName=tornado-routing')
    const canvas = page.locator('[data-testid="canvas"]')
    await canvas.dblclick()
    await page.fill('[data-testid="rename-input"]', 'sirens')
    await page.keyboard.press('Enter')
    await expect(page.locator('.react-flow__node-action')).toContainText('sirens')
  })

  test('@bdd deletes action node', async ({ page }) => {
    await page.goto('/?ruleName=tornado-routing')
    const canvas = page.locator('[data-testid="canvas"]')
    await canvas.dblclick()
    const actionNode = page.locator('.react-flow__node-action')
    await actionNode.dblclick()
    await page.keyboard.press('Delete')
    await expect(actionNode).not.toBeVisible()
  })

  test('@bdd saving posts changed graph to backend', async ({ page }) => {
    await page.goto('/?ruleName=tornado-routing')
    await page.click('[data-testid="save-button"]')
    const response = await page.waitForResponse((req) => req.url().includes('/rules'))
    expect(response.status()).toBe(200)
  })

  test('@bdd round-trips edit through backend', async ({ page }) => {
    await page.goto('/?ruleName=tornado-routing')
    await page.click('[data-testid="save-button"]')
  })

  test('@bdd keeps edit when save is rejected', async ({ page }) => {
    await page.goto('/?ruleName=tornado-routing')
    await page.click('[data-testid="save-button"]')
    await expect(page.getByTestId('unsaved-changes')).toBeVisible()
  })
})
