import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Token name "lavender" kept for backwards compatibility, but the values
        // are now a warm pink-mauve scale to match the soft "Taxr" mockup.
        // Text uses 700–900, surfaces use 50–200, accents 400–600.
        lavender: {
          50:  '#FDF7F9',
          100: '#FBE9EF',
          200: '#F4D2DE',
          300: '#E8AFC1',
          400: '#D58AA1',
          500: '#BF6582',
          600: '#9D4866',
          700: '#6E3247',
          800: '#451F2D',
          900: '#23131A',
        },
        // Coral / peach — accents, FAB, primary CTA.
        coral: {
          50:  '#FFF1F2',
          100: '#FFE0E4',
          200: '#FFC2CC',
          300: '#FF9AAA',
          400: '#FF7588',
          500: '#F75271',
          600: '#E12C58',
          700: '#B71D44',
        },
        // Card-blue from the mockup (the right "Apple" tile).
        sky2: {
          400: '#7CC4ED',
          500: '#5BAFE0',
          600: '#3F95C9',
        },
        // Card-purple from the mockup (middle "Target" tile).
        grape: {
          400: '#A78BFA',
          500: '#8B5CF6',
          600: '#7C3AED',
        },
        // Card-coral from the mockup (left "AutoCAD" tile).
        salmon: {
          400: '#FF9999',
          500: '#FF7676',
          600: '#F25757',
        },
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        pill: '9999px',
        '3xl': '1.5rem',
        '4xl': '2rem',
      },
      boxShadow: {
        card: '0 4px 14px rgba(190, 100, 130, 0.08)',
        shell: '0 30px 80px rgba(190, 100, 130, 0.18), 0 8px 24px rgba(190, 100, 130, 0.08)',
        tile: '0 12px 28px rgba(0, 0, 0, 0.10)',
        fab: '0 10px 28px rgba(247, 82, 113, 0.45)',
      },
    },
  },
  plugins: [],
};
export default config;
