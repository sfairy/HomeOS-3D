<template>
  <!-- 仅在 entityIds 非空时渲染整个列表区域 -->
  <template v-if="entityIds.length > 0">
    <!-- 批量操作工具条 + 执行结果展示 -->
    <DeviceGroupBatchBar
      :show="showBatchBar"
      :executing="batchExecuting"
      :on-count="activeEntityCount"
      :total="entityIds.length"
      :off-only="false"
      :stat-label="domain === 'climate' ? '运行中' : '已开启'"
      @toggle="(on) => emit('batch-toggle', on)"
    />
    <DeviceGroupActions
      :result="batchExecResult"
      :executing="batchExecuting"
      @retry="emit('retry')"
    />
    <!--
      实体卡片网格：根据域与是否为紧凑网格切换不同样式
      - climate 域：固定 2/4 列
      - light/switch 紧凑网格：使用 dgm-light-grid / dgm-light-card
      - 其它：使用通用网格 + entity-card-large

      light/switch 大列表走虚拟滚动（按 4 列分块 + VirtualList），
      避免成百上千张紧凑卡片同时挂载 DOM。
    -->
    <VirtualList
      v-if="useVirtualGrid"
      :items="virtualRows"
      :item-height="COMPACT_CARD_HEIGHT"
      :item-gap="10"
      :virtual-threshold="8"
      container-class="dgm-virtual-wrap"
      :item-key="(row) => row.join('|')"
    >
      <template #default="{ item: row }">
        <div class="dgm-light-grid dgm-light-grid--virtual">
          <DeviceGroupLightCard
            v-for="eid in row"
            :key="eid"
            :domain="domain"
            :icon="domainInfo.icon"
            :name="getEntityDisplayName(eid, getEntity(eid))"
            :is-on="getEntity(eid)?.state === 'on'"
            @toggle="toggleLightSwitch(eid)"
          />
        </div>
      </template>
    </VirtualList>
    <div
      v-else
      :class="[
        isCompactGrid ? 'dgm-light-grid' : 'grid gap-3',
        !isCompactGrid &&
          (domain === 'climate'
            ? 'grid-cols-2 md:grid-cols-4'
            : 'grid-cols-2 md:grid-cols-3 lg:grid-cols-4'),
      ]"
    >
      <template v-if="isCompactGrid">
        <DeviceGroupLightCard
          v-for="eid in displayEntityIds"
          :key="eid"
          :domain="domain"
          :icon="domainInfo.icon"
          :name="getEntityDisplayName(eid, getEntity(eid))"
          :is-on="getEntity(eid)?.state === 'on'"
          @toggle="toggleLightSwitch(eid)"
        />
      </template>
      <div
        v-for="eid in displayEntityIds"
        v-else
        :key="eid"
        :class="[
          'group transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] tap-active',
          'entity-card-large flex flex-col',
          domain === 'climate' ? 'entity-card-climate' : 'justify-center',
          getEntity(eid)?.state === 'on' ||
          (domain === 'climate' && getEntity(eid)?.state !== 'off')
            ? 'is-active'
            : '',
        ]"
      >
        <!-- climate 卡片：温控设备专用布局（含温度调节、HVAC 模式、风速档位） -->
        <template v-if="domain === 'climate'">
          <div class="dgm-climate-card">
            <div class="dgm-climate-head">
              <!-- 右上角关闭按钮：点击直接关闭该 climate 实体 -->
              <button
                type="button"
                class="dgm-climate-off-btn dgm-climate-off-btn--sm dgm-climate-off-btn--corner"
                :aria-label="'关闭'"
                @click.stop="turnOffClimate(eid)"
              >
                <Power class="w-4 h-4" />
              </button>
              <div
                class="dgm-climate-icon dgm-climate-icon--sm"
                :style="{
                  background: climateBgColor(getEntity(eid)?.state),
                  borderColor: climateBorderColor(getEntity(eid)?.state),
                }"
              >
                <span>{{ climateIconEmoji(getEntity(eid)?.state) }}</span>
              </div>
              <h3 class="dgm-climate-name">{{ getEntityDisplayName(eid, getEntity(eid)) }}</h3>
              <span
                :class="[
                  'dgm-climate-state-tag',
                  `dgm-climate-state-tag--${getEntity(eid)?.state || 'off'}`,
                ]"
              >
                {{ climateStateLabel(getEntity(eid)?.state) }}
              </span>
            </div>

            <div class="dgm-climate-temp-zone">
              <!-- 当前/设定温度双栏显示 -->
              <div class="dgm-climate-temp-stats">
                <div class="dgm-climate-stat">
                  <span
                    class="dgm-climate-stat-val"
                    :class="climateTempTone(getClimateCurrentTemp(eid))"
                  >
                    {{ formatClimateTemp(getClimateCurrentTemp(eid))
                    }}<small v-if="getClimateCurrentTemp(eid) != null">°</small>
                  </span>
                  <span class="dgm-climate-stat-lbl">{{ '当前温度' }}</span>
                </div>
                <div class="dgm-climate-stat-split" />
                <div class="dgm-climate-stat">
                  <span class="dgm-climate-stat-val dgm-climate-stat-val--set">
                    {{ getClimateTargetTemp(eid) != null ? getClimateTargetTemp(eid) + '°' : '--' }}
                  </span>
                  <span class="dgm-climate-stat-lbl">{{ '设定温度' }}</span>
                </div>
              </div>

              <!-- 设定温度加减按钮（仅当存在目标温度时显示） -->
              <div v-if="getClimateTargetTemp(eid) != null" class="dgm-climate-adjust">
                <button
                  type="button"
                  class="dgm-temp-btn dgm-temp-btn--sm"
                  :aria-label="'降低温度'"
                  @click.stop="adjustClimateTemp(eid, -1)"
                >
                  <Minus class="w-4 h-4" />
                </button>
                <span class="dgm-climate-adjust-val">{{ getClimateTargetTemp(eid) }}°C</span>
                <button
                  type="button"
                  class="dgm-temp-btn dgm-temp-btn--sm"
                  :aria-label="'提高温度'"
                  @click.stop="adjustClimateTemp(eid, 1)"
                >
                  <Plus class="w-4 h-4" />
                </button>
              </div>
            </div>

            <!--
              HVAC 模式 / 风速档位控制区
              仅在存在 hvac_modes、fan_modes 或 fan_mode 时渲染
            -->
            <div
              v-if="
                hvacModes(eid).length > 0 ||
                getEntity(eid)?.attributes?.fan_modes?.length ||
                getEntity(eid)?.attributes?.fan_mode
              "
              class="dgm-climate-controls"
            >
              <!-- HVAC 模式按钮组（如制热/制冷/自动） -->
              <div v-if="hvacModes(eid).length > 0" class="dgm-climate-btn-row">
                <button
                  v-for="mode in hvacModes(eid)"
                  :key="'hvac-' + mode"
                  type="button"
                  :class="[
                    'dgm-climate-chip',
                    'dgm-climate-chip--mode',
                    getEntity(eid)?.state === mode ? climateModeInfo(mode).activeClass : '',
                  ]"
                  @click.stop="setHvacMode(eid, mode)"
                >
                  <component
                    :is="climateModeInfo(mode).icon"
                    :class="[
                      'dgm-climate-chip-icon',
                      getEntity(eid)?.state === mode
                        ? climateModeInfo(mode).iconColor
                        : 'dgm-chip-inactive',
                    ]"
                  />
                  <span>{{ climateModeInfo(mode).label }}</span>
                </button>
              </div>
              <!-- 风速档位按钮组（仅当 attributes.fan_modes 存在时可点击切换） -->
              <div v-if="getEntity(eid)?.attributes?.fan_modes?.length" class="dgm-climate-btn-row">
                <button
                  v-for="mode in getEntity(eid).attributes.fan_modes"
                  :key="'fan-' + mode"
                  type="button"
                  :class="[
                    'dgm-climate-chip',
                    'dgm-climate-chip--fan',
                    getEntity(eid)?.attributes?.fan_mode === mode
                      ? 'dgm-climate-chip--fan-active'
                      : '',
                  ]"
                  @click.stop="setFanMode(eid, mode)"
                >
                  {{ getFanModeLabel(mode) }}
                </button>
              </div>
              <!-- 只读风速档位：实体仅提供当前 fan_mode 但无可选列表时展示 -->
              <div v-else-if="getEntity(eid)?.attributes?.fan_mode" class="dgm-climate-btn-row">
                <span
                  class="dgm-climate-chip dgm-climate-chip--fan dgm-climate-chip--fan-active dgm-climate-chip--readonly"
                >
                  {{ getFanModeLabel(getEntity(eid).attributes.fan_mode) }}
                </span>
              </div>
            </div>
          </div>
        </template>

        <!-- 通用实体卡片：light/switch/climate 之外的域使用，仅展示信息不可操作 -->
        <template v-if="domain !== 'light' && domain !== 'switch' && domain !== 'climate'">
          <div class="flex items-center gap-4 p-2">
            <div class="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center">
              <component
                :is="domainInfo.icon"
                class="w-5 h-5 opacity-60"
                :style="{ color: domainInfo.color }"
              />
            </div>
            <div>
              <h3 class="text-sm font-bold dgm-member-name truncate">
                {{ getEntityDisplayName(eid, getEntity(eid)) }}
              </h3>
              <p class="text-xs dgm-member-state font-mono">{{ formatMemberState(eid) }}</p>
            </div>
          </div>
        </template>
      </div>
    </div>
  </template>
