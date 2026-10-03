<!--
  组件文件：SceneBatchPickerModal.vue
  所属模块：frontend/src/components/dashboard
  组件职责：场景「批量添加实体」对话框（HosModal 风格）。头部场景联动图标 + 已选统计 + 关闭按钮；
    工具栏：域 HosSelect 筛选 + 仅常用可控 Chip + 关键词搜索栏；中部元信息行：总数/已选 + 全选/清空链接；
    列表区：勾选实体并可按域渲染对应预设栏（light/climate/media_player 双列/其他单列），
    预设栏通过 SceneBatchStepField 渲染亮度/色温/过渡/音量/温度等步进字段与状态下拉。
  主要 props / emits：
    - props.open / entities / selectedSet / selectedCount / totalCount：打开状态与列表/选择数据；
      props.batchDomain / batchFilter / batchCommonOnly / presetDomain：筛选与预设分组；
      props.batchState / batchBrightness / batchColorTemp / batchRgbColor / batchTransition /
      batchEffect / batchPosition / batchTemperature / batchHvacMode / batchVolume / batchSource /
      batchFanPercentage / batchOption / batchValue / batchHumidity / batchCode / batchFanSpeed：
      各类预设值（v-model 双向绑定）。
    - emits：close（关闭）/ confirm（确认应用）/ toggle（勾选单项）/ select-all / clear-all /
      各预设字段的 update:xxx 事件（20 项）。
  依赖关系：Transition hos-modal 过渡动画；HosSelect 下拉；SearchableSelect 搜索（或原生搜索）；
    SceneBatchStepField 步进字段；@lucide/vue Sparkles/Search/X 等图标。
