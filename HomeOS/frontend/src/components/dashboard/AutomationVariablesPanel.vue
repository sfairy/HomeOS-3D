/**
 * @file AutomationVariablesPanel.vue
 * @module dashboard
 * @description 自动化持久变量管理面板
 *  职责：
 *    - 列出全局变量与本规则变量，支持按作用域 Tab 切换与关键词搜索；
 *    - 新建变量（key/名称/作用域/类型/初值），含 key 格式与重复校验；
 *    - 行内编辑变量（名称/类型/当前值）与删除（二次确认）；
 *    - geekActions 模式额外暴露「填入 / 写入 / 触发 / 判断」快捷按钮，向父级 emit。
 *  依赖：vue computed/reactive/ref，chrome.store（确认弹窗），services/api/orchestrator 的变量 CRUD。
 */
<template>
  <section :class="['avp', compact && 'is-compact', hideTitle && 'is-embedded']">
    <header v-if="!hideTitle" class="avp-head">
      <div>
        <h4>{{ '变量管理' }}</h4>
        <p class="avp-sub">
          {{ '全局共享 · 本规则仅当前自动化。未声明的 key 运行时也会自动创建。' }}
        </p>
      </div>
    </header>

    <div class="avp-bar">
      <div class="avp-tabs" role="tablist">
        <button
          v-for="tab in tabs"
          :key="tab.id"
          type="button"
          role="tab"
          :aria-selected="filter === tab.id"
          :class="['avp-tab', filter === tab.id && 'is-active']"
          @click="filter = tab.id"
        >
          <span>{{ tab.label }}</span>
          <em>{{ tab.count }}</em>
        </button>
      </div>
      <div class="avp-bar-right">
        <label class="avp-search-wrap">
          <span class="avp-search-ico" aria-hidden="true">⌕</span>
          <input
            v-model="query"
            class="avp-search"
            type="search"
            :placeholder="'搜索'"
          />
        </label>
        <button
          type="button"
          class="avp-icon-btn"
          :disabled="busy"
          :title="'刷新'"
          @click="load"
        >
          {{ '↻' }}
        </button>
        <button
          type="button"
          class="avp-primary-btn"
          :class="showCreate && 'is-on'"
          @click="showCreate = !showCreate"
        >
          {{ showCreate ? '收起' : '新建' }}
        </button>
      </div>
    </div>

    <div v-if="showCreate" class="avp-create">
      <div class="avp-create-head">
        <p class="avp-create-title">{{ '新建变量' }}</p>
        <span class="avp-create-hint">{{ '标识仅字母、数字与下划线' }}</span>
      </div>
      <div class="avp-create-grid">
        <label class="avp-field avp-field--wide">
          <span>{{ '标识' }}</span>
          <input
            v-model="draft.key"
            class="avp-input--mono"
            :placeholder="'例如 room_temp'"
            spellcheck="false"
            autocomplete="off"
            @input="draftError = ''"
          />
        </label>
        <label class="avp-field">
          <span>{{ '显示名' }}</span>
          <input v-model="draft.name" :placeholder="'可选，默认用标识'" />
        </label>
        <label class="avp-field">
          <span>{{ '作用域' }}</span>
          <HosSelect v-model="draft.scope" variant="orchestrator" size="sm" block>
            <option value="global">{{ '全局' }}</option>
            <option value="rule" :disabled="!ruleId">{{ '本规则' }}</option>
          </HosSelect>
        </label>
        <label class="avp-field">
          <span>{{ '类型' }}</span>
          <HosSelect v-model="draft.type" @change="onDraftTypeChange" variant="orchestrator" size="sm" block>
            <option value="number">{{ '数值' }}</option>
            <option value="string">{{ '文本' }}</option>
          </HosSelect>
        </label>
        <label class="avp-field">
          <span>{{ '初值' }}</span>
          <input
            v-model="draft.value"
            :placeholder="draft.type === 'number' ? '0' : '可选'"
            @keyup.enter="submitCreate"
          />
        </label>
      </div>
      <p v-if="!ruleId && draft.scope === 'rule'" class="avp-tip">
        {{ '请先保存自动化，或改用全局作用域。' }}
      </p>
      <p v-if="draftError" class="avp-err">{{ draftError }}</p>
      <div class="avp-create-actions">
        <button type="button" class="avp-ghost-btn" @click="resetDraft">{{ '清空' }}</button>
        <button type="button" class="avp-primary-btn" :disabled="busy" @click="submitCreate">
          {{ busy ? '创建中…' : '创建' }}
        </button>
      </div>
    </div>

    <p v-if="error" class="avp-err">{{ error }}</p>

    <ul v-if="filtered.length" class="avp-list">
      <li v-for="v in filtered" :key="v.id" :class="['avp-card', editingId === v.id && 'is-editing']">
        <template v-if="editingId === v.id">
          <div class="avp-edit">
            <label class="avp-field">
              <span>{{ '名称' }}</span>
              <input v-model="editForm.name" />
            </label>
            <label class="avp-field">
              <span>{{ '类型' }}</span>
              <HosSelect v-model="editForm.type" variant="orchestrator" size="sm" block>
                <option value="number">{{ '数值' }}</option>
                <option value="string">{{ '文本' }}</option>
              </HosSelect>
            </label>
            <label class="avp-field avp-field--wide">
              <span>{{ '当前值' }}</span>
              <input v-model="editForm.value" @keyup.enter="saveEdit(v)" />
            </label>
            <div class="avp-edit-actions">
              <button type="button" class="avp-primary-btn" :disabled="busy" @click="saveEdit(v)">
                {{ '保存' }}
              </button>
              <button type="button" class="avp-ghost-btn" @click="cancelEdit">{{ '取消' }}</button>
            </div>
          </div>
        </template>
        <template v-else>
          <div class="avp-card-top">
            <div class="avp-id">
              <strong class="avp-key" :title="v.key">{{ v.key }}</strong>
              <span :class="['avp-badge', v.scope === 'rule' ? 'is-rule' : 'is-global']">
                {{ v.scope === 'rule' ? '本规则' : '全局' }}
              </span>
              <span class="avp-type">{{ v.type === 'number' ? '数值' : '文本' }}</span>
            </div>
            <code class="avp-value" :title="String(v.value ?? '')">{{ formatValue(v) }}</code>
          </div>
          <p v-if="v.name && v.name !== v.key" class="avp-name">{{ v.name }}</p>
          <div class="avp-card-actions">
            <button type="button" class="avp-chip-btn" @click="startEdit(v)">{{ '编辑' }}</button>
            <template v-if="geekActions">
              <button
                type="button"
                class="avp-chip-btn"
                title="填入当前选中节点"
                @click="emit('pick', { key: v.key, scope: v.scope, type: v.type })"
              >
                {{ '填入' }}
              </button>
              <button
                type="button"
                class="avp-chip-btn"
                @click="emit('insert', { kind: 'write', key: v.key, scope: v.scope })"
              >
                {{ '写入' }}
              </button>
              <button
                type="button"
                class="avp-chip-btn"
                @click="emit('insert', { kind: 'trigger', key: v.key, scope: v.scope })"
              >
                {{ '触发' }}
              </button>
              <button
                type="button"
                class="avp-chip-btn"
                @click="emit('insert', { kind: 'condition', key: v.key, scope: v.scope })"
              >
                {{ '判断' }}
              </button>
            </template>
            <button type="button" class="avp-chip-btn is-danger" @click="confirmRemove(v)">
              {{ '删除' }}
            </button>
          </div>
        </template>
      </li>
    </ul>

    <div v-else class="avp-empty">
      <p>{{ query || filter !== 'all' ? '没有匹配的变量' : '还没有变量' }}</p>
      <button
        v-if="!query && filter === 'all'"
        type="button"
        class="avp-primary-btn"
        @click="showCreate = true"
      >
        {{ '新建第一个变量' }}
      </button>
    </div>
  </section>
