<script setup lang="ts">
/**
 * 统一状态面板：加载 / 空 / 错误 / 离线 四态。
 *
 * 为什么要有它：认证与设置页过去把「加载中」「没有数据」「请求失败」都写成一行
 * `<p class="hos-msg is-err">` 或干脆什么都不显示 —— 三种完全不同的处境长得一样，
 * 用户只能靠猜。这个组件给四态各自一套结构：图标 + 标题 + 说明 + 主要动作，
 * 并统一保证 a11y（aria-live、role）与触控目标 44px。
 *
 * 慢加载诊断（产品要求）：loading 状态超过 10 秒仍未结束，自动多出一行
 * 「仍在连接…」+ 诊断入口 —— 墙面板用户没有控制台可看，10 秒无反馈就会拍屏。
 */
import { computed, onBeforeUnmount, ref, watch } from 'vue'

/** 四态字面量 */
type StateKind = 'loading' | 'empty' | 'error' | 'offline'

const props = withDefaults(
  defineProps<{
    /** 当前状态 */
    state: StateKind
    /** 主标题（缺省按状态给默认文案） */
    title?: string
    /** 一行说明：出错原因、空态为什么空 */
    description?: string
    /** 错误码（如 INSTANCE_MISMATCH）：错误态单独一行等宽显示，便于报客服 */
    errorCode?: string
    /** 动作按钮文案；空态主 CTA 必填，其余态缺省「重试」 */
    actionLabel?: string
    /** loading 超过多少毫秒后提示诊断入口（0 = 关闭） */
    slowAfterMs?: number
  }>(),
  {
    title: '',
    description: '',
    errorCode: '',
    actionLabel: '',
    slowAfterMs: 10000,
  },
)

const emit = defineEmits<{
  /** 点了动作按钮（重试 / 去创建 / 重新连接） */
  (event: 'action'): void
  /** 点了「查看诊断」 */
  (event: 'diagnose'): void
}>()

const DEFAULT_TITLE: Record<StateKind, string> = {
  loading: '正在加载',
  empty: '这里还没有内容',
  error: '出了点问题',
  offline: '设备已离线',
}

const resolvedTitle = computed(() => props.title || DEFAULT_TITLE[props.state])
const resolvedAction = computed(() => {
  if (props.actionLabel) return props.actionLabel
  return props.state === 'offline' ? '重新连接' : '重试'
})
/** 只有 loading 才需要动作按钮缺省隐藏；其余态都带一个出口 */
const actionVisible = computed(() => props.state !== 'loading' || Boolean(props.actionLabel))

/** aria-live：加载用 polite（不打断），失败/离线用 assertive（需要立刻知道） */
const liveMode = computed(() => (props.state === 'loading' || props.state === 'empty' ? 'polite' : 'assertive'))

/** 错误/离线的 role：错误用 alert，其余用 status */
const roleMode = computed(() => (props.state === 'error' || props.state === 'offline' ? 'alert' : 'status'))

const slow = ref(false)
let slowTimer: ReturnType<typeof setTimeout> | undefined

/** 重开计时器：只在 loading 且开启阈值时计时 */
function armSlowTimer(): void {
  clearTimeout(slowTimer)
  slow.value = false
  if (props.state !== 'loading' || !props.slowAfterMs) return
  slowTimer = setTimeout(() => {
    slow.value = true
  }, props.slowAfterMs)
}

watch(() => [props.state, props.slowAfterMs], armSlowTimer, { immediate: true })
onBeforeUnmount(() => clearTimeout(slowTimer))
</script>

<template>
  <div
    class="state-panel"
    :class="`state-panel--${state}`"
    :role="roleMode"
    :aria-live="liveMode"
    :aria-busy="state === 'loading' ? 'true' : 'false'"
  >
    <span class="state-panel__glyph" aria-hidden="true">
      <i v-if="state === 'loading'" class="state-panel__spinner"></i>
      <template v-else-if="state === 'empty'">∅</template>
      <template v-else-if="state === 'offline'">⌁</template>
      <template v-else>!</template>
    </span>

    <p class="state-panel__title">{{ resolvedTitle }}</p>
    <p v-if="description" class="state-panel__desc">{{ description }}</p>
    <p v-if="state === 'error' && errorCode" class="state-panel__code">错误码 {{ errorCode }}</p>

    <!-- 慢加载：10 秒是墙面板上「还能忍」的上限，超过就必须给出口 -->
    <p v-if="slow" class="state-panel__slow">
      连接时间较长，可能网络不稳定。
      <button class="state-panel__link" type="button" @click="emit('diagnose')">查看诊断</button>
    </p>

    <div class="state-panel__actions">
      <button
        v-if="actionVisible"
        class="state-panel__action"
        type="button"
        @click="emit('action')"
      >
        {{ resolvedAction }}
      </button>
      <button
        v-if="state !== 'loading' && !slow"
        class="state-panel__link"
        type="button"
        @click="emit('diagnose')"
      >
        查看诊断
      </button>
    </div>
  </div>