-->
<template>
  <Transition name="hos-modal">
    <div v-if="open" class="hos-modal-root scene-batch-root">
      <div class="hos-modal-backdrop" @click="$emit('close')" />
      <div class="hos-modal-panel scene-batch-panel hos-modal-panel--amber">
        <div class="hos-modal-glow hos-modal-glow--blue" aria-hidden="true" />
        <div class="hos-modal-glow hos-modal-glow--purple" aria-hidden="true" />

        <header class="hos-modal-head">
          <div class="hos-modal-head-left">
            <div class="hos-modal-head-icon scene-batch-icon" aria-hidden="true">
              <Sparkles class="w-5 h-5" />
            </div>
            <div class="min-w-0">
              <div class="hos-modal-eyebrow">{{ '场景联动' }}</div>
              <h2 class="hos-modal-title">{{ '批量添加实体' }}</h2>
              <p class="hos-modal-subtitle">
                <template v-if="selectedCount">
                  <span class="scene-batch-stat scene-batch-stat--active">{{
                    `已选择 ${selectedCount} 个`
                  }}</span>
                  <span class="scene-batch-subtle">{{ ` · 共 ${totalCount} 项可选` }}</span>
                </template>
                <template v-else>
                  {{ '勾选实体并统一设置初始状态' }}
                  <span v-if="totalCount" class="scene-batch-subtle">{{
                    ` · ${totalCount} 项可选`
                  }}</span>
                </template>
              </p>
            </div>
          </div>
          <button
            type="button"
            class="hos-modal-close"
            :aria-label="'关闭'"
            @click="$emit('close')"
          >
            <X class="w-5 h-5" />
          </button>
        </header>

        <div class="hos-modal-body hos-modal-body--flush scene-batch-body">
          <div class="scene-batch-toolbar">
            <div class="scene-batch-toolbar__row">
              <HosSelect
                variant="orchestrator"
                size="sm"
                fit
                :model-value="batchDomain"
                class="scene-batch-toolbar__type"
                @update:model-value="$emit('update:batchDomain', $event)"
              >
                <option value="">{{ '全部类型' }}</option>
                <option v-for="d in batchDomains" :key="d" :value="d">{{ d }}</option>
              </HosSelect>
              <button
                type="button"
                class="scene-batch-chip"
                :class="{ 'scene-batch-chip--on': batchCommonOnly }"
                @click="$emit('update:batchCommonOnly', !batchCommonOnly)"
              >
                <span class="scene-batch-chip__dot" aria-hidden="true" />
                {{ '仅常用可控' }}
              </button>
            </div>
            <div class="hos-modal-search-wrap scene-batch-search">
              <Search class="hos-modal-search-icon w-4 h-4" />
              <input
                :value="batchFilter"
                type="search"
                class="hos-modal-search"
                :placeholder="'搜索名称或 entity_id…'"
                @input="$emit('update:batchFilter', ($event.target as HTMLInputElement).value)"
              />
              <button
                v-if="batchFilter"
                type="button"
                class="scene-batch-search-clear"
                :aria-label="'清除搜索'"
                @click="$emit('update:batchFilter', '')"
              >
                <X class="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div class="hos-modal-actions-row scene-batch-meta">
            <span class="scene-batch-meta__left">
              {{ `共 ${totalCount} 项` }}
              <template v-if="selectedCount">
                <span class="scene-batch-meta__sep">·</span>
                <span class="scene-batch-meta__sel">{{ `已选 ${selectedCount}` }}</span>
              </template>
            </span>
            <div class="scene-batch-actions">
              <button
                type="button"
                class="hos-modal-link"
                :disabled="!totalCount"
                @click="$emit('select-all')"
              >
                {{ '全选' }}
              </button>
              <button
                type="button"
                class="hos-modal-link scene-batch-link-muted"
                :disabled="!selectedCount"
                @click="$emit('clear-all')"
              >
                {{ '清空' }}
              </button>
            </div>
          </div>

          <div
            v-if="entities.length"
            class="hos-modal-list scene-batch-list"
            role="listbox"
            aria-multiselectable="true"
          >
            <button
              v-for="entity in entities"
              :key="entity.entity_id"
              type="button"
              role="option"
              :aria-selected="selectedSet.has(entity.entity_id)"
              :title="entity.entity_id"
              class="hos-modal-list-row scene-batch-row"
              :class="{ 'hos-modal-list-row--selected': selectedSet.has(entity.entity_id) }"
              @click="$emit('toggle', entity)"
            >
              <div class="scene-batch-row__main">
                <span
                  class="scene-batch-dot"
                  :class="{ 'scene-batch-dot--on': entity.isOn }"
                  :title="entity.state"
                  aria-hidden="true"
                />
                <span
                  class="scene-batch-domain"
                  :style="{ '--dom-color': domainColor(entity.domain) }"
                  >{{ entity.domainShort }}</span
                >
                <div class="scene-batch-row__text min-w-0">
                  <span
                    class="scene-batch-name truncate"
                    :class="selectedSet.has(entity.entity_id) ? 'scene-batch-name--selected' : ''"
                    >{{ entity.label }}</span
                  >
                  <span class="scene-batch-eid font-mono truncate">{{ entity.entity_id }}</span>
                </div>
              </div>
              <CheckCircle v-if="selectedSet.has(entity.entity_id)" class="scene-batch-check" />
              <Circle v-else class="scene-batch-circle" />
            </button>
          </div>
          <div v-else class="hos-modal-empty scene-batch-empty">
            <span class="scene-batch-empty__icon" aria-hidden="true">🔍</span>
            <span>{{ '无匹配实体' }}</span>
            <span class="scene-batch-empty__hint">{{
              '试试调整类型筛选，或关闭「仅常用可控」'
            }}</span>
          </div>
        </div>

        <Transition name="scene-batch-preset-slide">
          <div v-if="showPresetBar" class="scene-batch-preset">
            <div class="scene-batch-preset__head">
              <span class="scene-batch-preset__title">{{ '统一预设' }}</span>
              <span v-if="presetDomain" class="scene-batch-preset__tag">{{ presetDomain }}</span>
              <span v-if="selectedCount" class="scene-batch-preset__scope">{{
                `应用于 ${selectedCount} 个实体`
              }}</span>
            </div>
            <div class="scene-batch-preset__grid" :class="presetGridClass">
              <label class="scene-batch-field">
                <span class="hos-modal-label">{{ '状态' }}</span>
                <HosSelect
                  variant="orchestrator"
                  block
                  trigger-class="scene-batch-control"
                  :model-value="batchState"
                  @update:model-value="$emit('update:batchState', $event)"
                >
                  <option value="on">开</option>
                  <option value="off">关</option>
                  <option v-if="presetDomain === 'light'" value="__nochange__">{{ '不变' }}</option>
                  <option v-if="presetDomain === 'lock'" value="locked">已上锁</option>
                  <option v-if="presetDomain === 'lock'" value="unlocked">已解锁</option>
                </HosSelect>
              </label>
              <template v-if="presetDomain === 'light'">
                <SceneBatchStepField
                  :model-value="batchBrightness"
                  :label="'亮度'"
                  :min="1"
                  :max="100"
                  :step="1"
                  :default-value="80"
                  suffix="%"
                  @update:model-value="$emit('update:batchBrightness', $event)"
                />
                <SceneBatchStepField
                  :model-value="batchColorTemp"
                  :label="'色温'"
                  :min="2000"
                  :max="6500"
                  :step="100"
                  :default-value="4000"
                  suffix="K"
                  @update:model-value="$emit('update:batchColorTemp', $event)"
                />
                <label class="scene-batch-field">
                  <span class="hos-modal-label">{{ '颜色' }}</span>
                  <div class="scene-batch-color-row">
                    <input
                      type="color"
                      class="scene-batch-color-pick"
                      :value="batchRgbColor || '#FFD700'"
                      @input="$emit('update:batchRgbColor', ($event.target as HTMLInputElement).value)"
                    />
                    <span class="scene-batch-color-val">{{ batchRgbColor || '未设置' }}</span>
                    <button
                      v-if="batchRgbColor"
                      type="button"
                      class="list-page__link-btn"
                      @click="$emit('update:batchRgbColor', '')"
                    >
                      {{ '清除' }}
                    </button>
                  </div>
                </label>
                <SceneBatchStepField
                  :model-value="batchTransition"
                  :label="'过渡'"
                  :min="0"
                  :max="10"
                  :step="0.5"
                  :default-value="1"
                  suffix="s"
                  @update:model-value="$emit('update:batchTransition', $event)"
                />
                <label class="scene-batch-field">
                  <span class="hos-modal-label">{{ '特效' }}</span>
                  <HosSelect
                    variant="orchestrator"
                    block
                    trigger-class="scene-batch-control"
                    :model-value="batchEffect"
                    @update:model-value="$emit('update:batchEffect', $event)"
                  >
                    <option value="">{{ '无' }}</option>
                    <option value="colorloop">{{ '颜色循环' }}</option>
                    <option value="random">{{ '随机' }}</option>
                    <option value="white">{{ '白光' }}</option>
                  </HosSelect>
                </label>
              </template>
              <template v-if="presetDomain === 'cover'">
                <SceneBatchStepField
                  :model-value="batchPosition"
                  :label="'位置'"
                  :min="0"
                  :max="100"
                  :step="1"
                  :default-value="100"
                  suffix="%"
                  @update:model-value="$emit('update:batchPosition', $event)"
                />
              </template>
              <template v-if="presetDomain === 'climate'">
                <SceneBatchStepField
                  :model-value="batchTemperature"
                  :label="'温度'"
                  :min="16"
                  :max="30"
                  :step="0.5"
                  :default-value="24"
                  suffix="°C"
                  @update:model-value="$emit('update:batchTemperature', $event)"
                />
                <label class="scene-batch-field">
                  <span class="hos-modal-label">{{ '模式' }}</span>
                  <HosSelect
                    variant="orchestrator"
                    block
                    trigger-class="scene-batch-control"
                    :model-value="batchHvacMode"
                    @update:model-value="$emit('update:batchHvacMode', $event)"
                  >
                    <option value="">{{ '不变' }}</option>
                    <option value="heat">{{ '制热' }}</option>
                    <option value="cool">{{ '制冷' }}</option>
                    <option value="auto">{{ '自动' }}</option>
                    <option value="dry">{{ '除湿' }}</option>
                    <option value="fan_only">{{ '送风' }}</option>
                    <option value="off">{{ '关闭' }}</option>
                  </HosSelect>
                </label>
              </template>
              <template v-if="presetDomain === 'media_player'">
                <SceneBatchStepField
                  :model-value="batchVolume"
                  :label="'音量'"
                  :min="0"
                  :max="1"
                  :step="0.05"
                  :default-value="0.5"
                  @update:model-value="$emit('update:batchVolume', $event)"
                />
                <label class="scene-batch-field">
                  <span class="hos-modal-label">{{ '输入源' }}</span>
                  <input
                    :value="batchSource"
                    type="text"
                    class="scene-batch-control"
                    @input="$emit('update:batchSource', ($event.target as HTMLInputElement).value)"
                  />
                </label>
              </template>
              <template v-if="presetDomain === 'fan'">
                <SceneBatchStepField
                  :model-value="batchFanPercentage"
                  :label="'风速'"
                  :min="0"
                  :max="100"
                  :step="5"
                  :default-value="50"
                  suffix="%"
                  @update:model-value="$emit('update:batchFanPercentage', $event)"
                />
              </template>
              <template v-if="presetDomain === 'input_select'">
                <label class="scene-batch-field">
                  <span class="hos-modal-label">{{ '选项' }}</span>
                  <input
                    :value="batchOption"
                    type="text"
                    class="scene-batch-control"
                    @input="$emit('update:batchOption', ($event.target as HTMLInputElement).value)"
                  />
                </label>
              </template>
              <template v-if="presetDomain === 'input_number'">
                <label class="scene-batch-field">
                  <span class="hos-modal-label">{{ '数值' }}</span>
                  <input
                    :value="batchValue ?? ''"
                    type="number"
                    class="scene-batch-control"
                    @input="emitNumber('update:batchValue', $event)"
                  />
                </label>
              </template>
              <template v-if="presetDomain === 'humidifier'">
                <SceneBatchStepField
                  :model-value="batchHumidity"
                  :label="'湿度'"
                  :min="0"
                  :max="100"
                  :step="5"
                  :default-value="50"
                  suffix="%"
                  @update:model-value="$emit('update:batchHumidity', $event)"
                />
              </template>
              <template v-if="presetDomain === 'lock' || presetDomain === 'alarm_control_panel'">
                <label class="scene-batch-field">
                  <span class="hos-modal-label">{{
                    presetDomain === 'lock' ? '操作码' : '密码'
                  }}</span>
                  <input
                    :value="batchCode"
                    type="text"
                    class="scene-batch-control"
                    @input="$emit('update:batchCode', ($event.target as HTMLInputElement).value)"
                  />
                </label>
              </template>
              <template v-if="presetDomain === 'vacuum'">
                <label class="scene-batch-field">
                  <span class="hos-modal-label">{{ '吸力' }}</span>
                  <HosSelect
                    variant="orchestrator"
                    block
                    trigger-class="scene-batch-control"
                    :model-value="batchFanSpeed"
                    @update:model-value="$emit('update:batchFanSpeed', $event)"
                  >
                    <option value="">{{ '默认' }}</option>
                    <option value="low">{{ '低' }}</option>
                    <option value="medium">{{ '中' }}</option>
                    <option value="high">{{ '高' }}</option>
                    <option value="turbo">{{ '强力' }}</option>
                  </HosSelect>
                </label>
              </template>
            </div>
            <p v-if="!showAdvancedPresets" class="scene-batch-preset__tip">
              {{ '筛选单一类型后，可配置亮度、色温等专属参数' }}
            </p>
          </div>
        </Transition>

        <footer class="hos-modal-footer scene-batch-footer">
          <button type="button" class="hos-modal-btn hos-modal-btn--ghost" @click="$emit('close')">
            {{ '取消' }}
          </button>
          <button
            type="button"
            class="hos-modal-btn scene-batch-btn-primary"
            :disabled="!selectedCount"
            @click="$emit('confirm')"
          >
            {{ selectedCount ? `确认添加 ${selectedCount} 个实体` : '请先勾选实体' }}
          </button>
        </footer>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
