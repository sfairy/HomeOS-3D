<!--
  组件文件：TemplateEntitySavedFooter.vue
  所属模块：frontend/src/components/dashboard
  组件职责：模板实体页底部「已保存列表」停靠面板。顶部 stub 警告横幅（含占位 YAML 条目数量提醒）
    与 SMB 连接异常横幅；左右双卡片结构与 OrchestratorSavedFooter 类似但额外展示模板实体专有徽标
    （Stub/片段/YAML 来源）与推送单项按钮；通过 OrchestratorDockPanel 可折叠容器持久化。
  主要 props / slots / emits：
    - props.savedList / haImportList / stubItemCount：已保存/HA 发现/占位条目数；
      props.syncStatusMap / haConfigStatus / haConfigReady / haConfigReadable：同步与 HA 读写状态；
      props.syncing / haDiscovering / importingId / deleting / deletingHaId：加载态；
      props.embedded / collapsible：内嵌与可折叠。
    - emits：start-new / open-paste / sync-all / repair / repair-pull / reimport /
      pull-ha-item / write-ha-item / sync-item / edit / delete / discover / pull-all / import / ha-delete。
  依赖关系：computed + @lucide/vue Plus/Pencil/Trash2/Download/Upload/AlertTriangle 等图标；
    OrchestratorDockPanel 容器；SMB 错误文案从 haConfigStatus?.smbMessage 派生；escapeHtml 辅助函数。
