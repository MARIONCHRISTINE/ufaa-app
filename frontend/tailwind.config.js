/** @type {import('tailwindcss').Config} */

// Every colour family the app uses reads from a CSS variable (see src/palette.css), so switching the
// `dark` class on <html> re-themes the whole UI without per-element dark: variants.
const SHADES = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];
const family = (name) =>
  Object.fromEntries(SHADES.map((s) => [s, `rgb(var(--${name}-${s}) / <alpha-value>)`]));
const token = (name) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        slate: family('slate'),
        red: family('red'),
        green: family('green'),
        amber: family('amber'),
        orange: family('orange'),
        sky: family('sky'),
        blue: family('blue'),
        indigo: family('indigo'),
        violet: family('violet'),
        page: token('page'),
        surface: token('surface'),
        ink: token('ink'),
        heading: token('heading'),
        airtel: { DEFAULT: '#CC0000', dark: '#990000', light: '#fef2f2' },
        navy: { DEFAULT: '#1e3a5f', dark: '#0f1e30' },
      },
      fontFamily: {
        sans: ['Outfit', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
