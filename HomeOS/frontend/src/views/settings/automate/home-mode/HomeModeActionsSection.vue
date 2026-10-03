<!--
组件：HomeModeActionsSection.vue
所属模块：frontend / src / views / settings / automate / home-mode
职责：家庭模式编辑器「全屋动作」分区。管理动作列表（实体/场景/脚本/通知/安防），
      支持拖拽排序、批量添加、单条添加、复制与高级 service_data 配置；紧凑态下提供
      主从导航与展开/收起切换。
关键依赖：
  - HosSelect / EntityInput：下拉与实体输入
  - HomeModeItemNav：紧凑态下的动作主从导航
  - useHomeModeActionsSection：派生拖拽、高级配置、渲染动作等编辑态
  - sceneEntityIdFromRecord / scriptEntityIdFromRecord：场景/脚本记录转 entity_id
数据来源：父级透传的 activeDraft（双向）+ 域/服务/场景/脚本列表 + composable 派生
-->
<template>
  <div :class="['hm-panel__section', activeDraft.actions?.length && 'hm-panel__section--fill']">
    <div class="hm-section-head">
      <div>
        <h4 class="hm-section-head__title">
          <Zap class="w-4 h-4 ha-text-warn" />
          {{ '全屋动作' }}
        </h4>
        <p class="hm-section-head__desc">
          {{ '激活时按顺序执行；支持实体、场景、脚本、通知与安防' }}
        </p>
      </div>
      <div class="hm-section-head__actions">
        <template v-if="isCompact">
          <button type="button" class="hm-chip-btn" @click="expandAll">{{ '列表视图' }}</button>
          <button type="button" class="hm-chip-btn" @click="collapseAll">{{ '收起详情' }}</button>
        </template>
        <button
          v-if="!activeDraft.isNew"
          type="button"
          class="hm-chip-btn"
          @click="$emit('duplicate')"
        >
          <Copy class="w-3 h-3" /> {{ '复制' }}
        </button>
        <button type="button" class="hm-chip-btn hm-chip-btn--blue" @click="$emit('toggle-batch')">
          <Layers class="w-3 h-3" /> {{ '批量添加' }}
        </button>
        <button type="button" class="hm-chip-btn hm-chip-btn--green" @click="$emit('add-action')">
          <Plus class="w-3 h-3" /> {{ '单条' }}
        </button>
      </div>
    </div>

    <div :class="['hm-batch-panel', showBatch && 'hm-batch-panel--open']">
      <div class="hm-batch-panel__grid">
        <HosSelect
          variant="home-mode"
          block
          v-model="batchDomain"
          @change="$emit('batch-domain-change')"
        >
          <option value="">{{ '选择域' }}</option>
          <option v-for="d in allDomains" :key="d" :value="d">{{ d }}</option>
        </HosSelect>
        <HosSelect variant="home-mode" block v-model="batchService">
          <option value="">{{ '选择服务' }}</option>
          <option v-for="s in servicesForDomain(batchDomain)" :key="s" :value="s">{{ s }}</option>
        </HosSelect>
        <button
          type="button"
          class="hm-toolbar-btn hm-batch-panel__cancel"
          @click="$emit('cancel-batch')"
        >
          {{ '取消' }}
        </button>
        <button
          type="button"
          class="hm-toolbar-btn hm-toolbar-btn--accent hm-batch-panel__apply"
          :disabled="!batchDomain || !batchService || !batchChecked.length"
          @click="$emit('apply-batch')"
        >
          {{ `添加 (${batchChecked.length})` }}
        </button>
      </div>
      <div v-if="batchDomain" class="hm-batch-panel__entities">
        <div class="hm-batch-panel__entities-head">
          <span class="hm-field__label hm-field__label--flush">{{ '选择目标实体' }}</span>
          <div class="hm-batch-panel__entities-actions">
            <button type="button" class="hm-link" @click="$emit('batch-select-all')">
              {{ '全选' }}
            </button>
            <button type="button" class="hm-link hm-link--muted" @click="$emit('batch-clear')">
              {{ '取消全选' }}
            </button>
          </div>
        </div>
        <div class="hm-batch-panel__chips">
          <button
            v-for="e in batchEntities()"
            :key="e.eid"
            type="button"
            :class="['hm-batch-chip', batchChecked.includes(e.eid) && 'hm-batch-chip--on']"
            :title="e.eid"
            @click="$emit('toggle-batch-check', e.eid)"
          >
            {{ e.name }}
          </button>
        </div>
      </div>
    </div>

    <div v-if="!activeDraft.actions?.length" class="hm-premium-empty hm-premium-empty--amber">
      <Zap class="hm-premium-empty__icon" />
      <p class="hm-premium-empty__title">{{ '暂无设备动作' }}</p>
      <p class="hm-premium-empty__desc">
        {{ '切换到此模式时将执行以下动作；可单条添加或批量选择实体' }}
      </p>
      <div class="hm-premium-empty__actions">
        <button type="button" class="hm-premium-empty__btn" @click="$emit('add-action')">
          <Plus class="w-3.5 h-3.5" /> {{ '添加单条动作' }}
        </button>
        <button
          type="button"
          class="hm-premium-empty__btn hm-premium-empty__btn--ghost"
          @click="$emit('toggle-batch')"
        >
          <Layers class="w-3.5 h-3.5" /> {{ '批量添加' }}
        </button>
      </div>
    </div>

    <template v-else>
      <div :class="['hm-section-body', isCompact && !expandedAll && 'hm-section-body--split']">
        <div :class="isCompact && !expandedAll && 'hm-master-detail'">
          <HomeModeItemNav
            v-if="isCompact && !expandedAll"
            :items="actionNavItems"
            :active-index="activeTabIndex"
            head-label="条动作"
            aria-label="动作导航"
            @select="selectItem"
          />

          <div
            :class="
              isCompact && !expandedAll ? 'hm-item-detail hm-item-detail--pane' : 'hm-item-detail'
            "
          >
            <div
              v-if="isCompact && !expandedAll && !renderedActions.length"
              class="hm-item-detail-empty"
            >
              {{ '从左侧选择一条动作进行编辑' }}
            </div>

            <div
              v-else
              :class="['hm-action-list', isCompact && !expandedAll && 'hm-action-list--single']"
            >
              <div
                v-for="{ act, aidx } in renderedActions"
                :key="aidx"
                :class="[
                  'hm-action-card',
                  pulseIndex === aidx && 'hm-action-card--focus-pulse',
                  dragIndex === aidx && 'hm-action-card--dragging',
                  dragOverIndex === aidx && 'hm-action-card--drag-over',
                ]"
                :ref="(el) => setCardRef(aidx, el)"
                :draggable="!isCompact || expandedAll"
                @dragstart="onDragStart(aidx, $event)"
                @dragend="onDragEnd"
                @dragover.prevent="onDragOver(aidx, $event)"
                @dragleave="onDragLeave"
              >
                <div class="hm-action-card__head">
                  <div
                    v-if="!isCompact || expandedAll"
                    class="hm-action-card__drag-handle"
                    title="拖动排序"
                    @click.stop
                  >
                    <GripVertical class="w-4 h-4" />
                  </div>
                  <span class="hm-action-card__index">{{ aidx + 1 }}</span>
                  <HosSelect
                    variant="home-mode"
                    fit
                    trigger-class="hm-action-card__kind"
                    v-model="act.kind"
                    @change="onKindChange(act)"
                  >
                    <option v-for="k in actionKindOptions" :key="k.id" :value="k.id">
                      {{ k.label }}
                    </option>
                  </HosSelect>
                  <span class="hm-action-card__entity-name">{{ actionDisplayLabel(act) }}</span>
                  <div class="hm-action-card__head-spacer" />
                  <div class="hm-action-card__head-actions">
                    <button
                      type="button"
                      class="hm-action-card__move-btn"
                      :disabled="aidx === 0"
                      aria-label="上移"
                      @click="moveAction(aidx, -1)"
                    >
                      <ChevronUp class="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      class="hm-action-card__move-btn"
                      :disabled="aidx === activeDraft.actions.length - 1"
                      aria-label="下移"
                      @click="moveAction(aidx, 1)"
                    >
                      <ChevronDown class="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      class="hm-action-del"
                      :aria-label="'删除动作'"
                      @click="activeDraft.actions.splice(aidx, 1)"
                    >
                      <Trash2 class="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                <div class="hm-action-card__body">
                  <template v-if="act.kind === 'notify'">
                    <div class="hm-action-card__field">
                      <label class="hm-field__label">{{ '通知文案' }}</label>
                      <input
                        v-model="act.entity_id"
                        type="text"
                        :placeholder="'模式已切换'"
                        class="hm-field__input"
                      />
                    </div>
                  </template>
                  <template v-else-if="act.kind === 'security'">
                    <div class="hm-action-card__field">
                      <label class="hm-field__label">{{ '安防模式' }}</label>
                      <HosSelect
                        variant="home-mode"
                        block
                        v-model="act.entity_id"
                        @change="onSecurityChange(act)"
                      >
                        <option value="">{{ '选择安防模式' }}</option>
                        <option value="armed_home">{{ '居家布防' }}</option>
                        <option value="armed_away">{{ '离家布防' }}</option>
                        <option value="armed_night">{{ '夜间布防' }}</option>
                        <option value="disarmed">{{ '撤防' }}</option>
                      </HosSelect>
                      <p class="hm-field__hint">
                        {{ '约定：回家→居家、离家→离家、睡眠→夜间。生活方式设备写在本模式其它动作里，勿在「安防场景」重复配置。' }}
                      </p>
                    </div>
                  </template>
                  <template v-else-if="act.kind === 'scene'">
                    <div class="hm-action-card__field">
                      <label class="hm-field__label">{{ '场景' }}</label>
                      <HosSelect variant="home-mode" block v-model="act.entity_id">
                        <option value="">{{ '选择 HomeOS 场景' }}</option>
                        <option
                          v-for="s in savedScenes"
                          :key="s.id"
                          :value="sceneEntityIdFromRecord(s)"
                        >
                          {{ s.name }}
                        </option>
                      </HosSelect>
                    </div>
                  </template>
                  <template v-else-if="act.kind === 'script'">
                    <div class="hm-action-card__field">
                      <label class="hm-field__label">{{ '脚本' }}</label>
                      <HosSelect variant="home-mode" block v-model="act.entity_id">
                        <option value="">{{ '选择 HomeOS 脚本' }}</option>
                        <option
                          v-for="s in savedScripts"
                          :key="s.id"
                          :value="scriptEntityIdFromRecord(s)"
                        >
                          {{ s.name }}
                        </option>
                      </HosSelect>
                    </div>
                  </template>
                  <template v-else>
                    <div class="hm-action-card__fields-grid">
                      <div class="hm-action-card__field">
                        <label class="hm-field__label">{{ '域' }}</label>
                        <HosSelect
                          variant="home-mode"
                          block
                          v-model="act.domain"
                          @change="onDomainChange(act)"
                        >
                          <option value="">{{ '选择域' }}</option>
                          <option v-for="d in allDomains" :key="d" :value="d">{{ d }}</option>
                        </HosSelect>
                      </div>
                      <div class="hm-action-card__field hm-action-card__field--entity">
                        <label class="hm-field__label">{{ '实体' }}</label>
                        <EntityInput
                          v-model="act.entity_id"
                          :placeholder="'选择实体'"
                          :domain-filter="act.domain || ''"
                          wrapper-class="hm-entity-input"
                          @update:model-value="onEntityChange(act, $event)"
                        />
                      </div>
                      <div class="hm-action-card__field">
                        <label class="hm-field__label">{{ '服务' }}</label>
                        <HosSelect variant="home-mode" block v-model="act.service">
                          <option value="">{{ '选择服务' }}</option>
                          <option v-for="s in servicesForDomain(act.domain)" :key="s" :value="s">
                            {{ s }}
                          </option>
                        </HosSelect>
                      </div>
                      <div class="hm-action-card__field hm-action-card__field--delay">
                        <label class="hm-field__label">{{ '延迟(ms)' }}</label>
                        <input
                          v-model.number="act.delay"
                          type="number"
                          min="0"
                          step="100"
                          :placeholder="'0'"
                          class="hm-field__input"
                        />
                      </div>
                    </div>
                  </template>
                  <div v-if="act.kind === 'entity'" class="hm-action-card__advanced">
                    <button
                      type="button"
                      class="hm-action-card__advanced-toggle"
                      @click="toggleAdvanced(aidx)"
                    >
                      <Settings class="w-3.5 h-3.5" />
                      <span>{{
                        advancedMap[aidx] ? '收起高级配置' : '高级配置 (service_data)'
                      }}</span>
                      <ChevronDown :class="['w-3.5 h-3.5', advancedMap[aidx] && 'rotate-180']" />
                    </button>
                    <div v-show="advancedMap[aidx]" class="hm-action-card__advanced-body">
                      <textarea
                        v-model="act.service_data"
                        rows="3"
                        placeholder='{"brightness_pct": 80}'
                        class="hm-field__input hm-field__input--mono"
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
import HosSelect from '@/components/common/base/HosSelect.vue'
import {
  Zap,
  Plus,
  Layers,
  Trash2,
  Copy,
  GripVertical,
  ChevronUp,
  ChevronDown,
  Settings,
} from '@lucide/vue'
import EntityInput from '@/components/common/EntityInput.vue'
import HomeModeItemNav from '@/views/settings/automate/home-mode/HomeModeItemNav.vue'
import { useHomeModeActionsSection } from '@/composables/home-mode/editor.internals'
import {
  sceneEntityIdFromRecord,
  scriptEntityIdFromRecord,
} from '@/utils/orchestrator/entity-id.util'

