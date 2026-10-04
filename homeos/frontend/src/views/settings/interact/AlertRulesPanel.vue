<!--
组件：AlertRulesPanel.vue
所属模块：frontend / src / views / settings / interact
职责：告警规则面板入口。通过子导航切换 inbox（应用内规则收件箱+编辑弹窗）、voice（语音告警）、
      earthquake（地震预警）、dnd（免打扰）四个区段，页头按区段提供不同保存动作。
      编辑弹窗支持单条件/组合 AND-OR/高级 DSL 三种触发模式与多渠道推送。
关键依赖：
  - SettingsPageShell / SettingsHubSubnav / SettingsPendingSaveAction：页面骨架/子导航/保存条
  - AlertRulesInboxSection / AlertRulesVoiceSection / AlertRulesEarthquakeSection / AlertRulesDndSection：四个子区段
  - useAlertRulesPanel：聚合编辑/保存/各类待保存计数
  - useRegisterSettingsTabPending / useSettingsSidebarReentryReset：Tab 离开拦截与重入重置
  - ALERT_RULES_KEY：通过 provide/inject 向子区段共享状态
数据来源：useAlertRulesPanel() 返回的 editing / voice / 各类待保存状态
-->
<template>
  <SettingsPageShell
    :active-tab="activeTab"
    tab="alerts"
    icon-key="bell"
    accent="var(--module-accent-automation)"
    layout="single"
    page-class="alert-hub"
    body-class="alert-hub__body"
  >
    <template #actions>
      <button
        v-if="alertSection === 'inbox' && !editing"
        class="settings-btn-accent"
        :disabled="!isAdmin"
        @click="openCreate"
      >
        {{ '新建规则' }}
      </button>
      <button
        v-else-if="alertSection === 'inbox' && editing && editingDirty"
        type="button"
        class="settings-btn-ghost"
        @click="cancelEditingChanges"
      >
        {{ '取消修改' }}
      </button>
      <SettingsPendingSaveAction
        v-else-if="alertSection === 'voice'"
        :pending="voiceAlertsPending"
        :saving="voiceSaving"
        save-text="保存语音告警"
        @save="onSaveVoiceAlerts"
        @cancel="cancelVoiceAlerts"
      />
      <SettingsPendingSaveAction
        v-else-if="alertSection === 'dnd'"
        :pending="dndDirty ? 1 : 0"
        :saving="dndSaving"
        save-text="保存免打扰"
        @save="saveDnd"
        @cancel="cancelDndChanges"
      />
      <SettingsPendingSaveAction
        v-else-if="alertSection === 'earthquake'"
        :pending="earthquakePending"
        :saving="earthquakeSaving"
        :save-text="earthquakePending > 0 ? '保存地震预警' : '已保存'"
        saving-text="保存中…"
        :pending-label="earthquakePendingLabel"
        @save="saveEarthquake"
        @cancel="cancelEarthquakeChanges"
      />
    </template>

    <template #subnav>
      <SettingsHubSubnav v-model="alertSection" :sections="alertSubnavSections" />
    </template>

    <p
      v-if="voiceSaveTip"
      :class="['text-xs px-1', voiceSaveTip.includes('失败') ? 'text-danger' : 'text-success']"
    >
      {{ voiceSaveTip }}
    </p>

    <AlertRulesInboxSection v-show="alertSection === 'inbox'" />
    <AlertRulesVoiceSection v-show="alertSection === 'voice'" />
    <AlertRulesEarthquakeSection v-show="alertSection === 'earthquake'" />
    <AlertRulesDndSection v-show="alertSection === 'dnd'" />

    <template #overlay>
      <div v-if="editing" class="settings-modal-overlay" @click.self="closeEditing">
        <div class="settings-modal-panel alert-edit-modal">
          <header class="alert-edit-modal__head">
            <div>
              <p class="alert-edit-modal__eyebrow">{{ editing.id ? '编辑规则' : '新建规则' }}</p>
              <h3 class="alert-edit-modal__title">
                {{ editing.id ? '编辑应用内规则' : '新建应用内规则' }}
              </h3>
            </div>
            <span
              :class="[
                'alert-edit-modal__level',
                `alert-edit-modal__level--${editing.level || 'info'}`,
              ]"
              >{{ editing.level || 'info' }}</span
            >
          </header>

          <div class="alert-edit-modal__body">
            <section class="alert-edit-section alert-edit-section--presets">
              <h4 class="alert-edit-section__title">{{ '常用场景模板' }}</h4>
              <div class="alert-preset-row">
                <button
                  v-for="preset in alertRulePresets"
                  :key="preset.id"
                  type="button"
                  class="alert-preset-chip"
                  :title="preset.description"
                  @click="applyQuickTemplate(preset)"
                >
                  {{ preset.label }}
                </button>
                <span class="alert-preset-chip alert-preset-chip--custom">{{ '自定义规则' }}</span>
              </div>
              <p class="alert-edit-hint">
                {{ ALERT_PRESET_HINT }}
              </p>
              <p class="alert-edit-hint alert-preset-link-hint">
                {{ ALERT_DOORBELL_LINK_HINT }}
              </p>
            </section>

            <section class="alert-edit-section alert-edit-section--basic">
              <h4 class="alert-edit-section__title">{{ '基本信息' }}</h4>
              <div class="alert-edit-fields">
                <label class="alert-edit-field">
                  <span class="alert-edit-field__label">{{ '规则名称' }}</span>
                  <input v-model="editing.name" :placeholder="'规则名称'" class="settings-field" />
                </label>
                <label class="alert-edit-field">
                  <span class="alert-edit-field__label">{{ '目标实体' }}</span>
                  <EntityInput v-model="editing.entityId" :placeholder="'实体（留空=任意）'" />
                </label>
                <label class="alert-edit-field alert-edit-field--span">
                  <span class="alert-edit-field__label">{{ '消息模板（可选）' }}</span>
                  <input
                    v-model="editing.messageTemplate"
                    :placeholder="ALERT_TEMPLATE_PLACEHOLDER"
                    class="settings-field font-mono text-xs"
                  />
                </label>
              </div>
              <div class="alert-edit-var-row">
                <p class="alert-edit-hint">{{ ALERT_TEMPLATE_HINT }}</p>
                <button
                  v-for="item in alertTemplateVariables"
                  :key="item.key"
                  type="button"
                  class="alert-var-chip"
                  :title="item.hint"
                  @click="insertTemplateVar(item.key)"
                >
                  {{ item.key }}
                </button>
              </div>
            </section>

            <section class="alert-edit-section alert-edit-section--notify">
              <h4 class="alert-edit-section__title">{{ '通知选项' }}</h4>
              <div class="alert-edit-fields alert-edit-fields--notify">
                <label class="alert-edit-field">
                  <span class="alert-edit-field__label">{{ '告警级别' }}</span>
                  <HosSelect variant="settings" block v-model="editing.level">
                    <option value="info">{{ 'info · 信息' }}</option>
                    <option value="warn">{{ 'warn · 警告' }}</option>
                    <option value="danger">{{ 'danger · 危险' }}</option>
                  </HosSelect>
                </label>
                <label class="alert-edit-field">
                  <span class="alert-edit-field__label">{{ '冷却周期' }}</span>
                  <div class="alert-edit-inline">
                    <input
                      v-model.number="cooldownDisplay"
                      type="number"
                      min="0"
                      step="any"
                      :placeholder="'冷却时长'"
                      class="settings-field flex-1"
                    />
                    <HosSelect
                      variant="settings"
                      block
                      class="flex-1 min-w-0"
                      :model-value="cooldownUnit"
                      @update:model-value="setCooldownUnit($event)"
                    >
                      <option value="minute">{{ '分钟' }}</option>
                      <option value="hour">{{ '小时' }}</option>
                    </HosSelect>
                  </div>
                </label>
                <label class="alert-edit-field alert-edit-field--span">
                  <span class="alert-edit-field__label">{{ '推送标题（可选）' }}</span>
                  <input
                    v-model="editing.title"
                    :placeholder="'留空时使用系统默认标题'"
                    class="settings-field"
                  />
                </label>
              </div>
              <p class="alert-edit-hint">{{ ALERT_COOLDOWN_HINT }}</p>
              <p class="alert-edit-hint">{{ ALERT_TITLE_HINT }}</p>
              <label class="settings-check-row alert-edit-enable">
                <input v-model="editing.enabled" type="checkbox" class="settings-checkbox" />
                <span>启用此规则</span>
              </label>
              <div class="alert-edit-channels">
                <span class="alert-edit-field__label">推送渠道</span>
                <div class="alert-edit-channels__chips">
                  <button
                    v-for="ch in ALERT_CHANNEL_OPTIONS"
                    :key="ch.id"
                    type="button"
                    class="alert-edit-channel"
                    :class="{ 'alert-edit-channel--on': (editing.channels || []).includes(ch.id) }"
                    :aria-pressed="(editing.channels || []).includes(ch.id)"
                    @click="toggleAlertChannel(ch.id)"
                  >
                    {{ ch.label }}
                  </button>
                </div>
                <p class="alert-edit-hint">
                  默认写入通知中心；勾选后额外推送到 Email / WebPush / 企业微信（需在智能管家 · 消息通道配置）。
                </p>
              </div>
            </section>

            <section class="alert-edit-section alert-edit-section--trigger">
              <h4 class="alert-edit-section__title">{{ '触发条件' }}</h4>
            <div class="alert-edit-modes">
              <button
                type="button"
                :class="[
                  'alert-edit-mode',
                  editing.conditionMode === 'visual' && 'alert-edit-mode--active',
                ]"
                @click="setConditionMode('visual')"
              >
                {{ '单条件' }}
              </button>
              <button
                type="button"
                :class="[
                  'alert-edit-mode',
                  editing.conditionMode === 'compound' && 'alert-edit-mode--active',
                ]"
                @click="setConditionMode('compound')"
              >
                {{ '组合 AND/OR' }}
              </button>
              <button
                type="button"
                :class="[
                  'alert-edit-mode',
                  editing.conditionMode === 'raw' && 'alert-edit-mode--active',
                ]"
                @click="editing.conditionMode = 'raw'"
              >
                {{ '高级 DSL' }}
              </button>
            </div>

            <template v-if="editing.conditionMode === 'compound'">
              <div v-for="(clause, idx) in editing.clauses" :key="idx" class="alert-edit-clause">
                <div class="alert-edit-clause__head">
                  <span class="alert-edit-clause__index">{{ idx + 1 }}</span>
                  <span class="alert-edit-clause__label">{{
                    idx === 0 ? '首条条件' : '追加条件'
                  }}</span>
                  <button
                    v-if="editing.clauses.length > 1"
                    type="button"
                    class="alert-edit-clause__remove"
                    aria-label="移除条件"
                    @click="removeClause(idx)"
                  >
                    {{ '移除' }}
                  </button>
                </div>
                <div v-if="idx > 0" class="alert-edit-field">
                  <span class="alert-edit-field__label">{{ '与上一条件' }}</span>
                  <HosSelect
                    variant="settings"
                    block
                    v-model="clause.join"
                    @change="syncConditionFromVisual"
                  >
                    <option value="&&">{{ 'AND（且）' }}</option>
                    <option value="||">{{ 'OR（或）' }}</option>
                  </HosSelect>
                </div>
                <div class="alert-edit-visual">
                <HosSelect
                  variant="settings"
                  block
                  v-model="clause.condType"
                  @change="syncClause(clause)"
                >
                  <option value="state">{{ '状态等于' }}</option>
                  <option value="contains">{{ '状态包含' }}</option>
                  <option value="numeric">{{ '数值比较' }}</option>
                  <option value="attr">{{ '属性比较' }}</option>
                </HosSelect>
                <template v-if="clause.condType === 'state'">
                  <input
                    v-model="clause.condValue"
                    :placeholder="'期望状态'"
                    class="settings-field"
                    @input="syncClause(clause)"
                  />
                </template>
                <template v-else-if="clause.condType === 'contains'">
                  <input
                    v-model="clause.condValue"
                    :placeholder="'包含文字，如 motion'"
                    class="settings-field"
                    @input="syncClause(clause)"
                  />
                </template>
                <template v-else-if="clause.condType === 'numeric'">
                  <div class="alert-edit-inline">
                    <HosSelect
                      variant="settings"
                      block
                      class="flex-1 min-w-0"
                      v-model="clause.condOp"
                      @change="syncClause(clause)"
                    >
                      <option value="==">=</option>
                      <option value="!=">≠</option>
                      <option value=">">&gt;</option>
                      <option value=">=">≥</option>
                      <option value="<">&lt;</option>
                      <option value="<=">≤</option>
                    </HosSelect>
                    <input
                      v-model="clause.condValue"
                      type="number"
                      class="settings-field flex-1"
                      @input="syncClause(clause)"
                    />
                  </div>
                </template>
                <template v-else>
                  <input
                    v-model="clause.condAttr"
                    :placeholder="'属性名'"
                    class="settings-field"
                    @input="syncClause(clause)"
                  />
                  <div class="alert-edit-inline alert-edit-inline--span">
                    <HosSelect
                      variant="settings"
                      block
                      class="flex-1 min-w-0"
                      v-model="clause.condOp"
                      @change="syncClause(clause)"
                    >
                      <option value="==">=</option>
                      <option value="!=">≠</option>
                      <option value=">">&gt;</option>
                      <option value=">=">≥</option>
                      <option value="<">&lt;</option>
                      <option value="<=">≤</option>
                      <option value="contains">{{ '包含' }}</option>
                    </HosSelect>
                    <input
                      v-model="clause.condValue"
                      class="settings-field flex-1"
                      @input="syncClause(clause)"
                    />
                  </div>
                </template>
                </div>
              </div>
              <button
                type="button"
                class="settings-btn-ghost text-xs"
                aria-label="添加条件"
                @click="addClause"
              >
                {{ '+ 添加条件' }}
              </button>
              <p class="alert-edit-dsl">
                {{ '生成条件：' }}<code>{{ editing.condition }}</code>
              </p>
            </template>
            <template v-else-if="editing.conditionMode !== 'raw'">
              <div class="alert-edit-visual">
                <HosSelect
                  variant="settings"
                  block
                  v-model="editing.condType"
                  @change="syncConditionFromVisual"
                >
                  <option value="state">{{ '状态等于' }}</option>
                  <option value="contains">{{ '状态包含' }}</option>
                  <option value="numeric">{{ '数值比较' }}</option>
                  <option value="attr">{{ '属性比较' }}</option>
                </HosSelect>
                <template v-if="editing.condType === 'state'">
                  <input
                    v-model="editing.condValue"
                    :placeholder="'期望状态，如 on / off'"
                    class="settings-field"
                    @input="syncConditionFromVisual"
                  />
                </template>
                <template v-else-if="editing.condType === 'contains'">
                  <input
                    v-model="editing.condValue"
                    :placeholder="'包含文字，如 motion'"
                    class="settings-field"
                    @input="syncConditionFromVisual"
                  />
                </template>
                <template v-else-if="editing.condType === 'numeric'">
                  <div class="alert-edit-inline">
                    <HosSelect
                      variant="settings"
                      block
                      class="flex-1 min-w-0"
                      v-model="editing.condOp"
                      @change="syncConditionFromVisual"
                    >
                      <option value="==">=</option>
                      <option value="!=">≠</option>
                      <option value=">">&gt;</option>
                      <option value=">=">≥</option>
                      <option value="<">&lt;</option>
                      <option value="<=">≤</option>
                    </HosSelect>
                    <input
                      v-model="editing.condValue"
                      type="number"
                      class="settings-field flex-1"
                      @input="syncConditionFromVisual"
                    />
                  </div>
                </template>
                <template v-else>
                  <input
                    v-model="editing.condAttr"
                    :placeholder="'属性名'"
                    class="settings-field"
                    @input="syncConditionFromVisual"
                  />
                  <div class="alert-edit-inline alert-edit-inline--span">
                    <HosSelect
                      variant="settings"
                      block
                      class="flex-1 min-w-0"
                      v-model="editing.condOp"
                      @change="syncConditionFromVisual"
                    >
                      <option value="==">=</option>
                      <option value="!=">≠</option>
                      <option value=">">&gt;</option>
                      <option value=">=">≥</option>
                      <option value="<">&lt;</option>
                      <option value="<=">≤</option>
                      <option value="contains">{{ '包含' }}</option>
                    </HosSelect>
                    <input
                      v-model="editing.condValue"
                      class="settings-field flex-1"
                      @input="syncConditionFromVisual"
                    />
                  </div>
                </template>
              </div>
              <p class="alert-edit-dsl">
                {{ '生成条件：' }}<code>{{ editing.condition }}</code>
              </p>
            </template>
            <input
              v-else
              v-model="editing.condition"
              :placeholder="'条件 DSL'"
              class="settings-field font-mono text-xs"
            />
          </section>
          </div>

          <div class="settings-modal-actions alert-edit-modal__actions">
            <button type="button" class="settings-modal-btn-cancel" @click="closeEditing">
              {{ '取消' }}
            </button>
            <button type="button" class="settings-btn-accent alert-edit-modal__save" @click="saveRule">
              {{ '保存' }}
            </button>
          </div>
        </div>
      </div>
    </template>
  </SettingsPageShell>
