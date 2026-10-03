<!--
  GlobalSearchPalette.vue
  职责：全局「设备 / 场景 / 设置」搜索命令面板（类 Spotlight / Ctrl+K）。
       顶栏搜索按钮或 Ctrl+K / Cmd+K 唤起；支持键盘上下选择 + 回车直达：
       设备 → 打开控制弹窗；场景 → 立即执行；设置 → 深链跳转。
  所属模块：global-search。
  关键依赖：
    - @lucide/vue 的 Search / Settings / Sparkles / Lightbulb / Loader2 / X / CornerDownLeft：图标。
    - useEntitiesStore：实体索引，用于设备搜索。
    - useChromeStore：全局通知与设备控制弹窗。
    - vue-router（useRouter）：设置深链跳转。
    - useShellTeleportTarget：Teleport 到缩放壳 #teleport-target。
    - fetchOrchestratorList / executeScene：场景列表加载与执行。
    - settings-nav.util（NAV_STRUCTURE / tabLabel）+ settings-route.util（SETTINGS_ROUTES）：设置项分组与深链。
    - getDomainLabel / getEntityDisplayName / getEntityDomain：设备域标签与友好名。
  Props：
    - open：面板开关。
  Emits：close —— 关闭面板（Esc / 遮罩点击 / 选中后均触发）。
  关键交互：
    - 设备搜索 150ms 防抖（实体可达数千条，逐键 O(n) 过滤会卡顿）；回车直达前强制同步一次防抖。
    - 结果扁平化为 device / scene / setting 三类，按上下方向键导航，回车执行对应动作。
    - 焦点陷阱：Tab / Shift+Tab 在面板内循环；Escape 关闭；输入框打开时自动聚焦。
    - 场景列表首次打开时懒加载，失败时弹出错误通知。
-->
<script setup>
/**
 * 所属模块：frontend/components
 * 职责：实现 GlobalSearchPalette 组件的界面渲染、用户交互与 props/emit 通信。
 * 关键依赖：Vue 3 `<script setup>`、Pinia stores（按需）、类型定义、Lucide 图标与 i18n 标签。
 * 约定：- 所有对外属性统一走 defineProps 泛型，emit 使用 defineEmits<...>()；
  - 不直接操作 DOM，响应式数据变化通过 v-model 或乐观锁写回 store。
 */
import { computed, nextTick, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import {
  Search,
  Settings as SettingsIcon,
  Sparkles,
  Lightbulb,
  Loader2,
  X,
  CornerDownLeft,
} from '@lucide/vue'
import { useEntitiesStore } from '@/stores/entities.store'
import { useChromeStore } from '@/stores/chrome.store'
import { getEntityDomain } from '@homeos/shared'
import { useShellTeleportTarget } from '@/composables/ui/useShellTeleportTarget'
import { fetchOrchestratorList, executeScene } from '@/services/api/orchestrator'
import { NAV_STRUCTURE } from '@/utils/registry/settings-nav.util'
import { tabLabel } from '@/utils/registry/settings-nav.util'
import { SETTINGS_ROUTES } from '@/utils/registry/settings-route.util'
import { getDomainLabel } from '@/utils/device/domain-labels.util'
import { getEntityDisplayName } from '@/utils/entity/derived.util'

const props = defineProps({
  open: { type: Boolean, default: false },
})
const emit = defineEmits(['close'])

const router = useRouter()
const entitiesStore = useEntitiesStore()
const chrome = useChromeStore()

// 缩放壳 #teleport-target 就绪后再启用 Teleport：避免首帧导航时目标未挂载导致告警
const { teleportTarget, shellTeleportPending } = useShellTeleportTarget()
const teleportDisabled = shellTeleportPending

const query = ref('')
const inputRef = ref(null)
const rootRef = ref(null)
const listRef = ref(null)
const scenes = ref([])
const scenesLoading = ref(false)
const scenesLoaded = ref(false)
const scenesError = ref(false)
const activeIndex = ref(0)

// ── 设备搜索防抖：实体列表可达数千条，逐键 O(n) 过滤会造成输入卡顿 ──
const debouncedQuery = ref('')
let debounceTimer = null
watch(query, () => {
  activeIndex.value = 0
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    debouncedQuery.value = query.value
  }, 150)
})
/** 回车直达前强制同步一次，避免命中上一轮的防抖查询 */
function syncQueryNow() {
  if (debounceTimer) clearTimeout(debounceTimer)
  debouncedQuery.value = query.value
}

