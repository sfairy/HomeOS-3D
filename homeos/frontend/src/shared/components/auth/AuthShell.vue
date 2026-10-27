<script setup lang="ts">
/**
 * 认证 / 开通页的外壳（主应用侧）。
 *
 * 这里**只剩一层转发**：真正的结构与槽位在 `@homeos/shared/components/EntryShell.vue`，
 * 商店的登录 / 初始化 / 后台登录三屏用的是同一个组件。保留本文件是为了让五个调用方
 * 零改动地继续 import `AuthShell`，同时把「主应用专属」的东西（如果有）留在一个地方。
 *
 * 历史：它曾经自己抄了一遍 `.hos-page / .hos-dock / .hos-panel / 边缘光 / 四角`，
 * 于是同一段结构在仓库里存在过九份，各自的类名与四角顺序都开始漂。详见 EntryShell 的注释。
 */
import EntryShell from '@homeos/shared/components/EntryShell.vue'
import type { EntryStep } from '@homeos/shared/components/entry-step'

defineProps<{
  /** 语气色：accent 用于账号流程，eco 用于授权/激活流程，alert 给异常路径（找回 / 需人工处理） */
  tone?: 'accent' | 'eco' | 'lumen' | 'alert'
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
}>()
</script>

<template>
  <EntryShell
    :tone="tone"
    :eyebrow="eyebrow"
    :title="title"
    :description="description"
    :secure="secure"
    :steps="steps"
    :steps-label="stepsLabel"
  >
    <!-- 场景背景由调用方以 slot 传入：src/shared 不允许反向 import app 层组件
         （eslint no-restricted-imports），把「背景是什么」留给页面自己声明。 -->
    <template #scene><slot name="scene" /></template>
    <template #head-extra><slot name="head-extra" /></template>
    <!-- 坞脚整块由页面决定有没有：不判断的话，没有 copy 的页面会多出一个空的
         `.hos-panel__copy`（它自带上边框与内距，光靠空内容也占位）。 -->
    <template v-if="$slots.copy" #copy><slot name="copy" /></template>

    <slot />
  </EntryShell>
</template>
