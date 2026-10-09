<!--
组件：SettingsBindingsAccountSection.vue
所属模块：frontend / src / views / settings / connect / bindings
职责：能源账户绑定分区。按数据源模式（约定命名/综合实体/多实体）展示对应账户编辑器与
      字段映射，提供从实体推断字段、填充默认属性等操作，并以流程概览展示绑定状态。
关键依赖：
  - AccountListEditor / EntityAccountListEditor / MultiAccountListEditor
  - useBindingsAccountSection：派生编辑索引、激活源与字段映射
  - SettingsFlowBand / SettingsOrchTabs / EntityInput
数据来源：父级透传的 categoryTabs/modeOptions/字段元信息 + composable 派生
-->
<template>
  <div class="settings-hub-section bind-energy-hub">
    <SettingsCard static>
      <SettingsFlowBand
        :steps="accountFlowSteps"
        class="bind-account-flow"
        band-class="bind-account-flow-band"
        collapsible
        default-collapsed
        toggle-label="流程概览"
        :collapsed-summary="accountFlowSummary"
      >
        <template #stats>
          <SettingsFlowStat
            :label="'绑定状态'"
            :value="isConfigured ? '已配置' : '未配置'"
            :tone="isConfigured ? 'emerald' : 'amber'"
            :val-tone="isConfigured ? 'emerald' : 'amber'"
          />
          <SettingsFlowStat
            :label="'数据源'"
            :value="activeMeta?.label || categoryTab"
            tone="sky"
            val-tone="sky"
          />
        </template>
      </SettingsFlowBand>

      <div class="bind-energy-dock">
        <SettingsOrchTabs v-model="categoryTab" :tabs="categoryTabs" plain />
      </div>

      <div v-if="activeSource" :key="categoryTab" class="bind-energy-panel">
        <div :class="['bind-energy-status', isConfigured && 'bind-energy-status--bound']">
          <component :is="isConfigured ? Zap : Gauge" class="bind-energy-status__icon" />
          <div class="bind-energy-status__copy">
            <span class="bind-energy-status__title">
              {{ isConfigured ? '已配置数据源' : '尚未配置' }}
            </span>
            <span class="bind-energy-status__meta"
              >{{ activeModeLabel }} · {{ activeMeta?.label || categoryTab }}</span
            >
          </div>
        </div>

        <header class="bind-section__head">
          <div>
            <p class="bind-section__eyebrow">{{ '绑定方式' }}</p>
            <h3 class="bind-section__title">{{ '数据源模式' }}</h3>
          </div>
        </header>

        <div class="bind-energy-modes">
          <button
            v-for="mode in modeOptions"
            :key="mode.id"
            type="button"
            :class="[
              'bind-energy-mode',
              activeSource.mode === mode.id && 'bind-energy-mode--active',
            ]"
            @click="$emit('set-binding-mode', mode.id)"
          >
            {{ mode.label }}
          </button>
        </div>

        <template v-if="activeSource.mode === 'convention'">
          <AccountListEditor
            :source="activeSource"
            :account-label="activeMeta.accountLabel"
            :number-placeholder="activeMeta.placeholder"
            :label-class="activeMeta.labelClass"
            :prefix-class="activeMeta.prefixClass"
            :prefix="activeMeta.prefix"
          />
        </template>

        <template v-else-if="activeSource.mode === 'entity'">
          <section class="bind-account-stage bind-account-stage--entity">
            <EntityAccountListEditor
              :source="activeSource"
              :account-label="activeMeta.accountLabel + '（综合实体）'"
            />

            <div v-if="entityAccountEditTabs.length > 1" class="bind-account-stage__tabs">
              <p class="bind-account-stage__tabs-label">{{ '推断字段映射' }}</p>
              <SettingsOrchTabs v-model="editingEntityAccountKey" :tabs="entityAccountEditTabs" />
            </div>

            <article class="bind-account-mapping">
              <header class="bind-account-mapping__head">
                <div class="bind-account-mapping__head-main">
                  <div class="bind-account-mapping__orb" aria-hidden="true">
                    <Layers class="bind-account-mapping__orb-icon" />
                  </div>
                  <div class="bind-account-mapping__copy">
                    <h4 class="bind-account-mapping__title">{{ '字段 → 属性映射' }}</h4>
                    <p class="bind-account-mapping__desc">
                      {{ '综合实体的 state 作为余额/主读数；其余字段从 attributes 按映射读取。' }}
                    </p>
                  </div>
                </div>
                <div class="bind-account-mapping__actions">
                  <button
                    type="button"
                    class="bind-account-action bind-account-action--ghost"
                    @click="$emit('fill-default-attrs')"
                  >
                    <ListTree class="bind-account-action__icon" aria-hidden="true" />
                    <span>{{ '填充默认属性名' }}</span>
                  </button>
                  <button
                    type="button"
                    class="bind-account-action bind-account-action--primary"
                    :disabled="!activeEntityAccountRow.entityId?.trim()"
                    @click="$emit('infer-from-entity', 'entity', editingEntityAccountIndex)"
                  >
                    <Sparkles class="bind-account-action__icon" aria-hidden="true" />
                    <span>{{
                      entityAccountEditTabs.length > 1 ? '从选中账户推断' : '从实体推断'
                    }}</span>
                  </button>
                </div>
              </header>

              <div class="bind-account-mapping__grid bind-env-sensor-grid">
                <div
                  v-for="field in activeMappableFields"
                  :key="field.key"
                  class="bind-env-sensor-cell bind-account-field"
                >
                  <label class="bind-account-field__label">
                    {{ field.label }}
                    <span v-if="field.unit" class="bind-account-field__unit">({{ field.unit }})</span>
                  </label>
                  <input
                    v-model="activeSource.attrMap[field.key]"
                    type="text"
                    class="settings-field bind-account-field__input"
                    :placeholder="field.defaultAttr"
                    :list="`binding-attr-${categoryTab}-${field.key}`"
                  />
                  <datalist :id="`binding-attr-${categoryTab}-${field.key}`">
                    <option v-for="attr in compositeEntityAttrsForEdit" :key="attr" :value="attr" />
                  </datalist>
                </div>
              </div>

              <div v-if="activeChartFields.length" class="bind-account-mapping__chart">
                <p class="bind-account-mapping__chart-label">{{ '图表数据属性（可选）' }}</p>
                <div class="bind-account-mapping__grid bind-env-sensor-grid">
                  <div
                    v-for="field in activeChartFields"
                    :key="field.key"
                    class="bind-env-sensor-cell bind-account-field"
                  >
                    <label class="bind-account-field__label">{{ field.label }}</label>
                    <input
                      v-model="activeSource.attrMap[field.key]"
                      type="text"
                      class="settings-field bind-account-field__input"
                      :placeholder="field.defaultAttr"
                      :list="`binding-chart-${categoryTab}-${field.key}`"
                    />
                    <datalist :id="`binding-chart-${categoryTab}-${field.key}`">
                      <option v-for="attr in compositeEntityAttrsForEdit" :key="attr" :value="attr" />
                    </datalist>
                  </div>
                </div>
              </div>
            </article>
          </section>
        </template>

        <template v-else>
          <section class="bind-account-stage bind-account-stage--multi">
            <MultiAccountListEditor
              :source="activeSource"
              :account-label="activeMeta.accountLabel + '（多实体）'"
            />

            <div v-if="multiAccountEditTabs.length > 1" class="bind-account-stage__tabs">
              <p class="bind-account-stage__tabs-label">{{ '编辑字段映射' }}</p>
              <SettingsOrchTabs v-model="editingMultiAccountKey" :tabs="multiAccountEditTabs" />
            </div>

            <article class="bind-account-anchor-card">
              <header class="bind-account-anchor-card__head">
                <div class="bind-account-anchor-card__orb" aria-hidden="true">
                  <Anchor class="bind-account-anchor-card__orb-icon" />
                </div>
                <div class="bind-account-anchor-card__copy">
                  <h4 class="bind-account-anchor-card__title">{{ '锚点实体' }}</h4>
                  <p class="bind-account-anchor-card__desc">
                    {{
                      multiAccountEditTabs.length > 1
                        ? `正在为「${activeMultiAccountLabel}」配置各字段对应的传感器实体`
                        : '指定余额/主传感器作为锚点，可一键推断同设备兄弟传感器。'
                    }}
                  </p>
                </div>
              </header>
              <div class="bind-account-anchor-card__row">
                <EntityInput
                  v-model="activeMultiAccountRow.entityId"
                  :placeholder="'sensor.gas_1234_balance'"
                  domain-filter="sensor"
                  wrapper-class="bind-account-anchor-card__input"
                  @update:model-value="syncMultiFromUi"
                />
                <button
                  type="button"
                  class="bind-account-action bind-account-action--primary bind-account-action--infer"
                  :disabled="!activeMultiAccountRow.entityId?.trim()"
                  @click="$emit('infer-from-entity', 'multi', editingMultiAccountIndex)"
                >
                  <Sparkles class="bind-account-action__icon" aria-hidden="true" />
                  <span>{{ '推断兄弟传感器' }}</span>
                  <ArrowRight class="bind-account-action__arrow" aria-hidden="true" />
                </button>
              </div>
            </article>

            <article class="bind-account-mapping bind-account-mapping--multi">
              <header class="bind-account-mapping__head bind-account-mapping__head--compact">
                <div class="bind-account-mapping__head-main">
                  <div class="bind-account-mapping__orb bind-account-mapping__orb--sky" aria-hidden="true">
                    <GitBranch class="bind-account-mapping__orb-icon" />
                  </div>
                  <div class="bind-account-mapping__copy">
                    <h4 class="bind-account-mapping__title">{{ '字段 → 传感器映射' }}</h4>
                    <p class="bind-account-mapping__desc">
                      {{ '为每个逻辑字段指定独立的 HA 传感器实体；留空则跳过该项。' }}
                    </p>
                  </div>
                </div>
              </header>

              <div class="bind-account-mapping__grid bind-env-sensor-grid">
                <div
                  v-for="field in activeMappableFields"
                  :key="field.key"
                  class="bind-env-sensor-cell bind-account-field"
                >
                  <label class="bind-account-field__label">
                    {{ field.label }}
                    <span v-if="field.unit" class="bind-account-field__unit">({{ field.unit }})</span>
                  </label>
                  <EntityInput
                    v-model="activeMultiAccountRow.entityMap[field.key]"
                    :placeholder="`sensor.${field.key}`"
                    domain-filter="sensor"
                    wrapper-class="bind-account-field__entity"
                    @update:model-value="syncMultiFromUi"
                  />
                </div>
              </div>
            </article>
          </section>
        </template>
      </div>
    </SettingsCard>
  </div>
