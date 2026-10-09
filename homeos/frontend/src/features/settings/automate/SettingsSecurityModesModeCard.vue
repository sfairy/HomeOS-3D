<!--
组件：SettingsSecurityModesModeCard.vue
所属模块：frontend / src / views / settings / automate
职责：单个安防模式（如 armed_away / armed_home 等）配置卡片。编辑场景名称、图标、
      联动家庭模式，并管理联动动作列表（域/服务/实体），支持批量与单条添加。
关键依赖：
  - HosSelect / EntityInput：下拉与实体输入
  - useLayoutStore：读写 securityModes / securityModeLinks 配置
  - useChromeStore / useEntitiesStore：通知与实体索引
  - fetchHomeModes：加载家庭模式列表用于联动选择
  - Zap / Plus / Layers / Trash2 图标来自 @lucide/vue
数据来源：layoutStore.securityModes 中匹配 modeKey 的模式 + 父级透传的回调
-->
<template>
  <section v-if="mode" :class="['sm-mode-card', props.embedded && 'sm-mode-card--embedded']">
    <header class="sm-mode-head">
      <div class="sm-mode-head__top">
        <div :class="['sm-mode-head__icon', modeBg(modeKey)]" aria-hidden="true">
          <component :is="modeIcon(modeKey)" class="w-5 h-5" :class="modeIconColor(modeKey)" />
        </div>
        <div class="sm-mode-head__main">
          <div class="sm-mode-head__title-row">
            <label class="sm-field__label sm-field__label--inline">{{ '场景名称' }}</label>
            <span class="sm-chip sm-chip--key">{{ mode.key }}</span>
          </div>
          <input
            v-model="mode.name"
            type="text"
            class="sm-field__input sm-field__input--title"
            :placeholder="'如：离家布防'"
          />
        </div>
      </div>
      <div class="sm-mode-head__meta">
        <p class="sm-mode-head__hint">
          {{ `切换时按序号执行 · ${actionCount} 条联动` }}
        </p>
        <button
          v-if="securityModePresets[modeKey]"
          type="button"
          class="sm-btn sm-btn--batch sm-btn--compact"
          @click="$emit('applyPreset', modeKey)"
        >
          {{ `应用「${securityModePresets[modeKey].name}」` }}
        </button>
      </div>
    </header>

    <details class="sm-mode-advanced" @toggle="onAdvancedToggle">
      <summary class="sm-mode-advanced__summary">
        <span class="sm-mode-advanced__summary-label">{{ '高级选项' }}</span>
        <span v-if="advancedSummaryHint" class="sm-mode-advanced__summary-hint">{{
          advancedSummaryHint
        }}</span>
      </summary>
      <div class="sm-mode-advanced__body">
        <div class="sm-mode-advanced__rows">
          <div class="sm-mode-advanced__row">
            <label class="sm-mode-advanced__label">{{ '图标' }}</label>
            <HosSelect
              variant="home-mode"
              block
              trigger-class="sm-field__input sm-field__input--sm"
              v-model="mode.icon"
            >
              <option value="Shield">{{ '盾牌' }}</option>
              <option value="Home">{{ '居家' }}</option>
              <option value="Moon">{{ '夜间' }}</option>
              <option value="ShieldOff">{{ '撤防' }}</option>
              <option value="ShieldCheck">{{ '已布防' }}</option>
            </HosSelect>
          </div>
          <div class="sm-mode-advanced__row">
            <label class="sm-mode-advanced__label">{{ '联动模式' }}</label>
            <HosSelect
              variant="home-mode"
              block
              searchable
              trigger-class="sm-field__input sm-field__input--sm"
              :model-value="securityModeLinks[modeKey] || ''"
              :disabled="homeModesLoading"
              @update:model-value="setHomeModeLink"
            >
              <option value="">{{ homeModeEmptyLabel }}</option>
              <option v-for="m in homeModes" :key="m.id" :value="m.id">{{ m.name }}</option>
            </HosSelect>
          </div>
        </div>
        <p class="sm-mode-advanced__note">
          {{ '动作只放外围设备；生活方式与对照表请到「联动」页配置。' }}
        </p>
      </div>
    </details>

    <div class="sm-mode-body">
      <div class="sm-actions-head">
        <div class="sm-actions-head__copy">
          <h3 class="sm-actions-title">
            <Zap class="w-3.5 h-3.5 smc-text-warn" />
            {{ '联动动作' }}
          </h3>
          <p class="sm-actions-sub">{{ '实体服务调用列表，自上而下依次执行' }}</p>
        </div>
        <div class="sm-actions-btns">
          <button type="button" class="sm-btn sm-btn--batch" @click="showBatch = !showBatch">
            <Layers class="w-3 h-3" /> {{ showBatch ? '收起批量' : '批量添加' }}
          </button>
          <button type="button" class="sm-btn sm-btn--add" @click="$emit('addAction')">
            <Plus class="w-3 h-3" /> {{ '单条添加' }}
          </button>
        </div>
      </div>

      <div :class="['sm-batch-panel', showBatch && 'sm-batch-panel--open']">
        <div class="sm-batch-row">
          <HosSelect
            variant="home-mode"
            block
            trigger-class="sm-field__input sm-field__input--sm"
            v-model="batchDomain"
            @change="onBatchDomainChange"
          >
            <option value="">{{ '选择域' }}</option>
            <option v-for="d in allDomains" :key="d" :value="d">{{ d }}</option>
          </HosSelect>
          <HosSelect
            variant="home-mode"
            block
            trigger-class="sm-field__input sm-field__input--sm"
            v-model="batchService"
          >
            <option value="">{{ '选择服务' }}</option>
            <option v-for="s in servicesForDomain(batchDomain)" :key="s" :value="s">{{ s }}</option>
          </HosSelect>
          <button
            type="button"
            class="sm-btn sm-btn--primary"
            :disabled="!batchDomain || !batchService || !batchChecked.length"
            @click="applyBatch"
          >
            {{ `添加 ${batchChecked.length} 项` }}
          </button>
        </div>
        <div v-if="batchDomain" class="sm-batch-entities">
          <div class="sm-batch-entities__head">
            <span>{{ '选择目标实体' }}</span>
            <div class="flex gap-2">
              <button
                type="button"
                class="sm-link"
                @click="batchChecked = batchEntities.map((e) => e.eid)"
              >
                {{ '全选' }}
              </button>
              <button type="button" class="sm-link sm-link--muted" @click="batchChecked = []">
                {{ '清空' }}
              </button>
            </div>
          </div>
          <div class="sm-chip-grid">
            <button
              v-for="e in batchEntities"
              :key="e.eid"
              type="button"
              :class="['sp-check-chip', batchChecked.includes(e.eid) && 'sp-check-chip--on']"
              :title="e.eid"
              @click="toggleBatchCheck(e.eid)"
            >
              {{ e.name }}
            </button>
          </div>
        </div>
      </div>

      <div v-if="!mode.actions?.length" class="sm-empty">
        <div class="sm-empty__icon">
          <Zap class="w-5 h-5" />
        </div>
        <p class="sm-empty__title">{{ '暂无联动动作' }}</p>
        <p class="sm-empty__desc">{{ '切换到此场景时不会执行任何设备操作' }}</p>
        <div class="sm-empty__actions">
          <button type="button" class="sm-btn sm-btn--add" @click="$emit('addAction')">
            <Plus class="w-3 h-3" /> {{ '添加第一条' }}
          </button>
          <button type="button" class="sm-btn sm-btn--batch" @click="showBatch = true">
            <Layers class="w-3 h-3" /> {{ '批量添加' }}
          </button>
        </div>
      </div>

      <div v-else class="sm-action-list">
        <div class="sm-action-list__legend" aria-hidden="true">
          <span class="sm-action-list__legend-idx">#</span>
          <span>{{ '域' }}</span>
          <span>{{ '服务' }}</span>
          <span>{{ '实体' }}</span>
          <span />
        </div>
        <div v-for="(act, aidx) in mode.actions" :key="aidx" class="sm-action-row">
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
            @click="mode.actions.splice(aidx, 1)"
          >
            <Trash2 class="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup>