</template>

<script setup>
/**
 * 所属模块：frontend/components
 * 职责：实现 AutomationVariablesPanel 组件的界面渲染、用户交互与 props/emit 通信。
 * 关键依赖：Vue 3 `<script setup>`、Pinia stores（按需）、类型定义、Lucide 图标与 i18n 标签。
 * 约定：- 所有对外属性统一走 defineProps 泛型，emit 使用 defineEmits<...>()；
  - 不直接操作 DOM，响应式数据变化通过 v-model 或乐观锁写回 store。
 */
import HosSelect from '@/components/common/base/HosSelect.vue'
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useChromeStore } from '@/stores/chrome.store'
import {
  createAutomationVariable,
  deleteAutomationVariable,
  fetchAutomationVariables,
  updateAutomationVariable,
} from '@/services/api/orchestrator'
import { getApiErrorMessage } from '@/utils/core/error-message'

const props = defineProps({
  /** 当前自动化规则 ID（用于本规则变量过滤与创建；为空时仅展示全局变量） */
  ruleId: { type: String, default: '' },
  /** 是否展示 geek 模式快捷按钮（填入 / 写入 / 触发 / 判断） */
  geekActions: { type: Boolean, default: false },
  /** 是否使用紧凑布局 */
  compact: { type: Boolean, default: false },
  /** 是否默认展开新建表单 */
  openCreate: { type: Boolean, default: false },
  /** 抽屉内嵌时隐藏重复标题 */
  hideTitle: { type: Boolean, default: false },
})