/**
 * SceneBatchPickerModal.vue
 *
 * 所属模块：dashboard（场景批量添加实体弹窗）
 * 职责：场景编辑器中批量添加实体的模态弹窗。提供类型筛选、关键词搜索、
 *      全选/清空、勾选列表、统一预设（按 presetDomain 渲染对应字段：
 *      灯光亮度/色温/颜色/过渡/特效、窗帘位置、空调温度/模式、媒体音量/输入源、
 *      风扇风速、加湿器湿度、input_select 选项、input_number 数值、锁具/报警锁码、
 *      扫地机吸力等）。所有状态由父级 v-model 控制，本组件仅 emit 变更事件。
 * 依赖：vue、@lucide/vue（X/Search/CheckCircle/Circle/Sparkles）、HosSelect、
 *      SceneBatchStepField、entity-domain-meta（domain 颜色）。
 */
import { computed } from 'vue'
import './styles/SceneBatchPickerModal.css'
import HosSelect from '@/components/common/base/HosSelect.vue'
import SceneBatchStepField from '@/components/dashboard/SceneBatchStepField.vue'
import { entityDomainColor } from '@/constants/entity-domain-meta'
import { X, Search, CheckCircle, Circle, Sparkles } from '@lucide/vue'

/** 单个候选项实体的展示模型 */
interface SceneBatchEntityRow {
  entity_id: string
  label: string
  domain: string
  domainShort: string
  state: string
  isOn: boolean
}