</template>
<script setup>
/**
 * @file DeviceGroupMemberList.vue
 * @module components/entities/device-group
 * @description 设备群组成员列表组件
 *
 * 职责：
 * - 按域（light/switch/climate/其它）渲染不同的实体卡片布局
 * - light/switch 紧凑网格卡片，点击直接切换开关
 * - climate 卡片含当前/设定温度、HVAC 模式与风速档位控制
 * - 通用域仅展示名称与状态文案
 * - 顶部嵌入批量操作工具条与执行结果展示
 *
 * 依赖：
 * - vue 的 computed/ref
 * - @lucide/vue 的 Minus/Plus/Power 图标
 * - @/stores/entities.store 提供实体集合与服务调用
 * - @/stores/chrome.store 提供 notify 用于错误提示
 * - @/composables/entity/usePausableStateListener 监听实体状态变化（可暂停）
 * - @/composables/entity/useDeviceGroupMembers 的 getEntityFromStore 工具
 * - @/composables/entity/useDeviceGroupClimate 提供 climate 域专用逻辑
 * - @/utils/entity/derived.util 的 getEntityDisplayName
 * - @/constants/entity-state-labels 的 displayEntityStateLabel
 * - @/utils/core/error-message 的 getApiErrorMessage
 *
 * 使用场景：
 * - DeviceGroupModal 在 domain 非 battery/offline 时渲染此列表
 */
