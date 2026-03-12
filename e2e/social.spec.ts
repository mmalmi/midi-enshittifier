import { test, expect } from '@playwright/test'
import { nip19 } from 'nostr-tools'

const NPUB = nip19.npubEncode('f'.repeat(64))

test('feed route renders', async ({ page }) => {
  await page.goto('/#/feed')
  await expect(page.getByRole('heading', { name: 'Feed' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Refresh' })).toBeVisible()
})

test('profile route renders for npub', async ({ page }) => {
  await page.goto(`/#/u/${NPUB}`)
  await expect(page.getByText('No songs published yet.')).toBeVisible({ timeout: 12_000 })
})

test('song route shows not found for missing song', async ({ page }) => {
  await page.goto(`/#/song/${NPUB}/missing-song`)
  await expect(page.getByText('Song not found')).toBeVisible({ timeout: 12_000 })
})
