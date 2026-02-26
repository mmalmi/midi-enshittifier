import { defineConfig, presetUno, presetIcons } from 'unocss'

export default defineConfig({
  presets: [
    presetUno(),
    presetIcons({
      scale: 1.2,
      extraProperties: {
        display: 'inline-block',
        'vertical-align': 'middle',
      },
    }),
  ],
  theme: {
    colors: {
      primary: {
        DEFAULT: '#e040fb',
        dark: '#c020db',
      },
      surface: {
        DEFAULT: '#1a1a2e',
        light: '#25253e',
        lighter: '#35354e',
      },
    },
  },
  shortcuts: {
    btn: 'px-4 py-2 rounded-lg font-medium cursor-pointer border-none transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed',
    'btn-primary':
      'btn bg-primary hover:bg-primary-dark text-white shadow-lg shadow-primary/25',
    'btn-secondary': 'btn bg-surface-light hover:bg-surface-lighter text-white',
    'btn-ghost':
      'btn bg-transparent border border-surface-lighter text-gray-300 hover:bg-surface-light',
    card: 'rounded-xl bg-surface-light p-4 border border-surface-lighter',
  },
})
