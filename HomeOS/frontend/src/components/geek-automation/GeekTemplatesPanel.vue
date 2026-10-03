<!--
  GeekTemplatesPanel.vue
  职责：geek-builder 系列编辑器的「模板库」主体面板。
       提供 内置模板分类浏览 / 关键字搜索 / 应用模板 / 把当前画布保存为「我的模板」，
       并支持「我的模板」的编辑、覆盖、删除；可选展示全屋/蓝图等服务端模板分组并触发安装。
  所属模块：geek-automation（自动化/场景/脚本/模板的 TemplatesDrawer 复用本面板）。
  关键依赖：
    - useChromeStore：调用全局确认弹窗（删除模板时）。
    - templates util（listGeekTemplates / saveGeekCustomTemplate / deleteGeekCustomTemplate / updateGeekCustomTemplateMeta / geekTemplateStats / isGeekGraphNonEmpty / GEEK_TEMPLATE_GROUP_LABELS）。
    - isOrchestratorTemplateInstalling：判定服务端模板是否处于安装中态。
  Props：
    - currentGraph：当前画布图，用于「保存当前」与判定是否可保存。
    - hideTitle：隐藏头部标题（用于嵌入式场景）。
    - openSave：外部触发打开「保存当前」表单。
    - serverGroups：全屋/蓝图等服务端模板分组。
    - installingId/installingSecondaryId：服务端安装中的模板 id，用于按钮态。
    - applyOnly：Hub 模式，仅应用/管理本地模板，不展示「保存当前」。
    - customOnly：仅展示「我的」本地模板（隐藏内置分类与服务端分组）。
  Emits：
    - apply：应用某个模板（载入到新画布）。
    - saved：保存/更新模板成功（带回新模板行）。
    - removed：删除模板成功（带回模板 id）。
    - install-server：点击服务端模板的安装按钮（带回模板与分组信息）。
  关键交互：
    - 顶部 tabs 按分类（全部/设备/变量/流程/逻辑/我的）过滤；服务端分组仅在「全部」下展示。
    - 搜索框匹配 name/description/id；列表项支持展开预览统计（触发/条件/动作数量与占位实体）。
    - 「我的」模板支持编辑元信息、用当前画布覆盖、删除（删除走全局确认弹窗）。
    - 「保存当前」表单内联展开；editingCustomId 非空时走覆盖保存流程。
    - defineExpose 暴露 reload 与 openSave，供外部命令式调用。