import HosSelect from '@/components/common/base/HosSelect.vue'
import { computed, ref } from 'vue'
import { Zap, Plus, Layers, Trash2 } from '@lucide/vue'
import EntityInput from '@/components/common/EntityInput.vue'
import { useLayoutStore } from '@/stores/layout.store'
import { useChromeStore } from '@/stores/chrome.store'
import { useEntitiesStore } from '@/stores/entities.store'
import { getEntityDisplayName, domainIndexToArray } from '@/utils/entity/derived.util'
import { fetchHomeModes } from '@/services/api/home-modes'
import { normalizeCrudListResponse } from '@/utils/core/crud-list.util'
import { logger } from '@/utils/core/logger'
import { getApiErrorMessage } from '@/utils/core/error-message'

const layoutStore = useLayoutStore()
const chrome = useChromeStore()
const entitiesStore = useEntitiesStore()

// 入参：是否嵌入、模式 key、动作数、预设映射、域列表、各展示函数与 servicesForDomain
const props = defineProps({
  embedded: { type: Boolean, default: false },
  modeKey: { type: String, required: true },
  actionCount: { type: Number, default: 0 },
  securityModePresets: { type: Object, default: () => ({}) },
  allDomains: { type: Array, default: () => [] },
  modeIcon: { type: Function, required: true },
  modeIconColor: { type: Function, required: true },
  modeBg: { type: Function, required: true },
  modeAccent: { type: Function, required: true },
  servicesForDomain: { type: Function, required: true },
})

