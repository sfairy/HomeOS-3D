import { logger } from '@/utils/core/logger'
<!--
  SmartAdvisorWidget.vue / components/widgets/orchestrator
  智能顾问总卡片：编排 Hub 聚合 AI 建议（忘关灯/离家省电/气候优化/安防提示/漏水等），
  按分类 tab 筛选，支持「立即执行/稍后/忽略」三态反馈，顶部统计 emit 给外层仪表。
  Props: embedded 嵌入态隐藏 header / max-items 展示条数 / category 初始过滤
  Emit: stats(totals) 建议统计，用于 Hub 顶栏徽章
  依赖：services/api/system executeAdvisorTip / fetchAdvisorForgotten 接口；
        services/api/advisor fetchDailyAdvisor + markTipFeedback 接口；
        services/api/entities callService 执行建议；
        composables: useWidgetApiQuery 查询包装；
        Pinia: useChromeStore；
        advisor-tip-category.util 分类 ID 归一 + ADVISOR_TIP_CATEGORY_META。
  注意：RouterLink 跳转对应设置向导修复配置类建议；Lightbulb 等图标按 category 映射。
-->
<template>
  <div :class="['advisor-widget', embedded && 'advisor-widget--embedded']">
    <header v-if="!embedded" class="advisor-widget__head">
      <h3>{{ '智能顾问' }}</h3>
      <button
        type="button"
        class="advisor-widget__refresh"
        :disabled="loading"
        @click="query.retry()"
      >
        {{ '刷新' }}
      </button>
    </header>

    <ApiQueryState
      :loading="loading"
      :error="loadError"
      error-title="智能顾问加载失败"
      @retry="query.retry()"
    >
      <section
        v-if="forgotten.length"
        class="advisor-widget__section advisor-widget__section--warn"
      >
        <h4 class="advisor-widget__section-title">
          <AlertTriangle class="advisor-widget__section-icon" aria-hidden="true" />
          {{ '可能忘了关' }}
          <span class="advisor-widget__section-count">{{ forgotten.length }}</span>
        </h4>
        <div class="advisor-widget__list">
          <article
            v-for="d in forgotten"
            :key="d.entityId"
            class="advisor-widget__row advisor-widget__row--warn"
          >
            <span class="advisor-widget__row-icon advisor-widget__row-icon--warn">
              <AlertTriangle class="w-3.5 h-3.5" />
            </span>
            <div class="advisor-widget__row-body">
              <div class="advisor-widget__row-title-row">
                <span class="advisor-widget__row-title">{{ d.friendlyName }}</span>
                <span class="advisor-widget__row-badge advisor-widget__row-badge--warn">{{
                  '设备提醒'
                }}</span>
              </div>
              <p class="advisor-widget__row-message">{{ d.reason }}</p>
            </div>
            <div class="advisor-widget__row-actions">
              <button
                type="button"
                class="advisor-widget__action advisor-widget__action--warn"
                :disabled="turningOff === d.entityId"
                @click="turnOff(d.entityId)"
              >
                {{ turningOff === d.entityId ? '关闭中…' : '关闭' }}
              </button>
            </div>
          </article>
        </div>
      </section>

      <div v-if="!visibleTips.length && !forgotten.length" class="advisor-empty">
        <Lightbulb class="advisor-empty__icon" />
        <p class="advisor-empty__title">{{ '暂无建议' }}</p>
        <p class="advisor-empty__desc">{{ '系统将根据能耗、安防与使用习惯生成每日建议' }}</p>
      </div>

      <section v-if="visibleTips.length" class="advisor-widget__section">
        <h4
          v-if="embedded"
          class="advisor-widget__section-title advisor-widget__section-title--tips"
        >
          <Lightbulb class="advisor-widget__section-icon" aria-hidden="true" />
          {{ '今日建议' }}
          <span class="advisor-widget__section-count advisor-widget__section-count--tips">{{
            visibleTips.length
          }}</span>
        </h4>
        <div class="advisor-widget__list">
          <article
            v-for="(tip, i) in visibleTips"
            :key="i"
            :class="['advisor-widget__row', `advisor-widget__row--${tipCategoryId(tip.category)}`]"
          >
            <span
              :class="[
                'advisor-widget__row-icon',
                `advisor-widget__row-icon--${tipCategoryId(tip.category)}`,
              ]"
            >
              <component :is="tipCategoryIcon(tip.category)" class="w-3.5 h-3.5" />
            </span>
            <div class="advisor-widget__row-body">
              <div class="advisor-widget__row-title-row">
                <span class="advisor-widget__row-title">{{ tip.title }}</span>
                <span class="advisor-widget__row-badge">{{ tipCategoryLabel(tip.category) }}</span>
              </div>
              <p class="advisor-widget__row-message">{{ tip.message }}</p>
            </div>
            <div v-if="tip.actionable" class="advisor-widget__row-actions">
              <button
                v-if="tipActionable(tip) && !tipExecuted(tip.category)"
                type="button"
                class="advisor-widget__action"
                :disabled="executing === tip.category"
                @click="executeTip(tip.category)"
              >
                {{ executing === tip.category ? '执行中…' : '一键执行' }}
              </button>
              <span v-else-if="tipExecuted(tip.category)" class="advisor-widget__done">{{
                '已执行'
              }}</span>
              <span v-else-if="tipIgnored(tip.category)" class="advisor-widget__done">{{
                '已忽略'
              }}</span>
              <RouterLink
                v-else-if="!advisorActionsConfigured"
                :to="SETTINGS_ROUTES.smartServices('advisor') + '#tip-actions'"
                class="advisor-widget__action advisor-widget__action--link"
              >
                {{ '配置动作' }}
              </RouterLink>
            </div>
            <div
              v-if="tip.actionable && !tipExecuted(tip.category) && !tipIgnored(tip.category)"
              class="advisor-widget__row-dismiss"
            >
              <button
                type="button"
                class="advisor-widget__dismiss"
                :disabled="ignoring === tip.category"
                :aria-label="'忽略今日建议'"
                @click="ignoreTip(tip.category)"
              >
                {{ ignoring === tip.category ? '…' : '忽略' }}
              </button>
            </div>
          </article>
        </div>
      </section>
    </ApiQueryState>
  </div>
