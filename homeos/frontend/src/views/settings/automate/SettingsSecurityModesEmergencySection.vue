<!--
组件：SettingsSecurityModesEmergencySection.vue
所属模块：frontend / src / views / settings / automate
职责：安防模式「紧急求助 SOS」配置卡片。展示预设档位、重点灯池选择、灯光亮度、
      自动离家布防开关与自定义联动动作列表；支持批量添加与单条添加。
关键依赖：
  - HosSelect / EntityInput / SettingsRangeField：下拉、实体输入、范围滑块
  - normalizeSecurityEmergency：归一化紧急求助配置
  - useLayoutStore：读写 securityEmergency 配置
  - Zap / Plus / Layers / Trash2 / AlertTriangle 图标来自 @lucide/vue
数据来源：layoutStore.securityEmergency + 父级透传的预设、灯池、域/服务列表与回调
-->
<template>
  <section
    :class="['sm-mode-card', props.embedded && 'sm-mode-card--embedded']"
    style="--sm-accent: #ef4444"
  >
    <div class="sm-mode-hero">
      <div class="sm-mode-hero__icon sme-orb-danger">
        <AlertTriangle class="w-6 h-6 sme-icon-danger" />
      </div>
      <div class="sm-mode-hero__meta">
        <h3 class="sm-emergency-title">{{ '紧急求助 SOS' }}</h3>
        <p class="sm-emergency-desc">
          {{ '安防总览「紧急求助」触发。推送与语音见' }}
          <RouterLink :to="SETTINGS_ROUTES.alerts()" class="sm-info-link">{{
            '告警规则'
          }}</RouterLink
          >、
          <RouterLink :to="SETTINGS_ROUTES.voice()" class="sm-info-link">{{ '语音' }}</RouterLink
          >。
        </p>
        <p class="sm-emergency-summary">{{ emergencyModeSummary }}</p>
      </div>
    </div>

    <div class="sm-emergency-presets">
      <button
        v-for="preset in emergencyPresets"
        :key="preset.id"
        type="button"
        :class="[
          'sm-emergency-preset',
          activeEmergencyPresetId === preset.id && 'sm-emergency-preset--on',
        ]"
        :aria-pressed="activeEmergencyPresetId === preset.id"
        @click="applyEmergencyPreset(preset.id)"
      >
        <span class="sm-emergency-preset__icon">{{ preset.icon }}</span>
        <span class="sm-emergency-preset__name">{{ preset.name }}</span>
        <span class="sm-emergency-preset__desc">{{ preset.description }}</span>
      </button>
    </div>

    <div v-if="emergencyConfig.mode !== 'notify_only'" class="sm-emergency-options">
      <div
        v-if="
          emergencyConfig.mode === 'key_areas' ||
          (emergencyConfig.mode === 'custom' &&
            emergencyConfig.appendMode === 'key_areas' &&
            emergencyConfig.appendBuiltin)
        "
        class="sm-emergency-block"
      >
        <div class="sm-emergency-block__head">
          <h4>{{ '重点灯池' }}</h4>
          <div class="flex gap-2">
            <button type="button" class="sm-link" @click="importAwayLightPool()">
              {{ '导入离家模拟灯池' }}
            </button>
            <button type="button" class="sm-link sm-link--muted" @click="clearEmergencyLightPool()">
              {{ '清空' }}
            </button>
          </div>
        </div>
        <p class="sm-emergency-block__hint">
          {{
            `已选 ${emergencyConfig.lightPool?.length || 0} 盏；未选时回退离家模拟灯池（${awayLightPool.length} 盏）`
          }}
        </p>
        <div class="sm-chip-grid">
          <button
            v-for="e in lightEntitiesForPool.slice(0, 120)"
            :key="e.eid"
            type="button"
            :class="[
              'sp-check-chip',
              (emergencyConfig.lightPool || []).includes(e.eid) && 'sp-check-chip--on',
            ]"
            :title="e.eid"
            @click="toggleEmergencyLight(e.eid)"
          >
            {{ e.name }}
          </button>
        </div>
        <p v-if="lightEntitiesForPool.length > 120" class="sm-emergency-block__hint">
          {{ '仅展示前 120 盏，其余请用下方自定义动作添加' }}
        </p>
      </div>

      <div
        v-if="emergencyConfig.mode !== 'custom' || emergencyConfig.appendBuiltin"
        class="sm-emergency-block"
      >
        <SettingsRangeField
          v-model="emergencyConfig.lightBrightnessPct"
          :label="'求救灯光亮度'"
          :min="20"
          :max="100"
          :step="SETTINGS_RANGE_STEP.brightnessPct"
          unit="%"
          range-class="sm-emergency-range"
        />
      </div>

      <label v-if="emergencyConfig.mode === 'custom'" class="sm-emergency-toggle">
        <input v-model="emergencyConfig.appendBuiltin" type="checkbox" />
        <span>{{ '自定义动作执行后，叠加内置声光联动' }}</span>
      </label>
      <div
        v-if="emergencyConfig.mode === 'custom' && emergencyConfig.appendBuiltin"
        class="sm-field"
      >
        <label class="sm-field__label">{{ '叠加档位' }}</label>
        <HosSelect
          variant="home-mode"
          block
          trigger-class="sm-field__input sm-field__input--sm"
          v-model="emergencyConfig.appendMode"
        >
          <option value="full_home">{{ '全屋声光' }}</option>
          <option value="key_areas">{{ '重点区域（灯池）' }}</option>
        </HosSelect>
      </div>

      <label class="sm-emergency-toggle">
        <input v-model="emergencyConfig.autoArmAway" type="checkbox" />
        <span>{{ '触发后自动离家布防（armed_away）' }}</span>
      </label>
    </div>

    <div class="sm-actions-head">
      <div>
        <h3 class="sm-actions-title">
          <Zap class="w-3.5 h-3.5 sme-icon-warn" />
          {{ '自定义联动动作' }}
        </h3>
        <p class="sm-actions-sub">
          {{
            emergencyConfig.mode === 'custom'
              ? '按序号执行；可与上方叠加内置声光'
              : '任何模式下均可追加场景/脚本等额外动作'
          }}
        </p>
      </div>
      <div class="sm-actions-btns">
        <button type="button" class="sm-btn sm-btn--batch" @click="toggleEmShowBatch()">
          <Layers class="w-3 h-3" /> {{ '批量添加' }}
        </button>
        <button type="button" class="sm-btn sm-btn--add" @click="addEmergencyAction()">
          <Plus class="w-3 h-3" /> {{ '单条添加' }}
        </button>
      </div>
    </div>

    <div :class="['sm-batch-panel', emShowBatch && 'sm-batch-panel--open']">
      <div class="sm-batch-row">
        <HosSelect
          variant="home-mode"
          block
          trigger-class="sm-field__input sm-field__input--sm"
          v-model="emBatchDomain"
          @change="
            () => {
              emBatchChecked = []
              emBatchService = ''
            }
          "
        >
          <option value="">{{ '选择域' }}</option>
          <option v-for="d in allDomains" :key="d" :value="d">{{ d }}</option>
        </HosSelect>
        <HosSelect
          variant="home-mode"
          block
          trigger-class="sm-field__input sm-field__input--sm"
          v-model="emBatchService"
        >
          <option value="">{{ '选择服务' }}</option>
          <option v-for="s in servicesForDomain(emBatchDomain)" :key="s" :value="s">{{ s }}</option>
        </HosSelect>
        <button
          type="button"
          class="sm-btn sm-btn--primary"
          :disabled="!emBatchDomain || !emBatchService || !emBatchChecked?.length"
          @click="applyEmBatch()"
        >
          {{ `添加 ${emBatchChecked?.length || 0} 项` }}
        </button>
      </div>
      <div v-if="emBatchDomain" class="sm-batch-entities">
        <div class="sm-batch-entities__head">
          <span>{{ '选择目标实体' }}</span>
          <div class="flex gap-2">
            <button
              type="button"
              class="sm-link"
              @click="emBatchChecked = emBatchEntities().map((e) => e.eid)"
            >
              {{ '全选' }}
            </button>
            <button type="button" class="sm-link sm-link--muted" @click="emBatchChecked = []">
              {{ '清空' }}
            </button>
          </div>
        </div>
        <div class="sm-chip-grid">
          <button
            v-for="e in emBatchEntities()"
            :key="e.eid"
            type="button"
            :class="[
              'sp-check-chip',
              (emBatchChecked || []).includes(e.eid) && 'sp-check-chip--on',
            ]"
            :title="e.eid"
            @click="toggleEmCheck(e.eid)"
          >
            {{ e.name }}
          </button>
        </div>
      </div>
    </div>

    <div v-if="!emergencyConfig.actions?.length" class="sm-empty">
      <div class="sm-empty__icon">
        <Zap class="w-5 h-5" />
      </div>
      <p class="sm-empty__title">{{ '暂无自定义动作' }}</p>
      <p class="sm-empty__desc">
        {{
          emergencyConfig.mode === 'notify_only'
            ? '静默模式不操作设备，可在此追加通知类脚本'
            : '可添加场景、脚本、指定设备等额外联动'
        }}
      </p>
    </div>

    <div v-else class="sm-action-list">
      <div v-for="(act, aidx) in emergencyConfig.actions" :key="aidx" class="sm-action-row">
        <span class="sm-action-row__idx">{{ aidx + 1 }}</span>
        <HosSelect
          variant="home-mode"
          block
          trigger-class="sm-action-row__select sm-action-row__select--domain"
          v-model="act.domain"
          @change="
            () => {
              act.service = ''
            }
          "
        >
          <option value="">{{ '域' }}</option>
          <option v-for="d in allDomains" :key="d" :value="d">{{ d }}</option>
        </HosSelect>
        <HosSelect
          variant="home-mode"
          block
          trigger-class="sm-action-row__select sm-action-row__select--service"
          v-model="act.service"
        >
          <option value="">{{ '服务' }}</option>
          <option v-for="s in servicesForDomain(act.domain)" :key="s" :value="s">{{ s }}</option>
        </HosSelect>
        <EntityInput
          v-model="act.entity_id"
          :placeholder="'实体 ID'"
          :domain-filter="act.domain || ''"
          wrapper-class="sm-action-row__entity [&_.ei-wrap]:bg-black/30 [&_input]:text-sm [&_input]:py-2.5"
        />
        <button
          type="button"
          class="sm-action-row__del"
          :title="'删除'"
          :aria-label="'删除动作'"
          @click="emergencyConfig.actions.splice(aidx, 1)"
        >
          <Trash2 class="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  </section>
