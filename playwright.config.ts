import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: 'e2e',
  webServer: [
    {
      command: 'node e2e/mock-backend.mjs',
      port: 7777,
      reuseExistingServer: !process.env.CI,
    },
    {
      command: 'pnpm dev -- --strictPort',
      port: 5173,
      reuseExistingServer: !process.env.CI,
      env: {
        ...process.env,
        VITE_NOSTR_RELAYS: 'ws://127.0.0.1:7777/relay',
        VITE_BLOSSOM_URL: 'http://127.0.0.1:7777/blossom',
      },
    },
  ],
  use: {
    baseURL: 'http://localhost:5173',
  },
})
