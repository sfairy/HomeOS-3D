<template>
  <div class="climate-card">
    <!-- 头部：非嵌入模式下展示标题与运行数量徽标 -->
    <div v-if="!embedded" class="cc-header">
      <h3 class="cc-title">
        <div class="cc-icon-wrap">
          <ThermometerSun class="w-4 h-4 cc-ic-blue" />
        </div>
        {{ '空调状态' }}
      </h3>
      <span v-if="activeClimateCount > 0" class="cc-badge">
        {{ '{n} 运行中'.replace('{n}', String(activeClimateCount)) }}
      </span>
    </div>

    <div class="flex-1 space-y-3">
      <!-- 单台空调卡片：点击弹出详细控制面板 -->
      <div
        v-for="entity in climateEntities"
        :key="entity.entity_id"
        class="cc-item"
        @click="showControlPopup(entity, $event)"
      >
        <div class="cc-item-top">
          <span class="cc-item-name">{{ getEntityDisplayName(entity.entity_id, entity) }}</span>
          <!-- 运行状态徽标 + 运行指示点（关闭时不显示） -->
          <div class="cc-item-state">
            <span :class="['cc-state-badge', getStateClass(entity.state)]">
              {{ getStateLabel(entity.state) }}
            </span>
            <div
              v-if="entity.state !== 'off'"
              :class="['cc-state-dot', entity.state === 'cool' ? 'cc-dot--cool' : 'cc-dot--heat']"
            />
          </div>
        </div>

        <div class="cc-item-body">
          <div class="cc-temps">
            <!-- 当前温度：按温度档位动态切换颜色 -->
            <div
              v-if="entity.attributes?.current_temperature !== undefined"
              class="cc-current-temp"
            >
              <Thermometer
                class="w-3 h-3"
                :class="getTempColor(entity.attributes.current_temperature)"
              />
              <span :class="getTempColor(entity.attributes.current_temperature)"
                >{{ entity.attributes.current_temperature }}°C</span
              >
            </div>
            <!-- 目标温度：制热/制冷模式分别使用不同图标 -->
            <div v-if="entity.attributes?.temperature !== undefined" class="cc-target-temp">
              <Flame v-if="entity.state === 'heat'" class="w-3 h-3 cc-ic-heat" />
              <Snowflake v-else-if="entity.state === 'cool'" class="w-3 h-3 cc-ic-cool" />
              <span>{{ entity.attributes.temperature }}°C</span>
            </div>
          </div>
          <ChevronRight class="w-4 h-4 text-white/15" />
        </div>

        <!-- 风扇模式：若实体支持多档位则展示可点击按钮组，单档时仅展示标签 -->
        <div v-if="entity.attributes?.fan_modes?.length" class="cc-fan-row" @click.stop>
          <Fan class="w-3 h-3 cc-ic-cyan shrink-0" />
          <button
            v-for="mode in entity.attributes.fan_modes"
            :key="mode"
            :class="[
              'cc-fan-btn',
              entity.attributes?.fan_mode === mode ? 'cc-fan-btn--active' : '',
            ]"
            @click.stop="setFanMode(entity, mode)"
          >
            {{ getFanModeLabel(mode) }}
          </button>
        </div>
        <div v-else-if="entity.attributes?.fan_mode" class="cc-fan-label">
          <Fan class="w-3 h-3 cc-ic-cyan" />
          <span>{{ getFanModeLabel(entity.attributes.fan_mode) }}</span>
        </div>
      </div>

      <!-- 空态：未发现任何 climate 实体时引导用户去配置 -->
      <VEmptyState
        v-if="climateEntities.length === 0"
        compact
        tone="emerald"
        icon="🌡"
        :title="'未找到空调设备'"
        :description="'请在 Home Assistant 中配置空调实体'"
      />
    </div>

    <!-- 温控弹窗：按点击位置百分比定位 -->
    <ClimateControlPopup
      v-if="showPopup && selectedEntityId"
      :entity="selectedLiveEntity"
      :xPct="popupX"
      :yPct="popupY"
      @close="showPopup = false"
    />
  </div>
</template>
<script setup>
/**
 * 空调模式中文标签映射：HA climate 状态码 → 中文显示
 */
const CLIMATE_MODE_LABELS = {
  auto: '自动',
  cool: '制冷',
  dry: '除湿',
  fan_only: '送风',
  heat: '制热',
  off: '关闭',
}

/**
 * 风扇模式中文标签映射：HA fan_mode → 中文显示
 */
const FAN_MODE_LABELS = {
  auto: '自动',
  high: '高风',
  low: '低风',
  medium: '中风',
}

/**
 * @file ClimateCard.vue
 * @module widgets/climate
 * @description 空调状态卡片部件：在右侧信息面板中展示所有 climate 域实体的当前运行状态。
 *              最多显示 5 个空调设备，点击可弹出温控面板（ClimateControlPopup）。
 *
 * 核心功能：
 *  - 展示当前温度（current_temperature）和目标温度（temperature）
 *  - 显示空调运行模式（制冷/制热/自动/除湿/送风/关闭）
 *  - 支持风扇风速模式切换（自动/低/中/高）
 *  - 点击任意空调条目弹出详细控制面板
 *  - 设备运行时高亮指示点
 *
 * 数据来源：HA climate 实体，通过 entitiesStore 读取实时状态。
 *
 * @dependencies
 *  - vue: ref/computed 响应式 API
 *  - @lucide/vue: ThermometerSun/Thermometer/Flame/Snowflake/Fan/ChevronRight 图标
 *  - @/stores/entities.store: 实体状态与 HA 服务调用
 *  - @/utils/entity/entity-derived.util: 实体友好名生成
 *  - @/composables/entity/useEntity: 单实体响应式订阅
 *  - @/components/entities/popups/ClimateControlPopup.vue: 温控弹窗
 *  - @/services/notify: 错误通知
 */
