import { defineConfig, presetUno, presetIcons } from 'unocss'

export default defineConfig({
  safelist: [
    'bg-primary',
    'bg-primary-op10',
    'bg-surface-lighter',
    'border-primary',
    'border-primary-op30',
    'border-surface-lighter',
    'duration-100',
    'opacity-100',
    'rotate-90',
    'shadow-lg',
    'shadow-primary-op25',
    'text-gray-300',
    'text-white',
  ],
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
    btn: 'inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg font-medium cursor-pointer border border-transparent transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed',
    'btn-primary':
      'btn bg-primary hover:bg-primary-dark text-white shadow-lg shadow-primary/25',
    'btn-secondary':
      'btn bg-surface-lighter hover:bg-[#44446a] text-white shadow-sm',
    'btn-ghost':
      'btn bg-surface/40 border-surface-lighter text-white hover:bg-surface-light hover:border-primary',
    card: 'rounded-xl bg-surface-light p-4 border border-surface-lighter',
  },
})
