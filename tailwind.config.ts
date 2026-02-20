import type { Config } from 'tailwindcss';

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
          100: '#E8F5E0',
          50: '#F0F9EC'
        },
        cream: '#F5F0E8',
        'cream-dark': '#EDE5D8'
      }
    }
  },
  plugins: []
};

export default config;
