<!--
组件：HomeModeTriggersSection.vue
所属模块：frontend / src / views / settings / automate / home-mode
职责：家庭模式编辑器「自动触发器」分区。管理触发器列表（定时/门锁/状态变化/日历外出），
      支持启用禁用、紧凑态主从导航、聚焦定位与触发推荐洞察展示。
关键依赖：
  - HosSelect / EntityInput / RecommendInsightCard：下拉、实体输入、推荐卡片
  - HomeModeItemNav：紧凑态主从导航
  - useHomeModeItemExpansion / useHomeModeItemFocus：展开态与聚焦脉冲
  - useHomeModeRecommend：触发推荐洞察
  - normalizeHomeModeTimeAt：归一化定时时间
数据来源：父级透传的 activeDraft（双向）+ 触发类型选项/日志/模式对象 + composable 派生
-->
<template>
  <div
    :class="[
      'hm-panel__section',
      'hm-triggers-hub',
      activeDraft.triggers?.length && 'hm-panel__section--fill',
    ]"
  >
    <div class="hm-section-head">
      <div>
        <h4 class="hm-section-head__title">
          <Clock class="w-4 h-4 ht-text-danger" />
          {{ '自动触发器' }}
        </h4>
        <p class="hm-section-head__desc">
          {{ '可选，留空则仅手动切换；多条触发器为「任一满足即激活」' }}
        </p>
      </div>
      <div class="hm-section-head__actions">
        <template v-if="isCompact">
          <button type="button" class="hm-chip-btn" @click="expandAll">{{ '列表视图' }}</button>
          <button type="button" class="hm-chip-btn" @click="collapseAll">{{ '收起详情' }}</button>
        </template>
        <button type="button" class="hm-chip-btn hm-chip-btn--sky" @click="$emit('add-trigger')">
          <Plus class="w-3 h-3" /> {{ '添加触发器' }}
        </button>
      </div>
    </div>

    <RecommendInsightCard
      :title="recommendations.title || '家庭模式推荐'"
      :summary="recommendations.summary"
      :actionable="recommendations.hasActionable"
      :groups="recommendations.groups"
      :banners="recommendations.banners"
      :visible="recommendations.hasActionable"
    />

    <div v-if="!activeDraft.triggers?.length" class="hm-premium-empty hm-premium-empty--sky">
      <Clock class="hm-premium-empty__icon" />
      <p class="hm-premium-empty__title">{{ '未配置自动触发' }}</p>
      <p class="hm-premium-empty__desc">
        {{ '留空时仅支持顶栏手动切换；可添加定时、门锁或状态变化触发' }}
      </p>
      <button type="button" class="hm-premium-empty__btn" @click="$emit('add-trigger')">
        <Plus class="w-3.5 h-3.5" /> {{ '添加第一个触发器' }}
      </button>
    </div>

    <template v-else>
      <div :class="['hm-section-body', isCompact && !expandedAll && 'hm-section-body--split']">
        <div :class="isCompact && !expandedAll && 'hm-master-detail'">
          <HomeModeItemNav
            v-if="isCompact && !expandedAll"
            :items="triggerNavItems"
            :active-index="activeTabIndex"
            head-label="条触发器"
            aria-label="触发器导航"
            @select="selectItem"
          />

          <div
            :class="
              isCompact && !expandedAll ? 'hm-item-detail hm-item-detail--pane' : 'hm-item-detail'
            "
          >
            <div
              v-if="isCompact && !expandedAll && !renderedTriggers.length"
              class="hm-item-detail-empty"
            >
              {{ '从左侧选择一条触发器进行编辑' }}
            </div>

            <div v-else class="hm-trigger-list">
              <div
                v-for="{ tr, tidx } in renderedTriggers"
                :key="tidx"
                :class="[
                  'hm-trigger-card',
                  tr.enabled === false && 'hm-trigger-card--disabled',
                  pulseIndex === tidx && 'hm-trigger-card--focus-pulse',
                ]"
                :ref="(el) => setCardRef(tidx, el)"
              >
                <div class="hm-trigger-card__head">
                  <label class="hm-trigger-card__enable" title="启用/禁用此触发器">
                    <input
                      type="checkbox"
                      :checked="tr.enabled !== false"
                      @change="toggleTriggerEnabled(tidx, $event)"
                      class="hm-trigger-card__enable-input"
                    />
                    <span class="hm-trigger-card__enable-switch" />
                  </label>
                  <span class="hm-trigger-card__index">{{ tidx + 1 }}</span>
                  <HosSelect
                    variant="home-mode"
                    fit
                    trigger-class="hm-trigger-card__type"
                    v-model="tr.type"
                  >
                    <option v-for="opt in triggerTypeOptions" :key="opt.id" :value="opt.id">
                      {{ opt.label }}
                    </option>
                  </HosSelect>
                  <p class="hm-trigger-card__desc">
                    {{ triggerTypeOptions.find((o) => o.id === tr.type)?.desc }}
                  </p>
                  <button
                    type="button"
                    class="hm-action-del hm-action-del--visible"
                    :aria-label="'删除触发器'"
                    @click="activeDraft.triggers.splice(tidx, 1)"
                  >
                    <Trash2 class="w-3.5 h-3.5" />
                  </button>
                </div>

                <div
                  v-if="tr.type === 'calendar_away'"
                  class="hm-trigger-hint hm-trigger-hint--info"
                >
                  {{ '系统会读取外部日历的「外出/away」标记自动激活此模式，无需额外配置。' }}
                </div>

                <div
                  v-if="tr.type === 'lock_unlock' || tr.type === 'state'"
                  class="hm-trigger-card__body"
                >
                  <label class="hm-field__label">{{ '实体（留空=任意同类）' }}</label>
                  <EntityInput
                    v-model="tr.entityId"
                    :placeholder="
                      tr.type === 'lock_unlock' ? 'lock.front_door' : 'binary_sensor.xxx'
                    "
                    :domain-filter="tr.type === 'lock_unlock' ? 'lock' : ''"
                    wrapper-class="hm-entity-input"
                  />
                </div>

                <div
                  v-if="tr.type === 'time'"
                  class="hm-trigger-card__body hm-trigger-card__body--row"
                >
                  <label class="hm-field__label hm-field__label--inline">{{ '每天' }}</label>
                  <input
                    v-model="tr.at"
                    type="time"
                    class="hm-field__input hm-field__input--time"
                    @change="normalizeTriggerTime(tr)"
                  />
                </div>

                <div v-if="tr.type === 'state'" class="hm-trigger-card__body">
                  <div class="hm-trigger-transition">
                    <div class="hm-trigger-transition__field">
                      <label class="hm-field__label">{{ '来自（from，可选）' }}</label>
                      <input
                        v-model="tr.from"
                        type="text"
                        :placeholder="'off'"
                        class="hm-field__input"
                      />
                    </div>
                    <span class="hm-trigger-transition__arrow" aria-hidden="true">→</span>
                    <div class="hm-trigger-transition__field">
                      <label class="hm-field__label">{{ '变为（to）' }}</label>
                      <input
                        v-model="tr.to"
                        type="text"
                        :placeholder="'on'"
                        class="hm-field__input"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, nextTick } from 'vue'