/**
 * 组件 Props
 * - open / entities / selectedSet / selectedCount / totalCount：弹窗开关与列表数据
 * - batchDomains / batchDomain / batchFilter / batchCommonOnly：工具栏筛选状态
 * - showPresetBar / showAdvancedPresets / presetDomain：预设栏显隐与当前单一类型
 * - batchState / batchBrightness / ... ：各类 batch 预设值（按 presetDomain 选用）
 */
const props = defineProps<{
  open: boolean
  entities: SceneBatchEntityRow[]
  selectedSet: Set<string>
  selectedCount: number
  totalCount: number
  batchDomains: string[]
  batchDomain: string
  batchFilter: string
  batchCommonOnly: boolean
  showPresetBar: boolean
  showAdvancedPresets: boolean
  presetDomain: string
  batchState: string
  batchBrightness: number | null
  batchColorTemp: number | null
  batchRgbColor: string
  batchTransition: number | null
  batchEffect: string
  batchPosition: number | null
  batchTemperature: number | null
  batchHvacMode: string
  batchVolume: number | null
  batchSource: string
  batchFanPercentage: number | null
  batchOption: string
  batchValue: number | null
  batchHumidity: number | null
  batchCode: string
  batchFanSpeed: string
}>()

/**
 * 组件事件
 * - close / confirm / toggle / select-all / clear-all：弹窗控制与列表操作
 * - update:batchDomain / batchFilter / batchCommonOnly / batchState / ...：批量字段更新
 */
