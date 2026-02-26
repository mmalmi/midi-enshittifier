import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import UnoCSS from 'unocss/vite'

export default defineConfig({
  // Use relative asset URLs so HTML works when loaded from hash/iframe wrappers.
  base: './',
  plugins: [UnoCSS(), svelte()],
  resolve: {
    alias: {
      $lib: '/src/lib',
    },
  },
})
