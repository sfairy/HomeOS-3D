/**
 * 设置侧栏搜索工具
 *
 * 所属模块：frontend / src / views / settings
 * 职责：提供设置侧栏的关键词搜索能力，包括搜索别名、按标题/分组/描述过滤、
 *      结果摊平、计数、高亮片段拆分与 tab 上下文解析。
 * 关键依赖：settings-nav.util 中的 pageDescription / tabLabel / groupLabel
 */

import { pageDescription, tabLabel, groupLabel } from '@/utils/registry/settings-nav.util'

// 设置导航中的单个 Tab 项结构（id / 标签 / 图标 / 是否独立保存）
type SettingsNavTabItem = {
  id: string
  label: string
  icon?: unknown
  independentSave?: boolean
}

// 设置导航分组结构（id / 标签 / 图标 / 包含的 Tab 列表）
type SettingsNavGroupItem = {
  id: string
  label: string
  icon?: unknown
  tabs: SettingsNavTabItem[]
}

/** 设置搜索别名（中文口语 / 微件名 → 对应 tab） */
const TAB_SEARCH_SYNONYMS: Record<string, string> = {
  family: '儿童模式 白名单 时段 关爱 媒体限时',
  floating: '浮动图层 安防面板 能源中心 关爱中心 门锁 智能中心',
  'life-accounts': '能源 电费 燃气 用水 电信',
  'env-health': '居家环境 IAQ 空气质量 温湿度',
  'security-modes': '安防区域 布防 撤防 紧急求助',
  'smart-services': '智能顾问 设备寿命 日程提醒 运维设备健康',
  diagnostics: '运维诊断 系统健康 HA 连接 运行日志 后端日志 商业授权 许可证 HWID',
  retention: '数据保留 清理 保留天数 数据库 历史数据 删除',
  network: 'HomeOS 网络 HomeOS 远程 HomeOS 远程访问地址 HomeOS 内网 HomeOS 内网地址 HomeOS 自身 本机 远程访问 外网 公网 IP IPv6 DDNS 端口 端口映射 原生端',
  connection: 'HA 连接 Home Assistant HA 服务地址 HA 局域网 HA 局域网地址 HA 外网 HA 外网地址 令牌 Token 实体同步',
  access: '访客密码 访客链接 门锁 临时分享',
  orchestrator: '场景 脚本 自动化 简易自动化',
}

// 判断单个 tab 是否匹配搜索词：综合 id / 标签 / 分组 / 描述 / 别名进行大小写不敏感包含匹配
function tabMatchesQuery(
  tabId: string,
  tabLabelText: string,
  groupId: string,
  query: string,
): boolean {
  const synonyms = TAB_SEARCH_SYNONYMS[tabId] || ''
  const desc = pageDescription(tabId) || ''
  const haystack = [tabId, tabLabelText, groupLabel(groupId), desc, tabLabel(tabId), synonyms]
    .join(' ')
    .toLowerCase()
  return haystack.includes(query)
}

/** 按标题、分组名、页面描述过滤侧栏导航 */
export function filterNavGroupsBySearch(
  groups: SettingsNavGroupItem[],
  rawQuery: string,
): SettingsNavGroupItem[] {
  const query = rawQuery.trim().toLowerCase()
  // 空查询直接返回原分组，保留全部 Tab
  if (!query) return groups
  return groups
    .map((group) => ({
      ...group,
      tabs: group.tabs.filter((tab) => tabMatchesQuery(tab.id, tab.label, group.id, query)),
    }))
    .filter((group) => group.tabs.length > 0)
}

// 将分组结构摊平为带 groupId/groupLabel 的行，便于在统一列表中渲染搜索结果
/** flattenNavSearchResults：函数，按签名入参返回处理结果。 */
export function flattenNavSearchResults(
  groups: SettingsNavGroupItem[],
): Array<SettingsNavTabItem & { groupId: string; groupLabel: string }> {
  const rows: Array<SettingsNavTabItem & { groupId: string; groupLabel: string }> = []
  for (const group of groups) {
    for (const tab of group.tabs) {
      rows.push({ ...tab, groupId: group.id, groupLabel: group.label })
    }
  }
  return rows
}

// 统计所有分组中的 Tab 总数
/** countNavTabs：函数，按签名入参返回处理结果。 */
export function countNavTabs(groups: SettingsNavGroupItem[]): number {
  let n = 0
  for (const g of groups) n += g.tabs.length
  return n
}

// 高亮片段：text 原文片段，match 标记是否匹配搜索词
type SearchHighlightPart = { text: string; match: boolean }

/** 将文本按搜索词拆成片段，供侧栏高亮（大小写不敏感） */
export function highlightSearchParts(text: string, rawQuery: string): SearchHighlightPart[] {
  const query = rawQuery.trim()
  if (!query) return [{ text, match: false }]
  const lower = text.toLowerCase()
  const q = query.toLowerCase()
  const parts: SearchHighlightPart[] = []
  let i = 0
  while (i < text.length) {
    const idx = lower.indexOf(q, i)
    if (idx === -1) {
      parts.push({ text: text.slice(i), match: false })
      break
    }
    if (idx > i) parts.push({ text: text.slice(i, idx), match: false })
    parts.push({ text: text.slice(idx, idx + q.length), match: true })
    i = idx + q.length
  }
  return parts.length ? parts : [{ text, match: false }]
}

// 解析指定 tabId 所在的分组与标签上下文，供面包屑等场景使用；未找到时返回 null
/** resolveNavTabContext：函数，按签名入参返回处理结果。 */
export function resolveNavTabContext(
  groups: SettingsNavGroupItem[],
  tabId: string,
): { groupId: string; groupLabel: string; tabLabel: string } | null {
  for (const group of groups) {
    const tab = group.tabs.find((t) => t.id === tabId)
    if (tab) {
      return { groupId: group.id, groupLabel: group.label, tabLabel: tab.label }
    }
  }
  return null
}
