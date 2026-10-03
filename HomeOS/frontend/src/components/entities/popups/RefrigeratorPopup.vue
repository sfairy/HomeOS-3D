/**
 * @file RefrigeratorPopup.vue
 * @module components/entities/popups
 * @brief 冰箱控制弹窗
 *
 * 职责：
 * - 基于 EntityPopupShell 渲染冰箱控制面板
 * - 多温区展示（冷藏/冷冻/变温室当前温度与目标温度）
 * - 各温区独立温度微调、门开闭状态、模式切换（智能/速冷/速冻/假日）
 * - 辅助功能（除味/杀菌）开关与开关机
 *
 * 依赖：
 * - vue（computed）、@lucide/vue（Minus/Plus/Power/Snowflake）
 * - ./EntityPopupShell、./PopupHead
 * - @homeos/shared（getEntityDomain）、@/composables/entity/useEntityPopupBase
 */
<template>
  <!-- RefrigeratorPopup 冰箱控制弹窗：控制冰箱温度和模式 -->
  <EntityPopupShell
    :entity="liveEntity"
    :x-pct="xPct"
    :y-pct="yPct"
    :anchor-x="anchorX"
    :anchor-y="anchorY"
    :width="320"
    :height="450"
    accent="#38bdf8"
    accent-rgb="56, 189, 248"
    @close="$emit('close')"
  >
    <PopupHead :title="entityName" :icon="Snowflake">
      <template #status>
        <span :class="isOn ? 'rp-state-on' : 'rp-state-off'">{{ isOn ? '运行中' : '已关闭' }}</span>
        <span
          v-if="isOn"
          class="popup-status-dot popup-status-dot--pulse rp-state-dot rp-state-dot--on"
        />
      </template>
    </PopupHead>

    <div class="flex justify-around mb-5" v-if="compartmentTemps.length > 0">
      <div v-for="c in compartmentTemps" :key="c.key" class="flex flex-col items-center gap-1">
        <span class="text-xs font-black rp-lbl leading-normal">{{ c.label }}</span>
        <span class="text-[32px] font-bold text-white tabular-nums tracking-tighter"
          >{{ c.current }}<span class="text-base rp-lbl">°</span></span
        >
        <div class="flex items-center gap-1">
          <button
            type="button"
            class="comp-temp-btn"
            :aria-label="`降低${c.label}温度`"
            @click.stop="adjustCompTemp(c, -1)"
          >
            <Minus class="w-3 h-3" />
          </button>
          <span class="text-xs font-bold rp-target-val tabular-nums w-7 text-center">{{
            c.target
          }}</span>
          <button
            type="button"
            class="comp-temp-btn"
            :aria-label="`提高${c.label}温度`"
            @click.stop="adjustCompTemp(c, 1)"
          >
            <Plus class="w-3 h-3" />
          </button>
        </div>
      </div>
    </div>

    <div v-if="doorSensors.length > 0" class="flex justify-center gap-3 mb-5">
      <div
        v-for="d in doorSensors"
        :key="d.entity_id"
        class="flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-semibold"
        :class="d.isOpen ? 'rp-door rp-door--open' : 'rp-door rp-door--closed'"
      >
        <div
          class="w-1.5 h-1.5 rounded-full"
          :class="d.isOpen ? 'rp-door-dot rp-door-dot--open' : 'rp-door-dot rp-door-dot--closed'"
        />
        {{ d.label }}
      </div>
    </div>

    <div v-if="modeSelects.length > 0" class="mb-4">
      <div v-for="sel in modeSelects" :key="sel.entity_id" class="px-1 mb-2">
        <span class="text-xs font-bold text-white/40 tracking-widest uppercase block mb-2">{{
          sel.name
        }}</span>
        <div class="flex flex-wrap gap-1.5">
          <button
            v-for="opt in sel.options"
            :key="opt"
            :class="['wh-pill', sel.current === opt ? 'wh-pill--active' : '']"
            @click.stop="setSelectOption(sel, opt)"
          >
            {{ opt }}
          </button>
        </div>
      </div>
    </div>

    <div v-if="childSwitches.length > 0" class="border-t border-white/[0.05] pt-4 mb-2">
      <span class="text-xs font-bold text-white/40 tracking-widest uppercase block mb-2 px-1">{{
        '辅助功能'
      }}</span>
      <div class="flex flex-wrap gap-2 px-1">
        <button
          v-for="sw in childSwitches"
          :key="sw.entity_id"
          :class="['wh-toggle-row', sw.isOn ? 'wh-toggle-row--on' : '']"
          @click.stop="toggleSwitch(sw)"
        >
          <span class="text-xs font-medium">{{ sw.name }}</span>
          <div :class="['wh-toggle-track', sw.isOn ? 'wh-toggle-track--on' : '']">
            <div :class="['wh-toggle-knob', sw.isOn ? 'wh-toggle-knob--on' : '']" />
          </div>
        </button>
      </div>
    </div>

    <div class="flex items-center justify-between px-1">
      <div class="flex items-center gap-2">
        <Snowflake class="w-3 h-3 rp-ic-on" />
        <span class="text-xs font-semibold rp-lbl-sec">{{ `能耗等级 ${energyLabel}` }}</span>
      </div>
      <button
        :class="['popup-off-btn shrink-0', !isOn ? 'rp-off-btn--active' : 'rp-off-btn--idle']"
        @click.stop="togglePower"
      >
        <Power class="w-3.5 h-3.5" />
        <span>{{ isOn ? '关闭' : '开机' }}</span>
      </button>
    </div>
  </EntityPopupShell>