</template>

<script setup>
import { computed, toRef } from 'vue'
import { Anchor, ArrowRight, Gauge, GitBranch, Layers, ListTree, Sparkles, Zap } from '@lucide/vue'
import SettingsCard from '@/components/common/page-shell/SettingsCard.vue'
import SettingsOrchTabs from '@/features/settings/shared/layout/SettingsOrchTabs.vue'
import SettingsFlowBand from '@/features/settings/shared/layout/SettingsFlowBand.vue'
import SettingsFlowStat from '@/features/settings/shared/layout/SettingsFlowStat.vue'
import EntityInput from '@/components/common/EntityInput.vue'
import AccountListEditor from './AccountListEditor.vue'
import EntityAccountListEditor from './EntityAccountListEditor.vue'
import MultiAccountListEditor from './MultiAccountListEditor.vue'
import { useBindingsAccountSection } from '@/features/settings/composables/connect/bindings.internals'

// 入参：数据源分类 tabs、模式选项、激活分类元信息、可映射字段、图表字段、综合实体属性候选
const props = defineProps({
  categoryTabs: { type: Array, default: () => [] },
  modeOptions: { type: Array, default: () => [] },
  activeMeta: { type: Object, default: () => ({}) },
  activeMappableFields: { type: Array, default: () => [] },
  activeChartFields: { type: Array, default: () => [] },
  compositeEntityAttrs: { type: Array, default: () => [] },
})

