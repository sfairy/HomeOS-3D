<!--
  脚本 / 场景本地「我的模板」：保存当前画布、应用、覆盖、删除。
  服务端内置模板仍由 OrchestratorTemplateLibrary 负责。
-->
<template>
  <section class="oltp">
    <header class="oltp-head">
      <div>
        <h4>{{ title }}</h4>
        <p class="oltp-sub">{{
          applyOnly
            ? '以下为本机已保存的模板，应用后将打开新建画布。'
            : '把当前画布存到本机，随时一键载入。'
        }}</p>
      </div>
      <button
        v-if="!applyOnly"
        type="button"
        class="oltp-primary-btn"
        :class="showSave && 'is-on'"
        :disabled="!canSaveCurrent"
        :title="canSaveCurrent ? '把当前画布存为模板' : emptyHint"
        @click="toggleSave"
      >
        {{ showSave ? '收起' : '保存当前' }}
      </button>
    </header>

    <div v-if="!applyOnly && showSave" class="oltp-create">
      <p class="oltp-create-title">{{ editingCustomId ? '更新我的模板' : '保存为「我的模板」' }}</p>
      <label class="oltp-field">
        <span>{{ '名称' }}</span>
        <input v-model="draft.name" :placeholder="namePlaceholder" @keyup.enter="submitSave" />
      </label>
      <label class="oltp-field">
        <span>{{ '说明' }}</span>
        <input v-model="draft.description" :placeholder="'可选'" />
      </label>
      <p v-if="!canSaveCurrent" class="oltp-tip">{{ emptyHint }}</p>
      <p v-if="draftError" class="oltp-err">{{ draftError }}</p>
      <div class="oltp-actions">
        <button type="button" class="oltp-primary-btn" :disabled="!canSaveCurrent" @click="submitSave">
          {{ editingCustomId ? '覆盖保存' : '保存' }}
        </button>
        <button type="button" class="oltp-ghost-btn" @click="resetDraft">{{ '清空' }}</button>
      </div>
    </div>

    <ul v-if="items.length" class="oltp-list">
      <li v-for="t in items" :key="t.id" class="oltp-card">
        <div class="oltp-card-top">
          <strong class="oltp-name" :title="t.name">{{ t.name }}</strong>
          <span class="oltp-stats">{{ statsLabel(t) }}</span>
        </div>
        <p class="oltp-desc">{{ t.description || '暂无说明' }}</p>

        <div v-if="editingId === t.id" class="oltp-edit">
          <label class="oltp-field">
            <span>{{ '名称' }}</span>
            <input v-model="editForm.name" />
          </label>
          <label class="oltp-field">
            <span>{{ '说明' }}</span>
            <input v-model="editForm.description" @keyup.enter="saveEdit(t)" />
          </label>
          <div class="oltp-actions">
            <button type="button" class="oltp-primary-btn" @click="saveEdit(t)">{{ '保存' }}</button>
            <button type="button" class="oltp-ghost-btn" @click="cancelEdit">{{ '取消' }}</button>
          </div>
        </div>

        <div v-else class="oltp-card-actions">
          <button type="button" class="oltp-chip-btn is-primary" @click="onApply(t)">{{ '应用' }}</button>
          <button type="button" class="oltp-chip-btn" @click="startEdit(t)">{{ '编辑' }}</button>
          <button
            v-if="!applyOnly"
            type="button"
            class="oltp-chip-btn"
            @click="startOverwrite(t)"
          >
            {{ '用当前覆盖' }}
          </button>
          <button type="button" class="oltp-chip-btn is-danger" @click="confirmRemove(t)">{{ '删除' }}</button>
        </div>
      </li>
    </ul>

    <div v-else class="oltp-empty">
      <p>{{ '还没有我的模板' }}</p>
      <button
        v-if="!applyOnly && canSaveCurrent"
        type="button"
        class="oltp-primary-btn"
        @click="showSave = true"
      >
        {{ '保存当前画布' }}
      </button>
      <p v-else-if="applyOnly" class="oltp-sub">{{ '在编辑器「模板」中可把当前画布存为本机模板。' }}</p>
    </div>
  </section>
</template>

<script setup>
/**
 * OrchestratorLocalTemplatesPanel.vue
 *
 * 所属模块：dashboard / Orchestrator（联动编排器）
 * 职责：脚本/场景的本地「我的模板」面板。保存当前画布、应用、覆盖、删除本机模板。
 *      支持 Hub 等只读场景（applyOnly）：仅应用/编辑元数据/删除，不保存当前画布。
 *      服务端内置模板由 OrchestratorTemplateLibrary 负责展示。
 * 依赖：vue、chrome.store（确认弹窗）、local-canvas-templates.util（模板 CRUD）。
 */
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useChromeStore } from '@/stores/chrome.store'
import {
  deleteLocalCanvasTemplate,
  isLocalCanvasGraphNonEmpty,
  listLocalCanvasTemplates,
  localCanvasTemplateStats,
  saveLocalCanvasTemplate,
  updateLocalCanvasTemplateMeta,
} from '@/utils/orchestrator/local-canvas-templates.util'

