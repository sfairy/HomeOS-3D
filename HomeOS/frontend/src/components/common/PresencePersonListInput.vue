<!--
  组件文件：PresencePersonListInput.vue
  所属模块：frontend/src/components/common
  组件职责：家庭在场人员列表编辑器。顶部 Tab 栏：左右移动按钮（>1 人时）+ 人员头像 Tab（按 idx 分色调，
    状态点显示在家/离家/未知）+ 删除按钮（embedded 模式）+ 添加按钮；
    编辑器主体：在家状态胶囊 + 移除按钮；两列网格：
    左侧 profile 列：人员名称、绑定用户 ID、存在实体 entityIds 多选、节律属性；
    右侧 Presence 列：匹配策略（按名称/实体/Tracker 映射）、Tracker 设备下拉、离家/回家延迟字段。
  主要 props / emits：
    - props.modelValue：人员数组（v-model 双向），每项含 id/name/userId/entityIds 等；
      props.statusMap：personId → atHome（null 表示未知）映射；
      props.wrapperClass：外层追加 class；
      props.embedded：精简模式（由 composable 管理 addLabel/removeLabel 默认值与工具栏精简）。
    - emit update:modelValue：增删改人员后回传完整数组；内部由 usePresencePersonListInput 统一处理。
  依赖关系：vue-router 跳转设置页（或有内部路由跳转）；@lucide/vue ChevronLeft/Right/Trash2/UserPlus/UserRound；
    composable usePresencePersonListInput（addLabel/removeLabel/activeIdx/rows/activePerson/
    personInitial/tabLabel/personStatus/updatePersonField/addPerson/removePerson/movePersonByDelta）。
-->
<template>
  <div :class="['ppli-wrap', embedded && 'ppli-wrap--embedded', wrapperClass]">
    <div class="ppli-tabs-bar">
      <button
        v-if="rows.length > 1"
        type="button"
        class="ppli-tab-shift"
        :disabled="activeIdx === 0"
        :aria-label="'左移 ' + tabLabel(activePerson, activeIdx)"
        :title="'左移'"
        @click="movePersonByDelta(activeIdx, -1)"
      >
        <ChevronLeft class="w-4 h-4" />
      </button>
      <div class="ppli-tabs" role="tablist">
        <button
          v-for="(person, idx) in rows"
          :key="person.id || idx"
          type="button"
          role="tab"
          :aria-selected="activeIdx === idx"
          :class="[
            'ppli-tab',
            activeIdx === idx && 'ppli-tab--active',
            tabStatusClass(person),
            `ppli-tab--tone-${idx % 5}`,
          ]"
          @click="activeIdx = idx"
        >
          <span :class="['ppli-tab__avatar', personStatusClass(person)]">
            {{ personInitial(person.name) }}
          </span>
          <span class="ppli-tab__label">{{ tabLabel(person, idx) }}</span>
          <span
            v-if="personStatus(person) !== null && String(person.name || '').trim()"
            :class="['ppli-tab__dot', personStatus(person) && 'ppli-tab__dot--home']"
          />
        </button>
      </div>
      <button
        v-if="rows.length > 1"
        type="button"
        class="ppli-tab-shift"
        :disabled="activeIdx >= rows.length - 1"
        :aria-label="'右移 ' + tabLabel(activePerson, activeIdx)"
        :title="'右移'"
        @click="movePersonByDelta(activeIdx, 1)"
      >
        <ChevronRight class="w-4 h-4" />
      </button>
      <button
        v-if="embedded && rows.length > 1"
        type="button"
        class="ppli-tab-remove"
        :aria-label="removeLabel"
        :title="removeLabel"
        @click="removePerson(activeIdx)"
      >
        <Trash2 class="w-3.5 h-3.5" />
      </button>
      <button
        type="button"
        class="ppli-tab-add"
        :aria-label="addLabel"
        :title="addLabel"
        @click="addPerson"
      >
        <UserPlus class="w-3.5 h-3.5" />
      </button>
    </div>

    <div v-if="activePerson" :key="activePerson.id || activeIdx" class="ppli-editor">
      <div v-if="!embedded" class="ppli-editor__toolbar">
        <span
          v-if="personStatus(activePerson) !== null && String(activePerson.name || '').trim()"
          :class="['ppli-status-pill', personStatus(activePerson) && 'ppli-status-pill--home']"
        >
          {{ personStatus(activePerson) ? '在家' : '离家' }}
        </span>
        <span v-else class="ppli-status-pill ppli-status-pill--muted">{{ '待配置' }}</span>
        <button
          v-if="rows.length > 1"
          type="button"
          class="ppli-editor__remove"
          :aria-label="removeLabel"
          @click="removePerson(activeIdx)"
        >
          <Trash2 class="w-3.5 h-3.5" />
          <span>{{ '移除' }}</span>
        </button>
      </div>

      <div class="ppli-grid">
        <div class="ppli-col ppli-col--profile">
          <div class="ppli-field-block">
            <label class="ppli-field-label">
              <UserRound class="w-3.5 h-3.5" />
              <span>{{ '人员名称' }}</span>
            </label>
            <input
              type="text"
              class="ppli-name settings-field"
              :value="activePerson.name"
              :placeholder="'如：爸爸、妈妈、小明'"
              @input="updatePersonField(activeIdx, 'name', $event.target.value)"
            />
            <p v-if="!embedded" class="ppli-field-hint">
              {{ '用于顶部在家人数、离家联动；名称与 HomeOS 用户名一致时，自适应气候/节律将使用该用户偏好' }}
            </p>
            <label class="ppli-field-label ppli-field-label--spaced">
              <span>{{ '绑定用户 ID（可选）' }}</span>
            </label>
            <input
              type="text"
              class="ppli-name settings-field"
              :value="activePerson.userId || ''"
              :placeholder="'HomeOS User.id，优先于名称匹配'"
              @input="updatePersonField(activeIdx, 'userId', $event.target.value)"
            />
          </div>
        </div>

        <div class="ppli-col-divider" aria-hidden="true" />

        <div class="ppli-col ppli-col--entities">
          <div class="ppli-field-block">
            <div class="ppli-field-block__head">
              <label class="ppli-field-label">
                <Radio class="w-3.5 h-3.5" />
                <span>{{ '在线判定实体' }}</span>
              </label>
              <span class="ppli-entity-count">{{ entityCountLabel(activePerson) }}</span>
            </div>
            <p v-if="!embedded" class="ppli-field-hint ppli-field-hint--compact">
              {{ '关联 person / device_tracker；任一实体在家即视为该人员在家' }}
            </p>
            <EntityMultiSelect
              :model-value="activePerson.entityIds"
              :placeholder="'点击选择判定实体'"
              @update:model-value="updatePersonField(activeIdx, 'entityIds', $event)"
            />
          </div>
        </div>
      </div>
    </div>

    <button v-if="!embedded" type="button" class="ppli-add-inline" @click="addPerson">
      <UserPlus class="w-4 h-4" />
      <span>{{ addLabel }}</span>
    </button>
  </div>
