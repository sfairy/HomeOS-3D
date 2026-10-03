<!--
组件：OrchestratorSyncHealthCard.vue
所属模块：frontend / src / views / settings / automate
职责：联动编排「HA 同步健康」卡片。展示近期同步/reload 错误、配置漂移、能源自动联动
      等状态；嵌入页头时通过 Teleport 把展开面板挂到 body，避免 overflow 裁切。
关键依赖：
  - fetchLinkageHealth / fetchSystemDiagnostics：拉取同步健康与诊断数据
  - useShellTeleportTarget：获取 shell 容器作为 Teleport 目标
  - viewportPointToPopupAnchor / getTeleportContainerSize：计算弹层锚点与尺寸
  - AlertTriangle / CheckCircle2 / RefreshCw 图标来自 @lucide/vue
数据来源：后端 system / linkage-health 接口 + 父级透传 driftCount
-->
<template>
  <div
    v-if="visible"
    ref="rootRef"
    :class="[
      'orch-sync-health',
      toneClass,
      collapsible && 'orch-sync-health--collapsible',
      isEmbed && 'orch-sync-health--embed',
      isEmbed && collapsed && 'orch-sync-health--chip',
    ]"
  >
    <div class="orch-sync-health__head">
      <AlertTriangle v-if="hasIssues" class="w-4 h-4 shrink-0" />
      <CheckCircle2 v-else class="w-4 h-4 shrink-0 os-text-success" />
      <span class="orch-sync-health__title">{{ 'HA 同步健康' }}</span>
      <span v-if="!hasIssues && !collapsed" class="orch-sync-health__ok">{{
        '联动器与 HA 无近期同步/reload 错误'
      }}</span>
      <span v-else-if="hasIssues && collapsed" class="orch-sync-health__chip-hint">{{
        chipHint
      }}</span>
      <button
        v-if="collapsible"
        type="button"
        class="orch-sync-health__collapse"
        :aria-expanded="!collapsed"
        @click="$emit('toggle-collapse')"
      >
        {{ collapsed ? '展开' : '收起' }}
      </button>
      <button
        type="button"
        class="orch-sync-health__refresh"
        :disabled="loading"
        :aria-label="'刷新同步健康状态'"
        @click="load"
      >
        <RefreshCw :class="['w-3 h-3', loading && 'animate-spin']" />
      </button>
    </div>

    <div v-if="!collapsed && !isEmbed" class="orch-sync-health__body">
      <ul v-if="errors.length" class="orch-sync-health__list">
        <li v-for="err in errors" :key="err.scope + err.at">
          <code>{{ err.scope }}</code>
          <span>{{ err.message }}</span>
          <time>{{ formatShortDateTime(err.at) }}</time>
        </li>
      </ul>
      <p v-if="driftCount > 0" class="orch-sync-health__drift">
        <button type="button" class="orch-sync-health__drift-btn" @click="$emit('drift-click')">
          {{ '{n} 条配置漂移 — 请在各联动器列表中修复'.replace('{n}', String(driftCount)) }}
        </button>
      </p>
      <p v-if="linkageWarning" class="orch-sync-health__linkage-warn">{{ linkageWarning }}</p>
      <p v-if="energyLinkage" class="orch-sync-health__energy">
        <span>{{ '能源自动联动' }}：{{ energyLinkage.enabled ? '已启用' : '未启用' }}</span>
        <span v-if="energyLinkage.gaps?.length" class="orch-sync-health__energy-gaps">
          {{ energyLinkage.gaps.join(' · ') }}
        </span>
      </p>
    </div>
  </div>

  <Teleport :to="teleportTarget" :disabled="teleportDisabled">
    <div
      v-if="visible && isEmbed && !collapsed"
      class="orch-sync-health__portal"
      :class="toneClass"
      :style="portalStyle"
      role="dialog"
      :aria-label="'HA 同步健康详情'"
    >
      <ul v-if="errors.length" class="orch-sync-health__list">
        <li v-for="err in errors" :key="'p-' + err.scope + err.at">
          <code>{{ err.scope }}</code>
          <span>{{ err.message }}</span>
          <time>{{ formatShortDateTime(err.at) }}</time>
        </li>
      </ul>
      <p v-if="driftCount > 0" class="orch-sync-health__drift">
        <button type="button" class="orch-sync-health__drift-btn" @click="$emit('drift-click')">
          {{ '{n} 条配置漂移 — 请在各联动器列表中修复'.replace('{n}', String(driftCount)) }}
        </button>
      </p>
      <p v-if="linkageWarning" class="orch-sync-health__linkage-warn">{{ linkageWarning }}</p>
      <p v-if="energyLinkage" class="orch-sync-health__energy">
        <span>{{ '能源自动联动' }}：{{ energyLinkage.enabled ? '已启用' : '未启用' }}</span>
        <span v-if="energyLinkage.gaps?.length" class="orch-sync-health__energy-gaps">
          {{ energyLinkage.gaps.join(' · ') }}
        </span>
      </p>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { AlertTriangle, CheckCircle2, RefreshCw } from '@lucide/vue'
