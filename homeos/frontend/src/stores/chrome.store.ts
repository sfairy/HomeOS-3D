/** - 维护一切「非业务数据」的 UI 表层状态：Toast 通知队列、确认/输入对话框、各类全局弹窗开关 */
import { defineStore } from 'pinia'
import { createUIChromeState } from '@/stores/ui/create-chrome-state'

/** useChromeStore：Pinia store 工厂，状态与动作见定义。 */
export const useChromeStore = defineStore('uiChrome', () => createUIChromeState())
