/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        teal: {
          500: '#1D9E75',
          600: '#178a65',
          50:  '#e8f7f2',
          100: '#c6ecdf',
        },
        blue: {
          500: '#378ADD',
          50:  '#eaf2fc',
          100: '#c9def7',
        },
        warning: '#F9A825',
        surface: '#FFFFFF',
        bg: '#F7F9F7',
        border: '#E0E0E0',
        textPrimary: '#1C1C1C',
        textSecondary: '#6B6B6B',
      },
      maxWidth: {
        mobile: '390px',
      },
    },
  },
  plugins: [],
}
