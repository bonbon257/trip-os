/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      // 允许 border-ink/12 这类细粒度透明度（含 @apply 场景）
      opacity: Object.fromEntries(
        Array.from({ length: 101 }, (_, i) => [String(i), String(i / 100)]),
      ),
      colors: {
        paper: '#FAF8F3',
        paperDeep: '#F3EFE6',
        ink: '#111111',
        inkSoft: '#6B655C',
        inkFaint: '#A29B90',
        line: '#111111',
        violet: '#7C5CFF',
        azure: '#2E7CF6',
        amber: '#FFC53D',
        moss: '#22A06B',
        rose: '#E5484D',
      },
      fontFamily: {
        sans: ['"PingFang SC"', '"Hiragino Sans GB"', '"Microsoft YaHei"', 'system-ui', 'sans-serif'],
      },
      borderRadius: { card: '16px', pane: '24px' },
      boxShadow: {
        note: '0 1px 0 #111111, 0 4px 16px rgba(17,17,17,0.05)',
        noteLg: '0 2px 0 #111111, 0 8px 24px rgba(17,17,17,0.07)',
        press: '0 0 0 #111111',
      },
      backgroundImage: {
        grid: 'linear-gradient(to right, rgba(17,17,17,0.045) 1px, transparent 1px), linear-gradient(to bottom, rgba(17,17,17,0.045) 1px, transparent 1px)',
      },
      backgroundSize: { grid: '24px 24px' },
    },
  },
  plugins: [],
};
