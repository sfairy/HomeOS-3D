<!--
  AgentVoiceHoldBar — 面板内的「按住说话」圆环 + 上浮 HUD（对照源码 circle-voice-hud / circle-mic-btn）

  形态：60px 圆形麦克风 + 按下时的发光环；HUD 浮在圆环上方（不是挤在输入行里），
        内容自上而下是「状态点 + 状态文案 / 识别文本 / 7 根波形 / 上滑提示」。
  取消：手指上滑 >=60px 时整体换成玫瑰色，松手丢弃本次识别；越过阈值有触觉反馈。
  无障碍：圆环是 button，键盘用户走左侧的键盘/麦克风切换按钮回文本输入。
-->
<script setup lang="ts">
import { computed } from 'vue'
import { Mic } from '@lucide/vue'
import { useHoldToTalk } from '@/composables/voice/useHoldToTalk'

const props = defineProps({
  /** 忙 / 未配置管家时不可按 */
  disabled: { type: Boolean, default: false },
  /** 已识别的临时文本（源码 partialText） */
  transcript: { type: String, default: '' },
  /** 识别整理中：松手后录音已结束，等 STT 出文本 */
  finalizing: { type: Boolean, default: false },
})

const emit = defineEmits<{ start: []; stop: [canceled: boolean] }>()

const { phase, bars, onPointerDown, onPointerMove, onPointerUp, onPointerCancel } = useHoldToTalk({
  enabled: () => !props.disabled,
  onStart: () => emit('start'),
  onStop: (canceled) => emit('stop', canceled),
})

/** HUD 在「按住 / 已取消 / 识别整理中」三种情况下都要在场 */
const hudVisible = computed(() => phase.value !== 'idle' || props.finalizing)

const canceling = computed(() => phase.value === 'cancel')

const statusText = computed(() => {
  if (canceling.value) return '松开手指，取消发送'
  if (props.finalizing) return '识别整理中…'
  return '正在聆听…'
})

const hintText = computed(() => (canceling.value ? '松开手指 · 取消' : '手指上滑 · 取消发送'))

const transcriptText = computed(() => props.transcript || '正在聆听…')
</script>

<template>
  <div class="avh">
    <Transition name="avh-hud">
      <div v-if="hudVisible" class="avh-hud" :class="{ 'avh-hud--cancel': canceling }">
        <div class="avh-status">
          <span class="avh-dot" :class="{ 'avh-dot--cancel': canceling }" aria-hidden="true" />
          <span class="avh-status__text">{{ statusText }}</span>
        </div>
        <p class="avh-transcript">{{ transcriptText }}</p>
        <div class="avh-wave" aria-hidden="true">
          <span
            v-for="(height, index) in bars"
            :key="index"
            class="avh-wave__bar"
            :class="{ 'avh-wave__bar--cancel': canceling }"
            :style="{ height: `${height}px` }"
          />
        </div>
        <p class="avh-hint" :class="{ 'avh-hint--cancel': canceling }">{{ hintText }}</p>
      </div>
    </Transition>

    <button
      type="button"
      class="avh-btn"
      :class="{
        'avh-btn--active': phase === 'holding' || finalizing,
        'avh-btn--cancel': canceling,
      }"
      :disabled="disabled"
      aria-label="按住说话"
      title="按住说话，上滑取消"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerCancel"
      @contextmenu.prevent
    >
      <span class="avh-glow" :class="{ 'avh-glow--active': phase !== 'idle' }" aria-hidden="true" />
      <Mic class="avh-icon" />
    </button>
  </div>
</template>

<style scoped>
/* 配色只在本块定义一次：全部走 rgba()/var()，新增文件不引入新的硬编码色值 */
.avh {
  --avh-cyan: rgba(0, 240, 255, 1);
  --avh-rose: rgba(244, 63, 94, 1);
  --avh-ink: rgba(9, 13, 21, 1);
  --avh-rose-soft: rgba(244, 63, 94, 0.42);
  --avh-chroma: conic-gradient(
    from var(--avh-chroma-angle),
    var(--acp-blue) 0deg,
    var(--acp-violet) 72deg,
    var(--acp-red) 144deg,
    var(--acp-yellow) 216deg,
    var(--acp-green) 288deg,
    var(--acp-blue) 360deg
  );
  position: relative;
  display: flex;
  flex: none;
  justify-content: center;
  width: 100%;
}

/* 圆环：与源码同尺寸与配色（青底描边 + 内高光），按下时换成实心青 */
.avh-btn {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 60px;
  height: 60px;
  padding: 0;
  border: 1.5px solid rgba(0, 240, 255, 0.4);
  border-radius: 50%;
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.12), rgba(255, 255, 255, 0.04));
  box-shadow:
    0 8px 24px rgba(0, 0, 0, 0.4),
    inset 0 1px 0 rgba(255, 255, 255, 0.2);
  color: var(--avh-cyan);
  cursor: pointer;
  touch-action: none;
  user-select: none;
  -webkit-touch-callout: none;
  transition:
    transform var(--hos-dur-base) var(--hos-ease-spring),
    border-color var(--hos-dur-fast) var(--hos-ease-standard),
    background-color var(--hos-dur-fast) var(--hos-ease-standard),
    color var(--hos-dur-fast) var(--hos-ease-standard);
}

.avh-btn:hover:not(:disabled) {
  border-color: var(--avh-cyan);
  box-shadow:
    0 0 20px rgba(0, 240, 255, 0.35),
    inset 0 1px 0 rgba(255, 255, 255, 0.24);
  transform: scale(1.04);
}

