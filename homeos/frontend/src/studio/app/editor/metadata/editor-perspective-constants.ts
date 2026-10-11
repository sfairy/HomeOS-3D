/**
 * 透视四角默认值 —— 从 home.ts 单体的 `const` 声明组里单独提出。
 *
 * 提出原因：它被导航 / 样式元数据表引用，而那些表正陆续切进
 * `editor-navigation-style-metadata.ts`；若它继续留在 home.ts 的声明组里，
 * 元数据模块就会与 home.ts 形成**循环 import**（顶层求值期读 TDZ 常量必炸）。
 * 提到这里后，home.ts 与元数据模块都单向依赖它。
 */
export const DEFAULT_PERSPECTIVE_CORNERS = Object.freeze([0, 0, 1, 0, 1, 1, 0, 1]);