const emit = defineEmits(['pick', 'insert', 'loaded'])

const chrome = useChromeStore()

/** 变量 key 合法字符正则：仅字母、数字、下划线 */
const KEY_RE = /^[a-zA-Z0-9_]+$/

/** 变量列表（已按 ruleId 过滤） */
const variables = ref([])
/** 是否处于异步操作中（创建/编辑/删除） */
const busy = ref(false)
/** 列表加载/保存错误信息 */
const error = ref('')
/** 新建表单校验错误 */
const draftError = ref('')
/** 搜索关键词 */
const query = ref('')
/** 当前 Tab 过滤：all / global / rule */
const filter = ref('all')
/** 是否展开新建表单 */
const showCreate = ref(!!props.openCreate)
/** 当前正在编辑的变量 id */
const editingId = ref(null)
/** 编辑表单（名称/类型/当前值） */
const editForm = reactive({ name: '', type: 'string', value: '' })
/** 新建表单草稿 */
const draft = reactive({
  key: '',
  name: '',
  scope: 'global',
  type: 'number',
  value: '0',
})

/** 各作用域的变量计数，用于 Tab 角标 */
const counts = computed(() => {
  const all = variables.value
  return {
    all: all.length,
    global: all.filter((v) => v.scope !== 'rule').length,
    rule: all.filter((v) => v.scope === 'rule').length,
  }
})

/** Tab 列表：全部 / 全局 / 本规则，附计数 */
const tabs = computed(() => [
  { id: 'all', label: '全部', count: counts.value.all },
  { id: 'global', label: '全局', count: counts.value.global },
  { id: 'rule', label: '本规则', count: counts.value.rule },
])

/** 经 Tab 与关键词过滤后的变量列表 */
const filtered = computed(() => {
  const q = query.value.trim().toLowerCase()
  return variables.value.filter((v) => {
    if (filter.value === 'global' && v.scope === 'rule') return false
    if (filter.value === 'rule' && v.scope !== 'rule') return false
    if (!q) return true
    return (
      String(v.key || '')
        .toLowerCase()
        .includes(q) ||
      String(v.name || '')
        .toLowerCase()
        .includes(q)
    )
  })
})

