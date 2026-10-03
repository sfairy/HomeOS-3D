/**
 * @file background.ts
 * @module @homeos/shared/room
 * @brief 竖屏房间默认背景图预设与解析（前后端共用）。
 *
 * 职责：
 *  - 维护"背景图 id → 静态资源路径 / 中文标签 / 关键词"的预设表；
 *  - 提供按房间名称 / HA area_id 关键词推断默认背景图路径的工具函数。
 *
 * 关键依赖：
 *  - 静态资源置于仓库根目录 room_images/，由后端托管（path 形如 /room_images/xxx.png）；
 *  - 前端竖屏房间卡片在用户未自定义背景时调用 resolveRoomBackgroundUrl 兜底。
 *
 * 约定：
 *  - keywords 在小写下做子串匹配，关键词需避免歧义（如"卧"覆盖主卧/老人房/儿童房）；
 *  - 未命中任何关键词时返回 undefined，由调用方决定回退策略。
 */

/**
 * 竖屏房间默认背景图预设（来自 Aura room_images，置于仓库根目录 room_images/，由后端托管）。
 */
export interface RoomBackgroundPreset {
  id: string
  /** 静态资源路径，如 /room_images/living_room.png */
  path: string
  label: string
  /** 匹配房间名 / HA area_id 的关键词（小写比较） */
  keywords: string[]
}

/**
 * 竖屏房间默认背景图预设表（id → 资源路径 / 中文标签 / 关键词）。
 * 关键词用于 resolveRoomBackgroundUrl 按房间名或 HA area_id 的小写子串匹配。
 * 资源路径由后端托管静态文件 /room_images/ 目录提供。
 */
export const ROOM_BACKGROUND_PRESETS: readonly RoomBackgroundPreset[] = [
  {
    id: 'living_room',
    path: '/room_images/living_room.png',
    label: '客厅',
    keywords: ['客厅', 'living', 'lounge', '起居', '大厅'],
  },
  {
    id: 'bedroom',
    path: '/room_images/bedroom.png',
    label: '卧室',
    keywords: ['卧', 'bedroom', '床', '主人房', '儿童房', '老人房'],
  },
  {
    id: 'kitchen',
    path: '/room_images/kitchen.png',
    label: '厨房',
    keywords: ['厨房', 'kitchen', '厨'],
  },
  {
    id: 'bathroom',
    path: '/room_images/bathroom.png',
    label: '卫生间',
    keywords: ['卫', '浴', 'bathroom', 'toilet', '洗手间'],
  },
  {
    id: 'study',
    path: '/room_images/study.png',
    label: '书房',
    keywords: ['书', 'study', '办公', 'office'],
  },
  {
    id: 'balcony',
    path: '/room_images/balcony.png',
    label: '阳台',
    keywords: ['阳台', 'balcony'],
  },
  {
    id: 'terrace',
    path: '/room_images/terrace.png',
    label: '露台',
    keywords: ['露台', 'terrace', '天台', '屋顶'],
  },
  {
    id: 'entryway',
    path: '/room_images/entryway.png',
    label: '玄关',
    keywords: ['玄关', '入户', '门厅', 'entry', 'hallway', '走廊', '过道'],
  },
] as const

/**
 * 按房间名称或 HA area_id 推断默认背景图路径。
 */
export function resolveRoomBackgroundUrl(
  nameOrId: string,
  presets: readonly RoomBackgroundPreset[] = ROOM_BACKGROUND_PRESETS,
): string | undefined {
  const hay = String(nameOrId || '')
    .trim()
    .toLowerCase()
  if (!hay) return undefined
  for (const preset of presets) {
    if (preset.keywords.some((kw) => hay.includes(kw.toLowerCase()))) {
      return preset.path
    }
  }
  return undefined
}
