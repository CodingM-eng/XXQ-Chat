/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#faf5ff',
          100: '#f3e8ff',
          200: '#e9d5ff',
          300: '#d8b4fe',
          400: '#c084fc',
          500: '#a855f7',
          600: '#7c3aed', // Primary XXQ Royal Purple
          700: '#6d28d9',
          800: '#581c87',
          900: '#3b0764',
          950: '#1e0538',
        },
        chat: {
          bg: '#08070b',
          sidebar: '#0f0d15',
          card: '#171520',
          surface: '#1d1a29',
          bubbleOut: '#7c3aed',
          bubbleIn: '#1a1824',
          border: '#2a2538',
          textMuted: '#948fa3',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
