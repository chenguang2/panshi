import { onMounted, onUnmounted } from 'vue'
import { useThemeStore } from '@/stores/theme'

const LG_BREAKPOINT = 992

export function checkSidebarBreakpoint(width: number): boolean {
  return width < LG_BREAKPOINT
}

export function useSidebarResponsive() {
  const themeStore = useThemeStore()

  function onResize() {
    if (checkSidebarBreakpoint(window.innerWidth)) {
      if (!themeStore.sidebarCollapsed) {
        themeStore.toggleSidebar()
      }
    }
  }

  onMounted(() => {
    onResize()
    window.addEventListener('resize', onResize)
  })

  onUnmounted(() => {
    window.removeEventListener('resize', onResize)
  })
}
