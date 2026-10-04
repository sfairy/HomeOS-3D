/**
 * @file chrome.store.ts
 * @module frontend/src/stores
 * @brief UI Chrome Store（toast / 弹窗 / 编辑开关）。
 *
 * 职责：
 * - 维护一切「非业务数据」的 UI 表层状态：Toast 通知队列、确认/输入对话框、各类全局弹窗开关
 * - 维护编辑模式顶层开关与放置实体指针（与 layout.store 共享）
 * - 提供调试用天气覆盖与屏保预览入口（仅开发构建生效）
 *
 * 关键依赖：
 * - @/stores/ui/create-chrome-state：UI chrome 状态工厂（所有 ref 与开关函数均由其创建）
 *
 * 实现说明：
 * - 新代码直接 useChromeStore()。Pinia 保证单例；layout.store 通过 useChromeStore() 读取同一套状态
 * - 状态切片均拆分至 ui/ 子目录的工厂函数中，本文件仅作 Pinia setup 容器
 */
import { defineStore } from 'pinia'
import { createUIChromeState } from '@/stores/ui/create-chrome-state'

/** useChromeStore：Pinia store 工厂，状态与动作见定义。 */
export const useChromeStore = defineStore('uiChrome', () => createUIChromeState())
