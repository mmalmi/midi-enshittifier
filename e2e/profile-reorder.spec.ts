import { test, expect } from '@playwright/test'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const FIXTURE = path.join(__dirname, 'fixtures', 'test.mid')

async function publishSong(page: import('@playwright/test').Page, title: string) {
  await page.goto('/')
  await page.locator('input[type="file"]').setInputFiles(FIXTURE)
  await page.getByTestId('enshittify-btn').click()
  await expect(page.getByTestId('download-btn')).toBeVisible()
  await page.getByPlaceholder('Name the masterpiece').fill(title)
  await page.getByRole('button', { name: 'Publish' }).click()
  await expect(page).toHaveURL(/#\/u\/npub1/, { timeout: 15_000 })
  await expect(page.getByText(title)).toBeVisible({ timeout: 15_000 })
}

test('profile song order can be reordered and persists after reload', async ({ page }) => {
  const firstTitle = `Order First ${Date.now()}`
  const secondTitle = `Order Second ${Date.now()}`

  await publishSong(page, firstTitle)
  await publishSong(page, secondTitle)

  const rows = page.getByTestId('profile-song-row')
  await expect(rows.first()).toContainText(secondTitle)
  await expect(rows.nth(1)).toContainText(firstTitle)

  await rows.nth(1).dragTo(rows.first(), { targetPosition: { x: 32, y: 4 } })

  await expect(rows.first()).toContainText(firstTitle, { timeout: 10_000 })
  await expect(rows.nth(1)).toContainText(secondTitle)
  await expect(rows.first()).toHaveAttribute('draggable', 'true', {
    timeout: 10_000,
  })

  await page.reload()

  const reloadedRows = page.getByTestId('profile-song-row')
  await expect(reloadedRows.first()).toContainText(firstTitle, { timeout: 10_000 })
  await expect(reloadedRows.nth(1)).toContainText(secondTitle)
})
