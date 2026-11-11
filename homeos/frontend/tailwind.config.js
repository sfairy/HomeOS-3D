/**
 * Tailwind CSS 配置
 *
 * 只保留模板里实际用到的主题扩展：`animate-shake` / `animate-fade-in` / `animate-scale-in`
 * 三个动画（同名类在 main.css 等处另有定义，两份关键帧并存，删掉这里会改变层叠结果）。
 *
 * 覆盖 Tailwind 的 darkMode 为 'class' 模式（手动切换）
 */
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{vue,js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      animation: {
        shake: 'shake 0.5s ease-in-out',
        'fade-in': 'fadeIn 0.4s ease-out',
        'scale-in': 'scaleIn 0.4s var(--ease-spring)',
      },
      keyframes: {
        shake: {
          '0%,100%': { transform: 'translateX(0)' },
          '25%': { transform: 'translateX(-8px)' },
          '75%': { transform: 'translateX(8px)' },
        },
        fadeIn: { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
        scaleIn: {
          '0%': { transform: 'scale(0.9)', opacity: '0' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
      },
    },
  },
  plugins: [],
}
