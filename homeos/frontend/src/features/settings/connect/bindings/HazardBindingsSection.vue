<!--
  组件文件：HazardBindingsSection.vue
  所属模块：frontend/src/features/settings/connect/bindings
  组件职责：联动绑定大类下的 Hazards（火灾/燃气/水漏）危险传感器绑定面板。左栏绑定
    烟感/燃气/水漏三类 binary_sensor，右栏绑定紧急场景、燃气阀、水阀、排风扇动作实体。
    底部提供测试紧急场景联动与多种演习模式（烟雾/燃气/水漏）触发按钮，以及绑定状态
    汇总表格。顶部高亮显示绑定冲突（如烟感与紧急场景互不关联）。
  主要 props / emits：
    - props hazardTesting / hazardDrillBusy：测试与演习中加载状态
    - props hazardDrillTip / hazardDrillOk：演习反馈文案与是否成功
    - 8 个 defineModel：hazardSmokeEntityIds / hazardGasEntityIds / hazardLeakEntityIds
      / hazardEmergencySceneId / hazardGasValveEntityId / hazardWaterValveEntityId
      / hazardExhaustFanEntityIds / hazardDrillMode
    - emit test-hazard：点击「测试紧急场景联动」按钮
    - emit hazard-drill：点击某一演习模式按钮，payload 为演习 kind
  依赖关系：引用 useHazardBindingsSection composable 计算 bindingConflicts /
    sensorFields / actionFields / drillButtons / statusRows 派生数据；
    EntityMultiSelect 做实体多选；SETTINGS_ROUTES 与 LINKAGE_HUB_ROUTES 跳转。
  注意事项：测试与演习均会真实调用联动引擎（演习模式不通知用户、只跑内部流），
    建议非家庭时间使用；绑定冲突检测为前端启发式，仅作提醒。
-->
<template>
  <div class="hazard-bind">
    <p v-if="bindingConflicts.length" class="hazard-bind__alert hazard-bind__alert--warn">
      <span>{{ `绑定冲突：${bindingConflictText}` }}</span>
    </p>

    <div class="hazard-bind__grid">
      <section class="hazard-bind__card hazard-bind__card--sensors">
        <header class="hazard-bind__card-head">
          <div class="hazard-bind__card-icon hazard-bind__card-icon--violet">
            <Flame class="w-4 h-4" />
          </div>
          <div class="hazard-bind__card-meta">
            <p class="hazard-bind__eyebrow">{{ '探测器' }}</p>
            <h4 class="hazard-bind__card-title">{{ '传感器绑定' }}</h4>
          </div>
          <span v-if="sensorBindingCount" class="hazard-bind__badge hazard-bind__badge--violet">
            {{ `${sensorBindingCount} 个实体` }}
          </span>
        </header>
        <p class="hazard-bind__card-desc hazard-bind__card-desc--compact">
          {{ '绑定后优先展示在安防页。' }}
        </p>

        <div class="hazard-bind__card-body hazard-bind__card-body--sensors">
          <div
            v-for="field in sensorFields"
            :key="field.key"
            :class="['hazard-bind__field-box', `hazard-bind__field-box--${field.tone}`]"
          >
            <div class="hazard-bind__field-head">
              <label class="hazard-bind__field-label">
                <span
                  :class="['hazard-bind__field-icon', `hazard-bind__field-icon--${field.tone}`]"
                >
                  <component :is="field.icon" class="w-3.5 h-3.5" />
                </span>
                <span>{{ field.label }}</span>
              </label>
              <span
                :class="[
                  'hazard-bind__field-status',
                  `hazard-bind__field-status--${field.statusTone}`,
                ]"
              >
                {{ field.statusLabel }}
              </span>
            </div>
            <EntityMultiSelect
              :model-value="field.ids"
              class="hazard-bind__multiselect"
              :allowed-domains="['binary_sensor']"
              :suggest-device-class="field.deviceClass"
              :placeholder="field.placeholder"
              @update:model-value="field.onUpdate($event)"
            />
          </div>

          <div class="hazard-bind__drill-dock">
            <header class="hazard-bind__drill-dock-head">
              <span class="hazard-bind__drill-eyebrow">{{ '测试与演习' }}</span>
              <span v-if="hazardDrillMode" class="hazard-bind__drill-mode-badge">{{
                '演习模式'
              }}</span>
            </header>
            <div class="hazard-bind__drill-matrix">
              <button
                type="button"
                class="hazard-bind__drill-tile hazard-bind__drill-tile--primary"
                :disabled="hazardTesting"
                @click="$emit('test-hazard')"
              >
                <PlayCircle class="hazard-bind__drill-tile-icon" />
                <span class="hazard-bind__drill-tile-label">{{
                  hazardTesting ? '测试中…' : '测试紧急场景联动'
                }}</span>
              </button>
              <button
                v-for="drill in drillButtons"
                :key="drill.kind"
                type="button"
                :class="['hazard-bind__drill-tile', `hazard-bind__drill-tile--${drill.tone}`]"
                :disabled="hazardDrillBusy"
                @click="$emit('hazard-drill', drill.kind)"
              >
                <component :is="drill.icon" class="hazard-bind__drill-tile-icon" />
                <span class="hazard-bind__drill-tile-label">{{
                  hazardDrillBusy ? '演习中…' : drill.shortLabel
                }}</span>
              </button>
            </div>
            <p
              v-if="hazardDrillTip"
              :class="[
                'hazard-bind__drill-tip',
                hazardDrillOk ? 'hazard-bind__drill-tip--ok' : 'hazard-bind__drill-tip--warn',
              ]"
            >
              {{ hazardDrillTip }}
            </p>
          </div>
        </div>
      </section>

      <section class="hazard-bind__card hazard-bind__card--actions">
        <header class="hazard-bind__card-head">
          <div class="hazard-bind__card-icon hazard-bind__card-icon--cyan">
            <Zap class="w-4 h-4" />
          </div>
          <div class="hazard-bind__card-meta">
            <p class="hazard-bind__eyebrow">{{ '联动' }}</p>
            <h4 class="hazard-bind__card-title">{{ '触发动作' }}</h4>
          </div>
        </header>
        <p class="hazard-bind__card-desc hazard-bind__card-desc--compact">
          {{ '留空使用默认实体；避免与 HA 模板重复。' }}
        </p>

        <div class="hazard-bind__card-body hazard-bind__card-body--actions">
          <div
            v-for="field in actionFields"
            :key="field.key"
            :class="['hazard-bind__field-box', `hazard-bind__field-box--${field.tone}`]"
          >
            <div class="hazard-bind__field-head">
              <label class="hazard-bind__field-label">
                <span
                  :class="['hazard-bind__field-icon', `hazard-bind__field-icon--${field.tone}`]"
                >
                  <component :is="field.icon" class="w-3.5 h-3.5" />
                </span>
                <span>{{ field.label }}</span>
              </label>
              <span class="hazard-bind__field-count">{{ field.countLabel }}</span>
            </div>
            <EntityMultiSelect
              :model-value="field.ids"
              class="hazard-bind__multiselect"
              :allowed-domains="field.domains || []"
              :static-options="field.staticOptions"
              :max-selection="field.maxSelection"
              :placeholder="field.placeholder"
              @update:model-value="field.onUpdate($event)"
            />
            <p v-if="field.hint" class="hazard-bind__field-hint">{{ field.hint }}</p>
          </div>
        </div>
      </section>
    </div>

    <footer class="hazard-bind__footer">
      <div v-if="hazardActionSummary || statusRows.length" class="hazard-bind__footer-meta">
        <p v-if="hazardActionSummary" class="hazard-bind__summary">
          <span class="hazard-bind__summary-label">{{ '联动预览' }}</span>
          {{ hazardActionSummary }}
        </p>
        <HazardBindingStatusPanel
          :hazard-smoke-entity-ids="hazardSmokeEntityIds"
          :hazard-gas-entity-ids="hazardGasEntityIds"
          :hazard-leak-entity-ids="hazardLeakEntityIds"
          :hazard-gas-valve-entity-id="hazardGasValveEntityId"
          :hazard-water-valve-entity-id="hazardWaterValveEntityId"
          :hazard-exhaust-fan-entity-ids="hazardExhaustFanEntityIds"
        />
      </div>

      <div class="hazard-bind__actions">
        <label class="hazard-bind__drill">
          <input v-model="hazardDrillMode" type="checkbox" class="hazard-bind__drill-input" />
          <span>{{ '演习模式（真实触发不自动关阀/开排风，仍会通知与执行紧急场景）' }}</span>
        </label>
        <div class="hazard-bind__actions-secondary">
          <RouterLink
            :to="SETTINGS_ROUTES.params('security')"
            class="hazard-bind__action-btn hazard-bind__action-btn--link"
          >
            {{ '高级参数 · 传感器冷却' }}
          </RouterLink>
        </div>
      </div>
    </footer>
  </div>