</template>

<script setup>
import HosSelect from '@/components/common/base/HosSelect.vue'
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import { Zap, Plus, Layers, Trash2, AlertTriangle } from '@lucide/vue'
import EntityInput from '@/components/common/EntityInput.vue'
import SettingsRangeField from '@/views/settings/shared/layout/SettingsRangeField.vue'
import { SETTINGS_RANGE_STEP } from '@/utils/settings/range-steps.util'
import { SETTINGS_ROUTES } from '@/utils/registry/settings-route.util'
import { useLayoutStore } from '@/stores/layout.store'
import { normalizeSecurityEmergency } from '@/constants/security-emergency'

// 入参：是否嵌入、当前激活预设、预设列表、汇总文案、灯池相关数据与批量/动作回调函数
const props = defineProps({
  embedded: { type: Boolean, default: false },
  activeEmergencyPresetId: { type: String, default: '' },
  emergencyPresets: { type: Array, default: () => [] },
  emergencyModeSummary: { type: String, default: '' },
  emergencyBrightnessTrackStyle: { type: Object, default: () => ({}) },
  awayLightPool: { type: Array, default: () => [] },
  lightEntitiesForPool: { type: Array, default: () => [] },
  allDomains: { type: Array, default: () => [] },
  servicesForDomain: { type: Function, required: true },
  emBatchEntities: { type: Function, required: true },
  applyEmergencyPreset: { type: Function, required: true },
  toggleEmergencyLight: { type: Function, required: true },
  importAwayLightPool: { type: Function, required: true },
  clearEmergencyLightPool: { type: Function, required: true },
  addEmergencyAction: { type: Function, required: true },
  toggleEmCheck: { type: Function, required: true },
  applyEmBatch: { type: Function, required: true },
})

