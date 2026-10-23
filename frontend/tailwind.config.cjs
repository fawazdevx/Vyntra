/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        spawn: {
          bg: '#05050a',
          elev: '#0a0b12',
          panel: '#0e1019',
          card: '#12141f',
          hover: '#171a28',
          border: '#1e2235',
          'border-strong': '#2a3050',
          accent: '#8b5cf6',
          'accent-soft': '#a78bfa',
          cyan: '#22d3ee',
          pink: '#f472b6',
          muted: '#8b92a8',
          faint: '#5c647a',
          success: '#34d399',
          danger: '#fb7185',
          warn: '#fbbf24',
        },
      },
      fontFamily: {
        sans: ['DM Sans', 'system-ui', 'sans-serif'],
        display: ['Space Grotesk', 'DM Sans', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        glow: '0 0 60px -12px rgba(139, 92, 246, 0.45)',
        'glow-sm': '0 0 24px -8px rgba(139, 92, 246, 0.35)',
        'glow-cyan': '0 0 40px -10px rgba(34, 211, 238, 0.35)',
        card: '0 1px 0 0 rgba(255,255,255,0.04) inset, 0 20px 40px -24px rgba(0,0,0,0.7)',
      },
      backgroundImage: {
        'grid-fade':
          'linear-gradient(to right, rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.03) 1px, transparent 1px)',
        'hero-shine':
          'radial-gradient(ellipse 80% 60% at 50% -20%, rgba(139, 92, 246, 0.28), transparent 55%)',
      },
      animation: {
        'fade-up': 'fadeUp 0.5s ease-out both',
      },
      keyframes: {
        fadeUp: {
          '0%': { opacity: '0', transform: 'translateY(12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
}