/**
 * 格式化变量值用于列表展示：空值显示「空」，过长截断加省略号
 * @param {Object} v 变量对象
 * @returns {string}
 */
function formatValue(v) {
  if (v.value == null || v.value === '') return '空'
  const s = String(v.value)
  return s.length > 20 ? `${s.slice(0, 20)}…` : s
}

/** 新建表单类型切换回调：切到数值时自动补默认 0 */
function onDraftTypeChange() {
  if (draft.type === 'number' && (draft.value === '' || draft.value == null)) draft.value = '0'
}

/** 重置新建表单草稿 */
function resetDraft() {
  draft.key = ''
  draft.name = ''
  draft.scope = props.ruleId ? draft.scope : 'global'
  draft.type = 'number'
  draft.value = '0'
  draftError.value = ''
}

/**
 * 加载变量列表：调用后端拉取全部变量后按 ruleId 过滤
 * 失败时设置 error 文案
 */
async function load() {
  error.value = ''
  try {
    const { data } = await fetchAutomationVariables()
    const list = Array.isArray(data) ? data : data?.items || []
    const filteredList = list.filter((v) => {
      if (v.scope === 'global' || v.scope !== 'rule') return true
      if (!props.ruleId) return false
      return String(v.ruleId || '') === String(props.ruleId)
    })
    variables.value = filteredList.map((v) => ({ ...v }))
    emit('loaded', variables.value)
  } catch (e) {
    error.value = getApiErrorMessage(e, '加载变量失败')
  }
}

/**
 * 提交新建变量：先做 key 格式/重复/作用域校验，通过后调用后端创建并刷新列表
 */
async function submitCreate() {
  const key = String(draft.key || '').trim()
  draftError.value = ''
  if (!key) {
    draftError.value = '请填写 key'
    return
  }
  if (!KEY_RE.test(key)) {
    draftError.value = 'key 仅允许字母、数字与下划线'
    return
  }
  const scope = draft.scope === 'rule' ? 'rule' : 'global'
  if (scope === 'rule' && !props.ruleId) {
    draftError.value = '请先保存自动化，再创建本规则变量'
    return
  }
  const dup = variables.value.some(
    (v) => v.key === key && (v.scope === 'rule' ? 'rule' : 'global') === scope,
  )
  if (dup) {
    draftError.value = `已存在同名${scope === 'rule' ? '本规则' : '全局'}变量`
    return
  }
  busy.value = true
  error.value = ''
  try {
    await createAutomationVariable({
      key,
      name: String(draft.name || key).trim() || key,
      scope,
      ruleId: scope === 'rule' ? props.ruleId : undefined,
      type: draft.type === 'number' ? 'number' : 'string',
      value:
        draft.value === '' || draft.value == null
          ? draft.type === 'number'
            ? '0'
            : ''
          : draft.value,
    })
    resetDraft()
    showCreate.value = false
    filter.value = scope === 'rule' ? 'rule' : 'global'
    await load()
  } catch (e) {
    draftError.value = getApiErrorMessage(e, '创建失败')
  } finally {
    busy.value = false
  }
}

/**
 * 进入编辑态：将变量值回填到 editForm
 * @param {Object} v 待编辑的变量
 */
function startEdit(v) {
  editingId.value = v.id
  editForm.name = v.name || v.key
  editForm.type = v.type === 'number' ? 'number' : 'string'
  editForm.value = v.value == null ? '' : String(v.value)
}

/** 取消编辑：清空 editingId */
function cancelEdit() {
  editingId.value = null
}

/**
 * 保存编辑结果：调用后端更新变量，成功后退出编辑态并刷新列表
 * @param {Object} v 正在编辑的变量
 */
async function saveEdit(v) {
  busy.value = true
  error.value = ''
  try {
    await updateAutomationVariable(v.id, {
      name: String(editForm.name || v.key).trim() || v.key,
      type: editForm.type === 'number' ? 'number' : 'string',
      value: editForm.value,
    })
    editingId.value = null
    await load()
  } catch (e) {
    error.value = getApiErrorMessage(e, '保存失败')
  } finally {
    busy.value = false
  }
}

