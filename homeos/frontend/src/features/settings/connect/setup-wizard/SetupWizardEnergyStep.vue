<!--
  初始化向导第三步「能源绑定」表单页。

  四个槽位各自对应一种**角色**，不能互相替代：
  - 主电表：累计电量（kWh/Wh），必须声明清零口径（终身/年/月/日累计），
    它决定日/月/年哪一档曲线能直接读表；
  - 日/月累计：同一块表的其它口径，作为对应粒度的佐证，不参与聚合（避免重复计费）；
  - 总功率：W/kW 瞬时功率，用来回答「现在用多少电」并驱动功率异常告警。

  注意事项：主电表选到功率传感器必然把趋势算成负数或 0，保存时前端会拦下；
  口径与实体名不符（例如选了「日电量」却声明年累计）只提示不阻断。
-->
<script setup>
import { computed, watch } from 'vue'
import { Gauge, GitBranch, Zap, CalendarDays, CalendarRange, AlertTriangle, Info } from '@lucide/vue'
import EntityInput from '@/components/common/entity-input/EntityInput.vue'
import EntityMultiSelect from '@/components/common/entity-multi-select/EntityMultiSelect.vue'
import { joinCommaEntityIds, parseCommaEntityIds } from '@/shared/entity/utils/comma-entity-ids.util'
import { ENERGY_GRAIN_LABELS, ENERGY_SCOPE_OPTIONS, resolveEnergyScopeOption } from './energy-scope.options'

const meterEntityId = defineModel('meterEntityId', { type: String, default: '' })
const mainPowerEntityId = defineModel('mainPowerEntityId', { type: String, default: '' })
const monthMeterEntityId = defineModel('monthMeterEntityId', { type: String, default: '' })
const dayMeterEntityId = defineModel('dayMeterEntityId', { type: String, default: '' })
const circuitEntityIds = defineModel('circuitEntityIds', { type: String, default: '' })

const props = defineProps({
  status: { type: Object, default: null },
  validateResult: { type: Object, default: null },
  /** 主电表清零口径（total / year / month / day） */
  meterScope: { type: String, default: 'total' },
  /** 用户手动改过口径后，父级不再自动建议 */
  scopeTouched: { type: Boolean, default: false },
})
const emit = defineEmits(['update:meterScope', 'touched-scope', 'suggest-scope'])

const circuitEntityIdsList = computed({
  get: () => parseCommaEntityIds(circuitEntityIds.value),
  set: (ids) => {
    circuitEntityIds.value = joinCommaEntityIds(ids)
  },
})

/** 实体类型（energy / power / other），由后端 attributes 判定 */
function entityInfo(entityId) {
  const eid = String(entityId || '').trim()
  if (!eid) return null
  return props.validateResult?.entities?.[eid] || null
}

const KIND_LABELS = {
  energy: '累计电量',
  power: '瞬时功率',
  other: '未知类型',
}

/** 单个槽位的即时反馈：类型不匹配时给出红色提示，识别成功给出绿色确认 */
function slotFeedback(entityId, expect) {
  const info = entityInfo(entityId)
  if (!info) return null
  const label = KIND_LABELS[info.kind] || info.kind
  const unit = info.unit ? ` · ${info.unit}` : ''
  const ok = expect === info.kind
  return { ok, text: `${ok ? '已识别' : '类型不符'}：${label}${unit}` }
}

const meterFeedback = computed(() => slotFeedback(meterEntityId.value, 'energy'))
const powerFeedback = computed(() => slotFeedback(mainPowerEntityId.value, 'power'))
const monthFeedback = computed(() => slotFeedback(monthMeterEntityId.value, 'energy'))
const dayFeedback = computed(() => slotFeedback(dayMeterEntityId.value, 'energy'))

/** 口径选项与当前口径的说明 */
const scopeOption = computed(() => resolveEnergyScopeOption(props.meterScope))

/**
 * 口径与实体名的冲突提示：实体名像「日电量」却声明为月/年累计时，
 * 算出来的月/年曲线会成倍偏小 —— 只提示，不阻断（名字可能不规范）。
 */
