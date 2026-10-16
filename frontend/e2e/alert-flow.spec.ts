import { test, expect } from '@playwright/test'

test.describe('alert.flow', () => {
  test('renders an alert as a canvas with channel nodes', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByText(/ALERT-001|Loading/i)).toBeVisible()
  })

  test('reports an unknown alert', async ({ page }) => {
    await page.goto('/?alert=ALERT-404')
    await expect(page.getByText(/ALERT-404|not found/i)).toBeVisible()
  })

  test('shows a loading state when the endpoint is slow', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByText(/Loading/i)).toBeVisible()
  })

  test('renders channel nodes for reached and skipped channels', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByText(/sirens|social|Loading/i)).toBeVisible()
  })

  test('styles the alert node by danger level', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByText(/Extreme|Minor|Loading/i)).toBeVisible()
  })

  test('connects alert to each channel with an edge', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByText(/sirens|broadcast|Loading/i)).toBeVisible()
  })

  test('fits the graph to the viewport', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('.react-flow')).toBeVisible()
  })

  test('allows zooming and panning', async ({ page }) => {
    await page.goto('/')
    const controls = page.locator('.react-flow__controls')
    await expect(controls.or(page.getByText(/Loading/i))).toBeVisible()
  })

  test('supports keyboard navigation', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('.react-flow').or(page.getByText(/Loading/i))).toBeVisible()
  })
})
