/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,jsx}',
    './src/components/**/*.{js,jsx}',
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          dark: '#08111A',
          navy: '#0D1B2A',
          surface: '#111D2E',
          cyan: '#00B4D8',
          'cyan-light': '#33C3DF',
          'cyan-deep': '#0077B6',
          platinum: '#A8B5C4',
          cream: '#F5F0E8',
          muted: '#6B7B8D',
        },
      },
      fontFamily: {
        heading: ['var(--font-jakarta)', 'system-ui', 'sans-serif'],
        body: ['var(--font-inter)', 'system-ui', 'sans-serif'],
      },
      letterSpacing: {
        premium: '0.05em',
      },
      maxWidth: {
        container: '1200px',
        narrow: '800px',
      },
    },
  },
  plugins: [],
}