const emit = defineEmits([
  'close',
  'confirm',
  'toggle',
  'select-all',
  'clear-all',
  'update:batchDomain',
  'update:batchFilter',
  'update:batchCommonOnly',
  'update:batchState',
  'update:batchBrightness',
  'update:batchColorTemp',
  'update:batchRgbColor',
  'update:batchTransition',
  'update:batchEffect',
  'update:batchPosition',
  'update:batchTemperature',
  'update:batchHvacMode',
  'update:batchVolume',
  'update:batchSource',
  'update:batchFanPercentage',
  'update:batchOption',
  'update:batchValue',
  'update:batchHumidity',
  'update:batchCode',
  'update:batchFanSpeed',
])

/** 预设栏网格布局 class：light 单列纵排；climate/media_player 双列；其他默认 */
const presetGridClass = computed(() => {
  if (props.presetDomain === 'light') return 'scene-batch-preset__grid--light'
  if (props.presetDomain === 'climate' || props.presetDomain === 'media_player')
    return 'scene-batch-preset__grid--2'
  return ''
})

/**
 * 取 domain 对应的颜色（用于左侧色块）
 * @param {string} domain - HA 域名
 * @returns {string} 颜色值
 */
function domainColor(domain: string) {
  return entityDomainColor(domain)
}

/**
 * 数值类输入事件：将 raw 解析为 number 后通过指定事件名 emit
 * 空字符串 → null；非有限数字 → null
 * @param {string} event - 事件名（如 'update:batchValue'）
 * @param {Event} ev     - input 事件
 */
function emitNumber(event: string, ev: Event) {
  const raw = (ev.target as HTMLInputElement).value
  const val = raw === '' ? null : Number(raw)
  emit(event as 'update:batchValue', Number.isFinite(val as number) ? val : null)
}
</script>
