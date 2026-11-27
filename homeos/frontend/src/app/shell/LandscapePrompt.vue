<!--
  手机竖屏提示层（唯一的竖屏态 UI）。

  为什么需要：项目按大屏 / 横屏设计，竖屏下整页等比缩放会把正文压到 3–4px。
  Android 可以「全屏 + 方向锁」自动横过来；iOS 没有该 API，只能提示用户旋转设备
  或添加到主屏幕（PWA manifest 的 orientation 在已安装后生效）。
-->
<template>
  <div
    v-if="visible"
    class="hos-landscape-prompt"
    role="dialog"
    aria-modal="true"
    aria-labelledby="hos-landscape-prompt-title"
  >
    <div class="hos-landscape-prompt__card">
      <div class="hos-landscape-prompt__icon" aria-hidden="true">⟳</div>
      <h2 id="hos-landscape-prompt-title" class="hos-landscape-prompt__title">请横屏使用</h2>
      <p class="hos-landscape-prompt__text">
        本界面按大屏横屏设计，竖屏下内容会被压得很小。
      </p>
      <p v-if="hint" class="hos-landscape-prompt__hint" role="status">{{ hint }}</p>
      <div class="hos-landscape-prompt__actions">
        <button
          type="button"
          class="hos-landscape-prompt__btn hos-landscape-prompt__btn--primary"
          :disabled="locking"
          @click="requestLandscape"
        >
          {{ locking ? '正在切换…' : '自动横屏' }}
        </button>
        <button type="button" class="hos-landscape-prompt__btn" @click="dismiss">
          继续竖屏使用
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useLandscapePrompt } from '@/kernel/ui/use-landscape-prompt'

const { visible, locking, hint, requestLandscape, dismiss } = useLandscapePrompt()
</script>

<style scoped>
.hos-landscape-prompt {
  position: fixed;
  inset: 0;
  z-index: var(--z-shell-overlay);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: var(--hos-bg-scrim);
  backdrop-filter: blur(6px);
  color: var(--hos-text-primary);
}

.hos-landscape-prompt__card {
  width: min(360px, calc(100vw - 48px));
  padding: 24px 20px;
  border-radius: var(--hos-radius-card);
  border: 1px solid var(--hos-glass-border);
  background: var(--hos-surface-1);
  text-align: center;
  box-shadow: var(--hos-shadow-2);
}

.hos-landscape-prompt__icon {
  font-size: 40px;
  line-height: 1;
  margin-bottom: 10px;
  color: var(--hos-color-accent);
}

.hos-landscape-prompt__title {
  margin: 0 0 8px;
  font-size: 18px;
  font-weight: 600;
}

.hos-landscape-prompt__text {
  margin: 0 0 12px;
  font-size: 13px;
  line-height: 1.6;
  color: var(--hos-text-secondary);
}

.hos-landscape-prompt__hint {
  margin: 0 0 12px;
  font-size: 12px;
  line-height: 1.5;
  color: var(--hos-text-secondary);
}

.hos-landscape-prompt__actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.hos-landscape-prompt__btn {
  min-height: var(--hos-touch-min);
  padding: 0 16px;
  border-radius: var(--hos-radius-pill);
  border: 1px solid var(--hos-glass-border);
  background: transparent;
  color: inherit;
  font-size: 14px;
  cursor: pointer;
}

.hos-landscape-prompt__btn--primary {
  background: var(--hos-color-accent);
  color: var(--hos-fg-on-accent);
  border-color: transparent;
}

.hos-landscape-prompt__btn:focus-visible {
  outline: var(--hos-focus-outline);
  outline-offset: 2px;
}
</style>
