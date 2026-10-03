<!--
  组件文件：OrchestratorItemBadges.vue
  所属模块：frontend/src/components/common/list-page
  组件职责：编排器列表卡片/行的状态徽标集合。根据单条编排项的属性按需渲染 7 种徽标（互不冲突可叠加）：
    已禁用（灰色 off）/ HA 执行 / 本地引擎（与 runOnHa 互斥二选一）/ 阻塞（blockedReason）/
    不完整（isIncompleteOrchestratorItem）/ 占位符（orchestratorHasPlaceholder）/
    漂移（orchestratorItemHasDrift）；每个徽标自带 title 属性提示详细含义。
  主要 props：
    - props.item：编排条目对象（含 enabled/runOnHa/blockedReason/configId/stub 等字段）；
      props.syncStatusMap：id → { drift, unknown, syncing, syncedAt } 映射；
      props.showLocal / showEnabled：本地引擎与已禁用徽标的显隐控制；
      props.haLabel / localLabel / incompleteTitle / placeholderTitle / driftTitle：文案与 title 配置。
  依赖关系：vue computed；utils/orchestrator/list.util 的 isIncompleteOrchestratorItem /
    orchestratorHasPlaceholder / orchestratorItemHasDrift 三个判定函数。
-->
<template>
  <span v-if="showEnabled && enabled === false" class="list-page__tag list-page__tag--off">{{
    '已禁用'
  }}</span>
  <span v-if="runOnHa" class="list-page__tag list-page__tag--ha">{{ haLabel }}</span>
  <span v-else-if="showLocal" class="list-page__tag list-page__tag--local">{{ localLabel }}</span>
  <span v-if="blockedReason" class="list-page__tag list-page__tag--warn" :title="blockedReason">{{
    '阻塞'
  }}</span>
  <span v-if="incomplete" class="list-page__tag list-page__tag--warn" :title="incompleteTitle">{{
    '不完整'
  }}</span>
  <span
    v-if="hasPlaceholder"
    class="list-page__tag list-page__tag--warn"
    :title="placeholderTitle"
    >{{ '占位符' }}</span
  >
  <span v-if="drift" class="list-page__tag list-page__tag--warn" :title="driftTitle">{{
    '漂移'
  }}</span>
</template>

<script setup>
/**
 * @file OrchestratorItemBadges.vue
 * @module common/list-page
 * @description 编排器列表项的状态徽标集合
 *  职责：根据单条编排项的属性，按需展示「已禁用 / HA 执行 / 本地引擎 / 阻塞 / 不完整 / 占位符 / 漂移」等徽标。
 *  依赖：vue computed，utils/orchestrator/list.util 的状态判定函数。
 */
import { computed } from 'vue'
import {
  isIncompleteOrchestratorItem,
  orchestratorHasPlaceholder,
  orchestratorItemHasDrift,
} from '@/utils/orchestrator/list.util'

const props = defineProps({
  /** 编排器条目对象，含 enabled/runOnHa/blockedReason 等字段 */
  item: { type: Object, required: true },
  /** 同步状态映射表，用于判定漂移 */
  syncStatusMap: { type: Object, default: () => ({}) },
  /** 是否展示「本地引擎」徽标 */
  showLocal: { type: Boolean, default: true },
  /** 是否展示「已禁用」徽标 */
  showEnabled: { type: Boolean, default: false },
  /** HA 执行徽标文案 */
  haLabel: { type: String, default: 'HA 执行' },
  /** 本地引擎徽标文案 */
  localLabel: { type: String, default: '本地引擎' },
  /** 「不完整」徽标的 hover 提示 */
  incompleteTitle: {
    type: String,
    default: 'Config API 无法读取完整配置，请在联动器中补全或启用 HA 执行',
  },
  /** 「占位符」徽标的 hover 提示 */
  placeholderTitle: { type: String, default: '含占位实体，点击编辑进入占位向导' },
  /** 「漂移」徽标的 hover 提示 */
  driftTitle: { type: String, default: '本地与 HA 配置不一致，请在联动器中修复漂移' },
})

/** 是否启用 */
const enabled = computed(() => props.item.enabled)
/** 是否在 HA 执行 */
const runOnHa = computed(() => Boolean(props.item.runOnHa))
/** 阻塞原因（无则不展示徽标） */
const blockedReason = computed(() => props.item.blockedReason || '')
/** 是否配置不完整 */
const incomplete = computed(() => isIncompleteOrchestratorItem(props.item))
/** 是否含占位实体 */
const hasPlaceholder = computed(() => orchestratorHasPlaceholder(props.item))
/** 是否与 HA 漂移 */
const drift = computed(() => orchestratorItemHasDrift(props.item, props.syncStatusMap))
</script>