const scopeConflict = computed(() => {
  const eid = meterEntityId.value.trim()
  const suggested = entityInfo(eid)?.suggestedScope
  if (!suggested || suggested === props.meterScope) return null
  return `该实体名更像「${resolveEnergyScopeOption(suggested).label}」，当前声明为「${scopeOption.value.label}」`
})

/**
 * 粒度覆盖：直接读表 / 差分 —— 让「为什么年曲线没有数」当场有答案。
 *
 * 规则只有一份（energy-scope.options.ts 的 directGrains），页面不再按 scope 分支判断：
 * 终身累计表任何粒度都要做差，把它标成「年直接读表」会和后端
 * `_SCOPE_DIRECT_GRAINS[total] = ()` 以及单测互相矛盾。
 */
const grainRows = computed(() => {
  const direct = new Set(scopeOption.value.directGrains)
  if (monthMeterEntityId.value.trim()) direct.add('month')
  if (dayMeterEntityId.value.trim()) direct.add('day')
  return ['day', 'month', 'year'].map((grain) => ({
    grain,
    label: ENERGY_GRAIN_LABELS[grain],
    state: direct.has(grain) ? 'direct' : 'derived',
  }))
})

const GRAIN_STATE_LABELS = {
  direct: '直接读表',
  derived: '差分/求和',
}

function selectScope(value) {
  emit('update:meterScope', value)
  emit('touched-scope')
}

// 主电表一变就请父级按实体名猜口径（用户手动改过则父级会忽略）
watch(
  () => meterEntityId.value,
  (value) => {
    const eid = String(value || '').trim()
    if (eid) emit('suggest-scope', eid)
  },
)
</script>

