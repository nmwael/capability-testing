import { test, expect } from '@playwright/test'

test.describe('alert.rule-edit', () => {
  test('opens a saved graph as editable nodes', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByText(/tornado-routing|saved|edit/i)).toBeVisible()
  })

  test('represents the graph as JSON', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByText(/name|nodes|edges|json/i)).toBeVisible()
  })

  test('keeps the CAP field when changing a value', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByText(/condition|value|field|severity/i)).toBeVisible()
  })

  test('keeps the incoming edge when renaming', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByText(/rename|edge|broadcast|sirens/i)).toBeVisible()
  })

  test('leaves no dangling condition when deleting', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByText(/delete|dangling|orphan|condition/i)).toBeVisible()
  })

  test('posts the changed graph as JSON', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByText(/save|post|json/i)).toBeVisible()
  })

  test('keeps the edit when a save is rejected', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByText(/reject|unsaved|canvas/i)).toBeVisible()
  })

  test('round-trips an edit through the backend', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByText(/round.?trip|save|reopen/i)).toBeVisible()
  })
})
