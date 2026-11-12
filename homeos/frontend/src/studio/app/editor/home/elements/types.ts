/**
 * 编辑器元素查询的类型契约。
 *
 * `findElement` 由 `lifecycle/boot.ts` 注入，包装的是 `document.querySelector` 一类的选择器
 * 查询（含少量 `querySelectorAll` 与派生映射）。元素的具体类型由各检视面板自己收窄，
 * 这里只声明「选择器 → 元素」这一层，避免在 5 个面板族文件 + 汇总入口里各写一遍同样的签名。
 */
export type ElementQuery = (selectorState: any) => any