-->
<template>
  <section :class="['gtp', hideTitle && 'is-embedded']">
    <header v-if="!hideTitle" class="gtp-head">
      <div>
        <h4>{{ '模板库' }}</h4>
        <p class="gtp-sub">{{
          applyOnly
            ? '以下为本机已保存的模板，应用后将打开新建画布。'
            : '内置示例可一键载入；也可把当前画布存成「我的模板」。'
        }}</p>
      </div>
    </header>
    <p v-else-if="applyOnly" class="gtp-tip gtp-tip--bar">{{
      '以下为本机已保存的模板，应用后将打开新建画布。'
    }}</p>

    <div class="gtp-bar">
      <div class="gtp-tabs" role="tablist">
        <button
          v-for="tab in tabs"
          :key="tab.id"
          type="button"
          role="tab"
          :aria-selected="filter === tab.id"
          :class="['gtp-tab', filter === tab.id && 'is-active']"
          @click="setFilter(tab.id)"
        >
          <span>{{ tab.label }}</span>
          <em>{{ tab.count }}</em>
        </button>
      </div>
      <div class="gtp-bar-right">
        <label class="gtp-search-wrap">
          <span class="gtp-search-ico" aria-hidden="true">⌕</span>
          <input
            v-model="query"
            class="gtp-search"
            type="search"
            :placeholder="'搜索'"
          />
        </label>
        <button
          type="button"
          class="gtp-icon-btn"
          :title="'刷新'"
          @click="reload"
        >
          {{ '↻' }}
        </button>
        <button
          v-if="!applyOnly"
          type="button"
          class="gtp-primary-btn"
          :class="showSave && 'is-on'"
          :disabled="!canSaveCurrent"
          :title="canSaveCurrent ? '把当前画布存为模板' : '画布为空，无法保存'"
          @click="toggleSave"
        >
          {{ showSave ? '收起' : '保存当前' }}
        </button>
      </div>
    </div>

    <div v-if="!applyOnly && showSave" class="gtp-create">
      <p class="gtp-create-title">{{ editingCustomId ? '更新我的模板' : '保存为「我的模板」' }}</p>
      <div class="gtp-create-grid">
        <label class="gtp-field gtp-field--wide">
          <span>{{ '名称' }}</span>
          <input
            v-model="draft.name"
            :placeholder="'例如：夜间回家开灯'"
            @keyup.enter="submitSave"
          />
        </label>
        <label class="gtp-field gtp-field--wide">
          <span>{{ '说明' }}</span>
          <input v-model="draft.description" :placeholder="'可选'" />
        </label>
      </div>
      <p v-if="!canSaveCurrent" class="gtp-tip">{{ '当前画布没有触发 / 条件 / 动作，无法保存。' }}</p>
      <p v-if="draftError" class="gtp-err">{{ draftError }}</p>
      <div class="gtp-create-actions">
        <button type="button" class="gtp-primary-btn" :disabled="!canSaveCurrent" @click="submitSave">
          {{ editingCustomId ? '覆盖保存' : '保存' }}
        </button>
        <button type="button" class="gtp-ghost-btn" @click="resetDraft">{{ '清空' }}</button>
      </div>
    </div>

    <div v-if="visibleServerGroups.length" class="gtp-server">
      <div v-for="g in visibleServerGroups" :key="g.id" class="gtp-server-group">
        <h5 class="gtp-server-title">{{ g.label }}</h5>
        <ul class="gtp-list gtp-list--server">
          <li v-for="(tpl, i) in g.templates" :key="tpl.id || tpl.filename || i" class="gtp-card">
            <div class="gtp-card-top">
              <strong class="gtp-name">{{ tpl.name || tpl.filename || '未命名' }}</strong>
              <span class="gtp-badge is-builtin">{{ g.label }}</span>
            </div>
            <p v-if="tpl.description" class="gtp-desc">{{ tpl.description }}</p>
            <div class="gtp-card-actions">
              <button
                type="button"
                class="gtp-chip-btn is-primary"
                :disabled="isServerInstalling(tpl)"
                @click="
                  emit('install-server', {
                    ...tpl,
                    _groupId: g.id,
                    _raw: tpl,
                  })
                "
              >
                {{ isServerInstalling(tpl) ? '安装中…' : g.actionLabel || '安装' }}
              </button>
            </div>
          </li>
        </ul>
      </div>
    </div>

    <ul v-if="filtered.length" class="gtp-list">
      <li
        v-for="t in filtered"
        :key="t.id"
        :class="['gtp-card', expandedId === t.id && 'is-open', t.source === 'custom' && 'is-custom']"
      >
        <div class="gtp-card-top">
          <div class="gtp-id">
            <strong class="gtp-name" :title="t.name">{{ t.name }}</strong>
            <span :class="['gtp-badge', t.source === 'custom' ? 'is-custom' : 'is-builtin']">
              {{ t.source === 'custom' ? '我的' : groupLabel(t.group) }}
            </span>
          </div>
          <span class="gtp-stats">{{ statsLabel(t) }}</span>
        </div>
        <p class="gtp-desc">{{ t.description || '暂无说明' }}</p>

        <div v-if="expandedId === t.id" class="gtp-preview">
          <p>
            {{ `触发 ${statsOf(t).triggers} · 条件 ${statsOf(t).conditions} · 动作 ${statsOf(t).actions}` }}
          </p>
          <p v-if="statsOf(t).placeholders.length" class="gtp-ph">
            {{ '占位实体：' }}
            <code v-for="p in statsOf(t).placeholders" :key="p">{{ p }}</code>
          </p>
          <p v-else class="gtp-ph is-ok">{{ '无占位实体' }}</p>
        </div>

        <div v-if="editingId === t.id" class="gtp-edit">
          <label class="gtp-field gtp-field--wide">
            <span>{{ '名称' }}</span>
            <input v-model="editForm.name" />
          </label>
          <label class="gtp-field gtp-field--wide">
            <span>{{ '说明' }}</span>
            <input v-model="editForm.description" @keyup.enter="saveEdit(t)" />
          </label>
          <div class="gtp-edit-actions">
            <button type="button" class="gtp-primary-btn" @click="saveEdit(t)">{{ '保存' }}</button>
            <button type="button" class="gtp-ghost-btn" @click="cancelEdit">{{ '取消' }}</button>
          </div>
        </div>

        <div v-else class="gtp-card-actions">
          <button type="button" class="gtp-chip-btn is-primary" @click="onApply(t)">
            {{ '应用' }}
          </button>
          <button type="button" class="gtp-chip-btn" @click="toggleExpand(t.id)">
            {{ expandedId === t.id ? '收起' : '预览' }}
          </button>
          <template v-if="t.source === 'custom'">
            <button type="button" class="gtp-chip-btn" @click="startEdit(t)">{{ '编辑' }}</button>
            <button
              v-if="!applyOnly"
              type="button"
              class="gtp-chip-btn"
              @click="startOverwrite(t)"
            >
              {{ '用当前覆盖' }}
            </button>
            <button type="button" class="gtp-chip-btn is-danger" @click="confirmRemove(t)">
              {{ '删除' }}
            </button>
          </template>
        </div>
      </li>
    </ul>

    <div v-else-if="!visibleServerGroups.length" class="gtp-empty">
      <p>{{ query || filter !== 'all' ? '没有匹配的模板' : '还没有模板' }}</p>
      <button
        v-if="!applyOnly && canSaveCurrent && !query && filter === 'custom'"
        type="button"
        class="gtp-primary-btn"
        @click="showSave = true"
      >
        {{ '保存当前画布' }}
      </button>
      <p v-else-if="applyOnly && filter === 'custom'" class="gtp-tip">
        {{ '在编辑器「模板」中可把当前画布存为本机模板。' }}
      </p>
    </div>
  </section>
