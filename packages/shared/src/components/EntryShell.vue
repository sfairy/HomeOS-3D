<script setup lang="ts">
/**
 * 入户页的统一外壳：两套前端、九个入户页共用这一份 DOM。
 *
 * 改造前这段结构被抄了**九遍**（主应用 5 页 + 商店 AuthView / SetupView / AdminLayout 登录屏），
 * 每份都自带「hos-page → 场景 → hos-dock → hos-panel → 边缘光 → 四角」这六件套。
 * 抄九遍的代价不是字符数，而是**它们会各自漂**：外层的类名、四角 span 的顺序、
 * `hos-rise` 挂在谁身上、坞体里那块 copy 在不在 … 任何一处不同，两个应用的入户页就会出现
 * 「同一个组件在 A 应用是玻璃、在 B 应用是实底」的差异，而这种差异在排查闪烁时极难定位。
 *
 * 本组件只负责**结构与槽位**，不含任何视觉规则：
 *   · 尺寸 / 间距 / 玻璃 / 动效来自 `packages/shared/scene/static/{page,panel,scene}.css`；
 *   · 场景由调用方通过 `#scene` 槽传入 —— 两端的页面字典与版本号来源不同
 *     （主应用读 package.json，商店读 `/healthz`），把「背景是什么」留给各自的薄适配层；
 *   · 步骤轨道、抬头附加块、坞脚各有一个槽，页面只声明内容。
 *
 * 为什么场景是槽而不是 prop：共享包不认识 `sceneValues(page)` —— 页面字典留在应用侧，
 * 共享包只约定「这里放一个背景」。这也让两端可以各自演进场景数据而不动共享层。
 *
 * 类名 / id 的写法：调用方直接写在 `<EntryShell class="hb-page-shell" id="…">` 上即可 ——
 * 本组件是**单根**，Vue 会把 fallthrough 属性落到根元素（`.hos-page`）。
 * 只有要塞进**面板**（而不是根）的属性才需要 `panelAttrs`，例如商店的 `data-store-page`。
 */
import { computed } from 'vue'

import type { EntryStep } from './entry-step'

const props = defineProps<{
  /** 语气色：决定整页的强调色。`alert` 给异常路径（找回 / 需人工处理） */
  tone?: 'accent' | 'eco' | 'lumen' | 'aura' | 'alert'
  /** 抬头小字（页面名，不含步骤编号；编号由轨道承担） */
  eyebrow: string
  /** 主标题 */
  title: string
  /** 标题下的说明句 */
  description?: string
  /** 抬头右侧的安全感标签，例如「一机一码」 */
  secure?: string
  /** 步骤轨道；为空时不渲染轨道（单步页面不必硬凑） */
  steps?: EntryStep[]
  /** 轨道无障碍名 */
  stepsLabel?: string
  /** 面板本体上的透传属性（例如商店的 `data-store-page`）。根元素不需要它 —— 属性会 fallthrough */
  panelAttrs?: Record<string, string | undefined>
  /**
   * 面板元素的重建键：值变了就重建 `<section class="hos-panel">`，让 `hos-rise` 入场重放。
   *
   * 为什么键挂在**面板**而不是整页根上：外层 `.hos-page` 里还有场景（SceneStage）。
   * 整页重建会把场景一起拆掉再初始化 —— 背景闪一下，正是这次要消灭的现象。
   * 商店登录/注册/找回密码共用一块坞体，切换靠这个键只换坞体。
   */
  panelKey?: string | number
}>()

const toneClass = computed(() => `hos-tone--${props.tone ?? 'accent'}`)
const stepList = computed<EntryStep[]>(() => props.steps ?? [])

/**
 * 步骤 DOM 的 class：既有 CSS 用 is-done / is-current / is-blocked 三个状态类。
 * @param state 该步状态
 */
function stepClass(state: EntryStep['state']): string {
  if (state === 'done') return 'is-done'
  if (state === 'current') return 'is-current'
  if (state === 'blocked') return 'is-blocked'
  return ''
}
</script>

<template>
  <div class="hos-page" :class="toneClass">
    <!-- 背景：由调用方声明（见文件头「为什么场景是槽而不是 prop」）。 -->
    <slot name="scene" />

    <main class="hos-dock">
      <section :key="panelKey" class="hos-panel hos-rise" v-bind="panelAttrs">
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
          <!-- 页面可以把「当前状态句 / 提示条 / 甲板」放进抬头块，保持在标题下方同一视觉组里 -->
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