<template>
  <div class="sw-step">
    <section class="sw-energy-panel">
      <header class="sw-energy-panel__head">
        <div class="sw-section__icon sw-section__icon--amber">
          <Gauge class="w-4 h-4" />
        </div>
        <div>
          <h4 class="sw-energy-panel__title">{{ '能源绑定' }}</h4>
          <p class="sw-energy-panel__sub">
            {{ '主电表必填并声明清零口径；日/月累计与总功率可选，补齐后三档曲线与当前负荷才完整' }}
          </p>
        </div>
      </header>

      <div class="sw-energy-panel__grid">
        <div class="sw-energy-field">
          <label class="sw-energy-field__label">
            <Gauge class="w-3.5 h-3.5" />
            {{ '主电表（累计电量）' }}
          </label>
          <EntityInput
            v-model="meterEntityId"
            :placeholder="'sensor.monthly_energy'"
            domain-filter="sensor"
            suggest-device-class="energy"
          />
          <p
            v-if="meterFeedback"
            :class="['sw-energy-field__hint', meterFeedback.ok ? 'is-ok' : 'is-bad']"
          >
            {{ meterFeedback.text }}
          </p>
          <p v-else class="sw-energy-field__hint">
            {{ '须为累计电量（kWh/Wh），不要选功率（W）传感器' }}
          </p>
        </div>

        <div class="sw-energy-field">
          <label class="sw-energy-field__label">
            <Zap class="w-3.5 h-3.5" />
            {{ '总功率（可选）' }}
          </label>
          <EntityInput
            v-model="mainPowerEntityId"
            :placeholder="'sensor.house_power'"
            domain-filter="sensor"
            suggest-device-class="power"
          />
          <p
            v-if="powerFeedback"
            :class="['sw-energy-field__hint', powerFeedback.ok ? 'is-ok' : 'is-bad']"
          >
            {{ powerFeedback.text }}
          </p>
          <p v-else class="sw-energy-field__hint">
            {{ '瞬时功率（W/kW）：用于当前负荷与功率异常告警，累计电量无法替代' }}
          </p>
        </div>
      </div>

      <div class="sw-energy-scope">
        <div class="sw-energy-scope__head">
          <span class="sw-energy-scope__title">{{ '主电表清零口径' }}</span>
          <span class="sw-energy-scope__reset">{{ scopeOption.hint }}</span>
        </div>
        <div class="sw-energy-scope__options" role="radiogroup" aria-label="主电表清零口径">
          <button
            v-for="option in ENERGY_SCOPE_OPTIONS"
            :key="option.value"
            type="button"
            role="radio"
            :aria-checked="meterScope === option.value"
            :class="['sw-energy-scope__option', { 'is-active': meterScope === option.value }]"
            @click="selectScope(option.value)"
          >
            {{ option.label }}
          </button>
        </div>
        <p v-if="scopeConflict" class="sw-energy-field__hint is-warn">
          <AlertTriangle class="w-3 h-3 shrink-0" />
          <span>{{ scopeConflict }}</span>
        </p>
        <ul class="sw-energy-grains">
          <li v-for="row in grainRows" :key="row.grain" :class="['sw-energy-grains__item', `is-${row.state}`]">
            <span class="sw-energy-grains__grain">{{ row.label }}</span>
            <span class="sw-energy-grains__state">{{ GRAIN_STATE_LABELS[row.state] }}</span>
          </li>
        </ul>
        <p class="sw-energy-field__hint">
          {{ '「差分/求和」由读数差值推算：跨零点离线会丢一段，补绑对应的日/月累计表可避免' }}
        </p>
      </div>

      <div class="sw-energy-panel__grid">
        <div class="sw-energy-field">
          <label class="sw-energy-field__label">
            <CalendarRange class="w-3.5 h-3.5" />
            {{ '月累计电量（可选）' }}
          </label>
          <EntityInput
            v-model="monthMeterEntityId"
            :placeholder="'sensor.month_energy'"
            domain-filter="sensor"
            suggest-device-class="energy"
          />
          <p
            v-if="monthFeedback"
            :class="['sw-energy-field__hint', monthFeedback.ok ? 'is-ok' : 'is-bad']"
          >
            {{ monthFeedback.text }}
          </p>
          <p v-else class="sw-energy-field__hint">
            {{ '每月 1 日清零的月电量：月总量直接读表，仅作佐证不重复计入' }}
          </p>
        </div>

        <div class="sw-energy-field">
          <label class="sw-energy-field__label">
            <CalendarDays class="w-3.5 h-3.5" />
            {{ '日累计电量（可选）' }}
          </label>
          <EntityInput
            v-model="dayMeterEntityId"
            :placeholder="'sensor.daily_energy'"
            domain-filter="sensor"
            suggest-device-class="energy"
          />
          <p
            v-if="dayFeedback"
            :class="['sw-energy-field__hint', dayFeedback.ok ? 'is-ok' : 'is-bad']"
          >
            {{ dayFeedback.text }}
          </p>
          <p v-else class="sw-energy-field__hint">
            {{ '每日 0 点清零的日电量：今日用量直接读表，补齐后跨零点离线也不丢数据' }}
          </p>
        </div>
      </div>

      <div class="sw-energy-field">
        <label class="sw-energy-field__label">
          <GitBranch class="w-3.5 h-3.5" />
          {{ '分路（可选）' }}
        </label>
        <EntityMultiSelect
          v-model="circuitEntityIdsList"
          :allowed-domains="['sensor']"
          placeholder="搜索并选择分路（电量 kWh 或功率 W）"
        />
        <p class="sw-energy-field__hint">
          {{ '电量分路用于用量分解，功率分路用于实时负荷；分路是主表的下游拆分，不会与主表相加' }}
        </p>
      </div>

      <p v-if="status?.energy?.advice" class="sw-energy-note">
        <Info class="w-3.5 h-3.5 shrink-0" />
        <span>{{ status.energy.advice }}</span>
      </p>
    </section>

    <div v-if="validateResult?.missing?.length" class="sw-alert sw-alert--danger">
      <AlertTriangle class="w-4 h-4 shrink-0 mt-0.5" />
      <span>{{ `这些实体还没同步到 HA：${validateResult.missing.join(', ')}` }}</span>
    </div>
  </div>
</template>

<style scoped src="./styles/setup-wizard-energy-step.css"></style>