/** 设置面板深链（与设置总览一致） */
const TAB_DEEP_LINKS = {
  favorites: () => SETTINGS_ROUTES.favorites(),
  general: () => SETTINGS_ROUTES.general(),
  params: () => SETTINGS_ROUTES.params(),
  profiles: () => SETTINGS_ROUTES.profiles(),
  orchestrator: () => SETTINGS_ROUTES.orchestrator(),
  'home-mode': () => SETTINGS_ROUTES.homeMode(),
  bindings: () => SETTINGS_ROUTES.bindings(),
  'life-accounts': () => SETTINGS_ROUTES.lifeAccounts(),
  'env-health': () => SETTINGS_ROUTES.envHealth(),
  rooms: () => SETTINGS_ROUTES.rooms(),
  layout: () => SETTINGS_ROUTES.layout(),
  alerts: () => SETTINGS_ROUTES.alerts(),
  'security-modes': () => SETTINGS_ROUTES.securityModes(),
  'smart-services': () => SETTINGS_ROUTES.smartServices(),
  voice: () => SETTINGS_ROUTES.voice(),
  agent: () => SETTINGS_ROUTES.agent(),
  diagnostics: () => SETTINGS_ROUTES.diagnostics(),
  connection: () => SETTINGS_ROUTES.connection(),
  'setup-wizard': () => SETTINGS_ROUTES.setupWizard(),
  access: () => SETTINGS_ROUTES.access(),
  widgets: () => SETTINGS_ROUTES.widgets(),
  assets: () => SETTINGS_ROUTES.assets(),
  embeds: () => SETTINGS_ROUTES.embeds(),
  'execution-history': () => SETTINGS_ROUTES.executionHistory(),
  'smart-charge': () => SETTINGS_ROUTES.smartCharge(),
  family: () => SETTINGS_ROUTES.family(),
  floating: () => SETTINGS_ROUTES.floating(),
}

const settingsEntries = computed(() =>
  NAV_STRUCTURE.flatMap((g) =>
    g.tabs
      .filter((id) => TAB_DEEP_LINKS[id])
      .map((id) => ({ id, label: tabLabel(id), group: g.label })),
  ),
)

function entityName(eid, entity) {
  return getEntityDisplayName(eid, entity) || ''
}

function normalize(s) {
  return String(s || '').toLowerCase().trim()
}

/** 设备结果：按友好名 / entity_id 前缀匹配，限制 12 条（基于防抖后的关键字，避免逐键全量遍历） */
const matchedDeviceEids = computed(() => {
  const q = normalize(debouncedQuery.value)
  if (!q) return []
  // 显式依赖实体集合的键集合（shallowReactive 下键增删触发、值替换不触发）：
  // 避免任意状态变更都触发全表重扫；匹配出的 eid 在模板中按 key 级响应读取实时实体
  void Object.keys(entitiesStore.entities)
  const raw = entitiesStore.getEntities()
  const out = []
  for (const eid of Object.keys(raw)) {
    const entity = raw[eid]
    if (!entity) continue
    const name = normalize(entityName(eid, entity))
    const id = normalize(eid)
    if (name.includes(q) || id.includes(q)) {
      out.push(eid)
      if (out.length >= 12) break
    }
  }
  return out
})

