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

test('own song page title can be renamed inline and persists', async ({ page }) => {
  const originalTitle = `Rename Me ${Date.now()}`
  const renamedTitle = `Renamed ${Date.now()}`

  await publishSong(page, originalTitle)
  const profileUrl = page.url()

  await page.getByTestId('profile-song-row').first().locator('a').click()
  await expect(page).toHaveURL(/#\/song\//, { timeout: 15_000 })

  const editor = page.getByTestId('song-title-editor')
  await expect(editor).toContainText(originalTitle)
  await editor.fill(renamedTitle)
  await editor.press('Tab')
  await expect(editor).toHaveAttribute('data-save-version', '1', { timeout: 15_000 })

  await page.reload()
  await expect(page.getByTestId('song-title-editor')).toContainText(renamedTitle, { timeout: 15_000 })

  await page.goto(profileUrl)
  await expect(page.getByTestId('profile-song-row').first()).toContainText(renamedTitle, {
    timeout: 15_000,
  })
})
