/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        tavern: {
          50: '#f8f2e8',
          100: '#efe2c9',
          200: '#dfc39a',
          300: '#c69c68',
          400: '#a97444',
          500: '#87572f',
          600: '#684123',
          700: '#4d311d',
          800: '#342015',
          900: '#1f130d',
        },
        ember: {
          50: '#fff4de',
          100: '#ffe7ba',
          200: '#ffd089',
          300: '#ffb454',
          400: '#ee8f2f',
          500: '#c86a1d',
          600: '#9a4a15',
          700: '#6e3110',
          800: '#491f0d',
          900: '#2d1208',
        },
        moss: {
          50: '#eef3e6',
          100: '#d6e1c8',
          200: '#b4c69c',
          300: '#8da26d',
          400: '#678046',
          500: '#4e6536',
          600: '#3c4f2b',
          700: '#2d3d22',
          800: '#202c1a',
          900: '#141c11',
        }
      }
    },
  },
  plugins: [],
}
