/**
 * @file WaterPurifierPopup.vue
 * @module components/entities/popups
 * @brief 净水机控制弹窗
 *
 * 职责：
 * - 基于 EntityPopupShell 渲染净水机监控与控制面板
 * - TDS 水质展示（进水/出水）、多级滤芯剩余寿命进度条、开关控制
 * - 通过 useApplianceSiblings 关联同设备兄弟实体
 *
 * 依赖：
 * - vue（computed）、@lucide/vue（Power/Filter）
 * - ./EntityPopupShell、./PopupHead
 * - @/composables/entity/useEntityPopupBase、useApplianceSiblings、entities.store
 * - @/services/notify（notifyError）、@/utils/entity/derived.util、@homeos/shared
 */
<template>
  <!-- WaterPurifierPopup 净水器弹窗：控制和查看净水器状态 -->
  <EntityPopupShell
    :entity="liveEntity"
    :x-pct="xPct"
    :y-pct="yPct"
    :anchor-x="anchorX"
    :anchor-y="anchorY"
    :width="320"
    :height="380"
    accent="#22d3ee"
    accent-rgb="34, 211, 238"
    @close="$emit('close')"
  >
    <PopupHead :title="entityName" :icon="Filter">
      <template #status>
        <span :class="isOn ? 'wpp-state-on' : 'wpp-state-off'">{{
          isOn ? '运行中' : '已关闭'
        }}</span>
        <span
          v-if="isOn"
          class="popup-status-dot popup-status-dot--pulse wpp-state-dot wpp-state-dot--on"
        />
      </template>
    </PopupHead>

    <div v-if="tdsSensors.length > 0 || filterSensors.length > 0" class="mb-5">
      <div v-if="tdsSensors.length > 0" class="flex justify-around mb-4">
        <div v-for="t in tdsSensors" :key="t.entity_id" class="flex flex-col items-center">
          <span class="text-[28px] font-bold text-white tabular-nums">{{ t.value }}</span>
          <span class="text-xs font-semibold wpp-lbl mt-0.5">{{ t.label }}</span>
          <span class="text-xs wpp-lbl-faint">TDS</span>
        </div>
      </div>

      <div v-if="filterSensors.length > 0" class="border-t border-white/[0.05] pt-4">
        <span
          class="text-xs font-bold text-white/40 tracking-widest uppercase block mb-3 px-1"
          >{{ '滤芯寿命' }}</span
        >
        <div class="flex flex-col gap-2 px-1">
          <div v-for="f in filterSensors" :key="f.entity_id" class="flex items-center gap-3">
            <span class="text-xs font-semibold wpp-lbl-sec w-12 shrink-0">{{ f.label }}</span>
            <div class="flex-1 h-2.5 rounded-full bg-white/[0.06] overflow-hidden">
              <div
                class="h-full rounded-full transition-all duration-500"
                :class="f.pct > 20 ? 'wpp-bar-good' : 'wpp-bar-bad'"
                :style="{ width: f.pct + '%' }"
              />
            </div>
            <span
              class="text-xs font-bold tabular-nums shrink-0 w-9 text-right"
              :class="f.pct > 20 ? 'wpp-c-info' : 'wpp-c-danger'"
              >{{ f.pct }}%</span
            >
          </div>
        </div>
      </div>
    </div>

    <div class="flex items-center justify-between px-1">
      <div class="flex items-center gap-2">
        <div
          class="w-2 h-2 rounded-full"
          :class="isOn ? 'wpp-status-dot--on' : 'wpp-status-dot--off'"
        />
        <span class="text-xs font-semibold wpp-lbl-sec">{{ isOn ? '已连接' : '待机中' }}</span>
      </div>
      <button
        :class="['popup-off-btn shrink-0', !isOn ? 'wpp-off-btn--active' : 'wpp-off-btn--idle']"
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
 * 职责：实现 WaterPurifierPopup 组件的界面渲染、用户交互与 props/emit 通信。
 * 关键依赖：Vue 3 `<script setup>`、Pinia stores（按需）、类型定义、Lucide 图标与 i18n 标签。
 * 约定：- 所有对外属性统一走 defineProps 泛型，emit 使用 defineEmits<...>()；
  - 不直接操作 DOM，响应式数据变化通过 v-model 或乐观锁写回 store。
 */
/**
 * WaterPurifierPopup - 净水器弹窗组件
 * 功能特性：
 * - 控制净水器开关
 * - 显示滤芯状态
 * - 显示水质信息
 * - 弹出式面板
 */
import { getEntityDomain } from '@homeos/shared'
/**
 * 净水机控制弹窗组件
 *
 * 提供净水机的监控和控制功能：
 * 1. **TDS 水质** — 进水/出水 TDS 数值显示
 * 2. **滤芯寿命** — 多级滤芯剩余寿命进度条
 * 3. **开关控制** — 一键开关机
 */
import { computed } from 'vue'
import { Power, Filter } from '@lucide/vue'
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

const tdsSensors = computed(() => {
  const result = []
  for (const sib of siblingEntities.value) {
    if (sib.domain !== 'sensor') continue
    const name = getEntityDisplayName(sib.entity_id, sib).toLowerCase()
    if (!name.includes('tds') && !name.includes('水质')) continue
    const val = parseFloat(sib.state)
    if (isNaN(val)) continue
    let label = '水质'
    if (name.includes('进') || name.includes('inlet') || name.includes('原水')) label = '进水'
    if (name.includes('出') || name.includes('outlet') || name.includes('纯水')) label = '出水'
    result.push({ entity_id: sib.entity_id, label, value: Math.round(val) })
  }
  return result
})

const filterSensors = computed(() => {
  const result = []
  for (const sib of siblingEntities.value) {
    if (sib.domain !== 'sensor') continue
    const name = getEntityDisplayName(sib.entity_id, sib)
    if (!name.includes('滤芯') && !name.includes('filter') && !name.includes('寿命')) continue
    const val = parseFloat(sib.state)
    if (isNaN(val)) continue
    result.push({
      entity_id: sib.entity_id,
      label: name,
      pct: Math.min(100, Math.max(0, Math.round(val))),
    })
  }
  return result
})

async function togglePower() {
  const domain = getEntityDomain(liveEntity.value.entity_id) || 'switch'
  const svc = isOn.value ? 'turn_off' : 'turn_on'
  try {
    await entitiesStore.callService(domain, svc, liveEntity.value.entity_id)
  } catch (e) {
    notifyError(e, '净水机开关')
  }
}
</script>

<style scoped src="./styles/WaterPurifierPopup.css"></style>