// 双向绑定：批量添加面板的域 / 服务 / 当前编辑草稿（动作列表载体）
const batchDomain = defineModel('batchDomain', { type: String, default: '' })
const batchService = defineModel('batchService', { type: String, default: '' })
const activeDraft = defineModel('activeDraft', { type: Object, required: true })

// 入参：批量面板展开态、域/服务列表、勾选实体、场景/脚本记录、动作聚焦定位等
const props = defineProps({
  showBatch: Boolean,
  allDomains: { type: Array, default: () => [] },
  batchChecked: { type: Array, default: () => [] },
  servicesForDomain: { type: Function, required: true },
  batchEntities: { type: Function, required: true },
  actionKindOptions: { type: Array, default: () => [] },
  savedScenes: { type: Array, default: () => [] },
  savedScripts: { type: Array, default: () => [] },
  actionFocusEpoch: { type: Number, default: 0 },
  actionFocusIndex: { type: [Number, null], default: null },
})

// 对外事件：复制、批量/单条添加、批量选择、动作类型变更等
defineEmits([
  'duplicate',
  'toggle-batch',
  'add-action',
  'batch-domain-change',
  'apply-batch',
  'cancel-batch',
  'batch-select-all',
  'batch-clear',
  'toggle-batch-check',
  'kind-change',
])

// 编辑态：拖拽索引、高级配置开关、紧凑态主从导航、渲染动作列表等（由 composable 统一管理）
const {
  dragIndex,
  dragOverIndex,
  advancedMap,
  isCompact,
  expandedAll,
  activeTabIndex,
  selectItem,
  expandAll,
  collapseAll,
  pulseIndex,
  setCardRef,
  actionNavItems,
  renderedActions,
  onSecurityChange,
  onDomainChange,
  onEntityChange,
  onKindChange,
  actionDisplayLabel,
  toggleAdvanced,
  moveAction,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDragLeave,
} = useHomeModeActionsSection(activeDraft, props)
</script>
<style src="./styles/HomeMode.css"></style>
