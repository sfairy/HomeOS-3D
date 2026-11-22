<!--
  家庭面板。展示当前家庭模式与通知设置，支持加载家庭模式与通知配置。
  版式：顶部「概览」三项运行态（家庭模式 / 勿扰 / 通知）一屏可读；
        下方「状态详情」按同一顺序拆成三张卡，宽屏三列 / 中宽两列（通知卡占满整行）/ 窄屏单列。
-->
<template>
  <SettingsPageShell
    :active-tab="activeTab"
    tab="family"
    icon-key="home"
    accent="var(--hos-color-accent)"
    layout="single"
    page-class="family-hub"
    body-class="family-hub__body"
  >
    <template #actions>
      <div v-if="!loading && !loadError && activeFeatureCount > 0" class="fam-pill">
        <Sparkles class="fam-pill__icon" />
        <span>{{ `${activeFeatureCount} 项运行中` }}</span>
      </div>
    </template>

    <div class="settings-hub-section fam-page">
      <ApiQueryState
        :loading="loading"
        :error="loadError"
        error-title="加载家庭状态失败"
        tone="sky"
        @retry="load"
      >
        <!-- 概览：三项运行态（标题由页头承担，避免重复） -->
        <SettingsCard static extra-class="fam-overview">
          <div class="fam-tiles">
            <div class="fam-tile fam-tile--mode" :class="isModeActive && 'fam-tile--on'">
              <span class="fam-tile__icon">
                <Sparkles class="w-4 h-4" />
              </span>
              <span class="fam-tile__text">
                <span class="fam-tile__val" :title="activeModeFullName || activeModeName">
                  {{ activeModeName }}
                </span>
                <span class="fam-tile__lbl">
                  <span class="fam-tile__dot" aria-hidden="true" />
                  {{ '家庭模式' }}
                </span>
              </span>
            </div>

            <div class="fam-tile fam-tile--dnd" :class="dndActive && 'fam-tile--on'">
              <span class="fam-tile__icon">
                <Moon class="w-4 h-4" />
              </span>
              <span class="fam-tile__text">
                <span class="fam-tile__val fam-tile__val--num">{{ dndLabel }}</span>
                <span class="fam-tile__lbl">
                  <span class="fam-tile__dot" aria-hidden="true" />
                  {{ '勿扰时段' }}
                </span>
              </span>
            </div>

            <div
              class="fam-tile fam-tile--notify"
              :class="notifyEnabledCount === notifyPrefCount && 'fam-tile--on'"
            >
              <span class="fam-tile__icon">
                <Bell class="w-4 h-4" />
              </span>
              <span class="fam-tile__text">
                <span class="fam-tile__val fam-tile__val--num">
                  {{ notifyEnabledCount }}<i class="fam-tile__val-total">/{{ notifyPrefCount }}</i>
                </span>
                <span class="fam-tile__lbl">
                  <span class="fam-tile__dot" aria-hidden="true" />
                  {{ '通知偏好' }}
                </span>
              </span>
            </div>
          </div>
        </SettingsCard>

        <!-- 状态详情：与概览同序，逐项给出明细 -->
        <SettingsCard static extra-class="fam-status-workspace">
          <header class="acc-section-head">
            <div class="acc-section-head__orb acc-section-head__orb--secure">
              <Eye class="w-4 h-4" />
            </div>
            <div class="acc-section-head__copy">
              <h3 class="acc-section-head__title">{{ '状态详情' }}</h3>
              <p class="acc-section-head__meta">
                {{ '各模块当前运行态与通知偏好明细' }}
              </p>
            </div>
          </header>

          <div class="fam-status-grid">
            <article
              :class="[
                'family-status-card',
                'family-status-card--mode',
                isModeActive && 'family-status-card--active',
              ]"
            >
              <header class="family-status-card__head">
                <div class="family-status-card__icon">
                  <Sparkles class="w-4 h-4" />
                </div>
                <div class="family-status-card__meta">
                  <p class="family-status-card__label">{{ '当前家庭模式' }}</p>
                  <span
                    :class="[
                      'family-status-card__badge',
                      isModeActive
                        ? 'family-status-card__badge--on'
                        : 'family-status-card__badge--off',
                    ]"
                  >
                    {{ isModeActive ? '已激活' : '未激活' }}
                  </span>
                </div>
              </header>

              <p class="family-status-card__value">{{ activeModeName }}</p>

              <ul v-if="activeModeList.length > 1" class="family-status-modes">
                <li
                  v-for="mode in activeModeList"
                  :key="mode.id || mode.name"
                  class="family-status-mode"
                >
                  <span class="family-status-mode__dot" aria-hidden="true" />
                  {{ mode.name }}
                </li>
              </ul>

              <p class="family-status-card__hint">{{ modeHint }}</p>
            </article>

            <article
              :class="[
                'family-status-card',
                'family-status-card--dnd',
                dndActive && 'family-status-card--active',
              ]"
            >
              <header class="family-status-card__head">
                <div class="family-status-card__icon">
                  <Moon class="w-4 h-4" />
                </div>
                <div class="family-status-card__meta">
                  <p class="family-status-card__label">{{ '勿扰时段' }}</p>
                  <span
                    v-if="dndActive"
                    class="family-status-card__badge family-status-card__badge--warn"
                  >
                    {{ '勿扰中' }}
                  </span>
                </div>
              </header>

              <p class="family-status-card__value family-status-card__value--num">{{ dndLabel }}</p>

              <!-- 24 小时刻度：高亮勿扰窗口，白线为当前时刻 -->
              <div class="family-status-timeline" aria-hidden="true">
                <div class="family-status-timeline__track">
                  <span
                    v-for="(seg, index) in dndSegments"
                    :key="`dnd-${index}`"
                    class="family-status-timeline__band"
                    :style="{ left: `${seg.left}%`, width: `${seg.width}%` }"
                  />
                  <span
                    class="family-status-timeline__now"
                    :style="{ left: `${nowPercent}%` }"
                  />
                </div>
                <div class="family-status-timeline__axis">
                  <span>00</span>
                  <span>06</span>
                  <span>12</span>
                  <span>18</span>
                  <span>24</span>
                </div>
              </div>

              <p class="family-status-card__hint">{{ dndHint }}</p>
            </article>

            <article class="family-status-card family-status-card--notify family-status-card--wide">
              <header class="family-status-card__head">
                <div class="family-status-card__icon">
                  <Bell class="w-4 h-4" />
                </div>
                <div class="family-status-card__meta">
                  <p class="family-status-card__label">{{ '我的通知偏好' }}</p>
                  <span class="family-status-card__badge family-status-card__badge--muted">
                    {{ `${notifyEnabledCount}/${notifyPrefCount} 已开启` }}
                  </span>
                </div>
              </header>

              <ul class="family-status-prefs">
                <li
                  v-for="pref in notifyPrefs"
                  :key="pref.key"
                  :class="['family-status-pref', pref.enabled && 'family-status-pref--on']"
                >
                  <Check v-if="pref.enabled" class="w-3.5 h-3.5" />
                  <X v-else class="w-3.5 h-3.5" />
                  <span>{{ pref.label }}</span>
                </li>
              </ul>

              <p class="family-status-card__hint">{{ notifyHint }}</p>
            </article>
          </div>

          <p class="fam-status-note">
            <Eye class="fam-status-note__icon" />
            {{ '家庭模式与勿扰时段请到对应设置页修改，本页仅展示当前状态' }}
          </p>
        </SettingsCard>
      </ApiQueryState>
    </div>
  </SettingsPageShell>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { Sparkles, Moon, Bell, Check, X, Eye } from '@lucide/vue'
