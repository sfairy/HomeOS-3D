<!--
  CustomHtmlWidget.vue / components/widgets
  自定义 HTML 微件运行时容器：负责加载 HTML/CSS/JS 三段源码，编译后挂载到隔离
  shadow DOM，通过 ErrorBoundary 包裹避免运行时错误整页崩溃，支持实体上下文注入。
  Props: id 微件实例 ID / html 模板字符串 / style CSS 字符串
         / script JS 字符串 / config 附加配置
  Emit: compile-error 编译失败回传错误对象
  依赖：Pinia — useEntitiesStore 实体快照供微件调用
              + useChromeStore + useAuthStore 身份与壳层；
        @homeos/shared getEntityDomain 域分类；
        ErrorBoundary 运行时沙箱；
        custom-html-widget.util resolveEntityData / buildRuntimeScope。
  注意：scopeId 用于 shadow DOM 作用域样式去重；卸载前主动清理原生事件监听器。
-->
<template>
  <div
    class="custom-html-widget"
    :data-chwt="scopeId"
    :data-chwt-widget="id || undefined"
  >
    <div v-if="roleNotice" class="chwt-role-notice">
      <p class="chwt-role-notice__text">{{ roleNotice }}</p>
    </div>
    <div v-if="error" class="p-4 chwt-error-bg border chwt-error-border rounded-xl">
      <h4 class="chwt-error-title text-xs font-bold mb-2">❌ {{ '编译错误' }}</h4>
      <p class="text-[12px] chwt-error-text font-mono break-all">{{ error }}</p>
    </div>
    <ErrorBoundary v-else compact fill :title="'自定义 HTML'">
      <component :is="dynamicComponent" :key="compileKey" />
    </ErrorBoundary>
  </div>
</template>

<script setup>
import { getEntityDomain } from '@homeos/shared'
/**
 * 自定义 HTML 部件
 * 允许用户编写包含 Vue 模板语法和 Tailwind CSS 的任意内容。
 *
 * 核心能力：
 * 1. 动态编译 - 将用户输入的 HTML+Vue 模板编译为运行时组件
 * 2. 状态绑定 - 可直接访问 haStore / chrome 等全局 Store
 * 3. 样式隔离 - 支持 <style scoped> 与动态 style 标签注入
 * 4. 脚本支持 - 管理员可在 <script> 中 export default { setup(ctx) {} }
 * 5. 错误捕获 - ErrorBoundary 隔离运行时错误，避免侧栏白屏
 */
import { ref, shallowRef, watch, computed, onBeforeUnmount, defineComponent } from 'vue'
import ErrorBoundary from '@/components/common/ErrorBoundary.vue'
import { useEntitiesStore } from '@/stores/entities.store'
import { useChromeStore } from '@/stores/chrome.store'
import { useAuthStore } from '@/stores/auth.store'
import { logger } from '@/utils/core/logger'
import { getEntityDisplayName } from '@/utils/entity/derived.util'
import {
  parseCustomHtmlWidget,
  scopeCustomHtmlCss,
  invokeCustomHtmlSetup,
  formatCustomHtmlSetupError,
  CUSTOM_HTML_WIDGET_EMPTY_TEMPLATE,
} from '@/utils/widget/custom-html-widget.util'

const props = defineProps({
  config: { type: Object, default: () => ({}) },
  id: { type: String, default: '' },
})
const emit = defineEmits(['compile-error'])

const entitiesStore = useEntitiesStore()
const chrome = useChromeStore()
const authStore = useAuthStore()

/** 仅管理员可执行自定义脚本；访客/儿童仅渲染静态模板 */
const canExecuteScripts = computed(() => authStore.role === 'admin')

const fallbackScopeId = `chwt-${Math.random().toString(36).slice(2, 9)}`
const scopeId = computed(() => props.id || fallbackScopeId)
const styleId = computed(() => `custom-style-${scopeId.value}`)
const templateContent = ref('')
const scriptExport = ref({})
const styleContent = ref('')
const styleScoped = ref(false)
const error = ref(null)
const roleNotice = ref('')
const compileKey = ref(0)

function applyStyles() {
  const sid = styleId.value
  let styleEl = document.getElementById(sid)
  const css = styleContent.value
  if (!css) {
    styleEl?.remove()
    return
  }

  const finalCss = styleScoped.value
    ? scopeCustomHtmlCss(css, `[data-chwt="${scopeId.value}"]`)
    : css

  if (!styleEl) {
    styleEl = document.createElement('style')
    styleEl.id = sid
    document.head.appendChild(styleEl)
  }
  styleEl.textContent = finalCss
}