/**
 * 组件 Props
 * @property {string}  kind           - 模板类型：'script' 或 'scene'
 * @property {object}  currentGraph    - 当前画布对象（用于保存/覆盖）
 * @property {object}  currentMeta     - 当前元数据 { fields?, scriptDesc?, runOnHa? }
 * @property {string}  title           - 面板标题
 * @property {string}  namePlaceholder - 名称输入框 placeholder
 * @property {string}  emptyHint       - 画布为空时的提示文案
 * @property {boolean} applyOnly       - Hub 等只读场景：不保存当前画布
 */
const props = defineProps({
  /** script | scene */
  kind: { type: String, required: true },
  currentGraph: { type: Object, default: null },
  /** 脚本/场景：{ fields?, scriptDesc?, runOnHa? } */
  currentMeta: { type: Object, default: null },
  title: { type: String, default: '我的模板' },
  namePlaceholder: { type: String, default: '例如：常用序列' },
  emptyHint: { type: String, default: '画布为空，无法保存' },
  /** Hub 等只读场景：仅应用/编辑元数据/删除，不保存当前画布 */
  applyOnly: { type: Boolean, default: false },
})

/** 事件：apply（应用模板）/saved（保存完成）/removed（删除完成） */
const emit = defineEmits(['apply', 'saved', 'removed'])

const chrome = useChromeStore()

// 模板列表与表单状态
const items = ref([])
const showSave = ref(false)
const draftError = ref('')
const editingId = ref(null)
const editingCustomId = ref('')

// 新建/覆盖表单与行内编辑表单
const draft = reactive({ name: '', description: '' })
const editForm = reactive({ name: '', description: '' })

/** 当前画布是否可保存（非空判定由 isLocalCanvasGraphNonEmpty 处理） */
const canSaveCurrent = computed(() =>
  isLocalCanvasGraphNonEmpty(props.kind, props.currentGraph),
)

/** 重新加载本机模板列表 */
function reload() {
  items.value = listLocalCanvasTemplates(props.kind)
}

/**
 * 模板统计文案（如「3 节点 · 2 触发」）
 * @param {object} t - 模板对象
 * @returns {string}
 */
function statsLabel(t) {
  return localCanvasTemplateStats(props.kind, t.graph).label
}

/** 切换显示/收起保存表单，首次展开时用画布名预填名称 */
function toggleSave() {
  showSave.value = !showSave.value
  if (showSave.value && !draft.name) {
    draft.name = String(props.currentGraph?.name || '').trim()
  }
}

/** 重置新建/覆盖表单，名称回退为画布名 */
function resetDraft() {
  draft.name = String(props.currentGraph?.name || '').trim()
  draft.description = ''
  draftError.value = ''
  editingCustomId.value = ''
}

/** 应用模板（向父级 emit apply） */
function onApply(t) {
  emit('apply', t)
}

/** 进入行内编辑模式，预填名称/说明 */
function startEdit(t) {
  editingId.value = t.id
  editForm.name = t.name || ''
  editForm.description = t.description || ''
}

/** 取消行内编辑 */
function cancelEdit() {
  editingId.value = null
}

/**
 * 保存行内编辑结果（仅更新元数据）
 * @param {object} t - 模板对象
 */
function saveEdit(t) {
  const name = String(editForm.name || '').trim()
  if (!name) return
  updateLocalCanvasTemplateMeta(props.kind, t.id, {
    name,
    description: String(editForm.description || '').trim(),
  })
  editingId.value = null
  reload()
  emit('saved', { id: t.id, name })
}

/**
 * 进入「用当前覆盖」模式：将表单切换为覆盖指定模板
 * @param {object} t - 被覆盖的模板对象
 */
function startOverwrite(t) {
  editingCustomId.value = t.id
  draft.name = t.name || ''
  draft.description = t.description || ''
  showSave.value = true
}

/**
 * 提交保存（新建或覆盖）
 * 校验画布非空 + 名称非空，调用 saveLocalCanvasTemplate 持久化，
 * 完成后关闭表单、重置草稿、刷新列表并 emit saved
 */
function submitSave() {
  draftError.value = ''
  if (!canSaveCurrent.value) {
    draftError.value = props.emptyHint
    return
  }
  const name = String(draft.name || '').trim()
  if (!name) {
    draftError.value = '请填写名称'
    return
  }
  const row = saveLocalCanvasTemplate({
    kind: props.kind,
    id: editingCustomId.value || undefined,
    name,
    description: draft.description,
    graph: props.currentGraph,
    meta: props.currentMeta || undefined,
  })
  showSave.value = false
  editingCustomId.value = ''
  resetDraft()
  reload()
  emit('saved', row)
}

