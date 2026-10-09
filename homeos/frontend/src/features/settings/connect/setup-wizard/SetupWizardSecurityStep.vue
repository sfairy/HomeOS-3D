<!--
  组件文件：SetupWizardSecurityStep.vue
  所属模块：frontend/src/features/settings/connect/setup-wizard
  组件职责：初始化向导的第二步「安防绑定」表单页。上部为多路门铃绑定列表（每路含
    自定义标签、触发实体、摄像头实体三个字段与删除按钮，支持新增/删除多路），下部
    为 SetupWizardPresencePanel 人员在家判定面板（含自动布防/升级开关），以及独立的
    运动传感器绑定输入框。
  主要 props / emits：
    - defineModel doorbellList：门铃列表双向绑定
    - defineModel motionEntityId：运动传感器实体双向绑定
    - props addDoorbell / removeDoorbell / reduceSensitivity：门铃操作回调
    - props presenceMembers / presenceLoading / presenceLoaded / presenceAutoMode 等一整套
      presence 面板 props 透传给子组件
    - props loadPresence / toggleAutoArm / toggleAutoUpgrade / memberInitial /
      memberTone：presence 回调函数透传
  依赖关系：引用 SetupWizardPresencePanel 子组件；EntityInput 做实体绑定；Plus/Trash2
    / Bell / Radio 图标组件。
  注意事项：至少添加一路门铃即可继续下一步；触发实体支持 input_boolean/binary_sensor/
    switch/button/input_button 多域。
-->
<script setup>
/**
 * 职责：渲染 views/SetupWizardSecurityStep 页面视图，整合子组件与业务数据。
 * 关键依赖：Vue Router、Pinia 全局状态、页面级子组件与 API services。
 * 约定：- 页面通过 onMounted 拉取数据，卸载时清理副作用；
  - 与子组件通信走 props/emit，不在视图层内直接写业务逻辑。
 */
import { Plus, Trash2, Bell, Radio } from '@lucide/vue'
import EntityInput from '@/components/common/EntityInput.vue'
import SetupWizardPresencePanel from './SetupWizardPresencePanel.vue'

const doorbellList = defineModel('doorbellList', { type: Array, default: () => [] })
const motionEntityId = defineModel('motionEntityId', { type: String, default: '' })

defineProps({
  addDoorbell: { type: Function, required: true },
  removeDoorbell: { type: Function, required: true },
  reduceSensitivity: { type: Function, required: true },
  presenceMembers: { type: Array, default: () => [] },
  presenceLoading: { type: Boolean, default: false },
  presenceLoaded: { type: Boolean, default: false },
  presenceAutoMode: { type: Boolean, default: true },
  presenceSummary: { type: String, default: '' },
  presenceAtHomeCount: { type: Number, default: 0 },
  autoArmEnabled: { type: Boolean, default: false },
  autoUpgradeEnabled: { type: Boolean, default: false },
  presenceFlagSaving: { type: Boolean, default: false },
  loadPresence: { type: Function, required: true },
  toggleAutoArm: { type: Function, required: true },
  toggleAutoUpgrade: { type: Function, required: true },
  memberInitial: { type: Function, required: true },
  memberTone: { type: Function, required: true },
})
</script>

<template>
  <div class="sw-step">
    <section class="sw-doorbell-block">
      <header class="sw-doorbell__head">
        <div>
          <p class="sw-doorbell__eyebrow">{{ '门铃路由' }}</p>
          <h4 class="sw-doorbell__title">{{ '多路门铃绑定' }}</h4>
        </div>
        <span v-if="doorbellList.length" class="sw-doorbell__badge">{{
          `${doorbellList.length} 路`
        }}</span>
      </header>

      <div v-if="doorbellList.length" class="sw-doorbell-list">
        <article v-for="(db, idx) in doorbellList" :key="db.id || idx" class="sw-doorbell-card">
          <header class="sw-doorbell-card__head">
            <span class="sw-doorbell-card__index">{{ idx + 1 }}</span>
            <input
              v-model="db.label"
              type="text"
              class="settings-field sw-doorbell-card__label"
              :placeholder="'前门'"
            />
            <button
              type="button"
              class="sw-doorbell-card__delete"
              :title="'删除此路门铃'"
              :aria-label="'删除此路门铃'"
              @click="removeDoorbell(idx)"
            >
              <Trash2 class="w-3.5 h-3.5" />
            </button>
          </header>
          <div class="sw-doorbell-card__fields">
            <label class="sw-doorbell-card__field">
              <span class="sw-doorbell-card__field-label">{{ '触发实体' }}</span>
              <EntityInput
                v-model="db.triggerEntityId"
                :placeholder="'触发实体'"
                domain-filter="input_boolean,binary_sensor,switch,button,input_button"
                suggest-device-class="door"
              />
            </label>
            <label class="sw-doorbell-card__field">
              <span class="sw-doorbell-card__field-label">{{ '摄像头' }}</span>
              <EntityInput
                v-model="db.cameraEntityId"
                :placeholder="'摄像头'"
                domain-filter="camera"
              />
            </label>
          </div>
        </article>
      </div>

      <div v-else class="sw-doorbell-empty">
        <Bell class="sw-doorbell-empty__icon" />
        <p class="sw-doorbell-empty__title">{{ '尚未配置门铃' }}</p>
        <p class="sw-doorbell-empty__desc">{{ '点击下方「添加门铃」配置触发实体与摄像头' }}</p>
      </div>

      <div class="sw-actions">
        <button type="button" class="sw-btn sw-btn--rose" @click="addDoorbell">
          <Plus class="w-3.5 h-3.5" />
          {{ '添加门铃' }}
        </button>
        <button type="button" class="sw-btn" @click="reduceSensitivity">
          {{ '降低灵敏度（延长冷却）' }}
        </button>
      </div>
    </section>

    <section class="sw-section sw-section--rose">
      <header class="sw-section__head">
        <div class="sw-section__icon sw-section__icon--rose">
          <Radio class="w-4 h-4" />
        </div>
        <h4 class="sw-section__title">{{ '毫米波 / 运动传感器（可选）' }}</h4>
      </header>
      <p class="sw-section__hint">
        {{
          '占用检测约定：entity_id 建议含 mmwave / occupancy / presence；异常活动与照护面板依赖此类 binary_sensor。'
        }}
      </p>
      <EntityInput
        v-model="motionEntityId"
        :placeholder="'binary_sensor.mmwave_presence'"
        domain-filter="binary_sensor"
        suggest-device-class="occupancy"
      />
    </section>

    <SetupWizardPresencePanel
      :presence-members="presenceMembers"
      :presence-loading="presenceLoading"
      :presence-loaded="presenceLoaded"
      :presence-auto-mode="presenceAutoMode"
      :presence-summary="presenceSummary"
      :presence-at-home-count="presenceAtHomeCount"
      :auto-arm-enabled="autoArmEnabled"
      :auto-upgrade-enabled="autoUpgradeEnabled"
      :presence-flag-saving="presenceFlagSaving"
      :load-presence="loadPresence"
      :toggle-auto-arm="toggleAutoArm"
      :toggle-auto-upgrade="toggleAutoUpgrade"
      :member-initial="memberInitial"
      :member-tone="memberTone"
    />
  </div>
</template>

<style scoped src="./styles/setup-wizard.css"></style>