</template>

<script setup>
/**
 * @file SmartAdvisorWidget.vue
 * @module widgets/orchestrator
 * @description 智能顾问微件：展示当日顾问建议、遗忘设备提醒与可执行操作，
 *              支持一键执行顾问 tip 与反馈（有用/无用），按类别分组展示。
 * @dependencies
 *  - @homeos/shared: getEntityDomain 实体域判断
 *  - vue: ref/watch/computed 响应式与监听
 *  - vue-router: RouterLink 路由跳转
 *  - @lucide/vue: Lightbulb / AlertTriangle / Leaf / Shield / Zap / Droplets 图标
 *  - @/components/common/ApiQueryState.vue: 查询状态容器
 *  - @/services/api/system: 顾问 tip 执行与遗忘设备接口
 *  - @/services/api/advisor: 每日顾问与反馈接口
 *  - @/services/api/entities: HA 服务调用
 *  - @/stores/chrome.store: 全局通知
 *  - @/composables/api/useWidgetApiQuery: Widget 数据查询 composable
 *  - @/utils/config/frontend-config: 配置分区读取
 *  - @/utils/core/error-message: 错误信息提取
 *  - @/utils/advisor/advisor-tip-category.util: 顾问 tip 类别归一化
 *  - @/composables/advisor/hub-presence-advisor.internals: 顾问 tip 类别元数据
 *  - @/utils/registry/settings-route.util: 设置页路由常量
 */
import { getEntityDomain } from '@homeos/shared'
import { ref, watch, computed } from 'vue'
import { RouterLink } from 'vue-router'
import { Lightbulb, AlertTriangle, Leaf, Shield, Zap, Droplets } from '@lucide/vue'
import ApiQueryState from '@/components/common/ApiQueryState.vue'
import { executeAdvisorTip, fetchAdvisorForgotten } from '@/services/api/system'
import { fetchDailyAdvisor, markTipFeedback } from '@/services/api/advisor'
import { callService } from '@/services/api/entities'
import { useChromeStore } from '@/stores/chrome.store'
import { useWidgetApiQuery } from '@/composables/api/useWidgetApiQuery'
import { getConfigSection } from '@/utils/config/frontend-config'
import { getApiErrorMessage } from '@/utils/core/error-message'
import { normalizeAdvisorTipCategoryId } from '@/utils/advisor/advisor-tip-category.util'
import { ADVISOR_TIP_CATEGORY_META } from '@/composables/advisor/hub-presence-advisor.internals'
import { SETTINGS_ROUTES } from '@/utils/registry/settings-route.util'

