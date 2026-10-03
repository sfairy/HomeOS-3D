<template>
  <!-- 加载态：仅当 loading 为真且无错误时展示骨架屏，避免与错误态叠加。
       skeleton="list" 时使用列表型骨架（贴合通知/告警等列表排版），默认面板型。 -->
  <VListSkeleton v-if="isLoading && !errorMessage && skeleton === 'list'" />
  <VPanelSkeleton v-else-if="isLoading && !errorMessage" />
  <!-- 错误态：展示错误标题、描述与重试入口 -->
  <VEmptyState
    v-else-if="errorMessage"
    compact
    :tone="tone"
    :title="errorTitle"
    :description="errorMessage"
  >
    <template #action>
      <button type="button" class="api-query-state__retry" @click="$emit('retry')">
        {{ retryLabel }}
      </button>
    </template>
  </VEmptyState>
  <!-- 正常态：可叠加降级提示条，并通过默认插槽渲染业务内容 -->
  <template v-else>
    <div v-if="isDegraded && showDegradedBanner" class="api-query-state__degraded" role="status">
      <p>{{ degradedMessage }}</p>
      <button v-if="showRetry" type="button" class="api-query-state__retry" @click="$emit('retry')">
        {{ retryLabel }}
      </button>
    </div>
    <slot />
  </template>
</template>

<script setup>
/**
 * @file ApiQueryState.vue
 * @module common/ApiQueryState
 * @description REST 查询状态壳：统一处理 loading / error / degraded / retry 四种态。
 *  职责：
 *    - 加载中渲染骨架屏（VPanelSkeleton）；
 *    - 出错时渲染空态（VEmptyState）并提供重试按钮；
 *    - 降级（部分数据可用）时在内容上方渲染提示条；
 *    - 正常态通过默认插槽透传业务内容。
 *  依赖：vue 的 computed/unref，base/VEmptyState 组件。
 *  注意：Props 经 unref 规范化，避免父级传入 Ref（如 query.loading）时在渲染期读 .value 崩溃。
 */
import { computed, unref } from 'vue'
import VEmptyState from '@/components/common/base/VEmptyState.vue'
import VListSkeleton from '@/components/common/base/VListSkeleton.vue'
import VPanelSkeleton from '@/components/common/base/VPanelSkeleton.vue'

const props = defineProps({
  /** 加载中骨架形态：panel 面板型（默认）/ list 列表型（通知、告警等逐行列表） */
  skeleton: { type: String, default: 'panel' },
  /** 是否处于加载中，支持 Boolean 或 Ref<Boolean>（内部会 unref） */
  loading: { type: [Boolean, Object], default: false },
  /** 错误信息，可为字符串或 Ref；为 false/null/空串视为无错误 */
  error: { type: [String, Object], default: '' },
  /** 是否处于降级态（数据可用但不完整） */
  degraded: { type: [Boolean, Object], default: false },
  /** 是否展示降级提示条 */
  showDegradedBanner: { type: Boolean, default: true },
  /** 降级提示文案 */
  degradedMessage: { type: String, default: '部分数据可能不完整' },
  /** 错误态标题 */
  errorTitle: { type: String, default: '加载失败' },
  /** 错误态视觉色调（VEmptyState tone） */
  tone: { type: String, default: 'amber' },
  /** 重试按钮文案 */
  retryLabel: { type: String, default: '重试' },
  /** 是否展示重试按钮 */
  showRetry: { type: Boolean, default: true },
})

defineEmits(['retry'])

/** 是否加载中：unref 后转 Boolean，兼容 Ref 入参 */
const isLoading = computed(() => Boolean(unref(props.loading)))

/** 错误信息字符串：false/null 视为无错误，其余强制 String 化以便模板渲染 */
const errorMessage = computed(() => {
  const raw = unref(props.error)
  if (raw == null || raw === false) return ''
  return String(raw)
})

/** 是否降级：unref 后转 Boolean */
const isDegraded = computed(() => Boolean(unref(props.degraded)))
</script>

<style scoped>
.api-query-state__degraded {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 10px;
  margin-bottom: 8px;
  border-radius: 8px;
  border: var(--hos-hairline) solid rgba(251, 191, 36, 0.25);
  background: rgba(251, 191, 36, 0.08);
  font-size: var(--premium-fs-caption);
  color: rgba(251, 191, 36, 0.9);
}
.api-query-state__retry {
  font-size: var(--premium-fs-caption);
  font-weight: 600;
  padding: 4px 10px;
  border-radius: var(--hos-radius-pill);
  border: var(--hos-hairline) solid rgba(255, 255, 255, 0.12);
  background: rgba(255, 255, 255, 0.04);
  color: inherit;
  cursor: pointer;
}
.api-query-state__retry:hover {
  background: var(--premium-glass-bg-hover);
}
</style>