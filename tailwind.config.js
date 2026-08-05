export default {
  content: [
    "./index.html",
    "./src/**/*.{js,jsx}"
  ],
  theme: {
    extend: {
      colors: {
        /* Editorial Ledger design tokens */
        'surface':                    '#faf9f5',
        'surface-bright':             '#faf9f5',
        'surface-container-lowest':   '#ffffff',
        'surface-container-low':      '#f5f4f0',
        'surface-container':          '#efeeea',
        'surface-container-high':     '#e9e8e4',
        'surface-container-highest':  '#e3e2df',
        'on-surface':                 '#1b1c1a',
        'on-surface-variant':         '#4e4636',
        'outline-variant':            '#d2c5b1',
        'inverse-surface':            '#30312e',
        'primary':                    '#795900',
        'primary-container':          '#d4a843',
        'primary-fixed':              '#ffdf9f',
        'primary-fixed-dim':          '#eec058',
        'on-primary':                 '#ffffff',
        'on-primary-fixed':           '#261a00',
        'on-primary-container':       '#553e00',
        'secondary':                  '#565e74',
        'secondary-container':        '#dae2fd',
        'secondary-fixed':            '#dae2fd',
        'secondary-fixed-dim':        '#bec6e0',
        'on-secondary-fixed':         '#131b2e',
        'on-secondary-fixed-variant': '#3f465c',
        'tertiary':                   '#494bd6',
        'tertiary-container':         '#a4a6ff',
        'tertiary-fixed':             '#e1e0ff',
        'tertiary-fixed-dim':         '#c0c1ff',
        'on-tertiary':                '#ffffff',
        'on-tertiary-fixed':          '#07006c',
        /* Legacy aliases */
        navy: { 950: '#0b1929', 900: '#131b2e', 800: '#1e293b', 700: '#334155' },
        gold: { 300: '#ffdf9f', 400: '#eec058', 500: '#d4a843', 600: '#795900' }
      },
      fontFamily: {
        'headline': ['Manrope', 'system-ui', 'sans-serif'],
        'body':     ['Inter', 'system-ui', 'sans-serif'],
        'label':    ['Inter', 'system-ui', 'sans-serif'],
      },
      // iOS safe-area-inset utilities. Use as pt-safe, pb-safe, pl-safe, pr-safe
      // or compose: className="pb-[calc(theme(spacing.4)+env(safe-area-inset-bottom))]".
      spacing: {
        'safe-t': 'env(safe-area-inset-top)',
        'safe-b': 'env(safe-area-inset-bottom)',
        'safe-l': 'env(safe-area-inset-left)',
        'safe-r': 'env(safe-area-inset-right)',
      },
      // Phone/tab-specific breakpoints. xs hits ~iPhone SE.
      screens: {
        'xs': '380px',
      },
    }
  },
  plugins: [],
}