// 双向绑定：当前激活的数据源分类
const categoryTab = defineModel('categoryTab', { type: String, default: 'grid' })

// 对外事件：切换绑定模式、填充默认属性、从实体推断字段
defineEmits(['set-binding-mode', 'fill-default-attrs', 'infer-from-entity'])

// 派生编辑索引、激活源、字段映射与配置完成态（由 composable 统一管理）
const {
  editingMultiAccountIndex,
  editingMultiAccountKey,
  editingEntityAccountIndex,
  editingEntityAccountKey,
  activeSource,
  entityAccountEditTabs,
  activeEntityAccountRow,
  compositeEntityAttrsForEdit,
  multiAccountEditTabs,
  activeMultiAccountRow,
  activeMultiAccountLabel,
  syncMultiFromUi,
  activeModeLabel,
  isConfigured,
} = useBindingsAccountSection(categoryTab, {
  modeOptions: toRef(props, 'modeOptions'),
  compositeEntityAttrs: toRef(props, 'compositeEntityAttrs'),
})

const accountFlowSummary = computed(() => {
  const status = isConfigured.value ? '已配置' : '未配置'
  const source = props.activeMeta?.label || categoryTab.value
  return `${status} · ${source}`
})

const accountFlowSteps = computed(() => [
  {
    label: 'HA 实体',
    meta: isConfigured.value ? activeModeLabel.value : '待配置',
    icon: Zap,
    tone: isConfigured.value ? 'in' : 'secondary',
  },
  {
    label: '字段映射',
    meta: props.activeMeta?.label || categoryTab.value,
    icon: Layers,
    tone: 'mid',
  },
  {
    label: '图表引擎',
    meta: '能源/用水统计',
    icon: GitBranch,
    tone: 'exec',
  },
  {
    label: '大屏展示',
    meta: '微件展示',
    icon: Anchor,
    tone: 'out',
  },
])
</script>
<style src="./styles/settings-bindings-account-section.css"></style>
