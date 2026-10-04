<!--
  @file DeviceRow.vue
  @module 设备列表/单行组件
  @description 设备列表的单行渲染组件：展示复选框、域标签、设备名、entity_id、房间、电量、状态与操作按钮。
               支持点击切换（light 域）、长按打开控制面板、右键弹出上下文菜单（控制/详情/切换/复制 ID）。
               菜单通过 Teleport 挂载至 #teleport-target，并监听 Escape 关闭。
  @dependencies vue（ref/computed/onMounted/onUnmounted）、@lucide/vue、useLongPress、
                DeviceListItem 类型、copyTextWithNotify、getDomainLabel、
                displayEntityStateLabel。
-->
<template>
  <div
    :class="[
      'list-page__row device-row',
      liveUnavailable && 'list-page__row--dim',
      selected && 'device-row--selected',
    ]"
    @contextmenu.prevent="openMenu"
  >
    <!-- 选择复选框：点击切换选中态，aria-label 随状态变化 -->
    <button
      type="button"
      class="device-row__checkbox"
      :aria-checked="selected"
      :aria-label="selected ? `取消选择 ${item.name}` : `选择 ${item.name}`"
      @click.stop="$emit('select', item)"
    >
      <component :is="selected ? CheckSquare : Square" class="w-4 h-4" />
    </button>
    <!-- 主体按钮：可控设备可点击，light 域直接切换；其余打开控制面板。绑定长按与触摸事件以支持移动端 -->
    <button
      type="button"
      class="list-page__row-main"
      :class="{ 'list-page__row-main--clickable': item.controllable }"
      :disabled="!item.controllable"
      @click="onMainClick"
      @mousedown="longPress.onPressStart"
      @mouseup="longPress.onPressEnd"
      @mouseleave="longPress.onPressCancel"
      @touchstart.passive="longPress.onPressStart"
      @touchend="longPress.onPressEnd"
      @touchcancel="longPress.onPressCancel"
    >
      <span class="list-page__domain" :data-domain="item.domain" :title="item.entity_id">{{
        domainLabel
      }}</span>
      <div class="list-page__row-text">
        <span class="list-page__row-name" :title="item.entity_id">{{ item.name }}</span>
        <span class="list-page__row-sub device-row__entity-id">{{ item.entity_id }}</span>
      </div>
    </button>
    <!-- 行元信息区：房间、电量、状态标签、详情按钮、切换按钮 -->
    <div class="list-page__row-meta">
      <span v-if="item.area" class="list-page__row-area">{{ item.area.display }}</span>
      <span
        v-if="liveBatteryLevel != null"
        :class="['device-row__battery', getBatteryClass(liveBatteryLevel)]"
      >
        <component :is="getBatteryIcon(liveBatteryLevel)" class="w-3 h-3" />
        <span>{{ liveBatteryLevel }}%</span>
      </span>
      <span
        :class="['list-page__state', liveUnavailable && 'list-page__state--bad']"
        role="status"
      >
        <TriangleAlert v-if="liveUnavailable" class="list-page__state-icon" aria-hidden="true" />
        <CircleCheck v-else class="list-page__state-icon" aria-hidden="true" />
        {{ stateLabel }}
      </span>
      <button
        type="button"
        class="list-page__btn list-page__btn--ghost device-row__detail"
        :aria-label="`${item.name} 详情`"
        @click="$emit('detail', item)"
      >
        {{ '详情' }}
      </button>
      <button
        v-if="item.toggleable && !liveUnavailable"
        type="button"
        class="device-row__toggle"
        :aria-label="`切换 ${item.name}`"
        @click="$emit('toggle', item)"
      >
        <Power class="w-3.5 h-3.5" />
      </button>
    </div>

    <!-- 上下文菜单：右键触发，Teleport 至缩放画布与主 UI 同比例 -->
    <Teleport v-if="menuVisible" :to="menuTeleportTo">
      <div
        class="device-row-menu-overlay"
        @click="closeMenu"
        @contextmenu.prevent="closeMenu"
      >
        <div class="device-row-menu" :style="menuStyle" @click.stop>
          <button
            v-if="item.controllable && !item.unavailable"
            type="button"
            class="device-row-menu__item"
            @click="act('open')"
          >
            <Settings2 class="w-3.5 h-3.5" /> {{ '控制' }}
          </button>
          <button type="button" class="device-row-menu__item" @click="act('detail')">
            <ExternalLink class="w-3.5 h-3.5" /> {{ '详情' }}
          </button>
          <button
            v-if="item.toggleable && !item.unavailable"
            type="button"
            class="device-row-menu__item"
            @click="act('toggle')"
          >
            <Power class="w-3.5 h-3.5" /> {{ '切换' }}
          </button>
          <button type="button" class="device-row-menu__item" @click="act('copy')">
            <Copy class="w-3.5 h-3.5" /> {{ '复制 ID' }}
          </button>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import {
  Power,
  CheckSquare,
  Square,
  BatteryFull,
  BatteryMedium,
  BatteryLow,
  Battery,
  Settings2,
  ExternalLink,
  Copy,
  CircleCheck,
  TriangleAlert,
} from '@lucide/vue'
import { useLongPress } from '@/composables/ui/useLongPress'
import { useExclusiveDropdown } from '@/composables/ui/useExclusiveDropdown'
import { viewportPointToPopupAnchor } from '@/composables/ui/usePopupPosition'
import { useShellTeleportTarget } from '@/composables/ui/useShellTeleportTarget'
import { getTeleportContainerSize } from '@/utils/ui/popup-position-shared.util'
import type { DeviceListItem } from '@/types/device'
import { copyTextWithNotify } from '@/services/notify'
import { getDomainLabel } from '@/utils/device/domain-labels.util'
import { displayEntityStateLabel } from '@/constants/entity-state-labels'