defineProps({
  embedded: { type: Boolean, default: false },
})

const emit = defineEmits(['stats'])
const chrome = useChromeStore()
const executing = ref('')
const ignoring = ref('')
const turningOff = ref('')
const executedCategories = ref(new Set())
const ignoredCategories = ref(new Set())

const TIP_CATEGORY_ICONS = {
  security: Shield,
  env: Leaf,
  energy: Zap,
  water: Droplets,
}

function tipCategoryId(category) {
  return normalizeAdvisorTipCategoryId(category)
}

function tipCategoryIcon(category) {
  return TIP_CATEGORY_ICONS[tipCategoryId(category)] || Zap
}

function tipCategoryLabel(category) {
  const id = tipCategoryId(category)
  return ADVISOR_TIP_CATEGORY_META[id]?.label ?? String(category || '')
}

const query = useWidgetApiQuery(
  'smartAdvisor',
  async () => {
    const [dailyRes, forgottenRes] = await Promise.all([
      fetchDailyAdvisor(),
      fetchAdvisorForgotten(),
    ])
    const tips = Array.isArray(dailyRes?.tips) ? dailyRes.tips : []
    const forgotten = Array.isArray(forgottenRes.data)
      ? forgottenRes.data
      : forgottenRes.data?.devices || []
    return { data: { tips, forgotten } }
  },
  120_000,
  { pollKey: 'widget:SmartAdvisorWidget' },
)

const loading = query.loading
const loadError = query.error
const tips = computed(() => query.data?.value?.tips || [])
const visibleTips = computed(() =>
  tips.value.filter((t) => {
    if (executedCategories.value.has(t.category)) return false
    if (ignoredCategories.value.has(t.category)) return false
    if (t.done || t.ignored) return false
    return true
  }),
)
const forgotten = computed(() => query.data?.value?.forgotten || [])

function emitStats() {
  emit('stats', { forgotten: forgotten.value.length, tips: tips.value.length })
}

watch([tips, forgotten], emitStats, { immediate: true })

const advisorActionsConfigured = computed(() => {
  const bound = getConfigSection('other')?.advisorTipActionsBound
  return Array.isArray(bound) && bound.length > 0
})

function tipActionable(tip) {
  if (!tip.actionable) return false
  const bound = getConfigSection('other')?.advisorTipActionsBound || []
  return Array.isArray(bound) && bound.includes(tip.category)
}

function tipExecuted(category) {
  return executedCategories.value.has(category)
}

function tipIgnored(category) {
  return ignoredCategories.value.has(category)
}

async function executeTip(category) {
  const meta = ADVISOR_TIP_CATEGORY_META[tipCategoryId(category)]
  const label = meta?.label || category
  const ok = await chrome.confirm(
    `确定执行建议「${label}」？可能切换家庭模式或运行场景。`,
    '执行智能建议',
    { type: 'warning', confirmText: '执行' },
  )
  if (!ok) return
  executing.value = category
  try {
    const { data } = await executeAdvisorTip(category)
    if (data?.success) {
      if (!data.silent) chrome.notify(data.message || '已执行', 'success')
      executedCategories.value = new Set([...executedCategories.value, category])
      markTipFeedback(category, 'done').catch((err) => logger.debug('标记建议反馈失败', err))
      emitStats()
    } else {
      chrome.notify(data?.message || '未配置动作', 'warning')
    }
  } catch (e) {
    chrome.notify(getApiErrorMessage(e, '失败'), 'error')
  } finally {
    executing.value = ''
  }
}

async function ignoreTip(category) {
  ignoring.value = category
  try {
    ignoredCategories.value = new Set([...ignoredCategories.value, category])
    markTipFeedback(category, 'ignored').catch((err) => logger.debug('标记建议忽略失败', err))
    chrome.notify('已忽略今日建议', 'success')
    emitStats()
  } finally {
    ignoring.value = ''
  }
}

async function turnOff(entityId) {
  turningOff.value = entityId
  const domain = getEntityDomain(entityId)
  const service = domain === 'media_player' ? 'media_stop' : 'turn_off'
  try {
    await callService({ domain, service, entity_id: entityId })
    chrome.notify('已关闭设备', 'success')
    await query.retry()
  } catch {
    chrome.notify('失败', 'error')
  } finally {
    turningOff.value = ''
  }
}

defineExpose({ load: query.retry })
</script>

<style scoped src="./styles/SmartAdvisorWidget.css"></style>
