/**
 * 全局环境类型声明文件
 *
 * 职责：
 * 1. 引用 Vite 客户端类型（import.meta.env 等）
 * 2. 声明 .vue 单文件组件模块类型，使 TS 能正确识别 Vue 组件导入
 * 3. 扩展 Window 接口，暴露 HomeOS 专有的全局变量（Vue 运行时 API、语音识别等）
 * 4. 补充浏览器实验性 API 的类型声明（SpeechRecognition、Navigator 扩展、Performance.memory）
 *
 * 依赖：vue（DefineComponent 类型）、vite/client（环境变量类型）
 */

/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<object, object, unknown>
  export default component
}

interface Window {
  /** HomeOS 暴露的最小 Vue 运行时 API 集合，供 CustomHtmlWidget 动态编译使用 */
  __homeos_vue__?: Record<string, unknown>
  /** Web Speech API 语音识别构造器（标准属性） */
  SpeechRecognition?: new () => SpeechRecognition
  /** Web Speech API 语音识别构造器（WebKit 前缀，Safari/旧 Chrome 兼容） */
  webkitSpeechRecognition?: new () => SpeechRecognition
}

/**
 * Web Speech API 语音识别实例接口
 * 用于语音控制部件，将用户语音指令转为文本以触发设备操作
 */
interface SpeechRecognition extends EventTarget {
  /** 识别语言，BCP-47 格式（如 zh-CN） */
  lang: string
  /** 是否持续识别（true）或单次识别后停止（false） */
  continuous: boolean
  /** 是否返回中间识别结果 */
  interimResults: boolean
  /** 识别结果回调 */
  onresult: ((ev: SpeechRecognitionEvent) => void) | null
  /** 识别错误回调 */
  onerror: ((ev: Event) => void) | null
  /** 识别结束回调 */
  onend: (() => void) | null
  /** 开始语音识别 */
  start(): void
  /** 停止语音识别 */
  stop(): void
}

/** 语音识别结果列表，支持索引与 length 访问 */
interface SpeechRecognitionResultList {
  readonly length: number
  item(index: number): SpeechRecognitionResult
  [index: number]: SpeechRecognitionResult
}

/** 单次识别结果，可能包含多个候选项 */
interface SpeechRecognitionResult {
  readonly length: number
  /** 是否为最终结果（true 表示识别已稳定） */
  readonly isFinal: boolean
  item(index: number): SpeechRecognitionAlternative
  [index: number]: SpeechRecognitionAlternative
}

/** 识别候选项，包含转写文本与置信度 */
interface SpeechRecognitionAlternative {
  /** 转写后的文本 */
  readonly transcript: string
  /** 置信度，0-1 之间 */
  readonly confidence: number
}

/** 语音识别结果事件 */
interface SpeechRecognitionEvent extends Event {
  /** 本次识别的所有结果 */
  results: SpeechRecognitionResultList
}

/**
 * Navigator 接口扩展（浏览器实验性 API）
 * 用于设备性能探测与网络状况感知，驱动智能性能模式决策
 */
interface Navigator {
  /** 设备内存大小（GB），Chrome 实验性属性，用于性能分级 */
  deviceMemory?: number
  /** 网络连接信息（effectiveType/downtime/rtt/saveData），用于自适应降级 */
  connection?: { effectiveType?: string; downlink?: number; rtt?: number; saveData?: boolean }
  /** 电池状态 Promise，用于低电量时降低刷新率 */
  getBattery?: () => Promise<{ level: number; charging: boolean }>
}

/** Performance 接口扩展，暴露 JS 堆内存信息用于内存压力监测 */
interface Performance {
  memory?: { usedJSHeapSize: number; totalJSHeapSize: number; jsHeapSizeLimit: number }
}