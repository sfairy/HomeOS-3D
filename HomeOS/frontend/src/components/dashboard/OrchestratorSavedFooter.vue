<!--
  组件文件：OrchestratorSavedFooter.vue
  所属模块：frontend/src/components/dashboard
  组件职责：联动编排器底部「已保存列表」停靠面板。左右双卡片结构：左卡片 HomeOS 已保存项（标题、
    计数、新建按钮、溢出菜单含全部推送/修复漂移、已保存行含名字/同步状态徽标/行槽位/编辑/删除）；
    右卡片 Home Assistant 发现项（未配置时展示 HA 圆形图标空态，已发现行展示状态点、
    entity_id 与导入/删除按钮）；面板通过 OrchestratorDockPanel 可折叠，localStorage 持久化。
  主要 props / slots / emits：
    - props.savedList / haImportList：左右两列表项；props.syncStatusMap / driftCount / syncing / deletingHaId：
      同步状态与加载标识；props.savedTitle / emptySavedText / haEmptyText / importAllLabel / showImportAll：文案配置；
      props.embedded / collapsible：内嵌与可折叠控制。
    - 具名 slots：saved-name-extra / saved-meta / saved-row-actions（已保存行扩展），
      ha-row / ha-name-extra / ha-meta / ha-row-actions（HA 行扩展），saved-toolbar-extra（溢出菜单扩展）。
    - emits：start-new / sync-all / repair-all / edit / delete / discover / pull-all / import / ha-delete。
  依赖关系：computed + @lucide/vue Plus/Pencil/Trash2/Download/MoreHorizontal/Upload/AlertTriangle 等图标；
    OrchestratorDockPanel 容器；Teleport 弹层定位辅助函数（溢出菜单通过 body 传送避免裁剪）。
