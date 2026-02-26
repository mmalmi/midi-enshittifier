import { test, expect } from '@playwright/test'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const FIXTURE = path.join(__dirname, 'fixtures', 'test.mid')
const REAL_MIDI = path.join(__dirname, 'fixtures', 'entertainer.mid')

test('shows drop zone on load', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText('Drop a MIDI file here')).toBeVisible()
})

test('upload MIDI → shows file info and enshittify button', async ({ page }) => {
  await page.goto('/')
  const fileInput = page.locator('input[type="file"]')
  await fileInput.setInputFiles(FIXTURE)

  await expect(page.getByText('test.mid')).toBeVisible()
  // All effects enabled by default, button should show count
  const btn = page.getByTestId('enshittify-btn')
  await expect(btn).toContainText('(12)')
  await expect(btn).toBeEnabled()
})

test('enshittify with defaults → download available', async ({ page }) => {
  await page.goto('/')
  const fileInput = page.locator('input[type="file"]')
  await fileInput.setInputFiles(FIXTURE)

  // All effects already on, just click enshittify
  await page.getByTestId('enshittify-btn').click()

  await expect(page.getByTestId('download-btn')).toBeVisible()
  await expect(page.getByText(/seed:/)).toBeVisible()
})

test('advanced toggle shows/hides effects panel', async ({ page }) => {
  await page.goto('/')
  const fileInput = page.locator('input[type="file"]')
  await fileInput.setInputFiles(FIXTURE)

  // Effects panel hidden by default
  await expect(page.getByText('Pan Flute Apocalypse')).not.toBeVisible()

  // Open advanced
  await page.getByTestId('advanced-toggle').click()
  await expect(page.getByText('Pan Flute Apocalypse')).toBeVisible()

  // Close advanced
  await page.getByTestId('advanced-toggle').click()
  await expect(page.getByText('Pan Flute Apocalypse')).not.toBeVisible()
})

test('disable all effects disables enshittify button', async ({ page }) => {
  await page.goto('/')
  const fileInput = page.locator('input[type="file"]')
  await fileInput.setInputFiles(FIXTURE)

  // Open advanced, disable all
  await page.getByTestId('advanced-toggle').click()
  await page.getByRole('button', { name: 'none' }).click()

  await expect(page.getByTestId('enshittify-btn')).toBeDisabled()
})

test('playing MIDI produces audio output', async ({ page }) => {
  // Spy on AudioBufferSourceNode.start — soundfont-player calls this per note
  await page.addInitScript(() => {
    ;(window as any).__audioStarts = 0
    const origStart = AudioBufferSourceNode.prototype.start
    AudioBufferSourceNode.prototype.start = function (...args: any[]) {
      ;(window as any).__audioStarts++
      return origStart.apply(this, args)
    }
  })

  await page.goto('/')
  const fileInput = page.locator('input[type="file"]')
  await fileInput.setInputFiles(REAL_MIDI)

  // Click play for original
  const playBtn = page.getByRole('button', { name: /Original/ })
  await playBtn.click()

  // Wait for soundfont loading to finish and playback to start (CDN fetch)
  await expect(playBtn).toContainText('⏹', { timeout: 30_000 })

  // Give scheduler time to dispatch notes
  await page.waitForTimeout(1500)

  const starts = await page.evaluate(() => (window as any).__audioStarts)
  expect(starts).toBeGreaterThan(0)
})

test('change file resets state', async ({ page }) => {
  await page.goto('/')
  const fileInput = page.locator('input[type="file"]')
  await fileInput.setInputFiles(FIXTURE)

  await expect(page.getByText('test.mid')).toBeVisible()

  await page.getByRole('button', { name: 'change' }).click()
  await expect(page.getByText('Drop a MIDI file here')).toBeVisible()
})

test('share → open shared URL → MIDI loads and enshittifies', async ({
  page,
  context,
}) => {
  // Grant clipboard permissions
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])

  await page.goto('/')
  const fileInput = page.locator('input[type="file"]')
  await fileInput.setInputFiles(FIXTURE)

  // Enshittify
  await page.getByTestId('enshittify-btn').click()
  await expect(page.getByTestId('download-btn')).toBeVisible()
  await expect(page.getByText(/seed:/)).toBeVisible()

  // Share — copies URL to clipboard
  await page.getByRole('button', { name: 'Share' }).click()
  await expect(page.getByRole('button', { name: 'Copied!' })).toBeVisible()

  // Read clipboard URL
  const sharedUrl = await page.evaluate(() => navigator.clipboard.readText())
  expect(sharedUrl).toContain('#nhash1')

  // Open shared URL in new page (same context = same IDB)
  const page2 = await context.newPage()
  await page2.goto(sharedUrl)

  // Should show file info (loaded from IDB)
  await expect(page2.getByText('shared.mid')).toBeVisible({ timeout: 10_000 })
  await expect(page2.getByText(/seed:/)).toBeVisible()
  await expect(page2.getByTestId('download-btn')).toBeVisible()
})