</template>

<script setup>
import HosSelect from '@/components/common/base/HosSelect.vue'
import { toRef, ref, watch, computed, provide } from 'vue'
import SettingsPageShell from '@/components/common/page-shell/SettingsPageShell.vue'
import SettingsHubSubnav from '@/views/settings/shared/layout/SettingsHubSubnav.vue'
import SettingsPendingSaveAction from '@/views/settings/shared/SettingsPendingSaveAction.vue'
import EntityInput from '@/components/common/EntityInput.vue'
import { useAlertRulesPanel } from '@/composables/settings/interact/alert-rules.internals'
import { useRegisterSettingsTabPending } from '@/composables/settings/pending.internals'
import { useSettingsSidebarReentryReset } from '@/composables/ui/hub-viewport.internals'
import AlertRulesInboxSection from './alert-rules/AlertRulesInboxSection.vue'
import AlertRulesVoiceSection from './alert-rules/AlertRulesVoiceSection.vue'
import AlertRulesDndSection from './alert-rules/AlertRulesDndSection.vue'
import AlertRulesEarthquakeSection from './alert-rules/AlertRulesEarthquakeSection.vue'
import { ALERT_RULES_KEY } from './alert-rules/context'

// 入参：当前激活的 Tab id
const props = defineProps({ activeTab: { type: String, default: '' } })

