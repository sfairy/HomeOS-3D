<!--
  组件文件：SetupWizardCompleteStep.vue
  所属模块：frontend/src/views/settings/connect/setup-wizard
  组件职责：初始化向导的最后一步「完成」页。上部展示前 5 步完成情况时间线（对勾/圆圈
    /叉号图标表示 done/active/idle 状态），中部展示能源学习期提示与首装清单建议
    （可点击打开对应设置项或整体关闭清单），底部提供「打开使用文档」与「进入首页」
    RouterLink 按钮，错误时顶部展示清单加载错误 alert。
  主要 props / emits：
    - props wizardSteps：步骤元信息数组（用于渲染前 5 步时间线）
    - props status：向导状态对象（判断每步 done）
    - props learningDays：能源学习期天数（默认 7）
  依赖关系：引用 useChromeStore Pinia store 触发 toast 通知；fetchSetupChecklist /
    dismissSetupChecklist API 拉取与关闭首装清单；fetchSystemConfigFresh 关闭清单后
    刷新系统配置；SETTINGS_ROUTES.setupWizard/itemRoute 生成深链；logger 与
    getApiErrorMessage 做错误日志与友好消息转换。
  注意事项：首装清单由后端返回（可为空），dismiss 后调用 fetchSystemConfigFresh
    同步顶栏徽标；onMounted 自动触发 loadChecklist 加载。
-->
<script setup>
/**
 * 职责：渲染 views/SetupWizardCompleteStep 页面视图，整合子组件与业务数据。
 * 关键依赖：Vue Router、Pinia 全局状态、页面级子组件与 API services。
 * 约定：- 页面通过 onMounted 拉取数据，卸载时清理副作用；
  - 与子组件通信走 props/emit，不在视图层内直接写业务逻辑。
 */
import { ref, onMounted, computed } from 'vue'
import {
  CheckCircle2,
  Circle,
  X,
  Sparkles,
  BookOpen,
  ArrowRight,
  PartyPopper,
  AlertCircle,
  RefreshCw,
} from '@lucide/vue'
import { RouterLink } from 'vue-router'
import { SETTINGS_ROUTES } from '@/utils/registry/settings-route.util'
import { fetchSystemConfigFresh } from '@/composables/config/system-config-core.internals'
import { dismissSetupChecklist, fetchSetupChecklist } from '@/services/api/system'
import { logger } from '@/utils/core/logger'
import { getApiErrorMessage } from '@/utils/core/error-message'
import { useChromeStore } from '@/stores/chrome.store'

const props = defineProps({
  wizardSteps: { type: Array, default: () => [] },
  status: { type: Object, default: null },
  learningDays: { type: Number, default: 7 },
})

const chrome = useChromeStore()

const STEP_TONES = {
  connection: 'sky',
  security: 'rose',
  energy: 'amber',
  environment: 'teal',
  dashboard: 'sky',
}

const checklist = ref(null)
const loading = ref(false)
const checklistError = ref('')
const checklistDismissed = ref(false)

const summarySteps = computed(() => props.wizardSteps.slice(0, 5))
const showChecklist = computed(
  () =>
    Boolean(checklist.value?.items?.length) &&
    !checklistDismissed.value &&
    !checklist.value?.dismissed,
)

async function loadChecklist() {
  loading.value = true
  checklistError.value = ''
  try {
    const { data } = await fetchSetupChecklist()
    checklist.value = data
  } catch (e) {
    logger.debug('加载设置清单失败', e)
    checklistError.value = getApiErrorMessage(e, '加载首装清单失败')
  } finally {
    loading.value = false
  }
}

async function dismissChecklist() {
  checklistDismissed.value = true
  try {
    await dismissSetupChecklist()
    if (checklist.value) {
      checklist.value = { ...checklist.value, visible: false, dismissed: true }
    }
    void fetchSystemConfigFresh().catch((err) => logger.debug('向导完成后刷新系统配置失败', err))
  } catch (e) {
    logger.warn('关闭设置清单失败', e)
    chrome.notify(getApiErrorMessage(e, '关闭设置清单失败'), 'error')
  }
}

