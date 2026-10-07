<!--
  @file DeviceRow.vue
  @module 设备列表/单行组件
  @description 设备列表的单行渲染组件：展示复选框、域标签、设备名、entity_id、房间、电量、状态与操作按钮。
               有控制弹窗的域（含灯光）单击主体打开弹窗；灯光短按开关改走行内「切换」按钮。
               右键菜单：控制/详情/切换/复制 ID。菜单 Teleport 至 #teleport-target，Esc 走 useEscStack。
  @dependencies vue（ref/computed）、@lucide/vue、useEscStack（Esc 层级栈）、
                DeviceListItem 类型、copyTextWithNotify、getDomainLabel、
                displayEntityStateLabel、entityPopupOpensOnClick。
-->
<template>
  <div
    :class="[
      'list-page__row device-row',
      liveUnavailable && 'list-page__row--dim',
      selected && 'device-row--selected',
    ]"
    :data-selected="selected ? 'true' : 'false'"
    @contextmenu.prevent="openMenu"
  >
    <!-- 选择复选框：role=checkbox + aria-checked 让读屏播报「已选中/未选中」，
         aria-label 随状态变化。视觉态同时落 data-selected 供 CSS 与测试断言。 -->
    <button
      type="button"
      role="checkbox"
      class="device-row__checkbox"
      :aria-checked="selected"
      :aria-label="selected ? `取消选择 ${item.name}` : `选择 ${item.name}`"
      @click.stop="$emit('select', item)"
    >
      <component :is="selected ? CheckSquare : Square" class="w-4 h-4" aria-hidden="true" />
    </button>
    <!-- 主体：有控制弹窗则单击打开；开关仍走右侧「切换」按钮 -->
    <button
      type="button"
      class="list-page__row-main"
      :class="{ 'list-page__row-main--clickable': item.controllable }"
      :disabled="!item.controllable"
      :aria-describedby="stateId"
      @click="onMainClick"
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
        <component :is="getBatteryIcon(liveBatteryLevel)" class="w-3 h-3" aria-hidden="true" />
        <span>{{ liveBatteryLevel }}%</span>
      </span>
      <!-- 状态文案用 aria-describedby 挂在主体按钮上，而不是 role="status"：
           列表是虚拟滚动，每滚动一屏会挂载一批新行，行内 live region 会把「开/关」
           逐条念一遍。改为随按钮焦点读取，状态变化本身由开关按钮与 toast 反馈。 -->
      <span
        :id="stateId"
        :class="['list-page__state', liveUnavailable && 'list-page__state--bad']"
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
import { ref, computed } from 'vue'
import { useEscLayer } from '@/composables/ui/useEscStack'
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
import { useExclusiveDropdown } from '@/composables/ui/useExclusiveDropdown'
import { viewportPointToPopupAnchor } from '@/composables/ui/usePopupPosition'
import { useShellTeleportTarget } from '@/composables/ui/useShellTeleportTarget'
import { getTeleportContainerSize } from '@/utils/ui/popup-position-shared.util'
import type { DeviceListItem } from '@/types/device'
import { copyTextWithNotify } from '@/services/notify'
import { getDomainLabel } from '@/utils/device/domain-labels.util'
import { displayEntityStateLabel } from '@/constants/entity-state-labels'
import { entityPopupOpensOnClick } from '@/utils/entity/popup-registry'

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
/**
 * 状态文案的 DOM id：主体按钮通过 aria-describedby 引用，
 * 键盘/读屏聚焦设备名时顺带播报「开启/关闭/离线」。
 * entity_id 在列表内唯一（VirtualList 以它作 key），故 id 不会重复。
 */
const stateId = computed(() => `device-row-state-${props.item.entity_id}`)
// 右键菜单可见性。
const menuVisible = ref(false)
useExclusiveDropdown(menuVisible)
const { teleportTarget: menuTeleportTo, refreshShellTeleport } = useShellTeleportTarget()
// 菜单位置：基于鼠标坐标换算到画布坐标系。
const menuStyle = ref<{ top: string; left: string }>({ top: '0px', left: '0px' })

/**
 * 主体点击处理：
 * - 不可控设备直接返回；
 * - 有控制弹窗：emit open；
 * - 无弹窗但可切换：短按 toggle（开关等）。
 */
function onMainClick() {
  if (!props.item.controllable) return
  if (entityPopupOpensOnClick(props.item.entity_id)) {
    emit('open', props.item)
    return
  }
  if (props.item.toggleable && !props.item.unavailable) emit('toggle', props.item)
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

// Esc 关闭菜单：入全局 Esc 层级栈，只关栈顶那一层。
// 原来直接挂 document keydown，会在 window 上的层级栈之前抢先触发 ——
// 菜单叠在确认框/查看器之上时，一次 Esc 会连下层一起关掉。
useEscLayer(menuVisible, '设备行菜单', () => closeMenu())
</script>

<style scoped src="./styles/DeviceRow.css"></style>
