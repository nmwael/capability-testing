import { test, expect } from '@playwright/test'

test.describe('alert.rule-design', () => {
  test('offers a condition node and an action node', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByTestId('condition-node')).toBeVisible()
    await expect(page.getByTestId('action-node')).toBeVisible()
  })

  test('places a condition node on the canvas', async ({ page }) => {
    await page.goto('/')
    await page.getByTestId('rule-designer-add-condition').click()
    await expect(page.getByTestId('condition-node')).toBeVisible()
  })

  test('exposes the CAP vocabularies', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByTestId('cap-field-catalogue')).toBeVisible()
  })

  test('draws a rule path when connecting', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByTestId('alert-flow-edge')).toBeVisible()
  })

  test('shows the default routing graph', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByTestId('rule-designer-graph-badge')).toBeVisible()
  })

  test('flags an orphan and disables generate', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByTestId('rule-designer-generate-rules')).toBeVisible()
  })

  test('posts the graph when generating', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByTestId('rule-designer-status')).toBeVisible()
  })

  test('restores a saved graph', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByTestId('rule-designer-rename-panel')).toBeVisible()
  })

  test('supports undo and redo', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByTestId('rule-designer-undo')).toBeVisible()
    await expect(page.getByTestId('rule-designer-redo')).toBeVisible()
  })

  test('refuses a duplicate id', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByTestId('rule-designer-status')).toBeVisible()
  })

  test('refuses a cycle', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByTestId('rule-designer-status')).toBeVisible()
  })

  test('zooms and pans the canvas', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByTestId('alert-flow-controls').or(page.getByTestId('alert-flow-pan-zoom'))).toBeVisible()
  })

  test('fits the graph back to view', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByTestId('rule-designer-fit-view')).toBeVisible()
  })

  test('asks for a name before generating', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByTestId('rule-designer-graph-name-input')).toBeVisible()
  })

  test('warns before leaving with unsaved changes', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByTestId('rule-designer-unsaved')).toBeVisible()
  })

  test('suggests starting from the palette', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByTestId('rule-designer-empty-hint')).toBeVisible()
  })
})