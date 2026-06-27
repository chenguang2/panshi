/**
 * 分组名称 → 顶栏颜色映射
 *
 * 为每个分组分配一个确定性颜色，用于卡片顶栏背景 + 标签徽章。
 * 无分组时不返回颜色（使用默认样式）。
 */

export interface GroupColorScheme {
  topbarBg: string
  topbarFg: string
  topbarBorder: string
  badgeBg: string
  badgeFg: string
  badgeBorder: string
}

const COLOR_PALETTE: GroupColorScheme[] = [
  { topbarBg: 'oklch(55% 0.15 145 / 12%)',  topbarFg: 'oklch(40% 0.15 145)',  topbarBorder: 'oklch(55% 0.15 145 / 25%)',  badgeBg: 'oklch(55% 0.15 145 / 18%)',  badgeFg: 'oklch(35% 0.15 145)',  badgeBorder: 'oklch(55% 0.15 145 / 30%)'  },
  { topbarBg: 'oklch(55% 0.15 55 / 12%)',   topbarFg: 'oklch(40% 0.15 55)',   topbarBorder: 'oklch(55% 0.15 55 / 25%)',   badgeBg: 'oklch(55% 0.15 55 / 18%)',   badgeFg: 'oklch(35% 0.15 55)',   badgeBorder: 'oklch(55% 0.15 55 / 30%)'   },
  { topbarBg: 'oklch(55% 0.12 280 / 12%)',  topbarFg: 'oklch(40% 0.12 280)',  topbarBorder: 'oklch(55% 0.12 280 / 25%)',  badgeBg: 'oklch(55% 0.12 280 / 18%)',  badgeFg: 'oklch(35% 0.12 280)',  badgeBorder: 'oklch(55% 0.12 280 / 30%)'  },
  { topbarBg: 'oklch(55% 0.10 200 / 12%)',  topbarFg: 'oklch(40% 0.10 200)',  topbarBorder: 'oklch(55% 0.10 200 / 25%)',  badgeBg: 'oklch(55% 0.10 200 / 18%)',  badgeFg: 'oklch(35% 0.10 200)',  badgeBorder: 'oklch(55% 0.10 200 / 30%)'  },
  { topbarBg: 'oklch(60% 0.15 30 / 12%)',   topbarFg: 'oklch(45% 0.15 30)',   topbarBorder: 'oklch(60% 0.15 30 / 25%)',   badgeBg: 'oklch(60% 0.15 30 / 18%)',   badgeFg: 'oklch(40% 0.15 30)',   badgeBorder: 'oklch(60% 0.15 30 / 30%)'   },
  { topbarBg: 'oklch(50% 0.12 0 / 12%)',    topbarFg: 'oklch(40% 0.12 0)',    topbarBorder: 'oklch(50% 0.12 0 / 25%)',    badgeBg: 'oklch(50% 0.12 0 / 18%)',    badgeFg: 'oklch(35% 0.12 0)',    badgeBorder: 'oklch(50% 0.12 0 / 30%)'    },
  { topbarBg: 'oklch(55% 0.10 170 / 12%)',  topbarFg: 'oklch(40% 0.10 170)',  topbarBorder: 'oklch(55% 0.10 170 / 25%)',  badgeBg: 'oklch(55% 0.10 170 / 18%)',  badgeFg: 'oklch(35% 0.10 170)',  badgeBorder: 'oklch(55% 0.10 170 / 30%)'  },
  { topbarBg: 'oklch(55% 0.12 320 / 12%)',  topbarFg: 'oklch(40% 0.12 320)',  topbarBorder: 'oklch(55% 0.12 320 / 25%)',  badgeBg: 'oklch(55% 0.12 320 / 18%)',  badgeFg: 'oklch(35% 0.12 320)',  badgeBorder: 'oklch(55% 0.12 320 / 30%)'  },
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

export function getGroupColorStyle(groupName: string | null | undefined): Record<string, string> {
  const c = getGroupColor(groupName)
  if (!c) return {}
  return {
    backgroundColor: c.topbarBg,
    color: c.topbarFg,
    borderBottomColor: c.topbarBorder,
    '--badge-bg': c.badgeBg,
    '--badge-fg': c.badgeFg,
    '--badge-border': c.badgeBorder,
  }
}
