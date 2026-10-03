/**
 * @file useLifeView.ts
 * @module composables/life
 * @description 生活中心视图 composable：tab 切换、深链解析、设置入口与配置链接。
 *
 * 职责：
 * - 定义生活中心 5 个 tab（总览 / 居家环境 / 能源中心 / 关爱中心 / 智能中心）的元数据；
 * - 解析路由 ?tab= 与 ?panel= 深链，兼容旧 ?tab=daily / ?tab=life；
 * - Tab 行为对齐安防中心：点击只改本地 ref，不调用 router.replace，从根源避免异步导航回写把 Tab 打回。
 *
 * 依赖：
 * - vue（computed、onActivated、onMounted、ref、watch、Component）
 * - vue-router（useRoute）
 * - @lucide/vue（tab 图标）
 * - @/utils/registry/settings-route.util（设置路由注册表）
 */
import { computed, onActivated, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { Leaf, Wind, Zap, HeartHandshake, Brain } from '@lucide/vue'
import { SETTINGS_ROUTES } from '@/utils/registry/settings-route.util'
import type { Component } from 'vue'

// 生活中心 tab ID 白名单（顺序即展示顺序）
const LIFE_TAB_IDS = ['overview', 'env', 'energy', 'care', 'smart'] as const
/** LifeTabId：类型定义，字段语义见声明。 */
export type LifeTabId = (typeof LIFE_TAB_IDS)[number]

/** 单个 tab 的完整元数据：标签、提示、配色、图标、设置入口 */
type LifeTabMeta = {
  id: LifeTabId
  label: string
  hint: string
  emoji: string
  tone: string
  accent: string
  accentSub: string
  accentRgb: string
  icon: Component
  settingsTo: string
  settingsLabel: string
}

const LIFE_TAB_SET = new Set<string>(LIFE_TAB_IDS)

// 各 tab 完整元数据（颜色、图标、设置入口）
/** LIFE_TAB_META：对象常量，字段 / 方法语义见定义处。 */
export const LIFE_TAB_META: Record<LifeTabId, LifeTabMeta> = {
  overview: {
    id: 'overview',
    label: '生活总览',
    hint: '环境、能源、关爱与智能的健康状态一览',
    emoji: '🌿',
    tone: 'emerald',
    accent: '#2dd4bf',
    accentSub: '#fbbf24',
    accentRgb: '45, 212, 191',
    icon: Leaf,
    settingsTo: SETTINGS_ROUTES.envHealth(),
    settingsLabel: '环境与健康',
  },
  env: {
    id: 'env',
    label: '居家环境',
    hint: '室内空气、生活指数、舒适度与房间监测',
    emoji: '🌬️',
    tone: 'emerald',
    accent: '#2dd4bf',
    accentSub: '#38bdf8',
    accentRgb: '45, 212, 191',
    icon: Wind,
    settingsTo: SETTINGS_ROUTES.envHealth(),
    settingsLabel: '环境与健康',
  },
  energy: {
    id: 'energy',
    label: '能源中心',
    hint: '用电、账户余额与能耗分析',
    emoji: '⚡',
    tone: 'amber',
    accent: '#fbbf24',
    accentSub: '#34d399',
    accentRgb: '251, 191, 36',
    icon: Zap,
    settingsTo: SETTINGS_ROUTES.lifeAccounts(),
    settingsLabel: '生活账户',
  },
  care: {
    id: 'care',
    label: '关爱中心',
    hint: '看护监测与儿童模式',
    emoji: '💗',
    tone: 'pink',
    accent: '#fb7185',
    accentSub: '#fda4af',
    accentRgb: '251, 113, 133',
    icon: HeartHandshake,
    settingsTo: SETTINGS_ROUTES.family(),
    settingsLabel: '家庭与儿童',
  },
  smart: {
    id: 'smart',
    label: '智能中心',
    hint: '每日顾问、习惯与设备健康',
    emoji: '🧠',
    tone: 'violet',
    accent: '#34d399',
    accentSub: '#fbbf24',
    accentRgb: '52, 211, 153',
    icon: Brain,
    settingsTo: SETTINGS_ROUTES.smartServices(),
    settingsLabel: '智能服务',
  },
}

/**
 * 解析路由 ?tab= 为合法的 LifeTabId。
 * 兼容旧 ?tab=daily / ?tab=life（并入 env），未识别时回退到 overview。
 *
 * @param raw 路由 query.tab 原始值
 * @returns 合法的 LifeTabId
 */
function resolveLifeTab(raw: unknown): LifeTabId {
  const id = String(Array.isArray(raw) ? raw[0] : raw || '').trim()
  // 旧链接 ?tab=daily / ?tab=life 并入居家环境（生活指数见 panel=life）
  if (id === 'daily' || id === 'life') return 'env'
  return LIFE_TAB_SET.has(id) ? (id as LifeTabId) : 'overview'
}

/**
 * 居家环境 Hub 子页深链：?panel=life 或兼容 ?tab=life / daily。
 *
 * @param query 路由 query 对象
 * @returns panel hint 字符串（'life' 或空串）
 */
export function resolveEnvPanelHint(query: Record<string, unknown> | undefined | null): string {
  const panel = String(
    Array.isArray(query?.panel) ? query?.panel[0] : query?.panel || '',
  ).trim()
  if (panel) return panel
  const tab = String(Array.isArray(query?.tab) ? query?.tab[0] : query?.tab || '').trim()
  if (tab === 'life' || tab === 'daily') return 'life'
  return ''
}

/**
 * 生活中心视图 composable。
 *
 * Tab 行为对齐安防中心（useSecurityView）：
 * 点击只改本地 ref；URL ?tab= 只在进入页面 / keep-alive 激活时读入，
 * 点击路径不调用 router.replace，从根源避免异步导航回写把 Tab 打回。
 *
 * @returns lifeTab 当前 tab（可读写）；hubTabs 顶部 tab 列表；tabMeta 当前 tab 元数据；
 *          configLinks 设置入口链接；envPanelHint 居家环境 panel 深链；setLifeTab 切换 tab
 */
export function useLifeView() {
  const route = useRoute()
  // 本地 tab ref：仅由路由读入或点击 setLifeTab 改变，避免 router 回写
  const lifeTabRef = ref<LifeTabId>(resolveLifeTab(route.query.tab))

  /** 从路由读取 tab 并同步到本地 ref（仅当不同时更新） */
  function applyTabFromRoute() {
    const next = resolveLifeTab(route.query.tab)
    if (lifeTabRef.value !== next) lifeTabRef.value = next
  }

  // 路由 tab 变化时同步（如浏览器前进后退）
  watch(
    () => route.query.tab,
    () => {
      applyTabFromRoute()
    },
  )

  // keep-alive 激活时同步：从其他 tab 返回时恢复路由中的 tab
  onActivated(applyTabFromRoute)
  onMounted(applyTabFromRoute)

  /**
   * 切换 tab：仅改本地 ref，不调用 router.replace。
   * @param tab 目标 tab id 字符串
   */
  function setLifeTab(tab: string) {
    if (typeof tab !== 'string' || !LIFE_TAB_SET.has(tab)) return
    const next = tab as LifeTabId
    if (lifeTabRef.value !== next) lifeTabRef.value = next
  }

  // 可读写 computed：set 调用 setLifeTab
  const lifeTab = computed({
    get: () => lifeTabRef.value,
    set: (tab: string) => setLifeTab(tab),
  })

  // 顶部 tab 列表（id + label）
  const hubTabs = computed(() =>
    LIFE_TAB_IDS.map((id) => {
      const meta = LIFE_TAB_META[id]
      return { id, label: meta.label }
    }),
  )

  // 当前 tab 的完整元数据
  const tabMeta = computed(() => LIFE_TAB_META[lifeTab.value])

  // 居家环境 panel 深链
  const envPanelHint = computed(() => resolveEnvPanelHint(route.query as Record<string, unknown>))

  // 配置入口链接：生活账户 + 智能服务
  const configLinks = computed(() => [
    { label: '生活账户', to: SETTINGS_ROUTES.lifeAccounts() },
    { label: '智能服务', to: SETTINGS_ROUTES.smartServices() },
  ])

  return {
    lifeTab,
    hubTabs,
    tabMeta,
    configLinks,
    envPanelHint,
    setLifeTab,
  }
}
