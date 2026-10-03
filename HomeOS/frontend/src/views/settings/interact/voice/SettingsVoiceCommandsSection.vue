<!--
组件：SettingsVoiceCommandsSection.vue
所属模块：frontend / src / views / settings / interact / voice
职责：语音命令配置区段。展示短语与 HA 服务映射列表，支持追加/覆盖导入预设、添加/删除命令、
      按域与服务选择映射目标，并对 climate 等域补充实体作用域与模式参数。
defineModel：
  - voiceCommands：命令列表（双向绑定）
Props：
  - domainOptionsList：可选域列表
  - phrasesText / setPhrasesText：读取/设置命令短语文本
  - servicesForCmd：按域返回可选服务
  - entityScope / entityInputValue / needsClimateMode：实体作用域与 climate 模式辅助
Emits：
  - import-presets / import-presets-replace：追加/覆盖导入预设
  - add-command / remove-command：增删命令
  - domain-change / service-change：域/服务变更
  - entity-scope-change / entity-input / climate-mode：实体作用域与模式变更
关键依赖：
  - SettingsCard / SettingsFlowBand / SettingsFlowStat：卡片与流程概览
  - HosSelect：域/服务下拉
  - EntityInput：实体作用域选择
数据来源：父级 SettingsVoicePanel 透传的 props 与 defineModel
-->
<template>
  <div class="settings-hub-section voice-cmd-hub">
    <SettingsCard static>
      <SettingsFlowBand
        :steps="cmdFlowSteps"
        class="voice-cmd-flow-band"
        band-class="voice-cmd-flow-band__shell"
        collapsible
        default-collapsed
        toggle-label="流程概览"
        :collapsed-summary="cmdFlowSummary"
      >
        <template #stats>
          <SettingsFlowStat
            :label="'命令数'"
            :value="voiceCommands.length"
            tone="accent"
            val-tone="accent"
          />
        </template>
      </SettingsFlowBand>

      <header class="voice-section__head">
        <div>
          <p class="voice-section__eyebrow">{{ '命令' }}</p>
          <h3 class="voice-section__title">{{ '短语与 HA 服务' }}</h3>
        </div>
        <div class="voice-section__actions">
          <span v-if="voiceCommands.length" class="voice-section__badge">{{
            `${voiceCommands.length} 条`
          }}</span>
          <button
            type="button"
            class="settings-btn-ghost text-[12px]"
            @click="$emit('import-presets', false)"
          >
            {{ '追加导入' }}
          </button>
          <button
            type="button"
            class="settings-btn-ghost text-[12px]"
            @click="$emit('import-presets-replace')"
          >
            {{ '覆盖导入' }}
          </button>
          <button
            type="button"
            class="settings-btn-accent text-[12px]"
            @click="$emit('add-command')"
          >
            <Plus class="w-3.5 h-3.5" /> {{ '添加' }}
          </button>
        </div>
      </header>

      <div v-if="voiceCommands.length" class="voice-cmd-list">
        <article v-for="(cmd, idx) in voiceCommands" :key="idx" class="voice-cmd-card">
          <header class="voice-cmd-card__head">
            <span class="voice-cmd-card__index">{{ idx + 1 }}</span>
            <input
              :value="phrasesText(cmd)"
              type="text"
              class="settings-field voice-cmd-card__phrase"
              :placeholder="'触发短语，逗号分隔'"
              @input="setPhrasesText(cmd, $event.target.value)"
            />
            <span class="voice-cmd-card__service-badge">{{ `${cmd.domain}.${cmd.service}` }}</span>
            <button
              type="button"
              class="voice-cmd-card__delete"
              :title="'删除此命令'"
              :aria-label="'删除此命令'"
              @click="$emit('remove-command', idx)"
            >
              <Trash2 class="w-3.5 h-3.5" />
            </button>
          </header>
          <div class="settings-form-grid voice-cmd-card__grid">
            <div>
              <label class="settings-form-label mb-1">{{ '域' }}</label>
              <HosSelect
                variant="settings"
                block
                trigger-class="font-mono text-xs"
                :value="cmd.domain"
                @change="$emit('domain-change', cmd, $event)"
              >
                <option v-for="d in domainOptionsList" :key="d" :value="d">{{ d }}</option>
              </HosSelect>
            </div>
            <div>
              <label class="settings-form-label mb-1">{{ '服务' }}</label>
              <HosSelect
                variant="settings"
                block
                trigger-class="font-mono text-xs"
                v-model="cmd.service"
                @change="$emit('service-change', cmd)"
              >
                <option v-for="s in servicesForCmd(cmd)" :key="s" :value="s">{{ s }}</option>
              </HosSelect>
            </div>
            <div class="col-span-2">
              <label class="settings-form-label mb-1">{{ '目标设备' }}</label>
              <HosSelect
                variant="settings"
                block
                trigger-class="font-mono text-xs"
                :key="`${idx}-${cmd.domain}`"
                :value="entityScope(cmd)"
                @change="$emit('entity-scope-change', cmd, $event)"
              >
                <option value="all">{{ `全部 ${cmd.domain} 设备` }}</option>
                <option value="specific">{{ '指定实体' }}</option>
              </HosSelect>
              <EntityInput
                v-if="entityScope(cmd) === 'specific'"
                :model-value="entityInputValue(cmd)"
                class="mt-1.5"
                :domain-filter="cmd.domain"
                :placeholder="`选择 ${cmd.domain} 实体`"
                @update:model-value="$emit('entity-input', cmd, $event)"
              />
            </div>
            <div v-if="needsClimateMode(cmd)" class="col-span-2">
              <label class="settings-form-label mb-1">{{ '空调模式' }}</label>
              <HosSelect
                variant="settings"
                block
                trigger-class="font-mono text-xs"
                :value="cmd.serviceData?.hvac_mode || 'cool'"
                @change="$emit('climate-mode', cmd, $event)"
              >
                <option value="cool">{{ '制冷' }}</option>
                <option value="heat">{{ '制热' }}</option>
                <option value="auto">{{ '自动' }}</option>
                <option value="dry">{{ '除湿' }}</option>
                <option value="fan_only">{{ '送风' }}</option>
                <option value="off">{{ '关闭' }}</option>
              </HosSelect>
            </div>
          </div>
        </article>
      </div>
      <div v-else class="settings-premium-empty settings-premium-empty--sky">
        <Mic class="settings-premium-empty__icon" />
        <p class="settings-premium-empty__title">{{ '暂无语音命令' }}</p>
        <p class="settings-premium-empty__desc">
          {{ '使用「覆盖导入」载入全屋模板，或手动添加短语映射' }}
        </p>
        <div class="settings-premium-empty__actions">
          <button
            type="button"
            class="settings-premium-empty__btn settings-premium-empty__btn--accent"
            @click="$emit('add-command')"
          >
            <Plus class="w-3.5 h-3.5" />
            {{ '添加命令' }}
          </button>
          <button
            type="button"
            class="settings-premium-empty__btn"
            @click="$emit('import-presets-replace')"
          >
            {{ '覆盖导入模板' }}
          </button>
        </div>
      </div>

      <p class="settings-note-callout settings-note-callout--sky mt-2.5">
        <span class="settings-note-callout__label">{{ '提示' }}</span>
        <span>{{
          '「开灯」控制全屋；「客厅开灯」按房间关键词匹配。启用 HA Assistant 后优先由 Assistant 理解。'
        }}</span>
      </p>
    </SettingsCard>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import HosSelect from '@/components/common/base/HosSelect.vue'
