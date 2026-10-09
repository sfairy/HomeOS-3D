/// <reference types="vite/client" />

/** 让 `tsc` / `vue-tsc` 认识单文件组件导入（Vite 负责真实编译）。 */

declare module "*.vue" {
  import type { DefineComponent } from "vue";

  const component: DefineComponent<Record<string, unknown>, Record<string, unknown>, unknown>;
  export default component;
}