/**
 * 删除变量：弹二次确认后调用后端删除，成功后刷新列表
 * @param {Object} v 待删除的变量
 */
async function confirmRemove(v) {
  const ok = await chrome.confirm(
    `确定删除「${v.key}」？\n作用域：${v.scope === 'rule' ? '本规则' : '全局'}`,
    '删除变量',
    { type: 'danger', confirmText: '删除' },
  )
  if (!ok) return
  busy.value = true
  error.value = ''
  try {
    await deleteAutomationVariable(v.id)
    if (editingId.value === v.id) editingId.value = null
    await load()
  } catch (e) {
    error.value = getApiErrorMessage(e, '删除失败')
  } finally {
    busy.value = false
  }
}

/**
 * 确保指定变量已声明：若不存在则按入参创建，供自动化编辑器在引用未声明变量时自动补建
 * @param {{key:string, scope?:string, type?:string, value?:string}} opts 变量声明入参
 * @returns {Promise<Object|null>} 命中或新建的变量对象，失败返回 null
 */
async function ensureDeclared({ key, scope = 'global', type = 'string', value = '' }) {
  const k = String(key || '').trim()
  if (!k) return null
  const sc = scope === 'rule' ? 'rule' : 'global'
  if (sc === 'rule' && !props.ruleId) {
    error.value = '请先保存自动化再创建本规则变量'
    return null
  }
  const exists = variables.value.find(
    (v) => v.key === k && (v.scope === 'rule' ? 'rule' : 'global') === sc,
  )
  if (exists) return exists
  busy.value = true
  error.value = ''
  try {
    await createAutomationVariable({
      key: k,
      name: k,
      scope: sc,
      ruleId: sc === 'rule' ? props.ruleId : undefined,
      type: type === 'number' ? 'number' : 'string',
      value,
    })
    await load()
    return variables.value.find(
      (v) => v.key === k && (v.scope === 'rule' ? 'rule' : 'global') === sc,
    )
  } catch (e) {
    error.value = getApiErrorMessage(e, '创建失败')
    return null
  } finally {
    busy.value = false
  }
}

onMounted(load)
// 规则 ID 变化时重载：本规则变量随 ruleId 改变
watch(
  () => props.ruleId,
  () => {
    if (!props.ruleId && draft.scope === 'rule') draft.scope = 'global'
    load()
  },
)
// 外部 openCreate 拉起时同步展开新建表单
watch(
  () => props.openCreate,
  (v) => {
    if (v) showCreate.value = true
  },
)

defineExpose({ load, variables, ensureDeclared, openCreate: () => (showCreate.value = true) })
</script>