// 推送渠道选项：Email / WebPush / 企业微信
const ALERT_CHANNEL_OPTIONS = [
  { id: 'email', label: 'Email' },
  { id: 'webpush', label: 'WebPush' },
  { id: 'wecom', label: '企业微信' },
]

// 场景模板提示：点击 chip 一键填充编辑表单
const ALERT_PRESET_HINT =
  '点击模板即填充名称 / 实体 / 条件 / 冷却 / 消息模板；套用后请按自家实体 ID 微调。'

// 消息模板占位提示与可用变量说明（变量插值语法由后端 {{key}} 解析）
const ALERT_TEMPLATE_PLACEHOLDER = '如：{{name}} 变为 {{state}}'
const ALERT_TEMPLATE_HINT = '支持 {{state}} {{val}} {{name}} {{unit}} 变量，点击插入：'

// 外部推送标题说明：Email 主题 / WebPush 通知标题 / 企业微信标题
const ALERT_TITLE_HINT =
  '用于 Email 主题与 WebPush / 企业微信通知标题；留空时分别使用系统默认标题。'

// 冷却周期说明：分钟级用于高频传感器，小时级用于低电量等慢变化场景
const ALERT_COOLDOWN_HINT = '冷却期内同规则不重复推送；填 0 表示不限制（如门铃等事件型规则）。'

