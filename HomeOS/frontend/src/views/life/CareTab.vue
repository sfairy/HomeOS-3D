<!--
组件：LifeCareTab.vue
所属模块：frontend / src / views
布局：左栏全高德 Hub（看护/儿童/访客）；右栏精简 KPI + 图表 + 可操作列表
职责：生活页「看护」子标签——左栏复用 CareHubPanel，右栏拼装 KPI / 状态芯片 /
      在室时长图表 / 活跃告警 / 关爱提醒 / 快捷入口 + 媒体配额。
数据来源：
  - 看护数据来自 useLifeOverview（KPI / 提醒 / 告警 / 在室 / 媒体配额等）；
  - Hub 子标签切换经 useLifeHubPanelTab 共享状态；
  - 访客通行码列表由 onMounted 时调用 fetchGuestPasses 拉取。
关键交互：
  - 点击图表「看护」链接跳到 Hub 的 monitor 子标签；
  - 告警条目点击确认（ackCareAlert）；
  - 快捷入口跳到 child / guest 子标签；
  - useHubChart 在挂载时自动渲染在室时长条形图。
-->
<template>
  <div class="life-module life-module--split life-module--care life-care">
    <section class="life-module__workspace life-module__panel life-care__hero">
      <CareHubPanel :default-tab="panelTab" :tab-select-token="tabSelectToken" />
    </section>

    <aside class="life-module__analytics life-care__rail">
      <div class="life-module__analytics-glow" aria-hidden="true" />

      <LifeKpiGrid class="life-care__kpis" :kpis="kpis" />

      <LifeStatusChips v-if="statusChips.length" variant="care" :chips="statusChips" />

      <div class="life-care__stack">
        <article
          class="life-care__card life-care__card--grow"
          :class="{ 'life-care__card--compact': !stayRankRows.length }"
        >
          <LifeChartCard
            title="在室时长"
            link-text="看护"
            link-class="life-care__link"
            @link-click="selectPanelTab('monitor')"
          >
            <div v-show="stayRankRows.length" ref="stayChartRef" class="life-care__spark" />
            <p v-if="!stayRankRows.length" class="life-module__empty life-module__empty--inline">
              {{ carePresenceLoaded ? '暂无在室时长采样' : '加载中…' }}
            </p>
          </LifeChartCard>
        </article>

        <article
          v-if="careAlerts.length || !carePresenceLoaded"
          class="life-care__card"
          :class="{ 'life-care__card--compact': !careAlerts.length }"
        >
          <LifeChartCard
            title="活跃告警"
            link-text="看护"
            link-class="life-care__link"
            @link-click="selectPanelTab('monitor')"
          >
            <ul v-if="careAlerts.length" class="life-care__alerts">
              <li v-for="item in careAlerts.slice(0, 5)" :key="item.id">
                <div class="life-care__alert-main">
                  <span class="life-care__alert-time">{{ item.time }}</span>
                  <strong>{{ item.label }}</strong>
                </div>
                <button
                  type="button"
                  class="life-care__ack"
                  :disabled="ackingId === item.id"
                  @click="onAck(item.id)"
                >
                  {{ ackingId === item.id ? '…' : '确认' }}
                </button>
              </li>
            </ul>
            <p v-else class="life-module__empty life-module__empty--inline">{{ '加载中…' }}</p>
          </LifeChartCard>
        </article>

        <article v-if="careReminders.length" class="life-care__card">
          <LifeChartCard
            title="关爱提醒"
            link-text="日程"
            link-class="life-care__link"
            :link-to="scheduleRoute"
          >
            <ul class="life-care__list">
              <li
                v-for="(item, idx) in careReminders.slice(0, 4)"
                :key="item.id"
                :class="item.type === 'medication' ? 'is-med' : `is-tone-${idx % 3}`"
              >
                <strong>{{ item.title }}</strong>
                <span>{{ item.time }}</span>
                <em v-if="item.type">{{ reminderTypeLabel(item.type) }}</em>
              </li>
            </ul>
          </LifeChartCard>
        </article>

        <article class="life-care__card life-care__card--jumps">
          <LifeChartCard title="快捷入口">
            <div class="life-care__jumps">
              <button
                type="button"
                class="life-care__jump is-child"
                @click="selectPanelTab('child')"
              >
                <strong>{{ '儿童' }}</strong>
                <span>{{ childJumpHint }}</span>
              </button>
              <button
                type="button"
                class="life-care__jump is-guest"
                @click="selectPanelTab('guest')"
              >
                <strong>{{ '访客' }}</strong>
                <span>{{ guestJumpHint }}</span>
              </button>
            </div>
            <div v-if="mediaQuotaPct != null" class="life-care__quota">
              <div class="life-care__quota-label">
                <span>{{ '媒体配额' }}</span>
                <strong>{{ `${mediaUsedMin}/${dailyMediaLimitMin} 分` }}</strong>
              </div>
              <div class="life-care__quota-track">
                <i
                  :class="mediaQuotaPct >= 90 && 'is-warn'"
                  :style="{ width: `${mediaQuotaPct}%` }"
                />
              </div>
            </div>
          </LifeChartCard>
        </article>
      </div>
    </aside>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import CareHubPanel from '@/components/widgets/care/HubPanel.vue'
