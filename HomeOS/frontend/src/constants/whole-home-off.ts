/**
 * 全屋关闭配置常量与工具函数
 *
 * 职责：
 * - 维护「全屋关闭」功能的默认配置（`layout.wholeHomeOff`）。
 * - 提供配置创建、规范化、权限判定与确认文案生成等工具函数。
 * - 供顶栏「全屋关闭」按钮与语音指令「全屋关闭」共用。
 *
 * 依赖：`@/types/whole-home-off` 中的相关类型定义。
 *
 * 注意：
 * - `roles` 取值（admin / adult / child / guest）为角色标识符，不翻译。
 * - 域 key（lights / covers / climate / switches）为配置 key，不翻译。
 */
import type {
  LayoutWithWholeHomeOff,
  WholeHomeOffConfig,
  WholeHomeOffRole,
} from '@/types/whole-home-off'
/** 全屋关闭默认配置（layout.wholeHomeOff） */
const DEFAULT_WHOLE_HOME_OFF: WholeHomeOffConfig = {
  /** 总开关：顶栏按钮与语音「全屋关闭」 */
  enabled: true,
  /** 是否关闭灯光 */
  lights: true,
  /** 是否关闭窗帘（拉合） */
  covers: true,
  /** 是否关闭空调 / 风扇 */
  climate: true,
  /** 是否关闭通用开关（默认关闭以避免误关冰箱等设备） */
  switches: false,
  /** 允许触发全屋关闭的角色列表 */
  roles: ['admin', 'adult'],
  /** 始终排除的 entity_id */
  excludeEntities: [],
  /** 非空时仅操作列表内实体（按域过滤） */
  entityIds: [],
}
/** 全屋关闭可选角色列表（权限配置用） */
export const WHOLE_HOME_OFF_ROLE_OPTIONS: WholeHomeOffRole[] = ['admin', 'adult', 'child', 'guest']
/**
 * 创建一份全屋关闭默认配置（深拷贝数组字段，避免共享引用）。
 *
 * @returns 独立的默认 WholeHomeOffConfig 对象。
 */
export function createDefaultWholeHomeOff(): WholeHomeOffConfig {
  return {
    ...DEFAULT_WHOLE_HOME_OFF,
    roles: [...DEFAULT_WHOLE_HOME_OFF.roles],
    excludeEntities: [],
    entityIds: [],
  }
}
/**
 * 规范化全屋关闭配置：合并默认值、校验角色与数组字段。
 *
 * @param raw - 用户输入的部分配置；为空时使用全部默认值。
 * @returns 合并并清洗后的完整 WholeHomeOffConfig。
 */
export function normalizeWholeHomeOff(raw: Partial<WholeHomeOffConfig> = {}): WholeHomeOffConfig {
  const roles = Array.isArray(raw.roles)
    ? raw.roles.filter((r): r is WholeHomeOffRole =>
        WHOLE_HOME_OFF_ROLE_OPTIONS.includes(r as WholeHomeOffRole),
      )
    : [...DEFAULT_WHOLE_HOME_OFF.roles]
  return {
    enabled: raw.enabled !== false,
    lights: raw.lights !== false,
    covers: raw.covers !== false,
    climate: raw.climate !== false,
    switches: raw.switches === true,
    roles: roles.length ? roles : [...DEFAULT_WHOLE_HOME_OFF.roles],
    excludeEntities: Array.isArray(raw.excludeEntities) ? raw.excludeEntities.filter(Boolean) : [],
    entityIds: Array.isArray(raw.entityIds) ? raw.entityIds.filter(Boolean) : [],
  }
}
/**
 * 从布局对象中读取并规范化全屋关闭配置。
 *
 * @param layout - 布局对象；为空时返回默认配置。
 * @returns 规范化后的 WholeHomeOffConfig。
 */
export function getWholeHomeOffConfig(
  layout: LayoutWithWholeHomeOff | null | undefined,
): WholeHomeOffConfig {
  return normalizeWholeHomeOff(layout?.wholeHomeOff)
}
/**
 * 判定指定角色是否可以使用「全屋关闭」功能。
 *
 * @param role - 当前用户角色；为空时返回 false。
 * @param layout - 布局对象，用于读取配置。
 * @returns 当功能已启用且角色在允许列表中时返回 true。
 */
export function canUseWholeHomeOff(
  role: string | null | undefined,
  layout: LayoutWithWholeHomeOff | null | undefined,
): boolean {
  const cfg = getWholeHomeOffConfig(layout)
  if (!cfg.enabled) return false
  if (!role) return false
  return cfg.roles.includes(role as WholeHomeOffRole)
}
/** 关闭域 key → 中文显示名（用于确认文案） */
const DOMAIN_LABELS: Record<string, string> = {
  lights: '灯光',
  covers: '窗帘',
  climate: '空调/风扇',
  switches: '开关',
}
/** 全屋关闭支持的设备域 key 联合类型 */
type WholeHomeOffDomainKey = 'lights' | 'covers' | 'climate' | 'switches'
/**
 * 当前启用的关闭域（用于确认文案）
 *
 * @param cfg - 全屋关闭配置。
 * @returns 已启用域的中文标签数组，按 lights → covers → climate → switches 顺序。
 */
function getWholeHomeOffDomainLabels(cfg: WholeHomeOffConfig): string[] {
  const labels: string[] = []
  for (const key of [
    'lights',
    'covers',
    'climate',
    'switches',
  ] as const satisfies WholeHomeOffDomainKey[]) {
    if (cfg[key]) labels.push(DOMAIN_LABELS[key])
  }
  return labels
}
/**
 * 生成全屋关闭确认提示文案。
 *
 * @param cfg - 全屋关闭配置。
 * @returns 形如「将关闭灯光、窗帘、空调/风扇，确定继续？」的文案；无启用域时返回提示。
 */
export function buildWholeHomeOffConfirmText(cfg: WholeHomeOffConfig): string {
  const labels = getWholeHomeOffDomainLabels(cfg)
  if (!labels.length) return '当前未启用任何关闭域，无法执行。'
  return `将关闭${labels.join('、')}，确定继续？`
}
