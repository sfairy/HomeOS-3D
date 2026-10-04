<!--
组件：FloorplanRendererBenchmark.vue
所属模块：frontend / src / views / settings / display
职责：户型图渲染基准对比组件。并排渲染 DOM 路径（HotspotNode）与 Canvas2D 路径
      （FloorplanHotspotCanvas），实时采样 FPS 与堆内存，5 秒自动采样后给出渲染路径建议，
      支持复制基准报告。
关键依赖：
  - HotspotNode / FloorplanHotspotCanvas：两条渲染路径
  - FLOORPLAN_DISPLAY_KEY：注入实体显示数据
  - copyTextWithNotify：复制报告到剪贴板
数据来源：本地生成模拟 widget 列表（基于 hotspotCount），并持久化到 localStorage
-->
<template>
  <div class="floorplan-benchmark">
    <div class="floorplan-benchmark__toolbar">
      <label class="floorplan-benchmark__field">
        <span class="floorplan-benchmark__field-label">{{ '热点数量' }}</span>
        <HosSelect
          variant="settings"
          trigger-class="floorplan-benchmark__select"
          v-model.number="hotspotCount"
        >
          <option :value="50">50</option>
          <option :value="100">100</option>
          <option :value="200">200</option>
        </HosSelect>
      </label>
      <div class="floorplan-benchmark__stats">
        <span
          >DOM 帧率 <strong>{{ domFps }}</strong> FPS</span
        >
        <span class="floorplan-benchmark__stats-sep" aria-hidden="true" />
        <span
          >Canvas 帧率 <strong>{{ canvasFps }}</strong> FPS</span
        >
        <template v-if="heapMb != null">
          <span class="floorplan-benchmark__stats-sep" aria-hidden="true" />
          <span
            >堆内存 <strong>{{ heapMb }} MB</strong></span
          >
        </template>
      </div>
      <div class="floorplan-benchmark__actions">
        <button
          type="button"
          class="floorplan-benchmark__btn"
          :disabled="autoRunning"
          @click="copyReport"
        >
          <Copy class="w-5 h-5" />
          {{ '复制报告' }}
        </button>
        <button
          type="button"
          :class="[
            'floorplan-benchmark__btn',
            'floorplan-benchmark__btn--primary',
            autoRunning && 'floorplan-benchmark__btn--active',
          ]"
          :disabled="autoRunning"
          @click="runAutoBenchmark"
        >
          <Activity :class="['w-5 h-5', autoRunning && 'animate-pulse']" />
          {{ autoRunning ? '采样中…' : '自动采样 5s' }}
        </button>
      </div>
    </div>
    <p v-if="recommendation" class="floorplan-benchmark__rec">{{ recommendation }}</p>
    <div class="floorplan-benchmark__grid">
      <div class="floorplan-benchmark__pane">
        <p class="floorplan-benchmark__label">{{ 'DOM 路径（生产同款）' }}</p>
        <div ref="domPaneRef" class="floorplan-benchmark__stage">
          <HotspotNode v-for="w in widgets" :key="'dom-' + w.id" :widget="w" />
        </div>
      </div>
      <div class="floorplan-benchmark__pane">
        <p class="floorplan-benchmark__label">{{ 'Canvas2D 路径（完整图标绘制）' }}</p>
        <div ref="canvasPaneRef" class="floorplan-benchmark__stage">
          <FloorplanHotspotCanvas
            :widgets="widgets"
            :visible-ids="visibleIds"
            aspect-ratio="16 / 9"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { readLocalStorage, writeLocalStorageJson } from '@/utils/core/local-storage.util'
/**
 * 职责：渲染 views/FloorplanRendererBenchmark 页面视图，整合子组件与业务数据。
 * 关键依赖：Vue Router、Pinia 全局状态、页面级子组件与 API services。
 * 约定：- 页面通过 onMounted 拉取数据，卸载时清理副作用；
  - 与子组件通信走 props/emit，不在视图层内直接写业务逻辑。
 */
import HosSelect from '@/components/common/base/HosSelect.vue'
import { ref, computed, shallowRef, provide, onMounted, onUnmounted, watch } from 'vue'
import { Activity, Copy } from '@lucide/vue'
import HotspotNode from '@/components/floorplan/HotspotNode.vue'
import FloorplanHotspotCanvas from '@/components/floorplan/HotspotCanvas.vue'
import { FLOORPLAN_DISPLAY_KEY } from '@/composables/floorplan/useFloorplanEntityBatch'
import { useChromeStore } from '@/stores/chrome.store'
import { copyTextWithNotify } from '@/services/notify'

const chrome = useChromeStore()
// 热点数量（50/100/200），决定模拟 widget 列表规模
const hotspotCount = ref(100)
// DOM 路径实时帧率
const domFps = ref('—')
// Canvas 路径实时帧率
const canvasFps = ref('—')
// 堆内存占用（MB），仅在 Chrome 系提供 performance.memory 时可用
const heapMb = ref(
  typeof performance?.memory?.usedJSHeapSize === 'number'
    ? Math.round(performance.memory.usedJSHeapSize / 1048576)
    : null,
)
const domPaneRef = ref(null)
const canvasPaneRef = ref(null)
const autoRunning = ref(false)
const recommendation = ref('')

