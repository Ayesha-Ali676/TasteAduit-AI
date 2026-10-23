/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        sage: {
          dark: '#5C7057',     // Dark Sage: primary text, headings, primary buttons, strong borders
          DEFAULT: '#89A482',  // Sage Green: interactive buttons, active controls, indicators
          soft: '#ACC5A6',     // Soft Sage: secondary surfaces, card borders, tags
          mint: '#D1EDD3',     // Pale Mint: page background highlights, pill surfaces, repair card
          canvas: '#F4F9F4',   // Ultra-light mint background canvas
          card: '#FFFFFF',     // Crisp white for primary cards
          muted: '#495945',    // Muted dark sage for secondary text
        }
      },
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        'sage-soft': '0 10px 30px -5px rgba(92, 112, 87, 0.08)',
        'sage-card': '0 4px 25px -2px rgba(92, 112, 87, 0.07)',
        'sage-button': '0 8px 24px -4px rgba(92, 112, 87, 0.28)',
        'sage-glow': '0 0 35px -5px rgba(137, 164, 130, 0.35)',
      }
    },
  },
  plugins: [],
}