import HosSelect from '@/components/common/base/HosSelect.vue'
import { Clock, Plus, Trash2 } from '@lucide/vue'
import EntityInput from '@/components/common/EntityInput.vue'
import RecommendInsightCard from '@/components/common/RecommendInsightCard.vue'
import HomeModeItemNav from '@/components/security/HomeModeItemNav.vue'
import { useHomeModeItemExpansion, useHomeModeItemFocus } from '@/composables/home-mode/editor.internals'
import { useHomeModeRecommend } from '@/features/settings/composables/automate/home-mode-panel.internals'
import { normalizeHomeModeTimeAt } from '@homeos/shared'

// 双向绑定：当前编辑的家庭模式草稿（触发器列表载体）
const activeDraft = defineModel('activeDraft', { type: Object, required: true })

// 入参：触发类型选项、聚焦定位 epoch/index、触发日志、当前模式对象
const props = defineProps({
  triggerTypeOptions: { type: Array, default: () => [] },
  triggerFocusEpoch: { type: Number, default: 0 },
  triggerFocusIndex: { type: [Number, null], default: null },
  triggerLogs: { type: Array, default: () => [] },
  activeMode: { type: Object, default: null },
})

defineEmits(['add-trigger'])

// 触发推荐洞察：基于当前模式触发器与日志派生推荐卡片数据
const { recommendations } = useHomeModeRecommend(
  () => [
    {
      id: String(props.activeMode?.id || activeDraft.value?.id || 'draft'),
      name: String(props.activeMode?.name || activeDraft.value?.name || '当前模式'),
      triggers: activeDraft.value?.triggers,
    },
  ],
  () => props.triggerLogs,
)

