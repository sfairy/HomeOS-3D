/**
 * 全屋关闭配置常量与工具函数
 *
 * 职责：
 * - 维护「全屋关闭」功能的默认配置（`layout.wholeHomeOff`）。
 * - 提供配置创建、规范化与确认文案生成等工具函数。
 * - 供顶栏「全屋关闭」按钮与设置页全屋关闭区段共用。
 *
 * 依赖：`@/shared/types/whole-home-off` 中的相关类型定义。
 *
 * 角色口径：HomeOS 是**单一管理员模型**，账号体系里**没有角色维度** ——
 * 后端 `security/auth_context.py` 已删除 `require_roles`，`users` 表也不再有 `role` 列
 * （退役列由启动期迁移清理）。因此这里**不设角色维度**：是否可用只由 `enabled` 决定，
 * 能力边界由后端登录会话（`require_user`）把关。历史 layout JSON 中遗留的 `roles`
 * 字段会被本模块的 `normalizeWholeHomeOff` 丢弃，后端 `strip_retired_layout_keys`
 * 也会在启动期把它从库里清掉。
 *
 * 注意：域 key（lights / covers / climate / switches）为配置 key，不翻译。
 */
import type { LayoutWithWholeHomeOff, WholeHomeOffConfig } from '@/shared/types/whole-home-off'
/** 全屋关闭默认配置（layout.wholeHomeOff） */
const DEFAULT_WHOLE_HOME_OFF: WholeHomeOffConfig = {
  /** 总开关：顶栏按钮入口 */
  enabled: true,
  /** 是否关闭灯光 */
  lights: true,
  /** 是否关闭窗帘（拉合） */
  covers: true,
  /** 是否关闭空调 / 风扇 */
  climate: true,
  /** 是否关闭通用开关（默认关闭以避免误关冰箱等设备） */
  switches: false,
  /** 始终排除的 entity_id */
  excludeEntities: [],
  /** 非空时仅操作列表内实体（按域过滤） */
  entityIds: [],
}
/**
 * 创建一份全屋关闭默认配置（深拷贝数组字段，避免共享引用）。
 *
 * @returns 独立的默认 WholeHomeOffConfig 对象。
 */
export function createDefaultWholeHomeOff(): WholeHomeOffConfig {
  return {
    ...DEFAULT_WHOLE_HOME_OFF,
    excludeEntities: [],
    entityIds: [],
  }
}
/**
 * 规范化全屋关闭配置：合并默认值、校验数组字段。
 *
 * 返回对象**不含** `roles` —— 传入的存量 `roles` 会被丢弃（单一管理员模型下无角色维度）。
 *
 * @param raw - 用户输入的部分配置；为空时使用全部默认值。
 * @returns 合并并清洗后的完整 WholeHomeOffConfig。
 */
export function normalizeWholeHomeOff(raw: Partial<WholeHomeOffConfig> = {}): WholeHomeOffConfig {
  return {
    enabled: raw.enabled !== false,
    lights: raw.lights !== false,
    covers: raw.covers !== false,
    climate: raw.climate !== false,
    switches: raw.switches === true,
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
 * 判定「全屋关闭」当前是否可用。
 *
 * 只由 `enabled` 决定：HomeOS 是单一管理员模型，不存在按角色收窄的路径
 * （能力边界由后端登录会话（`require_user`）把关，前端不再重复做可伪造的角色判断）。
 *
 * @param layout - 布局对象，用于读取配置。
 * @returns 功能已启用时返回 true。
 */
export function canUseWholeHomeOff(layout: LayoutWithWholeHomeOff | null | undefined): boolean {
  return getWholeHomeOffConfig(layout).enabled
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