import { Plus, Trash2, Mic, MessageSquare, Server, Target, Sparkles, Monitor } from '@lucide/vue'
import SettingsCard from '@/components/common/page-shell/SettingsCard.vue'
import SettingsFlowBand from '@/views/settings/shared/layout/SettingsFlowBand.vue'
import SettingsFlowStat from '@/views/settings/shared/layout/SettingsFlowStat.vue'
import EntityInput from '@/components/common/EntityInput.vue'

const voiceCommands = defineModel('voiceCommands', { type: Array, default: () => [] })

defineProps({
  domainOptionsList: { type: Array, default: () => [] },
  phrasesText: { type: Function, required: true },
  setPhrasesText: { type: Function, required: true },
  servicesForCmd: { type: Function, required: true },
  entityScope: { type: Function, required: true },
  entityInputValue: { type: Function, required: true },
  needsClimateMode: { type: Function, required: true },
})

defineEmits([
  'import-presets',
  'import-presets-replace',
  'add-command',
  'remove-command',
  'domain-change',
  'service-change',
  'entity-scope-change',
  'entity-input',
  'climate-mode',
])

const cmdFlowSummary = computed(() => `${voiceCommands.value.length} 条命令`)

const cmdFlowSteps = computed(() => [
  { label: '触发短语', meta: `${voiceCommands.value.length} 条`, icon: MessageSquare, tone: 'in' },
  { label: '域/服务', meta: 'domain.service', icon: Server, tone: 'sky' },
  { label: '目标实体', meta: 'scope/entity', icon: Target, tone: 'mid' },
  { label: 'Assist 优先', meta: 'conversation.process', icon: Sparkles, tone: 'exec' },
  { label: '大屏', meta: '侧栏语音', icon: Monitor, tone: 'out' },
])
</script>

<style scoped src="./styles/SettingsVoiceCommandsSection.css"></style>
