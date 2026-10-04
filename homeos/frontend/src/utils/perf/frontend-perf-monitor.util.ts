/**
 * 前端运行时性能采样（Diagnostics 面板，经 fps-scheduler 单 rAF 驱动）
 */
import { ref } from 'vue'
import {
  registerDiagnosticsFpsTick,
  startDiagnosticsFpsSampling,
  stopDiagnosticsFpsSampling,
  unregisterDiagnosticsFpsTick,
} from '@/utils/perf/fps-scheduler.util'
import { recordFpsSample } from '@/utils/perf/baseline.util'

const fps = ref(0)
const memoryMb = ref<number | null>(null)
let frameCount = 0
let lastSampleTs = 0
let started = false

function sampleMemory() {
  const mem = performance.memory
  if (mem?.usedJSHeapSize) {
    memoryMb.value = Math.round(mem.usedJSHeapSize / 1024 / 1024)
  }
}

function onDiagnosticsTick(ts: number) {
  frameCount++
  if (!lastSampleTs) lastSampleTs = ts
  if (ts - lastSampleTs >= 1000) {
    fps.value = Math.round((frameCount * 1000) / (ts - lastSampleTs))
    recordFpsSample(fps.value)
    frameCount = 0
    lastSampleTs = ts
    sampleMemory()
  }
}

export function startFrontendPerfMonitor() {
  if (started) return
  started = true
  sampleMemory()
  registerDiagnosticsFpsTick(onDiagnosticsTick)
  startDiagnosticsFpsSampling()
}

export function stopFrontendPerfMonitor() {
  if (!started) return
  started = false
  stopDiagnosticsFpsSampling()
  unregisterDiagnosticsFpsTick()
  frameCount = 0
  lastSampleTs = 0
}

export { fps, memoryMb }