</template>

<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useChromeStore } from '@/stores/chrome.store'
import {
  GEEK_TEMPLATE_GROUP_LABELS,
  deleteGeekCustomTemplate,
  geekTemplateStats,
  isGeekGraphNonEmpty,
  listGeekTemplates,
  saveGeekCustomTemplate,
  updateGeekCustomTemplateMeta,
} from '@/utils/geek-automation/templates'
import { isOrchestratorTemplateInstalling } from '@/utils/orchestrator/template-installing.util'

const props = defineProps({
  /** 当前画布图，用于「保存当前」 */
  currentGraph: { type: Object, default: null },
  hideTitle: { type: Boolean, default: false },
  openSave: { type: Boolean, default: false },
  /** 全屋模板 / HA 蓝图等服务端分组 */
  serverGroups: { type: Array, default: () => [] },
  installingId: { type: String, default: '' },
  installingSecondaryId: { type: String, default: '' },
  /** Hub：仅应用/管理本地模板，不保存当前画布 */
  applyOnly: { type: Boolean, default: false },
  /** 仅展示「我的」本地模板（隐藏内置分类与服务端分组） */
  customOnly: { type: Boolean, default: false },
})

const chrome = useChromeStore()

const emit = defineEmits(['apply', 'saved', 'removed', 'install-server'])

/** 仅在安装 id 非空时匹配，避免 '' === '' 导致全部显示「安装中」 */
function isServerInstalling(tpl) {
  return isOrchestratorTemplateInstalling(tpl, {
    installingId: props.installingId,
    installingSecondaryId: props.installingSecondaryId,
  })
}

const filter = ref(props.customOnly ? 'custom' : 'all')
const query = ref('')
const showSave = ref(false)
const draftError = ref('')
const expandedId = ref('')
const editingId = ref(null)
const editingCustomId = ref('')
const items = ref([])

const draft = reactive({
  name: '',
  description: '',
})

const editForm = reactive({
  name: '',
  description: '',
})

const canSaveCurrent = computed(() => isGeekGraphNonEmpty(props.currentGraph))

const counts = computed(() => {
  const all = items.value
  return {
    all: all.length,
    device: all.filter((t) => t.group === 'device').length,
    variable: all.filter((t) => t.group === 'variable').length,
    flow: all.filter((t) => t.group === 'flow').length,
    logic: all.filter((t) => t.group === 'logic').length,
    custom: all.filter((t) => t.source === 'custom' || t.group === 'custom').length,
  }
})

const tabs = computed(() => {
  if (props.customOnly) {
    return [{ id: 'custom', label: '我的', count: counts.value.custom }]
  }
  return [
    { id: 'all', label: '全部', count: counts.value.all },
    { id: 'device', label: '设备', count: counts.value.device },
    { id: 'variable', label: '变量', count: counts.value.variable },
    { id: 'flow', label: '流程', count: counts.value.flow },
    { id: 'logic', label: '逻辑', count: counts.value.logic },
    { id: 'custom', label: '我的', count: counts.value.custom },
  ]
})

