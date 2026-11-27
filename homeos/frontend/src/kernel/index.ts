/**
 * `kernel/constants` 公开面。
 *
 * 这些模块此前被合并成 `constants.ts`（1362 行），
 * 但它们各自职责不同（见各文件头注释），混在一个文件里无法按职责定位。
 * 拆回独立文件后由本桶维持既有 import 说明符不变。
 */
export * from './agent-quick-prompts'
export * from './alert-rule-presets'
export * from './api-error-codes'
export * from './climate-labels'
export * from './device-group'
export * from './entity-domain-meta'
export * from './entity-state'
export * from './scene-values'
export * from './screensaver-defaults'
export * from './security'
export * from './voice'
export * from '@/kernel/whole-home-off'