// 对外事件：应用预设、添加单条动作
defineEmits(['applyPreset', 'addAction'])

// 批量面板的展开态、域、服务、勾选实体
const showBatch = ref(false)
const batchDomain = ref('')
const batchService = ref('')
const batchChecked = ref([])
// 家庭模式列表（用于「联动模式」下拉）
const homeModes = ref([])
const homeModesLoading = ref(false)
// 家庭模式是否已加载，避免重复请求
let homeModesLoaded = false

// 当前模式对象：从 securityModes 中按 modeKey 查找
const mode = computed(() =>
  (layoutStore.layoutConfig.securityModes || []).find((m) => m.key === props.modeKey),
)
// 安防模式到家庭模式的联动映射表，缺失时按四个标准模式 key 初始化
const securityModeLinks = computed(() => {
  const lc = layoutStore.layoutConfig
  if (!lc.securityModeLinks || typeof lc.securityModeLinks !== 'object') {
    lc.securityModeLinks = { armed_away: '', armed_home: '', armed_night: '', disarmed: '' }
  }
  return lc.securityModeLinks
})

// 联动模式下拉的空选项文案：撤防表示退出家庭模式，其它表示按名称自动匹配
const homeModeEmptyLabel = computed(() =>
  props.modeKey === 'disarmed' ? '留空 = 退出家庭模式' : '留空 = 按名称自动匹配',
)

// 高级选项摘要：已联动时显示联动家庭模式名称
const advancedSummaryHint = computed(() => {
  const linkedId = String(securityModeLinks.value[props.modeKey] || '').trim()
  if (!linkedId) return ''
  const linked = homeModes.value.find((m) => m.id === linkedId)
  return linked ? `已联动 · ${linked.name}` : '已指定联动'
})

// 懒加载家庭模式列表：首次展开高级选项时触发，已加载或加载中时跳过
async function loadHomeModes() {
  if (homeModesLoaded || homeModesLoading.value) return
  homeModesLoading.value = true
  try {
    const { data } = await fetchHomeModes()
    homeModes.value = normalizeCrudListResponse(data).rows.map((m) => ({
      id: m.id,
      name: m.name,
    }))
    homeModesLoaded = true
  } catch (e) {
    logger.warn('加载家庭模式列表失败', e)
    homeModes.value = []
    chrome.notify(getApiErrorMessage(e, '加载家庭模式列表失败'), 'warning')
  } finally {
    homeModesLoading.value = false
  }
}

// 高级选项展开时触发家庭模式懒加载
function onAdvancedToggle(e) {
  if (e.target?.open) void loadHomeModes()
}

// 设置当前模式联动的家庭模式 ID
function setHomeModeLink(value) {
  securityModeLinks.value[props.modeKey] = String(value || '')
}

// 当前批量域下的可选实体列表（按 entity_id 排序，附带可读名称）
const batchEntities = computed(() => {
  const d = batchDomain.value
  if (!d) return []
  return domainIndexToArray(entitiesStore.domainEntityIndex.get(d))
    .sort()
    .map((eid) => {
      const ent = entitiesStore.entities[eid]
      return { eid, name: getEntityDisplayName(eid, ent) }
    })
})

// 切换批量域时清空已勾选实体与服务
function onBatchDomainChange() {
  batchChecked.value = []
  batchService.value = ''
}

// 切换某个实体的勾选态
function toggleBatchCheck(eid) {
  const idx = batchChecked.value.indexOf(eid)
  if (idx >= 0) batchChecked.value.splice(idx, 1)
  else batchChecked.value.push(eid)
}

// 应用批量添加：将勾选实体作为动作追加到当前模式，完成后清空并收起面板
function applyBatch() {
  const m = mode.value
  if (!m || !batchDomain.value || !batchService.value || !batchChecked.value.length) return
  if (!m.actions) m.actions = []
  for (const eid of batchChecked.value) {
    m.actions.push({
      entity_id: eid,
      domain: batchDomain.value,
      service: batchService.value,
    })
  }
  batchChecked.value = []
  showBatch.value = false
}
</script>

<style src="./styles/security-modes.css"></style>
