import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Kept the token name "lavender" — values are now a purple→pink scale
        // (fuchsia family) so every existing reference becomes purple-pink.
        lavender: {
          50: '#fdf4ff',
          100: '#fae8ff',
          200: '#f5d0fe',
          300: '#f0abfc',
          400: '#e879f9',
          500: '#d946ef',
          600: '#c026d3',
          700: '#a21caf',
          800: '#86198f',
          900: '#581c87',
        },
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        pill: '9999px',
      },
      boxShadow: {
        card: '0 4px 14px rgba(80, 60, 160, 0.08)',
      },
    },
  },
  plugins: [],
};
export default config;
