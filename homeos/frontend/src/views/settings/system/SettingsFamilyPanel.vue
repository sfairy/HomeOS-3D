<!--
组件：SettingsFamilyPanel.vue
所属模块：frontend / src / views / settings / system
职责：家庭面板。展示当前家庭模式与通知设置，支持加载家庭模式与通知配置。
Props：
  - activeTab：当前 Tab
关键依赖：
  - SettingsPageShell / SettingsCard / ApiQueryState：页面骨架与加载态
  - fetchActiveHomeMode：家庭模式 API
  - fetchNotificationSettings：通知设置 API
数据来源：fetchActiveHomeMode / fetchNotificationSettings
-->
<template>
  <SettingsPageShell
    :active-tab="activeTab"
    tab="family"
    icon-key="home"
    accent="var(--module-accent-admin)"
    layout="single"
    page-class="family-hub"
    body-class="family-hub__body"
  >
    <template #actions>
      <div v-if="!loading && !loadError && activeFeatureCount > 0" class="fam-hero__pill">
        <Sparkles class="fam-hero__pill-icon" />
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
        <!-- 概览 KPI（标题由页头承担，避免重复） -->
        <SettingsCard static extra-class="fam-hero">
          <div class="fam-hero__stats">
            <div
              class="fam-hero-stat fam-hero-stat--mode"
              :class="isModeActive && 'fam-hero-stat--active'"
            >
              <Sparkles class="fam-hero-stat__icon" />
              <div class="fam-hero-stat__text">
                <span class="fam-hero-stat__val">{{ activeModeName }}</span>
                <span class="fam-hero-stat__lbl">{{ '家庭模式' }}</span>
              </div>
            </div>
            <div
              class="fam-hero-stat fam-hero-stat--dnd"
              :class="notifySettings?.dndActive && 'fam-hero-stat--active'"
            >
              <Moon class="fam-hero-stat__icon" />
              <div class="fam-hero-stat__text">
                <span class="fam-hero-stat__val">{{ dndShortLabel }}</span>
                <span class="fam-hero-stat__lbl">{{ '勿扰时段' }}</span>
              </div>
            </div>
          </div>

          <p class="fam-hero__hint">
            <Eye class="fam-hero__hint-icon" />
            {{
              canManageHousehold
                ? '下方查看各模块详情；家庭模式与勿扰请到对应设置页修改'
                : '成员只读 · 修改家庭模式或勿扰请联系管理员'
            }}
          </p>
        </SettingsCard>

        <div class="fam-page__stack">
          <!-- 状态详情 -->
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
                <p v-if="activeModeHint" class="family-status-card__hint">{{ activeModeHint }}</p>
                <p v-else class="family-status-card__hint">
                  {{ '管理员可在设置→家庭模式中配置' }}
                </p>
              </article>

              <article
                :class="[
                  'family-status-card',
                  'family-status-card--dnd',
                  notifySettings?.dndActive && 'family-status-card--active',
                ]"
              >
                <header class="family-status-card__head">
                  <div class="family-status-card__icon">
                    <Moon class="w-4 h-4" />
                  </div>
                  <div class="family-status-card__meta">
                    <p class="family-status-card__label">{{ '勿扰时段' }}</p>
                    <span
                      v-if="notifySettings?.dndActive"
                      class="family-status-card__badge family-status-card__badge--warn"
                    >
                      {{ '勿扰中' }}
                    </span>
                  </div>
                </header>
                <p class="family-status-card__value">{{ dndLabel }}</p>
                <p class="family-status-card__hint">
                  {{ notifySettings?.dndActive ? '非紧急通知将被抑制' : '当前不在勿扰时段内' }}
                </p>
              </article>

              <article class="family-status-card family-status-card--notify">
                <header class="family-status-card__head">
                  <div class="family-status-card__icon">
                    <Bell class="w-4 h-4" />
                  </div>
                  <div class="family-status-card__meta">
                    <p class="family-status-card__label">{{ '我的通知偏好' }}</p>
                    <span class="family-status-card__badge family-status-card__badge--muted">
                      {{ `${notifyEnabledCount}/3 已开启` }}
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
              </article>

            </div>
          </SettingsCard>
        </div>
      </ApiQueryState>
    </div>
  </SettingsPageShell>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import {
  Sparkles,
  Moon,
  Bell,
  Check,
  X,
  Eye,
} from '@lucide/vue'
import SettingsPageShell from '@/components/common/page-shell/SettingsPageShell.vue'
import SettingsCard from '@/components/common/page-shell/SettingsCard.vue'
import ApiQueryState from '@/components/common/ApiQueryState.vue'
import { fetchActiveHomeMode } from '@/services/api/home-modes'
import { fetchNotificationSettings } from '@/services/api/notifications'
import { useAuthStore } from '@/stores/auth.store'
import { logger } from '@/utils/core/logger'
import { formatShortDateTime } from '@/utils/format/locale-format.util'

defineProps({ activeTab: { type: String, default: 'family' } })

const authStore = useAuthStore()
const loading = ref(false)
const loadError = ref('')
const activeMode = ref(null)
const notifySettings = ref(null)
let familyLoaded = false

const canManageHousehold = computed(() => authStore.canManageHousehold())

const activeModeName = computed(() => {
  const m = activeMode.value?.mode
  return m?.name || activeMode.value?.name || '未激活'
})

const isModeActive = computed(() => activeModeName.value !== '未激活')

const activeModeHint = computed(() => {
  if (activeMode.value?.lastActivation?.executedAt) {
    return `最近切换：${formatShortDateTime(activeMode.value.lastActivation.executedAt)}`
  }
  return ''
})

const dndLabel = computed(() => {
  const s = notifySettings.value
  if (s?.dndStart == null && s?.dndEnd == null) return '未配置'
  return `${String(s.dndStart ?? 0).padStart(2, '0')}:00 – ${String(s.dndEnd ?? 0).padStart(2, '0')}:00`
})

const dndShortLabel = computed(() => {
  if (notifySettings.value?.dndActive) return '进行中'
  const s = notifySettings.value
  if (s?.dndStart == null && s?.dndEnd == null) return '未配置'
  return `${String(s.dndStart ?? 0).padStart(2, '0')}–${String(s.dndEnd ?? 0).padStart(2, '0')}`
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

const notifyEnabledCount = computed(() => notifyPrefs.value.filter((p) => p.enabled).length)

const activeFeatureCount = computed(() => {
  let count = 0
  if (isModeActive.value) count++
  if (notifySettings.value?.dndActive) count++
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
    const [modeRes, notifyRes] = await Promise.all([
      fetchActiveHomeMode(),
      fetchNotificationSettings(),
    ])
    activeMode.value = modeRes.data
    notifySettings.value = notifyRes.data
    familyLoaded = true
    loadError.value = ''
  } catch (e) {
    const status = e?.response?.status
    logger.warn('加载家庭状态失败', e)
    if (showLoading || !familyLoaded) {
      loadError.value =
        status === 401
          ? '登录已过期或未登录，请重新登录'
          : '无法加载家庭状态，请检查网络或稍后重试'
    }
  } finally {
    if (showLoading) loading.value = false
  }
}

onMounted(load)
</script>
<style src="./styles/admin-hubs.css"></style>