import { fetchLinkageHealth, fetchSystemDiagnostics } from '@/services/api/system'
import { logger } from '@/utils/core/logger'
import { formatShortDateTime } from '@/utils/format/locale-format.util'
import {
  viewportPointToPopupAnchor,
} from '@/composables/ui/usePopupPosition'
import { getTeleportContainerSize } from '@/utils/ui/popup-position-shared.util'
import { useShellTeleportTarget } from '@/composables/ui/useShellTeleportTarget'

// 入参：漂移条数、是否可折叠、当前折叠态、是否嵌入/浮动
const props = defineProps({
  driftCount: { type: Number, default: 0 },
  collapsible: { type: Boolean, default: false },
  collapsed: { type: Boolean, default: false },
  embed: { type: Boolean, default: false },
  floating: { type: Boolean, default: false },
})

// 对外事件：点击漂移项、切换折叠态
defineEmits(['drift-click', 'toggle-collapse'])

const loading = ref(false)
// 后端返回的近期同步/reload 错误列表
const errors = ref([])
// 能源自动联动状态（含 enabled 与 gaps 缺口）
const energyLinkage = ref(null)
// 加载失败时的提示文案
const linkageWarning = ref('')
const rootRef = ref(null)
// Teleport 弹层的内联样式（位置/尺寸/层级）
const portalStyle = ref({})
const { teleportTarget, shellTeleportPending, refreshShellTeleport } = useShellTeleportTarget()
const teleportDisabled = shellTeleportPending

// 是否为嵌入/浮动模式（决定是否使用 Teleport 弹层）
const isEmbed = computed(() => props.embed || props.floating)

// 是否存在问题：错误 / 漂移 / 联动警告 / 能源联动缺口
const hasIssues = computed(
  () =>
    errors.value.length > 0 ||
    props.driftCount > 0 ||
    linkageWarning.value ||
    (energyLinkage.value?.enabled && (energyLinkage.value?.gaps?.length || 0) > 0),
)
// 是否展示卡片：有问题或能源联动启用或存在警告时展示
const visible = computed(
  () =>
    hasIssues.value ||
    energyLinkage.value?.enabled ||
    linkageWarning.value,
)
// 视觉态：有问题用 warn，否则用 ok
const toneClass = computed(() =>
  hasIssues.value ? 'orch-sync-health--warn' : 'orch-sync-health--ok',
)
// 折叠态下的简短提示文案
const chipHint = computed(() => {
  if (props.driftCount > 0) return `${props.driftCount} 条漂移`
  if (linkageWarning.value) return '加载异常'
  if (errors.value.length) return `${errors.value.length} 条错误`
  return '有告警'
})

// 计算弹层位置：基于卡片右下角锚点，并约束在视口宽度内
function updatePortalPos() {
  refreshShellTeleport()
  const el = rootRef.value
  if (!el || typeof el.getBoundingClientRect !== 'function') return
  const r = el.getBoundingClientRect()
  const { cw } = getTeleportContainerSize()
  const width = Math.min(380, Math.max(240, cw - 24))
  const { anchorX: rightX, anchorY: bottomY } = viewportPointToPopupAnchor(r.right, r.bottom + 8)
  let left = rightX - width
  if (left < 12) left = 12
  if (left + width > cw - 12) left = Math.max(12, cw - width - 12)
  portalStyle.value = {
    position: 'fixed',
    top: `${Math.round(bottomY)}px`,
    left: `${Math.round(left)}px`,
    width: `${Math.round(width)}px`,
    zIndex: 12000,
  }
}

