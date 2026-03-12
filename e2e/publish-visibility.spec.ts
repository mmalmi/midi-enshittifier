import { test, expect } from '@playwright/test'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const FIXTURE = path.join(__dirname, 'fixtures', 'test.mid')

test('published song is visible from a second browser context', async ({ browser }) => {
  const publisherContext = await browser.newContext()
  const viewerContext = await browser.newContext()

  const publisherPage = await publisherContext.newPage()
  await publisherPage.goto('/')
  await publisherPage.locator('input[type="file"]').setInputFiles(FIXTURE)
  await publisherPage.getByTestId('enshittify-btn').click()
  await expect(publisherPage.getByTestId('download-btn')).toBeVisible()

  const title = `Two Browser ${Date.now()}`
  await publisherPage.getByPlaceholder('Name the masterpiece').fill(title)
  await publisherPage.getByRole('button', { name: 'Publish' }).click()

  await expect(publisherPage).toHaveURL(/#\/u\/npub1/, { timeout: 15_000 })
  await expect(publisherPage.getByText(title)).toBeVisible({ timeout: 15_000 })

  const publishedProfileUrl = publisherPage.url()

  const viewerPage = await viewerContext.newPage()
  await viewerPage.goto(publishedProfileUrl)
  await expect(viewerPage.getByText(title)).toBeVisible({ timeout: 15_000 })

  await publisherContext.close()
  await viewerContext.close()
})