function itemRoute(route) {
  if (!route) return SETTINGS_ROUTES.setupWizard()
  const p = String(route).replace(/^\//, '')
  return p.startsWith('#') ? p.slice(1) : p
}

onMounted(loadChecklist)
</script>

<template>
  <div class="sw-step">
    <div class="sw-complete-celebrate">
      <PartyPopper class="w-6 h-6" />
      <p>{{ '关键配置已完成。建议继续完善户型图与常用入口，墙屏体验会更完整。' }}</p>
    </div>

    <div class="sw-complete-grid">
      <article
        v-for="s in summarySteps"
        :key="s.id"
        :class="[
          'sw-complete-card',
          `sw-complete-card--${STEP_TONES[s.id] || 'emerald'}`,
          status?.steps?.[s.id]?.done && 'sw-complete-card--done',
        ]"
      >
        <div class="sw-complete-card__icon">
          <CheckCircle2 v-if="status?.steps?.[s.id]?.done" class="w-4 h-4" />
          <Circle v-else class="w-4 h-4" />
        </div>
        <div class="min-w-0">
          <p class="sw-complete-card__label">{{ s.label }}</p>
          <p
            v-if="status?.steps?.[s.id]?.hint && !status?.steps?.[s.id]?.done"
            class="sw-complete-card__hint"
          >
            {{ status.steps[s.id].hint }}
          </p>
          <p
            v-else-if="status?.steps?.[s.id]?.done"
            class="sw-complete-card__hint sw-complete-card__hint--ok"
          >
            {{ '已完成' }}
          </p>
        </div>
      </article>
    </div>

    <div class="sw-complete-learning">
      <div class="sw-complete-learning__icon">
        <Sparkles class="w-4 h-4" />
      </div>
      <div class="min-w-0">
        <p class="sw-complete-learning__title">{{ `能源学习期 ${learningDays} 天` }}</p>
        <p class="sw-complete-learning__desc">
          {{ '期间收集基线并跳过功率突增告警，减少误报。历史数据默认保留' }}
          {{ status?.retentionDays ?? 7 }}
          {{ '天，可在' }}
          <RouterLink :to="SETTINGS_ROUTES.retention()" class="sw-complete-link">{{
            '数据保留'
          }}</RouterLink>
          {{ '调整。' }}
        </p>
      </div>
    </div>

    <div
      v-if="checklistError"
      class="settings-premium-empty settings-premium-empty--amber mt-4"
      role="alert"
    >
      <AlertCircle class="settings-premium-empty__icon" />
      <p class="settings-premium-empty__title">{{ '首装清单加载失败' }}</p>
      <p class="settings-premium-empty__desc">{{ checklistError }}</p>
      <button
        type="button"
        class="settings-premium-empty__btn settings-premium-empty__btn--accent"
        :disabled="loading"
        @click="loadChecklist"
      >
        <RefreshCw :class="['w-3.5 h-3.5', loading && 'animate-spin']" />
        {{ '重试' }}
      </button>
    </div>

    <div v-else-if="showChecklist" class="sw-complete-checklist">
      <div class="sw-complete-checklist__head">
        <p class="sw-complete-checklist__title">
          {{ `后续任务（${checklist.completed}/${checklist.total}）` }}
        </p>
        <button
          type="button"
          class="sw-complete-checklist__close"
          :aria-label="'关闭提示'"
          @click="dismissChecklist"
        >
          <X class="w-3.5 h-3.5" />
        </button>
      </div>
      <ul class="sw-complete-checklist__list">
        <li v-for="item in checklist.items" :key="item.id" class="sw-complete-checklist__item">
          <CheckCircle2 v-if="item.done" class="w-3.5 h-3.5 shrink-0 swc-icon-success" />
          <Circle v-else class="w-3.5 h-3.5 shrink-0 swc-icon-warn" />
          <div class="min-w-0">
            <RouterLink
              v-if="!item.done && item.route"
              :to="itemRoute(item.route)"
              class="sw-complete-link"
              >{{ item.label }}</RouterLink
            >
            <span
              v-else
              :class="item.done ? 'sw-complete-checklist__done' : 'sw-complete-checklist__pending'"
              >{{ item.label }}</span
            >
            <span v-if="item.hint" class="sw-complete-checklist__hint">— {{ item.hint }}</span>
          </div>
        </li>
      </ul>
    </div>
    <p v-else-if="loading" class="sw-complete-loading">{{ '加载任务清单…' }}</p>

    <div class="sw-complete-next">
      <BookOpen class="w-4 h-4 shrink-0 swc-icon-success" />
      <span>
        {{ '下一步：' }}
        <RouterLink :to="SETTINGS_ROUTES.assets()" class="sw-complete-link">{{
          '上传户型图'
        }}</RouterLink>
        {{ ' · ' }}
        <RouterLink :to="SETTINGS_ROUTES.layout()" class="sw-complete-link">{{
          '布局'
        }}</RouterLink>
        {{ ' · ' }}
        <RouterLink :to="SETTINGS_ROUTES.favorites()" class="sw-complete-link">{{
          '收藏'
        }}</RouterLink>
        {{ ' · ' }}
        <RouterLink :to="SETTINGS_ROUTES.rooms()" class="sw-complete-link">{{
          '房间配置'
        }}</RouterLink>
        {{ ' · ' }}
        <RouterLink :to="SETTINGS_ROUTES.securityModes()" class="sw-complete-link">{{
          '安防场景'
        }}</RouterLink>
      </span>
      <ArrowRight class="w-4 h-4 shrink-0 swc-icon-success-soft" />
    </div>
  </div>
</template>

<style scoped src="./styles/setup-wizard-complete-step.css"></style>