-->
<template>
  <OrchestratorDockPanel
    tag="footer"
    :title="'已保存列表'"
    :summary="savedDockSummary"
    :collapsible="isCollapsible"
    :default-collapsed="isDefaultCollapsed"
    storage-key="homeos_orch_template_saved"
    panel-class="wr-saved-section wr-dock--saved"
  >
    <div class="wr-saved-section-inner">
      <div v-if="stubItemCount > 0" class="wr-stub-banner">
        <span
          >⚠️
          {{
            `${stubItemCount} 条实体为占位 YAML，推送 HA 前请补全 trigger 配置或粘贴完整 configuration.yaml。`
          }}</span
        >
      </div>
      <div
        v-if="haConfigStatus?.configured && haConfigStatus?.smbOk === false"
        class="wr-stub-banner wr-stub-banner--smb"
      >
        <span>{{ smbErrorText }}</span>
      </div>
      <div class="wr-saved-cols">
        <div class="wr-saved-card wr-saved-card--homeos">
          <div class="wr-card-corona wr-card-corona--homeos" aria-hidden="true"></div>
          <div class="wr-saved-head">
            <div class="wr-sec-label">
              <div class="wr-sec-dot wr-sec-dot--homeos"></div>
              <h3>{{ 'HomeOS · 模板实体' }}</h3>
              <em v-if="savedList.length" class="wr-sec-count">{{ `${savedList.length}` }}</em>
            </div>
            <div class="wr-saved-head-actions">
              <button class="wr-btn-primary wr-btn-primary--homeos" type="button" @click="$emit('start-new')">
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
              <div class="wr-empty__icon" aria-hidden="true">◎</div>
              <div class="wr-empty__copy">
                <div class="wr-empty__title">{{ '尚未创建模板实体' }}</div>
                <div class="wr-empty__sub">{{ '点击右上角「新建」，从 YAML、设备触发或可视化画布开始' }}</div>
              </div>
            </div>
            <div v-else class="wr-saved-table">
              <div v-for="item in savedList" :key="item.id" class="wr-saved-row wr-saved-row--homeos">
                <span class="wr-row-led wr-row-led--homeos" aria-hidden="true"></span>
                <span class="wr-saved-td wr-saved-td--name">
                  <span class="wr-row-name">{{ item.name }}</span>
                  <span class="wr-row-badges">
                    <span
                      v-if="item.yamlComplete === false || item.stubYaml"
                      class="wr-mini-badge wr-mini-badge--drift"
                      :title="'YAML 不完整或为 stub，推送前请补全或重新从 HA 导入'"
                      >{{ item.stubYaml ? 'Stub' : '片段' }}</span
                    >
                    <span
                      v-if="item.yamlSource"
                      class="wr-mini-badge wr-mini-badge--ha"
                      :title="'来源: ' + item.yamlSource"
                      >{{ yamlSourceLabel(item.yamlSource) }}</span
                    >
                  </span>
                </span>
                <span class="wr-saved-td wr-saved-td--meta">
                  <template v-if="item.haConfigId || item.haSyncedAt">
                    <template v-if="syncStatusMap[item.id]?.drift">
                      <span class="wr-mini-badge wr-mini-badge--drift">{{ '漂移' }}</span>
                    </template>
                    <template v-else>
                      <span class="wr-mono" :title="item.haConfigId || ''">
                        {{ item.haConfigId ? item.haConfigId.replace(/^homeos_/, '') : '已推送' }}
                      </span>
                    </template>
                  </template>
                  <span v-else class="wr-mono wr-mono--dim">{{ '未关联 HA' }}</span>
                </span>
                <span class="wr-saved-td wr-saved-td--actions">
                  <button
                    v-if="isAdmin"
                    type="button"
                    class="wr-btn-weak wr-btn-weak--sync wr-btn-weak--row"
                    :title="item.yamlComplete === false ? 'YAML 不完整，请先补全' : '推送到 HA'"
                    :aria-label="item.yamlComplete === false ? 'YAML 不完整' : '推送到 HA'"
                    :disabled="item.yamlComplete === false"
                    @click="$emit('sync-item', item)"
                  >
                    <Upload class="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    class="wr-btn-weak wr-btn-weak--row"
                    :title="'编辑'"
                    :aria-label="'编辑'"
                    @click="$emit('edit', item)"
                  >
                    <Pencil class="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    class="wr-btn-weak wr-btn-weak--danger wr-btn-weak--row"
                    :title="'删除'"
                    :aria-label="'删除'"
                    @click="$emit('delete', item)"
                  >
                    <Trash2 class="w-3.5 h-3.5" />
                  </button>
                  <details
                    v-if="hasRowMenu(item)"
                    class="wr-row-menu"
                    @toggle="onExclusiveDetailsToggle"
                  >
                    <summary
                      class="wr-btn-weak wr-btn-weak--row"
                      :title="'更多操作'"
                      :aria-label="'更多操作'"
                    >
                      <MoreHorizontal class="w-3.5 h-3.5" />
                    </summary>
                    <div class="wr-row-menu__panel">
                      <button
                        v-if="isAdmin && syncStatusMap[item.id]?.drift"
                        type="button"
                        class="wr-row-menu__item"
                        @click="$emit('repair', item)"
                      >
                        {{ '推送本地到 HA' }}
                      </button>
                      <button
                        v-if="isAdmin && syncStatusMap[item.id]?.drift"
                        type="button"
                        class="wr-row-menu__item"
                        @click="$emit('repair-pull', item)"
                      >
                        {{ '从 HA 拉回' }}
                      </button>
                      <button
                        v-if="isAdmin && item.yamlComplete === false"
                        type="button"
                        class="wr-row-menu__item"
                        @click="$emit('reimport', item)"
                      >
                        {{ '重新解析 YAML' }}
                      </button>
                      <button
                        v-if="isAdmin && haConfigReadable"
                        type="button"
                        class="wr-row-menu__item"
                        @click="$emit('pull-ha-item', item)"
                      >
                        {{ '从 configuration.yaml 读取' }}
                      </button>
                      <button
                        v-if="isAdmin && haConfigReady"
                        type="button"
                        class="wr-row-menu__item"
                        @click="$emit('write-ha-item', item)"
                      >
                        {{ '写入 configuration.yaml' }}
                      </button>
                    </div>
                  </details>
                </span>
              </div>
            </div>
          </div>
        </div>

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
                v-if="isAdmin"
                class="wr-btn-primary wr-btn-primary--ha"
                type="button"
                :disabled="syncing"
                @click="$emit('pull-all')"
              >
                <Download class="w-3.5 h-3.5" />
                {{ syncing ? '导入中…' : '全部导入' }}
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
            <div v-if="haDiscovering" class="wr-empty">
              <div class="wr-empty__icon wr-empty__icon--ha" aria-hidden="true">◌</div>
              <div class="wr-empty__copy">
                <div class="wr-empty__title">{{ '正在从 HA 发现模板实体…' }}</div>
                <div class="wr-empty__sub">{{ '实体量大时（3000+）请耐心等待，完成后可点击刷新重试' }}</div>
              </div>
            </div>
            <div v-else-if="haImportList.length === 0" class="wr-empty">
              <div class="wr-empty__icon wr-empty__icon--ha" aria-hidden="true">◇</div>
              <div class="wr-empty__copy">
                <div class="wr-empty__title">{{ '尚未发现远端模板实体' }}</div>
                <div class="wr-empty__sub">
                  {{ '连接 HA 并启用 Template 集成后，点击右上角「刷新发现」同步远端实体' }}
                </div>
              </div>
            </div>
            <div v-else class="wr-saved-table">
              <div
                v-for="item in haImportList"
                :key="String(item.entity_id ?? item.ha_config_id ?? item.config_entry_id ?? Math.random())"
                class="wr-saved-row wr-saved-row--ha"
              >
                <span class="wr-row-led wr-row-led--ha" aria-hidden="true"></span>
                <span class="wr-saved-td wr-saved-td--name">
                  <span class="wr-row-name">{{ item.name }}</span>
                  <span class="wr-row-badges">
                    <span
                      v-if="item.yaml_complete === false"
                      class="wr-mini-badge wr-mini-badge--drift"
                      :title="'HA 未返回完整 YAML，导入后请核对或手动粘贴'"
                      >{{ '片段' }}</span
                    >
                  </span>
                </span>
                <span class="wr-saved-td wr-saved-td--eid">{{ item.entity_id }}</span>
                <span
                  v-if="isAdmin && (item.ha_config_id || item.config_entry_id || item.entity_id)"
                  class="wr-ha-row-actions"
                >
                  <button
                    class="wr-btn-add wr-btn-add--primary-ha wr-btn-add--sm"
                    type="button"
                    :disabled="!!importingId"
                    @click="$emit('import', item)"
                  >
                    {{ importingId === (item.ha_config_id || item.entity_id) ? '导入中…' : '导入' }}
                  </button>
                  <button
                    class="wr-btn-add wr-btn-add--ghost wr-btn-add--ghost-ha wr-btn-add--sm wr-btn-add--danger"
                    type="button"
                    :disabled="!!deletingHaId || deleting"
                    @click="$emit('ha-delete', item)"
                  >
                    {{ '删除' }}
                  </button>
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Teleport 弹层到 body -->
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
          <button
            v-if="isAdmin"
            class="wr-overflow__item"
            type="button"
            @click="emitAndClose('open-paste')"
          >
            <FileCode class="w-3.5 h-3.5" /> 粘贴 YAML
          </button>
          <button
            v-if="isAdmin"
            class="wr-overflow__item"
            type="button"
            :disabled="syncing"
            @click="emitAndClose('sync-all')"
          >
            <Upload class="w-3.5 h-3.5" /> {{ syncing ? '推送中…' : '全部推送' }}
          </button>
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
          <button class="wr-overflow__item" type="button" @click="emitAndClose('discover', true)">
            <RefreshCw class="w-3.5 h-3.5" /> 刷新发现
          </button>
        </div>
      </div>
    </Teleport>
  </OrchestratorDockPanel>

  <OrchestratorDockPanel
    :title="'配置说明'"
    :summary="guideDockSummary"
    :collapsible="isCollapsible"
    :default-collapsed="isDefaultCollapsed"
    storage-key="homeos_orch_template_guide"
    panel-class="wr-dock--guide"
  >
    <div class="wr-guide-foot">
      <div class="wr-guide-foot-hint">
        <span class="wr-guide-foot-dot">💡</span>
        <span v-if="haConfigReady" v-html="haConfigReadyHint" />
        <span v-else-if="haConfigStatus?.configured" v-html="haConfigConfiguredHint" />
        <span
          v-else
          v-html="
            '未配置 <strong>automation.haConfigDir</strong>，无法自动读写 configuration.yaml。请在「设置 → 高级参数 → 自动化」中配置目录与 SMB 凭据。'
          "
        />
      </div>
      <RouterLink
        v-if="isAdmin && !haConfigReady"
        class="wr-guide-foot-link"
        :to="{ path: '/settings', query: { tab: 'params', section: 'automation' } }"
      >
        {{ '前往高级参数配置' }}
      </RouterLink>
    </div>
  </OrchestratorDockPanel>
