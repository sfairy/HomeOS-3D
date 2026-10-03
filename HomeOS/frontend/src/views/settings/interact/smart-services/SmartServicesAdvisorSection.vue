<!--
组件：SmartServicesAdvisorSection.vue
所属模块：frontend / src / views / settings / interact / smart-services
职责：智能顾问区段。通过 OrchTabs 切换每日顾问（每日播报话术+建议列表）、使用统计（设备用量排行）、
      一键执行（AdvisorTipActionsCard 顾问建议绑定场景/模式）三个子页签。支持试听每日播报、重建基线。
Props：
  - refreshAll：刷新全部区段数据
  - advisorLoading / advisorError：每日顾问加载态/错误
  - dailyAdvice：每日播报与建议对象
  - speakResult：试听结果
  - usageReport：设备用量统计
  - clearingUsage / canManageUsage：用量清理中/是否可管理用量
  - testDailySpeak：试听每日播报
  - clearUsageStats：清空用量统计
关键依赖：
  - SettingsCard / SettingsOrchTabs / ApiQueryState：卡片、子页签、加载态
  - AdvisorTipActionsCard：一键执行绑定卡片
  - useSmartServicesAdvisorPanel / useSmartServicesUsagePanel：顾问与用量聚合
  - useFixedPagePagination：用量排行分页
  - executeAdvisorTip / rebuildIntelligenceBaseline：建议执行与基线重建 API