</template>

<style scoped>
/* 全部用 canonical 令牌（packages/shared/src/styles/design-tokens.css）。 */
.state-panel {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--hos-space-2);
  min-height: 180px;
  padding: var(--hos-space-6) var(--hos-space-4);
  text-align: center;
  color: var(--hos-fg-2);
  border-radius: var(--hos-r-2);
}

.state-panel__glyph {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  margin-bottom: var(--hos-space-1);
  border-radius: var(--hos-r-4);
  border: var(--hos-line-width) solid var(--hos-line-2);
  color: var(--hos-fg-3);
  font-size: var(--hos-fs-6);
  line-height: 1;
}

.state-panel--error .state-panel__glyph {
  color: var(--hos-color-danger);
  border-color: var(--hos-color-danger-line);
  background: var(--hos-color-danger-soft);
}

.state-panel--offline .state-panel__glyph {
  color: var(--hos-color-warning);
  border-color: var(--hos-color-warning-line);
  background: var(--hos-color-warning-soft);
}

.state-panel__spinner {
  width: 18px;
  height: 18px;
  border: 2px solid var(--hos-line-3);
  border-top-color: var(--hos-color-accent);
  border-radius: 50%;
  animation: statePanelSpin 0.9s linear infinite;
}

@keyframes statePanelSpin {
  to {
    transform: rotate(360deg);
  }
}

/* 减少动效：转圈停掉，但保留一圈 2px 强调色描边，避免「转得很慢」被读成卡住 */
@media (prefers-reduced-motion: reduce) {
  .state-panel__spinner {
    animation: none;
    border-color: var(--hos-color-accent);
    opacity: 0.5;
  }
}

.state-panel__title {
  margin: 0;
  color: var(--hos-fg-1);
  font-size: var(--hos-fs-6);
  font-weight: 600;
  letter-spacing: -0.01em;
}

.state-panel__desc {
  margin: 0;
  max-width: 46ch;
  font-size: var(--hos-fs-4);
  line-height: var(--hos-lh-normal);
}

.state-panel__code {
  margin: 0;
  padding: 2px 8px;
  border-radius: var(--hos-r-1);
  background: var(--hos-bg-tint-2);
  color: var(--hos-fg-3);
  font-family: var(--hos-font-mono);
  font-size: var(--hos-fs-2);
  letter-spacing: 0.04em;
}

.state-panel__slow {
  margin: 0;
  font-size: var(--hos-fs-3);
  color: var(--hos-fg-3);
}

.state-panel__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: var(--hos-space-2);
  margin-top: var(--hos-space-2);
}

/* 触控目标：墙面板是手指操作，44px 是下限，不是可选值 */
.state-panel__action {
  min-height: var(--hos-touch-min);
  padding: 0 var(--hos-space-5);
  border: none;
  border-radius: var(--hos-r-2);
  background: var(--hos-color-accent);
  color: var(--hos-fg-on-accent);
  font-size: var(--hos-fs-4);
  font-weight: 600;
  cursor: pointer;
  transition: background var(--hos-dur-fast) var(--hos-ease-standard);
}

.state-panel__action:hover {
  background: var(--hos-color-accent-strong);
}

.state-panel__action:focus-visible {
  outline: var(--hos-focus-outline);
  outline-offset: var(--hos-focus-offset);
}

.state-panel__link {
  min-height: var(--hos-touch-min);
  padding: 0 var(--hos-space-2);
  border: none;
  background: transparent;
  color: var(--hos-color-accent);
  font-size: var(--hos-fs-3);
  cursor: pointer;
}

.state-panel__link:focus-visible {
  outline: var(--hos-focus-outline);
  outline-offset: var(--hos-focus-offset);
  border-radius: var(--hos-r-1);
}
</style>
