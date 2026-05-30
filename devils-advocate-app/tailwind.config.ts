import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        neon: {
          cyan: '#00F0FF',
          teal: '#00D4AA',
          'cyan-dim': '#00B4CC',
        },
        dark: {
          base: '#000000',
          surface: '#0A0A0F',
          elevated: '#111118',
          card: '#16161F',
          border: '#1E1E2A',
        },
      },
      fontFamily: {
        display: ['Montserrat', 'sans-serif'],
        body: ['Poppins', 'sans-serif'],
      },
      backdropBlur: {
        xs: '2px',
      },
      boxShadow: {
        'neon-sm': '0 0 10px rgba(0, 240, 255, 0.3)',
        'neon-md': '0 0 20px rgba(0, 240, 255, 0.4)',
        'neon-lg': '0 0 40px rgba(0, 240, 255, 0.5)',
        'neon-glow': '0 0 60px rgba(0, 240, 255, 0.6), 0 0 120px rgba(0, 240, 255, 0.3)',
      },
      animation: {
        'pulse-neon': 'pulseNeon 2s ease-in-out infinite',
        'glow-breathe': 'glowBreathe 3s ease-in-out infinite',
        'slide-up': 'slideUp 0.4s ease-out',
        'fade-in': 'fadeIn 0.3s ease-out',
      },
      keyframes: {
        pulseNeon: {
          '0%, 100%': { boxShadow: '0 0 10px rgba(0, 240, 255, 0.3)' },
          '50%': { boxShadow: '0 0 30px rgba(0, 240, 255, 0.6)' },
        },
        glowBreathe: {
          '0%, 100%': { opacity: '0.4' },
          '50%': { opacity: '0.8' },
        },
        slideUp: {
          '0%': { transform: 'translateY(20px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
      },
    },
  },
  plugins: [],
};

export default config;
