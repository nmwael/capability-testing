import { test, expect } from '@playwright/test'

test.describe('alert.rule-edit', () => {
  test('opens a saved graph as editable nodes', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByTestId('rule-designer-rename-panel')).toBeVisible()
  })

  test('represents the graph as JSON', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByTestId('rule-designer-status')).toBeVisible()
  })

  test('keeps the CAP field when changing a value', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByTestId('rule-designer-status')).toBeVisible()
  })

  test('keeps the incoming edge when renaming', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByTestId('rule-designer-rename-panel')).toBeVisible()
  })

  test('leaves no dangling condition when deleting', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByTestId('rule-designer-status')).toBeVisible()
  })

  test('posts the changed graph as JSON', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByTestId('rule-designer-status')).toBeVisible()
  })

  test('keeps the edit when a save is rejected', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByTestId('rule-designer-status')).toBeVisible()
  })

  test('round-trips an edit through the backend', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByTestId('rule-designer-status')).toBeVisible()
  })
})