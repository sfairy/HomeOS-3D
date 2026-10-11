/**
 * 在家状态展示工具模块。
 *
 * 职责：
 * - 聚合人员在家状态，生成顶部徽章摘要文案；
 * - 生成设置页/详情页的人员状态描述；
 * - 判定是否已完成人员配置（用于决定是否显示引导）。
 *
 * 依赖：仅依赖传入的纯数据结构，不直接调用服务端 API。
 */

/** 在家状态成员结构：atHome 表示该成员当前是否在家 */
type PresenceMember = { atHome?: boolean; [key: string]: unknown }

/**
 * 顶部徽章：按聚合后的人员显示摘要。
 *
 * @param presence 包含 members 数组的在场状态对象
 * @returns 徽章文案；无人在家返回「无人在家」，否则返回「N人在家」
 */
export function formatPresenceBadgeSummary(
  presence: { members?: PresenceMember[] | unknown[] } | null | undefined,
) {
  if (!presence) return ''
  const members = Array.isArray(presence.members) ? presence.members : []
  const atHome = members.filter((m) => (m as PresenceMember).atHome)
  if (atHome.length === 0) return '无人在家'
  return `${atHome.length}人在家`
}

/**
 * 设置页等详情摘要：综合人员数量、在家数量、配置模式生成描述文案。
 *
 * @param members 人员列表（数组或未知类型，内部做数组归一化）
 * @param opts.loading 是否处于加载态（加载态优先返回「加载中…」）
 * @param opts.autoMode 是否为自动跟踪全部实体模式
 * @param opts.personCount 已配置人员数量（用于非自动模式下的展示）
 * @returns 拼接后的描述字符串
 */
export function formatPresenceDetailSummary(
  members: PresenceMember[] | unknown[] | unknown,
  {
    loading = false,
    autoMode = false,
    personCount = 0,
  }: { loading?: boolean; autoMode?: boolean; personCount?: number } = {},
) {
  if (loading) return '加载中…'
  const list = Array.isArray(members) ? members : []
  const atHome = list.filter((m) => (m as PresenceMember).atHome).length
  const total = list.length
  // 模式描述：自动模式与手动配置展示不同的提示文案
  const mode = autoMode ? '自动跟踪全部实体' : `已配置 ${personCount || total} 位人员`
  if (!total) return `暂无人员数据 · ${mode}`
  const homePart = atHome > 0 ? `${atHome} 人在家` : '无人在家'
  return `${homePart} · 共 ${total} 位 · ${mode}`
}

/**
 * 是否已配置人员判定（非自动模式，或已有成员数据）。
 *
 * 用于设置页判断是否需要展示「尚未配置人员」的引导卡片。
 *
 * @param presence 在场状态对象
 * @returns true 表示已配置；false 表示尚未配置需要引导
 */
export function isPresenceConfigured(
  presence:
    | { autoMode?: boolean; members?: PresenceMember[] | unknown[] }
    | null
    | undefined,
) {
  if (!presence) return false
  if (presence.autoMode === false) return true
  return Array.isArray(presence.members) && presence.members.length > 0
}