const filtered = computed(() => {
  const q = query.value.trim().toLowerCase()
  return items.value.filter((t) => {
    if (filter.value === 'custom') {
      if (t.source !== 'custom' && t.group !== 'custom') return false
    } else if (filter.value !== 'all' && t.group !== filter.value) {
      return false
    }
    if (!q) return true
    return (
      String(t.name || '')
        .toLowerCase()
        .includes(q) ||
      String(t.description || '')
        .toLowerCase()
        .includes(q) ||
      String(t.id || '')
        .toLowerCase()
        .includes(q)
    )
  })
})

/** 全屋/蓝图仅在「全部」下展示，避免切分类时上方列表不变像没反应 */
const visibleServerGroups = computed(() => {
  if (props.customOnly || filter.value !== 'all') return []
  const q = query.value.trim().toLowerCase()
  return (props.serverGroups || [])
    .map((g) => {
      const templates = (g.templates || []).filter((tpl) => {
        if (!q) return true
        const name = String(tpl.name || tpl.filename || '').toLowerCase()
        const desc = String(tpl.description || '').toLowerCase()
        const id = String(tpl.id || tpl.filename || '').toLowerCase()
        return name.includes(q) || desc.includes(q) || id.includes(q)
      })
      return { ...g, templates }
    })
    .filter((g) => g.templates.length > 0)
})

function groupLabel(group) {
  return GEEK_TEMPLATE_GROUP_LABELS[group] || '内置'
}

function setFilter(id) {
  filter.value = id
}

function statsOf(t) {
  return geekTemplateStats(t.graph)
}

function statsLabel(t) {
  const s = statsOf(t)
  return `${s.triggers}T · ${s.conditions}C · ${s.actions}A`
}

function reload() {
  items.value = listGeekTemplates()
}

function toggleSave() {
  showSave.value = !showSave.value
  if (showSave.value && !draft.name) {
    draft.name = String(props.currentGraph?.name || '').trim()
  }
}

function resetDraft() {
  draft.name = String(props.currentGraph?.name || '').trim()
  draft.description = ''
  draftError.value = ''
  editingCustomId.value = ''
}

function toggleExpand(id) {
  expandedId.value = expandedId.value === id ? '' : id
}

function onApply(t) {
  emit('apply', t)
}

function startEdit(t) {
  editingId.value = t.id
  editForm.name = t.name || ''
  editForm.description = t.description || ''
}

function cancelEdit() {
  editingId.value = null
}

function saveEdit(t) {
  const name = String(editForm.name || '').trim()
  if (!name) return
  updateGeekCustomTemplateMeta(t.id, {
    name,
    description: String(editForm.description || '').trim(),
  })
  editingId.value = null
  reload()
  emit('saved', { id: t.id, name })
}

function startOverwrite(t) {
  editingCustomId.value = t.id
  draft.name = t.name || ''
  draft.description = t.description || ''
  showSave.value = true
  filter.value = 'custom'
}

function submitSave() {
  draftError.value = ''
  if (!canSaveCurrent.value) {
    draftError.value = '画布为空，无法保存'
    return
  }
  const name = String(draft.name || '').trim()
  if (!name) {
    draftError.value = '请填写名称'
    return
  }
  const row = saveGeekCustomTemplate({
    id: editingCustomId.value || undefined,
    name,
    description: draft.description,
    graph: props.currentGraph,
  })
  showSave.value = false
  editingCustomId.value = ''
  resetDraft()
  filter.value = 'custom'
  reload()
  emit('saved', row)
}

async function confirmRemove(t) {
  const ok = await chrome.confirm(`确定删除模板「${t.name}」？`, '删除模板', {
    type: 'danger',
    confirmText: '删除',
  })
  if (!ok) return
  deleteGeekCustomTemplate(t.id)
  if (expandedId.value === t.id) expandedId.value = ''
  if (editingId.value === t.id) editingId.value = null
  reload()
  emit('removed', t.id)
}

onMounted(reload)

watch(
  () => props.openSave,
  (v) => {
    if (v) {
      showSave.value = true
      if (!draft.name) draft.name = String(props.currentGraph?.name || '').trim()
    }
  },
)

