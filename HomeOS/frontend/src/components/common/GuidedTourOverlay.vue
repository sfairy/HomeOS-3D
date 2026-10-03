<template>
  <Teleport to="body">
    <Transition name="tour-fade">
      <div
        v-if="visible && step"
        class="guided-tour hos-overlay-scrub"
        role="dialog"
        aria-modal="true"
        aria-labelledby="guided-tour-title"
        @click.self="skip"
      >
        <!-- 背景遮罩 -->
        <div class="guided-tour__backdrop" aria-hidden="true" />
        <!-- 引导卡片：定位到目标元素附近 -->
        <div class="guided-tour__card" :style="cardStyle">
          <p class="guided-tour__step">{{ stepIndex + 1 }} / {{ steps.length }}</p>
          <h3 id="guided-tour-title" class="guided-tour__title">{{ step.title }}</h3>
          <p class="guided-tour__desc">{{ step.desc }}</p>
          <div class="guided-tour__actions">
            <button type="button" class="guided-tour__skip" @click="skip">{{ '跳过引导' }}</button>
            <button type="button" class="guided-tour__next" @click="next">
              {{ stepIndex >= steps.length - 1 ? '完成' : '下一步' }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { readLocalStorage, writeLocalStorage } from '@/utils/core/local-storage.util'
/**
 * @file GuidedTourOverlay.vue
 * @module common/GuidedTourOverlay
 * @description 新手引导浮层
 *  职责：
 *    - 首次进入且未完成引导时（localStorage 标记），延迟展示分步引导卡片；
 *    - 卡片根据目标元素 selector 自动定位；
 *    - 支持「跳过引导」「下一步」「完成」操作，完成后写入 localStorage 不再展示。
 *  依赖：vue ref/computed/onMounted/onUnmounted，localStorage 持久化。
 *  注意：在 setup/login 路由下不展示，避免干扰初始配置流程。
 */
import { ref, computed, onMounted, onUnmounted } from 'vue'

/** localStorage 标记 key，记录是否已完成引导 */
const STORAGE_KEY = 'homeos_guided_tour_v1'
/** 是否展示引导浮层 */
const visible = ref(false)
/** 当前步骤索引 */
const stepIndex = ref(0)
/** 延迟展示定时器句柄 */
let showTimer = null

/**
 * 引导步骤定义
 * 每步包含 title/desc/selector，selector 用于定位目标元素以摆放卡片
 */
const steps = computed(() => [
  { title: '顶栏导航', desc: '在此切换总览、设备、场景等页面', selector: '.tab-bar__tabs' },
  {
    title: '户型图控制',
    desc: '长按热点打开控制面板；灯光热点可垂直滑动调光',
    selector: '.floorplan-wrapper',
  },
  {
    title: '浮动快捷面板',
    desc: 'FloatingHub 承载安防、分组控制等高频操作',
    selector: '.afh-root',
  },
  { title: '语音控制', desc: '长按说话或开启唤醒词后下达命令', selector: '.vc-root' },
  { title: '系统设置', desc: '在此配置 HA、布局、语音与成员权限', selector: '.tab-bar__actions' },
])

/** 当前步骤对象 */
const step = computed(() => steps.value[stepIndex.value])

/**
 * 卡片定位样式
 * 根据当前步骤的 selector 查询目标元素，将卡片摆放在目标下方；
 * 查询失败时居中显示；并通过窗口边界约束避免溢出。
 */
const cardStyle = computed(() => {
  const sel = step.value?.selector
  if (!sel) return {}
  const el = document.querySelector(sel)
  if (!el) return { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }
  const r = el.getBoundingClientRect()
  return {
    top: `${Math.min(window.innerHeight - 180, r.bottom + 16)}px`,
    left: `${Math.max(16, Math.min(window.innerWidth - 320, r.left))}px`,
  }
})

/**
 * 结束引导：隐藏浮层并写入 localStorage 标记，后续不再自动展示
 */
function finish() {
  visible.value = false
  writeLocalStorage(STORAGE_KEY, '1')
}

/**
 * 跳过引导：等同于直接结束
 */
function skip() {
  finish()
}

/**
 * 下一步：若已是最后一步则结束，否则推进到下一步
 */
function next() {
  if (stepIndex.value >= steps.value.length - 1) finish()
  else stepIndex.value += 1
}

onMounted(() => {
  // 已完成引导则不再展示
  if (readLocalStorage(STORAGE_KEY)) return
  // 在 setup/login 路由下不展示，避免干扰初始配置
  if (window.location.hash.includes('/setup') || window.location.hash.includes('/login')) return
  // 延迟 1200ms 展示，等待首屏渲染稳定
  showTimer = setTimeout(() => {
    visible.value = true
  }, 1200)
})

onUnmounted(() => {
  // 组件卸载时清理定时器，避免内存泄漏与重复触发
  if (showTimer) clearTimeout(showTimer)
})
</script>

<style scoped src="./styles/GuidedTourOverlay.css"></style>