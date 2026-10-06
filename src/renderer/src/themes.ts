/** 主题清单与应用逻辑；配色值定义在 assets/main.css 的 [data-theme='…'] 块中。 */

export interface ThemeOption {
  id: string
  label: string
  /** 设置页预览色块：主色 / 侧栏色 / 底色 */
  primary: string
  sidebar: string
  base: string
}

export const THEMES: ThemeOption[] = [
  { id: 'light', label: '浅色', primary: '#2563eb', sidebar: '#0f172a', base: '#f8fafc' },
  { id: 'dark', label: '暗夜', primary: '#3b82f6', sidebar: '#080d18', base: '#0d1420' },
  { id: 'ocean', label: '海洋蓝', primary: '#0891b2', sidebar: '#0c2e36', base: '#f2f7f8' },
  { id: 'forest', label: '森林绿', primary: '#059669', sidebar: '#16281f', base: '#f5f7f2' },
  { id: 'sunset', label: '暖阳橙', primary: '#ea580c', sidebar: '#2b2018', base: '#faf5ee' }
]

export const DEFAULT_THEME = 'light'

export function applyTheme(id: string): void {
  const valid = THEMES.some((t) => t.id === id)
  document.documentElement.dataset.theme = valid ? id : DEFAULT_THEME
}
