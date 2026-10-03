/**
 * Tailwind CSS 配置
 *
 * 自定义主题扩展：
 * - apple 色板：iOS 风格的灰度色系
 * - ios 色板：iOS 经典彩色（红/橙/黄/绿/蓝/靛/紫/粉）
 * - 大量自定义动画：shake/fadeIn/slideUp/scaleIn/float/shimmer/orbit/drift 等
 * - 发光阴影：glow-yellow/orange/green/blue/purple/pink/cyan/teal
 *
 * 覆盖 Tailwind 的 darkMode 为 'class' 模式（手动切换）
 */
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{vue,js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        apple: {
          50: '#f2f2f7',
          100: '#e5e5ea',
          200: '#d1d1d6',
          300: '#c7c7cc',
          400: '#aeaeb2',
          500: '#8e8e93',
          600: '#636366',
          700: '#48484a',
          800: '#3a3a3c',
          850: '#2c2c2e',
          900: '#1c1c1e',
          950: '#0d0d0f',
        },
        accent: {
          DEFAULT: '#0A84FF',
          50: '#e8f2ff',
          100: '#d0e6ff',
          200: '#a0ccff',
          300: '#70b3ff',
          400: '#4099ff',
          500: '#0A84FF',
          600: '#006ee6',
          700: '#0052ad',
          800: '#003774',
          900: '#001b3a',
        },
        ios: {
          red: '#FF3B30',
          orange: '#FF9500',
          yellow: '#FFCC00',
          green: '#34C759',
          mint: '#00C7BE',
          teal: '#30B0C7',
          cyan: '#32ADE6',
          blue: '#007AFF',
          indigo: '#5856D6',
          purple: '#AF52DE',
          pink: '#FF2D55',
        },
        dark: {
          50: '#f2f2f7',
          100: '#e5e5ea',
          200: '#d1d1d6',
          300: '#aeaeb2',
          400: '#8e8e93',
          500: '#636366',
          600: '#48484a',
          700: '#3a3a3c',
          800: '#2c2c2e',
          900: '#1c1c1e',
          950: '#0d0d0f',
        },
      },
      borderRadius: {
        apple: '16px',
        'apple-lg': '20px',
        'apple-xl': '24px',
        hos: 'var(--hos-radius-card)',
        'hos-panel': 'var(--hos-radius-panel)',
        'hos-shell': 'var(--hos-radius-shell)',
      },
      spacing: {
        'hos-xs': 'var(--hos-space-xs)',
        'hos-sm': 'var(--hos-space-sm)',
        'hos-md': 'var(--hos-space-md)',
        'hos-lg': 'var(--hos-space-lg)',
        'hos-xl': 'var(--hos-space-xl)',
        'hos-2xl': 'var(--hos-space-2xl)',
        'hos-3xl': 'var(--hos-space-3xl)',
      },
      fontSize: {
        micro: 'var(--premium-fs-micro)',
        caption: 'var(--premium-fs-caption)',
        'body-sm': 'var(--premium-fs-body-sm)',
        body: 'var(--premium-fs-body)',
        title: 'var(--premium-fs-title)',
        display: 'var(--premium-fs-display)',
        stat: 'var(--premium-fs-stat)',
        'widget-title': 'var(--premium-fs-widget-title)',
        'widget-label': 'var(--premium-fs-widget-label)',
      },
      boxShadow: {
        apple: '0 2px 12px rgba(0,0,0,0.12)',
        'apple-lg': '0 8px 32px rgba(0,0,0,0.15)',
        'glow-yellow': '0 0 30px rgba(255,204,0,0.15)',
        'glow-orange': '0 0 30px rgba(255,149,0,0.15)',
        'glow-green': '0 0 30px rgba(52,199,89,0.15)',
        'glow-blue': '0 0 30px rgba(0,122,255,0.15)',
        'glow-purple': '0 0 30px rgba(175,82,222,0.15)',
        'glow-pink': '0 0 30px rgba(255,45,85,0.15)',
        'glow-cyan': '0 0 30px rgba(50,173,230,0.15)',
        'glow-teal': '0 0 30px rgba(48,176,199,0.15)',
      },
      animation: {
        shake: 'shake 0.5s ease-in-out',
        'fade-in': 'fadeIn 0.4s ease-out',
        'slide-up': 'slideUp 0.5s var(--ease-spring)',
        'slide-down': 'slideDown 0.5s var(--ease-spring)',
        'scale-in': 'scaleIn 0.4s var(--ease-spring)',
        'bounce-soft': 'bounceSoft 0.6s var(--ease-spring)',
        'pulse-soft': 'pulseSoft 3s ease-in-out infinite',
        float: 'float 8s ease-in-out infinite',
        'float-slow': 'floatSlow 12s ease-in-out infinite',
        shimmer: 'shimmer 3s ease-in-out infinite',
        breathe: 'breathe 5s ease-in-out infinite',
        orbit: 'orbit 24s linear infinite',
        drift: 'drift 18s ease-in-out infinite',
        'glow-pulse': 'glowPulse 4s ease-in-out infinite',
      },
      keyframes: {
        shake: {
          '0%,100%': { transform: 'translateX(0)' },
          '25%': { transform: 'translateX(-8px)' },
          '75%': { transform: 'translateX(8px)' },
        },
        fadeIn: { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
        slideUp: {
          '0%': { transform: 'translateY(20px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        slideDown: {
          '0%': { transform: 'translateY(-20px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        scaleIn: {
          '0%': { transform: 'scale(0.9)', opacity: '0' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        bounceSoft: {
          '0%': { transform: 'scale(0.9)', opacity: '0' },
          '50%': { transform: 'scale(1.03)' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        pulseSoft: {
          '0%,100%': { opacity: '0.45', transform: 'scale(1)' },
          '50%': { opacity: '0.75', transform: 'scale(1.04)' },
        },
        float: {
          '0%,100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-8px)' },
        },
        floatSlow: {
          '0%,100%': { transform: 'translateY(0) rotate(0deg)' },
          '33%': { transform: 'translateY(-12px) rotate(1deg)' },
          '66%': { transform: 'translateY(6px) rotate(-1deg)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        breathe: {
          '0%,100%': { transform: 'scale(1)', opacity: '0.55' },
          '50%': { transform: 'scale(1.06)', opacity: '1' },
        },
        orbit: {
          '0%': { transform: 'rotate(0deg) translateX(120px) rotate(0deg)' },
          '100%': { transform: 'rotate(360deg) translateX(120px) rotate(-360deg)' },
        },
        drift: {
          '0%,100%': { transform: 'translate(0,0) scale(1)' },
          '25%': { transform: 'translate(25px,-12px) scale(1.04)' },
          '50%': { transform: 'translate(-8px,8px) scale(1.02)' },
          '75%': { transform: 'translate(-18px,-4px) scale(1.03)' },
        },
        glowPulse: {
          '0%,100%': { boxShadow: '0 0 20px rgba(0,122,255,0.1)' },
          '50%': { boxShadow: '0 0 40px rgba(0,122,255,0.25)' },
        },
      },
    },
  },
  plugins: [],
}