function parseRawHtml(raw) {
  error.value = null
  roleNotice.value = ''
  const parsed = parseCustomHtmlWidget(raw, { allowScripts: canExecuteScripts.value })

  if (parsed.parseError) {
    error.value = parsed.parseError
  } else if (parsed.scriptsStripped) {
    roleNotice.value =
      '当前账号无法执行自定义脚本，仅渲染模板与样式；交互逻辑需使用管理员账号查看。'
  }

  templateContent.value = parsed.template
  scriptExport.value = parsed.scriptExport
  styleContent.value = parsed.styles
  styleScoped.value = parsed.scoped
  applyStyles()
}

watch(() => props.config?.rawHtml, parseRawHtml, { immediate: true })
watch(canExecuteScripts, () => parseRawHtml(props.config?.rawHtml || ''))
watch(scopeId, (_next, prev) => {
  if (prev) document.getElementById(`custom-style-${prev}`)?.remove()
  applyStyles()
})

const dynamicComponent = shallowRef(null)
let compileTimer = null

function buildSetupContext() {
  const entityState = (entityId) => entitiesStore.entities[entityId]?.state ?? ''
  const entityAttr = (entityId, key) => entitiesStore.entities[entityId]?.attributes?.[key]
  const entityName = (entityId) =>
    getEntityDisplayName(entityId, entitiesStore.entities[entityId]) || entityId

  const notify = (message, type, duration) => chrome.notify(message, type, duration)

  // 非管理员：只读沙盒（无 callService / toggle / 可变 store），模板也无法触发控制
  if (!canExecuteScripts.value) {
    return {
      widgetId: props.id,
      entityState,
      entityAttr,
      entityName,
      notify,
    }
  }

  const toggleEntity = (entityId) => {
    const domain = getEntityDomain(entityId)
    entitiesStore
      .callService(domain, 'toggle', entityId)
      .catch((e) => logger.error('toggle 调用失败', e))
  }

  const callService = (domain, service, entityId, serviceData) =>
    entitiesStore.callService(domain, service, entityId, serviceData).catch((e) => {
      logger.error('callService 调用失败', { domain, service, entityId, e })
      throw e
    })

  return {
    haStore: entitiesStore,
    chrome,
    widgetId: props.id,
    entityState,
    entityAttr,
    entityName,
    toggleEntity,
    callService,
    notify,
  }
}

function compileComponent() {
  if (error.value) {
    dynamicComponent.value = null
    return
  }

  const html = templateContent.value || CUSTOM_HTML_WIDGET_EMPTY_TEMPLATE
  const exportData = scriptExport.value
  const allowScripts = canExecuteScripts.value
  const userSetupFn = typeof exportData.setup === 'function' ? exportData.setup : null

  // 用户 setup 必须在动态组件自身的 setup() 内调用，
  // 否则 onMounted / onUnmounted 等生命周期 API 没有当前实例。
  dynamicComponent.value = defineComponent({
    ...exportData,
    template: html,
    setup() {
      const baseContext = buildSetupContext()
      if (!allowScripts || !userSetupFn) {
        return { ...baseContext }
      }
      try {
        window.require = (name) => (name === 'vue' ? window.__homeos_vue__ || {} : {})
        const userSetup = invokeCustomHtmlSetup(userSetupFn, baseContext)
        return { ...baseContext, ...userSetup }
      } catch (e) {
        logger.error('自定义 HTML 组件初始化失败', e)
        error.value = `微件初始化错误：${formatCustomHtmlSetupError(e)}`
        return { ...baseContext }
      }
    },
  })

  compileKey.value += 1
}

watch(
  [templateContent, scriptExport, canExecuteScripts],
  () => {
    if (compileTimer) clearTimeout(compileTimer)
    compileTimer = setTimeout(compileComponent, 300)
  },
  { immediate: true, deep: true },
)

watch(error, (v) => emit('compile-error', v || ''), { immediate: true })

onBeforeUnmount(() => {
  document.getElementById(styleId.value)?.remove()
  if (compileTimer) clearTimeout(compileTimer)
})
</script>

<style scoped src="./styles/CustomHtmlWidget.css"></style>