</template>

<script setup>
/**
 * @file PresencePersonListInput.vue
 * @module common/PresencePersonListInput
 * @description 在场人员列表输入组件（v-model 双向绑定人员数组）
 *  职责：
 *    - 以 Tab 形式展示多名人员，支持左右移动、新增、移除；
 *    - 每名人员可编辑名称、绑定用户 ID、在线判定实体集合；
 *    - 通过 statusMap 渲染在家/离家状态徽标；
 *    - embedded 模式精简工具栏，适用于嵌入式表单。
 *  依赖：@lucide/vue 图标，common/EntityMultiSelect，composables/presence/usePresencePersonListInput。
 */
import { Radio, Trash2, UserPlus, UserRound, ChevronLeft, ChevronRight } from '@lucide/vue'
import './styles/presence-person-list-input.css'
import EntityMultiSelect from '@/components/common/EntityMultiSelect.vue'
import { usePresencePersonListInput } from '@/composables/presence/usePresencePersonListInput'

const props = defineProps({
  /** 人员数组，每项含 id/name/userId/entityIds 等字段 */
  modelValue: { type: Array, default: () => [] },
  /** personId → atHome（null 表示未知/未保存） */
  statusMap: { type: Object, default: () => ({}) },
  /** 外层包裹节点的额外 class */
  wrapperClass: { type: String, default: '' },
  /** 「新增人员」按钮文案（embedded 模式下由 composable 提供默认值） */
  addLabel: { type: String, default: '' },
  /** 「移除人员」按钮 aria-label/title 文案 */
  removeLabel: { type: String, default: '' },
  /** 是否嵌入模式：精简工具栏，仅展示必要的添加/移除入口 */
  embedded: { type: Boolean, default: false },
})

const emit = defineEmits(['update:modelValue'])

// 通过组合式函数统一管理人员编辑逻辑（增删改、Tab 切换、状态计算等）
const {
  addLabel,
  removeLabel,
  activeIdx,
  rows,
  activePerson,
  personInitial,
  tabLabel,
  personStatus,
  personStatusClass,
  tabStatusClass,
  entityCountLabel,
  updatePersonField,
  addPerson,
  removePerson,
  movePersonByDelta,
} = usePresencePersonListInput(props, emit)
</script>
