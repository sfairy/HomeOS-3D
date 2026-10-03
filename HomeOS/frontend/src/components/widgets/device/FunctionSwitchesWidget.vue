<template>
  <div class="function-switches font-sans" @click.stop>
    <!-- 通知设置 -->
    <div v-if="authStore.isAuthenticated" class="fs-section">
      <div class="fs-section-head notify-head">
        <h3 class="fs-section-title">{{ '通知设置' }}</h3>
        <RouterLink
          :to="SETTINGS_ROUTES.alerts('dnd')"
          :class="['notify-dnd-chip', prefs.dndActive && 'notify-dnd-chip--on']"
          :title="`免打扰 ${formatHour(prefs.dndStart)}–${formatHour(prefs.dndEnd)}，点击编辑`"
        >
          <Moon class="w-3 h-3 shrink-0" />
          {{ prefs.dndActive ? '免打扰' : '正常' }}
        </RouterLink>
      </div>

      <ApiQueryState
        :loading="loading"
        :error="loadError"
        error-title="通知偏好加载失败"
        tone="sky"
        @retry="load"
      >
        <p v-if="!canEdit" class="fs-hint">{{ '仅管理员/成人可修改' }}</p>

        <div class="fs-list">
          <div
            v-for="item in notificationItems"
            :key="item.key"
            class="notify-row"
            :class="{
              'notify-row--disabled': item.disabled,
              'notify-row--saving': savingKey === item.key,
            }"
            :title="item.hint"
            @click.stop="onNotifyToggle(item)"
          >
            <div class="notify-row__main">
              <span class="notify-row__icon-wrap">
                <component :is="item.icon" class="w-3.5 h-3.5 shrink-0" :class="item.iconColor" />
              </span>
              <div class="notify-row__text">
                <span class="notify-row__label">{{ item.label }}</span>
                <span class="notify-row__hint">{{ item.hint }}</span>
              </div>
            </div>
            <div :class="['toggle-bg', item.on && 'toggle-bg--on']">
              <div class="toggle-dot" />
            </div>
          </div>
        </div>

        <RouterLink :to="SETTINGS_ROUTES.alerts()" class="notify-more-link">
          {{ '告警规则与免打扰时段 →' }}
        </RouterLink>
      </ApiQueryState>
    </div>

    <p v-else class="fs-login-hint">{{ '登录后可配置通知' }}</p>

    <!-- 功能设置（HA 实体） -->
    <div class="fs-section">
      <div class="fs-section-head">
        <h3 class="fs-section-title">{{ '功能设置' }}</h3>
      </div>
      <div class="fs-list">
        <div
          v-for="item in featureSwitchRows"
          :key="item.key"
          class="notify-row"
          :class="{
            'notify-row--disabled': !item.bound || !authStore.canControl(item.id),
            'notify-row--saving': entityPending(item.id),
          }"
          @click.stop="toggleEntitySwitch(item)"
        >
          <div class="notify-row__main">
            <span class="notify-row__icon-wrap">
              <component :is="item.icon" class="w-3.5 h-3.5 shrink-0" :class="item.iconColor" />
            </span>
            <div class="notify-row__text">
              <span class="notify-row__label">{{ item.label }}</span>
              <span v-if="!item.bound" class="notify-row__hint">{{ '未绑定 · 请在 HA 创建对应 input_boolean' }}</span>
            </div>
          </div>
          <div :class="['toggle-bg', item.bound && featureSwitchOn(item.id) && 'toggle-bg--on']">
            <div class="toggle-dot" />
          </div>
        </div>
      </div>
      <RouterLink :to="SETTINGS_ROUTES.connection()" class="notify-more-link">
        {{ '去检查 HA 实体同步 →' }}
      </RouterLink>
    </div>
  </div>
</template>

<script setup>
/**
 * @file FunctionSwitchesWidget.vue
 * @module widgets/device
 * @description 功能开关部件（开关控制 Hub 的「功能」tab）：
 *              1) 通知偏好开关（免打扰/告警/离线/低电量等）；
 *              2) 场景功能开关（空调自适应/欢迎语音/日程播报等 input_boolean）。
 *              通过 useNotificationPrefs 拉取与保存通知偏好，按角色权限控制可编辑性。
 * @dependencies
 *  - vue: computed/onMounted 响应式与生命周期
 *  - vue-router: RouterLink 路由跳转
 *  - @lucide/vue: 通知与场景图标
 *  - @/components/common/ApiQueryState.vue: 查询状态容器
 *  - @/stores/entities.store: 实体状态与 HA 服务调用
 *  - @/stores/auth.store: 鉴权状态与角色判断
 *  - @/stores/chrome.store: 全局通知
 *  - @/composables/notifications/useNotificationPrefs: 通知偏好 composable
 *  - @/composables/widget/useScheduledPoll: 定时轮询
 *  - @/utils/notification/dnd.util: 免打扰时段格式化
 *  - @/utils/registry/settings-route.util: 设置页路由常量
 */
import { getEntityDomain } from '@homeos/shared'
import { getApiErrorMessage } from '@/utils/core/error-message'
import { computed, onMounted } from 'vue'
import { RouterLink } from 'vue-router'
import {
  Bell,
  BellRing,
  WifiOff,
  BatteryLow,
  Moon,
  ThermometerSun,
  Home,
  CalendarDays,
  Sunrise,
  Car,
  Wind,
} from '@lucide/vue'
import ApiQueryState from '@/components/common/ApiQueryState.vue'
import { useEntitiesStore } from '@/stores/entities.store'
import { useAuthStore } from '@/stores/auth.store'
import { useChromeStore } from '@/stores/chrome.store'
import { formatHour } from '@/utils/notification/dnd.util'
import { useNotificationPrefs } from '@/composables/notifications/useNotificationPrefs'
import { useScheduledPoll } from '@/composables/widget/useScheduledPoll'
import { SETTINGS_ROUTES } from '@/utils/registry/settings-route.util'