数据来源：父级 SettingsSmartServicesPanel 透传的 props
-->
<template>
  <div class="settings-hub-section advisor-hub settings-hub-section--fill">
    <SettingsCard static nested extra-class="adv-workspace svc-workspace svc-workspace--advisor">
      <div class="svc-head-band svc-head-band--advisor">
        <div class="svc-head">
          <div class="svc-head__orb svc-orb--advisor">
            <Brain class="w-5 h-5 svc-icon--advisor" />
          </div>
          <div class="min-w-0">
            <h3 class="svc-head__title">{{ '智能顾问' }}</h3>
            <p class="svc-head__desc">
              {{ '每日播报、节能安防建议与设备使用统计；可绑定场景实现一键执行' }}
            </p>
          </div>
        </div>
      </div>

      <div class="adv-tabs-rail">
        <SettingsOrchTabs v-model="advisorTab" :tabs="advisorOrchTabs" plain />
      </div>

      <!-- 每日顾问 -->
      <div v-show="advisorTab === 'daily-advice'" id="daily-advice" class="adv-pane">
        <div
          v-if="dailyAdvice && (dailyAdvice.tts || advisorOverview.tipCount)"
          class="adv-glance-band"
        >
          <div class="adv-glance-band__head">
            <div class="adv-glance-band__orb">
              <Brain class="w-4 h-4" />
            </div>
            <div class="adv-glance-band__lead">
              <span class="adv-glance-band__eyebrow">
                <Volume2 class="adv-glance-band__eyebrow-icon" />
                {{ dailyAdvice.tts ? '今日播报' : '智能顾问' }}
              </span>
              <blockquote v-if="dailyAdvice.tts" class="adv-glance-band__quote">
                {{ dailyAdvice.tts }}
              </blockquote>
              <p v-else class="adv-glance-band__quote adv-glance-band__quote--muted">
                {{ '暂无播报话术，以下为文字建议' }}
              </p>
            </div>
            <div class="adv-glance-band__actions">
              <button
                v-if="dailyAdvice.tts"
                type="button"
                class="adv-hero-btn adv-hero-btn--play"
                :disabled="speaking"
                @click="onTestSpeak"
              >
                <Volume2 :class="['w-3.5 h-3.5', speaking && 'animate-pulse']" />
                {{ speaking ? '播报中…' : '试听' }}
              </button>
              <button
                v-if="canManageUsage"
                type="button"
                class="adv-hero-btn adv-hero-btn--ghost"
                :disabled="baselineRebuilding"
                @click="rebuildIntelligenceBaseline"
              >
                {{ baselineRebuilding ? '重建中…' : '重建基线' }}
              </button>
            </div>
          </div>

          <div
            v-if="advisorOverview.tipCount || advisorOverview.categories.length"
            class="hub-stat-row adv-glance__stats"
          >
            <div v-if="dailyAdvice.tts" class="hub-stat adv-glance-stat adv-glance-stat--tts">
              <Volume2 class="hub-stat__icon" />
              <span class="hub-stat__val adv-glance-stat__val">{{ '就绪' }}</span>
              <span class="hub-stat__lbl">{{ 'TTS 播报' }}</span>
            </div>
            <div v-if="advisorOverview.tipCount" class="hub-stat adv-glance-stat adv-glance-stat--total">
              <Sparkles class="hub-stat__icon" />
              <span class="hub-stat__val adv-glance-stat__val">{{ advisorOverview.tipCount }}</span>
              <span class="hub-stat__lbl">{{ '条建议' }}</span>
            </div>
            <div
              v-for="cat in advisorOverview.categories"
              :key="cat.id"
              :class="['hub-stat', 'adv-glance-stat', `adv-glance-stat--${cat.id}`]"
            >
              <component :is="tipCategoryIcon(cat.id)" class="hub-stat__icon" />
              <span class="hub-stat__val adv-glance-stat__val">{{ cat.count }}</span>
              <span class="hub-stat__lbl">{{ cat.label }}</span>
            </div>
          </div>

          <p
            v-if="speakResult"
            :class="[
              'adv-glance-band__result',
              speakResult.success !== false
                ? 'adv-glance-band__result--ok'
                : 'adv-glance-band__result--err',
            ]"
          >
            {{
              speakResult.message ||
              (speakResult.success !== false ? '已提交播报' : '播报失败')
            }}
          </p>
        </div>

        <div class="adv-body">
          <div class="adv-body__inner">
          <ApiQueryState
            :loading="advisorLoading"
            :error="advisorError"
            error-title="顾问数据加载失败"
            tone="indigo"
            @retry="refreshAll"
          >
            <div v-if="dailyAdvice?.tips?.length" class="adv-feed-section">
              <header class="adv-feed-section__head">
                <h4 class="adv-feed-section__title">{{ '智能建议' }}</h4>
                <span class="adv-feed-section__meta">{{ `${advisorOverview.tipCount} 条` }}</span>
              </header>
              <div class="adv-feed-viewport">
                <div class="adv-feed-list adv-feed-list--daily">
                  <article
                    v-for="(tip, i) in dailyVisibleTips"
                    :key="i"
                    :class="[
                      'adv-feed-row',
                      `adv-feed-row--${tipCategoryId(tip.category)}`,
                    ]"
                  >
                    <span
                      :class="[
                        'adv-feed-row__icon',
                        `adv-feed-row__icon--${tipCategoryId(tip.category)}`,
                      ]"
                    >
                      <component :is="tipCategoryIcon(tip.category)" class="w-3.5 h-3.5" />
                    </span>
                    <div class="adv-feed-row__main">
                      <header class="adv-feed-row__head">
                        <h4 class="adv-feed-row__title">{{ tip.title }}</h4>
                        <span class="adv-feed-row__tag">{{ tipCategoryLabel(tip.category) }}</span>
                      </header>
                      <p class="adv-feed-row__message">{{ tip.message }}</p>
                      <div v-if="tip.actionable" class="adv-feed-row__actions">
                        <button
                          v-if="tipActionBound(tip.category)"
                          type="button"
                          class="adv-feed-row__exec"
                          :disabled="executingTip === tip.category"
                          @click="onExecuteTip(tip.category)"
                        >
                          {{ executingTip === tip.category ? '执行中…' : '一键执行' }}
                        </button>
                        <button
                          v-else
                          type="button"
                          class="adv-feed-row__link"
                          @click="switchAdvisorTab('tip-actions')"
                        >
                          {{ '配置动作' }}
                        </button>
                      </div>
                    </div>
                  </article>
                </div>
              </div>
            </div>
            <div
              v-else-if="dailyAdvice && !dailyAdvice.tips?.length && !dailyAdvice.tts"
              class="advisor-empty advisor-empty--compact"
            >
              <Brain class="advisor-empty__icon" />
              <p class="advisor-empty__title">{{ '今日暂无额外建议' }}</p>
              <p class="advisor-empty__desc">{{ '顾问已就绪，稍后将根据全屋数据生成新建议' }}</p>
            </div>
            <div v-else-if="!advisorLoading && !advisorError" class="advisor-empty advisor-empty--compact">
              <Brain class="advisor-empty__icon" />
              <p class="advisor-empty__title">{{ '暂无顾问内容' }}</p>
              <p class="advisor-empty__desc">{{ '请稍后刷新，或确认 HA 实体与能源数据已同步' }}</p>
              <button type="button" class="settings-btn-ghost text-xs mt-2" @click="refreshAll">
                {{ '刷新' }}
              </button>
            </div>
          </ApiQueryState>
          </div>
        </div>

        <footer
          :class="['adv-foot', !showActivePager && 'adv-foot--hint-only']"
        >
          <nav v-if="showActivePager" class="adv-pager" :aria-label="activePagerLabel">
            <button
              type="button"
              class="adv-pager__btn"
              :disabled="!activePagerCanPrev"
              @click="activePagerPrev"
            >
              <ChevronUp class="adv-pager__icon" aria-hidden="true" />
              {{ '上一页' }}
            </button>
            <span class="adv-pager__meta">{{ activePagerMeta }}</span>
            <button
              type="button"
              class="adv-pager__btn"
              :disabled="!activePagerCanNext"
              @click="activePagerNext"
            >
              {{ '下一页' }}
              <ChevronDown class="adv-pager__icon" aria-hidden="true" />
            </button>
          </nav>
          <p class="adv-foot__hint">
            {{ '连续用水异常时，若在' }}
            <RouterLink :to="SETTINGS_ROUTES.params('water')" class="adv-foot__link">{{
              '高级参数 · 用水'
            }}</RouterLink>
            {{ '配置了总水阀，顾问会推送'
            }}<strong>{{ '关阀建议' }}</strong>{{ '（需手动确认）。' }}
          </p>
        </footer>
      </div>

      <!-- 使用统计 -->
      <div v-show="advisorTab === 'usage-stats'" id="usage-stats" class="adv-pane">
        <div
          v-if="usageReport?.totalDevices"
          class="adv-glance-band adv-glance-band--usage"
        >
          <div class="hub-stat-row adv-glance__stats">
            <div class="hub-stat adv-glance-stat adv-glance-stat--usage">
              <BarChart3 class="hub-stat__icon" />
              <span class="hub-stat__val adv-glance-stat__val">{{ usageReport.totalDevices }}</span>
              <span class="hub-stat__lbl">{{ '跟踪设备' }}</span>
            </div>
            <div class="hub-stat adv-glance-stat adv-glance-stat--muted">
              <span class="hub-stat__val adv-glance-stat__val">{{ usageReport.days ?? 7 }}</span>
              <span class="hub-stat__lbl">{{ '天窗口' }}</span>
            </div>
            <div class="hub-stat adv-glance-stat adv-glance-stat--muted">
              <span class="hub-stat__val adv-glance-stat__val">{{ usageReport.topDevices?.length ?? 0 }}</span>
              <span class="hub-stat__lbl">{{ '排行条目' }}</span>
            </div>
          </div>
        </div>

        <header class="adv-pane-toolbar">
          <div class="adv-pane-toolbar__orb adv-pane-toolbar__orb--usage">
            <BarChart3 class="w-4 h-4" />
          </div>
          <div class="adv-pane-toolbar__copy">
            <h3 class="adv-pane-toolbar__title">{{ '设备使用统计' }}</h3>
            <p class="adv-pane-toolbar__meta">
              {{ '顾问数据源 · 近阶段开关/启用次数 Top 设备' }}
            </p>
          </div>
          <div class="adv-pane-toolbar__actions">
            <RouterLink :to="SETTINGS_ROUTES.voice()" class="adv-pane-toolbar__link">
              {{ '话术模板' }}
            </RouterLink>
            <button
              v-if="canManageUsage && hasUsageData"
              type="button"
              class="adv-pane-toolbar__danger"
              :disabled="clearingUsage"
              @click="onClearUsage"
            >
              <Trash2 :class="['w-3.5 h-3.5', clearingUsage && 'animate-pulse']" />
              {{ clearingUsage ? '清除中…' : '清除记录' }}
            </button>
          </div>
        </header>

        <div class="adv-body">
          <div class="adv-body__inner">
          <template v-if="usageVisibleDevices.length">
            <div class="adv-feed-section">
              <header class="adv-feed-section__head">
                <h4 class="adv-feed-section__title">{{ '启用排行' }}</h4>
                <span class="adv-feed-section__meta">{{ `${usageDeviceCount} 台` }}</span>
              </header>
              <div class="adv-feed-viewport adv-feed-viewport--rank">
                <div class="adv-rank-list adv-rank-list--usage">
                  <article
                    v-for="(row, idx) in usageVisibleDevices"
                    :key="row.entityId"
                    class="adv-rank-row"
                  >
                    <span
                      :class="[
                        'adv-rank-row__num',
                        usageRankNumber(idx) <= 3 && 'adv-rank-row__num--top',
                      ]"
                    >
                      {{ usageRankNumber(idx) }}
                    </span>
                    <div class="adv-rank-row__body">
                      <span class="adv-rank-row__id" :title="row.entityId">{{
                        usageDeviceName(row.entityId)
                      }}</span>
                      <div class="adv-rank-row__bar-wrap">
                        <span
                          class="adv-rank-row__bar"
                          :style="{ width: `${usageBarPercent(row.onCount)}%` }"
                        />
                      </div>
                    </div>
                    <span class="adv-rank-row__count">{{ `${row.onCount} 次` }}</span>
                  </article>
                </div>
              </div>
            </div>
          </template>
          <div v-else class="advisor-empty advisor-empty--compact usage-stats-empty">
            <BarChart3 class="advisor-empty__icon" />
            <p class="advisor-empty__title">{{ '暂无使用统计' }}</p>
            <p class="advisor-empty__desc">{{ '需运行一段时间后积累开关/启用记录' }}</p>
          </div>
          </div>
        </div>

        <footer v-if="showActivePager" class="adv-foot adv-foot--pager-only">
          <nav class="adv-pager" :aria-label="activePagerLabel">
            <button
              type="button"
              class="adv-pager__btn"
              :disabled="!activePagerCanPrev"
              @click="activePagerPrev"
            >
              <ChevronUp class="adv-pager__icon" aria-hidden="true" />
              {{ '上一页' }}
            </button>
            <span class="adv-pager__meta">{{ activePagerMeta }}</span>
            <button
              type="button"
              class="adv-pager__btn"
              :disabled="!activePagerCanNext"
              @click="activePagerNext"
            >
              {{ '下一页' }}
              <ChevronDown class="adv-pager__icon" aria-hidden="true" />
            </button>
          </nav>
        </footer>
      </div>

      <!-- 一键执行 -->
      <div v-show="advisorTab === 'tip-actions'" id="tip-actions" class="adv-pane adv-pane--actions">
        <header class="adv-pane-toolbar adv-pane-toolbar--compact">
          <div class="adv-pane-toolbar__orb adv-pane-toolbar__orb--actions">
            <Zap class="w-4 h-4" />
          </div>
          <div class="adv-pane-toolbar__copy">
            <h3 class="adv-pane-toolbar__title">{{ '建议一键执行' }}</h3>
            <p class="adv-pane-toolbar__meta">
              {{ '为各类顾问建议绑定家庭模式或场景；Dashboard 卡片上可直接触发' }}
            </p>
          </div>
        </header>
        <div class="adv-body adv-body--flush">
          <AdvisorTipActionsCard />
        </div>
      </div>
    </SettingsCard>
  </div>
