<!--
  组件文件：SetupWizardEnvironmentStep.vue
  所属模块：frontend/src/features/settings/connect/setup-wizard
  组件职责：初始化向导的第四步「环境绑定」页。顶部显示已绑定房间进度条（要求至少 3 间
    达标才能继续下一步）与提示；紧接着「智能推断传感器」大按钮（按 HA 实体的 area_id
    与 device_class 自动匹配各房间温湿度/PM2.5/CO2）；加载中显示全局 loading；
    随后按房间 Tab 分组展示 SettingsOrchTabs，每个 Tab 内列出该房间可绑定的传感器
    字段（温度/湿度/PM2.5/CO2/VOC 等）。底部显示 RegistryDegradedGuide 当实体注册表
    未就绪时的重试提示。
  主要 props / emits：
    - props status：向导状态对象（env step 提示）
    - props inferEnvMap：点击「智能推断」按钮的回调函数
  依赖关系：通过 inject(SETUP_WIZARD_ENV_STEP_KEY) 注入上下文获取 sensorMap、envRoomTabs、
    envProgressPct、envConfiguredRoomCount、refreshAreas 等一整套状态与方法；
    引用 SettingsOrchTabs / EntityInput / VProgressBar / RegistryDegradedGuide 子组件。
  注意事项：进度达标要求至少 3 间房，否则下一步按钮会被父级禁用；智能推断依赖
    HA 实体注册表，注册表异常时会被 RegistryDegradedGuide 拦截并提示刷新。
-->
<script setup>
/**
 * 职责：渲染 views/SetupWizardEnvironmentStep 页面视图，整合子组件与业务数据。
 * 关键依赖：Vue Router、Pinia 全局状态、页面级子组件与 API services。
 * 约定：- 页面通过 onMounted 拉取数据，卸载时清理副作用；
  - 与子组件通信走 props/emit，不在视图层内直接写业务逻辑。
 */
import { inject } from 'vue'
import { Sparkles, Loader2 } from '@lucide/vue'
import SettingsOrchTabs from '@/features/settings/shared/layout/SettingsOrchTabs.vue'
import EntityInput from '@/components/common/EntityInput.vue'
import VProgressBar from '@/components/common/base/VProgressBar.vue'
import RegistryDegradedGuide from '@/features/settings/shared/RegistryDegradedGuide.vue'
import { SETUP_WIZARD_ENV_STEP_KEY } from './context'

defineProps({
  status: { type: Object, default: null },
  inferEnvMap: { type: Function, required: true },
})

const envStep = inject(SETUP_WIZARD_ENV_STEP_KEY)
if (!envStep) throw new Error('设置向导环境步骤需要设置向导环境上下文。')

const {
  sensorMap,
  envLoading,
  envRoomTab,
  envSensorFieldList,
  envRoomBound,
  envRoomSensorCount,
  envConfiguredRoomCount,
  envStepReady,
  envProgressPct,
  envRoomTabs,
  activeEnvRoom,
  registryDegraded,
  registryDegradedReason,
  refreshAreas,
} = envStep
</script>

<template>
  <div class="sw-env-step sw-step">
    <RegistryDegradedGuide
      v-if="registryDegraded"
      :reason="registryDegradedReason"
      :refreshing="envLoading"
      @retry="refreshAreas"
    />

    <div class="sw-env-progress">
      <div class="sw-env-progress__head">
        <span class="sw-env-progress__label">{{ '已绑定房间' }}</span>
        <span
          :class="[
            'sw-env-progress__stat',
            envStepReady ? 'sw-env-progress__stat--ok' : 'sw-env-progress__stat--warn',
          ]"
        >
          {{ envConfiguredRoomCount }} / 3
          <span class="sw-env-progress__suffix">{{ envStepReady ? '已满足' : '未达标' }}</span>
        </span>
      </div>
      <VProgressBar :value="envProgressPct" variant="warn" glow size="sm" />
      <p v-if="status?.steps?.environment?.hint && !envStepReady" class="sw-env-progress__hint">
        {{ status.steps.environment.hint }}
      </p>
    </div>

    <button type="button" class="sw-env-infer" :disabled="envLoading" @click="inferEnvMap">
      <span class="sw-env-infer__orb">
        <Sparkles class="w-5 h-5" />
      </span>
      <span class="sw-env-infer__copy">
        <span class="sw-env-infer__title">{{ '智能推断传感器' }}</span>
        <span class="sw-env-infer__desc">{{
          '根据 HA 实体的 area_id 与 device_class 自动匹配各房间温湿度、PM2.5、CO₂'
        }}</span>
      </span>
      <span class="sw-env-infer__action">{{ envLoading ? '加载中…' : '开始推断' }}</span>
    </button>

    <div v-if="envLoading" class="sw-env-loading">
      <Loader2 class="sw-env-loading__icon animate-spin" />
      <p class="sw-env-loading__title">{{ '加载环境映射…' }}</p>
    </div>

    <template v-else>
      <SettingsOrchTabs v-model="envRoomTab" :tabs="envRoomTabs" toolbar class="sw-env-room-tabs" />

      <div v-if="activeEnvRoom" :key="envRoomTab" class="sw-env-room-panel">
        <div class="sw-env-room-head">
          <div>
            <h4 class="sw-env-room-title">{{ activeEnvRoom.displayLabel }}</h4>
            <p class="sw-env-room-sub">
              {{
                envRoomBound(activeEnvRoom.id) ? '已绑定传感器' : '尚未绑定，可手动选择或智能推断'
              }}
            </p>
          </div>
          <span
            :class="[
              'sw-env-room-badge',
              envRoomBound(activeEnvRoom.id) && 'sw-env-room-badge--ok',
            ]"
          >
            {{ envRoomSensorCount(activeEnvRoom.id) }}/4
          </span>
        </div>

        <div class="sw-env-sensor-grid">
          <div
            v-for="field in envSensorFieldList"
            :key="field.key"
            :class="[
              'sw-env-sensor-cell',
              sensorMap[activeEnvRoom.id]?.[field.key]?.trim() && 'sw-env-sensor-cell--filled',
            ]"
          >
            <div class="sw-env-sensor-head">
              <span v-if="field.icon" :class="['sw-env-sensor-icon', field.iconClass]">
                <component :is="field.icon" class="w-4 h-4" />
              </span>
              <label :class="['settings-form-label sw-env-sensor-label', field.labelClass]">
                {{ field.shortLabel }}
                <span v-if="field.unit" class="sw-env-sensor-unit">{{ field.unit }}</span>
              </label>
            </div>
            <EntityInput
              v-model="sensorMap[activeEnvRoom.id][field.key]"
              :placeholder="field.placeholder"
              domain-filter="sensor"
              :suggest-device-class="field.deviceClass"
            />
          </div>
        </div>

        <p class="sw-env-footnote">
          {{ '温湿度配对后可计算露点与霉菌风险；PM2.5 / CO₂ / TVOC 参与 IAQ 综合评分。留空则跳过该项。' }}
        </p>
      </div>
    </template>
  </div>
</template>
<style src="./styles/setup-wizard.css"></style>
