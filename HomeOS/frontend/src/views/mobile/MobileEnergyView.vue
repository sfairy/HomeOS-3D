<!--
组件：MobileEnergyView.vue
所属模块：frontend / src / views
职责：移动端「能耗」页——复用桌面 EnergyDashboard compact 视图（概览/电力/发电/洞察），
      并保留「从 HA 历史 24h 时间线自愈」入口（解决 Redis 缺采样场景）。
数据来源：
  - 能耗概览来自 EnergyDashboard 内部数据流（与桌面同源）；
  - 自愈能力来自 postEnergyHeal；
  - 默认功率实体 ID 由 resolvePowerEntityId 从 layout 配置解析。
关键交互：
  - 输入或自动填入功率实体 ID，点击「开始自愈」触发回填；
  - resolvedPowerId 变化时若用户未手动输入则自动同步到输入框；
  - 自愈结果以 toast 与底部提示文本两种方式反馈。
-->
<script setup lang="ts">
/**
 * 所属模块：frontend/views
 * 职责：渲染 views/MobileEnergyView 页面视图，整合子组件与业务数据。
 * 关键依赖：Vue Router、Pinia 全局状态、页面级子组件与 API services。
 * 约定：- 页面通过 onMounted 拉取数据，卸载时清理副作用；
  - 与子组件通信走 props/emit，不在视图层内直接写业务逻辑。
 */
/**
 * 移动端能耗：复用桌面 EnergyDashboard compact（概览/电力/发电/洞察），
 * 并保留 HA 时间线自愈入口。
 */
import { computed, onMounted, ref, watch } from 'vue'
import EnergyDashboard from '@/components/widgets/energy/Dashboard.vue'
import { postEnergyHeal, type EnergyHealResult } from '@/services/api/energy'
import { notifyError } from '@/services/notify'
import { useEntitiesStore } from '@/stores/entities.store'
import { useLayoutStore } from '@/stores/layout.store'
import { useChromeStore } from '@/stores/chrome.store'
import { resolvePowerEntityId } from '@/utils/energy/source.util'

const layoutStore = useLayoutStore()
const chrome = useChromeStore()
const entitiesStore = useEntitiesStore()

const entityId = ref('')
const busy = ref(false)
const lastResult = ref('')

// 从 layout 配置解析默认功率实体 ID：用户未手动输入时作为回退
const resolvedPowerId = computed(
  () => resolvePowerEntityId(layoutStore.layoutConfig?.statsSensors || {}, entitiesStore.entities) || '',
)

/**
 * 触发自愈：用输入或解析出的功率实体 ID 调 postEnergyHeal 回填 24h 时间线。
 * 结果优先用后端 message，否则拼装「已回填 N 点（方法 · Redis 状态）」。
 */
async function heal() {
  const id = entityId.value.trim() || resolvedPowerId.value
  if (!id) {
    chrome.notify('请填写或绑定电表/功率实体 ID', 'warning')
    return
  }
  busy.value = true
  try {
    const { data } = await postEnergyHeal(id, 24)
    const res = data as EnergyHealResult
    lastResult.value = res?.message
      ? res.message
      : `已回填 ${res?.written ?? 0} 点（${res?.method}${res?.redisReady === false ? ' · Redis 未就绪' : ''}）`
    chrome.notify(lastResult.value, 'success')
  } catch (e: unknown) {
    notifyError(e, '能源自愈')
  } finally {
    busy.value = false
  }
}

// 挂载时若用户未输入且能解析出默认 ID，则自动填入
onMounted(() => {
  if (!entityId.value && resolvedPowerId.value) entityId.value = resolvedPowerId.value
})

// 解析 ID 变化时同步到输入框，但仅在用户未手动输入时（避免覆盖手动输入）
watch(resolvedPowerId, (id) => {
  if (id && !entityId.value.trim()) entityId.value = id
})
</script>

<template>
  <div class="m-page m-energy" style="--m-accent-rgb: 52, 211, 153">
    <header class="m-page__header">
      <p class="m-page__eyebrow">用电</p>
      <h1 class="m-page__title">能耗</h1>
      <p class="m-page__sub">与桌面能源中心同一套概览、电力、发电与洞察</p>
    </header>

    <section class="m-page__card m-energy__hub">
      <EnergyDashboard floating-compact :panel-visible="true" />
    </section>

    <section class="m-page__card">
      <p class="m-page__card-label">自愈</p>
      <p class="m-page__card-title">从 HA 回填 24h 时间线</p>
      <label class="m-page__field">
        <span>功率实体 ID</span>
        <input v-model="entityId" class="settings-field" type="text" placeholder="sensor.power_xxx" />
      </label>
      <div class="m-page__btn-row">
        <button type="button" class="m-page__btn m-page__btn--primary" :disabled="busy" @click="heal">
          {{ busy ? '回填中…' : '开始自愈' }}
        </button>
      </div>
      <p v-if="lastResult" class="m-page__hint">{{ lastResult }}</p>
    </section>
  </div>
</template>