</template>

<script setup>
import { toRef, ref, computed, watch, onMounted, nextTick } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import {
  Brain,
  BarChart3,
  Volume2,
  Trash2,
  Sparkles,
  Zap,
  ChevronUp,
  ChevronDown,
} from '@lucide/vue'
import SettingsCard from '@/components/common/page-shell/SettingsCard.vue'
import SettingsOrchTabs from '@/views/settings/shared/layout/SettingsOrchTabs.vue'
import ApiQueryState from '@/components/common/ApiQueryState.vue'
import AdvisorTipActionsCard from '@/views/settings/interact/AdvisorTipActionsCard.vue'
import { useSmartServicesAdvisorPanel } from '@/composables/settings/interact/smart-services.internals'
import { useSmartServicesUsagePanel } from '@/composables/settings/interact/smart-services.internals'
import { useFixedPagePagination } from '@/composables/ui/hub-viewport.internals'
import { useChromeStore } from '@/stores/chrome.store'
import { useEntitiesStore } from '@/stores/entities.store'
import { getEntityDisplayName } from '@/utils/entity/derived.util'
import { SETTINGS_ROUTES } from '@/utils/registry/settings-route.util'
import {
  executeAdvisorTip,
  rebuildIntelligenceBaseline as rebuildIntelligenceBaselineApi,
} from '@/services/api/system'
import { getConfigSection } from '@/utils/config/frontend-config'