// 基准报告持久化 key
const BENCH_STORAGE_KEY = 'homeos:floorplan-benchmark'

// 模拟 widget 列表：按 hotspotCount 在 16:9 画布内均匀分布 light 热点
const widgets = computed(() => {
  const list = []
  const cols = Math.ceil(Math.sqrt(hotspotCount.value))
  const rows = Math.ceil(hotspotCount.value / cols)
  for (let i = 0; i < hotspotCount.value; i++) {
    const col = i % cols
    const row = Math.floor(i / cols)
    list.push({
      id: `light.bench_${i}`,
      type: 'LightWidget',
      xPct: ((col + 0.5) / cols) * 100,
      yPct: ((row + 0.5) / rows) * 100,
      iconScale: 100,
    })
  }
  return list
})

const visibleIds = computed(() => new Set(widgets.value.map((w) => w.id)))

const displays = shallowRef(new Map())
function syncDisplays() {
  const next = new Map()
  widgets.value.forEach((w, i) => {
    next.set(w.id, {
      state: i % 2 === 0 ? 'on' : 'off',
      isOn: i % 3 === 0,
      stateText: i % 2 === 0 ? '开' : '关',
      label: w.id.split('.')[1],
    })
  })
  displays.value = next
}

provide(FLOORPLAN_DISPLAY_KEY, displays)
watch(widgets, syncDisplays, { immediate: true })

function createFpsMeter(elRef, setFps) {
  let rafId = 0
  let visible = false
  let io = null

  function start() {
    const el = elRef.value
    if (!el) return () => {}
    io = new IntersectionObserver(
      ([entry]) => {
        visible = entry.isIntersecting
      },
      { threshold: 0.1 },
    )
    io.observe(el)
    let last = performance.now()
    let frames = 0
    function tick(now) {
      if (visible) frames++
      if (now - last >= 1000) {
        if (visible) setFps(String(frames))
        frames = 0
        last = now
      }
      rafId = requestAnimationFrame(tick)
    }
    rafId = requestAnimationFrame(tick)
    return () => {
      if (rafId) cancelAnimationFrame(rafId)
      io?.disconnect()
    }
  }

  return start
}

let stopDom = () => {}
let stopCanvas = () => {}

// 挂载时启动两个 FPS 计量器，并读取上次基准报告
onMounted(() => {
  stopDom = createFpsMeter(domPaneRef, (v) => {
    domFps.value = v
  })()
  stopCanvas = createFpsMeter(canvasPaneRef, (v) => {
    canvasFps.value = v
  })()
  try {
    const saved = readLocalStorage(BENCH_STORAGE_KEY)
    if (saved) {
      const parsed = JSON.parse(saved)
      if (parsed.domFps) domFps.value = String(parsed.domFps)
      if (parsed.canvasFps) canvasFps.value = String(parsed.canvasFps)
      if (parsed.recommendation) recommendation.value = parsed.recommendation
    }
  } catch {
    /* 忽略 */
  }
})

onUnmounted(() => {
  stopDom()
  stopCanvas()
})

// 构建基准报告对象（含热点数、FPS、堆内存、建议、UA、时间戳）
function buildReport(rec = recommendation.value) {
  return {
    hotspotCount: hotspotCount.value,
    domFps: domFps.value,
    canvasFps: canvasFps.value,
    heapMb: heapMb.value,
    recommendation: rec,
    userAgent: navigator.userAgent,
    ts: new Date().toISOString(),
  }
}

// 自动 5 秒基准：采样后比较 DOM/Canvas FPS，给出渲染路径建议并持久化
async function runAutoBenchmark() {
  if (autoRunning.value) return
  autoRunning.value = true
  recommendation.value = ''
  chrome.notify('开始 5 秒 FPS 采样，请保持面板可见', 'info')
  await new Promise((r) => setTimeout(r, 5000))
  const dom = Number(domFps.value)
  const canvas = Number(canvasFps.value)
  let rec = '数据不足，请确保面板可见后重试'
  if (Number.isFinite(dom) && Number.isFinite(canvas) && dom > 0) {
    if (canvas >= dom * 1.05 && canvas >= 55) rec = '建议：可优先使用 Canvas（auto 阈值可下调）'
    else if (canvas >= dom) rec = 'Canvas2D 略优，可继续真机验证'
    else rec = 'DOM 路径更稳，保持 auto≥40 切换'
  }
  recommendation.value = rec
  try {
    writeLocalStorageJson(BENCH_STORAGE_KEY, buildReport(rec))
  } catch {
    /* 忽略 */
  }
  autoRunning.value = false
  chrome.notify(rec, rec.includes('建议') ? 'success' : 'info')
}

// 复制基准报告到剪贴板
async function copyReport() {
  await copyTextWithNotify(JSON.stringify(buildReport(), null, 2), {
    successMessage: '基准报告已成功复制',
    errorMessage: '复制失败，请检查浏览器剪贴板权限',
  })
}
</script>

<style scoped src="./styles/FloorplanRendererBenchmark.css"></style>