watch(
  () => props.currentGraph?.name,
  (n) => {
    if (showSave.value && !draft.name && n) draft.name = String(n)
  },
)

defineExpose({ reload, openSave: () => (showSave.value = true) })
</script>

<style scoped>
.gtp {
  --gtp-line: rgba(148, 163, 184, 0.2);
  --gtp-bg: rgba(15, 23, 42, 0.55);
  --gtp-bg-soft: rgba(30, 41, 59, 0.55);
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 0;
  color: #e2e8f0;
}
.gtp-head h4 {
  margin: 0;
  font-size: var(--premium-fs-body);
  font-weight: 600;
}
.gtp-sub {
  margin: 6px 0 0;
  font-size: var(--premium-fs-micro);
  line-height: 1.45;
  color: #94a3b8;
}
.gtp-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  justify-content: space-between;
}
.gtp-tabs {
  display: inline-flex;
  flex-wrap: wrap;
  padding: 3px;
  border-radius: var(--hos-radius-card);
  background: rgba(15, 23, 42, 0.7);
  border: 1px solid var(--gtp-line);
  gap: 2px;
}
.gtp-tab {
  border: 0;
  background: transparent;
  color: #94a3b8;
  border-radius: 8px;
  padding: 5px 8px;
  font-size: var(--premium-fs-micro);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.gtp-tab em {
  font-style: normal;
  min-width: 1em;
  text-align: center;
  font-size: var(--premium-fs-micro);
  opacity: 0.7;
}
.gtp-tab.is-active {
  background: rgba(59, 130, 246, 0.22);
  color: #e2e8f0;
}
.gtp-bar-right {
  display: flex;
  align-items: center;
  gap: 6px;
}
.gtp-search-wrap {
  position: relative;
  display: flex;
  align-items: center;
}
.gtp-search-ico {
  position: absolute;
  left: 8px;
  opacity: 0.45;
  font-size: var(--premium-fs-micro);
  pointer-events: none;
}
.gtp-search {
  width: 110px;
  padding: 6px 8px 6px 24px;
  border-radius: 8px;
  border: 1px solid var(--gtp-line);
  background: var(--gtp-bg);
  color: inherit;
  font-size: var(--premium-fs-micro);
}
.gtp-search:focus {
  outline: none;
  border-color: rgba(96, 165, 250, 0.55);
}
.gtp-icon-btn,
.gtp-primary-btn,
.gtp-ghost-btn,
.gtp-chip-btn {
  border-radius: 8px;
  font-size: var(--premium-fs-micro);
  cursor: pointer;
  transition: background 0.12s ease, border-color 0.12s ease, color 0.12s ease;
}
.gtp-icon-btn {
  width: 30px;
  height: 30px;
  border: 1px solid var(--gtp-line);
  background: var(--gtp-bg);
  color: #cbd5e1;
}
.gtp-icon-btn:hover {
  background: var(--gtp-bg-soft);
}
.gtp-primary-btn {
  height: 30px;
  padding: 0 12px;
  border: 1px solid rgba(96, 165, 250, 0.45);
  background: rgba(59, 130, 246, 0.22);
  color: #dbeafe;
  font-weight: 500;
}
.gtp-primary-btn:hover,
.gtp-primary-btn.is-on {
  background: rgba(59, 130, 246, 0.35);
}
.gtp-primary-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.gtp-ghost-btn {
  height: 30px;
  padding: 0 10px;
  border: 1px solid transparent;
  background: transparent;
  color: #94a3b8;
}
.gtp-ghost-btn:hover {
  color: #e2e8f0;
  background: rgba(148, 163, 184, 0.12);
}
.gtp-create {
  padding: 12px;
  border-radius: var(--hos-radius-card);
  border: 1px solid rgba(96, 165, 250, 0.28);
  background: linear-gradient(180deg, rgba(59, 130, 246, 0.12), rgba(15, 23, 42, 0.35));
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.gtp-create-title {
  margin: 0;
  font-size: var(--premium-fs-micro);
  font-weight: 600;
  color: #93c5fd;
}
.gtp-create-grid,
.gtp-edit {
  display: grid;
  grid-template-columns: 1fr;
  gap: 8px;
}
.gtp-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: var(--premium-fs-micro);
}
.gtp-field--wide {
  grid-column: 1 / -1;
}
.gtp-field > span {
  color: #94a3b8;
  font-size: var(--premium-fs-micro);
}
.gtp-field input {
  padding: 7px 9px;
  border-radius: 8px;
  border: 1px solid var(--gtp-line);
  background: rgba(2, 6, 23, 0.45);
  color: inherit;
  font-size: var(--premium-fs-micro);
}
.gtp-field input:focus {
  outline: none;
  border-color: rgba(96, 165, 250, 0.55);
}
.gtp-create-actions,
.gtp-edit-actions {
  display: flex;
  gap: 8px;
}
.gtp-tip {
  margin: 0;
  font-size: var(--premium-fs-micro);
  color: #fbbf24;
}
.gtp-err {
  margin: 0;
  font-size: var(--premium-fs-micro);
  color: #f87171;
}
.gtp-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.gtp-card {
  padding: 10px 12px;
  border-radius: var(--hos-radius-card);
  border: 1px solid var(--gtp-line);
  background: var(--gtp-bg);
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.gtp-card.is-custom {
  border-color: rgba(52, 211, 153, 0.28);
}
.gtp-card.is-open {
  border-color: rgba(96, 165, 250, 0.4);
  background: rgba(30, 41, 59, 0.72);
}
.gtp-card-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
}
.gtp-id {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  min-width: 0;
}
.gtp-name {
  font-size: var(--premium-fs-caption);
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 180px;
}
.gtp-badge {
  font-size: var(--premium-fs-micro);
  padding: 2px 6px;
  border-radius: var(--hos-radius-pill);
  border: 1px solid transparent;
}
.gtp-badge.is-builtin {
  color: #93c5fd;
  background: rgba(59, 130, 246, 0.15);
  border-color: rgba(59, 130, 246, 0.28);
}
.gtp-badge.is-custom {
  color: #6ee7b7;
  background: rgba(16, 185, 129, 0.14);
  border-color: rgba(52, 211, 153, 0.28);
}
.gtp-stats {
  flex: 0 0 auto;
  font-size: var(--premium-fs-micro);
  color: #94a3b8;
  font-variant-numeric: tabular-nums;
}
.gtp-desc {
  margin: 0;
  font-size: var(--premium-fs-micro);
  line-height: 1.4;
  color: #94a3b8;
}
.gtp-preview {
  padding: 8px 10px;
  border-radius: 8px;
  background: rgba(2, 6, 23, 0.4);
  border: 1px solid rgba(148, 163, 184, 0.14);
  font-size: var(--premium-fs-micro);
  color: #cbd5e1;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.gtp-preview p {
  margin: 0;
}
.gtp-ph code {
  display: inline-block;
  margin: 2px 4px 0 0;
  padding: 1px 5px;
  border-radius: 4px;
  background: rgba(251, 191, 36, 0.12);
  color: #fcd34d;
  font-size: var(--premium-fs-micro);
}
.gtp-ph.is-ok {
  color: #6ee7b7;
}
.gtp-card-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 2px;
}
.gtp-chip-btn {
  height: 26px;
  padding: 0 9px;
  border: 1px solid var(--gtp-line);
  background: rgba(30, 41, 59, 0.7);
  color: #cbd5e1;
}
.gtp-chip-btn:hover {
  background: rgba(51, 65, 85, 0.9);
  color: #f8fafc;
}
.gtp-chip-btn.is-primary {
  border-color: rgba(96, 165, 250, 0.45);
  background: rgba(59, 130, 246, 0.22);
  color: #dbeafe;
}
.gtp-chip-btn.is-danger {
  border-color: rgba(248, 113, 113, 0.35);
  color: #fca5a5;
}
.gtp-chip-btn.is-danger:hover {
  background: rgba(239, 68, 68, 0.18);
}
.gtp-empty {
  padding: 28px 12px;
  text-align: center;
  color: #94a3b8;
  font-size: var(--premium-fs-caption);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
}
.gtp-empty p {
  margin: 0;
}
.gtp-server {
  display: flex;
  flex-direction: column;
  gap: 14px;
  margin-bottom: 14px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--gtp-line, rgba(148, 163, 184, 0.2));
}
.gtp-server-title {
  margin: 0 0 8px;
  font-size: var(--premium-fs-micro);
  font-weight: 600;
  color: #93c5fd;
}
.gtp-list--server {
  margin: 0;
}
</style>
