import { computed } from 'vue'
import { theme } from 'ant-design-vue'
import { useThemeStore, themeColorMap } from '@/stores/theme'

/**
 * Bridges CSS variable theme to Ant Design ConfigProvider token.
 *
 * Reads --p-* CSS variables from <html> and maps them to Ant Design tokens.
 * When html class switches (theme-light ↔ theme-dark), the computed token
 * automatically updates because it reads from getComputedStyle at access time.
 */
export function useAntdThemeSync() {
  const themeStore = useThemeStore()

  const themeConfig = computed(() => {
    const algorithm = themeStore.style === 'default'
      ? theme.defaultAlgorithm
      : themeStore.darkMode
        ? theme.darkAlgorithm
        : theme.defaultAlgorithm

    const root = document.documentElement
    const st = getComputedStyle(root)

    const cssVar = (name: string) => st.getPropertyValue(name).trim()

    return {
      algorithm,
      token: {
        colorPrimary: themeStore.style === 'default'
          ? cssVar('--p-color-primary') || '#1890ff'
          : themeColorMap[themeStore.themeColor as keyof typeof themeColorMap],
        colorBgLayout: cssVar('--p-bg-page') || '#f0f2f5',
        colorBgContainer: cssVar('--p-bg-elevated') || '#fff',
        colorBgElevated: cssVar('--p-bg-elevated') || '#fff',
        colorBorder: cssVar('--p-border-default') || '#e8e8e8',
        colorBorderSecondary: cssVar('--p-border-divider') || '#e8e8e8',
        colorText: cssVar('--p-text-primary') || '#333',
        colorTextSecondary: cssVar('--p-text-secondary') || '#666',
        colorTextTertiary: cssVar('--p-text-tertiary') || '#999',
        colorBgMask: cssVar('--p-bg-mask') || 'rgba(0,0,0,0.45)',
        borderRadius: 6,
        borderRadiusLG: 8,
        borderRadiusSM: 4,
        fontFamily: cssVar('--p-sans'),
      },
    }
  })

  return { themeConfig }
}