import { computed, ref } from 'vue'
import { Minus, Plus, Power } from '@lucide/vue'
import { useEntitiesStore } from '@/stores/entities.store'
import { useChromeStore } from '@/stores/chrome.store'
import { usePausableStateListener } from '@/composables/entity/usePausableStateListener'
import { getEntityFromStore } from '@/composables/entity/useDeviceGroupMembers'
import { getEntityDisplayName } from '@/utils/entity/derived.util'
import { displayEntityStateLabel } from '@/constants/entity-state-labels'
import { useDeviceGroupClimate } from '@/composables/entity/useDeviceGroupClimate'
import DeviceGroupActions from '@/components/entities/device-group/DeviceGroupActions.vue'
import DeviceGroupBatchBar from '@/components/entities/device-group/DeviceGroupBatchBar.vue'
import DeviceGroupLightCard from '@/components/entities/device-group/DeviceGroupLightCard.vue'
import VirtualList from '@/components/common/base/VirtualList.vue'
import { getApiErrorMessage } from '@/utils/core/error-message'

/**
 * 组件 Props 定义
 * @property {string} domain - 当前域（light/switch/climate/sensor/lock 等）
 * @property {Array<string>} entityIds - 待展示的实体 ID 列表
 * @property {Object} domainInfo - 域信息对象，含 label/icon/color 等字段
 * @property {string|null} deviceGroupId - 所属设备群组 ID（影响批量工具条是否显示）
 * @property {boolean} batchExecuting - 是否正在执行批量调用
 * @property {Object|null} batchExecResult - 批量执行结果对象
 */