// 当前设备项与是否被选中。
const props = defineProps<{
  item: DeviceListItem
  selected?: boolean
}>()

// 交互事件：toggle 切换、open 打开控制面板、detail 详情、select 选中。
const emit = defineEmits<{
  toggle: [DeviceListItem]
  open: [DeviceListItem]
  detail: [DeviceListItem]
  select: [DeviceListItem]
}>()

// 计算属性：根据 domain 解析本地化的域标签（如 light→灯光）。
const domainLabel = computed(() => getDomainLabel(props.item.domain))
// 计算属性：根据 entity_id 与 state 解析展示用状态文案（如 on→开启）。
const stateLabel = computed(() => displayEntityStateLabel(props.item.entity_id, props.item.state))
/** 不可用态（列表项已由 DevicesView 合并实时状态） */
const liveUnavailable = computed(() => props.item.unavailable)
/** 电量百分比；无电池时为 null */
const liveBatteryLevel = computed(() => props.item.batteryLevel)
// 右键菜单可见性。
const menuVisible = ref(false)
useExclusiveDropdown(menuVisible)
const { teleportTarget: menuTeleportTo, refreshShellTeleport } = useShellTeleportTarget()
// 菜单位置：基于鼠标坐标换算到画布坐标系。
const menuStyle = ref<{ top: string; left: string }>({ top: '0px', left: '0px' })

/**
 * 长按回调：仅可控设备触发 open 事件，打开控制面板。
 * 通过 useLongPress 封装长按判定与触摸/鼠标兼容。
 */
const longPress = useLongPress(() => {
  if (props.item.controllable) {
    emit('open', props.item)
  }
})

/**
 * 主体点击处理：
 * - 不可控设备直接返回；
 * - 若刚刚触发了长按则消费标记并返回，避免长按后误触发点击；
 * - 统一打开实体控制面板（不再对 light 域行单击即 toggle，避免翻页/误触时误开关灯；
 *   开关仅通过行内独立开关按钮与右键菜单「切换」触发）。
 */
function onMainClick() {
  if (!props.item.controllable) return
  if (longPress.consumeLongPress()) return
  emit('open', props.item)
}

/**
 * 打开右键菜单：根据鼠标坐标换算到画布坐标系，并约束在容器范围内。
 * @param e 触发的鼠标事件
 */
function openMenu(e: MouseEvent) {
  refreshShellTeleport()
  const { anchorX, anchorY } = viewportPointToPopupAnchor(e.clientX, e.clientY)
  const { cw, ch } = getTeleportContainerSize()
  menuStyle.value = {
    top: `${Math.min(anchorY, ch - 180)}px`,
    left: `${Math.min(anchorX, cw - 200)}px`,
  }
  menuVisible.value = true
}

// 关闭菜单。
function closeMenu() {
  menuVisible.value = false
}

/**
 * 菜单项动作分发：
 * - copy 复制 entity_id 至剪贴板并通知；
 * - open/detail/toggle 转发对应事件至父级。
 * @param action 动作类型
 */
async function act(action: 'open' | 'detail' | 'toggle' | 'copy') {
  closeMenu()
  if (action === 'copy') {
    await copyTextWithNotify(props.item.entity_id, {
      successMessage: '已复制 ID',
      errorMessage: '复制失败',
    })
    return
  }
  if (action === 'open') emit('open', props.item)
  else if (action === 'detail') emit('detail', props.item)
  else if (action === 'toggle') emit('toggle', props.item)
}

/** 电池电量阈值（百分比）：低/中/高三档，样式类与图标共用同一来源，避免区间语义冲突 */
const BATTERY_LOW_THRESHOLD = 10
const BATTERY_MEDIUM_THRESHOLD = 30
const BATTERY_HIGH_THRESHOLD = 60

/**
 * 根据电量返回样式类名：≤10% 低电量红、≤30% 中电量黄、其余无附加类。
 * @param level 电量百分比
 */
function getBatteryClass(level: number) {
  if (level <= BATTERY_LOW_THRESHOLD) return 'device-row__battery--low'
  if (level <= BATTERY_MEDIUM_THRESHOLD) return 'device-row__battery--medium'
  return ''
}

/**
 * 根据电量返回对应图标组件：≤10% BatteryLow、≤30% BatteryMedium、≤60% Battery、其余 BatteryFull。
 * @param level 电量百分比
 */
function getBatteryIcon(level: number) {
  if (level <= BATTERY_LOW_THRESHOLD) return BatteryLow
  if (level <= BATTERY_MEDIUM_THRESHOLD) return BatteryMedium
  if (level <= BATTERY_HIGH_THRESHOLD) return Battery
  return BatteryFull
}

// Escape 键关闭菜单的全局监听。
function onKeyDown(e: KeyboardEvent) {
  if (e.key === 'Escape') closeMenu()
}

// 挂载时注册 keydown 监听，卸载时移除，避免内存泄漏。
onMounted(() => document.addEventListener('keydown', onKeyDown))
onUnmounted(() => document.removeEventListener('keydown', onKeyDown))
</script>

<style scoped src="./styles/DeviceRow.css"></style>
