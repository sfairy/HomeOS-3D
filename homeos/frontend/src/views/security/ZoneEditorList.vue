<!--
组件：SecurityZoneEditorList.vue
所属模块：frontend / src / views / security
职责：安防区域编辑器。渲染区域卡片列表（关联房间 / 告警名称 / 类型 / 绑定传感器），
      支持紧凑模式（master-detail 导航）、手动 entity_id 编辑、空态引导与房间同步。
关键依赖：
  - useSecurityZoneRooms：房间选项、可选传感器、房间到区域的同步
  - useSecurityZoneEditorList：紧凑模式下的导航与渲染逻辑
  - HosSelect / EntityMultiSelect / HomeModeItemNav：下拉、实体多选与导航子组件
  - X / Map / Sparkles / Plus 图标来自 @lucide/vue
数据来源：v-model 绑定的 zones 列表 + useSecurityZoneRooms 提供的房间与传感器
-->
<template>
  <div
    :class="[
      'sz-editor',
      variant === 'widget' && 'sz-editor--widget',
      embedded && 'sz-editor--embedded',
      fillHeight && 'sz-editor--fill',
    ]"
  >
    <p v-if="showHint" class="sz-editor__hint">
      {{ '告警分组：关联 HA 房间并选择传感器；类型决定居家/夜间模式下是否触发告警。' }}
    </p>

    <div v-if="editable && showToolbar" class="sz-editor__toolbar">
      <button
        type="button"
        :class="toolbarPrimaryClass"
        :disabled="roomsLoading"
        @click="handleGenerateFromRooms"
      >
        {{ '从房间生成' }}
      </button>
      <button
        type="button"
        :class="toolbarGhostClass"
        :disabled="roomsLoading"
        @click="refreshRooms"
      >
        {{ roomsLoading ? '同步中…' : '刷新房间' }}
      </button>
    </div>

    <div v-if="!zones.length" class="sz-empty">
      <div class="sz-empty__visual" aria-hidden="true">
        <Map class="sz-empty__icon" />
        <span class="sz-empty__ring" />
      </div>
      <h4 class="sz-empty__title">{{ '尚未配置告警区域' }}</h4>
      <p class="sz-empty__desc">
        {{ '关联 Home Assistant 房间，将门磁、人体等传感器编入布防分组' }}
      </p>
      <div v-if="editable" class="sz-empty__actions">
        <button type="button" :class="toolbarPrimaryClass" @click="onEmptyGenerate">
          <Sparkles class="w-4 h-4" />
          <span>{{ '从 HA 房间一键生成' }}</span>
        </button>
        <button type="button" :class="toolbarGhostClass" @click="onEmptyAdd">
          <Plus class="w-4 h-4" />
          <span>{{ '手动添加区域' }}</span>
        </button>
      </div>
      <p v-if="roomsWithSensors.length === 0 && roomsReady" class="sz-empty__hint">
        {{ '未检测到带安防传感器的房间，请先在 HA 中为门磁/人体传感器设置区域。' }}
      </p>
    </div>

    <div v-else :class="['sz-zone-shell', fillHeight && 'sz-zone-shell--fill']">
      <div v-if="isCompact" class="sz-zone-compact-bar">
        <button type="button" class="sz-chip-btn" @click="expandAll">{{ '列表视图' }}</button>
        <button type="button" class="sz-chip-btn" @click="collapseAll">{{ '收起详情' }}</button>
      </div>

      <div :class="['sz-zone-body', isCompact && !expandedAll && 'sz-zone-body--split']">
        <div :class="isCompact && !expandedAll && 'sz-master-detail'">
          <HomeModeItemNav
            v-if="isCompact && !expandedAll"
            :items="zoneNavItems"
            :active-index="activeTabIndex"
            head-label="个区域"
            aria-label="区域导航"
            @select="selectItem"
          />

          <div
            :class="
              isCompact && !expandedAll ? 'sz-item-detail sz-item-detail--pane' : 'sz-item-detail'
            "
          >
            <p
              v-if="isCompact && !expandedAll && !renderedZones.length"
              class="sz-item-detail-empty"
            >
              {{ '从左侧选择一个区域进行编辑' }}
            </p>

            <div
              v-else
              :class="[
                'sz-zone-list',
                fillHeight && 'sz-zone-list--fill',
                isCompact && !expandedAll && 'sz-zone-list--single',
              ]"
            >
              <article
                v-for="{ zone, idx } in renderedZones"
                :key="zone.id || idx"
                :data-zone-id="zone.id"
                class="sz-zone-card"
              >
                <div
                  :class="[
                    'sz-zone-card__head',
                    (!embedded || !zone.roomId) && 'sz-zone-card__head--named',
                  ]"
                >
                  <label class="sz-zone-field sz-zone-field--room">
                    <span class="sz-zone-field__label">{{ '关联房间' }}</span>
                    <HosSelect
                      variant="inline"
                      block
                      trigger-class="sz-zone-field__select"
                      :model-value="zone.roomId || ''"
                      :disabled="!editable"
                      @update:model-value="onRoomChange(zone, $event)"
                    >
                      <option value="">{{ '自定义' }}</option>
                      <option v-for="room in roomOptions" :key="room.id" :value="room.id">
                        {{ room.label }}
                      </option>
                    </HosSelect>
                  </label>

                  <label v-if="!embedded || !zone.roomId" class="sz-zone-field">
                    <span class="sz-zone-field__label">{{ '告警名称' }}</span>
                    <input
                      v-model="zone.name"
                      type="text"
                      class="sz-zone-field__input"
                      :placeholder="'告警文案中显示'"
                      :disabled="!editable"
                    />
                  </label>

                  <label class="sz-zone-field sz-zone-field--type">
                    <span class="sz-zone-field__label">{{ '类型' }}</span>
                    <HosSelect
                      variant="inline"
                      block
                      trigger-class="sz-zone-field__select"
                      v-model="zone.zoneType"
                      :disabled="!editable"
                    >
                      <option value="all">{{ '全部' }}</option>
                      <option value="perimeter">{{ '外围' }}</option>
                      <option value="interior">{{ '室内' }}</option>
                    </HosSelect>
                  </label>

                  <button
                    v-if="editable"
                    type="button"
                    class="sz-zone-card__del"
                    :aria-label="'删除区域'"
                    @click="removeZone(idx)"
                  >
                    <X class="w-3.5 h-3.5" />
                  </button>
                </div>

                <div class="sz-zone-card__sensors">
                  <div class="sz-zone-sensors-head">
                    <span class="sz-zone-field__label">{{ '绑定传感器' }}</span>
                    <button
                      v-if="zone.roomId && editable"
                      type="button"
                      class="sz-zone-sync-btn"
                      @click="syncZoneSensorsFromRoom(zone)"
                    >
                      {{ '同步房间' }}
                    </button>
                  </div>

                  <div v-if="pickableSensorsForZone(zone).length" class="sz-zone-sensor-chips">
                    <button
                      v-for="sensor in pickableSensorsForZone(zone)"
                      :key="sensor.entity_id"
                      type="button"
                      :class="[
                        'sz-zone-sensor-chip',
                        zone.sensors.includes(sensor.entity_id) && 'sz-zone-sensor-chip--on',
                      ]"
                      :disabled="!editable"
                      :title="sensor.entity_id"
                      @click="toggleZoneSensor(zone, sensor.entity_id)"
                    >
                      <span class="sz-zone-sensor-chip__type">{{ sensor.label }}</span>
                      <span class="sz-zone-sensor-chip__name">{{ sensor.name }}</span>
                    </button>
                  </div>

                  <details class="sz-zone-manual">
                    <summary>{{ '手动编辑 entity_id' }}</summary>
                    <EntityMultiSelect
                      v-model="zone.sensors"
                      :allowed-domains="['binary_sensor']"
                      placeholder="搜索并选择区域传感器"
                      wrapper-class="sz-zone-entities"
                    />
                  </details>

                  <p v-if="!zone.sensors.length" class="sz-zone-sensor-empty">
                    {{ '请勾选传感器或手动添加' }}
                  </p>
                </div>
              </article>

              <button
                v-if="editable && showInlineAdd && (!isCompact || expandedAll)"
                type="button"
                class="sz-zone-add"
                @click="addZone"
              >
                {{ '+ 添加区域' }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, nextTick } from 'vue'
