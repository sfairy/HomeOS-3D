/**
 * `studio/app/editor/home/components` 公开面。
 *
 * 这些模块此前被合并成 `components.ts`（925 行），
 * 但它们各自职责不同（见各文件头注释），混在一个文件里无法按职责定位。
 * 拆回独立文件后由本桶维持既有 import 说明符不变。
 */
export * from './component-deletion'
export * from './component-editing'
export * from './template-preview'
