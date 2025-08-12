/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: '#62BBC1', // Greenleaf teal
          dark: '#3A8EA4',    // darker variant you used
        },
      },
      boxShadow: {
        card: '0 6px 20px -10px rgba(0,0,0,.15)',
      }
    },
  },
  plugins: [],
}