-->
<template>
  <OrchestratorDockPanel
    tag="footer"
    :title="dockTitle"
    :summary="dockSummary"
    :collapsible="isCollapsible"
    :default-collapsed="isDefaultCollapsed"
    storage-key="homeos_orch_saved_list"
    panel-class="wr-saved-section wr-dock--saved"
  >
    <div class="wr-saved-section-inner">
      <div class="wr-saved-cols">
        <!-- 左卡片：HomeOS 已保存 -->
        <div class="wr-saved-card wr-saved-card--homeos">
          <div class="wr-card-corona wr-card-corona--homeos" aria-hidden="true"></div>
          <div class="wr-saved-head">
            <div class="wr-sec-label">
              <div class="wr-sec-dot wr-sec-dot--homeos"></div>
              <h3>{{ savedTitle }}</h3>
              <em v-if="savedList.length" class="wr-sec-count">{{ `${savedList.length}` }}</em>
            </div>
            <div class="wr-saved-head-actions">
              <button
                v-if="!syncing"
                class="wr-btn-primary wr-btn-primary--homeos"
                type="button"
                @click="$emit('start-new')"
              >
                <Plus class="w-3.5 h-3.5" />
                新建
              </button>
              <button
                class="wr-overflow__trigger"
                :class="{ 'is-open': homeosMenuOpen }"
                :disabled="!isAdmin"
                type="button"
                :ref="el => setTriggerRef('homeos', el)"
                @click.stop="toggleMenu('homeos')"
              >
                <MoreHorizontal class="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
          <div class="wr-saved-body">
            <div v-if="savedList.length === 0" class="wr-empty">
              <div class="wr-empty__glyph" aria-hidden="true">
                <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M24 6 L40 14 V34 L24 42 L8 34 V14 Z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round" />
                  <path d="M8 14 L24 22 L40 14" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round" opacity="0.6" />
                </svg>
              </div>
              <p class="wr-empty__title">{{ emptySavedText }}</p>
            </div>
            <div v-else class="wr-saved-table">
              <div v-for="item in savedList" :key="item.id" class="wr-saved-row wr-saved-row--homeos">
                <div class="wr-row-led wr-row-led--homeos" aria-hidden="true"></div>
                <div class="wr-saved-td wr-saved-td--name">
                  <div class="wr-row-name-wrap">
                    <span class="wr-row-name">{{ item.name }}</span>
                    <div class="wr-row-badges">
                      <span v-if="item.runOnHa" class="wr-mini-badge wr-mini-badge--ha">HA</span>
                      <span v-if="syncStatusMap[item.id]?.drift" class="wr-mini-badge wr-mini-badge--drift">漂移</span>
                      <slot name="saved-name-extra" :item="item" />
                    </div>
                  </div>
                  <div class="wr-row-meta-row">
                    <span v-if="item.haConfigId" class="wr-row-meta wr-row-meta--sync" :class="syncStatusMap[item.id]?.syncing && 'is-syncing'">
                      <span v-if="syncStatusMap[item.id]?.unknown" class="wr-row-meta wr-row-meta--pending">未知</span>
                      <span v-else-if="syncStatusMap[item.id]?.drift" class="wr-row-meta wr-row-meta--drift">漂移</span>
                      <span v-else-if="item.haSyncedAt" class="wr-row-meta wr-row-meta--synced">已同步</span>
                      <span v-else class="wr-row-meta wr-row-meta--pending">待同步</span>
                    </span>
                    <span v-else class="wr-row-meta wr-meta--dim">未关联</span>
                    <slot name="saved-meta" :item="item" />
                  </div>
                </div>
                <div class="wr-saved-td wr-saved-td--actions">
                  <slot name="saved-row-actions" :item="item" />
                  <button
                    class="wr-btn-icon wr-btn-icon--subtle"
                    type="button"
                    title="编辑"
                    @click="$emit('edit', item)"
                  >
                    <Pencil class="w-3.5 h-3.5" />
                  </button>
                  <button
                    class="wr-btn-icon wr-btn-icon--danger"
                    type="button"
                    title="删除"
                    @click="$emit('delete', item)"
                  >
                    <Trash2 class="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- 右卡片：Home Assistant 发现 -->
        <div class="wr-saved-card wr-saved-card--ha">
          <div class="wr-card-corona wr-card-corona--ha" aria-hidden="true"></div>
          <div class="wr-saved-head">
            <div class="wr-sec-label">
              <div class="wr-sec-dot wr-sec-dot--ha"></div>
              <h3>{{ 'HA · 发现' }}</h3>
              <em v-if="haImportList.length" class="wr-sec-count">{{ `${haImportList.length}` }}</em>
            </div>
            <div class="wr-saved-head-actions">
              <button
                v-if="isAdmin && showImportAll"
                class="wr-btn-primary wr-btn-primary--ha"
                type="button"
                :disabled="syncing"
                @click="$emit('pull-all')"
              >
                <Download class="w-3.5 h-3.5" />
                {{ importAllLabel || '全部导入' }}
              </button>
              <button
                class="wr-overflow__trigger"
                :class="{ 'is-open': haMenuOpen }"
                type="button"
                :ref="el => setTriggerRef('ha', el)"
                @click.stop="toggleMenu('ha')"
              >
                <MoreHorizontal class="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
          <div class="wr-saved-body">
            <div v-if="haImportList.length === 0" class="wr-empty">
              <div class="wr-empty__glyph" aria-hidden="true">
                <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <circle cx="24" cy="24" r="16" stroke="currentColor" stroke-width="1.2" />
                  <circle cx="24" cy="24" r="2.5" fill="currentColor" />
                </svg>
              </div>
              <p class="wr-empty__title">{{ haEmptyText }}</p>
            </div>
            <div v-else class="wr-saved-table">
              <div
                v-for="item in haImportList"
                :key="item.entity_id"
                class="wr-saved-row wr-saved-row--ha"
              >
                <div class="wr-row-led wr-row-led--ha" aria-hidden="true"></div>
                <slot name="ha-row" :item="item">
                  <div class="wr-saved-td wr-saved-td--name">
                    <div class="wr-row-name-wrap">
                      <span class="wr-row-name">{{ item.name }}</span>
                      <div class="wr-row-badges">
                        <span :class="['wr-status-dot', item.state === 'on' ? 'is-on' : 'is-off']"></span>
                        <slot name="ha-name-extra" :item="item" />
                      </div>
                    </div>
                    <div class="wr-row-meta-row">
                      <span class="wr-row-meta wr-meta--dim">{{ item.entity_id }}</span>
                      <slot name="ha-meta" :item="item" />
                    </div>
                  </div>
                  <div class="wr-saved-td wr-saved-td--actions">
                    <slot name="ha-row-actions" :item="item" />
                    <button
                      v-if="isAdmin"
                      class="wr-btn-icon wr-btn-icon--subtle"
                      type="button"
                      title="导入"
                      @click="$emit('import', item)"
                    >
                      <Download class="w-3.5 h-3.5" />
                    </button>
                    <button
                      v-if="isAdmin"
                      class="wr-btn-icon wr-btn-icon--danger"
                      type="button"
                      title="删除"
                      :disabled="!!deletingHaId"
                      @click="$emit('ha-delete', item)"
                    >
                      <Trash2 class="w-3.5 h-3.5" />
                    </button>
                  </div>
                </slot>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Teleport 弹层到 body，彻底脱离卡片 overflow / stacking 上下文 -->
    <Teleport to="body">
      <div
        v-if="homeosMenuOpen"
        class="wr-popover-fog"
        @mousedown="closeAllMenus"
        @contextmenu="closeAllMenus"
      >
        <div
          class="wr-overflow__panel wr-overflow__panel--homeos wr-overflow__panel--teleport"
          :style="homeosPanelStyle"
          @click.stop
          @mousedown.stop
        >
          <template v-if="isAdmin">
            <button class="wr-overflow__item" type="button" @click="emitAndClose('sync-all')">
              <Upload class="w-3.5 h-3.5" /> 全部推送
            </button>
            <button
              v-if="driftCount > 0"
              class="wr-overflow__item wr-overflow__item--alert"
              type="button"
              @click="emitAndClose('repair-all')"
            >
              <AlertTriangle class="w-3.5 h-3.5" /> 修复漂移 ({{ driftCount }})
            </button>
            <div class="wr-overflow__sep" v-if="$slots['saved-toolbar-extra']"></div>
            <slot name="saved-toolbar-extra" />
          </template>
        </div>
      </div>
      <div
        v-if="haMenuOpen"
        class="wr-popover-fog"
        @mousedown="closeAllMenus"
        @contextmenu="closeAllMenus"
      >
        <div
          class="wr-overflow__panel wr-overflow__panel--ha wr-overflow__panel--teleport"
          :style="haPanelStyle"
          @click.stop
          @mousedown.stop
        >
          <button class="wr-overflow__item" type="button" @click="emitAndClose('discover')">
            <RefreshCw class="w-3.5 h-3.5" /> 刷新发现
          </button>
          <template v-if="isAdmin">
            <div class="wr-overflow__sep" v-if="$slots['ha-toolbar-extra']"></div>
            <slot name="ha-toolbar-extra" />
          </template>
        </div>
      </div>
    </Teleport>
  </OrchestratorDockPanel>