// 门铃联动提示：说明模板触发后的实时画面联动能力（窄屏下需保持横向折行）
const ALERT_DOORBELL_LINK_HINT =
  '门铃模板触发后可联动摄像头查看实时画面；配置了门锁实体时，弹窗内支持一键开门。'

// 切换编辑规则中的推送渠道勾选状态
function toggleAlertChannel(id) {
  if (!editing.value) return
  const list = Array.isArray(editing.value.channels) ? [...editing.value.channels] : []
  const i = list.indexOf(id)
  if (i >= 0) list.splice(i, 1)
  else list.push(id)
  editing.value.channels = list
}


// 告警规则面板 composable：聚合编辑/保存/各类待保存计数
const panel = useAlertRulesPanel(toRef(props, 'activeTab'))
const {
  alertSection,
  alertSubnavSections,
  editing,
  editingDirty,
  isAdmin,
  voiceAlertsPending,
  voiceSaving,
  voiceSaveTip,
  dndSaving,
  dndDirty,
  hasPendingChanges,
  earthquakePending,
  earthquakePendingLabel,
  earthquakeSaving,
  saveEarthquake,
  cancelEarthquakeChanges,
  cancelDndChanges,
  cancelVoiceAlerts,
  alertRuleGroups,
  voice,
  openCreate,
  saveDnd,
  onSaveVoiceAlerts,
  saveRule,
  closeEditing,
  cancelEditingChanges,
  setConditionMode,
  syncConditionFromVisual,
  syncClause,
  addClause,
  removeClause,
  alertRulePresets,
  alertTemplateVariables,
  cooldownUnit,
  cooldownDisplay,
  setCooldownUnit,
  applyQuickTemplate,
  insertTemplateVar,
} = panel