import SettingsPageShell from '@/components/common/settings-page-shell/SettingsPageShell.vue'
import SettingsCard from '@/components/common/settings-page-shell/SettingsCard.vue'
import ApiQueryState from '@/components/common/ApiQueryState.vue'
import { fetchActiveHomeMode } from '@/services/api/home-modes'
import { fetchNotificationSettings } from '@/services/api/notifications'
import { useAuthStore } from '@/stores/auth.store'
import { logger } from '@/shared/utils/core/logger'
import { formatShortDateTime } from '@/shared/utils/format/locale-format.util'

defineProps({ activeTab: { type: String, default: 'family' } })

const authStore = useAuthStore()
const loading = ref(false)
const loadError = ref('')
const activeMode = ref(null)
/** 全部激活模式（多互斥组可同时激活；只读 activeMode 会让另一组「隐形激活」）。 */
const activeModeList = computed(() => {
  const raw = activeMode.value
  const list = raw?.activeModes
  if (Array.isArray(list) && list.length) {
    return list.map((item) => ({ id: item?.id, name: item?.name })).filter((item) => Boolean(item.name))
  }
  const single = raw?.activeMode ?? raw
  return single?.id ? [{ id: single.id, name: single.name }] : []
})
const notifySettings = ref(null)
let familyLoaded = false
/** 当前时刻（每 30s 刷新，用于勿扰时间轴上的「现在」刻度；长驻页面也能保持准确）。 */
const nowMs = ref(Date.now())
let nowTimer = null

const activeModeName = computed(() => {
  const names = activeModeList.value.map((item) => item.name).filter(Boolean)
  if (!names.length) return '未激活'
  if (names.length === 1) return names[0]
  return `${names[0]} +${names.length - 1}`
})

