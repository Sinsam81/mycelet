import type { Config } from 'tailwindcss';
import defaultTheme from 'tailwindcss/defaultTheme';

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        forest: {
          900: '#1A3409',
          800: '#2D5016',
          700: '#3A6B1E',
          600: '#4A7C2E',
          500: '#5E9440',
          400: '#7FAE5E',
          300: '#A5C98A',
          200: '#C9E2B6',
          100: '#E8F5E0',
          50: '#F0F9EC'
        },
        cream: '#F5F0E8',
        'cream-dark': '#EDE5D8'
      },
      fontFamily: {
        sans: ['var(--font-sans)', ...defaultTheme.fontFamily.sans],
        serif: ['var(--font-display)', 'Georgia', ...defaultTheme.fontFamily.serif]
      },
      boxShadow: {
        // Soft layered card shadow — calmer than Tailwind's default `shadow-md`.
        card: '0 1px 2px rgba(26, 52, 9, 0.06), 0 4px 16px rgba(26, 52, 9, 0.07)'
      }
    }
  },
  plugins: []
};

export default config;
