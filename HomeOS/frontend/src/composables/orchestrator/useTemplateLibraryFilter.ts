/**
 * 模板库搜索/标签筛选 composable
 *
 * 模块：orchestrator（联动器）
 * 职责：
 *  - 将原始模板列表/分组扁平化为统一的 TemplateLibraryEntry
 *  - 提供搜索框、标签筛选与分组结果展示
 *  - 派生结果摘要文案（如「显示 5 / 12」「12 个模板」）
 * 依赖：vue 的 ref/computed
 */
import { computed, ref, type Ref } from 'vue'

/** 模板库分组定义 */
interface TemplateLibraryGroup {
  /** 分组 id */
  id: string
  /** 分组展示名 */
  label: string
  /** 分组内模板列表 */
  templates: unknown[]
  /** 分组动作按钮文案（可选） */
  actionLabel?: string
}

/** 扁平化后的模板库条目，附带分组归属信息 */
interface TemplateLibraryEntry {
  /** 模板 id（缺失时回退到 filename/name） */
  id: string
  /** 模板名称 */
  name: string
  /** 模板描述 */
  description?: string
  /** 标签列表 */
  tags?: string[]
  /** 关联 domain 列表 */
  domains?: string[]
  /** 占位符数量（用于评估模板完整度） */
  placeholderCount?: number
  /** 所属分组 id */
  _groupId?: string
  /** 所属分组名 */
  _groupLabel?: string
  /** 所属分组动作文案 */
  _actionLabel?: string
  /** 原始模板对象，供后续取值 */
  _raw?: unknown
}

/**
 * 将原始模板对象规范化为 TemplateLibraryEntry
 * @param tpl 原始模板对象
 * @param group 所属分组（可选）
 * @returns 规范化后的条目，包含分组归属信息
 */
function normalizeTemplate(
  tpl: Record<string, unknown>,
  group?: TemplateLibraryGroup,
): TemplateLibraryEntry {
  return {
    id: String(tpl.id ?? tpl.filename ?? tpl.name ?? ''),
    name: String(tpl.name ?? ''),
    // 描述缺失时回退到 filename，避免 UI 显示空白
    description: tpl.description
      ? String(tpl.description)
      : tpl.filename
        ? String(tpl.filename)
        : '',
    tags: Array.isArray(tpl.tags) ? (tpl.tags as string[]) : [],
    domains: Array.isArray(tpl.domains) ? (tpl.domains as string[]) : [],
    placeholderCount: Number(tpl.placeholderCount ?? 0),
    _groupId: group?.id,
    _groupLabel: group?.label,
    _actionLabel: group?.actionLabel,
    _raw: tpl,
  }
}

/**
 * 检查条目是否匹配搜索词：在 name/description/tags/domains/_groupLabel 中查找
 * @param entry 模板条目
 * @param query 已转小写的搜索词
 * @returns 是否命中
 */
function matchesQuery(entry: TemplateLibraryEntry, query: string) {
  const haystack = [
    entry.name,
    entry.description,
    ...(entry.tags ?? []),
    ...(entry.domains ?? []),
    entry._groupLabel,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
  return haystack.includes(query)
}

/**
 * 模板库搜索 / 标签筛选 composable 入口
 * @param templates 兜底扁平模板列表 ref（当 groups 为空时使用）
 * @param groups 分组列表 ref
 * @returns 搜索词、激活标签、过滤后结果、分组结果、摘要文案等
 */
export function useTemplateLibraryFilter(
  templates: Ref<unknown[]>,
  groups: Ref<TemplateLibraryGroup[] | undefined>,
) {
  /** 搜索关键词 */
  const query = ref('')
  /** 当前激活的标签（空表示不限） */
  const activeTag = ref('')

  /** 扁平化所有模板：优先按 groups 展开，无 groups 时回退到 templates */
  const flatTemplates = computed(() => {
    const groupList = groups.value?.filter((g) => g.templates?.length) ?? []
    if (groupList.length) {
      return groupList.flatMap((group) =>
        (group.templates || []).map((tpl) =>
          normalizeTemplate(tpl as Record<string, unknown>, group),
        ),
      )
    }
    return (templates.value || []).map((tpl) => normalizeTemplate(tpl as Record<string, unknown>))
  })

  /** 标签候选列表：从扁平模板中收集去重，按中文 locale 排序 */
  const filterTags = computed(() => {
    const set = new Set<string>()
    for (const tpl of flatTemplates.value) {
      for (const tag of tpl.tags ?? []) set.add(tag)
    }
    return [...set].sort((a, b) => a.localeCompare(b, 'zh-CN'))
  })

  /** 过滤后的模板：按标签 + 关键词过滤，再按名称中文排序 */
  const filteredTemplates = computed(() => {
    let list = flatTemplates.value
    if (activeTag.value) {
      list = list.filter((tpl) => (tpl.tags ?? []).includes(activeTag.value))
    }
    const q = query.value.trim().toLowerCase()
    if (q) list = list.filter((tpl) => matchesQuery(tpl, q))
    return [...list].sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
  })

  /** 分组结果：有搜索词或无分组时合并展示，否则按 groups 分组 */
  const groupedResults = computed(() => {
    const q = query.value.trim()
    const list = filteredTemplates.value
    // 搜索中或无分组时统一展示，避免分组过散
    if (q || !groups.value?.length) {
      return [{ id: '_all', label: '', templates: list }]
    }
    return groups.value
      .map((group) => ({
        id: group.id,
        label: group.label,
        templates: list.filter((tpl) => tpl._groupId === group.id),
      }))
      .filter((group) => group.templates.length > 0)
  })

  /** 结果摘要文案：无结果时返回空串；过滤中显示「显示 X / Y」；默认显示「N 个模板」 */
  const resultMeta = computed(() => {
    const total = flatTemplates.value.length
    const shown = filteredTemplates.value.length
    if (!total) return ''
    if (query.value.trim() || activeTag.value) return `显示 ${shown} / ${total}`
    return `${total} 个模板`
  })

  /** 清空搜索词 */
  function clearQuery() {
    query.value = ''
  }

  /** 重置所有筛选条件 */
  function resetFilters() {
    query.value = ''
    activeTag.value = ''
  }

  return {
    query,
    activeTag,
    filterTags,
    filteredTemplates,
    groupedResults,
    resultMeta,
    clearQuery,
    resetFilters,
  }
}