const props = defineProps({
  domain: { type: String, required: true },
  entityIds: { type: Array, required: true },
  domainInfo: { type: Object, required: true },
  deviceGroupId: { type: String, default: null },
  batchExecuting: { type: Boolean, default: false },
  batchExecResult: { type: Object, default: null },
})

/**
 * 组件事件定义
 * @emits batch-toggle - 用户点击批量开启/关闭按钮时触发，参数 true 表示开启、false 表示关闭
 * @emits retry - 用户点击重试失败项时触发
 */
const emit = defineEmits(['batch-toggle', 'retry'])

const entitiesStore = useEntitiesStore()
const chrome = useChromeStore()
/**
 * 列表版本号：每次实体状态变化时自增，触发依赖此 ref 的 computed 重新计算
 * 用于在 usePausableStateListener 回调中强制刷新派生数据
 */
const listEpoch = ref(0)

/** 紧凑网格虚拟滚动：实体数超过该值启用（卡片行高固定，虚拟化收益明确） */
const VIRTUAL_GRID_MIN_ITEMS = 80
/** 虚拟滚动行分块列数（固定 4 列，避免响应式列数破坏固定行高） */
const VIRTUAL_GRID_COLUMNS = 4
/** 紧凑卡片单行高度（px）：padding 12×2 + 单行文本/图标 28，配合 dgm-light-grid gap 10px */
const COMPACT_CARD_HEIGHT = 52

/**
 * 监听 props.entityIds 中实体的状态变化（可暂停）
 * 状态变化时自增 listEpoch 以触发 activeEntityCount / displayEntityIds 等重新计算
 */
usePausableStateListener(
  () => {
    listEpoch.value++
  },
  {
    entityIds: () => props.entityIds,
  },
)

/**
 * 是否为紧凑网格布局：light/switch 域使用紧凑卡片
 * @returns {boolean}
 */
const isCompactGrid = computed(() => props.domain === 'light' || props.domain === 'switch')

/**
 * 是否显示批量工具条
 * - 实体数 <=1 时不显示
 * - climate 域始终显示（用于批量关闭）
 * - light/switch 域或存在 deviceGroupId 时显示
 * @returns {boolean}
 */
const showBatchBar = computed(() => {
  if (props.entityIds.length <= 1) return false
  if (props.domain === 'climate') return true
  return props.domain === 'light' || props.domain === 'switch' || !!props.deviceGroupId
})

/**
 * 当前处于活动状态的实体数量
 * climate 域：state !== 'off' 计为活动
 * 其它域：state === 'on' 计为活动
 * @returns {number}
 */
const activeEntityCount = computed(() => {
  void listEpoch.value
  if (props.domain === 'climate') {
    return props.entityIds.filter((eid) => getEntity(eid)?.state !== 'off').length
  }
  return props.entityIds.filter((eid) => getEntity(eid)?.state === 'on').length
})

/**
 * 实际渲染的 entity_id 列表
 * 紧凑网格下：开启项优先排在前面，其次按名称排序（中文 localeCompare）
 * 其它布局下：保持原顺序
 * @returns {Array<string>}
 */
