<!--
  RecommendationsPanel.vue / components/widgets/orchestrator
  习惯推荐面板：编排 Hub 独立卡片，基于行为习惯生成自动化建议，
  展示 YAML 预览、条件/动作、执行类型、采纳向导；支持采纳、预览与暂存草稿跳转。
  Props: embedded 嵌入态隐藏 header / max-pending 最大待处理推荐数
  Emit: stats(totals) 推荐计数
  依赖：services/api/system recommendations.* + adopt/dismiss + 自动化草稿暂存；
        composables: useRecommendationAdoptWizard 采纳向导步骤；
        Pinia: useChromeStore + useAuthStore 权限 + useEntitiesStore；
        vue-router useRouter 跳转联动中心；
        @homeos/shared executionTypeLabel 中文化。
        子组件：ApiQueryState + OrchestratorPlaceholderWizard 空态首装引导。
  注意：采用率统计写入 max-pending 控制；stashAutomationDraftYaml 可后续在联动中心二次编辑。
-->
<template>
  <div :class="['rec-panel', embedded && 'rec-panel--embedded']">
    <header v-if="!embedded" class="rec-panel__head">
      <Sparkles class="w-3.5 h-3.5 rec-icon" />
      <h3>{{ '习惯推荐' }}</h3>
      <button type="button" class="rec-panel__refresh" :disabled="loading" @click="load">
        {{ '刷新' }}
      </button>
    </header>

    <ApiQueryState :loading="loading" :error="loadError" error-title="推荐加载失败" @retry="load">
      <div v-if="habitSummary" class="rec-habit-summary">
        <p class="rec-habit-summary__title">{{ '习惯摘要' }}</p>
        <p v-if="habitSummary.note" class="rec-habit-summary__note">{{ habitSummary.note }}</p>
        <ul v-if="habitSummary.topRooms?.length" class="rec-habit-summary__list">
          <li v-for="r in habitSummary.topRooms" :key="r.room">
            {{ r.room }} · 高峰 {{ r.peakHour }}:00（活跃 {{ r.activityScore }}）
          </li>
        </ul>
        <p v-if="habitSummary.pendingCount != null" class="rec-habit-summary__pending">
          {{ '待采纳推荐' }}：{{ habitSummary.pendingCount }}
        </p>
        <button
          v-if="habitSummary.needsBaseline && habitSummary.canRebuild && canRebuildBaseline"
          type="button"
          class="rec-habit-summary__rebuild"
          :disabled="rebuilding"
          @click="rebuildBaseline"
        >
          {{ rebuilding ? '重建中…' : '立即重建基线' }}
        </button>
      </div>

      <div v-if="!items.length" class="rec-empty">
        <Sparkles class="rec-empty__icon" />
        <p class="rec-empty__title">{{ '暂无待处理推荐' }}</p>
        <p class="rec-empty__desc">{{ '系统将根据使用习惯生成场景与自动化建议' }}</p>
      </div>

      <ul v-else class="rec-panel__list">
        <li v-for="item in items" :key="item.id" class="rec-panel__item">
          <div class="rec-panel__item-accent" />
          <div class="rec-panel__item-body">
            <div class="rec-panel__top">
              <span class="rec-panel__type">{{ typeLabel(item.type) }}</span>
              <span class="rec-panel__score">{{ Math.round(item.score * 100) }}%</span>
            </div>
            <p class="rec-panel__title">{{ item.title }}</p>
            <p v-if="item.basis" class="rec-panel__basis">{{ item.basis }}</p>
            <pre
              v-if="item.draftYaml"
              class="rec-panel__draft"
              >{{ draftPreview(item.draftYaml) }}</pre
            >
            <div class="rec-panel__actions">
              <button
                type="button"
                class="rec-btn rec-btn--primary"
                :disabled="busyId === item.id"
                @click="adopt(item.id, false)"
              >
                {{ busyId === item.id ? '采纳中…' : '采纳草稿' }}
              </button>
              <button
                v-if="canQuickEnable(item)"
                type="button"
                class="rec-btn rec-btn--accent"
                :disabled="busyId === item.id"
                @click="adopt(item.id, true)"
              >
                {{ '采纳并启用' }}
              </button>
              <button
                type="button"
                class="rec-btn rec-btn--ghost"
                :disabled="busyId === item.id"
                @click="dismiss(item.id)"
              >
                {{ '忽略' }}
              </button>
            </div>
          </div>
        </li>
      </ul>
    </ApiQueryState>

    <OrchestratorPlaceholderWizard
      :open="adoptWizardOpen"
      :loading="adoptWizardLoading"
      :saving="adoptWizardSaving"
      :automation-name="adoptWizardTitle"
      :rows="adoptWizardRows"
      :require-all-resolved="true"
      v-model:replacements="adoptWizardReplacements"
      @close="closeAdoptWizard()"
      @apply="confirmAdopt()"
    />
  </div>
