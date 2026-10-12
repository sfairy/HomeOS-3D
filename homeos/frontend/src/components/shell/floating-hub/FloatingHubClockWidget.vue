<template>
  <!-- 时钟部件：展示当前时间，纯展示无交互 -->
  <div class="afh-content">
    <div class="flex items-center gap-2">
      <span class="afh-emoji">⏰</span>
      <span class="afh-value font-mono text-lg">{{ nowTime }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
/** 浮动控制中心 - 时钟部件 */
import { computed, inject, unref } from 'vue'
import { FloatingHubContextKey } from '@/shared/types/floating-hub'

// 注入父组件提供的上下文（非空断言：FloatingHub 父组件必定 provide）
const hub = inject(FloatingHubContextKey)!
// 当前时间字符串（HH:mm），透传父组件计算结果
const nowTime = computed(() => unref(hub.nowTime))
</script>