import HosSelect from '@/components/common/base/HosSelect.vue'
import { X, Map, Sparkles, Plus } from '@lucide/vue'
import EntityMultiSelect from '@/components/common/EntityMultiSelect.vue'
import HomeModeItemNav from '@/views/settings/automate/home-mode/HomeModeItemNav.vue'
import { useSecurityZoneRooms } from '@/composables/security/useSecurityZoneRooms'
import { useSecurityZoneEditorList } from '@/composables/security/useSecurityZoneEditorList'
import './styles/security.css'

// 入参：变体（dash/widget）、是否可编辑、是否嵌入、各类显示开关、是否撑满高度
const props = defineProps({
  variant: { type: String, default: 'dash' },
  editable: { type: Boolean, default: true },
  embedded: Boolean,
  showHint: { type: Boolean, default: true },
  showToolbar: { type: Boolean, default: true },
  showInlineAdd: { type: Boolean, default: true },
  showEmptyActions: { type: Boolean, default: true },
  fillHeight: { type: Boolean, default: false },
})

// 双向绑定：当前编辑的区域列表
const zones = defineModel({ type: Array, default: () => [] })

// 对外事件：空态按钮在禁用内置行为时向父级请求生成 / 添加
const emit = defineEmits(['request-generate', 'request-add'])

