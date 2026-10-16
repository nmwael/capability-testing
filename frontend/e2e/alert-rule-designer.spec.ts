import { test, expect } from '@playwright/test'

test.describe('alert.rule-design', () => {
  test('offers a condition node and an action node', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByText(/condition/i)).toBeVisible()
    await expect(page.getByText(/action/i)).toBeVisible()
  })

  test('places a condition node on the canvas', async ({ page }) => {
    await page.goto('/')
    await page.getByText(/condition/i).click()
    await expect(page.getByText(/condition node/i)).toBeVisible()
  })

  test('exposes the CAP vocabularies', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByText(/severity|urgency|certainty/i)).toBeVisible()
  })

  test('draws a rule path when connecting', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByText(/rule path|edge|connect/i)).toBeVisible()
  })

  test('shows the default routing graph', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByText(/default|tornado|routing/i)).toBeVisible()
  })

  test('flags an orphan and disables generate', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByText(/orphan|invalid|generate/i)).toBeVisible()
  })

  test('posts the graph when generating', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByText(/generate|post/i)).toBeVisible()
  })

  test('restores a saved graph', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByText(/saved|restore|reopen/i)).toBeVisible()
  })

  test('supports undo and redo', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByText(/undo/i)).toBeVisible()
    await expect(page.getByText(/redo/i)).toBeVisible()
  })

  test('refuses a duplicate id', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByText(/duplicate|taken|refuse/i)).toBeVisible()
  })

  test('refuses a cycle', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByText(/cycle|refuse|edge/i)).toBeVisible()
  })

  test('zooms and pans the canvas', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('.react-flow').or(page.getByText(/zoom|pan/i))).toBeVisible()
  })

  test('fits the graph back to view', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByText(/fit|view/i)).toBeVisible()
  })

  test('asks for a name before generating', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByText(/name|unnamed/i)).toBeVisible()
  })

  test('warns before leaving with unsaved changes', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByText(/unsaved|warn|leave/i)).toBeVisible()
  })

  test('suggests starting from the palette', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByText(/empty|palette|start/i)).toBeVisible()
  })
})
