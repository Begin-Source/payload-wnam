import { test, expect } from '@playwright/test'
test('public frontend responds and shows a heading', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('h1').first()).toBeVisible()
  if (process.env.E2E_BASE_URL) await expect(page).toHaveURL(/\/[a-z]{2}(?:-[A-Za-z]+)?\/?$/)
})