const layoutStore = useLayoutStore()

// 确保布局配置中存在结构完整的 securityEmergency 对象，缺失时按默认值归一化
function ensureSecurityEmergency() {
  const lc = layoutStore.layoutConfig
  if (!lc.securityEmergency || typeof lc.securityEmergency !== 'object') {
    lc.securityEmergency = normalizeSecurityEmergency({})
    return lc.securityEmergency
  }
  const cfg = lc.securityEmergency
  if (!cfg.mode) {
    Object.assign(cfg, normalizeSecurityEmergency({ ...cfg }))
  }
  return cfg
}

// 紧急求助配置对象（响应式引用，依赖 ensureSecurityEmergency）
const emergencyConfig = computed(() => ensureSecurityEmergency())

// 双向绑定：批量面板的展开态、域、服务、勾选实体
const emShowBatch = defineModel('emShowBatch', { type: Boolean, default: false })
const emBatchDomain = defineModel('emBatchDomain', { type: String, default: '' })
const emBatchService = defineModel('emBatchService', { type: String, default: '' })
const emBatchChecked = defineModel('emBatchChecked', { type: Array, default: () => [] })

// 切换批量添加面板展开态
function toggleEmShowBatch() {
  emShowBatch.value = !emShowBatch.value
}
</script>

<style src="./styles/security-modes.css"></style>
