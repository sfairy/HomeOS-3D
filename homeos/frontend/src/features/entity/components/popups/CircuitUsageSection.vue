<script setup lang="ts">
/**
 * 分回路用电排行。
 *
 * ``energy.circuitEntityIds`` 之前只被首装向导与引用清理读取 —— 用户在向导里认真勾了
 * 「空调回路 / 厨房回路」，却在任何页面都看不到它们的用电量。这里把配置变成可见的排行。
 *
 * 数据来自 ``/events/reports/energy/circuits``（读日聚合表）；未配置回路时后端返回空
 * 排行，整块不渲染 —— 不制造一个「永远为空」的面板。
 */
import { computed, onMounted, ref, type PropType } from 'vue'
import { GitBranch } from '@lucide/vue'
import { getEnergyCircuits, getEnergyHistory } from '@/domain/api/energy'
import type { EnergyCircuitItem, EnergyHistoryRange } from '@/domain/api/energy'

const props = defineProps({
  /** 窗口：W=近 7 天 / M=近 30 天 */
  range: { type: String as PropType<EnergyHistoryRange>, default: 'M' },
})

const loading = ref(true)
const items = ref<EnergyCircuitItem[]>([])
const total = ref(0)
const unit = ref('kWh')
/** 服务端按 pricing 算出的费用；无电价配置或非电时为 null（不显示） */
const serverCost = ref<number | null>(null)
const costEstimated = ref(false)

const visible = computed(() => items.value.length > 0 || serverCost.value !== null)
const max = computed(() => items.value.reduce((acc, item) => Math.max(acc, item.value), 0) || 1)
/** 排行最多显示 5 条：弹窗只有 270px 宽，再多会挤掉上下文的图表。 */
const topItems = computed(() => items.value.slice(0, 5))
/** 实体 id → 可读名：``sensor.aircon_circuit`` 读起来像代码，取 object_id 去下划线。 */
function readableName(entityId: string): string {
  const objectId = entityId.includes('.') ? entityId.split('.').slice(1).join('.') : entityId
  return objectId.replace(/_/g, ' ')
}

function shareWidth(item: EnergyCircuitItem) {
  return `${Math.max(2, Math.round((item.value / max.value) * 100))}%`
}

async function refresh() {
  loading.value = true
  try {
    const [circuitResponse, historyResponse] = await Promise.all([
      getEnergyCircuits(props.range),
      getEnergyHistory('M'),
    ])
    const data = circuitResponse.data ?? {}
    items.value = Array.isArray(data.items) ? data.items : []
    total.value = Number(data.total) || 0
    unit.value = data.unit || 'kWh'
    const history = historyResponse.data ?? {}
    // 只在服务端真的算出费用时采用：否则保留 HA 属性里的真实单价展示。
    serverCost.value = typeof history.cost === 'number' ? history.cost : null
    costEstimated.value = history.costEstimated === true
  } catch {
    // 服务不可用时整块隐藏：分回路排行是补充信息，不该让弹窗报错。
    items.value = []
    serverCost.value = null
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  void refresh()
})
</script>

<template>
  <section v-if="visible" class="circuit-usage" aria-label="分回路用电">
    <header class="circuit-usage__head">
      <GitBranch class="circuit-usage__icon" aria-hidden="true" />
      <span class="circuit-usage__title">分回路用电</span>
      <span v-if="serverCost !== null" class="circuit-usage__cost">
        ￥{{ serverCost }}<em v-if="costEstimated" class="circuit-usage__est">估算</em>
      </span>
      <span v-else-if="items.length" class="circuit-usage__total">{{ total }} {{ unit }}</span>
    </header>

    <ul v-if="items.length" class="circuit-usage__list">
      <li v-for="item in topItems" :key="item.entityId" class="circuit-usage__item">
        <span class="circuit-usage__name" :title="item.entityId">{{ readableName(item.entityId) }}</span>
        <span class="circuit-usage__bar" aria-hidden="true">
          <span class="circuit-usage__bar-fill" :style="{ width: shareWidth(item) }" />
        </span>
        <span class="circuit-usage__value">{{ item.value }}</span>
      </li>
    </ul>
    <p v-if="items.length > topItems.length" class="circuit-usage__more">
      另有 {{ items.length - topItems.length }} 个回路
    </p>
  </section>
</template>

<style scoped>
.circuit-usage {
  display: flex;
  flex-direction: column;
  gap: var(--hos-space-xs);
  margin-top: var(--hos-space-sm);
  padding-top: var(--hos-space-sm);
  border-top: var(--hos-hairline) solid var(--hos-border-hairline);
}

.circuit-usage__head {
  display: flex;
  align-items: center;
  gap: var(--hos-space-xs);
  min-width: 0;
}

.circuit-usage__icon {
  width: 12px;
  height: 12px;
  flex: 0 0 auto;
  color: var(--hos-text-tertiary);
}

.circuit-usage__title {
  font-size: 11px;
  letter-spacing: 0.04em;
  color: var(--hos-text-label);
}

.circuit-usage__cost,
.circuit-usage__total {
  margin-left: auto;
  flex: 0 0 auto;
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  color: var(--hos-text-body);
}

.circuit-usage__cost {
  color: var(--hos-color-warning);
}

.circuit-usage__est {
  margin-left: 3px;
  font-style: normal;
  font-size: 10px;
  opacity: 0.8;
}

.circuit-usage__list {
  display: flex;
  flex-direction: column;
  gap: 3px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.circuit-usage__item {
  display: flex;
  align-items: center;
  gap: var(--hos-space-sm);
  min-width: 0;
  font-size: 11px;
}

.circuit-usage__name {
  flex: 0 0 38%;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--hos-text-secondary);
}

.circuit-usage__bar {
  flex: 1 1 auto;
  height: 4px;
  border-radius: var(--hos-radius-pill);
  background: var(--hos-surface-3);
  overflow: hidden;
}

.circuit-usage__bar-fill {
  display: block;
  height: 100%;
  border-radius: var(--hos-radius-pill);
  /* 用强调色派生渐变：不在弹窗里引入新的品牌色 */
  background: linear-gradient(
    90deg,
    color-mix(in srgb, var(--hos-color-accent) 70%, transparent),
    var(--hos-color-accent)
  );
}

.circuit-usage__value {
  flex: 0 0 auto;
  font-variant-numeric: tabular-nums;
  color: var(--hos-text-body);
}

.circuit-usage__more {
  margin: 0;
  font-size: 10px;
  color: var(--hos-text-tertiary);
}
</style>