import LifeKpiGrid from '@/components/life/LifeKpiGrid.vue'
import LifeStatusChips from '@/components/life/LifeStatusChips.vue'
import LifeChartCard from '@/components/life/LifeChartCard.vue'
import { useLifeOverview } from '@/composables/life/useLifeOverview'
import { useLifeHubPanelTab } from '@/composables/life/useLifeHubPanelTab'
import { useHubChart } from '@/composables/life/useLifeChartHost'
import { buildDurationRankBarOption } from '@/utils/chart/life-charts.util'
import { fetchGuestPasses } from '@/services/api/system'
import { notifyError } from '@/services/notify'
import { reminderTypeLabel } from '@/utils/advisor/schedule-reminder-form.util'
import { SETTINGS_ROUTES } from '@/utils/registry/settings-route.util'

const {
  tabMetricCells,
  careReminders,
  careAlerts,
  carePresenceLoaded,
  presenceRooms,
  careHouse,
  childEnabled,
  childLoaded,
  childInAllowedWindow,
  childWhitelistActive,
  mediaUsedMin,
  dailyMediaLimitMin,
  mediaQuotaPct,
  ackCareAlert,
} = useLifeOverview()

const { panelTab, tabSelectToken, selectPanelTab } = useLifeHubPanelTab('monitor')
const ackingId = ref('')
const stayChartRef = ref<HTMLElement | null>(null)
// 访客通行码列表本地状态：仅在本 Tab 内使用，未纳入全局 store
const guestCount = ref(0)
const guestExpiring = ref(0)
const guestLoaded = ref(false)
const guestLoadFailed = ref(false)

const scheduleRoute = SETTINGS_ROUTES.smartServices('schedule')
const kpis = computed(() => tabMetricCells.value.care || [])

// 在室时长排行：从 presenceRooms 取前 6 名用于条形图
const stayRankRows = computed(() =>
  presenceRooms.value
    .map((r) => ({
      name: r.label || r.room,
      minutes: Number(r.durationMin) || 0,
    }))
    .filter((r) => r.minutes > 0)
    .sort((a, b) => b.minutes - a.minutes)
    .slice(0, 6),
)

// 儿童快捷入口提示：按启用/时段外/已启用逐级回退
const childJumpHint = computed(() => {
  if (!childLoaded.value) return '…'
  if (!childEnabled.value) return '未启用'
  if (childWhitelistActive.value && !childInAllowedWindow.value) return '时段外'
  return '已启用'
})

// 访客快捷入口提示：包含加载失败、无通行码、即将过期、有效数四种状态文案
const guestJumpHint = computed(() => {
  if (!guestLoaded.value) return '…'
  if (guestLoadFailed.value) return '加载失败'
  if (!guestCount.value) return '无通行码'
  if (guestExpiring.value) return `${guestExpiring.value} 将过期`
  return `${guestCount.value} 有效`
})

// 状态芯片：仅在异常/需关注时出现，避免与 KPI 重复
const statusChips = computed(() => {
  const chips: Array<{ key: string; label: string; value: string }> = []
  if (
    childLoaded.value &&
    childEnabled.value &&
    childWhitelistActive.value &&
    !childInAllowedWindow.value
  ) {
    chips.push({ key: 'window-off', label: '儿童', value: '时段外' })
  }
  if (mediaQuotaPct.value != null && mediaQuotaPct.value >= 90) {
    chips.push({ key: 'quota', label: '配额', value: `${mediaQuotaPct.value}%` })
  }
  const quiet = careHouse.value.wholeHouseInactiveMin
  if (quiet != null && quiet >= 120) {
    chips.push({ key: 'alert', label: '整屋', value: '久静' })
  }
  if (guestExpiring.value > 0) {
    chips.push({ key: 'quota', label: '访客', value: `${guestExpiring.value} 将过期` })
  }
  return chips
})

useHubChart(
  stayChartRef,
  () => buildDurationRankBarOption(stayRankRows.value),
  [stayRankRows],
)

/** 确认告警：记录正在确认的 id 防止重复点击，失败时统一 toast。 */
async function onAck(id: string) {
  ackingId.value = id
  try {
    await ackCareAlert(id)
  } catch (e) {
    notifyError(e, '确认失败')
  } finally {
    ackingId.value = ''
  }
}

// 挂载时拉取访客通行码列表：统计总数与 2 小时内即将过期的数量
onMounted(() => {
  void (async () => {
    try {
      const { data } = await fetchGuestPasses()
      const list = Array.isArray(data) ? data : []
      guestCount.value = list.length
      const now = Date.now()
      guestExpiring.value = list.filter((p: { expiresAt?: string }) => {
        const t = new Date(String(p.expiresAt || '')).getTime()
        return Number.isFinite(t) && t > now && t - now < 2 * 3600 * 1000
      }).length
      guestLoadFailed.value = false
    } catch (e) {
      guestCount.value = 0
      guestExpiring.value = 0
      guestLoadFailed.value = true
      notifyError(e, '访客通行码加载失败')
    } finally {
      guestLoaded.value = true
    }
  })()
})
</script>