const activeModeFullName = computed(() =>
  activeModeList.value
    .map((item) => item.name)
    .filter(Boolean)
    .join(' · '),
)

const isModeActive = computed(() => activeModeName.value !== '未激活')

const modeHint = computed(() => {
  if (activeModeList.value.length > 1) return '多个模式同时生效（不同互斥组）'
  if (activeMode.value?.lastActivation?.executedAt) {
    return `最近切换：${formatShortDateTime(activeMode.value.lastActivation.executedAt)}`
  }
  return '管理员可在设置 → 家庭模式中配置'
})

const dndActive = computed(() => Boolean(notifySettings.value?.dndActive))

const dndLabel = computed(() => {
  const s = notifySettings.value
  if (s?.dndStart == null && s?.dndEnd == null) return '未配置'
  return `${String(s.dndStart ?? 0).padStart(2, '0')}:00 – ${String(s.dndEnd ?? 0).padStart(2, '0')}:00`
})

const dndHint = computed(() => {
  const s = notifySettings.value
  if (s?.dndStart == null && s?.dndEnd == null) return '尚未配置勿扰时段'
  return dndActive.value ? '非紧急通知将被抑制' : '当前不在勿扰时段内'
})

/** 勿扰窗口在 24h 轴上的区间（跨午夜时拆成两段，避免出现负宽度）。 */
const dndSegments = computed(() => {
  const s = notifySettings.value
  if (s?.dndStart == null || s?.dndEnd == null) return []
  const start = Math.min(24, Math.max(0, Number(s.dndStart)))
  const end = Math.min(24, Math.max(0, Number(s.dndEnd)))
  if (!Number.isFinite(start) || !Number.isFinite(end) || start === end) return []
  if (start < end) return [{ left: (start / 24) * 100, width: ((end - start) / 24) * 100 }]
  const segments = [{ left: (start / 24) * 100, width: ((24 - start) / 24) * 100 }]
  if (end > 0) segments.push({ left: 0, width: (end / 24) * 100 })
  return segments
})

const nowPercent = computed(() => {
  const date = new Date(nowMs.value)
  return ((date.getHours() * 60 + date.getMinutes()) / (24 * 60)) * 100
})

const notifyPrefs = computed(() => [
  {
    key: 'global',
    label: '常规通知',
    enabled: notifySettings.value?.globalNotifyEnabled !== false,
  },
  {
    key: 'important',
    label: '重要告警',
    enabled: notifySettings.value?.importantNotifyEnabled !== false,
  },
  {
    key: 'offline',
    label: '设备离线',
    enabled: notifySettings.value?.offlineNotifyEnabled !== false,
  },
])

const notifyPrefCount = computed(() => notifyPrefs.value.length)

const notifyEnabledCount = computed(() => notifyPrefs.value.filter((p) => p.enabled).length)

const notifyHint = computed(() => {
  const off = notifyPrefCount.value - notifyEnabledCount.value
  if (!off) return '通知项全部开启'
  if (off === notifyPrefCount.value) return '通知已全部关闭'
  return `有 ${off} 项通知已关闭`
})

const activeFeatureCount = computed(() => {
  let count = 0
  if (isModeActive.value) count++
  if (dndActive.value) count++
  return count
})

async function load(options = {}) {
  if (!authStore.isAuthenticated) {
    loadError.value = '请先登录后再查看家庭状态'
    loading.value = false
    return
  }
  const showLoading = !options.silent && !familyLoaded
  if (showLoading) {
    loading.value = true
    loadError.value = ''
  }
  try {
    const [modeRes, notifyRes] = await Promise.all([fetchActiveHomeMode(), fetchNotificationSettings()])
    // 必须保留整个响应：`activeModes` 才是全部激活模式，只取 `activeMode`
    // 会把多互斥组里另一个组的激活模式吞掉（界面上看起来只有一个在生效）。
    activeMode.value = modeRes.data ?? null
    notifySettings.value = notifyRes.data
    familyLoaded = true
    loadError.value = ''
  } catch (e) {
    const status = e?.response?.status
    logger.warn('加载家庭状态失败', e)
    if (showLoading || !familyLoaded) {
      loadError.value = status === 401 ? '登录已过期或未登录，请重新登录' : '无法加载家庭状态，请检查网络或稍后重试'
    }
  } finally {
    if (showLoading) loading.value = false
  }
}

onMounted(() => {
  load()
  nowTimer = window.setInterval(() => {
    nowMs.value = Date.now()
  }, 30000)
})

onBeforeUnmount(() => {
  if (nowTimer) window.clearInterval(nowTimer)
  nowTimer = null
})
</script>
<style src="./styles/admin-hubs.css"></style>