const props = defineProps({
  refreshAll: { type: Function, required: true },
  advisorLoading: { type: Boolean, default: false },
  advisorError: { type: String, default: '' },
  dailyAdvice: { type: Object, default: null },
  speakResult: { type: Object, default: null },
  usageReport: { type: Object, default: null },
  clearingUsage: { type: Boolean, default: false },
  canManageUsage: { type: Boolean, default: false },
  testDailySpeak: { type: Function, required: true },
  clearUsageStats: { type: Function, required: true },
})

const ADVISOR_TAB_IDS = ['daily-advice', 'usage-stats', 'tip-actions']

const chrome = useChromeStore()
const entitiesStore = useEntitiesStore()
const route = useRoute()
const router = useRouter()
const dailyAdvice = toRef(props, 'dailyAdvice')
const usageReport = toRef(props, 'usageReport')
const executingTip = ref('')
const executedTips = ref(new Set())
const baselineRebuilding = ref(false)
const advisorTab = ref('daily-advice')

function usageDeviceName(entityId) {
  if (!entityId) return ''
  return getEntityDisplayName(entityId, entitiesStore.entities[entityId]) || entityId
}

const advisorOrchTabs = computed(() => [
  {
    id: 'daily-advice',
    label: '每日顾问',
    icon: Brain,
    count: props.dailyAdvice?.tips?.length || undefined,
    accent: 'var(--page-accent-secondary)',
  },
  {
    id: 'usage-stats',
    label: '使用统计',
    icon: BarChart3,
    count: props.usageReport?.topDevices?.length || undefined,
    accent: 'var(--set-info)',
  },
  {
    id: 'tip-actions',
    label: '一键执行',
    icon: Zap,
    accent: 'var(--set-warn)',
  },
])