const triggerCount = computed(() => activeDraft.value?.triggers?.length ?? 0)
// 展开态：紧凑态主从导航、展开/收起与激活索引
const { isCompact, expandedAll, activeTabIndex, selectItem, focusItem, expandAll, collapseAll } =
  useHomeModeItemExpansion(triggerCount)

const cardRefs = ref({})

// 收集触发器卡片 DOM 引用，用于聚焦时滚入可视区
function setCardRef(index, el) {
  if (el) cardRefs.value[index] = el
  else delete cardRefs.value[index]
}

// 聚焦脉冲：epoch/index 变化时聚焦对应触发器并滚入可视区
const { pulseIndex } = useHomeModeItemFocus(
  () => props.triggerFocusEpoch,
  () => props.triggerFocusIndex,
  async (index) => {
    focusItem(index)
    await nextTick()
    await nextTick()
    cardRefs.value[index]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  },
)

// 归一化定时触发器的时间字符串
function normalizeTriggerTime(tr) {
  const normalized = normalizeHomeModeTimeAt(tr?.at)
  if (normalized) tr.at = normalized
}

// 紧凑态导航条目：每条触发器的标签与副标题
const triggerNavItems = computed(() =>
  (activeDraft.value?.triggers ?? []).map((tr, i) => {
    const meta = triggerTabSubtitle(tr)
    return {
      index: i,
      label: triggerTabLabel(tr),
      meta: meta || undefined,
      placeholder: false,
    }
  }),
)

// 实际渲染的触发器：展开态返回全部，紧凑态仅返回当前激活项
const renderedTriggers = computed(() => {
  const triggers = activeDraft.value?.triggers ?? []
  if (!isCompact.value || expandedAll.value) {
    return triggers.map((tr, tidx) => ({ tr, tidx }))
  }
  if (activeTabIndex.value != null && triggers[activeTabIndex.value]) {
    return [{ tr: triggers[activeTabIndex.value], tidx: activeTabIndex.value }]
  }
  return []
})

// 取触发器在导航中的主标签（类型文案）
function triggerTabLabel(tr) {
  return props.triggerTypeOptions.find((o) => o.id === tr.type)?.label || tr.type || '触发器'
}

// 取触发器在导航中的副标题（时间/实体/状态迁移）
function triggerTabSubtitle(tr) {
  if (tr.type === 'time' && tr.at) return tr.at
  if ((tr.type === 'lock_unlock' || tr.type === 'state') && tr.entityId) return tr.entityId
  if (tr.type === 'state' && tr.to) return `→ ${tr.to}`
  return ''
}

// 切换某条触发器的启用/禁用态
function toggleTriggerEnabled(idx, e) {
  const target = e.target
  if (activeDraft.value.triggers[idx]) {
    activeDraft.value.triggers[idx].enabled = target.checked
  }
}
</script>

<style scoped src="./styles/HomeModeTriggersSection.css"></style>
