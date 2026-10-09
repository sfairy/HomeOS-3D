<!--
  组件文件：SetupWizardEnergyStep.vue
  所属模块：frontend/src/features/settings/connect/setup-wizard
  组件职责：初始化向导的第三步「能源绑定」表单页。上半部分为主电表（累计电量 kWh/Wh 单
    选 EntityInput）与分路（功率分路 W 多选 EntityMultiSelect）两列绑定表单，下半
    部分展示校验报错（实体未同步到 HA）与 Redis 未配置提示（仅影响分路曲线可视）。
  主要 props / emits：
    - defineModel meterEntityId：主电表实体 ID 双向绑定
    - defineModel circuitEntityIds：分路实体 ID 逗号分隔字符串双向绑定
    - props status：向导状态对象（含 redis.configured 判断）
    - props validateResult：实体校验结果（missing 数组展示缺失项）
  依赖关系：引用 EntityInput / EntityMultiSelect 做实体选择；joinCommaEntityIds /
    parseCommaEntityIds 工具桥接逗号分隔字符串与多选数组。
  注意事项：主电表必须是累计电量 sensor（不要选瞬时功率），否则能源趋势会出现负数；
    Redis 缺失不阻止向导完成但会导致分路趋势页面空白。
-->
<script setup>
/**
 * 职责：渲染 views/SetupWizardEnergyStep 页面视图，整合子组件与业务数据。
 * 关键依赖：Vue Router、Pinia 全局状态、页面级子组件与 API services。
 * 约定：- 页面通过 onMounted 拉取数据，卸载时清理副作用；
  - 与子组件通信走 props/emit，不在视图层内直接写业务逻辑。
 */
import { computed } from 'vue'
import { Gauge, GitBranch, AlertTriangle } from '@lucide/vue'
import EntityInput from '@/components/common/EntityInput.vue'
import EntityMultiSelect from '@/components/common/EntityMultiSelect.vue'
import { joinCommaEntityIds, parseCommaEntityIds } from '@/utils/entity/comma-entity-ids.util'

const meterEntityId = defineModel('meterEntityId', { type: String, default: '' })
const circuitEntityIds = defineModel('circuitEntityIds', { type: String, default: '' })

defineProps({
  status: { type: Object, default: null },
  validateResult: { type: Object, default: null },
})

const circuitEntityIdsList = computed({
  get: () => parseCommaEntityIds(circuitEntityIds.value),
  set: (ids) => {
    circuitEntityIds.value = joinCommaEntityIds(ids)
  },
})
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
          <p class="sw-energy-panel__sub">{{ '主电表必填，分路可选，完成后能源页即可展示趋势' }}</p>
        </div>
      </header>

      <div class="sw-energy-panel__grid">
        <div class="sw-energy-field">
          <label class="sw-energy-field__label">
            <Gauge class="w-3.5 h-3.5" />
            {{ '主电表' }}
          </label>
          <EntityInput
            v-model="meterEntityId"
            :placeholder="'sensor.monthly_energy'"
            domain-filter="sensor"
            suggest-device-class="energy"
          />
          <p class="sw-energy-field__hint">{{ '须为累计电量（kWh/Wh），不要选功率（W）传感器' }}</p>
        </div>
        <div class="sw-energy-field">
          <label class="sw-energy-field__label">
            <GitBranch class="w-3.5 h-3.5" />
            {{ '分路（可选）' }}
          </label>
          <EntityMultiSelect
            v-model="circuitEntityIdsList"
            :allowed-domains="['sensor']"
            placeholder="搜索并选择功率分路"
          />
          <p class="sw-energy-field__hint">{{ '功率分路（W），可多选' }}</p>
        </div>
      </div>
    </section>

    <div v-if="validateResult?.missing?.length" class="sw-alert sw-alert--danger">
      <AlertTriangle class="w-4 h-4 shrink-0 mt-0.5" />
      <span>{{ `这些实体还没同步到 HA：${validateResult.missing.join(', ')}` }}</span>
    </div>

    <div v-if="status?.redis?.configured === false" class="sw-alert sw-alert--info">
      <span>{{ '💡 没有 Redis 也能完成向导，只是分路曲线暂时看不到而已' }}</span>
    </div>
  </div>
</template>

<style scoped src="./styles/SetupWizardEnergyStep.css"></style>