function resolveAdvisorTabFromHash() {
  const hash = route.hash.replace(/^#/, '')
  if (ADVISOR_TAB_IDS.includes(hash)) advisorTab.value = hash
}

function syncAdvisorHash(tabId) {
  const nextHash = `#${tabId}`
  if (route.hash === nextHash) return
  router.replace({ path: route.path, query: route.query, hash: nextHash })
}

function switchAdvisorTab(tabId) {
  if (!ADVISOR_TAB_IDS.includes(tabId)) return
  advisorTab.value = tabId
}

watch(advisorTab, (tabId) => {
  syncAdvisorHash(tabId)
  nextTick(() => {
    if (tabId === 'usage-stats') usagePagination.resetPage()
    if (tabId === 'daily-advice') dailyTipsPagination.resetPage()
  })
})

watch(() => route.hash, resolveAdvisorTabFromHash)

onMounted(resolveAdvisorTabFromHash)

async function rebuildIntelligenceBaseline() {
  baselineRebuilding.value = true
  try {
    await rebuildIntelligenceBaselineApi()
    chrome.notify('智能基线重建已提交', 'success')
    await props.refreshAll()
  } catch {
    chrome.notify('智能基线重建失败', 'error')
  } finally {
    baselineRebuilding.value = false
  }
}

function tipActionBound(category) {
  const bound = getConfigSection('other')?.advisorTipActionsBound || []
  return Array.isArray(bound) && bound.includes(category)
}

const { speaking, advisorOverview, tipCategoryId, tipCategoryIcon, tipCategoryLabel, onTestSpeak } =
  useSmartServicesAdvisorPanel({
    dailyAdvice,
    testDailySpeak: () => props.testDailySpeak(),
  })

async function onExecuteTip(category) {
  const label = tipCategoryLabel(category) || category
  const ok = await chrome.confirm(
    `确定执行建议「${label}」？可能切换家庭模式或运行场景。`,
    '执行智能建议',
    { type: 'warning', confirmText: '执行' },
  )
  if (!ok) return
  executingTip.value = category
  try {
    const { data } = await executeAdvisorTip(category)
    if (data?.success) {
      if (!data.silent) chrome.notify(data.message || '已执行', 'success')
      executedTips.value = new Set([...executedTips.value, category])
      if (dailyAdvice.value?.tips) {
        dailyAdvice.value = {
          ...dailyAdvice.value,
          tips: dailyAdvice.value.tips.filter((t) => t.category !== category),
        }
      }
    } else {
      chrome.notify(data?.message || '未配置动作', 'warning')
    }
  } catch {
    chrome.notify('执行失败', 'error')
  } finally {
    executingTip.value = ''
  }
}

const { hasUsageData, usageBarPercent, onClearUsage } = useSmartServicesUsagePanel({
  chrome,
  usageReport,
  clearUsageStats: () => props.clearUsageStats(),
})

const DAILY_TIPS_PER_PAGE = 4
const USAGE_STATS_PER_PAGE = 5

const dailyTipCount = computed(() => dailyAdvice.value?.tips?.length ?? 0)

const dailyTipsPagination = useFixedPagePagination({
  itemCount: dailyTipCount,
  perPage: DAILY_TIPS_PER_PAGE,
})

const dailyVisibleTips = computed(() =>
  dailyTipsPagination.sliceItems(dailyAdvice.value?.tips),
)

const usageDeviceCount = computed(() => usageReport.value?.topDevices?.length ?? 0)

const usagePagination = useFixedPagePagination({
  itemCount: usageDeviceCount,
  perPage: USAGE_STATS_PER_PAGE,
})

const usageVisibleDevices = computed(() =>
  usagePagination.sliceItems(usageReport.value?.topDevices),
)
const usageRankNumber = (localIdx) => usagePagination.globalIndex(localIdx)

const showActivePager = computed(() => {
  if (advisorTab.value === 'daily-advice') return dailyTipsPagination.totalPages.value > 1
  if (advisorTab.value === 'usage-stats') return usagePagination.totalPages.value > 1
  return false
})

const activePagerLabel = computed(() =>
  advisorTab.value === 'daily-advice' ? '智能建议分页' : '设备使用统计分页',
)

const activePagerCanPrev = computed(() => {
  if (advisorTab.value === 'daily-advice') return dailyTipsPagination.canPrev.value
  if (advisorTab.value === 'usage-stats') return usagePagination.canPrev.value
  return false
})

const activePagerCanNext = computed(() => {
  if (advisorTab.value === 'daily-advice') return dailyTipsPagination.canNext.value
  if (advisorTab.value === 'usage-stats') return usagePagination.canNext.value
  return false
})

const activePagerMeta = computed(() => {
  if (advisorTab.value === 'daily-advice') {
    return `第 ${dailyTipsPagination.pageLabel.value} 页 · 每页 ${DAILY_TIPS_PER_PAGE} 条`
  }
  if (advisorTab.value === 'usage-stats') {
    return `第 ${usagePagination.pageLabel.value} 页 · 每页 ${USAGE_STATS_PER_PAGE} 条`
  }
  return ''
})

function activePagerPrev() {
  if (advisorTab.value === 'daily-advice') dailyTipsPagination.prevPage()
  else if (advisorTab.value === 'usage-stats') usagePagination.prevPage()
}

function activePagerNext() {
  if (advisorTab.value === 'daily-advice') dailyTipsPagination.nextPage()
  else if (advisorTab.value === 'usage-stats') usagePagination.nextPage()
}
</script>