useRegisterSettingsTabPending('alerts', () => hasPendingChanges.value)

// 语音告警/免打扰/自定义播报的当前子 Tab
const alertVoiceTab = ref('security')
const alertDndTab = ref('schedule')
const alertCustomSubTab = ref('entity')

// 自定义语音规则总数（实体播报 + 通知播报）
const customVoiceRuleCount = computed(
  () => (voice.value.entityTtsAlerts?.length || 0) + (voice.value.customTtsAlerts?.length || 0),
)

// 语音告警 Tab 元信息（emoji + 强调色）
const ALERT_VOICE_TAB_META = {
  security: { emoji: '🛡️', accent: 'var(--set-info)' },
  life: { emoji: '🌿', accent: 'var(--set-success)' },
  notify: { emoji: '🔔', accent: 'var(--page-accent)' },
  custom: { emoji: '✨', accent: 'var(--module-accent-automation-sub)' },
}

// 语音告警 Tab 列表：规则分组 + 自定义 Tab
const alertVoiceTabs = computed(() => [
  ...alertRuleGroups.value.map((g) => {
    const meta = ALERT_VOICE_TAB_META[g.id] || ALERT_VOICE_TAB_META.notify
    return {
      id: g.id,
      label: g.label,
      emoji: meta.emoji,
      count: g.items.length,
      accent: meta.accent,
    }
  }),
  {
    id: 'custom',
    label: '自定义',
    emoji: ALERT_VOICE_TAB_META.custom.emoji,
    count: customVoiceRuleCount.value || undefined,
    accent: ALERT_VOICE_TAB_META.custom.accent,
  },
])