</template>

<script setup>
/**
 * 所属模块：frontend/components
 * 职责：实现 RefrigeratorPopup 组件的界面渲染、用户交互与 props/emit 通信。
 * 关键依赖：Vue 3 `<script setup>`、Pinia stores（按需）、类型定义、Lucide 图标与 i18n 标签。
 * 约定：- 所有对外属性统一走 defineProps 泛型，emit 使用 defineEmits<...>()；
  - 不直接操作 DOM，响应式数据变化通过 v-model 或乐观锁写回 store。
 */
/**
 * RefrigeratorPopup - 冰箱控制弹窗组件
 * 功能特性：
 * - 控制冷藏/冷冻温度
 * - 显示当前温度
 * - 模式切换
 * - 弹出式面板
 */
import { getEntityDomain } from '@homeos/shared'
/**
 * 冰箱控制弹窗组件
 *
 * 提供冰箱的监控和控制功能：
 * 1. **多温区显示** — 冷藏/冷冻/变温室当前温度与目标温度
 * 2. **温度调节** — 各温区独立温度微调
 * 3. **门状态** — 各门开闭状态实时显示
 * 4. **模式选择** — 智能/速冷/速冻/假日等模式切换
 * 5. **辅助功能** — 除味/杀菌等开关控制
 * 6. **开关机** — 一键开关
 */
import { computed } from 'vue'
import { Minus, Plus, Power, Snowflake } from '@lucide/vue'
import EntityPopupShell from '@/components/entities/popups/EntityPopupShell.vue'
import PopupHead from '@/components/entities/popups/PopupHead.vue'
import { defineEntityPopupProps, useEntityPopupBase } from '@/composables/entity/useEntityPopupBase'
import { useApplianceSiblings } from '@/composables/entity/useApplianceSiblings'
import { useEntitiesStore } from '@/stores/entities.store'
import { notifyError } from '@/services/notify'
import { getEntityDisplayName } from '@/utils/entity/derived.util'

const props = defineProps(defineEntityPopupProps())

defineEmits(['close'])

const { liveEntity } = useEntityPopupBase(props)
const entitiesStore = useEntitiesStore()
const { siblingEntities } = useApplianceSiblings(
  computed(() => liveEntity.value),
)

const entityName = computed(() =>
  getEntityDisplayName(liveEntity.value?.entity_id ?? '', liveEntity.value),
)

const isOn = computed(() => {
  const s = liveEntity.value?.state
  return s !== 'off' && s !== 'unavailable' && s != null
})

