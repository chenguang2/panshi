/**
 * 分组名称 → 颜色映射
 *
 * 方案 2：卡片左侧全高竖条 + chip 标签着色。
 * 标题栏保持默认底色，左侧 4px 竖条贯穿整卡高度。
 * 无分组时不返回颜色（使用默认样式）。
 */

export interface GroupColorScheme {
  leftBorder: string
  badgeBg: string
  badgeFg: string
  badgeBorder: string
}

const COLOR_PALETTE: GroupColorScheme[] = [
  { leftBorder: 'oklch(55% 0.18 180)', badgeBg: 'oklch(55% 0.18 180 / 18%)', badgeFg: 'oklch(36% 0.18 180)', badgeBorder: 'oklch(55% 0.18 180 / 30%)' },
  { leftBorder: 'oklch(55% 0.18 140)', badgeBg: 'oklch(55% 0.18 140 / 18%)', badgeFg: 'oklch(36% 0.18 140)', badgeBorder: 'oklch(55% 0.18 140 / 30%)' },
  { leftBorder: 'oklch(55% 0.18 90)',  badgeBg: 'oklch(55% 0.18 90 / 18%)',  badgeFg: 'oklch(36% 0.18 90)',  badgeBorder: 'oklch(55% 0.18 90 / 30%)'  },
  { leftBorder: 'oklch(55% 0.18 50)',  badgeBg: 'oklch(55% 0.18 50 / 18%)',  badgeFg: 'oklch(36% 0.18 50)',  badgeBorder: 'oklch(55% 0.18 50 / 30%)'  },
  { leftBorder: 'oklch(55% 0.18 20)',  badgeBg: 'oklch(55% 0.18 20 / 18%)',  badgeFg: 'oklch(36% 0.18 20)',  badgeBorder: 'oklch(55% 0.18 20 / 30%)'  },
  { leftBorder: 'oklch(55% 0.18 320)', badgeBg: 'oklch(55% 0.18 320 / 18%)', badgeFg: 'oklch(36% 0.18 320)', badgeBorder: 'oklch(55% 0.18 320 / 30%)' },
  { leftBorder: 'oklch(55% 0.18 280)', badgeBg: 'oklch(55% 0.18 280 / 18%)', badgeFg: 'oklch(36% 0.18 280)', badgeBorder: 'oklch(55% 0.18 280 / 30%)' },
  { leftBorder: 'oklch(55% 0.18 220)', badgeBg: 'oklch(55% 0.18 220 / 18%)', badgeFg: 'oklch(36% 0.18 220)', badgeBorder: 'oklch(55% 0.18 220 / 30%)' },
]

function hashString(str: string): number {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i)
    hash |= 0
  }
  return Math.abs(hash)
}

export function getGroupColor(groupName: string | null | undefined): GroupColorScheme | null {
  if (!groupName) return null
  const idx = hashString(groupName) % COLOR_PALETTE.length
  return COLOR_PALETTE[idx]
}

/** 卡片左侧全高竖条样式，用于卡片容器（.xx-card）的 :style */
export function getCardBorderStyle(groupName: string | null | undefined): Record<string, string> {
  const c = getGroupColor(groupName)
  if (!c) return {}
  return { borderLeft: `4px solid ${c.leftBorder}` }
}

/** 标题栏 chip/组标签颜色样式，用于顶栏（.xx-card-topbar）的 :style */
export function getGroupColorStyle(groupName: string | null | undefined): Record<string, string> {
  const c = getGroupColor(groupName)
  if (!c) return {}
  return {
    '--badge-bg': c.badgeBg,
    '--badge-fg': c.badgeFg,
    '--badge-border': c.badgeBorder,
  }
}
