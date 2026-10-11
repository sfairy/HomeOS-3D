/**
 * 推荐系统类型定义模块。
 *
 * 职责：
 * - 定义推荐系统核心数据结构（chip/group/banner/insight result）；
 * - 定义 EventLog 统计快照类型，供各推荐子模块共享。
 *
 * 被以下模块依赖：
 * - recommend/*-recommend.util.ts（各推荐子模块）
 * - 消费 RecommendInsightResult 的视图层组件
 */

/** 推荐 chip 变体类型：决定 chips 的渲染样式与交互行为 */
type RecommendChipVariant = 'default' | 'entity' | 'domain' | 'link' | 'action'

/** 推荐 chip：推荐卡中最小可交互单元 */
export interface RecommendChip {
  id: string
  label: string
  meta?: string
  title?: string
  variant?: RecommendChipVariant
  route?: string
  payload?: Record<string, unknown>
}

/** 推荐分组：包含一组相关 chips */
export interface RecommendGroup {
  id: string
  label: string
  chips: RecommendChip[]
}

/** 推荐 banner：顶部强提示条，可带操作按钮或深链 */
export interface RecommendBanner {
  id: string
  label: string
  actionLabel?: string
  /** 有值时按钮渲染为 RouterLink，优先于 banner-action 回调 */
  actionTo?: string
}

/** 推荐结果：单个推荐域的完整产出 */
export interface RecommendInsightResult {
  /** 推荐域标识（如 alert-rules、bindings、favorites 等） */
  domain: string
  title?: string
  /** 摘要文案，展示在推荐卡顶部 */
  summary: string
  /** 附加元信息（如缺口数量、过滤状态等） */
  meta?: string
  /** 是否存在可操作项（决定是否高亮展示） */
  hasActionable: boolean
  groups?: RecommendGroup[]
  banners?: RecommendBanner[]
  /** 跳转链接（通常指向设置页对应 tab） */
  linkTo?: string
  /** 跳转按钮文案 */
  linkLabel?: string
}

/** EventLog 统计快照：供推荐算法判断高频实体与写入分布 */
export interface EventLogStatsSnapshot {
  /** 记录总数 */
  total: number
  /** 按域分组的记录数 */
  byDomain: Record<string, number>
  /** 高频实体列表（按 count 降序） */
  topEntities: Array<{ entityId: string; count: number }>
}