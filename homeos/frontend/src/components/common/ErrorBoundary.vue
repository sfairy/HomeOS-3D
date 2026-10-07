<template>
  <div
    class="error-boundary-root"
    :class="{
      'error-boundary-root--compact': compact,
      'error-boundary-root--fill': fill,
    }"
  >
    <!-- 正常态：通过 key 强制子树在 reset 后重新挂载 -->
    <div v-if="!hasError" :key="internalKey" class="error-boundary-root__content">
      <slot />
    </div>
    <!-- 错误态：展示错误卡片与重试按钮 -->
    <div v-else class="error-boundary" role="alert">
      <div class="error-boundary__card ios-card">
        <AlertTriangle class="error-boundary__icon" aria-hidden="true" />
        <h2 class="error-boundary__title">{{ title || '页面出现问题' }}</h2>
        <p class="error-boundary__message">{{ errorMessage }}</p>
        <button type="button" class="error-boundary__retry" @click="reset">
          {{ '重试' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
/**
 * @file ErrorBoundary.vue
 * @module common/ErrorBoundary
 * @description 应用级错误边界：捕获子组件渲染错误，避免整页白屏
 *  职责：
 *    - 通过 onErrorCaptured 捕获子树渲染异常；
 *    - 错误时展示友好卡片与重试入口；
 *    - reset 通过递增 internalKey 强制子树重新挂载，规避遗留状态。
 *  依赖：vue ref/onErrorCaptured，@lucide/vue 图标，utils/core/logger。
 */
import { ref, onErrorCaptured } from 'vue'
import { AlertTriangle } from '@lucide/vue'
import { logger } from '@/utils/core/logger'
defineProps({
  /** 错误卡片标题，默认 '页面出现问题' */
  title: { type: String, default: '' },
  /** 重置时递增以强制子树重新挂载 */
  resetKey: { type: Number, default: 0 },
  /** 嵌入 widget 时使用较小占位高度 */
  compact: { type: Boolean, default: false },
  /** 填满父级 flex 容器（设置页/侧栏 widget） */
  fill: { type: Boolean, default: false },
})

const emit = defineEmits(['error', 'reset'])

/** 是否处于错误态 */
const hasError = ref(false)
/** 错误信息文本 */
const errorMessage = ref('')
/** 内部 key，递增以强制子树重新挂载 */
const internalKey = ref(0)

/**
 * 解析组件实例的名称与文件路径（用于日志定位）
 * @param {*} instance Vue 组件实例
 * @returns {{name?: string, file?: string}}
 */
function resolveCapturedComponent(instance) {
  const type = instance?.$?.type || instance?.type
  if (!type) return { name: undefined, file: undefined }
  const name =
    type.name ||
    type.__name ||
    type.displayName ||
    (typeof type === 'function' ? type.name : undefined)
  const file = type.__file || type.__hmrId || undefined
  return { name, file }
}

/**
 * 解析父级组件的名称与文件路径
 * @param {*} instance Vue 组件实例
 * @returns {{name?: string, file?: string}}
 */
function resolveParentComponent(instance) {
  const parent = instance?.$?.parent || instance?.parent
  return resolveCapturedComponent(parent)
}

/**
 * Vue 错误捕获钩子
 * 捕获子树异常后切换为错误态、记录日志并向上 emit error
 * 返回 false 阻止错误继续向上冒泡，避免整页白屏
 * @param {Error} err 捕获的错误对象
 * @param {*} instance 出错的组件实例
 * @param {string} info 错误信息（Vue 内部提供）
 */
onErrorCaptured((err, instance, info) => {
  hasError.value = true
  errorMessage.value = err?.message || String(err)
  const { name, file } = resolveCapturedComponent(instance)
  const parent = resolveParentComponent(instance)
  logger.error('ErrorBoundary 捕获异常', {
    err,
    message: err?.message,
    stack: err?.stack,
    info,
    component: name,
    file,
    parent: parent.name,
    parentFile: parent.file,
  })
  emit('error', err)
  return false
})

/**
 * 重置错误态：清空错误信息并递增 internalKey 强制子树重新挂载。
 * DOM 补丁类错误（insertBefore/null）通常是 vnode 与真实 DOM 脱节，
 * 仅 remount 会立刻再炸，改为整页刷新才能清掉卡死的「页面加载失败」。
 */
function reset() {
  const message = errorMessage.value || ''
  if (/insertBefore|Cannot read properties of null/i.test(message)) {
    window.location.reload()
    return
  }
  hasError.value = false
  errorMessage.value = ''
  internalKey.value += 1
  emit('reset')
}

defineExpose({ reset, hasError })
</script>

<style scoped src="./styles/ErrorBoundary.css"></style>