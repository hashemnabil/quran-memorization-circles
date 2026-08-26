/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Cairo', 'Tajawal', 'Segoe UI', 'system-ui', 'sans-serif'],
      },
      colors: {
        // Deep green: the identity colour of the Quran school.
        primary: {
          50: '#effaf4',
          100: '#d8f3e3',
          200: '#b4e6cb',
          300: '#82d2ac',
          400: '#4eb686',
          500: '#2b9a6b',
          600: '#1d7c55',
          700: '#186346',
          800: '#164e39',
          900: '#144030',
          950: '#09241b',
        },
        gold: {
          50: '#fdf9ed',
          100: '#f8efcd',
          200: '#f1dc98',
          300: '#e8c263',
          400: '#e1a83e',
          500: '#d98c26',
          600: '#c06c1e',
          700: '#a04f1c',
          800: '#833f1d',
          900: '#6c351b',
        },
      },
      boxShadow: {
        card: '0 1px 2px rgba(16, 24, 40, 0.04), 0 4px 16px rgba(16, 24, 40, 0.06)',
        'card-hover': '0 4px 8px rgba(16, 24, 40, 0.06), 0 12px 28px rgba(16, 24, 40, 0.10)',
      },
      keyframes: {
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'slide-up': {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.2s ease-out',
        'slide-up': 'slide-up 0.25s ease-out',
      },
    },
  },
  plugins: [],
};