</template>

<script setup>
/**
 * TemplateEntitySavedFooter.vue
 *
 * 所属模块：dashboard / Template Entity（模板实体）
 * 职责：模板实体列表底部的「已保存 + HA 发现 + 配置说明」三段式 Dock 面板。
 *      左卡片展示本地模板实体（含 Stub/片段/漂移/已同步徽标 + 推送/编辑/删除按钮），
 *      右卡片展示 HA 端发现的模板实体（导入/删除）。两卡片均提供 Teleport 溢出菜单
 *      （粘帖 YAML / 全部推送 / 刷新发现）。第三段为配置说明 Dock，引导用户配置
 *      automation.haConfigDir 后才能自动读写 configuration.yaml。
 * 依赖：vue、@lucide/vue（Trash2/Pencil/Upload/MoreHorizontal/Plus/Download/RefreshCw/FileCode）、
 *      vue-router（RouterLink）、OrchestratorDockPanel、entity-context.util、useExclusiveDropdown。
 */
import { computed, reactive, ref, nextTick, onBeforeUnmount } from 'vue'
import { Trash2, Pencil, Upload, MoreHorizontal, Plus, Download, RefreshCw, FileCode } from '@lucide/vue'
import { RouterLink } from 'vue-router'
import { yamlSourceLabel } from '@/utils/template/entity-context.util'
import OrchestratorDockPanel from '@/components/dashboard/OrchestratorDockPanel.vue'
import { onExclusiveDetailsToggle } from '@/composables/ui/useExclusiveDropdown'