</template>

<script setup>
/**
 * OrchestratorSavedFooter.vue
 *
 * 所属模块：dashboard / Orchestrator（联动编排器）
 * 职责：联动项列表底部的「已保存 + HA 发现」双卡片 Dock 面板。
 *      左卡片展示本地已保存列表（含 HA 同步状态徽标与编辑/删除按钮）；
 *      右卡片展示 HA 端发现的导入候选项。两个卡片均提供 Teleport 溢出菜单
 *      （全部推送/修复漂移/刷新发现等）。折叠状态持久化到 localStorage。
 * 依赖：vue、@lucide/vue（Pencil/Trash2/Plus/MoreHorizontal/Upload/AlertTriangle/Download/RefreshCw）、
 *      OrchestratorDockPanel（可折叠容器）。
 */
import { computed, reactive, ref, nextTick, onBeforeUnmount } from 'vue'
import { Pencil, Trash2, Plus, MoreHorizontal, Upload, AlertTriangle, Download, RefreshCw } from '@lucide/vue'
import OrchestratorDockPanel from '@/components/dashboard/OrchestratorDockPanel.vue'

/**
 * 组件 Props
 * @property {Array}  savedList       - 本地已保存联动项列表
 * @property {Array}  haImportList    - HA 端发现的导入候选项
 * @property {object} syncStatusMap   - 同步状态映射表，key 为联动项 id
 * @property {boolean} isAdmin         - 是否管理员（控制按钮可见性）
 * @property {boolean} syncing          - 是否正在同步（按钮禁用）
 * @property {string|null} deletingHaId - 正在删除的 HA 实体 id
 * @property {number} driftCount       - 漂移项数量（用于显示菜单徽标）
 * @property {string} savedTitle       - 左卡片标题
 * @property {string} emptySavedText   - 左卡片空态文案
 * @property {string} haEmptyText      - 右卡片空态文案
 * @property {boolean} showImportAll   - 是否显示「全部导入」按钮
 * @property {string} importAllLabel   - 「全部导入」按钮自定义文案
 * @property {boolean} embedded         - 是否内嵌模式（影响默认折叠）
 * @property {boolean} collapsible      - 是否允许折叠（覆盖 embedded 默认行为）
 */
const props = defineProps({
  savedList: { type: Array, default: () => [] },
  haImportList: { type: Array, default: () => [] },
  syncStatusMap: { type: Object, default: () => ({}) },
  isAdmin: Boolean,
  syncing: Boolean,
  deletingHaId: { type: [String, null], default: null },
  driftCount: { type: Number, default: 0 },
  savedTitle: { type: String, required: true },
  emptySavedText: { type: String, required: true },
  haEmptyText: { type: String, required: true },
  showImportAll: { type: Boolean, default: true },
  importAllLabel: { type: String, default: '' },
  embedded: Boolean,
  collapsible: { type: Boolean, default: undefined },
})

/**
 * 组件事件
 * - start-new：新建
 * - sync-all：全部推送
 * - repair-all：修复漂移
 * - edit：编辑
 * - delete：删除
 * - discover：刷新发现
 * - pull-all：全部导入
 * - import：导入单项
 * - ha-delete：删除 HA 项
 */