const displayEntityIds = computed(() => {
  void listEpoch.value
  if (!isCompactGrid.value) return props.entityIds
  return [...props.entityIds].sort((a, b) => {
    const ea = getEntity(a)
    const eb = getEntity(b)
    const aOn = ea?.state === 'on' ? 0 : 1
    const bOn = eb?.state === 'on' ? 0 : 1
    if (aOn !== bOn) return aOn - bOn
    const na = getEntityDisplayName(a, ea)
    const nb = getEntityDisplayName(b, eb)
    return na.localeCompare(nb, 'zh')
  })
})

/**
 * 是否启用紧凑网格虚拟滚动：仅 light/switch 域且实体数超过阈值时启用。
 * 大列表按固定 4 列分块后交给 VirtualList 按行窗口化渲染，大幅减少 DOM 节点。
 */
const useVirtualGrid = computed(
  () => isCompactGrid.value && displayEntityIds.value.length > VIRTUAL_GRID_MIN_ITEMS,
)

/**
 * 虚拟滚动行分块：每行固定 VIRTUAL_GRID_COLUMNS 个实体 ID。
 * 排序变化（listEpoch 递增）会触发重新分块，VirtualList 相应重建窗口。
 */
const virtualRows = computed(() => {
  if (!useVirtualGrid.value) return []
  const ids = displayEntityIds.value
  const rows = []
  for (let i = 0; i < ids.length; i += VIRTUAL_GRID_COLUMNS) {
    rows.push(ids.slice(i, i + VIRTUAL_GRID_COLUMNS))
  }
  return rows
})
/**
 * 根据 entity_id 从 store 中查询实体
 * 内部 void listEpoch.value 以确保在状态变化时返回最新值
 * @param {string} eid - 实体 ID
 * @returns {Object|undefined} 实体对象
 */
function getEntity(eid) {
  void listEpoch.value
  return getEntityFromStore(entitiesStore.entities, eid)
}

/**
 * 格式化成员状态文案
 * @param {string} eid - 实体 ID
 * @returns {string} 状态文案；实体缺失或无状态时返回「未知」
 */
function formatMemberState(eid) {
  const entity = getEntity(eid)
  if (!entity?.state) return '未知'
  return displayEntityStateLabel(eid, entity.state)
}

/**
 * climate 域专用逻辑组合式函数
 * 提供温度读取/格式化、HVAC 模式切换、风速档位切换、状态颜色与图标等能力
 */
const {
  getClimateCurrentTemp,
  getClimateTargetTemp,
  formatClimateTemp,
  climateTempTone,
  adjustClimateTemp,
  setHvacMode,
  turnOffClimate,
  setFanMode,
  getFanModeLabel,
  hvacModes,
  climateModeInfo,
  climateStateLabel,
  climateBgColor,
  climateBorderColor,
  climateIconEmoji,
} = useDeviceGroupClimate(getEntity, entitiesStore)

/**
 * 切换 light/switch 实体的开关状态
 * 根据 entity.state 决定调用 turn_on / turn_off 服务
 * 失败时通过 chrome.notify 弹出错误提示
 * @param {string} eid - 实体 ID
 * @returns {Promise<void>}
 */
function toggleLightSwitch(eid) {
  const entity = getEntity(eid)
  if (!entity) return
  const service = entity.state === 'on' ? 'turn_off' : 'turn_on'
  void entitiesStore
    .callService(props.domain, service, eid)
    .catch((e) => chrome.notify(getApiErrorMessage(e, '设备操作失败'), 'error'))
}
</script>

<style scoped src="./styles/device-group.css"></style>
<style scoped>
/* 虚拟滚动容器：限高以建立独立滚动区（外层面板已 overflow-y-auto，内层需自限高） */
.dgm-virtual-wrap {
  max-height: min(60vh, 480px);
}
/* 虚拟行固定 4 列：dgm-light-grid 默认 auto-fill 会随容器宽度变化列数，破坏固定行高 */
.dgm-light-grid--virtual {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}
</style>