/**
 * 删除模板（二次确认）
 * 调用 chrome.confirm 弹窗确认后从本机存储删除，并 emit removed
 * @param {object} t - 待删除模板对象
 */
async function confirmRemove(t) {
  const ok = await chrome.confirm(`确定删除模板「${t.name}」？`, '删除模板', {
    type: 'danger',
    confirmText: '删除',
  })
  if (!ok) return
  deleteLocalCanvasTemplate(props.kind, t.id)
  if (editingId.value === t.id) editingId.value = null
  reload()
  emit('removed', t.id)
}

onMounted(reload)

// 类型切换时重新加载列表
watch(
  () => props.kind,
  () => reload(),
)

// 画布名变化且当前未填名称时，自动同步到草稿
watch(
  () => props.currentGraph?.name,
  (n) => {
    if (showSave.value && !draft.name && n) draft.name = String(n)
  },
)

defineExpose({ reload })
</script>

<style scoped>
.oltp {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-height: 0;
  color: #e2e8f0;
}
.oltp-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
}
.oltp-head h4 {
  margin: 0;
  font-size: var(--premium-fs-caption);
  font-weight: 600;
}
.oltp-sub {
  margin: 4px 0 0;
  font-size: var(--premium-fs-micro);
  line-height: 1.4;
  color: #94a3b8;
}
.oltp-primary-btn,
.oltp-ghost-btn,
.oltp-chip-btn {
  border-radius: 8px;
  font-size: var(--premium-fs-micro);
  cursor: pointer;
}
.oltp-primary-btn {
  height: 28px;
  padding: 0 10px;
  border: 1px solid rgba(96, 165, 250, 0.45);
  background: rgba(59, 130, 246, 0.22);
  color: #dbeafe;
  font-weight: 500;
  flex-shrink: 0;
}
.oltp-primary-btn.is-on,
.oltp-primary-btn:hover {
  background: rgba(59, 130, 246, 0.35);
}
.oltp-primary-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.oltp-ghost-btn {
  height: 28px;
  padding: 0 10px;
  border: 1px solid transparent;
  background: transparent;
  color: #94a3b8;
}
.oltp-create,
.oltp-edit {
  padding: 10px;
  border-radius: var(--hos-radius-card);
  border: 1px solid rgba(96, 165, 250, 0.28);
  background: rgba(59, 130, 246, 0.1);
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.oltp-create-title {
  margin: 0;
  font-size: var(--premium-fs-micro);
  font-weight: 600;
  color: #93c5fd;
}
.oltp-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: var(--premium-fs-micro);
}
.oltp-field > span {
  color: #94a3b8;
  font-size: var(--premium-fs-micro);
}
.oltp-field input {
  padding: 6px 8px;
  border-radius: 8px;
  border: 1px solid rgba(148, 163, 184, 0.2);
  background: rgba(2, 6, 23, 0.45);
  color: inherit;
  font-size: var(--premium-fs-micro);
}
.oltp-actions {
  display: flex;
  gap: 8px;
}
.oltp-tip {
  margin: 0;
  font-size: var(--premium-fs-micro);
  color: #fbbf24;
}
.oltp-err {
  margin: 0;
  font-size: var(--premium-fs-micro);
  color: #f87171;
}
.oltp-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.oltp-card {
  padding: 10px;
  border-radius: var(--hos-radius-card);
  border: 1px solid rgba(52, 211, 153, 0.28);
  background: rgba(15, 23, 42, 0.55);
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.oltp-card-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
}
.oltp-name {
  font-size: var(--premium-fs-caption);
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 160px;
}
.oltp-stats {
  font-size: var(--premium-fs-micro);
  color: #94a3b8;
  flex-shrink: 0;
}
.oltp-desc {
  margin: 0;
  font-size: var(--premium-fs-micro);
  color: #94a3b8;
  line-height: 1.4;
}
.oltp-card-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.oltp-chip-btn {
  height: 26px;
  padding: 0 8px;
  border: 1px solid rgba(148, 163, 184, 0.2);
  background: rgba(30, 41, 59, 0.7);
  color: #cbd5e1;
}
.oltp-chip-btn.is-primary {
  border-color: rgba(96, 165, 250, 0.45);
  background: rgba(59, 130, 246, 0.22);
  color: #dbeafe;
}
.oltp-chip-btn.is-danger {
  border-color: rgba(248, 113, 113, 0.35);
  color: #fca5a5;
}
.oltp-empty {
  padding: 16px 8px;
  text-align: center;
  color: #94a3b8;
  font-size: var(--premium-fs-micro);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}
.oltp-empty p {
  margin: 0;
}
</style>
