<!--
  全屋温湿度图表小部件的配置面板，允许用户选择默认视图（综合/温度/湿度）、
  多路温度传感器实体与多路湿度传感器实体；底部汇总选择情况并提供保存按钮。
  注意事项：当 embedded=true 时，保存仅写入布局草稿，仍须点击页头「保存布局」持久化。
-->
<template>
  <div class="hcc-config">
    <div class="hcc-config__panel">
      <div class="hcc-config__head" v-if="!embedded">
        <div>
          <p class="hcc-config__eyebrow">{{ '全屋温湿度' }}</p>
          <p class="hcc-config__desc">
            {{ '添加各房间温度、湿度传感器，图表将拉取历史曲线并在侧栏展示。' }}
          </p>
        </div>
      </div>

      <div class="hcc-config__section">
        <label class="settings-form-label">{{ '默认视图' }}</label>
        <div class="hcc-config__segments">
          <button
            v-for="opt in viewOptions"
            :key="opt.id"
            type="button"
            :class="[
              'hcc-config__segment',
              draft.defaultView === opt.id && 'hcc-config__segment--active',
            ]"
            @click="draft.defaultView = opt.id"
          >
            {{ opt.label }}
          </button>
        </div>
      </div>

      <div class="hcc-config__section">
        <label class="settings-form-label">{{ '温度传感器' }}</label>
        <p class="hcc-config__hint">{{ '支持多个 sensor.* 实体，按选择顺序展示曲线。' }}</p>
        <EntityMultiSelect
          v-model="draft.temperatureEntities"
          :allowed-domains="['sensor']"
          suggest-device-class="temperature"
          placeholder="搜索并选择温度传感器"
          wrapper-class="hcc-config__multiselect"
        />
      </div>

      <div class="hcc-config__section">
        <label class="settings-form-label">{{ '湿度传感器' }}</label>
        <p class="hcc-config__hint">
          {{ 'device_class 为 humidity 的传感器，或与温度配对使用。' }}
        </p>
        <EntityMultiSelect
          v-model="draft.humidityEntities"
          :allowed-domains="['sensor']"
          suggest-device-class="humidity"
          placeholder="搜索并选择湿度传感器"
          wrapper-class="hcc-config__multiselect"
        />
      </div>

      <!-- 房间显示名称：卡片摘要与图例都读这一层，留空即回落到传感器自带名称 -->
      <div v-if="rooms.length" class="hcc-config__section">
        <label class="settings-form-label">{{ '房间显示名称' }}</label>
        <p class="hcc-config__hint">
          {{ '留空使用传感器名称；同一房间的温度、湿度会一起改名，摘要里仍合成一行。' }}
        </p>
        <div class="hcc-config__names">
          <div v-for="room in rooms" :key="room.key" class="hcc-config__name-row">
            <span class="hcc-config__name-source" :title="room.autoName">
              {{ room.autoName }}
            </span>
            <input
              class="settings-field hcc-config__name-input"
              :value="room.name"
              :placeholder="room.autoName"
              maxlength="12"
              @input="renameRoom(room, $event)"
            />
          </div>
        </div>
      </div>
    </div>

    <div class="hcc-config__foot">
      <p class="hcc-config__foot-hint">
        {{
          embedded
            ? `${summary} · 保存后需点击页头「保存布局」持久化`
            : summary
        }}
      </p>
      <button type="button" class="settings-btn-primary text-xs" @click="$emit('save')">
        {{ '保存配置' }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import EntityMultiSelect from '@/components/common/entity-multi-select/EntityMultiSelect.vue'
import { climateEntityBaseName } from '@/components/widgets/climate/home-climate-chart/echarts.util'
import { useEntitiesStore } from '@/stores/entities.store'
import {
  HOME_CLIMATE_CHART_VIEW_OPTIONS,
  type HomeClimateChartConfig,
} from '@/shared/utils/registry/home-climate-chart-options'

const draft = defineModel<Required<HomeClimateChartConfig>>({ required: true })

defineProps<{ embedded?: boolean }>()

defineEmits<{ save: [] }>()

const viewOptions = HOME_CLIMATE_CHART_VIEW_OPTIONS
const entitiesStore = useEntitiesStore()

/** 后台名称编辑的一行：一个「房间」= 自动名相同的若干温湿度实体 */
interface RoomNameRow {
  key: string
  /** 传感器推导出的自动名，也是输入框的 placeholder */
  autoName: string
  /** 该房间纳入改名的全部实体 ID（温度 + 湿度），一次改名写全 */
  entityIds: string[]
  /** 当前自定义名；空串表示沿用自动名 */
  name: string
}

/**
 * 按「自动名」把已选实体折叠成房间行。
 *
 * 分组键用**不含自定义名的**自动名：否则一个房间只改了温度实体时，温度和湿度会被
 * 拆成两行，用户在面板里看到两个「客厅」。自定义名只作为输入框的值展示。
 */
const rooms = computed<RoomNameRow[]>(() => {
  const groups = new Map<string, RoomNameRow>()
  const add = (entityId: string) => {
    if (!entityId) return
    const autoName = climateEntityBaseName(entityId, entitiesStore.entities)
    let row = groups.get(autoName)
    if (!row) {
      row = { key: autoName, autoName, entityIds: [], name: '' }
      groups.set(autoName, row)
    }
    row.entityIds.push(entityId)
    // 同一房间的多个实体理论上写入同一个名字；取第一个非空的作为输入框显示值
    const custom = String(draft.value.entityNames?.[entityId] ?? '')
    if (!row.name && custom) row.name = custom
  }
  draft.value.temperatureEntities.forEach(add)
  draft.value.humidityEntities.forEach(add)
  return [...groups.values()]
})

/**
 * 把一个房间的改名结果写到它的全部实体上。
 *
 * 不做 trim 后回写：输入框是受控的，回写裁剪过的值会让光标在打空格时往前跳。
 * 裁剪交给 `normalizeHomeClimateChartConfig` 在保存时统一处理。清空即删除覆盖项。
 */
function renameRoom(room: RoomNameRow, event: Event) {
  const value = (event.target as HTMLInputElement).value
  const names = { ...(draft.value.entityNames || {}) }
  for (const entityId of room.entityIds) {
    if (value.trim()) names[entityId] = value
    else delete names[entityId]
  }
  draft.value = { ...draft.value, entityNames: names }
}

const summary = computed(() => {
  const t = draft.value.temperatureEntities.length
  const h = draft.value.humidityEntities.length
  const view = viewOptions.find((o) => o.id === draft.value.defaultView)?.label || '综合'
  const renamed = Object.keys(draft.value.entityNames || {}).length
  const namePart = renamed ? ` · ${renamed} 个实体已改名` : ''
  return `${t} 路温度 · ${h} 路湿度 · 默认 ${view}${namePart}`
})
</script>

<style scoped src="./styles/HomeClimateChartConfigPanel.css"></style>