</template>

<script setup lang="ts">
import { RouterLink } from 'vue-router'
import { Flame, Zap, PlayCircle } from '@lucide/vue'
import EntityMultiSelect from '@/components/common/EntityMultiSelect.vue'
import HazardBindingStatusPanel from '@/features/settings/connect/bindings/HazardBindingStatusPanel.vue'
import { SETTINGS_ROUTES } from '@/utils/registry/settings-route.util'
import { useHazardBindingsSection } from '@/features/settings/composables/automate/security-modes-extras.internals'

// 入参：测试中、演习中、演习提示文案与是否成功
defineProps({
  hazardTesting: Boolean,
  hazardDrillBusy: Boolean,
  hazardDrillTip: { type: String, default: '' },
  hazardDrillOk: { type: Boolean, default: true },
})

// 对外事件：测试紧急场景联动、触发演习
defineEmits(['test-hazard', 'hazard-drill'])

// 各 hazard 探测器/阀门/排风/紧急场景/演习模式的双向绑定
const hazardSmokeEntityIds = defineModel<string[]>('hazardSmokeEntityIds', { default: () => [] })
const hazardGasEntityIds = defineModel<string[]>('hazardGasEntityIds', { default: () => [] })
const hazardLeakEntityIds = defineModel<string[]>('hazardLeakEntityIds', { default: () => [] })
const hazardEmergencySceneId = defineModel<string>('hazardEmergencySceneId', { default: '' })
const hazardGasValveEntityId = defineModel<string>('hazardGasValveEntityId', { default: '' })
const hazardWaterValveEntityId = defineModel<string>('hazardWaterValveEntityId', { default: '' })
const hazardExhaustFanEntityIds = defineModel<string>('hazardExhaustFanEntityIds', { default: '' })
const hazardDrillMode = defineModel<boolean>('hazardDrillMode', { default: false })

// 派生绑定冲突、传感器/动作字段、演习按钮与状态行
const {
  bindingConflicts,
  bindingConflictText,
  sensorBindingCount,
  sensorFields,
  actionFields,
  drillButtons,
  hazardActionSummary,
  statusRows,
} = useHazardBindingsSection({
  hazardSmokeEntityIds,
  hazardGasEntityIds,
  hazardLeakEntityIds,
  hazardEmergencySceneId,
  hazardGasValveEntityId,
  hazardWaterValveEntityId,
  hazardExhaustFanEntityIds,
})
</script>
<style src="./styles/hazard-bindings-section.css"></style>