</template>

<script setup>
/**
 * @file RecommendationsPanel.vue
 * @module widgets/orchestrator
 * @description 智能建议面板：拉取系统推荐项（adopt/dismiss）、习惯摘要与基线重建，
 *              支持分页加载与待处理数量上限控制，仅管理员可操作。
 * @dependencies
 *  - vue: ref/computed/onMounted/watch 响应式与生命周期
 *  - vue-router: useRouter 路由跳转
 *  - @lucide/vue: Sparkles 图标
 *  - @/services/api/system: 推荐/习惯/基线接口
 *  - @/utils/config/frontend-config: 推荐待处理上限配置
 *  - @/stores/chrome.store: 全局通知
 *  - @/stores/auth.store: 鉴权状态（判断 admin 角色）
 *  - @/utils/core/error-message: 错误信息提取
 */
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { Sparkles } from '@lucide/vue'
import {
  adoptRecommendation,
  dismissRecommendation,
  fetchHabitSummary,
  fetchRecommendationPlaceholders,
  fetchRecommendations,
  rebuildIntelligenceBaseline,
} from '@/services/api/system'
import { getRecommendationMaxPending } from '@/utils/config/frontend-config'
import { useChromeStore } from '@/stores/chrome.store'
import { useAuthStore } from '@/stores/auth.store'
import { getApiErrorMessage } from '@/utils/core/error-message'
import { notifyError } from '@/services/notify'
import ApiQueryState from '@/components/common/ApiQueryState.vue'
import OrchestratorPlaceholderWizard from '@/components/dashboard/OrchestratorPlaceholderWizard.vue'
import { useRecommendationAdoptWizard } from '@/composables/orchestrator/useRecommendationAdoptWizard'
import { stashAutomationDraftYaml } from '@/utils/orchestrator/room-automation-draft.util'
import { executionTypeLabel, getEntityLeaf } from '@homeos/shared'
import { SETTINGS_ROUTES } from '@/utils/registry/settings-route.util'
import { useEntitiesStore } from '@/stores/entities.store'
import { getEntityDisplayName } from '@/utils/entity/derived.util'

defineProps({
  autoLoad: { type: Boolean, default: true },
  embedded: { type: Boolean, default: false },
})

const emit = defineEmits(['stats'])
const chrome = useChromeStore()
const authStore = useAuthStore()
const entitiesStore = useEntitiesStore()
const router = useRouter()
const loading = ref(true)
const loadError = ref('')
const busyId = ref('')
const items = ref([])
const habitSummary = ref(null)
const rebuilding = ref(false)
const canRebuildBaseline = computed(
  () => authStore.role === 'admin' || authStore.role === 'adult',
)
const {
  open: adoptWizardOpen,
  loading: adoptWizardLoading,
  saving: adoptWizardSaving,
  recommendationId: adoptWizardRecommendationId,
  recommendationTitle: adoptWizardTitle,
  rows: adoptWizardRows,
  replacements: adoptWizardReplacements,
  openForRecommendation,
  close: closeAdoptWizard,
  adoptWithReplacements,
} = useRecommendationAdoptWizard()

function typeLabel(type) {
  const label = executionTypeLabel(type)
  if (label !== type) return label
  if (type === 'script') return '脚本'
  if (type === 'template') return '模板'
  if (type === 'home_mode') return '家庭模式'
  return '建议'
}

function draftPreview(yaml) {
  const text = String(yaml || '').trim()
  if (!text) return ''
  const lines = text.split('\n')
  return lines.slice(0, 8).join('\n') + (lines.length > 8 ? '\n…' : '')
}

/** 将标题 / YAML alias 中的 object_id 换成实体友好名 */
function withFriendlyEntityLabels(item) {
  const entityId = String(item?.payload?.entityId || '').trim()
  if (!entityId || item?.payload?.pattern !== 'manual_control') return item
  const ent = entitiesStore.entities[entityId]
  const display = getEntityDisplayName(entityId, ent)
  const slug = getEntityLeaf(entityId)
  if (!display || !slug || display === slug || display === entityId) return item
  const title = String(item.title || '').includes(slug)
    ? String(item.title).split(slug).join(display)
    : item.title
  let draftYaml = item.draftYaml
  if (draftYaml) {
    draftYaml = String(draftYaml).replace(
      /^(alias:\s*")([^"]*)(")/m,
      (_m, prefix, mid, suffix) =>
        `${prefix}${String(mid).includes(slug) ? String(mid).split(slug).join(display) : mid}${suffix}`,
    )
  }
  return {
    ...item,
    title,
    draftYaml,
    payload: draftYaml ? { ...item.payload, draftYaml } : item.payload,
  }
}