const emit = defineEmits([
  'start-new', 'sync-all', 'repair-all', 'edit', 'delete',
  'discover', 'pull-all', 'import', 'ha-delete',
])

/** 是否可折叠：未显式指定时根据 embedded 推断 */
const isCollapsible = computed(() => props.collapsible ?? !!props.embedded)
/** 默认折叠：内嵌模式默认折叠 */
const isDefaultCollapsed = computed(() => !!props.embedded)
/** Dock 标题 */
const dockTitle = computed(() => '已保存列表')
/** Dock 摘要：本地/HA/漂移数量拼接 */
const dockSummary = computed(() => {
  const local = props.savedList.length
  const ha = props.haImportList.length
  const parts = [`本地 ${local}`]
  if (ha > 0) parts.push(`HA ${ha}`)
  if (props.driftCount > 0) parts.push(`漂移 ${props.driftCount}`)
  return parts.join(' · ')
})

// ===== Teleport 溢出菜单 =====
const homeosMenuOpen = ref(false)
const haMenuOpen = ref(false)
const triggers = reactive({ homeos: null, ha: null })
const homeosPanelStyle = ref({})
const haPanelStyle = ref({})

/** 注册触发按钮的 DOM 引用，用于计算弹出层位置 */
function setTriggerRef(which, el) {
  if (el) triggers[which] = el
}

/**
 * 根据触发按钮 rect 计算弹出层 fixed 样式
 * 保证不超出视口边界，宽度固定 220px、最大 320px
 * @param {HTMLElement} triggerEl - 触发按钮元素
 * @returns {object} style 对象
 */
function computePanelStyle(triggerEl) {
  if (!triggerEl) return {}
  const rect = triggerEl.getBoundingClientRect()
  const gap = 6
  const PANEL_W = 220
  const left = Math.min(
    Math.max(rect.right - PANEL_W, 8),
    window.innerWidth - PANEL_W - 8,
  )
  const top = Math.min(rect.bottom + gap, window.innerHeight - 80)
  return {
    position: 'fixed',
    top: `${top}px`,
    left: `${left}px`,
    minWidth: `${PANEL_W}px`,
    maxWidth: '320px',
    maxHeight: `${Math.max(window.innerHeight - top - 16, 120)}px`,
  }
}

/**
 * 切换某侧菜单：关闭另一侧，本侧取反；展开时于 nextTick 后计算定位
 * @param {'homeos'|'ha'} which - 菜单侧别
 */
async function toggleMenu(which) {
  if (which === 'homeos') {
    haMenuOpen.value = false
    homeosMenuOpen.value = !homeosMenuOpen.value
    if (homeosMenuOpen.value) {
      await nextTick()
      homeosPanelStyle.value = computePanelStyle(triggers.homeos)
    }
  } else {
    homeosMenuOpen.value = false
    haMenuOpen.value = !haMenuOpen.value
    if (haMenuOpen.value) {
      await nextTick()
      haPanelStyle.value = computePanelStyle(triggers.ha)
    }
  }
}

/** 关闭所有菜单 */
function closeAllMenus() {
  homeosMenuOpen.value = false
  haMenuOpen.value = false
}

/**
 * 触发事件并关闭菜单
 * @param {string} name    - 事件名
 * @param {*}      payload - 事件载荷
 */
function emitAndClose(name, payload) {
  closeAllMenus()
  emit(name, payload)
}

// slot 注入的旧按钮（.wr-btn-add）点击后也要自动关闭菜单（预留，当前由 slot 内部 emit 兜底）
function _onSlotClickWrap(e) {
  const target = e.target
  if (target && target.closest && target.closest('button')) closeAllMenus()
}
void _onSlotClickWrap

// 全局 ESC 关闭菜单
function onKey(e) {
  if (e.key === 'Escape') closeAllMenus()
}
// 窗口尺寸/滚动变化时重新计算展开菜单的定位
function onResize() {
  if (homeosMenuOpen.value && triggers.homeos) {
    homeosPanelStyle.value = computePanelStyle(triggers.homeos)
  }
  if (haMenuOpen.value && triggers.ha) {
    haPanelStyle.value = computePanelStyle(triggers.ha)
  }
}
if (typeof window !== 'undefined') {
  window.addEventListener('keydown', onKey, true)
  window.addEventListener('resize', onResize)
  window.addEventListener('scroll', onResize, true)
}
onBeforeUnmount(() => {
  if (typeof window !== 'undefined') {
    window.removeEventListener('keydown', onKey, true)
    window.removeEventListener('resize', onResize)
    window.removeEventListener('scroll', onResize, true)
  }
})
</script>
