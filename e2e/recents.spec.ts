import { test, expect } from '@playwright/test'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const FIXTURE = path.join(__dirname, 'fixtures', 'test.mid')

test('recents flow works', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.goto('/#/')

  await page.locator('input[type="file"]').setInputFiles(FIXTURE)
  await page.getByTestId('enshittify-btn').click()
  await page.getByRole('button', { name: 'Share' }).click()

  await expect(page.locator('[data-testid="recents"]')).toBeVisible()
  await expect(page.locator('[data-testid="recents"]')).toContainText('test')

  await page.getByRole('button', { name: 'change' }).click()
  await expect(page.getByText('Drop a MIDI file here')).toBeVisible()

  await page.locator('[data-testid="recents"] button').first().click()
  await expect(
    page.locator('.card').filter({ has: page.getByRole('button', { name: 'change' }) }).first(),
  ).toContainText('test.mid', { timeout: 10_000 })
  await expect(page.getByTestId('download-btn')).toBeVisible()
})