/**
 * 组件 Props
 * @property {Array}   savedList         - 本地模板实体列表
 * @property {Array}   haImportList      - HA 端发现列表
 * @property {number}  stubItemCount      - 占位 YAML 条目数量（顶部警告）
 * @property {boolean} isAdmin            - 是否管理员
 * @property {boolean} syncing             - 是否正在推送（按钮禁用）
 * @property {boolean} haDiscovering       - 是否正在发现 HA 实体
 * @property {string|null} importingId    - 正在导入的 HA 项 id
 * @property {boolean} deleting            - 是否正在删除
 * @property {string|null} deletingHaId    - 正在删除的 HA 项 id
 * @property {object}  haConfigStatus      - HA 配置目录状态 { configured?, path?, source?, smbOk?, smbMessage? }
 * @property {boolean} haConfigReady       - HA 配置目录可读写
 * @property {boolean} haConfigReadable     - HA 配置目录可读
 * @property {object}  syncStatusMap       - 同步状态映射表
 * @property {boolean} embedded            - 是否内嵌模式
 * @property {boolean} collapsible         - 是否允许折叠
 */
const props = defineProps({
  savedList: { type: Array, default: () => [] },
  haImportList: { type: Array, default: () => [] },
  stubItemCount: { type: Number, default: 0 },
  isAdmin: Boolean,
  syncing: Boolean,
  haDiscovering: Boolean,
  importingId: { type: [String, null], default: null },
  deleting: Boolean,
  deletingHaId: { type: [String, null], default: null },
  haConfigStatus: { type: Object, default: null },
  haConfigReady: Boolean,
  haConfigReadable: Boolean,
  syncStatusMap: { type: Object, default: () => ({}) },
  embedded: Boolean,
  collapsible: { type: Boolean, default: undefined },
})