function canQuickEnable(item) {
  if (!item?.draftYaml) return false
  if (item.type !== 'automation' && item.type !== 'scene') return false
  // 含 placeholder 时需走向导，不能直接启用
  return !/_placeholder|\.placeholder\b/i.test(String(item.draftYaml))
}

async function load(opts = {}) {
  const { quiet = false } = opts
  loading.value = true
  loadError.value = ''
  try {
    const [{ data }, habitRes] = await Promise.all([
      fetchRecommendations({
        params: { status: 'pending', limit: getRecommendationMaxPending() },
      }),
      fetchHabitSummary().catch(() => ({ data: null })),
    ])
    items.value = Array.isArray(data) ? data.map(withFriendlyEntityLabels) : []
    habitSummary.value = habitRes?.data || null
    emit('stats', {
      pending: items.value.length,
      baselineRooms: habitSummary.value?.topRooms?.length || 0,
    })
  } catch (e) {
    items.value = []
    loadError.value = getApiErrorMessage(e, '加载失败')
    emit('stats', { pending: 0 })
    if (!quiet) notifyError(e, '加载失败')
  } finally {
    loading.value = false
  }
}

async function rebuildBaseline() {
  if (rebuilding.value) return
  rebuilding.value = true
  try {
    await rebuildIntelligenceBaseline()
    await load({ quiet: true })
  } catch (e) {
    notifyError(e, '重建基线失败')
  } finally {
    rebuilding.value = false
  }
}

async function adopt(id, enableAfter = false) {
  busyId.value = id
  const rec = items.value.find((i) => i.id === id)
  try {
    let phRes = null
    try {
      const { data } = await fetchRecommendationPlaceholders(id)
      phRes = data
    } catch {
      phRes = null
    }
    const suggestions = Array.isArray(phRes?.suggestions) ? phRes.suggestions : []
    const suggestionList = Array.isArray(suggestions)
      ? suggestions
      : suggestions && typeof suggestions === 'object'
        ? Object.keys(suggestions)
        : []
    // buildPlaceholderSuggestions 可能返回对象 map
    const hasPlaceholders =
      (Array.isArray(phRes?.placeholders) && phRes.placeholders.length > 0) ||
      suggestionList.length > 0
    if (hasPlaceholders && !enableAfter) {
      await openForRecommendation(id, rec?.title || '')
      busyId.value = ''
      return
    }
    if (hasPlaceholders && enableAfter) {
      await openForRecommendation(id, rec?.title || '')
      busyId.value = ''
      chrome.notify('请先完成实体替换后再启用', 'info')
      return
    }
    const data = await finishAdopt(id, rec, null, enableAfter)
    if (!data) return
  } catch (e) {
    chrome.notify(getApiErrorMessage(e, '失败'), 'error')
  } finally {
    busyId.value = ''
  }
}

async function confirmAdopt() {
  const id = adoptWizardRecommendationId.value
  const rec = items.value.find((i) => i.id === id)
  const data = await adoptWithReplacements()
  if (data) await finishAdopt(id, rec, data, false)
}

async function finishAdopt(id, rec, dataIn = null, enableAfter = false) {
  try {
    const data =
      dataIn || (await adoptRecommendation(id, { enableAfter: Boolean(enableAfter) })).data
    if (data?.success) {
      chrome.notify(data.message || '已采纳推荐', 'success')
      items.value = items.value.filter((i) => i.id !== id)
      if (data.createdId && rec) {
        if (rec.type === 'home_mode') {
          router.push(SETTINGS_ROUTES.homeMode())
          return data
        }
        // scene 推荐现已落地为 automation 草稿
        const tab = 'automation'
        if (data.draftYaml) {
          stashAutomationDraftYaml(data.draftYaml)
        }
        if (authStore.role === 'admin' || authStore.role === 'adult') {
          router.push(SETTINGS_ROUTES.orchestrator(tab, data.createdId))
        }
      }
    } else {
      chrome.notify(data?.message || '失败', 'warning')
    }
    return data
  } catch (e) {
    chrome.notify(getApiErrorMessage(e, '失败'), 'error')
    return null
  }
}

async function dismiss(id) {
  busyId.value = id
  try {
    await dismissRecommendation(id)
    items.value = items.value.filter((i) => i.id !== id)
    chrome.notify('已忽略', 'success')
  } catch {
    chrome.notify('失败', 'error')
  } finally {
    busyId.value = ''
  }
}

onMounted(() => {
  load({ quiet: true })
})
watch(items, (list) => emit('stats', { pending: list.length }), { immediate: true })
defineExpose({ load })
</script>

<style scoped src="./styles/RecommendationsPanel.css"></style>