import { ref, computed } from 'vue'
import { ThermometerSun, Thermometer, Flame, Snowflake, Fan, ChevronRight } from '@lucide/vue'
import { useEntitiesStore } from '@/stores/entities.store'
import { getEntityDisplayName } from '@/utils/entity/derived.util'
import { useEntity } from '@/composables/entity/useEntity'
import ClimateControlPopup from '@/components/entities/popups/ClimateControlPopup.vue'
import { notifyError } from '@/services/notify'

defineProps({
  embedded: { type: Boolean, default: false },
})

const entitiesStore = useEntitiesStore()

// 控制面板弹窗状态：是否展示 / 选中的实体 ID / 弹窗坐标百分比
const showPopup = ref(false)
const selectedEntityId = ref(null)
const popupX = ref(50)
const popupY = ref(50)

// 选中的实体实时响应式引用，弹窗据此展示最新状态
const selectedLiveEntity = useEntity(() => selectedEntityId.value)

/**
 * 筛选所有 climate 域实体，最多取前 5 个。
 * 通过 key 前缀匹配避免全量 Object.values() 提取；
 * 同时显式访问 getDomainEpoch('climate') 以建立对该域的响应式依赖。
 * @returns {Array} climate 实体数组（最多 5 个）
 */
const climateEntities = computed(() => {
  void entitiesStore.getDomainEpoch('climate')
  const all = entitiesStore.entities
  const result = []
  for (const key in all) {
    if (key.startsWith('climate.')) {
      result.push(all[key])
      if (result.length >= 5) break
    }
  }
  return result
})

/**
 * 统计当前正在运行（非 off 且非 unavailable）的空调数量。
 * @returns {number} 运行中的空调数量
 */
const activeClimateCount = computed(() => {
  return climateEntities.value.filter((e) => e.state !== 'off' && e.state !== 'unavailable').length
})

/**
 * 根据 HA climate 实体状态返回对应的 CSS 样式类名。
 * @param {string} state - 空调运行状态（cool/heat/auto/dry/fan_only/off）
 * @returns {string} CSS 类名
 */
function getStateClass(state) {
  switch (state) {
    case 'cool':
      return 'cc-state-badge--cool'
    case 'heat':
      return 'cc-state-badge--heat'
    case 'auto':
      return 'cc-state-badge--auto'
    case 'dry':
      return 'cc-state-badge--dry'
    case 'fan_only':
      return 'cc-state-badge--fan'
    case 'off':
      return 'cc-state-badge--off'
    default:
      return 'cc-state-badge--off'
  }
}

/**
 * 根据温度值返回对应的颜色 CSS 类名。
 * @param {number} temp 当前温度（°C）
 * @returns {string} CSS 类名
 */
function getTempColor(temp) {
  if (temp === undefined || temp === null) return 'cc-temp-muted'
  if (temp >= 35) return 'cc-temp-danger'
  if (temp >= 28) return 'cc-temp-warn-deep'
  if (temp >= 22) return 'cc-temp-warn'
  if (temp >= 16) return 'cc-temp-success'
  if (temp >= 8) return 'cc-temp-info'
  return 'cc-temp-blue'
}

// 合法 climate 模式与 fan 模式集合，用于标签映射的合法性校验
const CLIMATE_MODES = new Set(['cool', 'heat', 'auto', 'dry', 'fan_only', 'off'])
const FAN_MODES = new Set(['auto', 'low', 'medium', 'high'])

/**
 * 将 HA climate 状态码转换为本地化标签。
 * @param {string} state - 空调运行状态
 * @returns {string} 本地化状态描述
 */
function getStateLabel(state) {
  return CLIMATE_MODES.has(state) ? (CLIMATE_MODE_LABELS[state] ?? state) : state
}

/**
 * 将 HA climate 风扇模式转换为本地化标签。
 * @param {string} mode - 风扇模式代码
 * @returns {string} 本地化模式描述
 */
function getFanModeLabel(mode) {
  return FAN_MODES.has(mode) ? (FAN_MODE_LABELS[mode] ?? mode) : mode
}

/**
 * 设置空调风扇模式，调用 HA climate.set_fan_mode 服务。
 * @param {Object} entity - climate 实体对象
 * @param {string} mode - 目标风扇模式
 * @returns {Promise<void>}
 * @throws {Error} 服务调用失败时通过 notifyError 提示
 */
async function setFanMode(entity, mode) {
  try {
    await entitiesStore.callService('climate', 'set_fan_mode', entity.entity_id, {
      fan_mode: mode,
    })
  } catch (e) {
    notifyError(e, '设置风扇模式')
  }
}

/**
 * 显示空调控制弹窗，根据点击位置计算弹窗的 x/y 百分比坐标。
 * @param {Object} entity - climate 实体对象
 * @param {MouseEvent} event - 点击事件
 */
function showControlPopup(entity, event) {
  const rect = event.currentTarget.getBoundingClientRect()
  const x = rect.left + rect.width / 2
  const y = rect.top + rect.height / 2

  selectedEntityId.value = entity.entity_id
  popupX.value = (x / window.innerWidth) * 100
  popupY.value = (y / window.innerHeight) * 100
  showPopup.value = true
}
</script>

<style scoped src="./styles/Card.css"></style>