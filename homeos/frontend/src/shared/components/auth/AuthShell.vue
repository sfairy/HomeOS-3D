<script setup lang="ts">
/**
 * 认证 / 开通页的统一外壳。
 *
 * 为什么要有它：注册、登录、激活三个页面各自把「hos-page → SceneStage → hos-dock →
 * hos-panel → 边缘光 → 四角」这段 DOM 抄了一遍（每页 10 行、共 5 页），于是出现了这些
 * 只有并列读才看得见的不一致：
 *   · 步骤编号分母不同（注册 01/03、登录 02/03、激活 03/05）
 *   · 登录与找回密码都写 02/03，读起来像同一步
 *   · 语气色不一致（登录/注册用 accent，激活用 eco）
 * 集中到这一个组件后，外壳只有一份，页面只声明「我在哪一步」，步骤轨道自动编号。
 *
 * 样式复用 public/static/auth/scene/{page,panel}.css 里既有的 .hos-page / .hos-dock /
 * .hos-panel / .hos-steps 类（这些样式由 index.html 直挂，认证页首帧即有），
 * 本组件不新增视觉规则 —— 换皮仍走那一份 CSS。
 */
import { computed } from 'vue'

import type { RenderableAuthStep } from '@/shared/utils/auth/auth-flow.util'

const props = defineProps<{
  /** 语气色：accent 用于账号流程，eco 用于授权/激活流程 */
  tone?: 'accent' | 'eco' | 'lumen'
  /** 抬头小字（页面名，不含步骤编号；编号由轨道承担） */
  eyebrow: string
  /** 主标题 */
  title: string
  /** 标题下的说明句 */
  description?: string
  /** 抬头右侧的安全感标签，例如「一机一码」 */
  secure?: string
  /** 步骤轨道；为空时不渲染轨道（单步页面不必硬凑） */
  steps?: RenderableAuthStep[]
  /** 轨道无障碍名 */
  stepsLabel?: string
}>()

const toneClass = computed(() => `hos-tone--${props.tone ?? 'accent'}`)
const stepList = computed(() => props.steps ?? [])

/**
 * 步骤 DOM 的 class：既有 CSS 用 is-done / is-current / is-blocked 三个状态类。
 * @param state 该步状态
 */
function stepClass(state: RenderableAuthStep['state']): string {
  if (state === 'done') return 'is-done'
  if (state === 'current') return 'is-current'
  if (state === 'blocked') return 'is-blocked'
  return ''
}
</script>

<template>
  <div class="hos-page" :class="toneClass">
    <!-- 场景背景由调用方以 slot 传入：src/shared 不允许反向 import app 层组件
         （eslint no-restricted-imports），把「背景是什么」留给页面自己声明。 -->
    <slot name="scene" />

    <main class="hos-dock">
      <section class="hos-panel hos-rise">
        <span class="hos-panel__edge" aria-hidden="true"></span>
        <span class="hos-panel__corner hos-panel__corner--tl" aria-hidden="true"></span>
        <span class="hos-panel__corner hos-panel__corner--tr" aria-hidden="true"></span>
        <span class="hos-panel__corner hos-panel__corner--bl" aria-hidden="true"></span>
        <span class="hos-panel__corner hos-panel__corner--br" aria-hidden="true"></span>

        <!-- 开通轨道：放在抬头之上（.hos-panel > .hos-steps 自带一条分隔底边）。
             当前步用 aria-current="step"，读屏用户听到的是「第 2 步，共 3 步」，而不是一串数字。 -->
        <ol v-if="stepList.length" class="hos-steps" :aria-label="stepsLabel ?? '流程进度'">
          <li
            v-for="step in stepList"
            :key="step.key"
            class="hos-steps__item"
            :class="stepClass(step.state)"
            :aria-current="step.state === 'current' || step.state === 'blocked' ? 'step' : undefined"
          >
            <i class="hos-steps__dot" aria-hidden="true"></i>
            <span>{{ step.ordinal }} {{ step.label }}</span>
          </li>
        </ol>

        <div class="hos-panel__head">
          <div class="hos-eyebrow-row">
            <p class="hos-eyebrow">{{ eyebrow }}</p>
            <span v-if="secure" class="hos-secure">
              <i class="hos-secure-dot" aria-hidden="true"></i>{{ secure }}
            </span>
          </div>
          <h1>{{ title }}</h1>
          <p v-if="description" class="hos-panel__desc">{{ description }}</p>
          <!-- 页面可以把「当前状态句 / 提示条」放进抬头块，保持在标题下方同一视觉组里 -->
          <slot name="head-extra" />
        </div>

        <slot />

        <div v-if="$slots.copy" class="hos-panel__copy">
          <slot name="copy" />
        </div>
      </section>
    </main>
  </div>
</template>
