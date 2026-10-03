/**
 * 家庭模式推荐模块。
 *
 * 职责：
 * - 识别未配置自动触发的家庭模式，提示用户补充触发条件；
 * - 统计近期触发来源，「全员离家」频繁时建议配置自动触发；
 * - 产出 RecommendInsightResult 供设置页家庭模式 tab 渲染。
 *
 * 依赖：recommend.types 类型、homeModeLogSourceLabel（@homeos/shared）。
 */
import type { RecommendInsightResult } from '@/utils/recommend/types'
import { homeModeLogSourceLabel, type HomeModeTriggerLogLike } from '@homeos/shared'

/** 家庭模式触发日志条目（与 @homeos/shared HomeModeTriggerLogLike 对齐） */
type HomeModeTriggerLog = HomeModeTriggerLogLike

/** 家庭模式推荐输入 */
interface HomeModeRecommendInput {
  /** 当前所有家庭模式配置 */
  modes: Array<{ id: string; name: string; triggers?: unknown[] | string | null }>
  /** 近期触发日志，用于统计来源频次 */
  triggerLogs: HomeModeTriggerLog[]
}

/** 触发来源 → 中文标签（统一走 shared，避免本地子集落「其他」） */
function recommendSourceLabel(source: string): string {
  return homeModeLogSourceLabel(source)
}

/**
 * 构建家庭模式推荐结果。
 *
 * 算法流程：
 * 1. 筛选未配置自动触发的模式（triggers 为空数组/空 JSON 字符串/null）；
 * 2. 统计 triggerLogs 来源频次，取 Top 3 生成 chips；
 * 3. 「全员离家」触发 ≥3 次时，建议为离家模式配置自动触发；
 * 4. hasActionable 取决于存在未配置模式或有强建议 banner。
 *
 * @param input 家庭模式与触发日志输入
 * @returns 推荐结果对象
 */
export function buildHomeModeRecommendations(
  input: HomeModeRecommendInput,
): RecommendInsightResult {
  const { modes, triggerLogs } = input
  const banners = []
  const groups = []

  // 筛选未配置自动触发的模式：triggers 可能为数组/JSON 字符串/null
  const modesWithoutTriggers = modes.filter((m) => {
    const tr = m.triggers
    if (Array.isArray(tr)) return tr.length === 0
    if (typeof tr === 'string') {
      // 字符串形式需尝试 JSON.parse，解析失败视为未配置
      try {
        const parsed = JSON.parse(tr)
        return !Array.isArray(parsed) || parsed.length === 0
      } catch {
        return true
      }
    }
    return true
  })

  if (modesWithoutTriggers.length) {
    groups.push({
      id: 'no-triggers',
      label: '未配置自动触发',
      chips: modesWithoutTriggers.slice(0, 6).map((m) => ({
        id: m.id,
        label: m.name,
        meta: '手动',
        variant: 'default' as const,
        payload: { modeId: m.id },
      })),
    })
  }

  // 统计触发来源频次，source 缺失时回退为 'manual'
  const sourceCounts = new Map<string, number>()
  for (const log of triggerLogs) {
    const src = String(log.source || log.reason || 'manual')
    sourceCounts.set(src, (sourceCounts.get(src) || 0) + 1)
  }
  const topSources = [...sourceCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3)

  if (topSources.length) {
    // 「全员离家」频繁触发但仍为手动，强建议配置自动触发
    const everyoneLeftCount = sourceCounts.get('everyone_left') || 0
    if (everyoneLeftCount >= 3) {
      banners.push({
        id: 'everyone-left-trigger',
        label: '「全员离家」触发频繁，建议为离家模式配置自动触发',
        actionLabel: '查看模式',
      })
    }
    groups.push({
      id: 'trigger-sources',
      label: '近期触发来源',
      chips: topSources.map(([src, count]) => ({
        id: src,
        label: recommendSourceLabel(src),
        meta: String(count),
        variant: 'default' as const,
      })),
    })
  }

  const hasActionable = modesWithoutTriggers.length > 0 || banners.length > 0
  return {
    domain: 'home-mode',
    title: '家庭模式推荐',
    summary: hasActionable
      ? `${modesWithoutTriggers.length} 个模式仍仅支持手动切换`
      : '家庭模式触发配置较为完善',
    hasActionable,
    banners,
    groups,
    linkTo: '/settings?tab=home-mode',
    linkLabel: '编辑家庭模式',
  }
}