const props = defineProps({
  config: { type: Object, default: () => ({}) },
  panelVisible: { type: Boolean, default: true },
})

const entitiesStore = useEntitiesStore()
const authStore = useAuthStore()
const chrome = useChromeStore()

const { prefs, loading, loadError, savingKey, canEdit, load, updatePref, isPrefDisabled } =
  useNotificationPrefs()

// 在途态统一走 entitiesStore.isEntityCallPending（callService 内部维护），
// 与热点/设备列表等其他入口共享同一状态源，避免本地重复跟踪
const entityPending = (id) => entitiesStore.isEntityCallPending?.(id) === true

const notificationSwitchDefs = computed(() => [
  {
    key: 'globalNotifyEnabled',
    label: '全局通知',
    hint: '关闭后停止所有新通知',
    icon: Bell,
    iconColor: 'fs-icon-warn',
  },
  {
    key: 'importantNotifyEnabled',
    label: '告警与警告',
    hint: '能耗等非紧急 warn；SOS/安防/地震等仍送达',
    icon: BellRing,
    iconColor: 'fs-icon-danger',
    requiresGlobal: true,
  },
  {
    key: 'offlineNotifyEnabled',
    label: '设备离线',
    hint: '设备变为 unavailable 时提醒',
    icon: WifiOff,
    iconColor: 'fs-icon-orange',
    requiresGlobal: true,
  },
  {
    key: 'lowBatteryNotifyEnabled',
    label: '低电量',
    hint: '电量 ≤20% 时提醒',
    icon: BatteryLow,
    iconColor: 'fs-icon-yellow',
    requiresGlobal: true,
  },
])

const notificationItems = computed(() =>
  notificationSwitchDefs.value.map((def) => ({
    ...def,
    on: prefs.value[def.key] !== false,
    disabled: isPrefDisabled(def.key),
  })),
)

const featureSwitchDefs = [
  {
    key: 'climateAuto',
    id: 'input_boolean.climate_auto_switch',
    label: '空调自适应',
    icon: ThermometerSun,
    iconColor: 'fs-icon-cyan',
  },
  {
    key: 'welcomeTts',
    id: 'input_boolean.welcome_tts_switch',
    label: '回家欢迎语音',
    icon: Home,
    iconColor: 'fs-icon-success',
  },
  {
    key: 'calendarTts',
    id: 'input_boolean.calendar_tts_switch',
    label: '日程播报',
    icon: CalendarDays,
    iconColor: 'fs-icon-violet',
  },
  {
    key: 'morningBroadcast',
    id: 'input_boolean.morning_broadcast_switch',
    label: '早播功能',
    icon: Sunrise,
    iconColor: 'fs-icon-yellow',
  },
  {
    key: 'pickUpChildren',
    id: 'input_boolean.pick_up_children_switch',
    label: '接送通知',
    icon: Car,
    iconColor: 'fs-icon-info',
  },
  {
    key: 'airQuality',
    id: 'input_boolean.air_quality_switch',
    label: '空气质量',
    icon: Wind,
    iconColor: 'fs-icon-lime',
  },
]

const featureSwitchRows = computed(() => {
  void entitiesStore.getDomainEpoch('input_boolean')
  const map = props.config?.entityIds && typeof props.config.entityIds === 'object'
    ? props.config.entityIds
    : {}
  return featureSwitchDefs.map((item) => {
    const id = String(map[item.key] || item.id)
    const entity = entitiesStore.getEntity(id)
    const bound = Boolean(entity && entity.state !== 'unavailable')
    return { ...item, id, bound }
  })
})

function featureSwitchOn(entityId) {
  void entitiesStore.getDomainEpoch('input_boolean')
  return entitiesStore.getEntity(entityId)?.state === 'on'
}

async function onNotifyToggle(item) {
  if (item.disabled) return
  const next = !item.on
  const ok = await updatePref(item.key, next)
  if (ok) {
    const label = next ? '已开启' : '已关闭'
    chrome.notify(`${item.label} ${label}`, 'success', 1800)
  } else {
    chrome.notify('通知设置保存失败', 'error')
  }
}

async function toggleEntitySwitch(item) {
  if (!item?.bound) {
    chrome.notify('该功能开关未绑定实体，请先在 HA 创建对应 input_boolean', 'warning')
    return
  }
  const entityId = item.id
  if (!authStore.canControl(entityId)) {
    chrome.notify('当前账户无权操作该设备', 'warning')
    return
  }
  const entity = entitiesStore.getEntity(entityId)
  if (!entity || entity.state === 'unavailable') return
  // 在途调用未结束时跳过，避免快速连点导致开关翻转竞态
  if (entitiesStore.isEntityCallPending?.(entityId)) return
  const service = entity.state === 'on' ? 'turn_off' : 'turn_on'
  const domain = getEntityDomain(entityId)
  try {
    await entitiesStore.callService(domain, service, entityId)
  } catch (e) {
    chrome.notify(getApiErrorMessage(e, '切换失败'), 'error')
  }
}

onMounted(() => {
  load()
})

useScheduledPoll(load, 120_000, {
  key: 'widget:FunctionSwitchesWidget:notifyPrefs',
  immediate: false,
})
</script>

<style scoped src="./styles/FunctionSwitchesWidget.css"></style>