/** 场景结果：按名称匹配 */
const sceneResults = computed(() => {
  const q = normalize(query.value)
  if (!q || !scenes.value.length) return []
  return scenes.value
    .filter((s) => normalize(s?.name || s?.id || '').includes(q))
    .slice(0, 8)
})

/** 设置结果：按标签 / 分组匹配 */
const settingResults = computed(() => {
  const q = normalize(query.value)
  if (!q) return []
  return settingsEntries.value
    .filter((s) => normalize(s.label).includes(q) || normalize(s.group).includes(q))
    .slice(0, 8)
})

/** 扁平化结果列表（用于键盘导航） */
const flatResults = computed(() => [
  ...matchedDeviceEids.value.map((eid) => ({ kind: 'device', ref: eid })),
  ...sceneResults.value.map((r) => ({ kind: 'scene', ref: r })),
  ...settingResults.value.map((r) => ({ kind: 'setting', ref: r })),
])

const hasResults = computed(() => flatResults.value.length > 0)

watch(
  () => props.open,
  (open) => {
    if (open) {
      query.value = ''
      debouncedQuery.value = ''
      scenesError.value = false
      activeIndex.value = 0
      void loadScenes()
      nextTick(() => inputRef.value?.focus())
    }
  },
)

async function loadScenes() {
  if (scenesLoaded.value || scenesLoading.value) return
  scenesLoading.value = true
  try {
    const { data } = await fetchOrchestratorList('scene')
    scenes.value = Array.isArray(data) ? data : []
    scenesError.value = false
  } catch {
    scenes.value = []
    scenesError.value = true
    chrome.notify('场景列表加载失败，请稍后重试', 'error')
  } finally {
    scenesLoading.value = false
    scenesLoaded.value = true
  }
}

function close() {
  emit('close')
}