const energyLabel = computed(() => {
  return (
    liveEntity.value?.attributes?.energy_efficiency ||
    liveEntity.value?.attributes?.energy_label ||
    '--'
  )
})

const compartmentTemps = computed(() => {
  const result = []
  const comps = [
    { key: 'fridge', label: '冷藏', labels: ['冷藏', 'fridge', 'cool'] },
    { key: 'freezer', label: '冷冻', labels: ['冷冻', 'freezer', 'freeze'] },
    { key: 'variable', label: '变温', labels: ['变温', 'variable'] },
  ]
  for (const comp of comps) {
    let cur = null
    let tgt = null
    for (const sib of siblingEntities.value) {
      if (sib.domain !== 'sensor') continue
      const name = getEntityDisplayName(sib.entity_id, sib).toLowerCase()
      if (!comp.labels.some((l) => name.includes(l))) continue
      const val = parseFloat(sib.state)
      if (isNaN(val)) continue
      if (name.includes('目标') || name.includes('target') || name.includes('set')) {
        tgt = val
      } else {
        cur = val
      }
    }
    if (cur != null || tgt != null) {
      result.push({ ...comp, current: cur ?? '--', target: tgt ?? cur ?? 5 })
    }
  }
  return result
})

const modeSelects = computed(() => {
  const result = []
  for (const sib of siblingEntities.value) {
    if (sib.domain !== 'select') continue
    const name = getEntityDisplayName(sib.entity_id, sib).toLowerCase()
    if (!name.includes('模式') && !name.includes('mode')) continue
    const opts = sib.attributes?.options
    result.push({
      entity_id: sib.entity_id,
      name: getEntityDisplayName(sib.entity_id, sib),
      current: sib.state,
      options: Array.isArray(opts) ? opts.filter((o) => typeof o === 'string') : [],
    })
  }
  return result
})

const childSwitches = computed(() => {
  const result = []
  for (const sib of siblingEntities.value) {
    if (sib.domain !== 'switch') continue
    result.push({
      entity_id: sib.entity_id,
      name: getEntityDisplayName(sib.entity_id, sib),
      isOn: sib.state === 'on',
    })
  }
  return result
})

const doorSensors = computed(() => {
  const result = []
  for (const sib of siblingEntities.value) {
    if (sib.domain !== 'binary_sensor') continue
    const name = getEntityDisplayName(sib.entity_id, sib).toLowerCase()
    if (!name.includes('门') && !name.includes('door')) continue
    result.push({
      entity_id: sib.entity_id,
      label: getEntityDisplayName(sib.entity_id, sib),
      isOpen: sib.state === 'on',
    })
  }
  return result
})

async function adjustCompTemp(comp, delta) {
  const val = comp.target + delta
  for (const sib of siblingEntities.value) {
    if (sib.domain !== 'number') continue
    const name = getEntityDisplayName(sib.entity_id, sib).toLowerCase()
    if (!comp.labels.some((l) => name.includes(l))) continue
    if (!name.includes('目标') && !name.includes('target') && !name.includes('set')) continue
    try {
      await entitiesStore.callService('number', 'set_value', sib.entity_id, { value: val })
    } catch (e) {
      notifyError(e, '调节温度')
    }
    return
  }
}

async function setSelectOption(sel, option) {
  try {
    await entitiesStore.callService('select', 'select_option', sel.entity_id, { option })
  } catch (e) {
    notifyError(e, '切换模式')
  }
}

async function toggleSwitch(sw) {
  const svc = sw.isOn ? 'turn_off' : 'turn_on'
  try {
    await entitiesStore.callService('switch', svc, sw.entity_id)
  } catch (e) {
    notifyError(e, '切换')
  }
}

async function togglePower() {
  const domain = getEntityDomain(liveEntity.value.entity_id) || 'switch'
  const svc = isOn.value ? 'turn_off' : 'turn_on'
  try {
    await entitiesStore.callService(domain, svc, liveEntity.value.entity_id)
  } catch (e) {
    notifyError(e, '冰箱开关')
  }
}
</script>

<style scoped src="./styles/RefrigeratorPopup.css"></style>