/**
 * 组件事件
 * - start-new / open-paste / sync-all：新建 / 粘帖 YAML / 全部推送
 * - repair / repair-pull / reimport：修复漂移（推/拉）/ 重新解析
 * - pull-ha-item / write-ha-item / sync-item：读写 HA 单项
 * - edit / delete：编辑 / 删除
 * - discover / pull-all / import / ha-delete：HA 发现相关
 */
const emit = defineEmits([
  'start-new',
  'open-paste',
  'sync-all',
  'repair',
  'repair-pull',
  'reimport',
  'pull-ha-item',
  'write-ha-item',
  'sync-item',
  'edit',
  'delete',
  'discover',
  'pull-all',
  'import',
  'ha-delete',
])

/** SMB 连接异常提示文案 */
const smbErrorText = computed(() => {
  const msg = props.haConfigStatus?.smbMessage
  return `SMB 连接异常：${msg || '请检查 UNC 路径与凭据'}`
})

/**
 * HTML 转义：用于将用户可控的 path 安全渲染到 v-html
 * @param {string} str - 原始字符串
 * @returns {string}
 */
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

/** HA 配置目录就绪时的 v-html 提示文案（含 path 与来源） */
const haConfigReadyHint = computed(() => {
  const status = props.haConfigStatus
  if (!status?.path) return ''
  const sourceLabel = status.source === 'settings' ? '系统参数' : '环境变量'
  const safePath = escapeHtml(status.path)
  return `HA 配置目录已就绪：${safePath}（${sourceLabel}）。trigger 模板可「写入 configuration.yaml」后自动 template.reload。`
})

/** HA 配置目录已配置但不可写时的 v-html 提示文案 */
const haConfigConfiguredHint = computed(() => {
  const path = props.haConfigStatus?.path
  if (!path) return '已配置目录但不可写，请检查路径与权限。'
  const safePath = escapeHtml(path)
  return `已配置目录但不可写：${safePath}。请检查路径与权限。`
})

/** 是否可折叠：未显式指定时根据 embedded 推断 */
const isCollapsible = computed(() => props.collapsible ?? !!props.embedded)
/** 默认折叠：内嵌模式默认折叠 */
const isDefaultCollapsed = computed(() => !!props.embedded)

/** 已保存 Dock 摘要：本地条数 + HA 条数 + 占位条数 */
const savedDockSummary = computed(() => {
  const parts = [`本地 ${props.savedList.length} 条`]
  if (props.haImportList.length > 0) parts.push(`HA ${props.haImportList.length} 条`)
  if (props.stubItemCount > 0) parts.push(`占位 ${props.stubItemCount}`)
  return parts.join(' · ')
})

/** 配置说明 Dock 摘要 */
const guideDockSummary = computed(() => {
  if (props.haConfigReady) return 'HA 配置目录已就绪'
  if (props.haConfigStatus?.configured) return '已配置目录但不可写'
  return '未配置 HA 配置目录'
})

/**
 * 是否在某行展示「更多操作」下拉
 * 管理员 + 漂移 / YAML 不完整 / HA 配置可读 / HA 配置就绪 任一满足
 * @param {object} item - 模板实体项
 * @returns {boolean}
 */
function hasRowMenu(item) {
  if (!props.isAdmin) return false
  if (props.syncStatusMap[item.id]?.drift) return true
  if (item.yamlComplete === false) return true
  if (props.haConfigReadable || props.haConfigReady) return true
  return false
}

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
