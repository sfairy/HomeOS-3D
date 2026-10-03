<!--
  组件文件：OrchestratorListSyncBanner.vue
  所属模块：frontend/src/components/common/list-page
  组件职责：编排器列表顶部的 HA 同步状态横幅。根据 driftCount > 0 / syncLoading / actionBusy 组合展示
    正常态（绿色 CheckCircle2 + 「HA 同步状态正常」）或警告态（黄色 AlertTriangle + 「N 条配置与 HA 漂移」），
    右侧操作按钮：修复漂移、全部推送、以及打开联动器（或高级修复）RouterLink；alwaysShow=true 时
    正常态也固定展示，否则仅加载中/忙碌/有漂移时出现。
  主要 props / emits：
    - props.driftCount / syncLoading / actionBusy / actionBusyLabel：同步数据；
      props.orchestratorRoute：打开联动器 RouterLink 目标；
      props.alwaysShow / showRepair / showSyncAll：三项显隐开关。
    - emits：repair-all（修复所有漂移）、sync-all（全部推送到 HA）。
  依赖关系：vue computed；@lucide/vue AlertTriangle/CheckCircle2 图标；纯 scoped CSS（玻璃拟态 + 色调差异）。
-->
<template>
  <div
    v-if="visible"
    class="orch-list-sync"
    :class="driftCount > 0 ? 'orch-list-sync--warn' : 'orch-list-sync--ok'"
    role="status"
  >
    <AlertTriangle v-if="driftCount > 0" class="w-4 h-4 shrink-0" />
    <CheckCircle2 v-else class="w-4 h-4 shrink-0" />
    <span class="orch-list-sync__text">
      <template v-if="syncLoading">{{ '检查 HA 同步状态…' }}</template>
      <template v-else-if="actionBusy">{{ actionBusyLabel || '处理中…' }}</template>
      <template v-else-if="driftCount > 0">
        {{ '{n} 条配置与 HA 漂移'.replace('{n}', String(driftCount)) }}
      </template>
      <template v-else>{{ 'HA 同步状态正常' }}</template>
    </span>
    <div class="orch-list-sync__actions">
      <button
        v-if="showRepair && driftCount > 0"
        type="button"
        class="orch-list-sync__btn"
        :disabled="actionBusy || syncLoading"
        @click="$emit('repair-all')"
      >
        {{ '修复漂移' }}
      </button>
      <button
        v-if="showSyncAll"
        type="button"
        class="orch-list-sync__btn"
        :disabled="actionBusy || syncLoading"
        @click="$emit('sync-all')"
      >
        {{ '全部推送' }}
      </button>
      <router-link
        v-if="orchestratorRoute"
        :to="orchestratorRoute"
        class="orch-list-sync__link"
      >
        {{ driftCount > 0 ? '高级修复' : '打开联动器' }}
      </router-link>
    </div>
  </div>
</template>

<script setup>
/**
 * @file OrchestratorListSyncBanner.vue
 * @module common/list-page
 * @description 编排器列表的同步状态横幅
 *  职责：
 *    - 根据 driftCount 与 syncLoading/actionBusy 切换文案与图标（警告/正常态）；
 *    - 提供「修复漂移」「全部推送」「打开联动器」操作入口；
 *    - 通过 alwaysShow 控制是否在正常态也展示。
 *  依赖：vue computed，@lucide/vue AlertTriangle/CheckCircle2 图标。
 */
import { computed } from 'vue'
import { AlertTriangle, CheckCircle2 } from '@lucide/vue'

const props = defineProps({
  /** 与 HA 漂移的条目数量（>0 时进入警告态） */
  driftCount: { type: Number, default: 0 },
  /** 是否正在检查同步状态 */
  syncLoading: { type: Boolean, default: false },
  /** 「打开联动器」路由目标（字符串或路由对象） */
  orchestratorRoute: { type: [String, Object], default: '' },
  /** 是否始终展示（即使正常态也显示） */
  alwaysShow: { type: Boolean, default: false },
  /** 是否展示「修复漂移」按钮 */
  showRepair: { type: Boolean, default: false },
  /** 是否展示「全部推送」按钮 */
  showSyncAll: { type: Boolean, default: false },
  /** 是否处于异步操作中（按钮禁用） */
  actionBusy: { type: Boolean, default: false },
  /** 异步操作中文案（默认「处理中…」） */
  actionBusyLabel: { type: String, default: '' },
})

defineEmits(['repair-all', 'sync-all'])

/** 是否可见：始终展示 或 加载中 或 操作中 或 存在漂移 */
const visible = computed(
  () =>
    props.alwaysShow ||
    props.syncLoading ||
    props.actionBusy ||
    props.driftCount > 0,
)
</script>

<style scoped>
.orch-list-sync {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px 12px;
  margin: 0 0 12px;
  padding: 10px 14px;
  border-radius: var(--hos-radius-card);
  font-size: var(--premium-fs-caption);
  border: var(--hos-hairline) solid var(--premium-border);
}
.orch-list-sync--ok {
  background: rgba(52, 211, 153, 0.06);
  border-color: rgba(52, 211, 153, 0.18);
  color: rgba(167, 243, 208, 0.95);
}
.orch-list-sync--warn {
  background: rgba(251, 191, 36, 0.08);
  border-color: rgba(251, 191, 36, 0.22);
  color: rgba(253, 230, 138, 0.95);
}
.orch-list-sync__text {
  flex: 1;
  min-width: 160px;
}
.orch-list-sync__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}
.orch-list-sync__btn {
  appearance: none;
  border: var(--hos-hairline) solid currentColor;
  background: transparent;
  color: inherit;
  font: inherit;
  font-weight: 600;
  padding: 4px 10px;
  border-radius: 8px;
  cursor: pointer;
}
.orch-list-sync__btn:hover:not(:disabled) {
  opacity: 0.85;
}
.orch-list-sync__btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.orch-list-sync__link {
  font-weight: 600;
  color: inherit;
  text-decoration: underline;
  text-underline-offset: 2px;
}
.orch-list-sync__link:hover {
  opacity: 0.85;
}
</style>