/** 焦点陷阱：Tab / Shift+Tab 在搜索面板内循环，避免焦点逃逸到背景页面 */
function onRootKeydown(e) {
  if (e.key !== 'Tab') return
  const root = rootRef.value
  if (!root) return
  const focusables = Array.from(
    root.querySelectorAll(
      'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  )
  if (!focusables.length) return
  const first = focusables[0]
  const last = focusables[focusables.length - 1]
  const active = document.activeElement
  if (!root.contains(active)) {
    // 焦点逃逸到面板外时拉回第一个可聚焦元素
    e.preventDefault()
    first.focus()
    return
  }
  if (e.shiftKey && active === first) {
    e.preventDefault()
    last.focus()
  } else if (!e.shiftKey && active === last) {
    e.preventDefault()
    first.focus()
  }
}

function onKeydown(e) {
  if (e.key === 'Escape') {
    e.stopPropagation()
    close()
    return
  }
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    activeIndex.value = Math.min(flatResults.value.length - 1, activeIndex.value + 1)
    scrollActiveIntoView()
    return
  }
  if (e.key === 'ArrowUp') {
    e.preventDefault()
    activeIndex.value = Math.max(0, activeIndex.value - 1)
    scrollActiveIntoView()
    return
  }
  if (e.key === 'Enter') {
    const item = flatResults.value[activeIndex.value]
    if (item) {
      e.preventDefault()
      syncQueryNow()
      activate(item)
    }
  }
}

function scrollActiveIntoView() {
  nextTick(() => {
    const el = listRef.value?.querySelector(`[data-index="${activeIndex.value}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  })
}

async function activate(item) {
  if (item.kind === 'device') {
    chrome.openEntityControl(item.ref)
    close()
    return
  }
  if (item.kind === 'scene') {
    close()
    const id = String(item.ref.id ?? '')
    if (!id) return
    try {
      await executeScene(id)
      chrome.notify(`场景「${item.ref.name || id}」已执行`, 'success')
    } catch {
      chrome.notify('场景执行失败', 'error')
    }
    return
  }
  if (item.kind === 'setting') {
    close()
    await router.push(TAB_DEEP_LINKS[item.ref.id]?.() ?? SETTINGS_ROUTES.general())
  }
}

function onMouseEnter(idx) {
  activeIndex.value = idx
}
</script>

<template>
  <Teleport v-if="open" :to="teleportTarget" :disabled="teleportDisabled">
    <div
      ref="rootRef"
      class="gsp-root"
      role="dialog"
      aria-modal="true"
      aria-label="全局搜索"
      @keydown="onRootKeydown"
      @click.self="close"
    >
      <div class="gsp-panel">
        <div class="gsp-input-row">
          <Search class="gsp-input-icon" aria-hidden="true" />
          <input
            ref="inputRef"
            v-model="query"
            class="gsp-input"
            placeholder="搜索设备、场景或设置…"
            aria-label="搜索设备、场景或设置"
            @keydown="onKeydown"
          />
          <button type="button" class="gsp-close" :aria-label="'关闭搜索'" @click="close">
            <X class="w-4 h-4" />
          </button>
        </div>

        <div ref="listRef" class="gsp-body">
          <template v-if="hasResults">
            <section v-if="matchedDeviceEids.length" class="gsp-group">
              <h3 class="gsp-group__title">
                <Lightbulb class="w-3.5 h-3.5" aria-hidden="true" />
                {{ `设备 (${matchedDeviceEids.length})` }}
              </h3>
              <button
                v-for="(eid, i) in matchedDeviceEids"
                :key="eid"
                type="button"
                :data-index="i"
                class="gsp-item"
                :class="{ 'gsp-item--active': activeIndex === i }"
                @click="activate({ kind: 'device', ref: eid })"
                @mouseenter="onMouseEnter(i)"
              >
                <span class="gsp-item__domain" :data-domain="getEntityDomain(eid)">{{
                  getDomainLabel(getEntityDomain(eid))
                }}</span>
                <span class="gsp-item__name">{{ entityName(eid, entitiesStore.entities[eid]) }}</span>
                <span class="gsp-item__hint">{{ eid }}</span>
              </button>
            </section>

            <section v-if="sceneResults.length" class="gsp-group">
              <h3 class="gsp-group__title">
                <Sparkles class="w-3.5 h-3.5" aria-hidden="true" />
                {{ `场景 (${sceneResults.length})` }}
              </h3>
              <button
                v-for="(r, i) in sceneResults"
                :key="String(r.id)"
                type="button"
                :data-index="matchedDeviceEids.length + i"
                class="gsp-item"
                :class="{ 'gsp-item--active': activeIndex === matchedDeviceEids.length + i }"
                @click="activate({ kind: 'scene', ref: r })"
                @mouseenter="onMouseEnter(matchedDeviceEids.length + i)"
              >
                <span class="gsp-item__name">{{ r.name || r.id }}</span>
                <span class="gsp-item__hint">
                  <CornerDownLeft class="w-3 h-3" aria-hidden="true" />
                  {{ '执行' }}
                </span>
              </button>
            </section>

            <section v-if="settingResults.length" class="gsp-group">
              <h3 class="gsp-group__title">
                <SettingsIcon class="w-3.5 h-3.5" aria-hidden="true" />
                {{ `设置 (${settingResults.length})` }}
              </h3>
              <button
                v-for="(r, i) in settingResults"
                :key="r.id"
                type="button"
                :data-index="matchedDeviceEids.length + sceneResults.length + i"
                class="gsp-item"
                :class="{
                  'gsp-item--active':
                    activeIndex === matchedDeviceEids.length + sceneResults.length + i,
                }"
                @click="activate({ kind: 'setting', ref: r })"
                @mouseenter="onMouseEnter(matchedDeviceEids.length + sceneResults.length + i)"
              >
                <span class="gsp-item__name">{{ r.label }}</span>
                <span class="gsp-item__hint">{{ r.group }}</span>
              </button>
            </section>
          </template>

          <div v-else-if="query" class="gsp-empty">
            {{ '未找到匹配项' }}
          </div>

          <div v-else-if="scenesLoading" class="gsp-empty">
            <Loader2 class="w-4 h-4 gsp-empty__spin" aria-hidden="true" />
            {{ '加载中…' }}
          </div>

          <div v-else-if="scenesError" class="gsp-empty gsp-empty--hint">
            {{ '场景列表加载失败，可重试输入或稍后再试' }}
          </div>

          <div v-else class="gsp-empty gsp-empty--hint">
            {{ '输入关键字搜索设备 / 场景 / 设置面板' }}
          </div>
        </div>

        <footer class="gsp-foot">
          <span><kbd>↑</kbd><kbd>↓</kbd> 选择</span>
          <span><kbd>↵</kbd> 打开</span>
          <span><kbd>Esc</kbd> 关闭</span>
        </footer>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.gsp-root {
  position: fixed;
  inset: 0;
  z-index: var(--z-search);
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding: min(12vh, 120px) 16px 16px;
  background: rgba(0, 0, 0, 0.55);
  backdrop-filter: blur(6px);
}

.gsp-panel {
  width: min(560px, 100%);
  max-height: min(68vh, 560px);
  display: flex;
  flex-direction: column;
  border-radius: var(--hos-radius-panel);
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(16, 19, 27, 0.96);
  box-shadow:
    0 24px 64px rgba(0, 0, 0, 0.5),
    inset 0 1px 0 rgba(255, 255, 255, 0.06);
  overflow: hidden;
}

.gsp-input-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.gsp-input-icon {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
  color: var(--hos-text-secondary);
}

.gsp-input {
  flex: 1;
  min-width: 0;
  background: transparent;
  border: none;
  outline: none;
  color: rgba(255, 255, 255, 0.95);
  font-size: 15px;
  font-family: inherit;
}

.gsp-input::placeholder {
  color: var(--hos-text-secondary);
}

.gsp-close {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(255, 255, 255, 0.05);
  color: rgba(255, 255, 255, 0.6);
  cursor: pointer;
}

.gsp-close:hover {
  background: rgba(255, 255, 255, 0.12);
  color: #fff;
}

.gsp-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 8px;
}

.gsp-group + .gsp-group {
  margin-top: 6px;
}

.gsp-group__title {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 8px 10px 4px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--hos-text-secondary);
}

.gsp-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 9px 12px;
  border-radius: var(--hos-radius-card);
  border: 1px solid transparent;
  background: transparent;
  color: inherit;
  font-family: inherit;
  font-size: 13px;
  text-align: left;
  cursor: pointer;
}

.gsp-item--active {
  background: rgba(255, 255, 255, 0.08);
  border-color: rgba(255, 255, 255, 0.12);
}

.gsp-item__domain {
  flex-shrink: 0;
  font-size: 11px;
  font-weight: 700;
  color: rgba(255, 255, 255, 0.55);
}

.gsp-item__name {
  flex: 0 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 600;
}

.gsp-item__hint {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  justify-content: flex-end;
  font-size: 11px;
  color: var(--hos-text-secondary);
}

.gsp-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 32px 16px;
  font-size: 13px;
  color: var(--hos-text-secondary);
}

.gsp-empty--hint {
  color: var(--hos-text-secondary);
}

.gsp-empty__spin {
  animation: gsp-spin 1s linear infinite;
}

@keyframes gsp-spin {
  to {
    transform: rotate(360deg);
  }
}

.gsp-foot {
  display: flex;
  gap: 14px;
  padding: 8px 16px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  font-size: 11px;
  color: var(--hos-text-secondary);
}

.gsp-foot kbd {
  padding: 1px 5px;
  border-radius: 4px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  background: rgba(255, 255, 255, 0.06);
  font-family: inherit;
  font-size: 10px;
}
</style>