<style scoped>
.avp {
  --avp-line: rgba(148, 163, 184, 0.2);
  --avp-bg: rgba(15, 23, 42, 0.55);
  --avp-bg-soft: rgba(30, 41, 59, 0.55);
  --avp-accent: #60a5fa;
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 0;
  color: #e2e8f0;
}
.avp-head h4 {
  margin: 0;
  font-size: var(--premium-fs-body);
  font-weight: 600;
  letter-spacing: 0.01em;
}
.avp-sub {
  margin: 6px 0 0;
  font-size: var(--premium-fs-micro);
  line-height: 1.45;
  color: #94a3b8;
}
.avp-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  justify-content: space-between;
}
.avp-tabs {
  display: inline-flex;
  padding: 3px;
  border-radius: var(--hos-radius-card);
  background: rgba(15, 23, 42, 0.7);
  border: 1px solid var(--avp-line);
}
.avp-tab {
  border: 0;
  background: transparent;
  color: #94a3b8;
  border-radius: 8px;
  padding: 5px 10px;
  font-size: var(--premium-fs-micro);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 5px;
}
.avp-tab em {
  font-style: normal;
  min-width: 1.1em;
  text-align: center;
  font-size: var(--premium-fs-micro);
  opacity: 0.7;
}
.avp-tab.is-active {
  background: rgba(59, 130, 246, 0.22);
  color: #e2e8f0;
}
.avp-bar-right {
  display: flex;
  align-items: center;
  gap: 6px;
}
.avp-search-wrap {
  position: relative;
  display: flex;
  align-items: center;
}
.avp-search-ico {
  position: absolute;
  left: 8px;
  opacity: 0.45;
  font-size: var(--premium-fs-micro);
  pointer-events: none;
}
.avp-search {
  width: 118px;
  padding: 6px 8px 6px 24px;
  border-radius: 8px;
  border: 1px solid var(--avp-line);
  background: var(--avp-bg);
  color: inherit;
  font-size: var(--premium-fs-micro);
}
.avp-search:focus {
  outline: none;
  border-color: rgba(96, 165, 250, 0.55);
}
.avp-icon-btn,
.avp-primary-btn,
.avp-ghost-btn,
.avp-chip-btn {
  border-radius: 8px;
  font-size: var(--premium-fs-micro);
  cursor: pointer;
  transition: background 0.12s ease, border-color 0.12s ease, color 0.12s ease;
}
.avp-icon-btn {
  width: 30px;
  height: 30px;
  border: 1px solid var(--avp-line);
  background: var(--avp-bg);
  color: #cbd5e1;
}
.avp-icon-btn:hover {
  background: var(--avp-bg-soft);
}
.avp-primary-btn {
  height: 30px;
  padding: 0 12px;
  border: 1px solid rgba(96, 165, 250, 0.45);
  background: rgba(59, 130, 246, 0.22);
  color: #dbeafe;
  font-weight: 500;
}
.avp-primary-btn:hover,
.avp-primary-btn.is-on {
  background: rgba(59, 130, 246, 0.35);
}
.avp-primary-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
.avp-ghost-btn {
  height: 30px;
  padding: 0 10px;
  border: 1px solid transparent;
  background: transparent;
  color: #94a3b8;
}
.avp-ghost-btn:hover {
  color: #e2e8f0;
  background: rgba(148, 163, 184, 0.12);
}
.avp-create {
  padding: 14px;
  border-radius: var(--hos-radius-card);
  border: 1px solid rgba(96, 165, 250, 0.28);
  background: linear-gradient(180deg, rgba(59, 130, 246, 0.12), rgba(15, 23, 42, 0.35));
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.avp-create-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
}
.avp-create-title {
  margin: 0;
  font-size: var(--premium-fs-caption);
  font-weight: 600;
  color: #93c5fd;
}
.avp-create-hint {
  font-size: var(--premium-fs-micro);
  color: #64748b;
  flex: 0 1 auto;
  text-align: right;
  line-height: 1.3;
}
.avp-create-grid,
.avp-edit {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 12px 10px;
}
.avp-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: var(--premium-fs-micro);
  min-width: 0;
}
.avp-field--wide {
  grid-column: 1 / -1;
}
.avp-field > span {
  color: #94a3b8;
  font-size: var(--premium-fs-micro);
  line-height: 1.2;
  letter-spacing: 0.02em;
}
.avp-field input {
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
  min-height: 34px;
  padding: 7px 10px;
  border-radius: 8px;
  border: 1px solid var(--avp-line);
  background: rgba(2, 6, 23, 0.55);
  color: #e2e8f0;
  font-size: var(--premium-fs-micro);
  line-height: 1.3;
}
.avp-field input.avp-input--mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  letter-spacing: 0.01em;
}
.avp-field input::placeholder {
  color: #64748b;
  opacity: 1;
}
.avp-field input:focus {
  outline: none;
  border-color: rgba(96, 165, 250, 0.55);
  background: rgba(2, 6, 23, 0.7);
}
.avp-create-actions,
.avp-edit-actions {
  display: flex;
  gap: 8px;
  align-items: center;
  justify-content: flex-end;
  padding-top: 2px;
}
.avp-create-actions .avp-ghost-btn {
  height: 30px;
  padding: 0 12px;
  border: 1px solid var(--avp-line);
  background: rgba(15, 23, 42, 0.45);
  color: #cbd5e1;
}
.avp-create-actions .avp-ghost-btn:hover {
  color: #f8fafc;
  background: rgba(148, 163, 184, 0.14);
  border-color: rgba(148, 163, 184, 0.35);
}
.avp-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
  overflow: auto;
  min-height: 0;
  flex: 1 1 auto;
}
.avp-card {
  padding: 11px 12px;
  border-radius: var(--hos-radius-card);
  border: 1px solid var(--avp-line);
  background: rgba(15, 23, 42, 0.55);
  transition: border-color 0.12s ease, background 0.12s ease;
}
.avp-card:hover {
  border-color: rgba(148, 163, 184, 0.35);
  background: rgba(30, 41, 59, 0.45);
}
.avp-card.is-editing {
  border-color: rgba(96, 165, 250, 0.4);
  background: rgba(59, 130, 246, 0.08);
}
.avp-card-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}
.avp-id {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  min-width: 0;
}
.avp-key {
  font-size: var(--premium-fs-caption);
  font-weight: 600;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  letter-spacing: 0.01em;
}
.avp-badge {
  font-size: var(--premium-fs-micro);
  padding: 2px 7px;
  border-radius: var(--hos-radius-pill);
  border: 1px solid transparent;
}
.avp-badge.is-global {
  color: #7dd3fc;
  background: rgba(14, 165, 233, 0.12);
  border-color: rgba(56, 189, 248, 0.25);
}
.avp-badge.is-rule {
  color: #c4b5fd;
  background: rgba(139, 92, 246, 0.14);
  border-color: rgba(167, 139, 250, 0.28);
}
.avp-type {
  font-size: var(--premium-fs-micro);
  color: #64748b;
}
.avp-value {
  flex: 0 0 auto;
  max-width: 42%;
  padding: 3px 8px;
  border-radius: 6px;
  background: rgba(16, 185, 129, 0.1);
  color: #86efac;
  font-size: var(--premium-fs-micro);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.avp-name {
  margin: 6px 0 0;
  font-size: var(--premium-fs-micro);
  color: #94a3b8;
}
.avp-card-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 10px;
  padding-top: 8px;
  border-top: 1px solid rgba(148, 163, 184, 0.12);
}
.avp-chip-btn {
  border: 1px solid transparent;
  background: rgba(148, 163, 184, 0.08);
  color: #cbd5e1;
  padding: 4px 8px;
  font-size: var(--premium-fs-micro);
}
.avp-chip-btn:hover {
  background: rgba(148, 163, 184, 0.16);
  color: #f8fafc;
}
.avp-chip-btn.is-danger {
  margin-left: auto;
  color: #fca5a5;
  background: rgba(248, 113, 113, 0.08);
}
.avp-chip-btn.is-danger:hover {
  background: rgba(248, 113, 113, 0.18);
  color: #fecaca;
}
.avp-err {
  margin: 0;
  color: #fca5a5;
  font-size: var(--premium-fs-micro);
}
.avp-tip {
  margin: 0;
  font-size: var(--premium-fs-micro);
  color: #fbbf24;
}
.avp-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 28px 12px;
  text-align: center;
  color: #64748b;
  font-size: var(--premium-fs-caption);
  border: 1px dashed rgba(148, 163, 184, 0.22);
  border-radius: var(--hos-radius-card);
}
.avp-empty p {
  margin: 0;
}
.avp.is-embedded .avp-bar {
  position: sticky;
  top: 0;
  z-index: 2;
  padding-bottom: 2px;
  background: linear-gradient(#0f172a 70%, rgba(15, 23, 42, 0));
}
</style>