const {
  roomOptions,
  roomsWithSensors,
  roomsReady,
  roomsLoading,
  pickableSensorsForZone,
  applyRoomToZone,
  toggleZoneSensor,
  syncZoneSensorsFromRoom,
  handleGenerateFromRooms: generateFromRooms,
  refreshRooms,
} = useSecurityZoneRooms()

const {
  isCompact,
  expandedAll,
  activeTabIndex,
  selectItem,
  expandAll,
  collapseAll,
  zoneNavItems,
  renderedZones,
} = useSecurityZoneEditorList(zones, roomOptions)

// 工具栏主按钮样式随 variant 切换：widget 用 ws-hint-action，dash 用 sec-dash-btn
const toolbarPrimaryClass = computed(() =>
  props.variant === 'widget' ? 'ws-hint-action' : 'sec-dash-btn sec-dash-btn--primary',
)
// 工具栏次按钮样式随 variant 切换
const toolbarGhostClass = computed(() =>
  props.variant === 'widget'
    ? 'ws-btn-add !w-auto !inline-flex'
    : 'sec-dash-btn sec-dash-btn--ghost',
)

// 追加一个空白区域到列表末尾
function addZone() {
  zones.value = [
    ...zones.value,
    {
      id: `zone-${Date.now()}`,
      name: '',
      zoneType: 'all',
      sensors: [],
      roomId: '',
    },
  ]
}

// 删除指定索引的区域
function removeZone(idx) {
  zones.value = zones.value.filter((_, i) => i !== idx)
}

// 切换关联房间：清空则仅清除 roomId，否则应用房间并替换传感器
function onRoomChange(zone, roomId) {
  if (!roomId) {
    zone.roomId = ''
    return
  }
  applyRoomToZone(zone, roomId, { replaceSensors: true })
}

// 工具栏「从房间生成」：调用 composable 用 HA 房间填充 zones
function handleGenerateFromRooms() {
  generateFromRooms(zones)
}

// 空态「从 HA 房间一键生成」：根据 showEmptyActions 决定内置执行还是向父级请求
function onEmptyGenerate() {
  if (props.showEmptyActions) handleGenerateFromRooms()
  else emit('request-generate')
}

// 空态「手动添加区域」：根据 showEmptyActions 决定内置执行还是向父级请求
function onEmptyAdd() {
  if (props.showEmptyActions) addZone()
  else emit('request-add')
}

// 挂载时拉取 HA 房间列表，填充房间选项与可选传感器
onMounted(async () => {
  await refreshRooms()
})

// 按 ID 聚焦区域：紧凑模式切到对应 Tab，否则滚动定位并短暂高亮
function focusZoneById(id) {
  const idx = zones.value.findIndex((z) => z.id === id)
  if (idx < 0) return
  if (isCompact.value && !expandedAll.value) {
    selectItem(idx)
    return
  }
  nextTick(() => {
    const root = document.querySelector('.sz-zone-list')
    const el = root?.querySelector(`[data-zone-id="${CSS.escape(id)}"]`)
    el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    el?.classList.add('sz-zone-card--focus')
    window.setTimeout(() => el?.classList.remove('sz-zone-card--focus'), 2200)
  })
}

// 暴露给父级的方法：生成 / 刷新 / 添加 / 聚焦
defineExpose({
  handleGenerateFromRooms,
  refreshRooms,
  addZone,
  focusZoneById,
})
</script>
