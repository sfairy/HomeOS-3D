<!--
  组件文件：VFolderCreateModal.vue
  所属模块：frontend/src/components/common/base
  组件职责：「黑曜石深色微晶」新建文件夹弹窗。以专用弹窗替代通用输入弹窗，承载
    资源库（背景图 / 图标）新建文件夹的命名交互。
    提供更精致的微晶质感输入体验，并支持键盘快捷键：
      - Enter 提交创建
      - Esc   取消关闭
    名称合法性（非空、不含路径分隔符）在提交前本地校验，失败信息内联展示且不关闭弹窗，
    便于用户直接改名重试。
  主要 props / emits：
    - props.modelValue：是否打开（v-model）
    - props.busy：提交中（禁用按钮与关闭，防重复提交）
    - props.error：父级传入的失败原因（如后端"目录已存在"）
    - props.defaultName：打开时回填的名称
    - emits update:modelValue / confirm(name)
  依赖关系：@lucide/vue（图标）、useFocusTrap（焦点陷阱）、
    ./styles/VFolderCreateModal.css（微晶样式）。
  注意事项：本组件只负责命名与校验，实际创建请求由父级 useAssetManager 发起；
    因此组件在 busy 期间保持打开，父级成功后自行关闭。
-->
<template>
  <Transition name="hos-modal">
    <div v-if="modelValue" class="hos-modal-root" @click.self="cancel">
      <div class="hos-modal-backdrop" />
      <div
        ref="panelRef"
        class="vfc-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="vfc-title"
      >
        <!-- 微晶棱面装饰层（纯视觉，不参与交互） -->
        <div class="vfc-facets" aria-hidden="true" />

        <header class="vfc-head">
          <div class="vfc-head-icon">
            <FolderPlus class="w-5 h-5" />
          </div>
          <div class="vfc-head-text">
            <h3 id="vfc-title" class="vfc-title">{{ '新建文件夹' }}</h3>
            <p class="vfc-subtitle">{{ '在当前目录下创建新的素材文件夹' }}</p>
          </div>
          <button type="button" class="vfc-close" aria-label="取消" @click="cancel">&times;</button>
        </header>

        <div class="vfc-body">
          <label class="vfc-label" :for="inputId">{{ '文件夹名称' }}</label>
          <div :class="['vfc-field', errorMessage && 'vfc-field--error']">
            <FolderOpen class="vfc-field-icon w-4 h-4" />
            <input
              :id="inputId"
              ref="inputRef"
              v-model="name"
              type="text"
              class="vfc-input"
              :placeholder="'例如：2F-卧室'"
              autocomplete="off"
              spellcheck="false"
              @keydown.enter.prevent="submit"
            />
            <span class="vfc-caret" aria-hidden="true" />
          </div>
          <p v-if="errorMessage" class="vfc-error">{{ errorMessage }}</p>
        </div>

        <footer class="vfc-foot">
          <div class="vfc-hints">
            <span class="vfc-hint"><kbd>Enter</kbd>{{ '创建' }}</span>
            <span class="vfc-hint"><kbd>Esc</kbd>{{ '取消' }}</span>
          </div>
          <div class="vfc-actions">
            <button type="button" class="vfc-btn vfc-btn--ghost" @click="cancel">
              {{ '取消' }}
            </button>
            <button
              type="button"
              class="vfc-btn vfc-btn--primary"
              :disabled="busy"
              @click="submit"
            >
              <Loader2 v-if="busy" class="w-4 h-4 animate-spin" />
              {{ busy ? '创建中…' : '创建文件夹' }}
            </button>
          </div>
        </footer>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
/**
 * 职责：实现 VFolderCreateModal 组件的界面渲染、用户交互与 props/emit 通信。
 * 关键依赖：Vue 3 `<script setup>`、Lucide 图标、useFocusTrap、微晶样式表。
 * 约定：- 本组件不发起网络请求，只做命名校验并 emit confirm；
 *      - 关闭动作统一走 cancel/close，避免重复 emit。
 */
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { FolderOpen, FolderPlus, Loader2 } from '@lucide/vue'
import { useFocusTrap } from '@/composables/ui/useFocusTrap'

const props = withDefaults(
  defineProps<{
    /** 是否打开（v-model） */
    modelValue: boolean
    /** 提交中：禁用按钮并阻止关闭，避免重复提交 */
    busy?: boolean
    /** 父级传入的失败原因（例如后端返回"目录已存在"） */
    error?: string
    /** 打开时回填的默认名称 */
    defaultName?: string
  }>(),
  { busy: false, error: '', defaultName: '' },
)

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  confirm: [name: string]
}>()

const panelRef = ref<HTMLElement | null>(null)
const inputRef = ref<HTMLInputElement | null>(null)
/** 输入框绑定值 */
const name = ref('')
/** 本地校验错误（优先于父级传入的 error 展示） */
const localError = ref('')
// 输入框 id，用于 label 关联
const inputId = `vfc-input-${Math.random().toString(36).slice(2, 9)}`

/** 展示用错误信息：本地校验优先，其次是父级（后端）错误 */
const errorMessage = computed(() => localError.value || props.error || '')

// 焦点陷阱激活条件：弹窗打开
useFocusTrap(panelRef, computed(() => props.modelValue))

/** 关闭弹窗（不发请求） */
function close() {
  emit('update:modelValue', false)
}

/** 取消：提交中禁止关闭，避免请求悬空 */
function cancel() {
  if (props.busy) return
  localError.value = ''
  close()
}

/**
 * 提交名称：本地校验通过后 emit confirm。
 * 校验失败只内联报错并重新聚焦，不关闭弹窗，便于直接改名重试。
 */
function submit() {
  if (props.busy) return
  const value = name.value.trim()
  if (!value) {
    localError.value = '请输入文件夹名称'
    inputRef.value?.focus()
    return
  }
  // 名称不允许含路径分隔符：避免误建多级目录，也避免与面包屑语义混淆
  if (/[\\/]/.test(value)) {
    localError.value = '名称不能包含 / 或 \\'
    inputRef.value?.focus()
    return
  }
  localError.value = ''
  emit('confirm', value)
}

/**
 * 全局键盘事件：Escape 取消。
 * Enter 由输入框的 keydown 处理（需保证输入框获得焦点，故打开时自动聚焦）。
 * @param e 键盘事件
 */
function onKeyDown(e: KeyboardEvent) {
  if (!props.modelValue) return
  if (e.key === 'Escape') cancel()
}

// 父级错误变化时清掉本地错误，避免两条错误互相覆盖
watch(
  () => props.error,
  () => {
    localError.value = ''
  },
)

// 打开时锁定滚动、回填默认值并聚焦全选；关闭时恢复
watch(
  () => props.modelValue,
  async (open) => {
    document.body.style.overflow = open ? 'hidden' : ''
    if (open) {
      name.value = props.defaultName ?? ''
      localError.value = ''
      await nextTick()
      inputRef.value?.focus()
      inputRef.value?.select()
    }
  },
)

onMounted(() => {
  window.addEventListener('keydown', onKeyDown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', onKeyDown)
  document.body.style.overflow = ''
})
</script>

<style scoped src="./styles/VFolderCreateModal.css"></style>
