/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        brand:      "#62BBC1",   // primary
        "brand-dark": "#0F766E", // buttons, accents
      },
      boxShadow: {
        card: "0 1px 3px rgba(0,0,0,.08), 0 1px 2px rgba(0,0,0,.06)",
      },
      borderRadius: {
        "2xl": "1rem",
      },
    },
  },
  plugins: [],
};