.avh-btn:disabled {
  opacity: 0.45;
  cursor: default;
}

.avh-btn--active {
  background: var(--avh-cyan);
  border-color: var(--avh-cyan);
  color: var(--avh-ink);
  box-shadow: 0 0 28px rgba(0, 240, 255, 0.65);
  transform: scale(0.95);
}

.avh-btn--cancel {
  background: var(--avh-rose);
  border-color: var(--avh-rose);
  box-shadow: 0 0 28px var(--avh-rose-soft);
  color: rgba(255, 255, 255, 1);
}

.avh-btn--active.avh-btn--cancel {
  background: var(--avh-rose);
}

.avh-icon {
  width: 24px;
  height: 24px;
}

/* 按下时的外发光：只在录音态点亮，取消态换玫瑰色 */
.avh-glow {
  position: absolute;
  inset: -6px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(0, 240, 255, 0.35) 0%, rgba(0, 0, 0, 0) 70%);
  opacity: 0;
  transform: scale(0.85);
  pointer-events: none;
  transition:
    opacity var(--hos-dur-base) var(--hos-ease-spring),
    transform var(--hos-dur-base) var(--hos-ease-spring);
}

.avh-glow--active {
  opacity: 1;
  transform: scale(1.2);
  animation: avh-glow-pulse var(--acp-pulse-duration) ease-in-out infinite;
}

.avh-btn--cancel .avh-glow {
  background: radial-gradient(circle, rgba(244, 63, 94, 0.4) 0%, rgba(0, 0, 0, 0) 70%);
  animation: none;
}

/* HUD：浮在圆环上方，左右各外扩 62px 让它有足够宽度放文本 */
.avh-hud {
  position: absolute;
  bottom: calc(100% + 12px);
  left: 50%;
  z-index: 6;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  width: 184px;
  max-width: 92vw;
  padding: 12px 14px;
  border-radius: 18px;
  transform: translateX(-50%);
  pointer-events: none;
  background: rgba(15, 23, 42, 0.96);
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.62);
}

/* 七彩描边：与面板同一条 conic，角度逐帧插值 */
.avh-hud::after {
  content: '';
  position: absolute;
  inset: 0;
  border: 1.5px solid transparent;
  border-radius: 18px;
  background:
    linear-gradient(rgba(15, 23, 42, 0.96), rgba(15, 23, 42, 0.96)) padding-box,
    var(--avh-chroma) border-box;
  animation: avh-chroma-flow var(--acp-chroma-duration) linear infinite;
  pointer-events: none;
}

.avh-hud--cancel {
  background: rgba(26, 11, 20, 0.96);
}

.avh-hud--cancel::after {
  background:
    linear-gradient(rgba(26, 11, 20, 0.96), rgba(26, 11, 20, 0.96)) padding-box,
    linear-gradient(135deg, rgba(244, 63, 94, 0.9), rgba(225, 29, 72, 0.75)) border-box;
  animation: none;
}

.avh-hud > * {
  position: relative;
  z-index: 1;
}

.avh-status {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: rgba(255, 255, 255, 0.72);
}

.avh-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--acp-green, rgba(52, 168, 83, 1));
  box-shadow: 0 0 10px rgba(52, 168, 83, 0.7);
  animation: avh-dot-pulse var(--acp-pulse-duration) ease-in-out infinite;
}

.avh-dot--cancel {
  background: var(--avh-rose);
  box-shadow: 0 0 10px var(--avh-rose-soft);
}

.avh-status__text {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.avh-transcript {
  max-height: 60px;
  margin: 0;
  overflow-y: auto;
  color: rgba(255, 255, 255, 0.96);
  font-size: 12px;
  font-weight: 500;
  line-height: 1.45;
  text-align: center;
  word-break: break-word;
}

.avh-wave {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 3px;
  height: 26px;
}

.avh-wave__bar {
  width: 3px;
  border-radius: 3px;
  background: var(--avh-cyan);
  box-shadow: 0 0 8px rgba(0, 240, 255, 0.55);
  transition: height var(--hos-dur-fast) linear;
}

.avh-wave__bar--cancel {
  background: var(--avh-rose);
  box-shadow: 0 0 8px var(--avh-rose-soft);
}

.avh-hint {
  margin: 0;
  color: rgba(255, 255, 255, 0.45);
  font-size: 10px;
}

.avh-hint--cancel {
  color: var(--avh-rose);
  font-weight: 600;
}

.avh-hud-enter-active,
.avh-hud-leave-active {
  transition:
    opacity var(--hos-dur-fast) var(--hos-ease-standard),
    transform var(--hos-dur-fast) var(--hos-ease-standard);
}

.avh-hud-enter-from,
.avh-hud-leave-to {
  opacity: 0;
  transform: translate(-50%, 6px);
}

@keyframes avh-glow-pulse {
  50% {
    opacity: 0.55;
    transform: scale(1.32);
  }
}

@keyframes avh-dot-pulse {
  50% {
    opacity: 0.45;
  }
}

/* conic 角度必须先注册成 <angle>，否则无法逐帧插值（与面板同一做法） */
@property --avh-chroma-angle {
  syntax: '<angle>';
  inherits: false;
  initial-value: 0deg;
}

@keyframes avh-chroma-flow {
  to {
    --avh-chroma-angle: 360deg;
  }
}

@media (prefers-reduced-motion: reduce) {
  .avh-glow--active,
  .avh-dot,
  .avh-hud::after {
    animation: none;
  }
}
</style>