const alertCustomSubTabs = computed(() => [
  {
    id: 'entity',
    label: '实体播报',
    emoji: '📍',
    count: voice.value.entityTtsAlerts?.length || undefined,
    accent: 'var(--module-accent-automation-sub)',
  },
  {
    id: 'notify',
    label: '通知播报',
    emoji: '🔔',
    count: voice.value.customTtsAlerts?.length || undefined,
    accent: 'var(--page-accent)',
  },
])

// 免打扰子 Tab：静默时段 / 影响说明
const alertDndTabs = [
  { id: 'schedule', label: '静默时段', emoji: '🌙', accent: 'var(--module-accent-automation-sub)' },
  { id: 'impact', label: '影响说明', emoji: '💡', accent: 'var(--page-accent)' },
]

/** 进入语音页签时可选子 Tab（避免 watch 把 custom 重置回 security） */
let voiceSectionIntent = null

// 跳转语音区段并指定子 Tab
function openVoiceSection({ voiceTab = 'security', customSubTab = 'entity' } = {}) {
  voiceSectionIntent = { voiceTab, customSubTab }
  alertSection.value = 'voice'
}

// 跳转到自定义语音 → 实体播报子 Tab
function openVoiceEntityTts() {
  openVoiceSection({ voiceTab: 'custom', customSubTab: 'entity' })
}

// 通过 provide 向子区段共享面板状态与子 Tab
provide(ALERT_RULES_KEY, {
  ...panel,
  alertVoiceTab,
  alertDndTab,
  alertVoiceTabs,
  alertDndTabs,
  alertCustomSubTab,
  alertCustomSubTabs,
  openVoiceSection,
  openVoiceEntityTts,
})

// 切换区段时重置子 Tab（语音/免打扰），保留 voiceSectionIntent 指定的子 Tab
watch(alertSection, (sec) => {
  if (sec === 'voice') {
    if (voiceSectionIntent) {
      alertVoiceTab.value = voiceSectionIntent.voiceTab
      alertCustomSubTab.value = voiceSectionIntent.customSubTab
      voiceSectionIntent = null
    } else {
      alertVoiceTab.value = 'security'
      alertCustomSubTab.value = 'entity'
    }
    return
  }
  if (sec === 'dnd') {
    alertDndTab.value = 'schedule'
  }
})

// 重入 alerts Tab 时重置所有子 Tab
function resetAlertsHubTabs() {
  alertSection.value = 'inbox'
  alertVoiceTab.value = 'security'
  alertDndTab.value = 'schedule'
  alertCustomSubTab.value = 'entity'
}

useSettingsSidebarReentryReset(() => props.activeTab, 'alerts', resetAlertsHubTabs)
</script>

<style scoped src="./alert-rules/styles/alert-rules.css"></style>