// 折叠态/嵌入态/可见性变化时，展开后重新定位弹层
watch(
  () => [props.collapsed, isEmbed.value, visible.value],
  async ([collapsed]) => {
    if (collapsed || !isEmbed.value) return
    await nextTick()
    updatePortalPos()
  },
)

// 拉取同步健康数据：并行请求系统诊断与联动健康，失败时降级提示
async function load() {
  loading.value = true
  linkageWarning.value = ''
  try {
    const [diagRes, linkageRes] = await Promise.all([
      fetchSystemDiagnostics(),
      fetchLinkageHealth(),
    ])
    errors.value = diagRes.data?.orchestratorSync?.recentErrors || []
    energyLinkage.value = linkageRes.data?.energyAutoLinkage || null
  } catch (e) {
    logger.warn('加载联动器同步健康状态失败', e)
    errors.value = []
    energyLinkage.value = null
    linkageWarning.value = '联动健康数据加载失败，同步错误列表可能不完整'
  } finally {
    loading.value = false
    if (!props.collapsed && isEmbed.value) {
      await nextTick()
      updatePortalPos()
    }
  }
}

// 窗口尺寸/滚动变化时同步弹层位置（捕获阶段监听滚动）
function onWinChange() {
  if (!props.collapsed && isEmbed.value) updatePortalPos()
}

onMounted(() => {
  void load()
  window.addEventListener('resize', onWinChange)
  window.addEventListener('scroll', onWinChange, true)
})
onUnmounted(() => {
  window.removeEventListener('resize', onWinChange)
  window.removeEventListener('scroll', onWinChange, true)
})

// 暴露 refresh 供父级调用
defineExpose({ refresh: load })
</script>

<style scoped src="./styles/OrchestratorSyncHealthCard.css"></style>
<style>
.orch-sync-health__portal {
  padding: 10px 12px;
  border-radius: var(--hos-radius-card);
  border: var(--hos-hairline) solid rgba(251, 191, 36, 0.28);
  background: rgba(20, 16, 10, 0.96);
  box-shadow:
    0 12px 32px rgba(0, 0, 0, 0.55),
    0 0 0 1px rgba(255, 255, 255, 0.04);
  backdrop-filter: blur(16px) saturate(140%);
  -webkit-backdrop-filter: blur(16px) saturate(140%);
  font-size: var(--premium-fs-caption, 12px);
  color: rgba(255, 255, 255, 0.85);
}
.orch-sync-health__portal.orch-sync-health--ok {
  border-color: rgba(52, 211, 153, 0.28);
  background: rgba(12, 20, 18, 0.96);
}
.orch-sync-health__portal .orch-sync-health__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.orch-sync-health__portal .orch-sync-health__list li {
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 8px;
  align-items: start;
}
.orch-sync-health__portal .orch-sync-health__list code {
  font-size: var(--premium-fs-micro, 11px);
  color: #93c5fd;
  white-space: nowrap;
}
.orch-sync-health__portal .orch-sync-health__list span {
  color: rgba(255, 255, 255, 0.75);
  word-break: break-word;
}
.orch-sync-health__portal .orch-sync-health__list time {
  color: var(--hos-text-secondary);
  font-size: var(--premium-fs-micro, 11px);
  white-space: nowrap;
}
.orch-sync-health__portal .orch-sync-health__drift {
  margin: 8px 0 0;
}
.orch-sync-health__portal .orch-sync-health__drift-btn {
  border: none;
  background: transparent;
  padding: 0;
  color: #fcd34d;
  font: inherit;
  text-align: left;
  cursor: pointer;
  text-decoration: underline;
  text-underline-offset: 2px;
}
.orch-sync-health__portal .orch-sync-health__drift-btn:hover {
  color: #fde68a;
}
.orch-sync-health__portal .orch-sync-health__linkage-warn {
  margin: 6px 0 0;
  color: rgba(251, 191, 36, 0.9);
}
.orch-sync-health__portal .orch-sync-health__energy {
  margin: 8px 0 0;
  font-size: var(--premium-fs-micro, 11px);
  color: rgba(255, 255, 255, 0.55);
}
.orch-sync-health__portal .orch-sync-health__energy-gaps {
  display: block;
  margin-top: 4px;
  color: #fcd34d;
}
</style>
